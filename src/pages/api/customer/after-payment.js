// POST /api/customer/after-payment { orderId, token }
// After a paid order, signs the payer in to the account for their MoMo number
// (creating it, with a username and temporary password, if it's new).
// Only works for a paid order and the browser that placed it (order token):
// approving the MoMo prompt proves they own that number.
import { db, checkOrderToken, setCustomerSession, publicCustomer, CUSTOMER_FIELDS, validPhone } from '../../../lib/webSession'
import { generatePassword, generateUsername } from '../../../lib/customerAuth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { orderId, token } = req.body || {}
  if (!checkOrderToken(orderId, token)) return res.status(403).json({ message: 'Not allowed.' })

  const { data: order } = await db.from('orders').select('id, status, customer_name, momo_number').eq('id', orderId).maybeSingle()
  if (!order || !['paid', 'preparing', 'ready', 'delivered'].includes(order.status)) return res.status(409).json({ message: 'Order not paid.' })
  const phone = order.momo_number
  if (!validPhone(phone)) return res.status(200).json({ customer: null })

  let { data: customer } = await db.from('customers').select(CUSTOMER_FIELDS).eq('phone', phone).maybeSingle()
  let created = null
  if (!customer) {
    const tempPassword = generatePassword()
    for (let attempt = 0; attempt < 3 && !customer; attempt++) {
      const base = generateUsername(order.customer_name, phone)
      const username = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 90) + 10}`
      const { data, error } = await db.from('customers')
        .insert({ name: order.customer_name, phone, username, password: tempPassword })
        .select(CUSTOMER_FIELDS).single()
      if (!error) { customer = data; created = { username, tempPassword } }
      else if (!/unique|duplicate/i.test(error.message)) break
    }
    if (!customer) return res.status(200).json({ customer: null })
  }

  await setCustomerSession(res, customer)
  return res.status(200).json({
    customer: publicCustomer(customer),
    isNew: !!created,
    username: created?.username,
    tempPassword: created?.tempPassword,
  })
}
