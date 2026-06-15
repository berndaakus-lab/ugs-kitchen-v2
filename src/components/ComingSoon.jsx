import { useEffect, useState } from 'react'

const LAUNCH_DATE = new Date('2026-08-01T00:00:00')

function useCountdown(target) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(target))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  return timeLeft
}

function getTimeLeft(target) {
  const diff = target - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function Pad({ n }) {
  return String(n).padStart(2, '0')
}

function CountdownBox({ label, value }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-20 h-20 md:w-24 md:h-24 flex items-center justify-center rounded-2xl text-3xl md:text-4xl font-bold text-white shadow-lg overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
      >
        <span className="relative z-10 tabular-nums">
          <Pad n={value} />
        </span>
        {/* shimmer */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)',
          }}
        />
      </div>
      <span className="mt-2 text-xs md:text-sm font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,220,180,0.9)' }}>
        {label}
      </span>
    </div>
  )
}

// Floating food emoji particles
const EMOJIS = ['🍗', '🍛', '🥘', '🍱', '🫕', '🌶️', '🍖', '🥗']

function Particle({ emoji, style }) {
  return (
    <span className="absolute select-none pointer-events-none text-2xl md:text-3xl animate-float" style={style}>
      {emoji}
    </span>
  )
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  emoji: EMOJIS[i % EMOJIS.length],
  style: {
    left: `${(i * 8.5 + 3) % 100}%`,
    top: `${(i * 13 + 5) % 90}%`,
    animationDelay: `${(i * 0.6).toFixed(1)}s`,
    animationDuration: `${3 + (i % 4)}s`,
    opacity: 0.18 + (i % 5) * 0.04,
  },
}))

export default function ComingSoon() {
  const { days, hours, minutes, seconds } = useCountdown(LAUNCH_DATE)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(8deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .animate-float { animation: float ease-in-out infinite; }
        .fade-up {
          opacity: 0;
          animation: fadeUp 0.7s ease forwards;
        }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.25s; }
        .fade-up-3 { animation-delay: 0.4s; }
        .fade-up-4 { animation-delay: 0.6s; }
        .fade-up-5 { animation-delay: 0.8s; }
        .shimmer-text {
          background: linear-gradient(90deg, #ffcc88, #fff5e0, #ffaa44, #fff5e0, #ffcc88);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      <div
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4"
        style={{
          background: 'linear-gradient(135deg, #2a1200 0%, #4a1e00 35%, #663300 65%, #3d1800 100%)',
        }}
      >
        {/* Floating particles */}
        {PARTICLES.map((p, i) => (
          <Particle key={i} {...p} />
        ))}

        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,140,0,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className={`relative z-10 flex flex-col items-center text-center max-w-xl w-full transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>

          {/* Logo / icon ring */}
          <div className="relative mb-6 fade-up fade-up-1">
            <div
              className="w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center text-5xl md:text-6xl shadow-2xl"
              style={{ background: 'linear-gradient(145deg, #ff9900, #cc5500)' }}
            >
              🍽️
            </div>
            {/* pulse rings */}
            {[0, 0.4, 0.8].map((delay, i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border-2 border-orange-400"
                style={{
                  animation: `pulse-ring 2.2s ease-out ${delay}s infinite`,
                }}
              />
            ))}
          </div>

          {/* Brand name */}
          <h1
            className="text-5xl md:text-7xl font-black tracking-tight mb-1 fade-up fade-up-1 shimmer-text"
          >
            UGs Kitchen
          </h1>

          <p
            className="text-base md:text-lg font-medium mb-2 fade-up fade-up-2"
            style={{ color: 'rgba(255,200,130,0.85)' }}
          >
            Authentic flavours. Fresh every day.
          </p>

          {/* Divider */}
          <div
            className="w-16 h-1 rounded-full mb-8 fade-up fade-up-2"
            style={{ background: 'linear-gradient(90deg, transparent, #ff9900, transparent)' }}
          />

          {/* Coming Soon heading */}
          <h2
            className="text-2xl md:text-3xl font-bold mb-2 fade-up fade-up-3"
            style={{ color: '#ffe8c0' }}
          >
            Something delicious is coming
          </h2>
          <p
            className="text-sm md:text-base mb-10 fade-up fade-up-3"
            style={{ color: 'rgba(255,210,150,0.7)' }}
          >
            Our online ordering platform is getting ready. Stay tuned!
          </p>

          {/* Countdown */}
          <div className="flex gap-4 md:gap-6 mb-10 fade-up fade-up-4">
            <CountdownBox label="Days"    value={days}    />
            <CountdownBox label="Hours"   value={hours}   />
            <CountdownBox label="Minutes" value={minutes} />
            <CountdownBox label="Seconds" value={seconds} />
          </div>

          {/* Social / contact nudge */}
          <p
            className="text-sm fade-up fade-up-5"
            style={{ color: 'rgba(255,200,130,0.6)' }}
          >
            Questions? Reach us at{' '}
            <a
              href="mailto:hello@ugskitchen.com"
              className="underline underline-offset-2 hover:text-orange-300 transition-colors"
              style={{ color: 'rgba(255,200,130,0.9)' }}
            >
              hello@ugskitchen.com
            </a>
          </p>
        </div>

        {/* Bottom watermark */}
        <p
          className="absolute bottom-4 text-xs fade-up fade-up-5"
          style={{ color: 'rgba(255,200,130,0.3)' }}
        >
          © {new Date().getFullYear()} UGs Kitchen. All rights reserved.
        </p>
      </div>
    </>
  )
}
