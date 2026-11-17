import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { FileSpreadsheet, Printer, RefreshCw } from 'lucide-react'
import Layout, { ErrorText } from '@/components/Layout'
import { TABS, filterSummary } from '@/components/ReportSections'
import { api, can, useMe } from '@/lib/client'

// Owner dashboard & reports (Module 4): sales, dishes, stock, cash and staff
// for any period, walk-in and online together. Filters live in the address,
// so a report can be bookmarked, and the print page gets the same ones.
const PERMS = ['reports']

const todayStr = () => new Date().toISOString().slice(0, 10) // Ghana = UTC
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
function presetRange(p) {
  const t = todayStr()
  const dt = new Date(`${t}T00:00:00Z`)
  if (p === 'yesterday') return [shift(t, -1), shift(t, -1)]
  if (p === 'week') return [shift(t, -((dt.getUTCDay() + 6) % 7)), t]
  if (p === 'month') return [`${t.slice(0, 7)}-01`, t]
  if (p === 'last_month') {
    const end = shift(`${t.slice(0, 7)}-01`, -1)
    return [`${end.slice(0, 7)}-01`, end]
  }
  return [t, t]
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['custom', 'Pick dates']]

const DEFAULTS = { period: 'today', from: '', to: '', branch: '', channel: '', method: '', staff: '' }

function reportQuery(f) {
  const [from, to] = f.period === 'custom' ? [f.from || todayStr(), f.to || f.from || todayStr()] : presetRange(f.period)
  const q = new URLSearchParams({ from, to })
  for (const k of ['branch', 'channel', 'method', 'staff']) if (f[k]) q.set(k, f[k])
  return q.toString()
}

export default function Reports() {
  const [me] = useMe(PERMS)
  const router = useRouter()
  const [f, setF] = useState(null)
  const [tab, setTab] = useState('overview')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Start from the address (bookmarks, back button).
  useEffect(() => {
    if (!router.isReady || f) return
    const q = router.query
    setF({ ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).filter(k => q[k]).map(k => [k, String(q[k])])) })
    if (q.tab && TABS.some(([k]) => k === q.tab)) setTab(String(q.tab))
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => (f ? reportQuery(f) : null), [f])

  async function load() {
    setLoading(true)
    try {
      const { report } = await api(`reports/dashboard?${query}`)
      setReport(report)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!me || !query) return
    const keep = Object.fromEntries(Object.entries(f).filter(([k, v]) => v && v !== DEFAULTS[k] && (f.period === 'custom' || !['from', 'to'].includes(k))))
    router.replace({ pathname: router.pathname, query: { ...keep, ...(tab !== 'overview' ? { tab } : {}) } }, undefined, { shallow: true })
    load()
  }, [me, query]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickTab(k) {
    setTab(k)
    router.replace({ pathname: router.pathname, query: { ...router.query, tab: k } }, undefined, { shallow: true })
  }

  const set = patch => setF(prev => ({ ...prev, ...patch }))
  const user = me?.user
  const exportOk = user && can(user, 'export')
  const Section = TABS.find(([k]) => k === tab)?.[2]

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-black">Reports</h1>
            {report && <p className="text-sm text-gray-500">{filterSummary(report)}</p>}
          </div>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost px-3 py-2" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {exportOk && query && (
              <>
                <a className="btn-ghost px-3 py-2 text-sm" href={`/api/pos/reports/export?${query}`}>
                  <FileSpreadsheet size={18} /> Excel
                </a>
                <a className="btn-dark px-3 py-2 text-sm" href={`/manager/reports/print?${query}`} target="_blank" rel="noreferrer">
                  <Printer size={18} /> PDF / Print
                </a>
              </>
            )}
          </div>
        </div>

        {f && (
          <div className="card space-y-3">
            <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
              {PRESETS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => set(k === 'custom' && !f.from ? { period: k, from: presetRange(f.period)[0], to: presetRange(f.period)[1] } : { period: k })}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold ${f.period === k ? 'bg-brand-orange text-white' : 'bg-brand-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {f.period === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">From
                  <input type="date" className="input w-auto py-2 text-base" value={f.from} max={todayStr()} onChange={e => set({ from: e.target.value })} />
                </label>
                <label className="flex items-center gap-2">to
                  <input type="date" className="input w-auto py-2 text-base" value={f.to} min={f.from} max={todayStr()} onChange={e => set({ to: e.target.value })} />
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {user?.scopeAll ? (
                <Select label="Branch" value={f.branch} onChange={v => set({ branch: v })}
                  options={[['', 'All branches'], ...(report?.branches || []).map(b => [b.id, b.name])]} />
              ) : (
                <div className="text-sm">
                  <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Branch</div>
                  <div className="rounded-xl bg-brand-cream px-3 py-2 font-semibold">{user?.branch_name}</div>
                </div>
              )}
              <Select label="Sales" value={f.channel} onChange={v => set({ channel: v })}
                options={[['', 'Walk-in and online'], ['walk_in', 'Walk-in only'], ['online', 'Online only']]} />
              <Select label="Payment" value={f.method} onChange={v => set({ method: v })}
                options={[['', 'All payments'], ['cash', 'Cash'], ['momo', 'MoMo'], ['card', 'Card']]} />
              <Select label="Staff" value={f.staff} onChange={v => set({ staff: v })}
                options={[['', 'Everyone'], ...(report?.staff_options || []).map(s => [s.id, s.name]),
                  ...(f.staff && report && !report.staff_options.some(s => s.id === f.staff) ? [[f.staff, 'Selected person']] : [])]} />
            </div>
            {f.staff && <p className="text-xs text-gray-500">With one person picked, sales are only the walk-in sales they took (online orders have no cashier).</p>}
          </div>
        )}

        <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => pickTab(k)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === k ? 'bg-brand-dark text-white' : 'bg-white shadow-sm'}`}>
              {label}
            </button>
          ))}
        </div>

        <ErrorText>{error}</ErrorText>
        {!report && !error && <div className="card py-10 text-center text-gray-400">Loading…</div>}
        {report && Section && <div className={loading ? 'opacity-60 transition' : ''}><Section r={report} /></div>}
      </div>
    </Layout>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="min-w-0 text-sm">
      <div className="mb-1 text-xs font-semibold uppercase text-gray-500">{label}</div>
      <select className="w-full rounded-xl border border-brand-muted bg-white px-3 py-2 font-semibold outline-none focus:border-brand-orange" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
