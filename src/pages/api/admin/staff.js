// GET  /api/admin/staff                         → people I may see, with their roles
// POST /api/admin/staff { action: 'remove', staff_id }
//
// The website's Staff tab. Same rules as POS → Staff: you need "Add staff and
// give them roles", you only see your own branch unless you work across
// branches, and you can only remove people whose roles are all ones you could
// give. Someone with history (sales, shifts, deliveries…) is switched off and
// hidden instead of deleted, so past records keep their name.
// Roles and PINs are set in POS → Staff.
import { db, withStaff } from '../../../lib/webSession'

export default withStaff(async (req, res) => {
  const me = req.user
  const { data: roles } = await db.from('pos_role_defs').select('key, name, sort').order('sort')
  const assignable = me.isAdmin ? (roles || []).map(r => r.key) : me.canAssign
  const canTouch = keys => (keys || []).every(k => assignable.includes(k))

  if (req.method === 'GET') {
    let q = db.from('staff').select('id, name, username, is_active, branch_id, branches(name), pos_staff(pos_role, pos_roles, is_active)').order('name')
    if (!me.scopeAll) q = q.eq('branch_id', me.branch_id || '00000000-0000-0000-0000-000000000000')
    const { data, error } = await q
    if (error) throw error
    const roleName = Object.fromEntries((roles || []).map(r => [r.key, r.name]))
    return res.status(200).json({
      staff: data.map(s => {
        const login = Array.isArray(s.pos_staff) ? s.pos_staff[0] : s.pos_staff
        const keys = login ? (login.pos_roles?.length ? login.pos_roles : [login.pos_role]) : []
        return {
          id: s.id, name: s.name, username: s.username, is_active: s.is_active,
          branch: s.branches?.name || null,
          roles: keys.map(k => roleName[k] || k),
          can_remove: s.id !== me.id && s.is_active && canTouch(keys),
        }
      }),
    })
  }

  if (req.method !== 'POST' || req.body?.action !== 'remove') return res.status(405).end()
  const { staff_id } = req.body
  if (staff_id === me.id) return res.status(400).json({ message: 'You cannot remove yourself.' })
  const { data: person } = await db.from('staff').select('id, name, branch_id').eq('id', staff_id).maybeSingle()
  if (!person || (!me.scopeAll && person.branch_id !== me.branch_id)) return res.status(404).json({ message: 'Staff member not found.' })
  const { data: login } = await db.from('pos_staff').select('id, pos_role, pos_roles').eq('staff_id', staff_id).maybeSingle()
  if (login && !canTouch(login.pos_roles?.length ? login.pos_roles : [login.pos_role])) {
    return res.status(403).json({ message: 'This person has a role you cannot change.' })
  }

  const { error: delErr } = await db.from('staff').delete().eq('id', staff_id)
  let removed = 'deleted'
  if (delErr) {
    if (delErr.code !== '23503') throw delErr   // 23503 = their history still points to them
    await db.from('staff').update({ is_active: false }).eq('id', staff_id)
    if (login) await db.from('pos_staff').update({ is_active: false }).eq('id', login.id)
    removed = 'disabled'
  }
  if (me.sid) await db.from('pos_audit_log').insert({ actor_id: me.sid, action: 'staff_remove', meta: { staff_id, name: person.name, removed, via: 'website' } })
  return res.status(200).json({ removed })
}, { perms: ['staff_assign'] })
