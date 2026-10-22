import { db } from '@/lib/supabaseAdmin'
import { withAuth, isElevated } from '@/lib/session'
import { shiftReport } from '@/lib/reports'

// GET — Z-report (closed shift) or X-report (open shift). Own shift, or any at the branch for managers.
export default withAuth(async (req, res) => {
  const { data: shift } = await db.from('pos_shifts').select('*').eq('id', req.query.id).maybeSingle()

  const allowed = shift && shift.branch_id === req.user.branch_id &&
    (shift.staff_id === req.user.sid || isElevated(req.user.role))
  if (!allowed) return res.status(404).json({ message: 'Shift not found.' })

  return res.status(200).json({ report: await shiftReport(shift) })
}, { roles: ['cashier'] })
