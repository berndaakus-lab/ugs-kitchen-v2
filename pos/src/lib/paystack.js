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
