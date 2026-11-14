import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { normalizePhone } from '@/lib/phone'

// GET → suppliers · POST { supplier: {id?, name, phone?, is_active} }
export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { data, error } = await db.from('inv_suppliers').select('*').order('name')
    if (error) throw error
    return res.status(200).json({ suppliers: data })
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const s = req.body?.supplier || {}
  const name = String(s.name || '').trim().slice(0, 80)
  if (!name) return res.status(400).json({ message: 'Give the supplier a name.' })
  const row = { name, phone: s.phone ? normalizePhone(String(s.phone)) || null : null, is_active: s.is_active !== false }
  const q = s.id ? db.from('inv_suppliers').update(row).eq('id', s.id).select().single() : db.from('inv_suppliers').insert(row).select().single()
  const { data, error } = await q
  if (error?.code === '23505') return res.status(409).json({ message: `There is already a supplier called "${name}".` })
  if (error) throw error
  return res.status(200).json({ supplier: data })
}, { perms: ['purchases'] })
