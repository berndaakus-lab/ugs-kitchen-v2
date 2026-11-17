// Small hand-made charts for the reports (Module 4): plain HTML/SVG, so they
// stay sharp on phones, desktops and when printed. Every chart has its
// numbers in a legend, list or tooltip, so nothing relies on colour alone.
import { useState } from 'react'

// Fixed colours per thing (never by rank), so a filter never repaints them.
export const COLORS = {
  walk_in: '#F38F1D', // brand orange
  online:  '#2a78d6',
  cash:    '#1baf7a',
  momo:    '#eda100',
  card:    '#2a78d6',
  other:   '#6250d6',
}
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
const REST = '#b8b2a7'
export const seriesColor = i => SERIES[i] || REST

const short = n => {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}m`
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e3)}k`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(Math.round(v))
}

// Vertical bars, optionally stacked. data: [{ label, tip?, values: { key: n } }]
// keys: [[key, label, colour]]. Labels thin out when there are many bars.
export function Bars({ data, keys, format = short, height = 180, emptyText = 'No sales in this period.' }) {
  const [hover, setHover] = useState(null)
  const totals = data.map(d => keys.reduce((t, [k]) => t + Number(d.values[k] || 0), 0))
  const max = Math.max(0, ...totals)
  if (!max) return <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>{emptyText}</div>
  const every = Math.ceil(data.length / 12)
  const top = niceMax(max)

  return (
    <div className="select-none">
      {keys.length > 1 && <Legend items={keys.map(([k, label, color]) => ({ label, color }))} />}
      <div className="relative flex" style={{ height }}>
        {/* y axis: top value and zero */}
        <div className="flex w-9 shrink-0 flex-col justify-between pb-0 pr-1 text-right text-[10px] text-gray-400">
          <span>{short(top)}</span><span>{short(top / 2)}</span><span>0</span>
        </div>
        <div className="relative flex flex-1 items-end gap-[2px] border-b border-gray-200">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-gray-100" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />
          {data.map((d, i) => (
            <div
              key={d.label + i}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
            >
              <div className={`flex flex-col-reverse gap-[2px] ${hover === i ? 'opacity-80' : ''}`} style={{ height: `${(totals[i] / top) * 100}%` }}>
                {keys.map(([k, , color], j) => {
                  const v = Number(d.values[k] || 0)
                  if (!v) return null
                  const isTop = keys.slice(j + 1).every(([k2]) => !Number(d.values[k2] || 0))
                  return <div key={k} className={isTop ? 'rounded-t' : ''} style={{ flexGrow: v, flexBasis: 0, background: color, minHeight: 2 }} />
                })}
              </div>
              {hover === i && (
                <div className={`absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-brand-dark px-2 py-1 text-xs text-white shadow ${i > data.length / 2 ? 'right-0' : 'left-0'}`}>
                  <div className="font-bold">{d.tip || d.label}</div>
                  {keys.map(([k, label]) => <div key={k}>{keys.length > 1 ? `${label}: ` : ''}{format(d.values[k] || 0)}</div>)}
                  {keys.length > 1 && <div className="font-bold">Total: {format(totals[i])}</div>}
                  {d.extra && <div className="text-white/70">{d.extra}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-9 flex gap-[2px] pt-1">
        {data.map((d, i) => (
          <div key={d.label + i} className="min-w-0 flex-1 truncate text-center text-[10px] text-gray-500">
            {i % every === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s) || 10) * p
}

// Horizontal bars with the value written at the end: good for names (branches,
// dishes). rows: [{ label, value, sub? }]
export function HBars({ rows, format = short, color = COLORS.walk_in, emptyText = 'Nothing yet.' }) {
  const max = Math.max(0, ...rows.map(r => r.value))
  if (!rows.length || !max) return <p className="py-4 text-center text-sm text-gray-400">{emptyText}</p>
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{r.label}</span>
            <span className="shrink-0 font-black">{format(r.value)}{r.sub && <span className="ml-1 text-xs font-normal text-gray-500">{r.sub}</span>}</span>
          </div>
          <div className="mt-0.5 h-2 rounded-full bg-brand-muted">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: r.color || color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Donut with a legend (name, amount, %). parts: [{ label, value, color }]
export function Donut({ parts, format = short, center, emptyText = 'Nothing yet.' }) {
  const [hover, setHover] = useState(null)
  const shown = parts.filter(p => p.value > 0)
  const total = shown.reduce((t, p) => t + p.value, 0)
  if (!total) return <p className="py-8 text-center text-sm text-gray-400">{emptyText}</p>

  const R = 40, C = 2 * Math.PI * R, GAP = shown.length > 1 ? 1.2 : 0
  let offset = 0
  const arcs = shown.map((p, i) => {
    const len = (p.value / total) * C
    const arc = { ...p, i, dash: Math.max(0.5, len - GAP), offset }
    offset += len
    return arc
  })
  const pct = v => `${Math.round((v / total) * 1000) / 10}%`
  const active = hover != null ? shown[hover] : null

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={shown.map(p => `${p.label} ${pct(p.value)}`).join(', ')}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#F5EDE0" strokeWidth="14" />
        {arcs.map(a => (
          <circle
            key={a.label}
            cx="50" cy="50" r={R} fill="none" stroke={a.color} strokeWidth={hover === a.i ? 17 : 14}
            strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.offset}
            onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)}
          >
            <title>{`${a.label}: ${format(a.value)} (${pct(a.value)})`}</title>
          </circle>
        ))}
        <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
          <text x="50" y="48" textAnchor="middle" className="fill-brand-dark text-[11px] font-black">{active ? pct(active.value) : (center ?? short(total))}</text>
          <text x="50" y="60" textAnchor="middle" className="fill-gray-500 text-[7px]">{active ? active.label : 'total'}</text>
        </g>
      </svg>
      <div className="w-full min-w-0 flex-1 space-y-1 text-sm">
        {shown.map((p, i) => (
          <div key={p.label} className={`flex items-center gap-2 rounded px-1 ${hover === i ? 'bg-brand-muted' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <b className="shrink-0">{format(p.value)}</b>
            <span className="w-12 shrink-0 text-right text-xs text-gray-500">{pct(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-xs">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

// Up to 7 named slices, the rest folded into "Other".
export function topParts(rows, valueKey = 'amount', labelKey = 'name', n = 7) {
  const sorted = [...rows].sort((a, b) => b[valueKey] - a[valueKey])
  const head = sorted.slice(0, n).map((r, i) => ({ label: r[labelKey], value: r[valueKey], color: r[labelKey] === 'Other' ? REST : seriesColor(i) }))
  const rest = sorted.slice(n).reduce((t, r) => t + r[valueKey], 0)
  if (rest > 0) {
    const other = head.find(h => h.label === 'Other')
    if (other) other.value += rest
    else head.push({ label: 'Other', value: rest, color: REST })
  }
  return head
}
