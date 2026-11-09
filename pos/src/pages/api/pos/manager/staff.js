import crypto from 'crypto'
import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { LEGACY_ROLES } from '@/lib/permissions'

// People, their roles and PINs: one list for the POS and the website.
//
// GET  → roles (all, for names), which of them I may give, people I may see
// POST { action: 'add', name, username, branch_id? }          → add a person
// POST { staff_id, roles: [...], pin?, is_active, branch_id? } → set roles / PIN
//
// Anyone with "Add staff and give them roles" may give only the roles their own
// roles allow (Admin: every role), and may only change people whose roles are
// all ones they could give. People who work at one branch only see that branch.
async function allRoles() {
  const { data, error } = await db.from('pos_role_defs').select('key, name, scope, is_system, sort').order('sort')
  if (!error) return data
  return Object.entries(LEGACY_ROLES).map(([key, r]) => ({ key, name: r.name, scope: r.scope, is_system: !!r.is_system }))
}

export default withAuth(async (req, res) => {
  const me = req.user
  const roles = await allRoles()
  const assignable = me.isAdmin ? roles.map(r => r.key) : me.canAssign.filter(k => roles.some(r => r.key === k))
  const canTouch = keys => (keys || []).every(k => assignable.includes(k))

  if (req.method === 'GET') {
    let staffQ = db.from('staff').select('id, name, username, is_active, branch_id').order('name')
    if (!me.scopeAll) staffQ = staffQ.eq('branch_id', me.branch_id)
    const { data: staff, error: e1 } = await staffQ
    if (e1) throw e1
    const { data: logins, error: e2 } = await db.from('pos_staff')
      .select('id, staff_id, pos_role, pos_roles, is_active, locked_until, branch_id')
      .in('staff_id', staff.map(s => s.id))
    if (e2) throw e2
    const byStaff = Object.fromEntries(logins.map(l => [l.staff_id, { ...l, pos_roles: l.pos_roles || [l.pos_role] }]))
    const { data: branches } = await db.from('branches').select('id, name').eq('is_active', true).order('sort_order')

    // Branch-scoped managers also see branchless people they gave a login at this branch.
    const people = staff.map(s => {
      const pos = byStaff[s.id] || null
      return { ...s, pos, editable: s.id !== me.staff_id && (!pos || canTouch(pos.pos_roles)), is_me: s.id === me.staff_id }
    })
    return res.status(200).json({
      roles, assignable, branches: me.scopeAll ? branches : branches.filter(b => b.id === me.branch_id),
      can_pick_branch: me.scopeAll, staff: people,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const b = req.body || {}
  const branchFor = wanted => (me.scopeAll ? (wanted || me.branch_id) : me.branch_id)

  if (b.action === 'add') {
    const name = String(b.name || '').trim().slice(0, 80)
    const username = String(b.username || '').trim().toLowerCase()
    if (!name) return res.status(400).json({ message: 'Enter their name.' })
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ message: 'Username: 3–30 letters or numbers, no spaces.' })
    const { data: person, error } = await db.from('staff').insert({
      name, username, branch_id: branchFor(b.branch_id) || null, role: 'staff', is_active: true,
      pin: crypto.randomBytes(16).toString('hex'),   // website PIN unused: the POS PIN is used everywhere
    }).select('id, name, username, is_active, branch_id').single()
    if (error?.code === '23505') return res.status(409).json({ message: `The username "${username}" is taken.` })
    if (error) throw error
    await db.from('pos_audit_log').insert({ actor_id: me.sid, action: 'staff_add', meta: { staff_id: person.id, name, username } })
    return res.status(200).json({ person })
  }

  // Set roles / PIN / on-off
  const { staff_id, pin, is_active = true } = b
  const requested = [...new Set(Array.isArray(b.roles) ? b.roles : [])]
  if (!requested.length) return res.status(400).json({ message: 'Choose at least one role.' })
  if (!canTouch(requested)) return res.status(403).json({ message: 'You cannot give one of those roles.' })
  if (pin && !/^[0-9]{4,6}$/.test(String(pin))) return res.status(400).json({ message: 'PIN must be 4–6 digits.' })
  if (staff_id === me.staff_id) return res.status(400).json({ message: 'You cannot change your own roles here. Ask someone above you.' })

  const { data: person } = await db.from('staff').select('id, branch_id').eq('id', staff_id).maybeSingle()
  if (!person || (!me.scopeAll && person.branch_id !== me.branch_id)) return res.status(404).json({ message: 'Staff member not found at this branch.' })
  const { data: existing } = await db.from('pos_staff').select('pos_role, pos_roles').eq('staff_id', staff_id).maybeSingle()
  if (existing && !canTouch(existing.pos_roles || [existing.pos_role])) {
    return res.status(403).json({ message: 'This person has a role you cannot change.' })
  }

  const branch = branchFor(b.branch_id || person.branch_id)
  const id = await rpc('pos_set_staff_roles', {
    p_staff_id: staff_id,
    p_pin:      pin ? String(pin) : null,
    p_roles:    requested,
    p_branch:   branch || null,
    p_active:   Boolean(is_active),
  })
  if (branch && branch !== person.branch_id) await db.from('staff').update({ branch_id: branch }).eq('id', staff_id)
  await db.from('pos_audit_log').insert({
    actor_id: me.sid, action: 'staff_update',
    meta: { pos_staff_id: id, roles: requested, is_active: Boolean(is_active), pin_changed: Boolean(pin), branch_id: branch || null },
  })
  return res.status(200).json({ id, roles: requested })
}, { perms: ['staff_assign'] })
