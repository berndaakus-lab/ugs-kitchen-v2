import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock, PackageCheck } from 'lucide-react'
import Layout from '@/components/Layout'
import { api, can, sectionsFor, useMe } from '@/lib/client'

// Start page: everything this person can do, as big buttons grouped like the
// menu, with today's to-dos (start shift, deliveries to confirm, low stock) on top.
export default function Home() {
  const [me] = useMe()
  const [todo, setTodo] = useState({ low: 0, branchIncoming: 0, storeIncoming: 0 })
  const u = me?.user

  useEffect(() => {
    if (!u) return
    const jobs = []
    if (can(u, 'stock_send', 'stock_receive', 'stock_count', 'production', 'purchases', 'activity', 'reports')) {
      jobs.push(api('alerts').then(r => ({ low: r.alerts.length })).catch(() => ({})))
    }
    if (can(u, 'stock_receive') && (u.scopeAll || (u.scopes || []).includes('branch'))) {
      jobs.push(api('stock/incoming').then(r => ({ branchIncoming: (r.pending || []).length })).catch(() => ({})))
    }
    if (can(u, 'stock_receive') && u.storeRole) {
      jobs.push(api('store').then(r => ({ storeIncoming: (r.incoming || []).filter(d => d.status === 'sent').length })).catch(() => ({})))
    }
    Promise.all(jobs).then(parts => setTodo(Object.assign({ low: 0, branchIncoming: 0, storeIncoming: 0 }, ...parts)))
  }, [u])

  // the Home section shows its other pages (My shift) as "You"
  const sections = sectionsFor(u).map(s => (s.key === 'home' ? { ...s, label: 'You', pages: s.pages.filter(p => p.href !== '/home') } : s)).filter(s => s.pages.length)
  const todos = [
    u?.runsShift && !me.shift && { href: '/shift', icon: Clock, text: 'Start your shift', tone: 'bg-amber-100 text-amber-900' },
    todo.branchIncoming > 0 && { href: '/stock', icon: PackageCheck, text: `Confirm ${todo.branchIncoming} deliver${todo.branchIncoming === 1 ? 'y' : 'ies'} at the branch`, tone: 'bg-blue-100 text-blue-900' },
    todo.storeIncoming > 0 && { href: '/store?tab=incoming', icon: PackageCheck, text: `Confirm ${todo.storeIncoming} deliver${todo.storeIncoming === 1 ? 'y' : 'ies'} at your kitchen / warehouse`, tone: 'bg-blue-100 text-blue-900' },
    todo.low > 0 && { href: '/alerts', icon: AlertTriangle, text: `${todo.low} item${todo.low === 1 ? ' is' : 's are'} running low`, tone: 'bg-red-100 text-red-800' },
  ].filter(Boolean)

  return (
    <Layout me={me}>
      <div className="mx-auto max-w-5xl space-y-5 p-3 md:p-4">
        <div>
          <h1 className="text-2xl font-black">Hello{u?.name ? `, ${u.name.split(' ')[0]}` : ''}</h1>
          <p className="text-sm text-gray-600">Tap what you want to do. The same pages are in the menu at the top.</p>
        </div>

        {todos.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {todos.map(t => (
              <Link key={t.href + t.text} href={t.href} className={`flex items-center gap-3 rounded-2xl p-4 text-base font-bold ${t.tone}`}>
                <t.icon size={22} /> <span className="flex-1">{t.text}</span> <ChevronRight size={20} />
              </Link>
            ))}
          </div>
        )}

        {sections.map(sec => (
          <section key={sec.key} className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-500">{sec.label}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sec.pages.map(pg => (
                <Link key={pg.href} href={pg.href} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-black">{pg.label}</div>
                    <div className="text-sm text-gray-600">{pg.desc}</div>
                  </div>
                  <ChevronRight size={20} className="shrink-0 text-gray-400" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Layout>
  )
}
