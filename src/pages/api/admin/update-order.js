// POST /api/admin/update-order
// Uses service role key to bypass RLS for admin status changes.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, status } = req.body ?? {}
  if (!orderId || !status) return res.status(400).json({ message: 'Missing orderId or status' })

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)

  if (error) {
    console.error('[admin/update-order]', error.message)
    return res.status(500).json({ message: error.message })
  }

  return res.status(200).json({ ok: true })
}
