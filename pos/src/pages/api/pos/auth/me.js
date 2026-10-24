import { db, openShiftFor } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

export default withAuth(async (req, res) => {
  const shift = await openShiftFor(req.user.sid)

  // An admin can switch branch while a shift is open elsewhere; tell the
  // screens which branch the open shift belongs to.
  if (shift && shift.branch_id !== req.user.branch_id) {
    const { data: b } = await db.from('branches').select('name').eq('id', shift.branch_id).maybeSingle()
    shift.branch_name = b?.name || 'another branch'
    shift.elsewhere = true
  }
  return res.status(200).json({ user: req.user, shift })
})
