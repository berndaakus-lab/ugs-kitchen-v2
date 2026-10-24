import { openShiftFor } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

export default withAuth(async (req, res) => {
  const shift = await openShiftFor(req.user.sid)
  return res.status(200).json({ user: req.user, shift })
})
