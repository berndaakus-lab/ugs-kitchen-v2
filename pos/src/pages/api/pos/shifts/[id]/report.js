import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { shiftReport } from '@/lib/reports'

// GET — Z-report (closed shift) or X-report (open shift).
// Your own shift always (even after an admin switches branch); a manager sees
// any shift at their branch; the admin sees any shift.
export default withAuth(async (req, res) => {
  const { data: shift } = await db.from('pos_shifts').select('*').eq('id', req.query.id).maybeSingle()

  const { role, sid, branch_id } = req.user
  const allowed = shift && (
    shift.staff_id === sid ||
    role === 'admin' ||
    (role === 'manager' && shift.branch_id === branch_id)
  )
  if (!allowed) return res.status(404).json({ message: 'Shift not found.' })

  return res.status(200).json({ report: await shiftReport(shift) })
}, { roles: ['cashier'] })
