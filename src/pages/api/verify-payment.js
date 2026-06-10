import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const { reference, orderId } = req.query
  if (!reference || !orderId) return res.status(400).json({ message: 'Missing reference or orderId' })

  try {
    const { data: paystackRes } = await axios.get(
      `https://api.paystack.co/charge/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )

    const status = paystackRes?.data?.status // 'success' | 'failed' | 'pending' | 'pay_offline'

    if (status === 'success') {
      await supabase
        .from('orders')
        .update({
          status:          'paid',
          paid_at:         new Date().toISOString(),
          payment_channel: paystackRes.data.channel,
        })
        .eq('id', orderId)

      return res.status(200).json({ status: 'paid' })
    }

    if (status === 'failed') {
      await supabase
        .from('orders')
        .update({ status: 'failed' })
        .eq('id', orderId)

      return res.status(200).json({ status: 'failed' })
    }

    // still pending / pay_offline / charge_attempted — keep waiting
    return res.status(200).json({ status: 'pending', paystackStatus: status })
  } catch (err) {
    console.error('[verify-payment]', err.message)
    return res.status(500).json({ message: 'Verification failed' })
  }
}
