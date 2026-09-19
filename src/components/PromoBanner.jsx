import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function PromoBanner() {
  const [promo, setPromo] = useState(null)
  const [visible, setVisible] = useState(true)

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
            {/* Dark overlay so text on top is readable */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)' }} />
          </div>
        )}

        {/* Decorative circles (only when no image) */}
        {!promo.image && (
          <>
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-20"
              style={{ background: 'rgba(255,255,255,0.4)' }} />
            <div className="absolute -bottom-8 -left-4 w-36 h-36 rounded-full opacity-10"
              style={{ background: 'rgba(255,255,255,0.5)' }} />
          </>
        )}

        {/* Shimmer strip */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)',
            animation: 'shimmer 3s infinite',
          }}
        />

        <div className={`relative px-5 py-4 ${promo.image ? 'mt-0' : ''}`}>
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
            <p className="text-white/85 text-sm leading-snug mb-3 drop-shadow">
              {promo.subtitle}
            </p>
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
