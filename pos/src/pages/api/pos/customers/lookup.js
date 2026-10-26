import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { normalizePhone } from '@/lib/phone'
import { resolveMomoName } from '@/lib/paystack'

// GET ?phone= — called at the till as soon as a 10-digit number is typed.
// Returns the customer's name without asking them for it: from a previous
// visit if we know them, otherwise the name registered on their MoMo wallet
// (via Paystack). Also their visit count and promo consent.
export default withAuth(async (req, res) => {
  const phone = normalizePhone(req.query.phone)
  if (!phone) return res.status(200).json({ customer: null, name: null })

  const { data: c } = await db
    .from('pos_customers')
    .select('id, name, marketing_opt_in')
    .eq('phone', phone)
    .maybeSingle()

  let visits = 0
  if (c) {
    const { count } = await db
      .from('pos_sales')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', c.id)
      .in('status', ['paid', 'partially_served', 'served'])
    visits = count || 0
  }

  const name = c?.name || await resolveMomoName(phone)
  return res.status(200).json({
    customer:    c ? { marketing_opt_in: c.marketing_opt_in, visits } : null,
    name,
    name_source: c?.name ? 'saved' : name ? 'momo' : null,
  })
}, { roles: ['cashier'] })
