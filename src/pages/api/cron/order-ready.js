// GET /api/cron/order-ready
// Called by Vercel Cron every minute (see vercel.json).
//
// Finds paid/preparing orders where the admin-set prep time has elapsed,
// sends a smart SMS (pickup vs delivery) and marks the order as ready.
// reminded_at guards against double-sends even if cron overlaps.

import { createClient } from '@supabase/supabase-js'
import { sendSMS, smsPhone } from '../../../lib/sms'

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
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  // Fetch all in-progress orders that haven't been reminded yet
  // We filter by elapsed time in JS since wait_time_minutes varies per order
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_name, momo_number, contact_phone, delivery_location, total_amount, items, paid_at, created_at, wait_time_minutes')
    .in('status', ['paid', 'preparing'])
    .is('reminded_at', null)
    .not('paid_at', 'is', null)
    .limit(50)

  if (error) {
    console.error('[cron/order-ready] DB query failed:', error.message)
    return res.status(500).json({ message: error.message })
  }

  if (!orders || orders.length === 0) {
    return res.status(200).json({ sent: 0, checked: 0 })
  }

  const now = Date.now()
  const due = orders.filter(order => {
    const waitMs  = (order.wait_time_minutes ?? 30) * 60 * 1000
    const paidAt  = new Date(order.paid_at).getTime()
    return now >= paidAt + waitMs
  })

  let sent = 0
  for (const order of due) {
    // Optimistic lock — set reminded_at first to prevent double-send on overlap
    const { error: lockErr } = await supabase
      .from('orders')
      .update({
        reminded_at: new Date().toISOString(),
        status:      'ready',
      })
      .eq('id', order.id)
      .is('reminded_at', null)

    if (lockErr) {
      console.warn(`[cron/order-ready] Could not lock order ${order.id}:`, lockErr.message)
      continue
    }

    const phone = smsPhone(order)
    if (!phone) continue

    const result = await sendSMS({ to: phone, message: msgAutoReady(order) })
    if (result.ok) sent++

    console.log(`[cron/order-ready] Order ${order.id} → ready, SMS ${result.ok ? 'sent' : 'failed'}`)
  }

  return res.status(200).json({ sent, due: due.length, checked: orders.length })
}
