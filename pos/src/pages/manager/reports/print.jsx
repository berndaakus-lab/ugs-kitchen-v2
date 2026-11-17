import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Printer } from 'lucide-react'
import { ErrorText } from '@/components/Layout'
import { TABS, filterSummary } from '@/components/ReportSections'
import { api, can, dateTime, useMe } from '@/lib/client'

// Print-friendly report (A4) for "PDF / Print": every section on one page,
// then the browser's print dialog, where "Save as PDF" makes the PDF.
// Same filters as the dashboard (in the address). Needs Download data too.
export default function ReportPrint() {
  const [me] = useMe(['reports'])
  const router = useRouter()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const allowed = me && can(me.user, 'export')

  useEffect(() => {
    document.body.classList.add('report-print')
    return () => document.body.classList.remove('report-print')
  }, [])

  useEffect(() => {
    if (!allowed || !router.isReady) return
    const q = new URLSearchParams(Object.entries(router.query).map(([k, v]) => [k, String(v)])).toString()
    api(`reports/dashboard?${q}`)
      .then(({ report }) => setReport(report))
      .catch(err => setError(err.message))
  }, [allowed, router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Print once the charts have painted.
  useEffect(() => {
    if (!report) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [report])

  if (me && !allowed) return <div className="p-6"><ErrorText>Printing reports needs the "Download data" permission.</ErrorText></div>

  return (
    <div className="report-root mx-auto max-w-5xl space-y-4 p-4 print:max-w-none print:p-0">
      <Head><title>UGs Kitchen report</title></Head>
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-brand-dark pb-2">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-brand-orange">UGs Kitchen</div>
          <h1 className="text-2xl font-black">Sales report</h1>
          {report && <p className="text-sm text-gray-600">{filterSummary(report)}</p>}
        </div>
        <div className="ml-auto text-right text-xs text-gray-500">
          {me && <div>Printed by {me.user.name}</div>}
          <div>{dateTime(new Date())}</div>
          <button className="btn-primary mt-1 px-3 py-2 text-sm print:hidden" onClick={() => window.print()} disabled={!report}>
            <Printer size={16} /> Print / Save as PDF
          </button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {!report && !error && <p className="py-10 text-center text-gray-400">Loading…</p>}
      {report && TABS.map(([k, label, Section]) => (
        <div key={k} className="report-section space-y-3">
          <h2 className="text-xl font-black text-brand-brown">{label}</h2>
          <Section r={report} print />
        </div>
      ))}
    </div>
  )
}
