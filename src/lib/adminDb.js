// Browser-side: the same query chain as supabase-js, but every query is sent
// to /api/admin/db and run on the server under the signed-in staff member's
// permissions. Used by the admin and delivery pages.
//
//   const { data, error, count } = await adminDb.from('orders').select('*').eq('id', 5).single()

const FILTERS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is']

class Query {
  constructor(table) {
    this.q = { table, action: 'select', filters: [], order: [] }
  }
  select(columns = '*', opts) {
    if (this.q.action === 'select') {
      this.q.columns = columns
      if (opts?.count) { this.q.count = true; this.q.head = !!opts.head }
    } else {
      this.q.returning = columns
    }
    return this
  }
  insert(values) { this.q.action = 'insert'; this.q.values = values; return this }
  update(values) { this.q.action = 'update'; this.q.values = values; return this }
  delete()       { this.q.action = 'delete'; return this }
  order(col, opts) { this.q.order.push([col, { ascending: opts?.ascending !== false }]); return this }
  range(from, to) { this.q.range = [from, to]; return this }
  limit(n) { this.q.limit = n; return this }
  single() { this.q.single = 'single'; return this }
  maybeSingle() { this.q.single = 'maybeSingle'; return this }

  async run() {
    try {
      const res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.q),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('ugs-staff-signed-out'))
      if (!res.ok) return { data: null, count: null, error: body.error || { message: body.message || `Request failed (${res.status})` } }
      return { data: body.data, count: body.count, error: body.error }
    } catch (err) {
      return { data: null, count: null, error: { message: err.message } }
    }
  }
  then(resolve, reject) { return this.run().then(resolve, reject) }
}
for (const op of FILTERS) {
  Query.prototype[op] = function (col, val) { this.q.filters.push([op, col, val]); return this }
}

export const adminDb = { from: table => new Query(table) }

// Staff sign-in helpers
export async function staffLogin(username, pin) {
  const res = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { error: body.message || 'Sign-in failed. Try again.' }
  return { user: body.user }
}

export async function staffMe() {
  try {
    const res = await fetch('/api/admin/me')
    if (!res.ok) return null
    return (await res.json()).user
  } catch {
    return null
  }
}

export async function staffLogout() {
  await fetch('/api/admin/me', { method: 'POST' }).catch(() => {})
}
