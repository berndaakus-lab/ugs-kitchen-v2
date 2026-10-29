// Server-only: mark an online order's MoMo payment as failed, keeping
// Paystack's reason. Never overwrites an order that was already paid (a late
// "failed" event must not undo a success).
export async function markPaymentFailed(supabase, orderId, reason) {
  const base = { status: 'failed' }
  const withReason = {
    ...base,
    payment_failure_reason: String(reason || 'Payment failed').slice(0, 300),
    payment_failed_at:      new Date().toISOString(),
  }
  const open = ['pending', 'awaiting_payment']

  const { error } = await supabase.from('orders').update(withReason).eq('id', orderId).in('status', open)
  if (error) {
    // migrations/add_payment_failure_reason.sql not run yet: still record the failure.
    console.warn('[payment] could not save failure reason:', error.message)
    await supabase.from('orders').update(base).eq('id', orderId).in('status', open)
  }
}
