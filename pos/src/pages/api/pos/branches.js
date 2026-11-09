import { db } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'

// GET — active branches from the online app, for the admin's branch switcher.
// A branch created in the online admin shows up here automatically.
export default withAuth(async (req, res) => {
  if (!req.user.scopeAll) return res.status(403).json({ message: 'Not allowed for your role.' })
  const { data, error } = await db.from('branches').select('id, name').eq('is_active', true).order('sort_order')
  if (error) throw error
  return res.status(200).json({ branches: data })
})
