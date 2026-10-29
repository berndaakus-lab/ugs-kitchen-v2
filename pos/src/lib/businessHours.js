/**
 * Branch working hours. Set in the online admin (Branches) and stored on the
 * branch, so the online store and the POS follow the same hours.
 * (Identical copy of the online app's src/lib/businessHours.js — keep them the same.)
 *
 * business_hours: [{ day: 0-6 (0=Sun), open: "HH:MM", close: "HH:MM", closed: bool }]
 *  - No hours configured, or a day without an entry → open (as before).
 *  - close earlier than open (e.g. 18:00–02:00) → open past midnight.
 *  - open equal to close → open all day.
 *
 * Times are Ghana time. Ghana is UTC+0 with no daylight saving, so UTC is
 * shop time on every device — a customer's or till's wrong clock zone can't
 * change the answer.
 */
function shopNow(date = new Date()) {
  const hhmm = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  return { day: date.getUTCDay(), hhmm }
}

const entryFor = (hours, day) => hours.find(h => Number(h.day) === day)
const overnight = e => e.close < e.open

export function isOpen(businessHours, date = new Date()) {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return true
  const { day, hhmm } = shopNow(date)

  // Yesterday's late hours that run past midnight (e.g. Fri 18:00–02:00 → Sat 01:30 is open).
  const yesterday = entryFor(businessHours, (day + 6) % 7)
  if (yesterday && !yesterday.closed && overnight(yesterday) && hhmm < yesterday.close) return true

  const today = entryFor(businessHours, day)
  if (!today) return true          // day not configured → open
  if (today.closed) return false
  if (today.open === today.close) return true
  if (overnight(today)) return hhmm >= today.open
  return hhmm >= today.open && hhmm < today.close
}

export function openHoursToday(businessHours, date = new Date()) {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return null
  const entry = entryFor(businessHours, shopNow(date).day)
  if (!entry || entry.closed) return null
  return `${entry.open} – ${entry.close}`
}
