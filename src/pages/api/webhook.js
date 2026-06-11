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
      .select('*, branches(name, phone)')
      .eq('id', orderId)
      .single()

    if (order) {
      const ownerPhone = order.branches?.phone || process.env.OWNER_PHONE
      // SMS to owner (new confirmed order alert)
      if (ownerPhone) {
        sendSMS({ to: ownerPhone, message: msgOwnerNewOrder(order, order.branches) })
      }
      // SMS to customer (confirmation + 30-min heads-up)
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
