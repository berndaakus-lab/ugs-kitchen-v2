import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const DISMISSED_KEY = 'ugs_install_dismissed'

// Share icon (box with arrow) — same visual used by Safari + Chrome on iOS
function ShareIcon({ className }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}

export default function InstallBanner() {
  const [show,        setShow]        = useState(false)
  const [iosBrowser,  setIosBrowser]  = useState(null) // 'safari' | 'chrome' | 'other'
  const [deferredEvt, setDeferredEvt] = useState(null)  // Android prompt event

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    const ua  = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream

    if (ios) {
      // Detect which browser on iOS
      if (/CriOS/i.test(ua))       setIosBrowser('chrome')
      else if (/FxiOS/i.test(ua))  setIosBrowser('other')   // Firefox iOS
      else if (/EdgiOS/i.test(ua)) setIosBrowser('other')   // Edge iOS
      else                          setIosBrowser('safari')

      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }

    // Android / Desktop Chrome — native install prompt
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
  if (iosBrowser) {
    const isSafari = iosBrowser === 'safari'
    const isChrome = iosBrowser === 'chrome'

    // Chrome on iOS: share icon is top-right. Safari: share icon is bottom-center.
    const instruction = isSafari
      ? <>Tap the <ShareIcon className="inline w-4 h-4 mb-0.5 text-brand-orange" /> <span className="font-bold text-white">Share</span> button at the <span className="font-bold text-white">bottom</span> of your screen, then tap <span className="font-bold text-white">Add to Home Screen</span></>
      : isChrome
      ? <>Tap the <ShareIcon className="inline w-4 h-4 mb-0.5 text-brand-orange" /> <span className="font-bold text-white">Share</span> button at the <span className="font-bold text-white">top right</span> of Chrome, then tap <span className="font-bold text-white">Add to Home Screen</span></>
      : <>Tap your browser&apos;s <span className="font-bold text-white">Share</span> or <span className="font-bold text-white">Menu</span> button, then choose <span className="font-bold text-white">Add to Home Screen</span></>

    // Arrow points down for Safari (toolbar at bottom), up for Chrome (toolbar at top)
    const arrowDown = isSafari

    return (
      <div className={`fixed ${arrowDown ? 'bottom-4' : 'top-4'} left-4 right-4 z-[60] animate-slide-up`}>
        {/* Arrow pointing UP toward Chrome toolbar */}
        {!arrowDown && (
          <div className="flex justify-center mb-1">
            <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
              <path d="M10 0L20 12H0L10 0z" fill="#1a1a1a" />
            </svg>
          </div>
        )}

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

          <div className="bg-white/10 rounded-xl px-3 py-2.5">
            <p className="text-xs leading-snug">{instruction}</p>
          </div>
        </div>

        {/* Arrow pointing DOWN toward Safari toolbar */}
        {arrowDown && (
          <div className="flex justify-center mt-1">
            <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
              <path d="M10 12L0 0h20L10 12z" fill="#1a1a1a" />
            </svg>
          </div>
        )}
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
