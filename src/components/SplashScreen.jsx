import { useEffect, useState } from 'react'

export default function SplashScreen() {
  const [visible, setVisible] = useState(false)
  const [hiding,  setHiding]  = useState(false)

  useEffect(() => {
    // Only show splash when running as installed PWA (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (!isStandalone) return

    // Only on first open per session
    if (sessionStorage.getItem('ugs_splashed')) return
    sessionStorage.setItem('ugs_splashed', '1')

    setVisible(true)
    const fadeTimer = setTimeout(() => setHiding(true), 1800)
    const hideTimer = setTimeout(() => setVisible(false), 2300)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
      style={{
        backgroundColor: '#FFF8F0',
        transition: 'opacity 0.5s ease',
        opacity: hiding ? 0 : 1,
      }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-4">
        <img
          src="/icon-512.png"
          alt="UGs Kitchen"
          className="w-28 h-28 rounded-3xl shadow-xl"
          style={{ animation: 'splashPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
        />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-brand-dark tracking-tight">UGs Kitchen</h1>
          <p className="text-sm text-brand-orange font-semibold mt-1">Fresh food, fast delivery</p>
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-16 flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-brand-orange"
            style={{
              animation: `splashDot 0.9s ease-in-out ${i * 0.2}s infinite alternate`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splashPop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes splashDot {
          from { opacity: 0.2; transform: translateY(0); }
          to   { opacity: 1;   transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
