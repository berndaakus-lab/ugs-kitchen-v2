// POST /api/admin/db — the admin and delivery pages' database access.
//
// The pages build queries with the same chain as supabase-js (see
// lib/adminDb.js); this route replays them with the service role, but only
// what the person's roles allow (permissions, shared with the POS), per
// table and action. Orders: their own branch unless they work across
// branches, and only today unless they have Reports. Order changes go through
// /api/admin/update-order. People, roles and PINs are managed in POS → Staff.
import { db, withStaff, can } from '../../../lib/webSession'

const ANY = null   // anyone signed in
const RULES = {
  orders:     { select: ['online_orders', 'online_orders_manage', 'delivery', 'reports'] },
  branches:   { select: ANY, insert: ['branches'], update: ['branches'], delete: ['branches'] },
  reviews:    { select: ['reviews'], update: ['reviews'], delete: ['reviews'] },
  menu_items: { select: ['menu'], insert: ['menu'], update: ['menu'], delete: ['menu'] },
  categories: { select: ['menu'], insert: ['menu'], update: ['menu'], delete: ['menu'] },
  promos:     { select: ['promos'], insert: ['promos'], update: ['promos'], delete: ['promos'] },
}
const FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'])
const COL     = /^[a-z_][a-z0-9_]*$/i
const COLUMNS = /^[a-z0-9_,()*:!.\s]*$/i       // select lists, incl. embeds like categories(name)

const bad = (res, message) => res.status(400).json({ data: null, error: { message } })

export default withStaff(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()
  const q = req.body || {}
  const me = req.user
  const rule = RULES[q.table]
  if (!rule || !(q.action in rule)) return bad(res, 'Not allowed.')
  const allowed = rule[q.action]
  if (allowed && !can(me, ...allowed)) return res.status(403).json({ data: null, error: { message: 'You are not allowed to do that.' } })

  let columns = q.columns ?? '*'
  if (typeof columns !== 'string' || !COLUMNS.test(columns)) return bad(res, 'Bad column list.')
  if (!me.isAdmin && columns.includes('(') && !can(me, 'menu')) return bad(res, 'Not allowed.')   // no joins into other tables
  if (/\bstaff\s*\(|\bcustomers\s*\(/i.test(columns)) return bad(res, 'Not allowed.')

  // Never let a write set the person who did it from the browser, or touch login counters.
  const values = q.values
  if (values && (typeof values !== 'object')) return bad(res, 'Bad values.')

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

  // Orders: own branch unless they work across branches; only today (GMT)
  // unless they may see reports.
  if (q.table === 'orders' && !me.isAdmin) {
    if (!can(me, 'reports')) query = query.gte('created_at', `${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    if (!me.scopeAll) query = query.eq('branch_id', me.branch_id || '00000000-0000-0000-0000-000000000000')
  }

  if (q.action !== 'select' && q.returning != null) {
    if (typeof q.returning !== 'string' || !COLUMNS.test(q.returning)) return bad(res, 'Bad column list.')
    query = query.select(q.returning)
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
})
