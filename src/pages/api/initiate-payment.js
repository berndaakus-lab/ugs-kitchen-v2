import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { toPaystackAmount, detectNetwork } from '../../api/paystack'
import { markPaymentFailed } from '../../lib/paymentStatus'
import { isOpen, openHoursToday } from '../../lib/businessHours'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// A network error or a Paystack server error: we don't know whether the charge
// was created, so it must not be treated as a refusal.
const isUncertain = err => !err.response || err.response.status >= 500

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { orderId, phone, amount, customerName } = req.body

  if (!orderId || !phone || !amount || !customerName) {
    return res.status(400).json({ message: 'Missing required fields.' })
  }

  const cleanPhone = phone.replace(/\s/g, '')
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ message: 'Invalid phone number.' })
  }

  // Working hours are enforced here too, not just by greying out the menu:
  // a cart filled before closing time can't be paid for after it.
  const { data: orderRow } = await supabase.from('orders').select('branch_id').eq('id', orderId).maybeSingle()
  if (orderRow?.branch_id) {
    const { data: branch } = await supabase.from('branches').select('business_hours').eq('id', orderRow.branch_id).maybeSingle()
    if (branch && !isOpen(branch.business_hours)) {
      const hours = openHoursToday(branch.business_hours)
      const msg = `Sorry, we're closed right now${hours ? ` (today's hours: ${hours})` : ''}. Please order during working hours.`
      await markPaymentFailed(supabase, orderId, 'Shop closed (outside working hours)')
      return res.status(403).json({ message: msg })
    }
  }

  const network    = detectNetwork(cleanPhone)
  const pesewas    = toPaystackAmount(amount)
  const reference  = `UGS-${orderId}-${Date.now()}`
  const email      = `${cleanPhone}@ugskitchen.com` // Paystack requires email

  // Save the reference first, so the webhook and the status checks can find
  // this order even if the reply from Paystack below is lost.
  await supabase
    .from('orders')
    .update({ paystack_reference: reference, status: 'awaiting_payment' })
    .eq('id', orderId)

  const charge = () => axios.post(
    'https://api.paystack.co/charge',
    {
      amount:   pesewas,
      email,
      currency: 'GHS',
      mobile_money: {
        phone:   cleanPhone,
        provider: network,
      },
      reference,
      metadata: {
        order_id:      orderId,
        customer_name: customerName,
        custom_fields: [
          { display_name: 'Customer Name', variable_name: 'customer_name', value: customerName },
          { display_name: 'Order ID',      variable_name: 'order_id',      value: String(orderId) },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    }
  )

  let paystackRes
  try {
    try {
      paystackRes = await charge()
    } catch (err) {
      if (!isUncertain(err)) throw err
      // One retry with the SAME reference: Paystack can't charge twice for it.
      paystackRes = await charge()
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Payment initiation failed.'

    // The first attempt did reach Paystack: the charge exists, so just wait for it.
    if (/duplicate/i.test(msg)) {
      return res.status(200).json({ success: true, reference, requiresOtp: false, message: 'Payment prompt sent to your phone.' })
    }

    // Still can't reach Paystack: the charge may or may not exist. Keep the
    // order open and let the page check it, rather than failing it outright.
    if (isUncertain(err)) {
      console.error('[initiate-payment] uncertain:', msg)
      return res.status(200).json({ success: true, reference, requiresOtp: false, uncertain: true, message: 'Checking with the payment service…' })
    }

    // Paystack refused the charge: this is a real failure. Keep the reason.
    console.error('[initiate-payment]', msg)
    await markPaymentFailed(supabase, orderId, msg)

    return res.status(400).json({ message: msg })
  }

  const data = paystackRes.data
  if (!data.status) {
    const msg = data.message || 'Paystack charge initiation failed.'
    await markPaymentFailed(supabase, orderId, msg)
    return res.status(400).json({ message: msg })
  }

  const chargeStatus = data.data?.status
  const requiresOtp  = chargeStatus === 'send_otp'

  return res.status(200).json({
    success:     true,
    reference,
    requiresOtp,
    message:     data.data?.display_text || 'Payment prompt sent to your phone.',
  })
}
