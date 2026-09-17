// POST /api/admin/upload-category-image
// Accepts multipart form: { categoryId, file }
// Uploads to menu-images bucket (service role) and updates the category row.

import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const form = formidable({ maxFileSize: 5 * 1024 * 1024 }) // 5 MB limit
  let fields, files
  try {
    ;[fields, files] = await form.parse(req)
  } catch (err) {
    return res.status(400).json({ message: 'File too large or invalid (max 5 MB).' })
  }

  const categoryId = Array.isArray(fields.categoryId) ? fields.categoryId[0] : fields.categoryId
  const file = Array.isArray(files.file) ? files.file[0] : files.file

  if (!categoryId || !file) return res.status(400).json({ message: 'Missing categoryId or file.' })

  const ext = file.originalFilename?.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return res.status(400).json({ message: 'Only JPG, PNG, or WebP images are allowed.' })
  }

  const path = `categories/${categoryId}.${ext}`
  const buffer = fs.readFileSync(file.filepath)

  // Upload (upsert) to the menu-images bucket
  const { error: uploadErr } = await supabase.storage
    .from('menu-images')
    .upload(path, buffer, {
      contentType: file.mimetype ?? 'image/jpeg',
      upsert: true,
    })

  if (uploadErr) {
    console.error('[upload-category-image] storage error:', uploadErr.message)
    return res.status(500).json({ message: uploadErr.message })
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from('menu-images')
    .getPublicUrl(path)

  // Bust cache: append a timestamp so the browser picks up the new image
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  // Save URL to the categories row
  const { error: dbErr } = await supabase
    .from('categories')
    .update({ image: imageUrl })
    .eq('id', categoryId)

  if (dbErr) {
    console.error('[upload-category-image] db error:', dbErr.message)
    return res.status(500).json({ message: dbErr.message })
  }

  return res.status(200).json({ ok: true, imageUrl })
}
