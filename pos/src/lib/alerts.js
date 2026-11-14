// Server-only: low-stock alerts (Module 3).
// The database raises one inv_alerts row when a balance drops below its level
// (inv_move in pos_010). Here they are sent by SMS: right after stock actions
// and sales, and once a day with a summary of everything that is low.
import { db } from './supabaseAdmin'
import { sendSMS, toInternational } from './sms'

const ownerPhones = () => (process.env.ALERT_PHONES || process.env.OWNER_PHONES || '')
  .split(',').map(p => p.trim()).filter(Boolean)

const fmt = n => Number(Number(n).toFixed(2))

async function sendTo(phones, message) {
  const unique = [...new Set(phones.map(p => toInternational(p)).filter(Boolean))]
  await Promise.all(unique.map(to => sendSMS({ to, message }).catch(() => null)))
  return unique.length
}

// Send every alert not sent yet. Each place's alert phones + the owner.
// Never throws: a failed SMS must not break a sale or a delivery.
export async function sendPendingAlerts() {
  try {
    const { data: rows, error } = await db.from('inv_alerts')
      .select('id, location_id, level, on_hand, inv_locations(name, alert_phones), inv_stock_items(name, unit)')
      .is('sent_at', null).is('cleared_at', null).limit(100)
    if (error || !rows?.length) return 0
    // Claim them first so two requests don't both text.
    const ids = rows.map(r => r.id)
    const { data: claimed } = await db.from('inv_alerts').update({ sent_at: new Date().toISOString() })
      .in('id', ids).is('sent_at', null).select('id')
    const mine = new Set((claimed || []).map(r => r.id))
    const byLoc = {}
    for (const r of rows.filter(r => mine.has(r.id))) (byLoc[r.location_id] ||= []).push(r)
    let sent = 0
    for (const list of Object.values(byLoc)) {
      const loc = list[0].inv_locations
      const lines = list.map(r => `${r.inv_stock_items?.name}: ${fmt(r.on_hand)} ${r.inv_stock_items?.unit || ''} (level ${fmt(r.level)})`)
      const message = `UGs Kitchen low stock at ${loc?.name}:\n${lines.join('\n')}`.slice(0, 450)
      sent += await sendTo([...(loc?.alert_phones || []), ...ownerPhones()], message)
    }
    return sent
  } catch (err) {
    console.error('[alerts]', err?.message || err)
    return 0
  }
}

// Everything below its level right now, grouped by place.
export async function lowStockNow() {
  const [{ data: balances }, { data: items }, { data: levels }, { data: locations }] = await Promise.all([
    db.from('inv_balances').select('location_id, stock_item_id, on_hand'),
    db.from('inv_stock_items').select('id, name, unit, low_level').eq('is_active', true),
    db.from('inv_levels').select('location_id, stock_item_id, reorder_level'),
    db.from('inv_locations').select('id, name, kind, is_active, alert_phones, sort').eq('is_active', true).order('sort').order('name'),
  ])
  const item = Object.fromEntries((items || []).map(i => [i.id, i]))
  const lvl = Object.fromEntries((levels || []).map(l => [`${l.location_id}:${l.stock_item_id}`, Number(l.reorder_level)]))
  const byLoc = Object.fromEntries((locations || []).map(l => [l.id, { ...l, low: [] }]))
  for (const b of balances || []) {
    const i = item[b.stock_item_id]
    const place = byLoc[b.location_id]
    if (!i || !place) continue
    const level = lvl[`${b.location_id}:${b.stock_item_id}`] ?? Number(i.low_level)
    if (Number(b.on_hand) <= level) place.low.push({ name: i.name, unit: i.unit, on_hand: Number(b.on_hand), level })
  }
  return Object.values(byLoc).filter(l => l.low.length)
}

// The evening summary: the owner gets every place; each place's phones get theirs.
export async function sendDailySummary() {
  const places = await lowStockNow()
  if (!places.length) return { places: 0, sent: 0 }
  let sent = 0
  const line = i => `${i.name} ${fmt(i.on_hand)}/${fmt(i.level)} ${i.unit}`
  const all = places.map(p => `${p.name}: ${p.low.map(line).join(', ')}`).join('\n')
  sent += await sendTo(ownerPhones(), `UGs Kitchen low stock today:\n${all}`.slice(0, 600))
  for (const p of places) {
    if (p.alert_phones?.length) sent += await sendTo(p.alert_phones, `UGs Kitchen low stock at ${p.name}: ${p.low.map(line).join(', ')}`.slice(0, 450))
  }
  return { places: places.length, sent }
}
