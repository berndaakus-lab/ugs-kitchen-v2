import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { submitOtp, paystackError } from '@/lib/paystack'

// POST { sale_id, otp }
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { sale_id, otp } = req.body || {}
  if (!otp) return res.status(400).json({ message: 'Enter the OTP.' })

  const { data: payment } = await db
    .from('pos_payments')
    .select('reference, pos_sales!inner(branch_id)')
    .eq('sale_id', sale_id)
    .eq('status', 'pending')
    .eq('pos_sales.branch_id', req.user.branch_id)
    .maybeSingle()
  if (!payment?.reference) return res.status(404).json({ message: 'No pending payment for this sale.' })

  try {
    const result = await submitOtp({ reference: payment.reference, otp: String(otp).trim() })
    return res.status(200).json({ message: result?.display_text || 'OTP submitted. Waiting for approval…' })
  } catch (err) {
    return res.status(400).json({ message: paystackError(err) })
  }
}, { roles: ['cashier'] })
