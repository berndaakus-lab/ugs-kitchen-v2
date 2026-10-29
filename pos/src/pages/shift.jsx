import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import Layout, { ErrorText, Stat } from '@/components/Layout'
import { usePrinter } from '@/components/Print'
import { api, ghs, dateTime, time, METHOD_LABEL, shownMethods, hasRole, userRoles, useMe } from '@/lib/client'

export default function Shift() {
  const [me, reloadMe] = useMe()
  const { print, slip } = usePrinter()

  return (
    <Layout me={me}>
      {/* Someone who is both cashier and server sees both: their cash shift and what they served. */}
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {me && hasRole(me.user, 'cashier') && <CashierShift me={me} reloadMe={reloadMe} print={print} />}
        {me && userRoles(me.user).includes('server') && <ServerReport print={print} />}
      </div>
      {slip}
    </Layout>
  )
}

function CashierShift({ me, reloadMe, print }) {
  const [report, setReport] = useState(null)
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (me?.shift) api(`shifts/${me.shift.id}/report`).then(r => setReport(r.report)).catch(e => setError(e.message))
  }, [me?.shift?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function close(e) {
    e.preventDefault()
    if (!confirm('Close your shift? You will need to open a new one to keep selling.')) return
    setBusy(true)
    setError('')
    try {
      const { report: z } = await api('shifts/close', { method: 'POST', body: { counted_cash: Number(counted), notes } })
      setReport(z)
      print('zreport', z)
      reloadMe()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!report) {
    return (
      <div className="card space-y-2 text-center text-gray-500">
        {error
          ? <ErrorText>{error}</ErrorText>
          : me?.shift ? 'Loading…' : <>No open shift. <a href="/cashier" className="font-bold text-brand-orange">Open one on the Sell screen.</a></>}
      </div>
    )
  }

  const closed = Boolean(report.shift.closed_at)
  return (
    <>
      {me?.shift?.elsewhere && !closed && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          This shift was opened at {me.shift.branch_name}. Count that branch's drawer when you close it.
        </div>
      )}
      <ReportCard report={report} />
      <button className="btn-ghost" onClick={() => print('zreport', report)}><Printer size={18} /> Print {closed ? 'Z' : 'X'}-report</button>

      {!closed && (
        <form onSubmit={close} className="card space-y-3">
          <h2 className="text-lg font-black">Close shift</h2>
          <p className="text-sm text-gray-600">Count all cash in the drawer (including the opening float).</p>
          <input
            className="input text-xl font-bold" type="number" min="0" step="0.01" inputMode="decimal"
            placeholder="Counted cash" value={counted} onChange={e => setCounted(e.target.value)}
          />
          {counted !== '' && (
            <div className="text-sm">
              Variance: <b className={Number(counted) - report.expected_cash < 0 ? 'text-red-600' : 'text-green-700'}>
                {ghs(Number(counted) - report.expected_cash)}
              </b>
            </div>
          )}
          <input className="input" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <button className="btn-dark w-full" disabled={busy || counted === ''}>{busy ? 'Closing…' : 'Close shift & print Z-report'}</button>
        </form>
      )}
    </>
  )
}

function ReportCard({ report }) {
  const s = report.shift
  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-black">{s.closed_at ? 'Shift closed' : 'Current shift'}</h2>
        <span className="text-sm text-gray-500">Opened {dateTime(s.opened_at)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sales" value={report.sales_count} />
        <Stat label="Gross" value={ghs(report.gross)} />
        <Stat label="Expected cash" value={ghs(report.expected_cash)} />
        <Stat label={`Voids (${report.voids.count})`} value={ghs(report.voids.total)} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 text-sm">
        {shownMethods(report.by_method).map(([m, v]) => (
          <div key={m} className="flex justify-between border-b py-1"><span>{METHOD_LABEL[m]}</span><b>{ghs(v)}</b></div>
        ))}
        <div className="flex justify-between border-b py-1"><span>Opening float</span><b>{ghs(s.opening_float)}</b></div>
        {s.counted_cash != null && <div className="flex justify-between border-b py-1"><span>Counted / variance</span><b>{ghs(s.counted_cash)} / {ghs(s.variance)}</b></div>}
      </div>
      {report.unserved.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900">Not yet served: {report.unserved.join(', ')}</div>
      )}
      <SalesList sales={report.sales || []} />
    </div>
  )
}

// Every sale in the shift, so the cashier/manager can check each one, not just the totals.
function SalesList({ sales }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-black">Sales in this shift ({sales.length})</h3>
      <div className="max-h-[50vh] overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-brand-cream text-left text-xs uppercase text-gray-500">
            <tr><th className="p-2">Ticket</th><th className="p-2">Time</th><th className="p-2">Items</th><th className="p-2">Paid by</th><th className="p-2 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y">
            {sales.map(s => {
              const voided = s.status === 'voided'
              return (
                <tr key={s.ticket_no + s.at} className={voided ? 'text-gray-400' : ''}>
                  <td className="whitespace-nowrap p-2 font-bold">{s.ticket_no}</td>
                  <td className="whitespace-nowrap p-2">{time(s.at)}</td>
                  <td className="p-2">{s.items.map(i => `${i.qty}× ${i.name}`).join(', ')}{voided && <span className="ml-1 font-bold text-red-600">VOIDED</span>}</td>
                  <td className="whitespace-nowrap p-2">{s.methods.map(m => METHOD_LABEL[m] || m).join(' + ') || '—'}</td>
                  <td className={`whitespace-nowrap p-2 text-right font-bold ${voided ? 'line-through' : ''}`}>{ghs(s.total)}</td>
                </tr>
              )
            })}
            {!sales.length && <tr><td colSpan={5} className="p-4 text-center text-gray-400">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServerReport({ print }) {
  const [report, setReport] = useState(null)
  useEffect(() => { api('reports/served').then(r => setReport(r.report)) }, [])
  if (!report) return <div className="card text-gray-400">Loading…</div>

  return (
    <>
      <div className="card space-y-3">
        <h2 className="text-lg font-black">What I served today</h2>
        <p className="text-sm text-gray-600">Count your collected paper tickets — they should match the ticket count below.</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Tickets" value={report.ticket_count} />
          <Stat label="Items" value={report.item_count} />
        </div>
        <div className="text-sm">
          {report.items.map(i => <div key={i.name} className="flex justify-between border-b py-1"><span>{i.name}</span><b>{i.qty}</b></div>)}
        </div>
        <h3 className="text-sm font-black">Tickets served ({report.tickets.length})</h3>
        <div className="max-h-[50vh] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-brand-cream text-left text-xs uppercase text-gray-500">
              <tr><th className="p-2">Ticket</th><th className="p-2">Served</th><th className="p-2">Items handed over</th></tr>
            </thead>
            <tbody className="divide-y">
              {report.tickets.map(t => (
                <tr key={t.ticket_no + t.first_at}>
                  <td className="whitespace-nowrap p-2 font-bold">{t.ticket_no}</td>
                  <td className="whitespace-nowrap p-2">{time(t.last_at || t.first_at)}</td>
                  <td className="p-2">
                    {(t.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}
                    {t.status === 'partially_served' && <span className="ml-1 text-xs font-bold text-purple-700">PART</span>}
                  </td>
                </tr>
              ))}
              {!report.tickets.length && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Nothing served yet today.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <button className="btn-ghost" onClick={() => print('served', report)}><Printer size={18} /> Print report</button>
    </>
  )
}
