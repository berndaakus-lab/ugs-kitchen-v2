import { useState } from 'react'
import { useRouter } from 'next/router'
import { api, homeFor } from '@/lib/client'
import { ErrorText } from '@/components/Layout'

export default function Login() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { user } = await api('auth/login', { method: 'POST', body: { username, pin } })
      router.replace(homeFor(user.role))
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  function press(d) {
    setPin(p => (d === '⌫' ? p.slice(0, -1) : p.length < 6 ? p + d : p))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-2xl font-black text-brand-orange">UGs Kitchen POS</div>
          <div className="text-sm text-gray-500">Staff sign in</div>
        </div>
        <input
          className="input"
          placeholder="Username"
          autoCapitalize="none"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="input text-center tracking-[0.5em]"
          placeholder="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
            d === ''
              ? <span key={i} />
              : <button key={i} type="button" className="btn-ghost text-xl" onClick={() => press(d)}>{d}</button>
          ))}
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full text-lg" disabled={busy || !username || pin.length < 4}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
