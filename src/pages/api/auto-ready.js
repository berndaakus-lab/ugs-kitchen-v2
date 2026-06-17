// POST /api/auto-ready
// Called client-side when a prep-time countdown reaches zero.
// Marks the order as ready and sends the appropriate SMS.
// reminded_at acts as an idempotency guard — safe to call multiple times.

import { createClient } from '@supabase/supabase-js'
import { sendSMS, smsPhone } from '../../lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function isPickup(location) {
  return /pick.?up/i.test(location ?? '')
}

function msgAutoReady(order) {
  const name    = order.customer_name
  const orderId = `#${String(order.id).slice(-6).toUpperCase()}`

  if (isPickup(order.delivery_location)) {
    return (
      `Hi ${name}! 🎉 Your UGs Kitchen order ${orderId} is ready for pickup!\n` +
      `Please come collect your food. Thank you for choosing UGs Kitchen! 🍽️`
    )
  }

  return (
    `Hi ${name}! 🛵 Your UGs Kitchen order ${orderId} is ready and on its way to ${order.delivery_location}!\n` +
    `Please be available to receive your delivery. Enjoy your meal! 🍽️`
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId } = req.body ?? {}
  if (!orderId) return res.status(400).json({ message: 'Missing orderId' })

  // Fetch the order
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) return res.status(404).json({ message: 'Order not found' })

  // Already handled — skip silently
  if (order.reminded_at || !['paid', 'preparing'].includes(order.status)) {
    return res.status(200).json({ skipped: true })
  }

  // Double-check that prep time has actually elapsed
  const waitMs = (order.wait_time_minutes ?? 30) * 60 * 1000
  const paidAt = new Date(order.paid_at ?? order.created_at).getTime()
  if (Date.now() < paidAt + waitMs) {
    return res.status(200).json({ skipped: true, reason: 'not_elapsed_yet' })
  }

  // Lock with reminded_at to prevent race conditions
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'ready', reminded_at: new Date().toISOString() })
    .eq('id', order.id)
    .is('reminded_at', null)

  if (updateErr) return res.status(500).json({ message: updateErr.message })

  const phone = smsPhone(order)
  let smsSent = false
  if (phone) {
    const result = await sendSMS({ to: phone, message: msgAutoReady(order) })
    smsSent = result.ok
  }

  console.log(`[auto-ready] Order ${orderId} → ready, SMS ${smsSent ? 'sent' : 'failed'}`)
  return res.status(200).json({ ok: true, smsSent })
}
