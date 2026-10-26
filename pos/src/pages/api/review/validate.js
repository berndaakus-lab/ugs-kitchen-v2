// Public (no login): GET ?token= — is this walk-in review link usable?
import { db } from '@/lib/supabaseAdmin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const token = String(req.query.token || '')
  if (!UUID.test(token)) return res.status(200).json({ valid: false, reason: 'invalid' })

  const { data: sale } = await db
    .from('pos_sales')
    .select('created_at, status, review_token_used_at, pos_customers(name)')
    .eq('review_token', token)
    .maybeSingle()

  if (!sale || sale.status === 'voided') return res.status(200).json({ valid: false, reason: 'invalid' })
  if (sale.review_token_used_at) return res.status(200).json({ valid: false, reason: 'already_used' })
  if (Date.now() - new Date(sale.created_at).getTime() > 24 * 60 * 60 * 1000) {
    return res.status(200).json({ valid: false, reason: 'expired' })
  }
  return res.status(200).json({ valid: true, customerName: sale.pos_customers?.name?.split(' ')[0] || '' })
}
