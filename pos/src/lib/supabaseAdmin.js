// Server-only Supabase client (service role). Never import from a page component.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error('POS requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
}

export const db = createClient(url, key, { auth: { persistSession: false } })

// Raise DB errors so API routes can map them to responses in one place.
export async function rpc(fn, args) {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw error
  return data
}

// Load a sale with items, payments and staff names, shaped for printing/UI.
export async function loadSale(saleId) {
  const { data: sale, error } = await db
    .from('pos_sales')
    .select('*, pos_sale_items(*), pos_payments(*)')
    .eq('id', saleId)
    .single()
  if (error) throw error

  const staffIds = [sale.cashier_id, sale.served_by_id, sale.voided_by_id].filter(Boolean)
  const names = await staffNames(staffIds)

  const { pos_sale_items, pos_payments, ...rest } = sale
  return {
    ...rest,
    items:       (pos_sale_items || []).sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot)),
    payments:    (pos_payments || []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    cashier:     names[sale.cashier_id] || null,
    served_by:   names[sale.served_by_id] || null,
    voided_by:   names[sale.voided_by_id] || null,
  }
}

// { pos_staff.id: staff.name }
export async function staffNames(posStaffIds) {
  const ids = [...new Set(posStaffIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data: rows } = await db.from('pos_staff').select('id, staff_id').in('id', ids)
  const { data: people } = await db.from('staff').select('id, name').in('id', (rows || []).map(r => r.staff_id))
  const byStaff = Object.fromEntries((people || []).map(p => [p.id, p.name]))
  return Object.fromEntries((rows || []).map(r => [r.id, byStaff[r.staff_id] || 'Unknown']))
}

export async function openShiftFor(posStaffId) {
  const { data } = await db
    .from('pos_shifts')
    .select('*')
    .eq('staff_id', posStaffId)
    .is('closed_at', null)
    .maybeSingle()
  return data
}

export function today() {
  // Ghana is UTC+0 all year, so the UTC date is the business date.
  return new Date().toISOString().slice(0, 10)
}
