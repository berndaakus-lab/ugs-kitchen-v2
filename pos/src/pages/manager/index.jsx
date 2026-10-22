import { useCallback, useEffect, useState } from 'react'
import Layout, { ErrorText, Stat, StatusBadge } from '@/components/Layout'
import VoidModal from '@/components/VoidModal'
import { api, ghs, time, METHOD_LABEL, shownMethods, useBranchEvents, useMe } from '@/lib/client'

const ROLES = ['manager']
const todayStr = () => new Date().toISOString().slice(0, 10)
const CHANNELS = [['all', 'All sales'], ['walk_in', 'Walk-in'], ['online', 'Online']]

export default function Manager() {
  const [me] = useMe(ROLES)
  const [date, setDate] = useState(todayStr)
  const [channel, setChannel] = useState('all')
  const [scope, setScope] = useState('branch') // admin only: 'branch' | 'all'
  const [data, setData] = useState(null)
  const [sales, setSales] = useState([])
  const [voiding, setVoiding] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [summary, list] = await Promise.all([
        api(`manager/summary?date=${date}&scope=${scope}`),
        api(`manager/sales?date=${date}&channel=${channel}&scope=${scope}`),
      ])
      setData(summary)
      setSales(list.sales)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [date, channel, scope])

  useEffect(() => { if (me) load() }, [me, load])
  // Walk-in changes arrive by broadcast; online orders (and other branches) by the poll.
  useBranchEvents(date === todayStr() ? me?.user.branch_id : null, () => load(), 15000)

  const s = data?.summary
  const allBranches = scope === 'all'

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black">Sales overview</h1>
          {me?.user.role === 'admin' && (
            <div className="flex gap-1">
              {[['branch', me.user.branch_name], ['all', 'All branches']].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setScope(k)}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${scope === k ? 'bg-brand-orange text-white' : 'bg-brand-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <input type="date" className="input ml-auto w-auto py-2 text-base" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>

        {s && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="All channels" value={ghs(s.combined)} tone="bg-brand-dark text-white [&_div]:text-white" />
              <Stat label={`Walk-in (${s.walk_in.sales_count})`} value={ghs(s.walk_in.gross)} tone="bg-white" />
              <Stat label={`Online (${s.online.orders_count})`} value={ghs(s.online.total)} tone="bg-white" />
              <Stat label={`Voids (${s.walk_in.voids.count})`} value={ghs(s.walk_in.voids.total)} tone="bg-white" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="card">
                <h2 className="mb-2 font-black">Walk-in by payment</h2>
                {shownMethods(s.walk_in.by_method).map(([m, v]) => (
                  <div key={m} className="flex justify-between border-b py-1 text-sm"><span>{METHOD_LABEL[m]}</span><b>{ghs(v)}</b></div>
                ))}
                {s.walk_in.unserved.length > 0 && (
                  <div className="mt-2 text-sm text-amber-800">Unserved: {s.walk_in.unserved.join(', ')}</div>
                )}
              </div>
              <div className="card">
                <h2 className="mb-2 font-black">Cashiers</h2>
                {s.cashiers.map(c => (
                  <div key={c.id} className="flex justify-between border-b py-1 text-sm"><span>{c.name} ({c.sales_count})</span><b>{ghs(c.total)}</b></div>
                ))}
                <h2 className="mb-2 mt-4 font-black">Servers</h2>
                {s.servers.map(sv => (
                  <div key={sv.id} className="flex justify-between border-b py-1 text-sm"><span>{sv.name}</span><b>{sv.ticket_count} tickets · {sv.item_count} items</b></div>
                ))}
              </div>
              <div className="card">
                <h2 className="mb-2 font-black">Shifts</h2>
                {data.shifts.map(sh => (
                  <div key={sh.id} className="border-b py-1 text-sm">
                    <div className="flex justify-between">
                      <span>{time(sh.opened_at)}–{sh.closed_at ? time(sh.closed_at) : 'open'}</span>
                      {sh.variance != null && (
                        <b className={Number(sh.variance) < 0 ? 'text-red-600' : 'text-green-700'}>{ghs(sh.variance)}</b>
                      )}
                    </div>
                  </div>
                ))}
                {!data.shifts.length && <div className="text-sm text-gray-400">No shifts.</div>}
              </div>
            </div>

            <div className="card">
              <h2 className="mb-2 font-black">Top walk-in items</h2>
              <div className="grid gap-x-6 text-sm sm:grid-cols-2">
                {s.walk_in.items.slice(0, 10).map(i => (
                  <div key={i.name} className="flex justify-between border-b py-1"><span>{i.qty} × {i.name}</span><b>{ghs(i.amount)}</b></div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-black">Every sale</h2>
            <div className="ml-auto flex gap-1">
              {CHANNELS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setChannel(k)}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${channel === k ? 'bg-brand-dark text-white' : 'bg-brand-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y">
            {sales.map(row => (
              <div key={`${row.channel}-${row.pos_sale_id || row.sale_ref}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${row.channel === 'online' ? 'bg-sky-100 text-sky-800' : 'bg-brand-muted text-brand-brown'}`}>
                  {row.channel === 'online' ? 'Online' : 'Walk-in'}
                </span>
                <span className="w-20 font-black">{row.channel === 'online' ? `#${String(row.sale_ref).slice(-6)}` : row.sale_ref}</span>
                <span className="text-gray-500">{time(row.sold_at)}</span>
                {allBranches && <span className="w-24 truncate font-semibold">{row.branch_name}</span>}
                <span className="w-28 truncate">{row.customer}</span>
                <StatusBadge status={row.status} />
                <span className="hidden flex-1 truncate text-gray-500 md:block">
                  {(row.items || []).map(i => `${i.quantity}× ${i.name}`).join(', ')}
                </span>
                <span className="ml-auto text-xs text-gray-500">{row.payment && (METHOD_LABEL[row.payment] || row.payment)}</span>
                <b className={row.status === 'voided' ? 'text-gray-400 line-through' : ''}>{ghs(row.total)}</b>
                {!allBranches && row.channel === 'walk_in' && row.status === 'paid' && (
                  <button
                    className="text-xs font-bold text-red-600"
                    onClick={() => setVoiding({ id: row.pos_sale_id, ticket_no: row.sale_ref, total: row.total })}
                  >
                    Void
                  </button>
                )}
              </div>
            ))}
            {!sales.length && <div className="py-6 text-center text-gray-400">No sales for this day.</div>}
          </div>
        </div>
      </div>
      {voiding && <VoidModal sale={voiding} onClose={() => setVoiding(null)} onVoided={load} />}
    </Layout>
  )
}
