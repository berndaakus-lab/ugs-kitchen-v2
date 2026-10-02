import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, smsPhone, msgOrderConfirmed, msgOwnerNewOrder } from '../../lib/sms'
import { pushAdmins, pushCustomer } from '../../lib/push'

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
        .select('*')
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

        // Fetch branch separately to avoid FK join issues
        let branch = null
        if (existing.branch_id) {
          const { data: b } = await supabase
            .from('branches')
            .select('name, phone, sms_recipients')
            .eq('id', existing.branch_id)
            .single()
          branch = b
        }

        // Send staff SMS to all recipients (global + branch-level)
        const globalPhones = (process.env.OWNER_PHONES || process.env.OWNER_PHONE || '')
          .split(',').map(p => p.trim()).filter(Boolean)
        const branchRecipients = Array.isArray(branch?.sms_recipients)
          ? branch.sms_recipients.filter(p => typeof p === 'string' && p.trim())
          : []
        const branchPhone = branch?.phone ? [branch.phone] : []
        const allStaffPhones = [...new Set([...globalPhones, ...branchRecipients, ...branchPhone])]
        for (const phone of allStaffPhones) {
          sendSMS({ to: phone, message: msgOwnerNewOrder(existing, branch) }).catch(() => {})
        }
        sendSMS({ to: smsPhone(existing), message: msgOrderConfirmed(existing) })

        const orderRef = `#${String(orderId).slice(-6).toUpperCase()}`
        pushAdmins({
          title: '🛍️ New Order!',
          body:  `${existing.customer_name} placed order ${orderRef} — GH₵ ${Number(existing.total_amount).toFixed(2)}`,
          url:   '/admin',
          tag:   `new-order-${orderId}`,
        }).catch(() => {})
        pushCustomer(orderId, {
          title: '✅ Order Confirmed!',
          body:  `Your order ${orderRef} is confirmed. We're cooking now!`,
          url:   '/',
          tag:   `order-confirmed-${orderId}`,
        }).catch(() => {})
      }

      return res.status(200).json({ status: 'paid' })
    }

    if (status === 'failed') {
      await supabase
        .from('orders')
        .update({ status: 'failed' })
        .eq('id', orderId)

      const gatewayResponse = paystackRes?.data?.gateway_response ?? ''
      return res.status(200).json({ status: 'failed', reason: gatewayResponse })
    }

    // still pending / pay_offline / charge_attempted — keep waiting
    return res.status(200).json({ status: 'pending', paystackStatus: status })
  } catch (err) {
    console.error('[verify-payment]', err.message)
    return res.status(500).json({ message: 'Verification failed' })
  }
}
