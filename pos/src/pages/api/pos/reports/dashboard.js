import { withAuth } from '@/lib/session'
import { buildReport, parseFilters } from '@/lib/reportData'

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=all|<id>&channel=walk_in|online&method=cash|momo|card|other&staff=<pos_staff id>
// The owner dashboard (Module 4). `branch` is only honoured for people who work
// across branches; everyone else always gets their own branch.
export default withAuth(async (req, res) => {
  const { sales, ...report } = await buildReport(req.user, parseFilters(req.query, req.user))
  return res.status(200).json({ report })
}, { perms: ['reports'] })
