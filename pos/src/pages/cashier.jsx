import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Printer, Receipt as ReceiptIcon, Trash2, X } from 'lucide-react'
import Layout, { Modal, ErrorText, StatusBadge } from '@/components/Layout'
import VoidModal from '@/components/VoidModal'
import { usePrinter } from '@/components/Print'
import { api, ghs, time, uuid, useMe } from '@/lib/client'

const ROLES = ['cashier']

export default function Cashier() {
  const [me, reloadMe] = useMe(ROLES)
  const { print, slip } = usePrinter()
  const [menu, setMenu] = useState({ categories: [], items: [] })
  const [category, setCategory] = useState('all')
  const [cart, setCart] = useState([])           // [{menu_item_id, name, price, qty}]
  const [clientRef, setClientRef] = useState(uuid)
  const [paying, setPaying] = useState(null)     // 'cash' | 'momo_paystack' | 'momo_manual' | 'card'
  const [done, setDone] = useState(null)         // { sale, change }
  const [showRecent, setShowRecent] = useState(false)
  const [error, setError] = useState('')

  const branchName = me?.user.branch_name

  async function loadMenu() {
    try {
      setMenu(await api('menu'))
    } catch (err) {
      setError(err.message)
    }
  }
  useEffect(() => { if (me?.shift) loadMenu() }, [me?.shift?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A new idempotency key whenever the cart changes, so a retried payment for
  // the same cart can never create a second sale.
  useEffect(() => { setClientRef(uuid()) }, [cart])

  const total = useMemo(() => cart.reduce((t, i) => t + i.price * i.qty, 0), [cart])
  const visible = category === 'all' ? menu.items : menu.items.filter(i => i.category_id === category)

  function add(item) {
    setDone(null)
    setCart(c => {
      const found = c.find(i => i.menu_item_id === item.id)
      if (found) return c.map(i => (i === found ? { ...i, qty: i.qty + 1 } : i))
      return [...c, { menu_item_id: item.id, name: item.name, price: Number(item.price), qty: 1 }]
    })
  }

  function setQty(id, qty) {
    setCart(c => (qty <= 0 ? c.filter(i => i.menu_item_id !== id) : c.map(i => (i.menu_item_id === id ? { ...i, qty } : i))))
  }

  function printTicket(sale) {
    print('ticket', { ...sale, branch_name: branchName })
  }

  function onPaid(sale, change = 0) {
    setPaying(null)
    setCart([])
    setDone({ sale, change })
    printTicket(sale)
  }

  if (me && !me.shift) {
    return <Layout me={me}><OpenShift onOpened={reloadMe} /></Layout>
  }
  if (me?.shift?.elsewhere) {
    return <Layout me={me}><ShiftElsewhere shift={me.shift} /></Layout>
  }

  return (
    <Layout fill me={me} right={
      <button className="whitespace-nowrap rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20" onClick={() => setShowRecent(true)}>
        Recent<span className="hidden sm:inline"> sales</span>
      </button>
    }>
      {/* Phone: menu on top, cart pinned at the bottom. md+: menu | cart side by side.
          minmax(0,1fr) + min-w-0 stop a long category row from widening the menu
          column and pushing the cart (and its pay buttons) off screen. */}
      <div className="flex h-full flex-col md:grid md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Menu */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <div className="no-scrollbar mb-3 flex shrink-0 gap-2 overflow-x-auto md:max-h-28 md:flex-wrap md:overflow-y-auto">
            {[{ id: 'all', name: 'All' }, ...menu.categories].map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${category === c.id ? 'bg-brand-dark text-white' : 'bg-white'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {visible.map(item => (
              <button
                key={item.id}
                onClick={() => add(item)}
                className="card flex min-h-[88px] min-w-0 flex-col justify-between text-left transition hover:ring-2 hover:ring-brand-orange active:scale-[0.98]"
              >
                <span className="break-words font-bold leading-tight">{item.name}</span>
                <span className="mt-2 font-black text-brand-orange">{ghs(item.price)}</span>
              </button>
            ))}
            {!visible.length && <div className="col-span-full p-8 text-center text-gray-400">No available items.</div>}
          </div>
        </section>

        {/* Cart */}
        <aside className={`flex min-h-0 min-w-0 shrink-0 flex-col border-t border-brand-muted bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:max-h-none md:border-l md:border-t-0 md:shadow-none ${done ? 'max-h-[70%]' : 'max-h-[48%]'}`}>
          {done ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center md:p-6">
              <div className="text-sm font-bold uppercase text-gray-500">Paid · give the customer ticket</div>
              <div className="text-5xl font-black md:text-6xl">{done.sale.ticket_no}</div>
              <div className="text-xl font-bold">{ghs(done.sale.total)}</div>
              {done.change > 0 && (
                <div className="rounded-2xl bg-green-50 px-6 py-3 text-2xl font-black text-green-700">Change: {ghs(done.change)}</div>
              )}
              <div className="mt-2 flex flex-wrap justify-center gap-2 md:mt-4">
                <button className="btn-ghost" onClick={() => reprint(done.sale, 'ticket')}><Printer size={18} /> Reprint ticket</button>
                <button className="btn-primary" onClick={() => setDone(null)}>New sale</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 md:py-3">
                <h2 className="font-black">Current sale{cart.length > 0 && <span className="font-semibold text-gray-500"> · {cart.reduce((n, i) => n + i.qty, 0)} items</span>}</h2>
                {cart.length > 0 && (
                  <button className="text-sm text-red-600" onClick={() => setCart([])}><Trash2 size={16} className="inline" /> Clear</button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {cart.map(i => (
                  <div key={i.menu_item_id} className="flex items-center gap-2 border-b px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight">{i.name}</div>
                      <div className="text-xs text-gray-500">{ghs(i.price)} each</div>
                    </div>
                    <button className="rounded-lg bg-brand-muted p-2" onClick={() => setQty(i.menu_item_id, i.qty - 1)}><Minus size={14} /></button>
                    <span className="w-6 text-center font-bold">{i.qty}</span>
                    <button className="rounded-lg bg-brand-muted p-2" onClick={() => setQty(i.menu_item_id, i.qty + 1)}><Plus size={14} /></button>
                    <span className="w-[5.5rem] whitespace-nowrap text-right font-bold">{ghs(i.price * i.qty)}</span>
                  </div>
                ))}
                {!cart.length && <div className="p-4 text-center text-gray-400 md:p-8">Tap items to add them.</div>}
              </div>
              <div className="shrink-0 space-y-2 border-t p-3">
                <div className="flex justify-between text-xl font-black md:text-2xl"><span>Total</span><span>{ghs(total)}</span></div>
                {/* The shop takes cash and MoMo prompt only. The API also accepts
                    momo_manual / card if they are ever needed again. */}
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary py-3 text-lg md:py-4" disabled={!cart.length} onClick={() => setPaying('cash')}>Cash</button>
                  <button className="btn-dark py-3 text-lg md:py-4" disabled={!cart.length} onClick={() => setPaying('momo_paystack')}>MoMo</button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {paying && (
        <PayModal
          method={paying}
          cart={cart}
          total={total}
          clientRef={clientRef}
          newClientRef={() => setClientRef(uuid())}
          onClose={() => setPaying(null)}
          onPaid={onPaid}
          onMenuStale={loadMenu}
        />
      )}
      {showRecent && <RecentSales onClose={() => setShowRecent(false)} onReprint={reprint} />}
      {slip}
    </Layout>
  )

  async function reprint(sale, kind) {
    try {
      const { sale: fresh } = await api(`sales/${sale.id}/reprint`, { method: 'POST', body: { kind } })
      print(kind, { ...fresh, branch_name: branchName })
    } catch (err) {
      alert(err.message)
    }
  }
}

// Admin switched branch while their shift (and its cash drawer) is open at another one.
function ShiftElsewhere({ shift }) {
  const [busy, setBusy] = useState(false)

  async function switchBack() {
    setBusy(true)
    await api('auth/branch', { method: 'POST', body: { branch_id: shift.branch_id } }).catch(() => {})
    window.location.reload()
  }

  return (
    <div className="card mx-auto mt-16 max-w-sm space-y-3">
      <h2 className="text-xl font-black">Your shift is open at {shift.branch_name}</h2>
      <p className="text-sm text-gray-600">
        Sales go into the cash drawer of the branch where the shift was opened. Switch back to sell,
        or close that shift on My shift before selling here.
      </p>
      <button className="btn-primary w-full" disabled={busy} onClick={switchBack}>Switch to {shift.branch_name}</button>
      <Link href="/shift" className="btn-ghost w-full">Go to My shift</Link>
    </div>
  )
}

function OpenShift({ onOpened }) {
  const [float, setFloat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('shifts/open', { method: 'POST', body: { opening_float: Number(float || 0) } })
      onOpened()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-16 max-w-sm space-y-3">
      <h2 className="text-xl font-black">Open your shift</h2>
      <p className="text-sm text-gray-600">Count the cash in the drawer before you start selling.</p>
      <label className="block text-sm font-semibold">Opening cash float (GH₵)</label>
      <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={float} onChange={e => setFloat(e.target.value)} autoFocus />
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>Open shift</button>
    </form>
  )
}

const TITLES = { cash: 'Cash payment', momo_paystack: 'MoMo prompt', momo_manual: 'MoMo (customer sent)', card: 'Card payment' }

function PayModal({ method, cart, total, clientRef, newClientRef, onClose, onPaid, onMenuStale }) {
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const items = cart.map(i => ({ menu_item_id: i.menu_item_id, qty: i.qty }))
  const change = Number(tendered || 0) - total
  const quick = [...new Set([total, ...[5, 10, 20, 50, 100, 200].map(d => Math.ceil(total / d) * d)])].filter(v => v >= total).slice(0, 5)

  async function payDirect(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payment = method === 'cash'
        ? { method, amount: total, tendered: Number(tendered) }
        : { method, amount: total, reference }
      const { sale } = await api('sales', { method: 'POST', body: { client_ref: clientRef, items, payments: [payment] } })
      onPaid(sale, method === 'cash' ? change : 0)
    } catch (err) {
      if (err.code === 'ITEM_UNAVAILABLE') onMenuStale()
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`${TITLES[method]} · ${ghs(total)}`} onClose={busy ? undefined : onClose}>
      {method === 'momo_paystack' ? (
        <MomoPrompt items={items} clientRef={clientRef} newClientRef={newClientRef} onPaid={onPaid} onClose={onClose} />
      ) : (
        <form onSubmit={payDirect} className="space-y-3">
          {method === 'cash' ? (
            <>
              <label className="block text-sm font-semibold">Cash received</label>
              <input
                className="input text-2xl font-bold"
                type="number" min={total} step="0.01" inputMode="decimal"
                value={tendered} onChange={e => setTendered(e.target.value)} autoFocus
              />
              <div className="flex flex-wrap gap-2">
                {quick.map(v => (
                  <button type="button" key={v} className="btn-ghost px-3 py-2" onClick={() => setTendered(String(v))}>
                    {v === total ? 'Exact' : ghs(v)}
                  </button>
                ))}
              </div>
              <div className={`rounded-xl p-3 text-center text-2xl font-black ${change >= 0 && tendered ? 'bg-green-50 text-green-700' : 'bg-brand-muted'}`}>
                Change: {tendered && change >= 0 ? ghs(change) : '—'}
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm font-semibold">
                {method === 'card' ? 'Card terminal approval / reference' : 'MoMo transaction ID'}
              </label>
              <input className="input" value={reference} onChange={e => setReference(e.target.value)} autoFocus />
              <p className="text-xs text-gray-500">Confirm the money has arrived before continuing.</p>
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <button
            className="btn-primary w-full py-4 text-lg"
            disabled={busy || (method === 'cash' ? !(change >= 0 && tendered) : !reference.trim())}
          >
            {busy ? 'Saving…' : 'Confirm & print ticket'}
          </button>
        </form>
      )}
    </Modal>
  )
}

function MomoPrompt({ items, clientRef, newClientRef, onPaid, onClose }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [state, setState] = useState({ step: 'phone' }) // phone | waiting | failed
  const [busy, setBusy] = useState(false)
  const timer = useRef()
  const startedAt = useRef(0)

  useEffect(() => () => clearInterval(timer.current), [])

  function poll(saleId) {
    clearInterval(timer.current)
    startedAt.current = Date.now()
    timer.current = setInterval(async () => {
      try {
        const r = await api(`payments/momo-verify?sale_id=${saleId}`)
        if (r.status === 'success') {
          clearInterval(timer.current)
          onPaid(r.sale)
        } else if (r.status === 'failed') {
          clearInterval(timer.current)
          newClientRef()
          setState({ step: 'failed', message: r.message })
        } else {
          setState(s => ({
            ...s, message: r.message, requiresOtp: r.requiresOtp || s.requiresOtp,
            slow: Date.now() - startedAt.current > 3 * 60 * 1000,
          }))
        }
      } catch {
        // network blip — keep polling
      }
    }, 4000)
  }

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api('payments/momo-initiate', { method: 'POST', body: { client_ref: clientRef, items, phone } })
      if (r.status === 'success') {
        const { sale } = await api(`payments/momo-verify?sale_id=${r.sale_id}`)
        return onPaid(sale)
      }
      setState({ step: 'waiting', saleId: r.sale_id, ticketNo: r.ticket_no, message: r.message, requiresOtp: r.requiresOtp })
      poll(r.sale_id)
    } catch (err) {
      newClientRef()
      setState({ step: 'failed', message: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function sendOtp() {
    try {
      const r = await api('payments/momo-otp', { method: 'POST', body: { sale_id: state.saleId, otp } })
      setState(s => ({ ...s, message: r.message, requiresOtp: false }))
    } catch (err) {
      setState(s => ({ ...s, message: err.message }))
    }
  }

  async function cancel() {
    clearInterval(timer.current)
    if (state.saleId) {
      const r = await api('payments/momo-verify', { method: 'POST', body: { sale_id: state.saleId, cancel: true } }).catch(() => null)
      if (r?.status === 'success') return onPaid(r.sale) // customer approved at the last moment
    }
    newClientRef()
    onClose()
  }

  if (state.step === 'phone' || state.step === 'failed') {
    return (
      <form onSubmit={send} className="space-y-3">
        <label className="block text-sm font-semibold">Customer MoMo number</label>
        <input
          className="input text-xl tracking-wider" inputMode="tel" placeholder="024XXXXXXX"
          value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus
        />
        {state.step === 'failed' && <ErrorText>{state.message}</ErrorText>}
        <button className="btn-primary w-full py-4" disabled={busy || phone.length !== 10}>
          {busy ? 'Sending…' : state.step === 'failed' ? 'Try again' : 'Send payment prompt'}
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-muted border-t-brand-orange" />
      <div className="font-bold">Ticket {state.ticketNo} reserved — waiting for approval</div>
      <div className="text-sm text-gray-600">{state.message}</div>
      {state.requiresOtp && (
        <div className="flex gap-2">
          <input className="input" placeholder="OTP" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)} />
          <button className="btn-dark" onClick={sendOtp} disabled={!otp}>Submit</button>
        </div>
      )}
      {state.slow && <ErrorText>Still no approval after 3 minutes. Ask the customer to check their phone, or cancel.</ErrorText>}
      <button className="btn-ghost w-full" onClick={cancel}><X size={16} /> Cancel payment</button>
    </div>
  )
}

function RecentSales({ onClose, onReprint }) {
  const [sales, setSales] = useState(null)
  const [voiding, setVoiding] = useState(null)

  async function load() {
    const { sales } = await api('sales?view=recent')
    setSales(sales)
  }
  useEffect(() => { load() }, [])

  return (
    <Modal title="Today's sales" onClose={onClose} wide>
      {!sales ? <div className="text-gray-400">Loading…</div> : (
        <div className="divide-y">
          {sales.map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-16 font-black">{s.ticket_no}</span>
              <span className="text-sm text-gray-500">{time(s.created_at)}</span>
              <StatusBadge status={s.status} />
              <span className="ml-auto font-bold">{ghs(s.total)}</span>
              <div className="flex w-full justify-end gap-1 sm:w-auto">
                {['paid', 'partially_served'].includes(s.status) && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onReprint(s, 'ticket')}><Printer size={14} /> Ticket</button>
                )}
                {['paid', 'partially_served', 'served'].includes(s.status) && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onReprint(s, 'receipt')}><ReceiptIcon size={14} /> Receipt</button>
                )}
                {['paid', 'pending_payment'].includes(s.status) && (
                  <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => setVoiding(s)}>Void</button>
                )}
              </div>
            </div>
          ))}
          {!sales.length && <div className="py-6 text-center text-gray-400">No sales yet today.</div>}
        </div>
      )}
      {voiding && <VoidModal sale={voiding} onClose={() => setVoiding(null)} onVoided={load} />}
    </Modal>
  )
}
