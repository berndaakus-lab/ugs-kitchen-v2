// POST /api/forgot-password
// Looks up customer by phone, generates a new password, saves it, and SMSes it.

import { createClient } from '@supabase/supabase-js'
import { sendSMS, toInternational } from '../../lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'UGS-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { phone } = req.body ?? {}
  if (!phone) return res.status(400).json({ message: 'Missing phone number.' })

  const clean = phone.replace(/\s/g, '')

  // Look up customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, username, phone')
    .eq('phone', clean)
    .maybeSingle()

  if (!customer) {
    // Don't reveal whether the number exists — just return success
    return res.status(200).json({ ok: true })
  }

  const newPassword = generatePassword()

  await supabase
    .from('customers')
    .update({ password: newPassword })
    .eq('id', customer.id)

  const message =
    `Hi ${customer.name}! Your UGs Kitchen password has been reset.\n` +
    `Username: ${customer.username ?? customer.phone}\n` +
    `New password: ${newPassword}\n` +
    `Sign in at ugskitchen.com and change your password from your profile.`

  await sendSMS({ to: toInternational(clean), message })

  return res.status(200).json({ ok: true })
}
