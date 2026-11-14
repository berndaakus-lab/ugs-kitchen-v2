// Everything a role can be allowed to do. Roles themselves are data the owner
// edits (pos_role_defs); this list is fixed in code because each permission is
// checked somewhere. Keep src/lib/permissions.js (website) the same.

export const PERMISSION_GROUPS = [
  { label: 'Selling', perms: [
    ['sell',          'Sell (cash drawer, take payments)'],
    ['serve',         'Serve tickets'],
    ['void_approve',  'Approve voids with their PIN'],
  ] },
  { label: 'Online orders', perms: [
    ['online_orders',        'See website orders, print their receipts'],
    ['online_orders_manage', 'Change website order status and prep time'],
    ['delivery',             'Delivery rider screen'],
  ] },
  { label: 'Stock', perms: [
    ['stock_send',    'Send food from the kitchen'],
    ['stock_receive', 'Confirm deliveries at the branch'],
    ['stock_count',   'Closing stock count'],
    ['stock_adjust',  'Record waste and corrections'],
    ['stock_setup',   'Stock items and dish links'],
  ] },
  { label: 'Warehouse & kitchens', perms: [
    ['purchases',  'Record purchases and suppliers (warehouse)'],
    ['production', 'Record food cooked / prepared (kitchens)'],
    ['recipes',    'Edit recipes'],
    ['food_cost',  'See costs and food cost per dish'],
    ['locations',  'Set up the warehouse, kitchens and which branches they supply'],
  ] },
  { label: 'Reports', perms: [
    ['reports',  'Sales reports, Today, shift reports'],
    ['activity', 'Full history: who sent, received, counted, voided'],
  ] },
  { label: 'People & data', perms: [
    ['customers',    'See walk-in customers'],
    ['export',       'Download data (CSV / Excel)'],
    ['staff_assign', 'Add staff and give them roles'],
    ['roles_manage', 'Create and edit roles'],
  ] },
  { label: 'Website', perms: [
    ['menu',     'Edit the menu and categories'],
    ['promos',   'Edit promos'],
    ['reviews',  'Approve and remove reviews'],
    ['branches', 'Edit branches and opening hours'],
  ] },
]

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.perms.map(([p]) => p))
export const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.perms))

export const SCOPES = [
  ['branch',  'One branch'],
  ['all',     'All branches and the kitchen'],
  ['kitchen', 'Their kitchen (central or satellite)'],
  ['warehouse', 'The warehouse'],
]

// Before migrations/pos_009_roles.sql runs, roles are the old fixed ones.
// Same as the starting roles in that migration.
export const LEGACY_ROLES = {
  admin:   { name: 'Admin', is_system: true, scope: 'all', runs_shift: false, permissions: [], can_assign: [] },
  manager: { name: 'Branch manager', scope: 'branch', runs_shift: false,
    permissions: ['sell', 'serve', 'void_approve', 'stock_receive', 'stock_count', 'stock_adjust', 'stock_setup',
      'reports', 'activity', 'online_orders', 'online_orders_manage', 'customers', 'export', 'staff_assign'],
    can_assign: ['cashier', 'server', 'kitchen', 'manager'] },
  kitchen: { name: 'Kitchen head', scope: 'kitchen', runs_shift: false, permissions: ['stock_send', 'activity'], can_assign: [] },
  cashier: { name: 'Cashier', scope: 'branch', runs_shift: true, permissions: ['sell', 'online_orders', 'stock_receive', 'stock_count'], can_assign: [] },
  server:  { name: 'Server', scope: 'branch', runs_shift: false, permissions: ['serve', 'online_orders', 'stock_receive', 'stock_count'], can_assign: [] },
}

// Turn a person's role definitions into what they may do.
export function resolveAccess(defs) {
  const isAdmin = defs.some(d => d.is_system)
  const perms = isAdmin ? [...ALL_PERMISSIONS] : [...new Set(defs.flatMap(d => d.permissions || []))].sort()
  const scopes = [...new Set(defs.map(d => d.scope))]
  return {
    isAdmin,
    perms,
    scopes,
    scopeAll: isAdmin || scopes.includes('all'),
    kitchen: isAdmin || scopes.includes('all') || scopes.includes('kitchen'),
    warehouse: isAdmin || scopes.includes('all') || scopes.includes('warehouse'),
    // works at a kitchen or the warehouse (needs a location on POS → Staff)
    storeRole: scopes.includes('kitchen') || scopes.includes('warehouse'),
    runsShift: defs.some(d => d.runs_shift),
    canAssign: [...new Set(defs.flatMap(d => d.can_assign || []))],
    roleNames: defs.map(d => d.name),
  }
}

// Works on a session user or an access object: any of the permissions.
export const can = (user, ...perms) => !!user && (user.isAdmin || perms.some(p => (user.perms || []).includes(p)))
