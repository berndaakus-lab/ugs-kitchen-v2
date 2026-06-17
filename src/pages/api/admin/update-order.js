// POST /api/admin/update-order
// Uses service role key to bypass RLS for admin status changes.
// Also sends the customer an SMS when status changes.

import { createClient } from '@supabase/supabase-js'
import { sendSMS, toInternational, STATUS_SMS } from '../../../lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, status } = req.body ?? {}
  if (!orderId || !status) return res.status(400).json({ message: 'Missing orderId or status' })

  // Fetch the full order so we can build the SMS
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) return res.status(404).json({ message: 'Order not found' })

  // Update the status
  const updates = { status }
  // Mark reminded_at when admin manually sets ready (prevents double auto-ready SMS)
  if (status === 'ready' && !order.reminded_at) {
    updates.reminded_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)

  if (error) {
    console.error('[admin/update-order]', error.message)
    return res.status(500).json({ message: error.message })
  }

  // Send customer SMS if there's a template for this status
  const msgBuilder = STATUS_SMS[status]
  if (msgBuilder) {
    // Look up customer's preferred contact phone (may differ from MoMo used to pay)
    const { data: customer } = await supabase
      .from('customers')
      .select('phone, contact_phone')
      .eq('phone', order.momo_number)
      .maybeSingle()

    const rawPhone = customer?.contact_phone || customer?.phone || order.contact_phone || order.momo_number
    if (rawPhone) {
      const message = msgBuilder(order)
      await sendSMS({ to: toInternational(rawPhone), message })
        .catch(err => console.error('[admin/update-order] SMS failed:', err.message))
    }
  }

  return res.status(200).json({ ok: true })
}
