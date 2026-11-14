import { db, rpc } from '@/lib/supabaseAdmin'
import { withAuth } from '@/lib/session'
import { allLocations, KIND_LABEL } from '@/lib/store'
import { normalizePhone } from '@/lib/phone'

// The warehouse, central kitchen, satellite kitchens and which branches each
// satellite supplies ("Set up the warehouse, kitchens …").
// GET → every place (branches included, each with its satellite)
// POST { action: 'save', location: {id?, name, is_active, alert_phones} }   (new = a satellite kitchen)
// POST { action: 'assign', branch_location_id, satellite_id }
export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    // every active branch gets its stock location
    const { data: branches } = await db.from('branches').select('id').eq('is_active', true)
    await Promise.all((branches || []).map(b => rpc('inv_branch_location', { p_branch: b.id })))
    const locations = await allLocations()
    return res.status(200).json({ locations: locations.map(l => ({ ...l, kind_label: KIND_LABEL[l.kind] })) })
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const b = req.body || {}

  if (b.action === 'assign') {
    const { error } = await db.from('inv_locations').update({ supplied_by: b.satellite_id || null })
      .eq('id', b.branch_location_id).eq('kind', 'branch')
    if (error) throw error
    await db.from('pos_audit_log').insert({ actor_id: req.user.sid, action: 'branch_supply', meta: { branch_location_id: b.branch_location_id, satellite_id: b.satellite_id || null } })
    return res.status(200).json({ ok: true })
  }

  if (b.action === 'save') {
    const l = b.location || {}
    const name = String(l.name || '').trim().slice(0, 60)
    if (!name) return res.status(400).json({ message: 'Give it a name.' })
    const phones = (Array.isArray(l.alert_phones) ? l.alert_phones : String(l.alert_phones || '').split(','))
      .map(p => normalizePhone(String(p))).filter(Boolean)
    const row = { name, is_active: l.is_active !== false, alert_phones: phones }
    if (l.id) {
      const { data: cur } = await db.from('inv_locations').select('kind').eq('id', l.id).maybeSingle()
      if (!cur) return res.status(404).json({ message: 'Not found.' })
      if (cur.kind === 'branch') delete row.name   // branch names come from the online admin
      const { error } = await db.from('inv_locations').update(row).eq('id', l.id)
      if (error) throw error
    } else {
      // Only satellite kitchens are added here (one warehouse, one central kitchen).
      const { error } = await db.from('inv_locations').insert({ ...row, kind: 'satellite', sort: 30 })
      if (error) throw error
    }
    await db.from('pos_audit_log').insert({ actor_id: req.user.sid, action: 'location_save', meta: { ...row, id: l.id || null } })
    return res.status(200).json({ ok: true })
  }
  return res.status(400).json({ message: 'Unknown action.' })
}, { perms: ['locations'] })
