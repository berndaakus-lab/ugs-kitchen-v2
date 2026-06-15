import '../styles/globals.css'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { CartProvider }   from '../context/CartContext'
import { BranchProvider } from '../context/BranchContext'
import { AuthProvider }   from '../context/AuthContext'
import ComingSoon from '../components/ComingSoon'

const COMING_SOON = process.env.NEXT_PUBLIC_COMING_SOON === 'true'

const REMINDER_KEY = 'ugs_reminder'

// Backup: if customer left before the 30-min countdown finished,
// fire the SMS the next time they open the app (if time has passed).
function useReminderBackup() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMINDER_KEY)
      if (!raw) return
      const { fireAt, order } = JSON.parse(raw)
      if (!fireAt || !order) return

      const msLeft = fireAt - Date.now()

      if (msLeft <= 0) {
        // Already overdue — fire immediately
        fetch('/api/send-sms', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            to:      order.contact_phone || order.momo_number,
            message: `Hi ${order.customer_name}! ⏰ Your UGs Kitchen order should be ready very soon. Order #${String(order.id).slice(-6).toUpperCase()} — ${order.delivery_location}. We will SMS you once confirmed ready!`,
          }),
        }).catch(() => {})
        localStorage.removeItem(REMINDER_KEY)
      } else {
        // Still counting down — set a timeout for the remaining time
        const timer = setTimeout(() => {
          fetch('/api/send-sms', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              to:      order.contact_phone || order.momo_number,
              message: `Hi ${order.customer_name}! ⏰ Your UGs Kitchen order should be ready very soon. Order #${String(order.id).slice(-6).toUpperCase()} — ${order.delivery_location}. We will SMS you once confirmed ready!`,
            }),
          }).catch(() => {})
          localStorage.removeItem(REMINDER_KEY)
        }, msLeft)
        return () => clearTimeout(timer)
      }
    } catch {
      // Corrupt localStorage entry — just clear it
      localStorage.removeItem(REMINDER_KEY)
    }
  }, [])
}

export default function App({ Component, pageProps }) {
  useReminderBackup()
  const router = useRouter()

  // Show coming soon for all public pages; admin always bypasses the flag
  const isAdminRoute = router.pathname.startsWith('/admin')
  if (COMING_SOON && !isAdminRoute) {
    return <ComingSoon />
  }

  return (
    <AuthProvider>
      <BranchProvider>
        <CartProvider>
          <Component {...pageProps} />
        </CartProvider>
      </BranchProvider>
    </AuthProvider>
  )
}
