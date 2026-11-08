// Server-only helpers for customer sign-in by SMS code.
import crypto from 'crypto'
import { db } from './webSession'
import { sendSMS, toInternational } from './sms'

const CODE_TTL_MIN   = 10
const RESEND_SECONDS = 60
const MAX_ATTEMPTS   = 5

const hashCode = (phone, code) =>
  crypto.createHash('sha256').update(`${phone}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest('hex')

export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'UGS-' + Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('')
}

export function generateUsername(name, phone) {
  const first = String(name || '').trim().split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') || 'ugs'
  return `${first}${phone.slice(-3)}`
}

// Send a 6-digit code by SMS. `key` separates purposes (sign-in vs password reset).
// Returns { ok } or { error }.
export async function sendCode({ key, phone, name = null, message }) {
  const { data: prev } = await db.from('web_login_codes').select('sent_at').eq('phone', key).maybeSingle()
  if (prev && Date.now() - new Date(prev.sent_at).getTime() < RESEND_SECONDS * 1000) {
    return { error: 'A code was just sent. Please wait a minute before asking for another.' }
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const { error } = await db.from('web_login_codes').upsert({
    phone: key, code_hash: hashCode(key, code), name,
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
    attempts: 0, sent_at: new Date().toISOString(),
  }, { onConflict: 'phone' })
  if (error) {
    console.error('[customer code]', error.message)
    return { error: 'Could not send a code right now. Please try again shortly.' }
  }
  const sms = await sendSMS({ to: toInternational(phone), message: message(code) })
  if (!sms.ok) return { error: 'Could not send the SMS. Please check the number and try again.' }
  return { ok: true }
}

// Check a code. Returns { ok, name } or { error }. A used code is deleted.
export async function checkCode(key, code) {
  const { data: row } = await db.from('web_login_codes').select('*').eq('phone', key).maybeSingle()
  if (!row || new Date(row.expires_at) < new Date()) return { error: 'That code has expired. Please ask for a new one.' }
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Too many wrong codes. Please ask for a new one.' }
  const want = Buffer.from(row.code_hash)
  const got  = Buffer.from(hashCode(key, String(code || '').trim()))
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    await db.from('web_login_codes').update({ attempts: row.attempts + 1 }).eq('phone', key)
    return { error: 'Wrong code. Please check the SMS and try again.' }
  }
  await db.from('web_login_codes').delete().eq('phone', key)
  return { ok: true, name: row.name }
}
