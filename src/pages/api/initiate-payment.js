import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { toPaystackAmount, detectNetwork } from '../../api/paystack'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

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

  const network    = detectNetwork(cleanPhone)
  const pesewas    = toPaystackAmount(amount)
  const reference  = `UGS-${orderId}-${Date.now()}`
  const email      = `${cleanPhone}@ugskitchen.com` // Paystack requires email

  try {
    const paystackRes = await axios.post(
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
      }
    )

    const data = paystackRes.data
    if (!data.status) {
      throw new Error(data.message || 'Paystack charge initiation failed.')
    }

    // Update order with Paystack reference
    await supabase
      .from('orders')
      .update({ paystack_reference: reference, status: 'awaiting_payment' })
      .eq('id', orderId)

    return res.status(200).json({
      success:   true,
      reference,
      message:   data.data?.display_text || 'Payment prompt sent to your phone.',
    })
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Payment initiation failed.'
    console.error('[initiate-payment]', msg)

    await supabase
      .from('orders')
      .update({ status: 'failed' })
      .eq('id', orderId)

    return res.status(500).json({ message: msg })
  }
}
