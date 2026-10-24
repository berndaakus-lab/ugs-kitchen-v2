// Browser-side helpers for POS pages.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/pos/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`)
    err.status = res.status
    err.code = data.code
    throw err
  }
  return data
}

export const ghs = n => `GH₵ ${Number(n || 0).toFixed(2)}`
export const time = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const dateTime = d => new Date(d).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
export const METHOD_LABEL = {
  cash: 'Cash', momo_paystack: 'MoMo (prompt)', momo_manual: 'MoMo (ref)', card: 'Card',
  mobile_money: 'MoMo (online)', // payment_channel on online orders
}

export const uuid = () => crypto.randomUUID()

// Loads the session; redirects to /login when signed out. `roles` limits the page.
export function useMe(roles) {
  const router = useRouter()
  const [me, setMe] = useState(null)

  const reload = useCallback(async () => {
    try {
      const data = await api('auth/me')
      if (roles && !isElevated(data.user.role) && !roles.includes(data.user.role)) {
        router.replace(homeFor(data.user.role))
        return
      }
      setMe(data)
    } catch (err) {
      if (err.status === 401) router.replace('/login')
    }
  }, [router, roles?.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])
  return [me, reload]
}

export const isElevated = role => role === 'manager' || role === 'admin'

export function homeFor(role) {
  return { cashier: '/cashier', server: '/server', manager: '/manager', admin: '/manager' }[role] || '/login'
}

// Payment methods the shop uses (cash + MoMo prompt); others still show in
// reports if they ever have a value.
export const shownMethods = byMethod =>
  Object.entries(byMethod).filter(([m, v]) => ['cash', 'momo_paystack'].includes(m) || v > 0)

// Realtime broadcast from the POS API (see lib/broadcast.js), plus a polling
// fallback so screens stay correct if the socket drops.
let browserClient
function realtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  browserClient ||= createClient(url, key, { auth: { persistSession: false } })
  return browserClient
}

export function useBranchEvents(branchId, onEvent, pollMs = 5000) {
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!branchId) return
    const client = realtimeClient()
    const channel = client
      ?.channel(`pos-${branchId}`)
      .on('broadcast', { event: '*' }, msg => handler.current(msg.event, msg.payload))
      .subscribe()
    const timer = setInterval(() => handler.current('poll', {}), pollMs)
    return () => {
      clearInterval(timer)
      if (channel) client.removeChannel(channel)
    }
  }, [branchId, pollMs])
}
