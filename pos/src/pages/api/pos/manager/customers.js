import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { normalizePhone } from '@/lib/phone'

const COUNTED = ['paid', 'partially_served', 'served']

// GET  ?q=<name or phone>&opted=1  → walk-in customers with visits and spend (max 500)
// POST { id, opt_in: false }       → record that a customer asked to stop promo messages
export default withAuth(async (req, res) => {
  if (req.method === 'POST') {
    const { id, opt_in } = req.body || {}
    if (opt_in !== false) return res.status(400).json({ message: 'Only opting out is done here; customers opt in at the till.' })
    const { error } = await db
      .from('pos_customers')
      .update({ marketing_opt_in: false, opt_out_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await db.from('pos_audit_log').insert({ actor_id: req.user.sid, action: 'customer_opt_out', meta: { customer_id: id } })
    return res.status(200).json({ ok: true })
  }

  let q = db
    .from('pos_customers')
    .select('id, phone, name, marketing_opt_in, opt_in_at, first_seen_at, last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(500)

  const term = String(req.query.q || '').trim()
  if (term) {
    const phone = normalizePhone(term)
    q = phone ? q.eq('phone', phone) : q.or(`name.ilike.%${term.replace(/[%,()]/g, '')}%,phone.ilike.%${term.replace(/\D/g, '') || '_'}%`)
  }
  if (req.query.opted === '1') q = q.eq('marketing_opt_in', true)

  const { data: customers, error } = await q
  if (error) throw error

  const stats = {}
  if (customers.length) {
    const { data: sales, error: e2 } = await db
      .from('pos_sales')
      .select('customer_id, total')
      .in('customer_id', customers.map(c => c.id))
      .in('status', COUNTED)
    if (e2) throw e2
    for (const s of sales) {
      const st = stats[s.customer_id] ||= { visits: 0, spent: 0 }
      st.visits += 1
      st.spent = Math.round((st.spent + Number(s.total)) * 100) / 100
    }
  }

  return res.status(200).json({
    customers: customers.map(c => ({ ...c, visits: stats[c.id]?.visits || 0, spent: stats[c.id]?.spent || 0 })),
  })
}, { roles: ['manager'] })
