'use client'

// SQL needed — run once in Supabase:
// create table if not exists feature_flags (
//   key text primary key,
//   enabled boolean default false,
//   updated_at timestamptz default now()
// );
// insert into feature_flags (key, enabled) values ('reports_enabled', false) on conflict do nothing;
// Note: 'reports_enabled' controls whether franchisees can see network benchmarks (cross-location comparisons).
// Franchisees always have access to their own location reports regardless of this flag.
// alter table feature_flags enable row level security;
// create policy "Auth users read feature flags" on feature_flags for select using (auth.role() = 'authenticated');
// create policy "Corporate manages feature flags" on feature_flags for all using (
//   exists (select 1 from profiles where id = auth.uid() and role = 'corporate')
// );

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

// ── Constants ────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DEFAULT_SEASONALITY = [8,7,9,8,9,10,9,10,10,10,6,4]
const CHART_COLORS = ['#0C85C2','#7CCA5B','#FFB600','#6B5CE7','#C0392B','#5AB3C9','#E67E22','#2ECC71']

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtN(n: number, dec = 0) {
  const r = Number((n || 0).toFixed(dec))
  return dec > 0 ? r.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : Math.round(r).toLocaleString()
}
function fmtPct(n: number) { return Math.round(n || 0) + '%' }
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_SHORT[m-1]} '${String(y).slice(2)}`
}

function getMonthRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  switch (preset) {
    case 'this': return { from: cur, to: cur }
    case '3mo': {
      const d = new Date(now); d.setMonth(d.getMonth() - 2)
      return { from: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, to: cur }
    }
    case '6mo': {
      const d = new Date(now); d.setMonth(d.getMonth() - 5)
      return { from: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, to: cur }
    }
    case 'ytd': return { from: `${now.getFullYear()}-01`, to: cur }
    case 'all': return { from: '2020-01', to: cur }
    default: return { from: cur, to: cur }
  }
}

function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const months: string[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2,'0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700,
  color: '#666', background: '#f0f8fb', whiteSpace: 'nowrap',
}
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: 'left' }
const tdStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontSize: '13px', color: '#2C3E50', borderTop: '1px solid #E6F1F4' }
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left' }

function VarBadge({ actual, plan }: { actual: number; plan: number }) {
  if (!plan) return <span style={{ color: '#aaa', fontSize: '11px' }}>—</span>
  const diff = actual - plan
  const pct = Math.round(Math.abs(diff) / plan * 100)
  const good = diff >= 0
  const bg = diff === 0 ? '#E6F1F4' : good ? '#edfae5' : '#fde8e8'
  const color = diff === 0 ? '#888' : good ? '#3B8C2A' : '#C0392B'
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: bg, color, whiteSpace: 'nowrap' }}>
      {diff >= 0 ? '▲' : '▼'} {pct}%
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
function getSelectableMonths() {
  const now = new Date()
  const months: { key: string; label: string }[] = []
  for (let i = 35; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    months.push({ key, label: `${MONTHS_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` })
  }
  return months
}

