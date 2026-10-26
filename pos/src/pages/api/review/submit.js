// Public (no login): POST { token, rating, comment } — save a walk-in review.
// It lands in the shared `reviews` table, so it shows in the online admin and site.
import { rpc } from '@/lib/supabaseAdmin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MESSAGES = {
  invalid: 'Invalid review link.',
  used:    'This review link has already been used.',
  expired: 'This review link has expired.',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { token, rating, comment } = req.body || {}
  if (!UUID.test(String(token || ''))) return res.status(403).json({ message: MESSAGES.invalid })
  const stars = parseInt(rating, 10)
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ message: 'Please choose a star rating.' })

  try {
    const result = await rpc('pos_submit_review', {
      p_token: token, p_rating: stars, p_comment: String(comment || '').slice(0, 1000),
    })
    if (result !== 'ok') return res.status(403).json({ message: MESSAGES[result] || MESSAGES.invalid })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[pos review]', err.message)
    return res.status(500).json({ message: 'Could not save review. Please try again.' })
  }
}
