// Hook to subscribe the current device for push notifications.
// Call useAdminPush() in admin, useCustomerPush(orderId) after order placed.

import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function subscribe(role, orderId) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subscription: sub.toJSON(), role, orderId }),
    })
  } catch (err) {
    console.warn('[usePush] subscription failed:', err.message)
  }
}

// enabled: only subscribe once the user is logged in
export function useAdminPush(enabled) {
  useEffect(() => {
    if (enabled) subscribe('admin', null)
  }, [enabled])
}

export function useCustomerPush(orderId) {
  useEffect(() => {
    if (orderId) subscribe('customer', orderId)
  }, [orderId])
}
