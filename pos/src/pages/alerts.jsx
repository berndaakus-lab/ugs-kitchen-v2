import { useEffect, useState } from 'react'
import Layout, { ErrorText } from '@/components/Layout'
import { api, dateTime, useMe } from '@/lib/client'

const fmt = n => Number(Number(n || 0).toFixed(2))

// Everything that is below its low-stock level at the places I work at.
// An alert clears by itself when stock comes back above the level.
export default function Alerts() {
  const [me] = useMe()
  const [alerts, setAlerts] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { if (me) api('alerts').then(r => setAlerts(r.alerts)).catch(e => setError(e.message)) }, [me])

  const byPlace = (alerts || []).reduce((m, a) => { (m[a.place] ||= []).push(a); return m }, {})
  return (
    <Layout me={me}>
      <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-4">
        <h1 className="text-2xl font-black">Low stock</h1>
        <ErrorText>{error}</ErrorText>
        {alerts && !alerts.length && <div className="card text-gray-500">Nothing is low right now.</div>}
        {Object.entries(byPlace).map(([place, list]) => (
          <div key={place} className="card">
            <h2 className="mb-1 text-lg font-black">{place}</h2>
            <div className="divide-y text-sm">
              {list.map(a => (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 py-2">
                  <b className="min-w-0 flex-1">{a.item}</b>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{fmt(a.on_hand)} {a.unit}</span>
                  <span className="text-xs text-gray-500">low at {fmt(a.level)} · since {dateTime(a.since)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
