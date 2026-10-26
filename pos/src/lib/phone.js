// Ghana phone numbers, stored in local format 0XXXXXXXXX.
// Accepts "024 123 4567", "+233241234567", "233241234567".
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '')
  if (d.startsWith('233') && d.length === 12) d = `0${d.slice(3)}`
  if (d.length === 9 && !d.startsWith('0')) d = `0${d}`
  return /^0\d{9}$/.test(d) ? d : null
}

// 0241234567 → 024****567 (for printed slips)
export function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-3)}` : ''
}
