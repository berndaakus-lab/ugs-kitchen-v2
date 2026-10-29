import { db, rpc, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { broadcast } from '@/lib/broadcast'
import { checkCharge, toPesewas, paystackError, nameFromCharge } from '@/lib/paystack'
import { sendReviewSms } from '@/lib/reviewSms'

const NOT_PAID = { status: 'failed', message: "Payment didn't go through. Nothing was saved — start the payment again." }

// GET  ?sale_id=   → poll the charge; on success the sale becomes real (gets its ticket number).
// POST { sale_id, cancel: true } → cashier gave up; final check, then the sale is deleted.
// A sale whose payment fails or is cancelled is deleted, not kept (see pos_discard_pending).
export default withAuth(async (req, res) => {
  const saleId = req.method === 'POST' ? req.body?.sale_id : req.query.sale_id
  const cancel = req.method === 'POST' && req.body?.cancel === true

  const sale = await loadSale(saleId).catch(() => null)
  if (!sale) return res.status(200).json(NOT_PAID) // already discarded
  if (sale.branch_id !== req.user.branch_id) return res.status(404).json({ message: 'Sale not found.' })
  if (sale.status === 'paid') return res.status(200).json({ status: 'success', sale })
  if (sale.status !== 'pending_payment') return res.status(200).json(NOT_PAID)

  const payment = sale.payments.find(p => p.status === 'pending')
  if (!payment?.reference) return res.status(200).json({ status: 'failed', message: 'Payment was not started.' })

  let charge
  try {
    charge = await checkCharge(payment.reference)
  } catch (err) {
    if (!cancel) return res.status(200).json({ status: 'pending', message: paystackError(err) })
  }

  if (charge?.status === 'success') {
    if (Number(charge.amount) !== toPesewas(sale.total)) {
      console.error('[momo-verify] amount mismatch', payment.reference, charge.amount, sale.total)
      return res.status(409).json({ status: 'failed', message: 'Amount paid does not match. Check Paystack before serving.' })
    }
    const flipped = await rpc('pos_confirm_payment', {
      p_sale: sale.id, p_reference: payment.reference, p_channel: charge.channel || 'mobile_money',
    })
    if (flipped) {
      // Fill in the customer's name from their MoMo wallet if we still don't have one.
      const walletName = nameFromCharge(charge)
      if (walletName && sale.customer_id && !sale.customer?.name) {
        await db.from('pos_customers').update({ name: walletName }).eq('id', sale.customer_id).is('name', null)
      }
      await sendReviewSms(req, sale.id) // paid now (MoMo): text the review link; sent once per sale
    }
    const paid = await loadSale(sale.id)
    if (flipped) await broadcast(req.user.branch_id, 'sale_paid', { id: paid.id, ticket_no: paid.ticket_no })
    return res.status(200).json({ status: 'success', sale: paid })
  }

  if (charge?.status === 'failed' || cancel) {
    const reason = cancel ? 'cancelled by cashier' : (charge.gateway_response || 'not approved by customer')
    await rpc('pos_discard_pending', { p_sale: sale.id, p_actor: req.user.sid, p_reason: reason })
    return res.status(200).json({
      status:  'failed',
      message: cancel ? 'Payment cancelled. Nothing was saved.' : `${charge.gateway_response || 'Customer did not approve the payment.'} Nothing was saved.`,
    })
  }

  return res.status(200).json({
    status:      'pending',
    requiresOtp: charge?.status === 'send_otp',
    message:     charge?.display_text || 'Waiting for the customer to approve…',
  })
}, { roles: ['cashier'] })
