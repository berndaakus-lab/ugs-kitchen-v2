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

  const form = formidable({ maxFileSize: 5 * 1024 * 1024 })
  let fields, files
  try {
    ;[fields, files] = await form.parse(req)
  } catch {
    return res.status(400).json({ message: 'File too large or invalid (max 5 MB).' })
  }

  const promoId = Array.isArray(fields.promoId) ? fields.promoId[0] : fields.promoId
  const file    = Array.isArray(files.file)    ? files.file[0]    : files.file

  if (!promoId || !file) return res.status(400).json({ message: 'Missing promoId or file.' })

  const ext = file.originalFilename?.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return res.status(400).json({ message: 'Only JPG, PNG, or WebP images are allowed.' })
  }

  const path   = `promos/${promoId}.${ext}`
  const buffer = fs.readFileSync(file.filepath)

  const { error: uploadErr } = await supabase.storage
    .from('menu-images')
    .upload(path, buffer, { contentType: file.mimetype ?? 'image/jpeg', upsert: true })

  if (uploadErr) return res.status(500).json({ message: uploadErr.message })

  const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(path)
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await supabase.from('promos').update({ image: imageUrl }).eq('id', promoId)
  if (dbErr) return res.status(500).json({ message: dbErr.message })

  return res.status(200).json({ ok: true, imageUrl })
}
