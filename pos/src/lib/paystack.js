// Server-only Paystack helpers (copied from the online app's src/api/paystack.js
// and initiate-payment.js so the two apps stay independent).
import axios from 'axios'

const api = () => axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
})

export function detectNetwork(phone) {
  const prefix = phone.replace(/\s/g, '').slice(0, 3)
  if (['024', '054', '055', '059', '025'].includes(prefix)) return 'mtn'
  if (['020', '050'].includes(prefix)) return 'vod'
  if (['027', '057', '026', '056', '023', '028'].includes(prefix)) return 'tgo'
  return 'mtn'
}

// Paystack's codes for Ghana mobile money networks (GET /bank?currency=GHS&type=mobile_money)
const NETWORK_CODES = { mtn: 'MTN', vod: 'VOD', tgo: 'ATL' }

// "KWAME  MENSAH" → "Kwame Mensah"
export const titleCase = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase())

// The name registered on a MoMo wallet, via Paystack's Resolve Account Number.
// Returns null if Paystack can't or won't resolve it (never throws).
export async function resolveMomoName(phone) {
  try {
    const { data } = await api().get('/bank/resolve', {
      params: { account_number: phone, bank_code: NETWORK_CODES[detectNetwork(phone)] },
      timeout: 5000,
    })
    return data?.data?.account_name ? titleCase(data.data.account_name) : null
  } catch (err) {
    console.warn('[paystack] name lookup unavailable:', err.response?.data?.message || err.message)
    return null
  }
}

// Some MoMo charges carry the payer's wallet name; use it when we have no name yet.
export function nameFromCharge(charge) {
  const n = charge?.authorization?.account_name ||
    [charge?.customer?.first_name, charge?.customer?.last_name].filter(Boolean).join(' ')
  return n ? titleCase(n) : null
}

export function toPesewas(ghs) {
  return Math.round(parseFloat(ghs) * 100)
}

// NOTE: metadata must NOT contain `order_id` — the online app's webhook treats
// that as an online order. POS charges carry `pos_sale_id` instead.
export async function chargeMomo({ phone, amount, reference, saleId, ticketNo }) {
  const { data } = await api().post('/charge', {
    amount:   toPesewas(amount),
    email:    `${phone}@ugskitchen.com`,
    currency: 'GHS',
    mobile_money: { phone, provider: detectNetwork(phone) },
    reference,
    metadata: { source: 'pos', pos_sale_id: saleId, ticket_no: ticketNo },
  })
  if (!data.status) throw new Error(data.message || 'Paystack charge failed.')
  return data.data
}

export async function submitOtp({ reference, otp }) {
  const { data } = await api().post('/charge/submit_otp', { otp, reference })
  return data.data
}

export async function checkCharge(reference) {
  const { data } = await api().get(`/charge/${reference}`)
  return data.data // { status: 'success' | 'failed' | 'pending' | 'send_otp' | ..., amount, channel }
}

export function paystackError(err) {
  return err.response?.data?.message || err.message || 'Payment request failed.'
}
