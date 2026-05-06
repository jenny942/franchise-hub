'use client'

import React, { useEffect, useState, useRef } from 'react'
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
const CHART_COLORS = ['#0C85C2','#7CCA5B','#FFB600','#6B5CE7','#C0392B','#5AB3C9','#E67E22','#2ECC71','#E91E8C','#00BCD4']

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
function locationLabel(p: any) {
  if (p.mailing_city && p.mailing_state) return `${p.mailing_city}, ${p.mailing_state}`
  return p.full_name || 'Unknown'
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
  color: '#fff', background: '#2C3E50', whiteSpace: 'nowrap',
}
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: 'left' }
const tdStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontSize: '12px', color: '#2C3E50', borderTop: '1px solid #E6F1F4' }
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left' }

// Benchmark cell — color relative to system average
function BenchCell({ value, avg, fmt, higherBetter = true }: { value: number; avg: number; fmt: (n: number) => string; higherBetter?: boolean }) {
  if (value === 0 && avg === 0) return <span style={{ color: '#ccc' }}>—</span>
  if (avg === 0 || value === 0) return <span style={{ color: '#aaa' }}>{value > 0 ? fmt(value) : '—'}</span>
  const ratio = value / avg
  const good = higherBetter ? ratio >= 1 : ratio <= 1
  const neutral = Math.abs(ratio - 1) < 0.05
  const color = neutral ? '#2C3E50' : good ? '#3B8C2A' : '#C0392B'
  const bg = neutral ? 'transparent' : good ? '#edfae5' : '#fde8e8'
  return (
    <span style={{ fontWeight: 700, color, background: bg, padding: '2px 6px', borderRadius: '6px', fontSize: '12px' }}>
      {fmt(value)}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminReportsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  // All franchisees
  const [allProfiles, setAllProfiles] = useState<any[]>([])
  // Selected location IDs (empty = all)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Date range
  const [preset, setPreset] = useState('3mo')

  // Report data
  const [reportData, setReportData] = useState<{ profiles: any[]; actuals: any[]; gameplans: any[] } | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Feature flag
  const [reportsEnabled, setReportsEnabled] = useState(false)
  const [togglingFlag, setTogglingFlag] = useState(false)

  // Active tab
  const [tab, setTab] = useState<'overview' | 'locations' | 'leadsources'>('overview')

  const range = getMonthRange(preset)
  const months = monthsBetween(range.from, range.to)

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role !== 'corporate') { router.push('/dashboard'); return }

      const profilesRes = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const profilesJson = await profilesRes.json()
      const profiles = (profilesJson.profiles ?? [])
        .filter((p: any) => p.role === 'franchisee')
        .sort((a: any, b: any) => (a.mailing_city ?? '').localeCompare(b.mailing_city ?? ''))
      setAllProfiles(profiles)

      const { data: flag } = await supabase
        .from('feature_flags').select('enabled').eq('key', 'reports_enabled').maybeSingle()
      setReportsEnabled(flag?.enabled ?? false)

      setLoading(false)
    })

    // Close dropdown on outside click
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLocationDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Fetch report data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || loading) return
    fetchReport()
  }, [session, preset, selectedIds, loading])

  async function fetchReport() {
    if (!session) return
    setReportLoading(true)
    const user_ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_ids, month_from: range.from, month_to: range.to }),
    })
    const data = await res.json()
    setReportData(data)
    setReportLoading(false)
  }

  async function toggleReportsFlag() {
    setTogglingFlag(true)
    const newVal = !reportsEnabled
    await supabase.from('feature_flags')
      .upsert({ key: 'reports_enabled', enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setReportsEnabled(newVal)
    setTogglingFlag(false)
  }

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

  // ── Data helpers ──────────────────────────────────────────────────────────
  const profiles: any[] = reportData?.profiles ?? []
  const actualsRows: any[] = reportData?.actuals ?? []
  const gameplansRows: any[] = reportData?.gameplans ?? []

  // Map: user_id → month_key → data
  const actualsByUser: Record<string, Record<string, Record<string, any>>> = {}
  for (const row of actualsRows) {
    if (!actualsByUser[row.user_id]) actualsByUser[row.user_id] = {}
    actualsByUser[row.user_id][row.month_key] = row.data ?? {}
  }

  // Map: user_id → parsed channels
  const channelsByUser: Record<string, { paid: any[]; community: any[] }> = {}
  for (const gp of gameplansRows) {
    const ch = typeof gp.channels === 'string' ? JSON.parse(gp.channels || '{"paid":[],"community":[]}') : (gp.channels ?? { paid: [], community: [] })
    channelsByUser[gp.user_id] = ch
  }

  function getA(userId: string, monthKey: string, key: string): number {
    return (actualsByUser[userId]?.[monthKey]?.[key] as number) ?? 0
  }

  function userPeriodMetric(userId: string, key: string) {
    return months.reduce((s, mk) => s + getA(userId, mk, key), 0)
  }

  function userAllChannels(userId: string): any[] {
    const ch = channelsByUser[userId] ?? { paid: [], community: [] }
    const customPaid: any[] = [], customComm: any[] = []
    for (const mk of months) {
      const d = actualsByUser[userId]?.[mk] ?? {}
      try { JSON.parse(d.n_customPaidChannels || '[]').forEach((c: any) => { if (!customPaid.find(x => x.id === c.id)) customPaid.push({ ...c, type: 'paid' }) }) } catch {}
      try { JSON.parse(d.n_customCommChannels || '[]').forEach((c: any) => { if (!customComm.find(x => x.id === c.id)) customComm.push({ ...c, type: 'community' }) }) } catch {}
    }
    return [...ch.paid, ...ch.community, ...customPaid, ...customComm]
  }

  function userLeads(userId: string) {
    const chs = userAllChannels(userId)
    return months.reduce((s, mk) => s + chs.reduce((cs, ch) => cs + getA(userId, mk, `leads_${ch.id}`), 0), 0)
  }
  function userBooked(userId: string) {
    const chs = userAllChannels(userId)
    return months.reduce((s, mk) => s + chs.reduce((cs, ch) => cs + getA(userId, mk, `booked_${ch.id}`), 0), 0)
  }
  function userRecurring(userId: string) {
    const chs = userAllChannels(userId)
    return months.reduce((s, mk) => s + chs.reduce((cs, ch) => cs + getA(userId, mk, `recurring_${ch.id}`), 0), 0)
  }
  function userSpend(userId: string) {
    const ch = channelsByUser[userId] ?? { paid: [], community: [] }
    const customPaid: any[] = []
    for (const mk of months) {
      const d = actualsByUser[userId]?.[mk] ?? {}
      try { JSON.parse(d.n_customPaidChannels || '[]').forEach((c: any) => { if (!customPaid.find(x => x.id === c.id)) customPaid.push(c) }) } catch {}
    }
    return months.reduce((s, mk) =>
      s + [...ch.paid, ...customPaid].reduce((cs, c) => cs + getA(userId, mk, `spend_${c.id}`), 0), 0)
  }

  // System-wide aggregates
  const sysRevenue   = profiles.reduce((s, p) => s + userPeriodMetric(p.id, 'revenue'), 0)
  const sysCleanings = profiles.reduce((s, p) => s + userPeriodMetric(p.id, 'cleanings'), 0)
  const sysLeads     = profiles.reduce((s, p) => s + userLeads(p.id), 0)
  const sysBooked    = profiles.reduce((s, p) => s + userBooked(p.id), 0)
  const sysRecurring = profiles.reduce((s, p) => s + userRecurring(p.id), 0)
  const sysSpend     = profiles.reduce((s, p) => s + userSpend(p.id), 0)
  const sysReviews   = profiles.reduce((s, p) => s + userPeriodMetric(p.id, 'googleReviews'), 0)
  const n = profiles.length || 1
  const avgRevenue   = sysRevenue / n
  const avgLeads     = sysLeads / n
  const avgClose     = sysLeads > 0 ? sysBooked / sysLeads * 100 : 0
  const avgTicket    = sysCleanings > 0 ? sysRevenue / sysCleanings : 0
  const avgRecurring = sysRecurring / n

  // ── Lead Source Benchmark ─────────────────────────────────────────────────
  // Collect all unique channel names (normalized) across all locations
  const channelNameMap = new Map<string, { name: string; type: string }>() // normalizedName → {name, type}
  for (const p of profiles) {
    const chs = userAllChannels(p.id)
    for (const ch of chs) {
      const key = ch.name.trim().toLowerCase()
      if (!channelNameMap.has(key)) channelNameMap.set(key, { name: ch.name.trim(), type: ch.type ?? 'paid' })
    }
  }
  const allChannelNames = Array.from(channelNameMap.entries()) // [normalizedName, {name, type}]

  // For each channel name, get per-location leads/booked/spend/recurring
  type ChBenchRow = {
    normalizedName: string
    displayName: string
    type: string
    sysLeads: number
    sysBooked: number
    sysSpend: number
    sysRecurring: number
    perLocation: Record<string, { leads: number; booked: number; spend: number; recurring: number; channelId: string | null }>
  }

  const benchRows: ChBenchRow[] = allChannelNames.map(([normName, meta]) => {
    const perLocation: ChBenchRow['perLocation'] = {}
    let sysL = 0, sysB = 0, sysS = 0, sysR = 0
    for (const p of profiles) {
      const chs = userAllChannels(p.id)
      const ch = chs.find((c: any) => c.name.trim().toLowerCase() === normName)
      if (!ch) { perLocation[p.id] = { leads: 0, booked: 0, spend: 0, recurring: 0, channelId: null }; continue }
      const leads    = months.reduce((s, mk) => s + getA(p.id, mk, `leads_${ch.id}`), 0)
      const booked   = months.reduce((s, mk) => s + getA(p.id, mk, `booked_${ch.id}`), 0)
      const spend    = months.reduce((s, mk) => s + getA(p.id, mk, `spend_${ch.id}`), 0)
      const recurring = months.reduce((s, mk) => s + getA(p.id, mk, `recurring_${ch.id}`), 0)
      perLocation[p.id] = { leads, booked, spend, recurring, channelId: ch.id }
      sysL += leads; sysB += booked; sysS += spend; sysR += recurring
    }
    return { normalizedName: normName, displayName: meta.name, type: meta.type, sysLeads: sysL, sysBooked: sysB, sysSpend: sysS, sysRecurring: sysR, perLocation }
  }).filter(r => r.sysLeads > 0 || r.sysBooked > 0)
    .sort((a, b) => b.sysLeads - a.sysLeads)

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartLabels = months.map(monthLabel)

  const revTrendData = {
    labels: chartLabels,
    datasets: profiles.slice(0, 8).map((p, i) => ({
      label: locationLabel(p),
      data: months.map(mk => getA(p.id, mk, 'revenue')),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: 'transparent',
      tension: 0.3, pointRadius: 3,
    })),
  }

  const sysRevTrendData = {
    labels: chartLabels,
    datasets: [{
      label: 'System Total Revenue',
      data: months.map(mk => profiles.reduce((s, p) => s + getA(p.id, mk, 'revenue'), 0)),
      borderColor: '#0C85C2', backgroundColor: 'rgba(12,133,194,0.08)',
      tension: 0.3, fill: true, pointRadius: 4,
    }],
  }

  const leadsTrendData = {
    labels: chartLabels,
    datasets: profiles.slice(0, 8).map((p, i) => ({
      label: locationLabel(p),
      data: months.map(mk => {
        const chs = userAllChannels(p.id)
        return chs.reduce((s, ch) => s + getA(p.id, mk, `leads_${ch.id}`), 0)
      }),
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      stack: 'leads',
    })),
  }

  const chartOptions = (yPrefix = '') => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { font: { size: 10 }, boxWidth: 10 } }, title: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        grid: { color: '#f0f4f6' }, ticks: {
          font: { size: 10 },
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
  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'locations', label: 'Locations' },
    { key: 'leadsources', label: 'Lead Sources' },
  ]

  const selectedCount = selectedIds.size
  const locationBtnLabel = selectedCount === 0
    ? `All Locations (${allProfiles.length})`
    : `${selectedCount} Location${selectedCount > 1 ? 's' : ''} Selected`

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Open Sans', sans-serif", background: '#E6F1F4' }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50', margin: 0 }}>Franchisor Reports</h1>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              {profiles.length} location{profiles.length !== 1 ? 's' : ''} · {months.length > 1 ? `${monthLabel(range.from)} – ${monthLabel(range.to)}` : monthLabel(range.from)}
            </div>
          </div>

          {/* Location filter */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setLocationDropdownOpen(v => !v)}
              style={{
                padding: '7px 14px', border: '1px solid #A7DBE7', borderRadius: '8px', background: '#fff',
                fontSize: '12px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
                color: selectedCount > 0 ? '#0C85C2' : '#2C3E50', fontWeight: selectedCount > 0 ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              📍 {locationBtnLabel}
              <span style={{ fontSize: '10px', color: '#aaa' }}>▼</span>
            </button>
            {locationDropdownOpen && (
              <div style={{
                position: 'absolute', top: '38px', left: 0, zIndex: 100,
                background: '#fff', border: '1px solid #A7DBE7', borderRadius: '10px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: '260px', maxHeight: '320px', overflowY: 'auto',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6F1F4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>FILTER LOCATIONS</span>
                  <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '11px', color: '#0C85C2', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear all</button>
                </div>
                {allProfiles.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', cursor: 'pointer', fontSize: '12px', color: '#2C3E50', borderBottom: '1px solid #f5f5f5' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={e => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(p.id) : next.delete(p.id)
                          return next
                        })
                      }}
                    />
                    <span>{locationLabel(p)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#aaa' }}>{p.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', border: '1px solid #A7DBE7', borderRadius: '8px', overflow: 'hidden' }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)} style={{
                padding: '7px 12px', fontSize: '12px', cursor: 'pointer', border: 'none',
                background: preset === p.key ? '#0C85C2' : '#fff',
                color: preset === p.key ? '#fff' : '#666',
                fontFamily: "'Open Sans', sans-serif", fontWeight: preset === p.key ? 700 : 400,
                borderRight: '1px solid #A7DBE7',
              }}>{p.label}</button>
            ))}
          </div>

          {/* Feature flag toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#888' }}>Network Benchmarks for Franchisees</div>
              <div style={{ fontSize: '10px', color: '#aaa' }}>Lets Zees compare vs system averages</div>
            </div>
            <button
              onClick={toggleReportsFlag}
              disabled={togglingFlag}
              style={{
                padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                background: reportsEnabled ? '#3B8C2A' : '#ccc',
                color: '#fff', fontSize: '12px', fontWeight: 700, fontFamily: "'Open Sans', sans-serif",
                transition: 'background 0.2s',
              }}
            >{togglingFlag ? '…' : reportsEnabled ? '✓ Enabled' : 'Disabled'}</button>
          </div>
        </div>

        {reportLoading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#5AB3C9' }}>Loading report data…</div>
        )}

        {!reportLoading && (
          <>
            {/* Aggregate KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px', marginBottom: '24px' }}>
              {[
                { label: 'System Revenue', value: fmt$(sysRevenue), sub: `Avg: ${fmt$(avgRevenue)} / loc` },
                { label: 'Avg Ticket', value: avgTicket > 0 ? fmt$(avgTicket) : '—', sub: 'System average' },
                { label: 'System Leads', value: fmtN(sysLeads), sub: `Avg: ${fmtN(avgLeads)} / loc` },
                { label: 'Close Rate', value: avgClose > 0 ? fmtPct(avgClose) : '—', sub: 'System average' },
                { label: 'New Recurring', value: fmtN(sysRecurring), sub: `Avg: ${fmtN(avgRecurring)} / loc` },
                { label: 'Google Reviews', value: fmtN(sysReviews), sub: `Avg: ${fmtN(sysReviews / n)} / loc` },
              ].map((card, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '14px 16px', borderTop: `3px solid ${CHART_COLORS[i]}` }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>{card.label}</div>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50' }}>{card.value}</div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '2px solid #A7DBE7', marginBottom: '20px', gap: '4px' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                  padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: '13px', fontFamily: "'Open Sans', sans-serif",
                  fontWeight: tab === t.key ? 700 : 400,
                  color: tab === t.key ? '#0C85C2' : '#666',
                  borderBottom: tab === t.key ? '2px solid #0C85C2' : '2px solid transparent',
                  marginBottom: '-2px',
                }}>{t.label}</button>
              ))}
            </div>

            {/* ── Overview Tab ── */}
            {tab === 'overview' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px' }}>
                    <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>System Revenue Trend</div>
                    <div style={{ height: '220px' }}>
                      <Line data={sysRevTrendData} options={chartOptions('$')} />
                    </div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px' }}>
                    <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>Revenue by Location</div>
                    <div style={{ height: '220px' }}>
                      <Line data={revTrendData} options={chartOptions('$')} />
                    </div>
                  </div>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', padding: '20px', marginBottom: '20px' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50', marginBottom: '14px' }}>Leads by Location</div>
                  <div style={{ height: '200px' }}>
                    <Bar data={leadsTrendData} options={{ ...chartOptions(), scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } }, y: { stacked: true, grid: { color: '#f0f4f6' }, ticks: { font: { size: 10 } } } } }} />
                  </div>
                </div>
              </>
            )}

            {/* ── Locations Tab ── */}
            {tab === 'locations' && (
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Location','Revenue','Cleanings','Avg Ticket','Leads','Close %','New Recurring','Cancellations','Spend','Reviews'].map((h, i) => (
                          <th key={i} style={i === 0 ? thLeftStyle : thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {profiles
                        .map(p => {
                          const rev      = userPeriodMetric(p.id, 'revenue')
                          const cleanings = userPeriodMetric(p.id, 'cleanings')
                          const leads    = userLeads(p.id)
                          const booked   = userBooked(p.id)
                          const recurring = userRecurring(p.id)
                          const spend    = userSpend(p.id)
                          const cancel   = userPeriodMetric(p.id, 'cancelRecurring')
                          const reviews  = userPeriodMetric(p.id, 'googleReviews')
                          const ticket   = cleanings > 0 ? rev / cleanings : 0
                          const close    = leads > 0 ? booked / leads * 100 : 0
                          return { p, rev, cleanings, leads, booked, recurring, spend, cancel, reviews, ticket, close }
                        })
                        .sort((a, b) => b.rev - a.rev)
                        .map(({ p, rev, cleanings, leads, booked, recurring, spend, cancel, reviews, ticket, close }) => (
                          <tr key={p.id}>
                            <td style={tdLeftStyle}>
                              <strong>{locationLabel(p)}</strong>
                              <div style={{ fontSize: '11px', color: '#aaa' }}>{p.full_name}</div>
                            </td>
                            <td style={tdStyle}><BenchCell value={rev} avg={avgRevenue} fmt={fmt$} /></td>
                            <td style={tdStyle}>{cleanings > 0 ? fmtN(cleanings) : '—'}</td>
                            <td style={tdStyle}><BenchCell value={ticket} avg={avgTicket} fmt={fmt$} /></td>
                            <td style={tdStyle}><BenchCell value={leads} avg={avgLeads} fmt={fmtN} /></td>
                            <td style={tdStyle}>
                              <BenchCell value={close} avg={avgClose} fmt={v => fmtPct(v)} />
                            </td>
                            <td style={tdStyle}><BenchCell value={recurring} avg={avgRecurring} fmt={fmtN} /></td>
                            <td style={{ ...tdStyle, color: cancel > 0 ? '#C0392B' : '#aaa' }}>{cancel > 0 ? fmtN(cancel) : '—'}</td>
                            <td style={tdStyle}>{spend > 0 ? fmt$(spend) : '—'}</td>
                            <td style={tdStyle}>{reviews > 0 ? fmtN(reviews) : '—'}</td>
                          </tr>
                        ))}
                      {/* System avg row */}
                      <tr style={{ background: '#f0f8fb', fontWeight: 700, borderTop: '2px solid #A7DBE7' }}>
                        <td style={{ ...tdLeftStyle, fontWeight: 700 }}>System Average</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt$(avgRevenue)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(sysCleanings / n)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{avgTicket > 0 ? fmt$(avgTicket) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(avgLeads)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: avgClose >= 15 ? '#3B8C2A' : '#B87800' }}>{avgClose > 0 ? fmtPct(avgClose) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(avgRecurring)}</td>
                        <td style={tdStyle}>—</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt$(sysSpend / n)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(sysReviews / n)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 16px', background: '#f8fcfd', fontSize: '11px', color: '#aaa', borderTop: '1px solid #E6F1F4' }}>
                  Green = above system average · Red = below system average (±5% shown as neutral)
                </div>
              </div>
            )}

            {/* ── Lead Sources Tab ── */}
            {tab === 'leadsources' && (
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden', marginBottom: '20px' }}>
                {benchRows.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>No lead data recorded for this period.</div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thLeftStyle}>Channel</th>
                            <th style={thStyle}>Type</th>
                            <th style={{ ...thStyle, background: '#1a2a36' }}>Sys Leads</th>
                            <th style={{ ...thStyle, background: '#1a2a36' }}>Sys Close %</th>
                            <th style={{ ...thStyle, background: '#1a2a36' }}>Sys CPL</th>
                            {profiles.map(p => (
                              <th key={p.id} style={{ ...thStyle, background: '#2C3E50', minWidth: '110px' }}>
                                {locationLabel(p)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {benchRows.map(row => {
                            const sysClose = row.sysLeads > 0 ? row.sysBooked / row.sysLeads * 100 : 0
                            const sysCPL   = row.sysLeads > 0 && row.sysSpend > 0 ? row.sysSpend / row.sysLeads : 0
                            return (
                              <tr key={row.normalizedName}>
                                <td style={tdLeftStyle}><strong>{row.displayName}</strong></td>
                                <td style={tdStyle}>
                                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: row.type === 'paid' ? '#e6f2fb' : '#edfae5', color: row.type === 'paid' ? '#0C85C2' : '#3B8C2A' }}>
                                    {row.type === 'paid' ? 'Paid' : 'Community'}
                                  </span>
                                </td>
                                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(row.sysLeads / n)}</td>
                                <td style={{ ...tdStyle, fontWeight: 700, color: sysClose >= 15 ? '#3B8C2A' : sysClose > 0 ? '#B87800' : '#aaa' }}>{sysClose > 0 ? fmtPct(sysClose) : '—'}</td>
                                <td style={tdStyle}>{sysCPL > 0 ? fmt$(sysCPL) : '—'}</td>
                                {profiles.map(p => {
                                  const loc = row.perLocation[p.id]
                                  if (!loc || loc.channelId === null) {
                                    return <td key={p.id} style={{ ...tdStyle, color: '#ddd', textAlign: 'center' }}>—</td>
                                  }
                                  const locClose = loc.leads > 0 ? loc.booked / loc.leads * 100 : 0
                                  const locCPL   = loc.leads > 0 && loc.spend > 0 ? loc.spend / loc.leads : 0
                                  const avgSysLeadsPerLoc = row.sysLeads / n
                                  return (
                                    <td key={p.id} style={{ ...tdStyle, padding: '6px 10px' }}>
                                      <div>
                                        <BenchCell value={loc.leads} avg={avgSysLeadsPerLoc} fmt={fmtN} />
                                        <span style={{ fontSize: '10px', color: '#aaa' }}> leads</span>
                                      </div>
                                      {loc.leads > 0 && (
                                        <div style={{ fontSize: '10.5px', marginTop: '2px' }}>
                                          <span style={{ color: locClose >= 15 ? '#3B8C2A' : locClose > 0 ? '#B87800' : '#aaa', fontWeight: 700 }}>
                                            {locClose > 0 ? `${fmtPct(locClose)} close` : '—'}
                                          </span>
                                          {row.type === 'paid' && locCPL > 0 && (
                                            <span style={{ color: '#aaa' }}> · {fmt$(locCPL)}/lead</span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '10px 16px', background: '#f8fcfd', fontSize: '11px', color: '#aaa', borderTop: '1px solid #E6F1F4' }}>
                      Leads shown per-location for the selected period. Green = above system average. Channels matched by name across locations.
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
