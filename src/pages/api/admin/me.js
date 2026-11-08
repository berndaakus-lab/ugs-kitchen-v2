// GET  /api/admin/me     → the signed-in staff member, or 401
// POST /api/admin/me     → sign out
import { clearStaffSession, withStaff } from '../../../lib/webSession'

const me = withStaff(async (req, res) => res.status(200).json({ user: req.user }))

export default async function handler(req, res) {
  if (req.method === 'POST') {
    clearStaffSession(res)
    return res.status(200).json({ ok: true })
  }
  return me(req, res)
}
