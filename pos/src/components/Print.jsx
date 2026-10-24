// 80mm thermal slips. Rendered into #print-root and printed with window.print();
// print CSS (globals.css) hides everything else. On POS PCs run Chrome with
// --kiosk-printing so it prints straight to the default printer, no dialog.
import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ghs, dateTime, METHOD_LABEL, shownMethods } from '@/lib/client'

export function usePrinter() {
  const [job, setJob] = useState(null)

  const print = useCallback(async (kind, data) => {
    const qr = kind === 'ticket' ? await QRCode.toDataURL(data.id, { margin: 0, width: 160 }) : null
    setJob({ kind, data, qr, at: Date.now() })
  }, [])

  useEffect(() => {
    if (!job) return
    // wait for React to paint the slip before opening the print dialog
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => cancelAnimationFrame(id)
  }, [job])

  const slip = job && (
    <div id="print-root">
      {job.kind === 'ticket'  && <Ticket sale={job.data} qr={job.qr} />}
      {job.kind === 'receipt' && <Receipt sale={job.data} />}
      {job.kind === 'zreport' && <ZReport report={job.data} />}
      {job.kind === 'served'  && <ServedReport report={job.data} />}
    </div>
  )

  return { print, slip }
}

function Head({ branch, title }) {
  return (
    <div className="text-center">
      <div className="text-lg font-black">UGs KITCHEN</div>
      {branch && <div className="text-xs">{branch}</div>}
      <div className="mt-1 border-y border-dashed border-black py-1 text-sm font-bold tracking-widest">{title}</div>
    </div>
  )
}

const Row = ({ left, right, bold }) => (
  <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
    <span>{left}</span><span className="whitespace-nowrap">{right}</span>
  </div>
)

const Rule = () => <div className="my-1 border-t border-dashed border-black" />

export function Ticket({ sale, qr }) {
  return (
    <div className="slip">
      <Head branch={sale.branch_name} title="FOOD TICKET" />
      <div className="my-2 text-center text-5xl font-black">{sale.ticket_no}</div>
      <div className="text-center text-xs">{dateTime(sale.created_at)} · Cashier: {sale.cashier}</div>
      <Rule />
      {sale.items.map(i => (
        <div key={i.id} className="flex gap-2 text-base font-bold">
          <span className="w-8">{i.qty}×</span><span>{i.name_snapshot}</span>
        </div>
      ))}
      <Rule />
      <Row left="PAID" right={ghs(sale.total)} bold />
      {qr && <img src={qr} alt="" className="mx-auto my-2 h-28 w-28" />}
      <div className="text-center text-xs font-bold">Hand this ticket to the server to collect your food.</div>
    </div>
  )
}

export function Receipt({ sale }) {
  return (
    <div className="slip">
      <Head branch={sale.branch_name} title="RECEIPT" />
      <Row left={`Ticket ${sale.ticket_no}`} right={dateTime(sale.created_at)} />
      <Rule />
      {sale.items.map(i => (
        <Row key={i.id} left={`${i.qty} × ${i.name_snapshot}`} right={ghs(i.qty * i.unit_price)} />
      ))}
      <Rule />
      <Row left="TOTAL" right={ghs(sale.total)} bold />
      {sale.payments.filter(p => p.status === 'success').map(p => (
        <div key={p.id}>
          <Row left={METHOD_LABEL[p.method]} right={ghs(p.method === 'cash' ? p.tendered : p.amount)} />
          {p.method === 'cash' && Number(p.change_given) > 0 && <Row left="Change" right={ghs(p.change_given)} />}
          {p.reference && p.method !== 'momo_paystack' && <div className="text-xs">Ref: {p.reference}</div>}
        </div>
      ))}
      <Rule />
      <div className="text-xs">Cashier: {sale.cashier}</div>
      {sale.served_by && <div className="text-xs">Served by: {sale.served_by}</div>}
      <div className="mt-2 text-center text-sm font-bold">Thank you! Enjoy your meal.</div>
    </div>
  )
}

export function ZReport({ report }) {
  const s = report.shift
  return (
    <div className="slip">
      <Head title={s.closed_at ? 'Z-REPORT (SHIFT CLOSE)' : 'X-REPORT (MID-SHIFT)'} />
      <div className="text-xs">Cashier: {s.staff_name}</div>
      <div className="text-xs">Opened: {dateTime(s.opened_at)}</div>
      {s.closed_at && <div className="text-xs">Closed: {dateTime(s.closed_at)}</div>}
      <Rule />
      <Row left="Sales" right={report.sales_count} />
      <Row left="Gross" right={ghs(report.gross)} bold />
      {shownMethods(report.by_method).map(([m, v]) => <Row key={m} left={METHOD_LABEL[m]} right={ghs(v)} />)}
      <Row left={`Voids (${report.voids.count})`} right={ghs(report.voids.total)} />
      <Rule />
      <Row left="Opening float" right={ghs(s.opening_float)} />
      <Row left="Expected cash" right={ghs(report.expected_cash)} bold />
      {s.counted_cash != null && <Row left="Counted cash" right={ghs(s.counted_cash)} />}
      {s.variance != null && <Row left="Variance" right={ghs(s.variance)} bold />}
      {report.unserved.length > 0 && (
        <>
          <Rule />
          <div className="text-xs">Unserved tickets: {report.unserved.join(', ')}</div>
        </>
      )}
      <Rule />
      {report.items.map(i => <Row key={i.name} left={`${i.qty} × ${i.name}`} right={ghs(i.amount)} />)}
    </div>
  )
}

export function ServedReport({ report }) {
  return (
    <div className="slip">
      <Head title="SERVER REPORT" />
      <div className="text-xs">{report.staff_name} · {report.date}</div>
      <Rule />
      <Row left="Tickets served" right={report.ticket_count} bold />
      <Row left="Items served" right={report.item_count} bold />
      <Rule />
      {report.items.map(i => <Row key={i.name} left={i.name} right={i.qty} />)}
      <Rule />
      <div className="text-xs">Tickets: {report.tickets.map(t => t.ticket_no).join(', ')}</div>
    </div>
  )
}
