import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, smsPhone, msgOrderConfirmed, msgOwnerNewOrder } from '../../lib/sms'

// Disable Next.js body parsing — we need raw body for HMAC verification
export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end',  ()    => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function verifySignature(rawBody, signature) {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')
  return hash === signature
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  const rawBody  = await getRawBody(req)
  const signature = req.headers['x-paystack-signature']

  if (!verifySignature(rawBody, signature)) {
    console.warn('[webhook] Invalid Paystack signature')
    return res.status(401).send('Unauthorized')
  }

  let event
  try {
    event = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).send('Invalid JSON')
  }

  const { event: eventType, data } = event

  if (eventType === 'charge.success') {
    const reference = data.reference
    const orderId   = data.metadata?.order_id

    if (!orderId) {
      console.error('[webhook] charge.success missing order_id in metadata')
      return res.status(200).send('OK') // Acknowledge to avoid Paystack retries
    }

    const { error } = await supabase
      .from('orders')
      .update({
        status:              'paid',
        paystack_reference:  reference,
        paid_at:             new Date().toISOString(),
        payment_channel:     data.channel,
      })
      .eq('id', orderId)

    if (error) {
      console.error('[webhook] Supabase update failed:', error.message)
      return res.status(500).send('DB Error')
    }

    console.log(`[webhook] Order ${orderId} marked as PAID (ref: ${reference})`)

    // Fetch full order to build SMS messages
    const { data: order } = await supabase
      .from('orders')
      .select('*, branches(name, phone, sms_recipients)')
      .eq('id', orderId)
      .single()

    if (order) {
      const ownerMsg = msgOwnerNewOrder(order, order.branches)

      // Build the full list of staff/owner phones to notify:
      // 1. Global OWNER_PHONES env var (comma-separated) — CEO / global owner
      // 2. Branch-level sms_recipients (JSON array on the branch row)
      // 3. Branch main phone as fallback
      const globalPhones = (process.env.OWNER_PHONES || process.env.OWNER_PHONE || '')
        .split(',').map(p => p.trim()).filter(Boolean)
      const branchRecipients = Array.isArray(order.branches?.sms_recipients)
        ? order.branches.sms_recipients
        : []
      const branchPhone = order.branches?.phone ? [order.branches.phone] : []
      const allStaffPhones = [...new Set([...globalPhones, ...branchRecipients, ...branchPhone])]

      // Send new-order alert to every staff/owner number
      for (const phone of allStaffPhones) {
        sendSMS({ to: phone, message: ownerMsg }).catch(() => {})
      }

      // SMS to customer (confirmation)
      sendSMS({ to: smsPhone(order), message: msgOrderConfirmed(order) })
    }
  }

  if (eventType === 'charge.failed' || eventType === 'transfer.failed') {
    const orderId = data.metadata?.order_id
    if (orderId) {
      await supabase
        .from('orders')
        .update({ status: 'failed' })
        .eq('id', orderId)
    }
  }

  return res.status(200).send('OK')
}
