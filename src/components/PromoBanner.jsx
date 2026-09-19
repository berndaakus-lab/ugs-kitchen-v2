import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function useCountdown(endsAt) {
  const [timeLeft, setTimeLeft] = useState(null)

  useEffect(() => {
    if (!endsAt) return
    function calc() {
      const diff = Math.max(0, Math.floor((new Date(endsAt) - Date.now()) / 1000))
      if (diff === 0) { setTimeLeft(null); return }
      const d = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setTimeLeft({ d, h, m, s, diff })
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  return timeLeft
}

function CountdownBlock({ label, value }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-white/20 rounded-lg px-2 py-1 text-white font-extrabold text-lg leading-none min-w-[2rem] text-center">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-white/60 text-[9px] font-bold uppercase mt-0.5">{label}</span>
    </div>
  )
}

export default function PromoBanner() {
  const [promo,   setPromo]   = useState(null)
  const [visible, setVisible] = useState(true)
  const timeLeft = useCountdown(promo?.ends_at)

  useEffect(() => {
    supabase
      .from('promos')
      .select('title, subtitle, code, image, ends_at')
      .eq('active', true)
      .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setPromo(data) })
  }, [])

  // Hide when countdown hits zero
  useEffect(() => {
    if (promo?.ends_at && timeLeft === null && promo) setVisible(false)
  }, [timeLeft, promo])

  if (!promo || !visible) return null

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-1">
      <div className="relative overflow-hidden rounded-3xl shadow-lg"
        style={{ background: 'linear-gradient(135deg, #F38F1D 0%, #c0622a 60%, #7B4A2B 100%)' }}
      >
        {/* Promo image */}
        {promo.image && (
          <div className="relative h-44 w-full">
            <img src={promo.image} alt={promo.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.60) 0%, transparent 55%)' }} />
          </div>
        )}

        {/* Decorative circles (no image only) */}
        {!promo.image && (
          <>
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-20" style={{ background: 'rgba(255,255,255,0.4)' }} />
            <div className="absolute -bottom-8 -left-4 w-36 h-36 rounded-full opacity-10" style={{ background: 'rgba(255,255,255,0.5)' }} />
          </>
        )}

        {/* Shimmer */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)',
            animation: 'shimmer 3s infinite',
          }}
        />

        <div className="relative px-5 py-4">
          {/* Top row: badge + dismiss */}
          <div className="flex items-center justify-between mb-2">
            <span className="bg-white/25 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full tracking-wider uppercase">
              🎉 Limited Offer
            </span>
            <button
              onClick={() => setVisible(false)}
              className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white/80 text-xs font-bold active:bg-white/30"
            >
              ✕
            </button>
          </div>

          {/* Title */}
          <p className="text-white font-extrabold text-xl leading-tight mb-1 drop-shadow">
            {promo.title}
          </p>

          {/* Subtitle */}
          {promo.subtitle && (
            <p className="text-white/85 text-sm leading-snug drop-shadow" style={{ marginBottom: timeLeft ? '12px' : promo.code ? '12px' : '0' }}>
              {promo.subtitle}
            </p>
          )}

          {/* Countdown */}
          {timeLeft && (
            <div className="flex items-end gap-2 mb-3">
              <span className="text-white/70 text-[10px] font-bold uppercase tracking-wider mr-1">Ends in</span>
              {timeLeft.d > 0 && <CountdownBlock label="days" value={timeLeft.d} />}
              <CountdownBlock label="hrs"  value={timeLeft.h} />
              <CountdownBlock label="min"  value={timeLeft.m} />
              <CountdownBlock label="sec"  value={timeLeft.s} />
            </div>
          )}

          {/* Promo code pill */}
          {promo.code && (
            <div className="inline-flex items-center gap-2 bg-white rounded-xl px-4 py-2 shadow-sm">
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Use code</span>
              <span className="text-brand-brown font-extrabold text-base tracking-widest">{promo.code}</span>
            </div>
          )}
        </div>

        <style>{`
          @keyframes shimmer {
            0%   { transform: translateX(-100%); }
            60%  { transform: translateX(100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </div>
  )
}
