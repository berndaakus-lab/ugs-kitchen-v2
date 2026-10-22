import { clearSession } from '@/lib/session'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  clearSession(res)
  return res.status(200).json({ ok: true })
}
