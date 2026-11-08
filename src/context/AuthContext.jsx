import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Customer accounts. Sign-in is checked on the server (/api/customer/*), which
// keeps the customer signed in with a secure cookie. localStorage only holds a
// copy of the name/phone so the header can show it before the server answers.
const AuthContext = createContext(null)
const SESSION_KEY = 'ugs_customer'

function validatePhone(phone) {
  return /^0[2-5][0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

async function post(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.message || 'Something went wrong. Please try again.' }
    return data
  } catch {
    return { error: 'No connection. Please try again.' }
  }
}

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null) // { id, name, phone, username, contact_phone, avatar_url }
  const [loading,  setLoading]  = useState(true)

  const remember = useCallback(c => {
    setCustomer(c)
    try {
      if (c) localStorage.setItem(SESSION_KEY, JSON.stringify(c))
      else localStorage.removeItem(SESSION_KEY)
    } catch {}
  }, [])

  // Restore: show the saved copy at once, then confirm with the server.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) setCustomer(JSON.parse(saved))
    } catch {}
    fetch('/api/customer/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => remember(d?.customer ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [remember])

  // ── After a paid order: sign the payer in (creates the account if new) ──
  // Returns { session, isNew, username, tempPassword } or null.
  const silentSignIn = useCallback(async order => {
    if (!order?.id || !order?._token) return null
    const r = await post('/api/customer/after-payment', { orderId: order.id, token: order._token })
    if (r.error || !r.customer) return null
    remember(r.customer)
    return { session: r.customer, isNew: !!r.isNew, username: r.username, tempPassword: r.tempPassword }
  }, [remember])

  // ── Sign in / sign up by phone: an SMS code proves the number is yours ──
  const requestCode = useCallback(async (phone, mode = 'signin', name = '') => {
    const clean = phone.replace(/\s/g, '')
    if (!validatePhone(clean)) return { error: 'Enter a valid 10-digit Ghana phone number.' }
    if (mode === 'signup' && !name.trim()) return { error: 'Please enter your name.' }
    return post('/api/customer/code', { phone: clean, mode, name: name.trim() })
  }, [])

  const verifyCode = useCallback(async (phone, code) => {
    if (!/^\d{6}$/.test(String(code).trim())) return { error: 'Enter the 6-digit code from the SMS.' }
    const r = await post('/api/customer/verify', { phone: phone.replace(/\s/g, ''), code: String(code).trim() })
    if (r.error) return r
    remember(r.customer)
    return { data: r.customer }
  }, [remember])

  // ── Sign in by username + password ────────────────────────────
  const signInByCredentials = useCallback(async (username, password) => {
    if (!username.trim()) return { error: 'Enter your username.' }
    if (!password)        return { error: 'Enter your password.' }
    const r = await post('/api/customer/login', { username: username.trim().toLowerCase(), password })
    if (r.error) return r
    remember(r.customer)
    return { data: r.customer }
  }, [remember])

  // ── Update password ───────────────────────────────────────────
  const updatePassword = useCallback(async newPassword => {
    if (!customer)            return { error: 'Not logged in.' }
    if (!newPassword?.trim()) return { error: 'Password cannot be empty.' }
    const r = await post('/api/customer/me', { action: 'password', password: newPassword.trim() })
    if (r.error) return { error: r.error === 'Not signed in.' ? 'Please sign in again.' : r.error }
    return { data: true }
  }, [customer])

  const updateProfile = useCallback(async ({ name, avatar_url, contact_phone }) => {
    if (!customer) return { error: 'Not logged in.' }
    const r = await post('/api/customer/me', { action: 'profile', name, avatar_url, contact_phone })
    if (r.error) return { error: r.error === 'Not signed in.' ? 'Please sign in again.' : r.error }
    remember(r.customer)
    return { data: r.customer }
  }, [customer, remember])

  const signOut = useCallback(() => {
    remember(null)
    post('/api/customer/me', { action: 'logout' })
  }, [remember])

  return (
    <AuthContext.Provider value={{
      customer,
      loading,
      isLoggedIn: !!customer,
      silentSignIn,
      requestCode,
      verifyCode,
      signInByCredentials,
      signOut,
      updateProfile,
      updatePassword,
      validatePhone,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
