// ── WhatsApp notification helpers ─────────────────────────────
// Used by both OrderDrawer (owner alert) and Admin (customer alerts)

// Convert local Ghana number to international format for wa.me
// e.g. 0244123456 → 233244123456
export function toInternational(phone) {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('233')) return digits
  if (digits.startsWith('0'))   return `233${digits.slice(1)}`
  return `233${digits}`
}

// ── OWNER alert (new order placed) ───────────────────────────
export function buildOwnerMessage(order) {
  const orderNum  = `#${String(order.id).slice(-6).toUpperCase()}`
  const itemLines = order.items
    ?.map(i => `  • ${i.quantity}× ${i.name} — GH₵${(i.price * i.quantity).toFixed(2)}`)
    .join('\n') ?? ''

  return encodeURIComponent(
    `🔔 *NEW ORDER ${orderNum}*\n\n` +
    `👤 *Customer:* ${order.customer_name}\n` +
    `📍 *Location:* ${order.delivery_location}\n` +
    `📱 *MoMo:* ${order.momo_number}\n\n` +
    `🍽️ *Items:*\n${itemLines}\n\n` +
    `💰 *Total Paid: GH₵${Number(order.total_amount).toFixed(2)}*\n\n` +
    `✅ Payment confirmed. Please prepare order!`
  )
}

// ── CUSTOMER alerts (status updates from admin) ───────────────
const CUSTOMER_MESSAGES = {
  preparing: order =>
    `Hi ${order.customer_name}! 👋\n\n` +
    `✅ *Order Confirmed!*\n` +
    `Your order *#${String(order.id).slice(-6).toUpperCase()}* has been received and our kitchen is preparing it now.\n\n` +
    `🕐 Estimated time: *20–35 mins*\n\n` +
    `Thank you for choosing *UGs Kitchen!* 🍽️`,

  ready: order =>
    `Hi ${order.customer_name}! 👋\n\n` +
    `📦 *Your Order is Ready!*\n` +
    `Order *#${String(order.id).slice(-6).toUpperCase()}* is packed and ready.\n\n` +
    `${order.delivery_location === 'Pick-Up (No Delivery)'
      ? '🏪 Please come in to collect your order.\n\n⭐ Enjoyed your meal? Leave us a quick review:\n👉 ' + (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ugskitchen.com') + '/review'
      : `🛵 Our delivery rider is on the way to *${order.delivery_location}*!`
    }\n\n` +
    `UGs Kitchen 🍽️`,

  delivered: order =>
    `Hi ${order.customer_name}! 👋\n\n` +
    `🎉 *Order Delivered!*\n` +
    `Your order *#${String(order.id).slice(-6).toUpperCase()}* has been delivered.\n\n` +
    `We hope you enjoy your meal! 😋\n\n` +
    `⭐ *How was your experience?*\n` +
    `We'd love to hear from you — it only takes 30 seconds:\n` +
    `👉 ${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://ugskitchen.com')}/review\n\n` +
    `See you next time — *UGs Kitchen* 🍽️`,

  cancelled: order =>
    `Hi ${order.customer_name},\n\n` +
    `❌ *Order Update — #${String(order.id).slice(-6).toUpperCase()}*\n\n` +
    `We're sorry, but we were unable to fulfil your order at this time.\n\n` +
    `If you were charged, your MoMo refund will reflect within *24–48 hours*.\n\n` +
    `Please call us or place a new order. We apologise for the inconvenience.\n\n` +
    `— *UGs Kitchen*`,
}

export function notifyCustomer(order, status) {
  const builder = CUSTOMER_MESSAGES[status]
  if (!builder) return

  const phone = toInternational(order.momo_number)
  const text  = encodeURIComponent(builder(order))
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
}

export function notifyOwner(order, branch = null) {
  // Use branch-specific WhatsApp if available, fall back to env var
  const owner = (branch?.whatsapp ? toInternational(branch.whatsapp) : null)
    ?? process.env.NEXT_PUBLIC_OWNER_WHATSAPP
  if (!owner) return
  const text = buildOwnerMessage(order)
  window.open(`https://wa.me/${owner}?text=${text}`, '_blank', 'noopener,noreferrer')
}
