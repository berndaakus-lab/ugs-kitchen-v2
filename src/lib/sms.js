// ─── Nkomo SMS Gateway — UGs Kitchen ────────────────────────
// Docs: https://nkomosms.com
// API key is kept server-side in NKOMO_API_KEY
// Sender ID set via NKOMO_SENDER_ID (e.g. "UGsKitchen") — max 11 chars, alphanumeric

// Convert Ghana local format (0244...) to international (233244...)
export function toInternational(phone) {
  const clean = String(phone).replace(/\D/g, '')
  if (clean.startsWith('233')) return clean
  if (clean.startsWith('0'))   return '233' + clean.slice(1)
  return clean
}

// ── Server-side: call Nkomo API directly (use in API routes only) ──
export async function sendSMS({ to, message }) {
  const apiKey    = process.env.NKOMO_API_KEY
  const senderId  = process.env.NKOMO_SENDER_ID || 'UGsKitchen'
  const recipient = toInternational(to)

  if (!apiKey) {
    console.warn('[sms] NKOMO_API_KEY not set — skipping SMS')
    return { ok: false, reason: 'no_api_key' }
  }

  try {
    const res = await fetch('https://api.nkomosms.com/api/v3/sms/send', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':       apiKey,
      },
      body: JSON.stringify({
        sender:     senderId,
        message,
        recipients: [recipient],
      }),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('[sms] Nkomo error:', res.status, json)
      return { ok: false, status: res.status, body: json }
    }

    console.log(`[sms] Sent to ${recipient}`)
    return { ok: true, body: json }
  } catch (err) {
    console.error('[sms] Network error:', err.message)
    return { ok: false, reason: err.message }
  }
}

// ── Client-side: POST to our own /api/send-sms endpoint ──────
// Use this in React components / admin page (keeps API key server-side)
export async function sendSMSClient({ to, message }) {
  try {
    const res = await fetch('/api/send-sms', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to, message }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Message templates ────────────────────────────────────────

export function msgOrderConfirmed(order) {
  const items = (order.items ?? [])
    .map(i => `${i.quantity}x ${i.name}`)
    .join(', ')
  return (
    `Hi ${order.customer_name}! ✅ Your order at UGs Kitchen has been confirmed.\n` +
    `Items: ${items}\n` +
    `Total: GH₵${Number(order.total_amount).toFixed(2)}\n` +
    `Delivery: ${order.delivery_location}\n` +
    `Your food will be ready in about 30 mins. We will SMS you when it is ready!`
  )
}

export function msgOwnerNewOrder(order, branch) {
  const items = (order.items ?? [])
    .map(i => `${i.quantity}x ${i.name}`)
    .join(', ')
  const branchLabel = branch?.name ? `[${branch.name}] ` : ''
  const notes = order.notes ? `\nNotes: ${order.notes}` : ''
  return (
    `🔔 ${branchLabel}NEW ORDER #${String(order.id).slice(-6).toUpperCase()}\n` +
    `Customer: ${order.customer_name} (${order.momo_number})\n` +
    `Items: ${items}\n` +
    `Total: GH₵${Number(order.total_amount).toFixed(2)}\n` +
    `Location: ${order.delivery_location}` +
    notes
  )
}

export function msgOrderPreparing(order) {
  return (
    `Hi ${order.customer_name}! 👨‍🍳 Your UGs Kitchen order is being prepared now.\n` +
    `Order #${String(order.id).slice(-6).toUpperCase()} — GH₵${Number(order.total_amount).toFixed(2)}\n` +
    `We will let you know when it is ready!`
  )
}

export function msgOrderReady(order) {
  return (
    `Hi ${order.customer_name}! 🎉 Your UGs Kitchen order is READY!\n` +
    `Order #${String(order.id).slice(-6).toUpperCase()}\n` +
    (order.delivery_location?.toLowerCase().includes('pick')
      ? `Please come pick up your food. See you soon! 😊`
      : `Your food is on its way to ${order.delivery_location}. Thank you!`)
  )
}

export function msgOrderDelivered(order) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  return (
    `Hi ${order.customer_name}! ✅ Your UGs Kitchen order has been delivered. Enjoy your meal!\n` +
    `We would love to hear from you — leave a review: ${appUrl}/review\n` +
    `Thank you for choosing UGs Kitchen! 🍽️`
  )
}

export function msgOrderCancelled(order) {
  return (
    `Hi ${order.customer_name}, your UGs Kitchen order #${String(order.id).slice(-6).toUpperCase()} ` +
    `has been cancelled. Please contact us if you have questions.`
  )
}

export function msgReadyReminder(order) {
  return (
    `Hi ${order.customer_name}! ⏰ Your UGs Kitchen order should be ready very soon.\n` +
    `Order #${String(order.id).slice(-6).toUpperCase()} — ${order.delivery_location}\n` +
    `We will send you another SMS once it is confirmed ready. Thank you for your patience!`
  )
}

// Map admin status → message builder
export const STATUS_SMS = {
  preparing: msgOrderPreparing,
  ready:     msgOrderReady,
  delivered: msgOrderDelivered,
  cancelled: msgOrderCancelled,
}
