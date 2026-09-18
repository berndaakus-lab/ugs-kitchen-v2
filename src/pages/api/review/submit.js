// POST /api/review/submit
// Validates the token, inserts the review, marks token used. One shot.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TOKEN_TTL_DAYS = 7

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { token, rating, comment } = req.body ?? {}
  if (!token)          return res.status(400).json({ message: 'Missing token' })
  if (!rating)         return res.status(400).json({ message: 'Rating is required' })

  // Re-validate token (don't trust the client)
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, customer_name, momo_number, delivered_at, review_token_used_at')
    .eq('review_token', token)
    .single()

  if (error || !order) return res.status(403).json({ message: 'Invalid review link.' })
  if (order.review_token_used_at) return res.status(403).json({ message: 'This review link has already been used.' })

  const deliveredAt = new Date(order.delivered_at ?? order.created_at)
  const expiresAt   = new Date(deliveredAt.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  if (Date.now() > expiresAt.getTime()) {
    return res.status(403).json({ message: 'This review link has expired.' })
  }

  // Insert review (unique on order_id prevents any race-condition double submit)
  const { error: insertErr } = await supabase
    .from('reviews')
    .insert({
      order_id:      order.id,
      customer_name: order.customer_name,
      momo_number:   order.momo_number,
      rating:        parseInt(rating),
      comment:       comment?.trim() || null,
      is_approved:   true,
    })

  if (insertErr) {
    if (insertErr.code === '23505') {
      return res.status(403).json({ message: 'A review for this order already exists.' })
    }
    console.error('[review/submit]', insertErr.message)
    return res.status(500).json({ message: 'Could not save review. Please try again.' })
  }

  // Mark token as used — one-way, no going back
  await supabase
    .from('orders')
    .update({ review_token_used_at: new Date().toISOString() })
    .eq('review_token', token)

  return res.status(200).json({ ok: true })
}
