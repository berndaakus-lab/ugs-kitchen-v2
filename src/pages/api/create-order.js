// POST /api/create-order
// { branch_id, items: [{ id, quantity }], customer_name, location, gps_link, momo_number, notes }
//
// Creates a website order on the server. Prices, names and prep times come
// from the menu in the database, never from the browser, so the amount
// charged is always the real total. Returns the order and a token that lets
// the same browser pay for it and see it.
import { db, readCustomer, orderToken, cleanPhone } from '../../lib/webSession'
import { isOpen, openHoursToday } from '../../lib/businessHours'

const clip = (v, n) => String(v ?? '').trim().slice(0, n)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  const name     = clip(b.customer_name, 80)
  const location = clip(b.location, 200)
  const gps      = /^https:\/\/maps\.google\.com\/\?q=-?[\d.]+,-?[\d.]+$/.test(b.gps_link || '') ? b.gps_link : null
  const phone    = cleanPhone(b.momo_number)
  const notes    = clip(b.notes, 500) || null
  const wanted   = (Array.isArray(b.items) ? b.items : [])
    .map(i => ({ id: String(i?.id || ''), quantity: Math.floor(Number(i?.quantity)) }))
    .filter(i => i.id && i.quantity > 0 && i.quantity <= 100)

  if (!name)               return res.status(400).json({ message: 'Please enter your name.' })
  if (!location)           return res.status(400).json({ message: 'Please select a delivery location.' })
  if (phone.length !== 10) return res.status(400).json({ message: 'Enter a valid 10-digit MoMo number.' })
  if (!wanted.length)      return res.status(400).json({ message: 'Your cart is empty.' })
  if (!b.branch_id)        return res.status(400).json({ message: 'Please choose a branch.' })

  const { data: branch } = await db.from('branches').select('id, is_active, business_hours').eq('id', b.branch_id).maybeSingle()
  if (!branch || branch.is_active === false) return res.status(400).json({ message: 'This branch is not taking orders.' })
  if (!isOpen(branch.business_hours)) {
    const hours = openHoursToday(branch.business_hours)
    return res.status(403).json({ message: `Sorry, we're closed right now${hours ? ` (today's hours: ${hours})` : ''}. Please order during working hours.` })
  }

  const { data: menu, error: menuErr } = await db.from('menu_items')
    .select('id, branch_id, category_id, name, description, price, image, is_available, is_popular, sort_order, wait_time_minutes')
    .eq('branch_id', branch.id)
    .in('id', [...new Set(wanted.map(i => i.id))])
  if (menuErr) return res.status(500).json({ message: 'Could not check the menu. Please try again.' })
  const byId = Object.fromEntries((menu || []).map(m => [m.id, m]))

  const items = []
  for (const w of wanted) {
    const m = byId[w.id]
    if (!m) return res.status(409).json({ message: 'An item in your cart is no longer on the menu — please remove it and try again.' })
    if (!m.is_available) return res.status(409).json({ message: `${m.name} is not available right now — please remove it from your cart.` })
    const same = items.find(i => i.id === m.id)
    if (same) same.quantity += w.quantity
    else items.push({ ...m, quantity: w.quantity })
  }
  const total = Math.round(items.reduce((s, i) => s + Number(i.price) * i.quantity, 0) * 100) / 100
  if (!(total > 0)) return res.status(400).json({ message: 'Your cart is empty.' })

  // SMS updates go to the signed-in account's phone (it may differ from the MoMo number).
  let contactPhone = phone
  const session = await readCustomer(req)
  if (session) {
    const { data: c } = await db.from('customers').select('phone').eq('id', session.id).maybeSingle()
    if (c?.phone) contactPhone = c.phone
  }

  const { data: order, error } = await db.from('orders').insert({
    customer_name:     name,
    delivery_location: gps ? `${location}\n${gps}` : location,
    momo_number:       phone,
    contact_phone:     contactPhone,
    items,
    total_amount:      total,
    status:            'pending',
    branch_id:         branch.id,
    notes,
    wait_time_minutes: Math.max(...items.map(i => i.wait_time_minutes ?? 30)),
  }).select('*').single()
  if (error) {
    console.error('[create-order]', error.message)
    return res.status(500).json({ message: 'Could not place your order. Please try again.' })
  }

  return res.status(200).json({ order, token: orderToken(order.id) })
}
