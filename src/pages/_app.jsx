import '../styles/globals.css'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { CartProvider }   from '../context/CartContext'
import { BranchProvider } from '../context/BranchContext'
import { AuthProvider }   from '../context/AuthContext'
import ComingSoon from '../components/ComingSoon'
import InstallBanner from '../components/InstallBanner'
import SplashScreen from '../components/SplashScreen'

const COMING_SOON = process.env.NEXT_PUBLIC_COMING_SOON === 'true'

const REMINDER_KEY = 'ugs_reminder'

// Backup: if customer closed the app before the countdown finished,
// fire auto-ready the next time they open the app (if time has passed).
function useReminderBackup() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMINDER_KEY)
      if (!raw) return
      const { fireAt, order } = JSON.parse(raw)
      if (!fireAt || !order) return

      const msLeft = fireAt - Date.now()

      function callAutoReady() {
        fetch('/api/auto-ready', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderId: order.id }),
        }).catch(() => {})
        localStorage.removeItem(REMINDER_KEY)
      }

      if (msLeft <= 0) {
        callAutoReady()
      } else {
        const timer = setTimeout(callAutoReady, msLeft)
        return () => clearTimeout(timer)
      }
    } catch {
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
          <SplashScreen />
          <Component {...pageProps} />
          <InstallBanner />
        </CartProvider>
      </BranchProvider>
    </AuthProvider>
  )
}
