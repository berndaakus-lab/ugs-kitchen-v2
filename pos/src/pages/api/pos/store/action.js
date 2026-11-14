import { rpc } from '@/lib/supabaseAdmin'
import { withAuth, can, shiftMissing } from '@/lib/session'
import { storeFor } from '@/lib/store'
import { sendPendingAlerts } from '@/lib/alerts'

// POST { location?, action, … } — everything done at the warehouse or a kitchen.
//   send     { to, lines: [{stock_item_id, qty}], note? }        Send food / ingredients
//   receive  { dispatch_id, lines: [{line_id, qty_received}] }    Confirm a delivery
//   produce  { recipe_id, batches, note? }                         Record food made
//   count    { lines: [{stock_item_id, counted}], note? }          Count what's there
//   adjust   { stock_item_id, qty, kind: waste|manual, note }      Waste / correction
//   purchase { supplier_id?, lines: [{stock_item_id, qty, unit_cost}], note? }  (warehouse)
const RULES = {
  send:     { perm: 'stock_send',    shift: true },
  receive:  { perm: 'stock_receive', shift: true },
  produce:  { perm: 'production',    shift: true },
  count:    { perm: 'stock_count',   shift: true },
  adjust:   { perm: 'stock_adjust',  shift: false },
  purchase: { perm: 'purchases',     shift: true },
}

export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const b = req.body || {}
  const rule = RULES[b.action]
  if (!rule) return res.status(400).json({ message: 'Unknown action.' })
  if (!can(req.user, rule.perm)) return res.status(403).json({ message: 'Not allowed for your role.' })
  if (rule.shift && await shiftMissing(req.user)) return res.status(409).json({ message: 'Start your shift first (My shift).', code: 'NO_SHIFT' })
  const { loc, error } = await storeFor(req)
  if (error) return res.status(400).json({ message: error })
  const sid = req.user.sid
  const note = String(b.note || '').trim() || null
  let result

  if (b.action === 'send') {
    result = { id: await rpc('inv_send', { p_from: loc.id, p_to: b.to, p_lines: b.lines || [], p_staff: sid, p_note: note }) }
  } else if (b.action === 'receive') {
    result = { status: await rpc('inv_receive_at', { p_dispatch: b.dispatch_id, p_location: loc.id, p_lines: b.lines || [], p_staff: sid }) }
  } else if (b.action === 'produce') {
    const batches = Number(b.batches)
    if (!(batches > 0)) return res.status(400).json({ message: 'Enter how many batches were made.' })
    result = { id: await rpc('inv_record_production', { p_location: loc.id, p_recipe: b.recipe_id, p_batches: batches, p_staff: sid, p_note: note }) }
  } else if (b.action === 'count') {
    const lines = (b.lines || []).filter(l => l.counted !== '' && l.counted != null)
    if (!lines.length) return res.status(400).json({ message: 'Enter at least one count.' })
    result = { id: await rpc('inv_apply_count_at', { p_location: loc.id, p_lines: lines, p_staff: sid, p_note: note }) }
  } else if (b.action === 'adjust') {
    const qty = Number(b.qty)
    if (!qty) return res.status(400).json({ message: 'Enter a quantity.' })
    if (!note) return res.status(400).json({ message: 'Give a reason.' })
    await rpc('inv_adjust_at', { p_location: loc.id, p_item: b.stock_item_id, p_qty: qty, p_kind: b.kind === 'manual' ? 'manual' : 'waste', p_staff: sid, p_note: note })
    result = { ok: true }
  } else if (b.action === 'purchase') {
    result = { id: await rpc('inv_record_purchase', { p_location: loc.id, p_supplier: b.supplier_id || null, p_lines: b.lines || [], p_staff: sid, p_note: note }) }
  }

  await sendPendingAlerts()
  return res.status(200).json(result)
}, { perms: ['stock_send', 'stock_receive', 'stock_count', 'stock_adjust', 'production', 'purchases'], store: true })
