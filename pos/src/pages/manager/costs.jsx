import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import Layout, { ErrorText } from '@/components/Layout'
import { api, can, ghs, useMe } from '@/lib/client'

const ROLES = ['food_cost']   // permissions that open this page
const TARGET = 35             // food cost % above this is shown in red

// Food cost per dish at this branch: what goes on the plate (dish links ×
// item costs) against the price. Costs come from purchases and recipes.
export default function Costs() {
  const [me] = useMe(ROLES)
  const [data, setData] = useState(null)
  const [show, setShow] = useState('tracked')
  const [error, setError] = useState('')
  const load = useCallback(() => api('manager/costs').then(setData).catch(e => setError(e.message)), [])
  useEffect(() => { if (me) load() }, [me, load])

  const dishes = (data?.dishes || []).filter(d => show === 'all' || d.links > 0)

  function exportCsv() {
    const rows = [['Dish', 'Price', 'Food cost', 'Food cost %'], ...dishes.map(d => [d.name, d.price, d.cost, d.cost_pct ?? ''])]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `ugs-food-cost-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">Food cost · {me?.user.branch_name}</h1>
          <select className="input ml-auto w-auto py-1.5 text-sm" value={show} onChange={e => setShow(e.target.value)}>
            <option value="tracked">Dishes with links</option><option value="all">All dishes</option>
          </select>
          {can(me?.user, 'export') && <button className="btn-ghost px-3 py-2 text-sm" onClick={exportCsv}><Download size={16} /> CSV</button>}
        </div>
        <p className="text-sm text-gray-600">Cost = what one plate uses (Stock → Setup links) × each item's cost. Above {TARGET}% is shown in red.</p>
        <ErrorText>{error}</ErrorText>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream text-left text-xs uppercase text-gray-500">
              <tr><th className="p-2">Dish</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Food cost</th><th className="p-2 text-right">%</th></tr>
            </thead>
            <tbody className="divide-y">
              {dishes.map(d => (
                <tr key={d.menu_item_id}>
                  <td className="p-2 font-semibold">{d.name}{!d.links && <span className="ml-1 text-xs font-normal text-gray-400">not linked</span>}</td>
                  <td className="p-2 text-right">{ghs(d.price)}</td>
                  <td className="p-2 text-right">{d.links ? ghs(d.cost) : '—'}</td>
                  <td className={`p-2 text-right font-bold ${d.cost_pct > TARGET ? 'text-red-600' : 'text-green-700'}`}>{d.links && d.cost_pct != null ? `${d.cost_pct}%` : '—'}</td>
                </tr>
              ))}
              {data && !dishes.length && <tr><td className="p-4 text-center text-gray-400" colSpan={4}>No dishes linked to stock yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="mb-1 text-lg font-black">Item costs</h2>
          <div className="grid gap-x-6 text-sm sm:grid-cols-2">
            {(data?.items || []).map(i => (
              <div key={i.id} className="flex justify-between border-b py-1"><span>{i.name} <span className="text-xs text-gray-400">{i.kind}</span></span><b>{ghs(i.unit_cost)}/{i.unit}</b></div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
