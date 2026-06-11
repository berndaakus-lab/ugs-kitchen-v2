import Link from 'next/link'
import { Instagram, Facebook } from 'lucide-react'

// TikTok doesn't have a lucide icon — using a clean SVG inline
function TikTokIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.16 8.16 0 004.77 1.52V7.03a4.85 4.85 0 01-1-.34z"/>
    </svg>
  )
}

export default function Footer() {
  const instagram = process.env.NEXT_PUBLIC_INSTAGRAM
  const facebook  = process.env.NEXT_PUBLIC_FACEBOOK
  const tiktok    = process.env.NEXT_PUBLIC_TIKTOK
  const year      = new Date().getFullYear()

  return (
    <footer className="bg-brand-dark text-white mt-12">
      <div className="max-w-lg mx-auto px-5 py-8 flex flex-col items-center gap-5">

        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="w-12 h-12 bg-brand-orange rounded-2xl flex items-center justify-center mb-1">
            <span className="text-white font-extrabold text-2xl leading-none">U</span>
          </div>
          <p className="font-extrabold text-lg leading-tight">UGs Kitchen</p>
          <p className="text-xs text-gray-400">Homemade Ghanaian Food, Fast Delivered</p>
        </div>

        {/* Social icons */}
        {(instagram || facebook || tiktok) && (
          <div className="flex items-center gap-4">
            {instagram && (
              <a
                href={`https://instagram.com/${instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-brand-orange transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={18} />
              </a>
            )}
            {facebook && (
              <a
                href={`https://facebook.com/${facebook}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-brand-orange transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={18} />
              </a>
            )}
            {tiktok && (
              <a
                href={`https://tiktok.com/@${tiktok}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-brand-orange transition-colors"
                aria-label="TikTok"
              >
                <TikTokIcon size={18} />
              </a>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="w-full border-t border-white/10" />

        {/* Copyright */}
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-xs text-gray-400">
            &copy; {year} UGs Kitchen. All rights reserved.
          </p>
          <p className="text-xs text-gray-600">
            Powered by{' '}
            <span className="text-brand-orange font-semibold">UGs Kitchen</span>
            {' '}· Built with ❤️ in Ghana
          </p>
          <Link
            href="/admin"
            className="mt-2 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Kitchen Admin ›
          </Link>
        </div>
      </div>
    </footer>
  )
}
