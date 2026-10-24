import { db } from '@/lib/supabaseAdmin'
import { withAuth, createSession } from '@/lib/session'

// POST { branch_id } — admin switches the branch they are working in.
export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only the admin can switch branches.' })

  const { data: branch } = await db
    .from('branches')
    .select('id, name')
    .eq('id', req.body?.branch_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!branch) return res.status(404).json({ message: 'Branch not found or inactive.' })

  const { iat, exp, ...user } = req.user
  const next = { ...user, branch_id: branch.id, branch_name: branch.name }
  await createSession(res, next)
  return res.status(200).json({ user: next })
})
