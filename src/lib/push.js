// Server-side helper for sending Web Push notifications via VAPID

const webpush = require('web-push')
const { createClient } = require('@supabase/supabase-js')

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@ugskitchen.com'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function sendPushToSub(sub, payload) {
  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — clean it up
      await supabaseAdmin()
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint)
        .catch(() => {})
    }
  }
}

// Send push to all admin devices
async function pushAdmins(payload) {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('role', 'admin')
  if (!data?.length) return
  await Promise.all(data.map(sub => sendPushToSub(sub, payload)))
}

// Send push to customer device(s) for a specific order
async function pushCustomer(orderId, payload) {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('role', 'customer')
    .eq('order_id', orderId)
  if (!data?.length) return
  await Promise.all(data.map(sub => sendPushToSub(sub, payload)))
}

module.exports = { pushAdmins, pushCustomer }
