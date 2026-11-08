import { useState } from 'react'
import { X, Phone, User, LogIn, UserPlus, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

export default function AuthModal({ onClose }) {
  const { requestCode, verifyCode, signInByCredentials } = useAuth()
  const [tab,          setTab]          = useState('signin') // 'signin' | 'credentials' | 'signup'
  const [name,         setName]         = useState('')
  const [phone,        setPhone]        = useState('')
  const [username,     setUsername]     = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Forgot password state
  const [showForgot,   setShowForgot]   = useState(false)
  const [fpPhone,      setFpPhone]      = useState('')
  const [fpLoading,    setFpLoading]    = useState(false)
  const [fpDone,       setFpDone]       = useState(false)
  const [fpError,      setFpError]      = useState('')

  // Phone sign-in and sign-up send a 6-digit code by SMS first.
  const [codeSent,     setCodeSent]     = useState(false)
  const [code,         setCode]         = useState('')

  function switchTab(t) { setTab(t); setError(''); setCodeSent(false); setCode('') }

  // Step 1 sends the code; step 2 checks it. Used by both phone tabs.
  async function handlePhoneStep(mode) {
    setError(''); setLoading(true)
    const result = codeSent
      ? await verifyCode(phone, code)
      : await requestCode(phone, mode, name)
    setLoading(false)
    if (result.error) return setError(result.error)
    if (!codeSent) { setCodeSent(true); return }
    onClose()
  }

  async function resendCode(mode) {
    setError(''); setCode(''); setLoading(true)
    const result = await requestCode(phone, mode, name)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  function handleSignIn(e) {
    e.preventDefault()
    handlePhoneStep('signin')
  }

  async function handleCredentials(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const result = await signInByCredentials(username, password)
    setLoading(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  function handleSignUp(e) {
    e.preventDefault()
    handlePhoneStep('signup')
  }

  // The code box shown under the phone number once an SMS has been sent.
  const codeBox = mode => codeSent && (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Code from SMS</label>
      <input type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
        value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="6-digit code"
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-brand-orange transition-colors"
      />
      <p className="text-[11px] text-gray-400 mt-1">
        We sent a code to {phone}.{' '}
        <button type="button" onClick={() => resendCode(mode)} disabled={loading} className="text-brand-orange font-semibold">Send again</button>
        {' · '}
        <button type="button" onClick={() => { setCodeSent(false); setCode(''); setError('') }} className="text-brand-orange font-semibold">Change number</button>
      </p>
    </div>
  )

  async function handleForgotPassword(e) {
    e.preventDefault()
    setFpError(''); setFpLoading(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: fpPhone.replace(/\s/g, '') }),
      })
      if (!res.ok) throw new Error('Something went wrong.')
      setFpDone(true)
    } catch (err) {
      setFpError(err.message)
    }
    setFpLoading(false)
  }

  // ── Forgot password screen ────────────────────────────────────
  if (showForgot) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-fade-in">
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => { setShowForgot(false); setFpDone(false); setFpPhone(''); setFpError('') }}
              className="w-9 h-9 rounded-full bg-brand-muted flex items-center justify-center"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2 className="text-xl font-extrabold text-brand-dark">Reset Password</h2>
              <p className="text-xs text-gray-400 mt-0.5">We'll SMS your new password</p>
            </div>
          </div>

          {fpDone ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Phone size={28} className="text-green-500" />
              </div>
              <p className="font-extrabold text-brand-dark text-lg">SMS Sent!</p>
              <p className="text-sm text-gray-500 mt-2">
                If an account exists for that number, your new password has been sent via SMS.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Sign in using the <strong>Username</strong> tab with your new password.
              </p>
              <button
                onClick={() => { setShowForgot(false); setFpDone(false); setFpPhone(''); switchTab('credentials') }}
                className="mt-5 w-full bg-brand-brown text-white font-extrabold rounded-2xl py-3 text-sm"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel" inputMode="numeric"
                    value={fpPhone} onChange={e => setFpPhone(formatPhone(e.target.value))}
                    placeholder="024 XXX XXXX"
                    className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Enter the phone number linked to your account
                </p>
              </div>

              {fpError && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3">{fpError}</p>}

              <button
                type="submit" disabled={fpLoading}
                className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base disabled:opacity-60"
              >
                {fpLoading ? 'Sending…' : 'Send New Password via SMS'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ── Main auth modal ───────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-extrabold text-brand-dark">
              {tab === 'signup' ? 'Create Account' : 'Welcome Back 👋'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tab === 'signup'
                ? 'Save your details for faster ordering'
                : 'Sign in to view your order history'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-brand-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-brand-muted rounded-xl p-1 mb-5 gap-1">
          <button onClick={() => switchTab('signin')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'signin' ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500'}`}>
            Phone
          </button>
          <button onClick={() => switchTab('credentials')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'credentials' ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500'}`}>
            Username
          </button>
          <button onClick={() => switchTab('signup')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'signup' ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500'}`}>
            Sign Up
          </button>
        </div>

        {/* Phone sign-in */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="tel" inputMode="numeric" readOnly={codeSent}
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="024 XXX XXXX"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Valid 10-digit Ghana number</p>
            </div>
            {codeBox('signin')}
            {error && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base disabled:opacity-60">
              <LogIn size={18} /> {loading ? (codeSent ? 'Checking…' : 'Sending code…') : codeSent ? 'Sign In' : 'Send me a code'}
            </button>
          </form>
        )}

        {/* Username + password sign-in */}
        {tab === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. kwame456"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Password</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-10 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Use the credentials shown after your first order
              </p>
            </div>
            {error && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base disabled:opacity-60">
              <KeyRound size={18} /> {loading ? 'Signing in…' : 'Sign In'}
            </button>
            {/* Forgot password link */}
            <p className="text-center text-xs text-gray-400">
              Forgot your password?{' '}
              <button type="button" onClick={() => setShowForgot(true)}
                className="text-brand-orange font-semibold">
                Reset via SMS
              </button>
            </p>
          </form>
        )}

        {/* Sign up */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Your Name</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={name} readOnly={codeSent} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Kwame Mensah"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold outline-none focus:border-brand-orange transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="tel" inputMode="numeric" readOnly={codeSent}
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="024 XXX XXXX"
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-brand-orange transition-colors"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Valid 10-digit Ghana number</p>
            </div>
            {codeBox('signup')}
            {error && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-brown text-white font-extrabold rounded-2xl py-4 text-base disabled:opacity-60">
              <UserPlus size={18} /> {loading ? (codeSent ? 'Creating…' : 'Sending code…') : codeSent ? 'Create Account' : 'Send me a code'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Just ordering?{' '}
          <button onClick={onClose} className="text-brand-orange font-semibold">Continue as guest</button>
        </p>
      </div>
    </div>
  )
}
