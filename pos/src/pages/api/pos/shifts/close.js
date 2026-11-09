import { db, openShiftFor } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { shiftReport, dutyReport } from '@/lib/reports'

// POST { counted_cash?, notes? } — closes the caller's open shift.
// Cash shift → Z-report (counted_cash required). Duty shift → what they did.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const shift = await openShiftFor(req.user.sid)
  if (!shift) return res.status(409).json({ message: 'You have no open shift.' })
  const notes = String(req.body?.notes || '').trim() || null

  if (shift.kind === 'duty') {
    const { data: updated, error } = await db.from('pos_shifts')
      .update({ closed_at: new Date().toISOString(), notes })
      .eq('id', shift.id).is('closed_at', null).select().single()
    if (error) throw error
    return res.status(200).json({ report: await dutyReport(updated), kind: 'duty' })
  }

  const counted = Number(req.body?.counted_cash)
  if (!(counted >= 0)) return res.status(400).json({ message: 'Enter the cash you counted in the drawer.' })

  // Unserved tickets stay valid for the server; they're listed on the report.
  const report = await shiftReport(shift)

  const closed = {
    closed_at:     new Date().toISOString(),
    expected_cash: report.expected_cash,
    counted_cash:  counted,
    variance:      Math.round((counted - report.expected_cash) * 100) / 100,
    notes,
  }
  const { data: updated, error } = await db
    .from('pos_shifts')
    .update(closed)
    .eq('id', shift.id)
    .is('closed_at', null)
    .select()
    .single()
  if (error) throw error

  return res.status(200).json({ report: { ...report, shift: { ...report.shift, ...updated } }, kind: 'cash' })
}, {})
