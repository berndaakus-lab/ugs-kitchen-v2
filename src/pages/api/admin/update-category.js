// POST /api/admin/update-category
// Updates a category's name, description, or image URL.
// Service role required — categories have no write RLS.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { categoryId, image, name, description } = req.body ?? {}
  if (!categoryId) return res.status(400).json({ message: 'Missing categoryId' })

  const updates = {}
  if (image       !== undefined) updates.image       = image
  if (name        !== undefined) updates.name        = name.trim() || null
  if (description !== undefined) updates.description = description.trim() || null

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ message: 'Nothing to update' })

  const { error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', categoryId)

  if (error) {
    console.error('[admin/update-category]', error.message)
    return res.status(500).json({ message: error.message })
  }

  return res.status(200).json({ ok: true })
}
