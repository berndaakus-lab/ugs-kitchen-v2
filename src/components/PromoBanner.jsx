import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Tag } from 'lucide-react'

export default function PromoBanner() {
  const [promo, setPromo] = useState(null)

  useEffect(() => {
    supabase
      .from('promos')
      .select('title, subtitle, code')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setPromo(data) })
  }, [])

  if (!promo) return null

  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <div className="bg-gradient-to-r from-brand-orange to-brand-brown rounded-2xl px-5 py-4 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <Tag size={20} className="flex-shrink-0 mt-0.5 opacity-80" />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-base leading-tight">{promo.title}</p>
            {promo.subtitle && (
              <p className="text-sm opacity-90 mt-0.5 leading-snug">{promo.subtitle}</p>
            )}
            {promo.code && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1">
                <span className="text-xs font-bold opacity-80">Code:</span>
                <span className="text-sm font-extrabold tracking-widest">{promo.code}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
