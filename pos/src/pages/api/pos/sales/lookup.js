import { db, loadSale } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET ?code=  — a scanned QR (sale id) or a typed ticket number ("42", "W42", "W-042").
// Ticket numbers keep counting across days, so a typed number finds the most
// recent ticket with that number at this branch.
export default withAuth(async (req, res) => {
  const code = String(req.query.code || '').trim()
  if (!code) return res.status(400).json({ message: 'Enter a ticket number.' })

  let q = db.from('pos_sales').select('id').eq('branch_id', req.user.branch_id)

  if (UUID.test(code)) {
    q = q.eq('id', code)
  } else {
    const n = parseInt(code.replace(/\D/g, ''), 10)
    if (!n) return res.status(400).json({ message: 'Invalid ticket number.' })
    q = q.eq('ticket_no', `W-${String(n).padStart(3, '0')}`).order('created_at', { ascending: false }).limit(1)
  }

  const { data } = await q.maybeSingle()
  if (!data) return res.status(404).json({ message: `Ticket ${code} not found at this branch.` })

  return res.status(200).json({ sale: await loadSale(data.id) })
})
