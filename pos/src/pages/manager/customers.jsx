import { useCallback, useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'
import Layout, { ErrorText, Stat } from '@/components/Layout'
import { api, ghs, dateTime, useMe } from '@/lib/client'

const ROLES = ['manager']

// Walk-in customers captured at the till. Only those who agreed (opted in)
// may receive promo SMS; the export contains only them.
export default function Customers() {
  const [me] = useMe(ROLES)
  const [q, setQ] = useState('')
  const [optedOnly, setOptedOnly] = useState(false)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { customers } = await api(`manager/customers?q=${encodeURIComponent(q)}&opted=${optedOnly ? 1 : 0}`)
      setRows(customers)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [q, optedOnly])

  useEffect(() => {
    if (!me) return
    const t = setTimeout(load, 300) // wait for typing to pause
    return () => clearTimeout(t)
  }, [me, load])

  async function optOut(c) {
    if (!confirm(`Stop promo messages to ${c.name || c.phone}?`)) return
    await api('manager/customers', { method: 'POST', body: { id: c.id, opt_in: false } }).catch(e => setError(e.message))
    load()
  }

  async function exportOptedIn() {
    const { customers } = await api('manager/customers?opted=1')
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['phone', 'name', 'agreed_at', 'visits', 'spent_ghs', 'last_visit'].join(','),
      ...customers.map(c => [c.phone, c.name, c.opt_in_at, c.visits, c.spent, c.last_seen_at].map(cell).join(',')),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `ugs-promo-customers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const opted = rows?.filter(c => c.marketing_opt_in).length ?? 0

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black">Customers</h1>
          <button className="btn-ghost ml-auto px-3 py-2 text-sm" onClick={exportOptedIn}>
            <Download size={16} /> Export promo list (CSV)
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Walk-in customers who gave their number at the till. Only customers who agreed to offers may be sent promo SMS.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Shown" value={rows?.length ?? '—'} tone="bg-white" />
          <Stat label="Agreed to offers" value={opted} tone="bg-white" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input py-2 pl-10 text-base" placeholder="Search name or phone" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4" checked={optedOnly} onChange={e => setOptedOnly(e.target.checked)} />
            Agreed to offers only
          </label>
        </div>
        <ErrorText>{error}</ErrorText>

        <div className="card divide-y p-0">
          {rows?.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{c.name || 'No name'}</div>
                <div className="text-gray-500">{c.phone}</div>
              </div>
              <div className="text-gray-600">{c.visits} visit{c.visits === 1 ? '' : 's'} · {ghs(c.spent)}</div>
              <div className="w-full text-xs text-gray-500 sm:w-auto">Last visit {dateTime(c.last_seen_at)}</div>
              {c.marketing_opt_in ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Gets offers</span>
                  <button className="text-xs font-semibold text-red-600" onClick={() => optOut(c)}>Stop</button>
                </div>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">No offers</span>
              )}
            </div>
          ))}
          {rows && !rows.length && <div className="p-6 text-center text-gray-400">No customers yet.</div>}
          {!rows && <div className="p-6 text-center text-gray-400">Loading…</div>}
        </div>
      </div>
    </Layout>
  )
}
