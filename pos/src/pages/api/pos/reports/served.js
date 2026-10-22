import { today } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { serverReport } from '@/lib/reports'

// GET ?date=YYYY-MM-DD — the caller's serving report for a day.
export default withAuth(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today()
  return res.status(200).json({ report: await serverReport(req.user.sid, date) })
}, { roles: ['server'] })
