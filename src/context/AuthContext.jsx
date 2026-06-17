import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const SESSION_KEY = 'ugs_customer'

function validatePhone(phone) {
  // Ghana: starts with 0, second digit 2-5, total 10 digits
  return /^0[2-5][0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null) // { id, name, phone }
  const [loading,  setLoading]  = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) setCustomer(JSON.parse(saved))
    } catch {}
    setLoading(false)
  }, [])

  // ── Silent upsert — called automatically on order placement ──
  // Creates account if new number, returns existing if known
  const silentSignIn = useCallback(async (name, phone) => {
    const cleanPhone = phone.replace(/\s/g, '')
    if (!validatePhone(cleanPhone)) return null

    try {
      const { data, error } = await supabase
        .from('customers')
        .upsert(
          { name: name.trim(), phone: cleanPhone },
          { onConflict: 'phone', ignoreDuplicates: false }
        )
        .select()
        .single()

      if (error) throw error

      const session = { id: data.id, name: data.name, phone: data.phone }
      setCustomer(session)
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      return session
    } catch {
      return null
    }
  }, [])

  // ── Explicit sign in by phone (for returning customers) ──────
  const signInByPhone = useCallback(async (phone) => {
    const cleanPhone = phone.replace(/\s/g, '')
    if (!validatePhone(cleanPhone)) return { error: 'Enter a valid 10-digit Ghana phone number.' }

    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (!data) return { error: 'No account found for this number.' }

    const session = { id: data.id, name: data.name, phone: data.phone }
    setCustomer(session)
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return { data: session }
  }, [])

  // ── Explicit sign up ─────────────────────────────────────────
  const signUp = useCallback(async (name, phone) => {
    const cleanPhone = phone.replace(/\s/g, '')
    if (!name.trim())              return { error: 'Please enter your name.' }
    if (!validatePhone(cleanPhone)) return { error: 'Enter a valid 10-digit Ghana phone number.' }

    // Check if already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existing) return { error: 'An account with this number already exists. Please sign in.' }

    const { data, error } = await supabase
      .from('customers')
      .insert({ name: name.trim(), phone: cleanPhone })
      .select()
      .single()

    if (error) return { error: 'Could not create account. Please try again.' }

    const session = { id: data.id, name: data.name, phone: data.phone }
    setCustomer(session)
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return { data: session }
  }, [])

  const updateProfile = useCallback(async ({ name, avatar_url }) => {
    if (!customer) return { error: 'Not logged in.' }
    const updates = {}
    if (name !== undefined)       updates.name       = name.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customer.id)
      .select()
      .single()

    if (error) return { error: 'Could not update profile.' }

    const session = { ...customer, name: data.name, avatar_url: data.avatar_url ?? customer.avatar_url }
    setCustomer(session)
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return { data: session }
  }, [customer])

  const signOut = useCallback(() => {
    setCustomer(null)
    localStorage.removeItem(SESSION_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{
      customer,
      loading,
      isLoggedIn: !!customer,
      silentSignIn,
      signInByPhone,
      signUp,
      signOut,
      updateProfile,
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
