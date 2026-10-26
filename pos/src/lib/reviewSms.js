// Server-only: text the walk-in customer a review link as soon as they've paid.
import { rpc, loadSale } from './supabaseAdmin'
import { sendSMS } from './sms'

const ghs = n => `GH₵ ${Number(n).toFixed(2)}`

function baseUrl(req) {
  if (process.env.POS_PUBLIC_URL) return process.env.POS_PUBLIC_URL.replace(/\/$/, '')
  return `https://${req.headers['x-forwarded-host'] || req.headers.host}`
}

// Safe to call more than once per sale: the database lets only the first call
// through (pos_claim_review_sms), so the customer never gets two texts.
// Never throws — a failed SMS must not affect the sale.
export async function sendReviewSms(req, saleId) {
  try {
    const token = await rpc('pos_claim_review_sms', { p_sale: saleId })
    if (!token) return
    const sale = await loadSale(saleId)
    if (!sale.customer?.phone) return

    const first = sale.customer.name ? ` ${sale.customer.name.split(' ')[0]}` : ''
    const message =
      `Hi${first}! Thanks for choosing UGs Kitchen. Ticket ${sale.ticket_no}, ${ghs(sale.total)} paid.\n` +
      `How was your meal? Rate us (link valid 24 hours): ${baseUrl(req)}/review?token=${token}`

    const result = await sendSMS({ to: sale.customer.phone, message })
    if (!result.ok) console.error('[pos] review SMS not sent', saleId, result.reason || result.status)
  } catch (err) {
    console.error('[pos] review SMS failed', saleId, err.message)
  }
}
