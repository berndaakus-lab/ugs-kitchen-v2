import { db, rpc, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { chargeMomo, paystackError } from '@/lib/paystack'
import { normalizePhone } from '@/lib/phone'
import { parseCustomer, attachCustomer } from '@/lib/customers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST { client_ref, items: [{menu_item_id, qty}], phone, customer?: {phone?, name?, opt_in?} }
// Creates the sale as pending_payment (ticket number reserved) and sends the
// MoMo prompt. The cashier screen then polls momo-verify.
// The customer's phone defaults to the MoMo number.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { client_ref, items, phone } = req.body || {}
  const cleanPhone = normalizePhone(phone)
  if (!UUID.test(client_ref || '')) return res.status(400).json({ message: 'Missing client_ref.' })
  if (!cleanPhone) return res.status(400).json({ message: 'Enter a valid 10-digit MoMo number.' })
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty.' })
  const { customer, error: customerError } = parseCustomer({ ...req.body?.customer, phone: req.body?.customer?.phone || cleanPhone })
  if (customerError) return res.status(400).json({ message: customerError })

  const saleId = await rpc('pos_create_sale', {
    p_branch:     req.user.branch_id,
    p_cashier:    req.user.sid,
    p_client_ref: client_ref,
    p_items:      items.map(i => ({ menu_item_id: i.menu_item_id, qty: Number(i.qty) })),
    p_payments:   [],
    p_status:     'pending_payment',
  })
  await attachCustomer(saleId, customer).catch(err => console.error('[pos] attach customer', err.message))
  const sale = await loadSale(saleId)

  // Retry of a request that already went through.
  if (sale.status === 'paid') return res.status(200).json({ sale_id: sale.id, status: 'success' })
  if (sale.status !== 'pending_payment') {
    return res.status(409).json({ message: 'This payment already failed. Start the payment again.' })
  }
  const pending = sale.payments.find(p => p.status === 'pending')
  if (pending?.reference) {
    return res.status(200).json({ sale_id: sale.id, reference: pending.reference, status: 'pending' })
  }

  // The ticket number is only given once Paystack confirms (pos_confirm_payment).
  const reference = `UGSPOS-${sale.id.slice(0, 8)}-${Date.now()}`
  await db.from('pos_payments').update({ reference }).eq('id', pending.id)

  try {
    const charge = await chargeMomo({
      phone: cleanPhone, amount: sale.total, reference, saleId: sale.id, ticketNo: null,
    })
    return res.status(200).json({
      sale_id:     sale.id,
      reference,
      status:      'pending',
      requiresOtp: charge?.status === 'send_otp',
      message:     charge?.display_text || 'Prompt sent. Ask the customer to approve on their phone.',
    })
  } catch (err) {
    // Payment never started: don't keep the sale.
    await rpc('pos_discard_pending', { p_sale: sale.id, p_actor: req.user.sid, p_reason: `charge failed: ${paystackError(err)}` })
    return res.status(502).json({ message: paystackError(err), status: 'failed' })
  }
}, { roles: ['cashier'] })
