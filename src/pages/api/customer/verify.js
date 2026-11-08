// POST /api/customer/verify { phone, code } → signs in (or creates the account
// asked for in /api/customer/code) once the SMS code is right.
import { db, cleanPhone, validPhone, setCustomerSession, publicCustomer, CUSTOMER_FIELDS } from '../../../lib/webSession'
import { checkCode, generateUsername } from '../../../lib/customerAuth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const phone = cleanPhone(req.body?.phone)
  if (!validPhone(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit Ghana phone number.' })

  const r = await checkCode('signin:' + phone, req.body?.code)
  if (r.error) return res.status(401).json({ message: r.error })

  let { data: customer } = await db.from('customers').select(CUSTOMER_FIELDS).eq('phone', phone).maybeSingle()
  if (!customer) {
    if (!r.name) return res.status(404).json({ message: 'No account found for this number.' })
    for (let attempt = 0; attempt < 3 && !customer; attempt++) {
      const base = generateUsername(r.name, phone)
      const username = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 90) + 10}`
      const { data, error } = await db.from('customers').insert({ name: r.name, phone, username }).select(CUSTOMER_FIELDS).single()
      if (!error) customer = data
      else if (!/unique|duplicate/i.test(error.message)) break
    }
    if (!customer) return res.status(500).json({ message: 'Could not create your account. Please try again.' })
  }

  await setCustomerSession(res, customer)
  return res.status(200).json({ customer: publicCustomer(customer) })
}
