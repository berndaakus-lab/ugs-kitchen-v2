import { db } from '@/lib/supabaseAdmin'
import { withAuth, can } from '@/lib/session'
import { shiftReport, dutyReport } from '@/lib/reports'

// GET — cash shift: Z-report (closed) or X-report (open); duty shift: what was done.
// Your own shift always; people with Reports see shifts at their branch, or
// anywhere if they work across branches.
export default withAuth(async (req, res) => {
  const { data: shift } = await db.from('pos_shifts').select('*').eq('id', req.query.id).maybeSingle()

  const u = req.user
  const allowed = shift && (
    shift.staff_id === u.sid ||
    (can(u, 'reports') && (u.scopeAll || shift.branch_id === u.branch_id))
  )
  if (!allowed) return res.status(404).json({ message: 'Shift not found.' })

  if (shift.kind === 'duty') return res.status(200).json({ report: await dutyReport(shift), kind: 'duty' })
  return res.status(200).json({ report: await shiftReport(shift), kind: 'cash' })
}, {})
