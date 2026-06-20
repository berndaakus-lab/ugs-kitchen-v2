import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const DISMISSED_KEY = 'ugs_install_dismissed'

export default function InstallBanner() {
  const [show,        setShow]        = useState(false)
  const [isIOS,       setIsIOS]       = useState(false)
  const [deferredEvt, setDeferredEvt] = useState(null) // Android prompt event

  useEffect(() => {
    // Don't show if already installed (standalone) or previously dismissed
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    if (ios) {
      // Show iOS tip after a short delay
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }

    // Android/Chrome: capture the native install event
    function handleBeforeInstall(e) {
      e.preventDefault()
      setDeferredEvt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  async function handleAndroidInstall() {
    if (!deferredEvt) return
    deferredEvt.prompt()
    const { outcome } = await deferredEvt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredEvt(null)
  }

  if (!show) return null

  // ── iOS banner ────────────────────────────────────────────────
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[60] animate-slide-up">
        <div className="bg-brand-dark text-white rounded-2xl px-4 py-4 shadow-2xl flex flex-col gap-3 max-w-sm mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="UGs Kitchen" className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div>
                <p className="font-extrabold text-sm leading-tight">Add to Home Screen</p>
                <p className="text-xs text-gray-400 mt-0.5">Open like an app, no browser bar</p>
              </div>
            </div>
            <button onClick={dismiss} className="text-gray-500 mt-0.5 flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-3">
            {/* Safari share icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange flex-shrink-0">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            <p className="text-xs leading-snug">
              Tap the <span className="font-bold text-white">Share</span> button at the bottom of Safari, then choose <span className="font-bold text-white">Add to Home Screen</span>
            </p>
          </div>
        </div>

        {/* Arrow pointing down to Safari toolbar */}
        <div className="flex justify-center mt-1">
          <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
            <path d="M10 12L0 0h20L10 12z" fill="#1a1a1a" />
          </svg>
        </div>
      </div>
    )
  }

  // ── Android banner ────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] animate-slide-up">
      <div className="bg-brand-dark text-white rounded-2xl px-4 py-4 shadow-2xl flex items-center gap-3 max-w-sm mx-auto">
        <img src="/icon-192.png" alt="UGs Kitchen" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm">Add to Home Screen</p>
          <p className="text-xs text-gray-400 mt-0.5">Open like an app, anytime</p>
        </div>
        <button
          onClick={handleAndroidInstall}
          className="flex-shrink-0 bg-brand-orange text-white font-bold text-xs px-4 py-2 rounded-xl"
        >
          Install
        </button>
        <button onClick={dismiss} className="text-gray-500 flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