export default function ReportsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('3mo')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [actuals, setActuals] = useState<Record<string, Record<string, any>>>({}) // month_key → data
  const [plan, setPlan] = useState<any>(null)

  const selectableMonths = getSelectableMonths()

  const range = preset === 'custom' && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getMonthRange(preset)
  const months = monthsBetween(range.from, range.to)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const uid = session.user.id

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).single()
      if (profile?.role === 'corporate') { router.push('/admin/reports'); return }

      // Load game plan
      const { data: gp } = await supabase
        .from('gameplans').select('*').eq('user_id', uid).eq('is_active', true).single()
      if (gp) {
        setPlan({
          ...gp,
          seasonality: typeof gp.seasonality === 'string' ? JSON.parse(gp.seasonality) : (gp.seasonality ?? DEFAULT_SEASONALITY),
          channels: typeof gp.channels === 'string' ? JSON.parse(gp.channels) : (gp.channels ?? { paid: [], community: [] }),
          month_data: typeof gp.month_data === 'string' ? JSON.parse(gp.month_data) : (gp.month_data ?? {}),
        })
      }

      setLoading(false)
    })
  }, [])

  useEffect(() => {
    async function loadActuals() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: rows } = await supabase
        .from('tracker_actuals')
        .select('month_key, data')
        .eq('user_id', session.user.id)
        .gte('month_key', range.from)
        .lte('month_key', range.to)
        .order('month_key')
      const map: Record<string, Record<string, any>> = {}
      for (const row of rows ?? []) map[row.month_key] = row.data ?? {}
      setActuals(map)
    }
    loadActuals()
  }, [range.from, range.to])

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Open Sans', sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E6F1F4' }}>
          <div style={{ color: '#5AB3C9' }}>Loading…</div>
        </div>
      </div>
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const seasonality: number[] = plan?.seasonality ?? DEFAULT_SEASONALITY
  const seasonSum = seasonality.reduce((a: number, b: number) => a + b, 0) || 1
  const planStart = plan?.plan_start ?? ''
  const planHorizon = plan?.plan_horizon ?? 'eoy'

  function getMonthPlanRevenue(monthKey: string) {
    if (!plan) return 0
    const m = Number(monthKey.split('-')[1]) - 1
    return plan.use_seasonality
      ? plan.annual_goal * (seasonality[m] / seasonSum)
      : plan.annual_goal / 12
  }

  function getA(monthKey: string, key: string): number {
    return (actuals[monthKey]?.[key] as number) ?? 0
  }

  const paidChannels: any[] = plan?.channels?.paid ?? []
  const commChannels: any[] = plan?.channels?.community ?? []
  const allChannels = [...paidChannels, ...commChannels]

  // Custom channels per month (union across all months)
  const customPaidSet = new Map<string, string>()
  const customCommSet = new Map<string, string>()
  for (const mk of months) {
    const d = actuals[mk] ?? {}
    try { JSON.parse(d.n_customPaidChannels || '[]').forEach((c: any) => customPaidSet.set(c.id, c.name)) } catch {}
    try { JSON.parse(d.n_customCommChannels || '[]').forEach((c: any) => customCommSet.set(c.id, c.name)) } catch {}
  }
  const customPaid = Array.from(customPaidSet.entries()).map(([id, name]) => ({ id, name, type: 'paid' }))
  const customComm = Array.from(customCommSet.entries()).map(([id, name]) => ({ id, name, type: 'community' }))
  const allChWithCustom = [...allChannels, ...customPaid, ...customComm]

  // Period aggregates
  const periodRevenue   = months.reduce((s, mk) => s + getA(mk, 'revenue'), 0)
  const periodCleanings = months.reduce((s, mk) => s + getA(mk, 'cleanings'), 0)
  const periodLeads     = months.reduce((s, mk) => s + allChWithCustom.reduce((cs, ch) => cs + getA(mk, `leads_${ch.id}`), 0), 0)
  const periodBooked    = months.reduce((s, mk) => s + allChWithCustom.reduce((cs, ch) => cs + getA(mk, `booked_${ch.id}`), 0), 0)
  const periodRecurr    = months.reduce((s, mk) => s + allChWithCustom.reduce((cs, ch) => cs + getA(mk, `recurring_${ch.id}`), 0), 0)
  const periodSpend     = months.reduce((s, mk) => s + paidChannels.reduce((cs, ch) => cs + getA(mk, `spend_${ch.id}`), 0) + customPaid.reduce((cs, ch) => cs + getA(mk, `spend_${ch.id}`), 0), 0)
  const periodPlanRev   = months.reduce((s, mk) => s + getMonthPlanRevenue(mk), 0)
  const avgTicket       = periodCleanings > 0 ? periodRevenue / periodCleanings : 0
  const closeRate       = periodLeads > 0 ? periodBooked / periodLeads * 100 : 0

  // ── Charts data ───────────────────────────────────────────────────────────
  const chartLabels = months.map(monthLabel)

  const revenueChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Actual Revenue',
        data: months.map(mk => getA(mk, 'revenue')),
        borderColor: '#0C85C2', backgroundColor: 'rgba(12,133,194,0.08)',
        tension: 0.3, fill: true, pointRadius: 4,
      },
      {
        label: 'Plan',
        data: months.map(mk => getMonthPlanRevenue(mk)),
        borderColor: '#FFB600', backgroundColor: 'transparent',
        borderDash: [5, 5], tension: 0.3, pointRadius: 0,
      },
    ],
  }

  const leadsChartData = {
    labels: chartLabels,
    datasets: allChWithCustom.map((ch, i) => ({
      label: ch.name,
      data: months.map(mk => getA(mk, `leads_${ch.id}`)),
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      stack: 'leads',
    })),
  }

  const recurringChartData = {
    labels: chartLabels,
    datasets: [
      { label: 'Airbnb / STR', data: months.map(mk => getA(mk, 'recurAirbnb')), borderColor: '#0C85C2', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4 },
      { label: 'Residential',  data: months.map(mk => getA(mk, 'recurResidential')), borderColor: '#6B5CE7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4 },
      { label: 'Commercial',   data: months.map(mk => getA(mk, 'recurCommercial')), borderColor: '#3B8C2A', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4 },
    ],
  }

  const chartOptions = (yPrefix = '') => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { font: { size: 11 }, boxWidth: 12 } }, title: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: {
        grid: { color: '#f0f4f6' }, ticks: {
          font: { size: 11 },
          callback: (v: any) => yPrefix ? `${yPrefix}${Math.round(v).toLocaleString()}` : String(v),
        }
      }
    },
  })

  const PRESETS = [
    { key: 'this', label: 'This Month' },
    { key: '3mo', label: 'Last 3 Mo' },
    { key: '6mo', label: 'Last 6 Mo' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'All Time' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Open Sans', sans-serif", background: '#E6F1F4' }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50', margin: 0 }}>Reports</h1>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              {months.length > 1 ? `${monthLabel(range.from)} – ${monthLabel(range.to)}` : monthLabel(range.from)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            {/* Preset buttons */}
            <div style={{ display: 'flex', border: '1px solid #A7DBE7', borderRadius: '8px', overflow: 'hidden' }}>
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => setPreset(p.key)} style={{
                  padding: '7px 14px', fontSize: '12px', cursor: 'pointer', border: 'none',
                  background: preset === p.key ? '#0C85C2' : '#fff',
                  color: preset === p.key ? '#fff' : '#666',
                  fontFamily: "'Open Sans', sans-serif", fontWeight: preset === p.key ? 700 : 400,
                  borderRight: '1px solid #A7DBE7',
                }}>{p.label}</button>
              ))}
            </div>
            {/* Custom range pickers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: `1.5px solid ${preset === 'custom' ? '#0C85C2' : '#A7DBE7'}`, borderRadius: '8px', padding: '4px 10px' }}>
              <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>From</span>
              <select
                value={preset === 'custom' ? customFrom : range.from}
                onChange={e => { setCustomFrom(e.target.value); setCustomTo(t => t || e.target.value); setPreset('custom') }}
                style={{ border: 'none', outline: 'none', fontSize: '12px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', background: 'transparent', cursor: 'pointer' }}
              >
                {selectableMonths.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <span style={{ fontSize: '11px', color: '#888' }}>–</span>
              <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>To</span>
              <select
                value={preset === 'custom' ? customTo : range.to}
                onChange={e => { setCustomTo(e.target.value); setCustomFrom(f => f || range.from); setPreset('custom') }}
                style={{ border: 'none', outline: 'none', fontSize: '12px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', background: 'transparent', cursor: 'pointer' }}
              >
                {selectableMonths.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: 'Revenue', value: fmt$(periodRevenue), sub: `Plan: ${fmt$(periodPlanRev)}`, color: kpiColor(periodRevenue, periodPlanRev) },
            { label: 'Cleanings', value: fmtN(periodCleanings), sub: `Avg/mo: ${fmtN(periodCleanings / (months.length || 1))}`, color: '#5AB3C9' },
            { label: 'Avg Ticket', value: avgTicket > 0 ? fmt$(avgTicket) : '—', sub: `Plan: ${fmt$(plan?.avg_ticket ?? 0)}`, color: kpiColor(avgTicket, plan?.avg_ticket ?? 0) },
            { label: 'Total Leads', value: fmtN(periodLeads), sub: `Avg/mo: ${fmtN(periodLeads / (months.length || 1))}`, color: '#0C85C2' },
            { label: 'Close Rate', value: closeRate > 0 ? fmtPct(closeRate) : '—', sub: 'Leads → Booked', color: closeRate >= 15 ? '#3B8C2A' : closeRate > 0 ? '#FFB600' : '#aaa' },
            { label: 'New Recurring', value: fmtN(periodRecurr), sub: `Avg/mo: ${fmtN(periodRecurr / (months.length || 1))}`, color: '#6B5CE7' },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '14px 16px', borderTop: `3px solid ${card.color}` }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>{card.label}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50' }}>{card.value}</div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>Revenue vs Plan</div>
            <div style={{ height: '220px' }}>
              <Line data={revenueChartData} options={chartOptions('$')} />
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>Active Recurring</div>
            <div style={{ height: '220px' }}>
              <Line data={recurringChartData} options={chartOptions()} />
            </div>
          </div>
        </div>

        {/* Leads by channel chart */}
        {allChWithCustom.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>Leads by Channel</div>
            <div style={{ height: '200px' }}>
              <Bar data={leadsChartData} options={{ ...chartOptions(), scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }, y: { stacked: true, grid: { color: '#f0f4f6' }, ticks: { font: { size: 11 } } } } }} />
            </div>
          </div>
        )}

        {/* Month-by-month summary table */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #A7DBE7', background: '#f8fcfd' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>Month-by-Month Summary</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Month','Revenue','vs Plan','Cleanings','Avg Ticket','Leads','Close %','New Recurring','Cancellations','Reviews'].map((h, i) => (
                    <th key={i} style={i === 0 ? thLeftStyle : thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map(mk => {
                  const rev      = getA(mk, 'revenue')
                  const cleanings = getA(mk, 'cleanings')
                  const planRev  = getMonthPlanRevenue(mk)
                  const leads    = allChWithCustom.reduce((s, ch) => s + getA(mk, `leads_${ch.id}`), 0)
                  const booked   = allChWithCustom.reduce((s, ch) => s + getA(mk, `booked_${ch.id}`), 0)
                  const recurr   = allChWithCustom.reduce((s, ch) => s + getA(mk, `recurring_${ch.id}`), 0)
                  const avgTick  = cleanings > 0 ? rev / cleanings : 0
                  const close    = leads > 0 ? booked / leads * 100 : 0
                  const cancel   = getA(mk, 'cancelRecurring')
                  const reviews  = getA(mk, 'googleReviews')
                  const hasData  = rev > 0 || cleanings > 0 || leads > 0
                  return (
                    <tr key={mk} style={{ opacity: hasData ? 1 : 0.4 }}>
                      <td style={tdLeftStyle}><strong>{monthLabel(mk)}</strong></td>
                      <td style={tdStyle}>{rev > 0 ? fmt$(rev) : '—'}</td>
                      <td style={tdStyle}>{rev > 0 && planRev > 0 ? <VarBadge actual={rev} plan={planRev} /> : '—'}</td>
                      <td style={tdStyle}>{cleanings > 0 ? fmtN(cleanings) : '—'}</td>
                      <td style={tdStyle}>{avgTick > 0 ? fmt$(avgTick) : '—'}</td>
                      <td style={tdStyle}>{leads > 0 ? fmtN(leads) : '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: close > 0 ? 700 : 400, color: close >= 15 ? '#3B8C2A' : close > 0 ? '#B87800' : '#aaa' }}>{close > 0 ? fmtPct(close) : '—'}</td>
                      <td style={{ ...tdStyle, color: recurr > 0 ? '#6B5CE7' : '#aaa', fontWeight: recurr > 0 ? 700 : 400 }}>{recurr > 0 ? fmtN(recurr) : '—'}</td>
                      <td style={{ ...tdStyle, color: cancel > 0 ? '#C0392B' : '#aaa', fontWeight: cancel > 0 ? 700 : 400 }}>{cancel > 0 ? fmtN(cancel) : '—'}</td>
                      <td style={tdStyle}>{reviews > 0 ? fmtN(reviews) : '—'}</td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ background: '#f0f8fb', fontWeight: 700 }}>
                  <td style={{ ...tdLeftStyle, fontWeight: 700 }}>Total / Avg</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt$(periodRevenue)}</td>
                  <td style={tdStyle}><VarBadge actual={periodRevenue} plan={periodPlanRev} /></td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(periodCleanings)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{avgTicket > 0 ? fmt$(avgTicket) : '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(periodLeads)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: closeRate >= 15 ? '#3B8C2A' : closeRate > 0 ? '#B87800' : '#aaa' }}>{closeRate > 0 ? fmtPct(closeRate) : '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#6B5CE7' }}>{fmtN(periodRecurr)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(months.reduce((s, mk) => s + getA(mk, 'cancelRecurring'), 0))}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(months.reduce((s, mk) => s + getA(mk, 'googleReviews'), 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead source breakdown table */}
        {allChWithCustom.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #A7DBE7', background: '#f8fcfd' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>Lead Source Breakdown</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Period totals by channel</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Channel','Type','Leads','Booked','Close %','New Recurring','Rec %','Spend','CPL','ROAS'].map((h, i) => (
                      <th key={i} style={i === 0 ? thLeftStyle : thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allChWithCustom.map(ch => {
                    const isPaid    = ch.type === 'paid'
                    const leads     = months.reduce((s, mk) => s + getA(mk, `leads_${ch.id}`), 0)
                    const booked    = months.reduce((s, mk) => s + getA(mk, `booked_${ch.id}`), 0)
                    const recurr    = months.reduce((s, mk) => s + getA(mk, `recurring_${ch.id}`), 0)
                    const spend     = months.reduce((s, mk) => s + getA(mk, `spend_${ch.id}`), 0)
                    const close     = leads > 0 ? booked / leads * 100 : 0
                    const recPct    = booked > 0 ? recurr / booked * 100 : 0
                    const cpl       = isPaid && leads > 0 && spend > 0 ? spend / leads : 0
                    const chRev     = booked * (plan?.avg_ticket ?? 0)
                    const roas      = isPaid && spend > 0 ? chRev / spend : 0
                    return (
                      <tr key={ch.id}>
                        <td style={tdLeftStyle}><strong>{ch.name}</strong></td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: isPaid ? '#e6f2fb' : '#edfae5', color: isPaid ? '#0C85C2' : '#3B8C2A' }}>
                            {isPaid ? 'Paid' : 'Community'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{leads > 0 ? fmtN(leads) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#3B8C2A', fontWeight: booked > 0 ? 700 : 400 }}>{booked > 0 ? fmtN(booked) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: close >= 15 ? '#3B8C2A' : close > 0 ? '#B87800' : '#aaa' }}>{close > 0 ? fmtPct(close) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#6B5CE7', fontWeight: recurr > 0 ? 700 : 400 }}>{recurr > 0 ? fmtN(recurr) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: recPct >= 20 ? '#3B8C2A' : recPct > 0 ? '#B87800' : '#aaa' }}>{recPct > 0 ? fmtPct(recPct) : '—'}</td>
                        <td style={tdStyle}>{isPaid && spend > 0 ? fmt$(spend) : '—'}</td>
                        <td style={tdStyle}>{cpl > 0 ? fmt$(cpl) : '—'}</td>
                        <td style={tdStyle}>{roas > 0 ? <span style={{ fontWeight: 700, color: roas >= 2 ? '#3B8C2A' : roas >= 1 ? '#B87800' : '#C0392B' }}>{fmtN(roas, 1)}x</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function kpiColor(actual: number, plan: number) {
  if (!plan) return '#5AB3C9'
  const r = actual / plan
  if (r >= 0.9) return '#7CCA5B'
  if (r >= 0.7) return '#FFB600'
  return '#C0392B'
}
