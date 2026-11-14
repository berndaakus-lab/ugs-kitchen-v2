// Server-only: what a POS person may do right now, from their roles.
// Loaded on every request, so a role edit or a disabled account applies at once.
import { db } from './supabaseAdmin'
import { LEGACY_ROLES, resolveAccess } from './permissions'

export async function loadRoleDefs(keys) {
  const { data, error } = await db.from('pos_role_defs').select('*').in('key', keys)
  // Before migrations/pos_009_roles.sql has run, fall back to the old fixed roles.
  if (error) return keys.map(k => LEGACY_ROLES[k] && { key: k, ...LEGACY_ROLES[k] }).filter(Boolean)
  return (data || []).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))
}

export async function loadAccess(posStaffId) {
  const { data: ps } = await db.from('pos_staff')
    .select('*, staff:staff_id(name, username, is_active)')
    .eq('id', posStaffId).maybeSingle()
  if (!ps) return null
  const keys = ps.pos_roles?.length ? ps.pos_roles : [ps.pos_role]
  const defs = await loadRoleDefs(keys)
  return {
    ...resolveAccess(defs),
    roles: defs.map(d => d.key),
    role: defs[0]?.key || ps.pos_role,
    homeBranch: ps.branch_id,
    // Kitchen and warehouse people work at one place (set on POS → Staff).
    locationId: ps.location_id || null,
    name: ps.staff?.name,
    active: !!(ps.is_active && ps.staff?.is_active),
  }
}
