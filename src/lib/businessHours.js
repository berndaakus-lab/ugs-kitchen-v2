/**
 * Given a branch's business_hours JSONB array, returns whether the branch is
 * currently open. Each entry: { day: 0-6 (0=Sun), open: "HH:MM", close: "HH:MM", closed: bool }
 * Returns true (open) when no hours are configured (defaults to always open).
 */
export function isOpen(businessHours) {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return true
  const now   = new Date()
  const day   = now.getDay()   // 0=Sun
  const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const entry = businessHours.find(h => h.day === day)
  if (!entry) return true      // day not configured → open
  if (entry.closed) return false
  return hhmm >= entry.open && hhmm < entry.close
}

export function openHoursToday(businessHours) {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return null
  const day   = new Date().getDay()
  const entry = businessHours.find(h => h.day === day)
  if (!entry || entry.closed) return null
  return `${entry.open} – ${entry.close}`
}
