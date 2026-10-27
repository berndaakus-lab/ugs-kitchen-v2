import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// Same rule as pos_normalize_roles() in the database: admin or manager stand
// alone (they already open every screen); cashier and server can be combined.
function normalizeRoles(roles) {
  if (roles.includes('admin')) return ['admin']
  if (roles.includes('manager')) return ['manager']
  return ['cashier', 'server'].filter(r => roles.includes(r))
}

// GET  → online staff at the current branch, with their POS login (if any).
//        Admins also see staff with no branch (e.g. the owner).
// POST { staff_id, roles: ['cashier','server'], pin?, is_active } → create/update a POS login
//      (a single `role` is still accepted)
export default withAuth(async (req, res) => {
  const branchId = req.user.branch_id
  const isAdmin = req.user.role === 'admin'
  const allowed = isAdmin ? ['cashier', 'server', 'manager', 'admin'] : ['cashier', 'server', 'manager']

  if (req.method === 'GET') {
    let staffQ = db.from('staff').select('id, name, username, role, is_active, branch_id').order('name')
    staffQ = isAdmin ? staffQ.or(`branch_id.eq.${branchId},branch_id.is.null`) : staffQ.eq('branch_id', branchId)
    const { data: staff, error: e1 } = await staffQ
    if (e1) throw e1
    const { data: logins, error: e2 } = await db
      .from('pos_staff')
      .select('id, staff_id, pos_role, pos_roles, is_active, locked_until, branch_id')
      .in('staff_id', staff.map(s => s.id))
    if (e2) throw e2
    const byStaff = Object.fromEntries(logins.map(l => [l.staff_id, { ...l, pos_roles: l.pos_roles || [l.pos_role] }]))
    return res.status(200).json({
      roles: allowed,
      staff: staff.map(s => ({ ...s, pos: byStaff[s.id] || null })),
    })
  }

  if (req.method === 'POST') {
    const { staff_id, pin, is_active = true } = req.body || {}
    const requested = Array.isArray(req.body?.roles) ? req.body.roles : [req.body?.role].filter(Boolean)
    if (requested.some(r => !allowed.includes(r))) return res.status(403).json({ message: 'You cannot give that role.' })
    const roles = normalizeRoles(requested)
    if (!roles.length) return res.status(400).json({ message: 'Choose at least one POS role.' })
    if (pin && !/^[0-9]{4,6}$/.test(String(pin))) return res.status(400).json({ message: 'PIN must be 4–6 digits.' })

    const { data: person } = await db.from('staff').select('id, branch_id').eq('id', staff_id).maybeSingle()
    const visible = person && (person.branch_id === branchId || (isAdmin && !person.branch_id))
    if (!visible) return res.status(404).json({ message: 'Staff member not found at this branch.' })

    const { data: existing } = await db.from('pos_staff').select('pos_role').eq('staff_id', staff_id).maybeSingle()
    if (existing?.pos_role === 'admin' && !isAdmin) return res.status(403).json({ message: 'Only the admin can change an admin login.' })
    if (staff_id === req.user.staff_id && (!is_active || roles[0] !== req.user.role)) {
      return res.status(400).json({ message: 'You cannot change your own role or deactivate yourself.' })
    }

    const id = await rpc('pos_set_staff_roles', {
      p_staff_id: staff_id,
      p_pin:      pin ? String(pin) : null,
      p_roles:    roles,
      p_branch:   branchId,
      p_active:   Boolean(is_active),
    })
    await db.from('pos_audit_log').insert({
      actor_id: req.user.sid, action: 'staff_update',
      meta: { pos_staff_id: id, roles, is_active: Boolean(is_active), pin_changed: Boolean(pin) },
    })
    return res.status(200).json({ id, roles })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}, { roles: ['manager'] })
