// POST /api/admin/db — the admin and delivery pages' database access.
//
// The pages build queries with the same chain as supabase-js (see
// lib/adminDb.js); this route replays them with the service role, but only
// what each role is allowed, per table and action:
//   • admin    — everything below
//   • staff    — read today's orders of their own branch, reviews, branches
//   • delivery — read today's orders of their own branch, branches
// Order changes go through /api/admin/update-order. Staff PINs can never be
// read back.
import { db, withStaff } from '../../../lib/webSession'

const ALL = ['admin', 'staff', 'delivery']
const RULES = {
  orders:     { select: ALL },
  branches:   { select: ALL, insert: ['admin'], update: ['admin'], delete: ['admin'] },
  reviews:    { select: ['admin', 'staff'], update: ['admin'], delete: ['admin'] },
  menu_items: { select: ['admin'], insert: ['admin'], update: ['admin'], delete: ['admin'] },
  categories: { select: ['admin'], insert: ['admin'], update: ['admin'], delete: ['admin'] },
  promos:     { select: ['admin'], insert: ['admin'], update: ['admin'], delete: ['admin'] },
  staff:      { select: ['admin'], insert: ['admin'], update: ['admin'], delete: ['admin'] },
}
const FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'])
const COL     = /^[a-z_][a-z0-9_]*$/i
const COLUMNS = /^[a-z0-9_,()*:!.\s]*$/i       // select lists, incl. embeds like categories(name)
const STAFF_SAFE = 'id, name, username, role, is_active, branch_id, created_at'

const bad = (res, message) => res.status(400).json({ data: null, error: { message } })

export default withStaff(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()
  const q = req.body || {}
  const role = req.user.role
  const allowed = RULES[q.table]?.[q.action]
  if (!allowed) return bad(res, 'Not allowed.')
  if (role !== 'admin' && !allowed.includes(role)) return res.status(403).json({ data: null, error: { message: 'You are not allowed to do that.' } })

  let columns = q.columns ?? '*'
  if (typeof columns !== 'string' || !COLUMNS.test(columns)) return bad(res, 'Bad column list.')
  if (role !== 'admin' && columns.includes('(')) return bad(res, 'Not allowed.')   // no joins into other tables
  if (/\bstaff\s*\(|\bcustomers\s*\(/i.test(columns)) return bad(res, 'Not allowed.')
  if (q.table === 'staff' && /\*|\bpin\b|web_/.test(columns)) columns = STAFF_SAFE

  // Never let a write set the person who did it from the browser, or touch login counters.
  const values = q.values
  if (values && (typeof values !== 'object')) return bad(res, 'Bad values.')
  if (q.table === 'staff' && values) {
    for (const v of [].concat(values)) { delete v.web_failed_attempts; delete v.web_locked_until; if (v.pin === '' || v.pin == null) delete v.pin }
  }

  let query
  if (q.action === 'select') query = db.from(q.table).select(columns, q.count ? { count: 'exact', head: !!q.head } : undefined)
  else if (q.action === 'insert') query = db.from(q.table).insert(values)
  else if (q.action === 'update') query = db.from(q.table).update(values)
  else if (q.action === 'delete') query = db.from(q.table).delete()

  for (const f of q.filters || []) {
    const [op, col, val] = f
    if (!FILTERS.has(op) || !COL.test(col)) return bad(res, 'Bad filter.')
    query = query[op](col, val)
  }
  // Updates and deletes must name what they change.
  if ((q.action === 'update' || q.action === 'delete') && !(q.filters || []).length) return bad(res, 'Missing filter.')

  // Staff and delivery: today's orders (GMT) of their own branch, nothing else.
  if (q.table === 'orders' && role !== 'admin') {
    const today = new Date().toISOString().slice(0, 10)
    query = query.gte('created_at', `${today}T00:00:00Z`)
    if (req.user.branch_id) query = query.eq('branch_id', req.user.branch_id)
  }

  if (q.action !== 'select' && q.returning != null) {
    if (typeof q.returning !== 'string' || !COLUMNS.test(q.returning)) return bad(res, 'Bad column list.')
    query = query.select(q.table === 'staff' ? STAFF_SAFE : q.returning)
  }
  for (const [col, opts] of q.order || []) {
    if (!COL.test(col)) return bad(res, 'Bad order.')
    query = query.order(col, { ascending: opts?.ascending !== false })
  }
  if (Array.isArray(q.range)) query = query.range(Number(q.range[0]) || 0, Number(q.range[1]) || 0)
  if (q.limit) query = query.limit(Math.min(Number(q.limit) || 1, 5000))
  if (q.single === 'single') query = query.single()
  if (q.single === 'maybeSingle') query = query.maybeSingle()

  const { data, error, count } = await query
  return res.status(200).json({ data: data ?? null, error: error ? { message: error.message, code: error.code } : null, count: count ?? null })
}, { roles: ['staff', 'delivery'] })
