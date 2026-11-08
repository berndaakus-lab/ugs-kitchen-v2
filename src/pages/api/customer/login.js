// POST /api/customer/login { username, password }
import crypto from 'crypto'
import { db, setCustomerSession, publicCustomer, CUSTOMER_FIELDS } from '../../../lib/webSession'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!username) return res.status(400).json({ message: 'Enter your username.' })
  if (!password) return res.status(400).json({ message: 'Enter your password.' })

  let id = null
  const { data, error } = await db.rpc('web_customer_login', { p_username: username, p_password: password })
  if (!error) id = data
  else {
    // Before migrations/web_001_lockdown.sql runs, passwords are still plain text.
    const { data: c } = await db.from('customers').select('id, password').eq('username', username).maybeSingle()
    const a = Buffer.from(String(c?.password ?? '')), b = Buffer.from(password)
    if (c?.password && a.length === b.length && crypto.timingSafeEqual(a, b)) id = c.id
  }

  if (!id) {
    await new Promise(r => setTimeout(r, 600))
    return res.status(401).json({ message: 'Incorrect username or password.' })
  }
  const { data: customer } = await db.from('customers').select(CUSTOMER_FIELDS).eq('id', id).single()
  await setCustomerSession(res, customer)
  return res.status(200).json({ customer: publicCustomer(customer) })
}
