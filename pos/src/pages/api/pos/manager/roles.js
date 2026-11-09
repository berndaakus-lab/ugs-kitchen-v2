import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { ALL_PERMISSIONS, PERMISSION_GROUPS, SCOPES } from '@/lib/permissions'

// The owner's role editor ("Create and edit roles").
// GET                                   → roles, with how many people hold each
// POST { role: {key?, name, permissions, scope, runs_shift, can_assign} } → create / update
// POST { action: 'delete', key }        → delete (only when nobody holds it)
// Admin is locked: always every permission, every branch, no shift.
const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

export default withAuth(async (req, res) => {
  const { data: roles, error } = await db.from('pos_role_defs').select('*').order('sort').order('name')
  if (error) return res.status(409).json({ message: 'Run migrations/pos_009_roles.sql first.' })

  if (req.method === 'GET') {
    const { data: staff } = await db.from('pos_staff').select('pos_roles, is_active')
    const holders = {}
    for (const s of staff || []) for (const k of s.pos_roles || []) holders[k] = (holders[k] || 0) + 1
    return res.status(200).json({
      roles: roles.map(r => ({ ...r, holders: holders[r.key] || 0 })),
      groups: PERMISSION_GROUPS, scopes: SCOPES,
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  if (req.body?.action === 'delete') {
    const role = roles.find(r => r.key === req.body.key)
    if (!role) return res.status(404).json({ message: 'Role not found.' })
    if (role.is_system) return res.status(400).json({ message: 'The Admin role cannot be deleted.' })
    const { count } = await db.from('pos_staff').select('id', { count: 'exact', head: true }).contains('pos_roles', [role.key])
    if (count) return res.status(409).json({ message: `${count} ${count === 1 ? 'person has' : 'people have'} this role. Change their roles first.` })
    // Other roles may list it under "can assign": take it out.
    for (const r of roles.filter(x => (x.can_assign || []).includes(role.key))) {
      await db.from('pos_role_defs').update({ can_assign: r.can_assign.filter(k => k !== role.key) }).eq('key', r.key)
    }
    const { error: delErr } = await db.from('pos_role_defs').delete().eq('key', role.key)
    if (delErr) throw delErr
    await db.from('pos_audit_log').insert({ actor_id: req.user.sid, action: 'role_delete', meta: { key: role.key, name: role.name } })
    return res.status(200).json({ ok: true })
  }

  const r = req.body?.role || {}
  const name = String(r.name || '').trim().slice(0, 40)
  if (!name) return res.status(400).json({ message: 'Give the role a name.' })
  const existing = r.key ? roles.find(x => x.key === r.key) : null
  if (r.key && !existing) return res.status(404).json({ message: 'Role not found.' })
  if (existing?.is_system) return res.status(400).json({ message: 'The Admin role is locked: it can do everything.' })
  if (roles.some(x => x.name.toLowerCase() === name.toLowerCase() && x.key !== existing?.key)) {
    return res.status(409).json({ message: `There is already a role called "${name}".` })
  }
  const scope = SCOPES.some(([s]) => s === r.scope) ? r.scope : 'branch'
  const row = {
    name,
    permissions: [...new Set((r.permissions || []).filter(p => ALL_PERMISSIONS.includes(p)))],
    scope,
    runs_shift: Boolean(r.runs_shift),
    can_assign: [...new Set((r.can_assign || []).filter(k => roles.some(x => x.key === k && !x.is_system)))],
    updated_at: new Date().toISOString(),
  }

  let saved
  if (existing) {
    const { data, error: upErr } = await db.from('pos_role_defs').update(row).eq('key', existing.key).select().single()
    if (upErr) throw upErr
    saved = data
  } else {
    let key = slug(name) || 'role'
    while (roles.some(x => x.key === key)) key = `${key.slice(0, 36)}_${Math.floor(Math.random() * 900 + 100)}`
    const { data, error: insErr } = await db.from('pos_role_defs')
      .insert({ ...row, key, sort: Math.max(10, ...roles.map(x => x.sort || 0)) + 1 }).select().single()
    if (insErr) throw insErr
    saved = data
  }
  await db.from('pos_audit_log').insert({ actor_id: req.user.sid, action: existing ? 'role_update' : 'role_create', meta: { key: saved.key, ...row } })
  return res.status(200).json({ role: saved })
}, { perms: ['roles_manage'] })
