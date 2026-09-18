// POST /api/admin/update-order
// Uses service role key to bypass RLS for admin status changes.
// Also sends the customer an SMS when status changes.

import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
import { sendSMS, toInternational, STATUS_SMS, msgOrderDeliveredWithToken } from '../../../lib/sms'
import { pushCustomer } from '../../../lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, status, wait_time_minutes, delivered_by, delivered_by_id } = req.body ?? {}
  if (!orderId || (!status && wait_time_minutes == null)) {
    return res.status(400).json({ message: 'Missing orderId or update fields' })
  }

  // For wait_time_minutes-only updates we don't need SMS, skip the fetch
  if (wait_time_minutes != null && !status) {
    const mins = parseInt(wait_time_minutes)
    if (!mins || mins < 1) return res.status(400).json({ message: 'Invalid wait_time_minutes' })
    const { error } = await supabase.from('orders').update({ wait_time_minutes: mins }).eq('id', orderId)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(200).json({ ok: true })
  }

  // Fetch the full order so we can build the SMS
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) return res.status(404).json({ message: 'Order not found' })

  // Update the status
  const updates = { status }
  if (wait_time_minutes != null) updates.wait_time_minutes = parseInt(wait_time_minutes)
  if (status === 'ready' && !order.reminded_at) {
    updates.reminded_at = new Date().toISOString()
  }
  if (status === 'delivered') {
    updates.delivered_at    = new Date().toISOString()
    if (delivered_by)    updates.delivered_by    = delivered_by
    if (delivered_by_id) updates.delivered_by_id = delivered_by_id
    // Generate a one-time review token so the SMS link is unique and expiring
    updates.review_token = randomUUID()
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
      // For delivered status, pass the fresh review_token so it appears in the SMS link
      const orderForSms = status === 'delivered' && updates.review_token
        ? { ...order, review_token: updates.review_token }
        : order
      const message = msgBuilder(orderForSms)
      await sendSMS({ to: toInternational(rawPhone), message })
        .catch(err => console.error('[admin/update-order] SMS failed:', err.message))
    }
  }

  // Push notification to customer on key status changes
  const PUSH_MESSAGES = {
    preparing: { title: '👨‍🍳 We\'re cooking!',  body: 'Your order is being prepared now.' },
    ready:     { title: '🎉 Order Ready!',        body: 'Your food is ready for pickup/delivery!' },
    delivered: { title: '✅ Delivered!',           body: 'Your order has been delivered. Enjoy!' },
    cancelled: { title: '❌ Order Cancelled',      body: 'Your order has been cancelled. Contact us if you have questions.' },
    failed:    { title: '❌ Order Failed',         body: 'There was a problem with your order. Please contact us.' },
  }
  const pushMsg = PUSH_MESSAGES[status]
  if (pushMsg) {
    pushCustomer(orderId, { ...pushMsg, url: '/', tag: `status-${orderId}-${status}` })
      .catch(() => {})
  }

  return res.status(200).json({ ok: true })
}
