import { useState } from 'react'
import { X, Phone, User, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

export default function AuthModal({ onClose }) {
  const { signInByPhone, signUp } = useAuth()
  const [tab,     setTab]    = useState('signin') // 'signin' | 'signup'
  const [name,    setName]   = useState('')
  const [phone,   setPhone]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]  = useState('')

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await signInByPhone(phone.replace(/\s/g, ''))
    setLoading(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await signUp(name, phone.replace(/\s/g, ''))
    setLoading(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-extrabold text-brand-dark">
              {tab === 'signin' ? 'Welcome Back 👋' : 'Create Account'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tab === 'signin'
                ? 'Sign in to view your order history'
                : 'Save your details for faster ordering'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-brand-muted flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-brand-muted rounded-xl p-1 mb-5">
          <button
            onClick={() => { setTab('signin'); setError('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors
              ${tab === 'signin' ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setError('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors
              ${tab === 'signup' ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500'}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">

          {/* Name — only on signup */}
          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Your Name
              </label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Kwame Mensah"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
                />
              </div>
            </div>
          )}

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Phone Number
            </label>
            <div className="relative">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="024 XXX XXXX"
                className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Must be a valid 10-digit Ghana number (MTN, Vodafone, AirtelTigo)
            </p>
          </div>

          {error && (
            <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3 animate-fade-in">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base active:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {tab === 'signin'
              ? <><LogIn size={18} /> {loading ? 'Signing in…' : 'Sign In'}</>
              : <><UserPlus size={18} /> {loading ? 'Creating…' : 'Create Account'}</>
            }
          </button>
        </form>

        {/* Skip note */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Just ordering?{' '}
          <button onClick={onClose} className="text-brand-orange font-semibold">
            Continue as guest
          </button>
        </p>
      </div>
    </div>
  )
}
