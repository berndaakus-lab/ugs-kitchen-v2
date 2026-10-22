import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { LogOut } from 'lucide-react'
import { api } from '@/lib/client'

const NAV = {
  cashier: [['/cashier', 'Sell'], ['/shift', 'My shift']],
  server:  [['/server', 'Serve'], ['/shift', 'My report']],
  manager: [['/manager', 'Today'], ['/cashier', 'Sell'], ['/server', 'Serve'], ['/shift', 'My shift'], ['/manager/staff', 'Staff']],
}
NAV.admin = NAV.manager

// Admin works across branches: every active branch from the online app is listed.
function BranchSwitcher({ me }) {
  const [branches, setBranches] = useState([])
  useEffect(() => { api('branches').then(r => setBranches(r.branches)).catch(() => {}) }, [])

  async function change(e) {
    await api('auth/branch', { method: 'POST', body: { branch_id: e.target.value } })
    window.location.reload()
  }

  return (
    <select
      value={me.user.branch_id}
      onChange={change}
      className="rounded-lg bg-white/10 px-2 py-1.5 text-sm font-semibold text-white"
      aria-label="Branch"
    >
      {branches.map(b => <option key={b.id} value={b.id} className="text-black">{b.name}</option>)}
    </select>
  )
}

export default function Layout({ me, children, right }) {
  const router = useRouter()

  async function logout() {
    await api('auth/logout', { method: 'POST' }).catch(() => {})
    router.replace('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 bg-brand-dark px-4 py-2 text-white">
        <div className="font-black text-brand-orange">UGs POS</div>
        {me && (me.user.role === 'admin'
          ? <BranchSwitcher me={me} />
          : <div className="text-sm text-white/70">{me.user.branch_name}</div>)}
        <nav className="flex gap-1">
          {me && NAV[me.user.role].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${router.pathname === href ? 'bg-white/15' : 'hover:bg-white/10'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {right}
          {me && <span className="text-sm">{me.user.name} · <span className="capitalize text-white/70">{me.user.role}</span></span>}
          <button onClick={logout} className="rounded-lg p-2 hover:bg-white/10" aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </header>
      <main className="flex-1">{me ? children : <div className="p-8 text-center text-gray-400">Loading…</div>}</main>
    </div>
  )
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`card max-h-[90vh] w-full overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          {onClose && <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-black">×</button>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorText({ children }) {
  return children ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{children}</div> : null
}

export function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-xl p-3 ${tone || 'bg-brand-cream'}`}>
      <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
      <div className="text-xl font-black">{value}</div>
    </div>
  )
}

export const STATUS_STYLE = {
  preparing:        'bg-orange-100 text-orange-800',
  ready:            'bg-teal-100 text-teal-800',
  delivered:        'bg-green-100 text-green-800',
  pending_payment:  'bg-yellow-100 text-yellow-800',
  paid:             'bg-blue-100 text-blue-800',
  partially_served: 'bg-purple-100 text-purple-800',
  served:           'bg-green-100 text-green-800',
  voided:           'bg-red-100 text-red-700',
  failed:           'bg-gray-200 text-gray-600',
}

export function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[status] || ''}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
