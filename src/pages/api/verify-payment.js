import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, smsPhone, msgOrderConfirmed, msgOwnerNewOrder } from '../../lib/sms'

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
      // Only update if not already paid (avoid duplicate SMS if webhook fires too)
      const { data: existing } = await supabase
        .from('orders')
        .select('status, momo_number, contact_phone, customer_name, delivery_location, total_amount, items, branches(name, phone)')
        .eq('id', orderId)
        .single()

      if (existing && existing.status !== 'paid') {
        await supabase
          .from('orders')
          .update({
            status:          'paid',
            paid_at:         new Date().toISOString(),
            payment_channel: paystackRes.data.channel,
          })
          .eq('id', orderId)

        // Send SMS notifications (only fires once — guarded by status check above)
        const ownerPhone = existing.branches?.phone || process.env.OWNER_PHONE
        if (ownerPhone) {
          sendSMS({ to: ownerPhone, message: msgOwnerNewOrder(existing, existing.branches) })
        }
        sendSMS({ to: smsPhone(existing), message: msgOrderConfirmed(existing) })
      }

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
