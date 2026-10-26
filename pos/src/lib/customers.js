// Server-only: walk-in customer details on a sale.
import { rpc } from './supabaseAdmin'
import { normalizePhone } from './phone'

// Validate the optional `customer` part of a sale request.
// Returns { customer } (null when no phone was given) or { error }.
export function parseCustomer(raw) {
  if (!raw || !String(raw.phone || '').trim()) return { customer: null }
  const phone = normalizePhone(raw.phone)
  if (!phone) return { error: 'Enter a valid 10-digit phone number, or leave it empty.' }
  return {
    customer: {
      phone,
      name:   String(raw.name || '').trim().slice(0, 80) || null,
      opt_in: raw.opt_in === true,
    },
  }
}

export async function attachCustomer(saleId, customer) {
  if (!customer) return null
  return rpc('pos_attach_customer', {
    p_sale:   saleId,
    p_phone:  customer.phone,
    p_name:   customer.name,
    p_opt_in: customer.opt_in,
  })
}
