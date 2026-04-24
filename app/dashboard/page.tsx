'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Tooltip, Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler)

function fmt(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%' }
function monthLabel(iso: string) {
  const [year, month] = iso.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return names[parseInt(month) - 1] + ' ' + year.slice(2)
}
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const ANNOUNCEMENT = "🎟️ Don't miss it — buy your MaidThis LIVE 2026 tickets now!"

// ── ZOR DASHBOARD ────────────────────────────────────────────
function ZorDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/zor').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <LoadingState />

  const { kpis, leaderboard, trend, sources, period } = data

  const trendChart = {
    labels: trend.map((t: any) => monthLabel(t.month)),
    datasets: [{
      label: 'Network Revenue', data: trend.map((t: any) => t.amount),
      borderColor: '#0C85C2', backgroundColor: 'rgba(90,179,201,0.08)',
      borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#0C85C2', fill: true, tension: 0.4,
    }]
  }
  const sourceChart = {
    labels: sources.map((s: any) => s.source),
    datasets: [{ data: sources.map((s: any) => s.count), backgroundColor: ['#0C85C2','#5AB3C9','#7CCA5B','#FFB600','#A7DBE7','#2C3E50'], borderRadius: 4, borderWidth: 0 }]
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#aaa', callback: (v: any) => fmt(v) } }
    }
  }

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      {/* Announcement */}
      <div style={{ background: '#fff8e1', border: '1px solid #FFB600', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ width: '18px', height: '18px', background: '#FFB600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="#7A5F00"><path d="M5 1l.5 5h-1L5 1zm0 6.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>
        </div>
        <div style={{ fontSize: '13px', color: '#7A5F00' }}>{ANNOUNCEMENT}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>Network Overview</div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>{period?.current ? monthLabel(period.current) : ''} &nbsp;·&nbsp; All {kpis.active_locations} active locations</div>
        </div>
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#0C85C2', background: '#e6f4fb', borderRadius: '20px', padding: '4px 12px' }}>Zor View</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Network Revenue', value: fmt(kpis.total_revenue), change: fmtPct(kpis.revenue_mom) + ' vs last month', up: kpis.revenue_mom >= 0 },
          { label: 'Active Locations', value: kpis.active_locations, change: 'of 35 total', up: true },
          { label: 'New Customers', value: kpis.total_won.toLocaleString(), change: 'won this month', up: true },
          { label: 'New Customer Value', value: fmt(kpis.total_won_value), change: 'pipeline revenue', up: true },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>{kpi.label}</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: '#2C3E50' }}>{kpi.value}</div>
            <div style={{ fontSize: '12px', marginTop: '5px', color: kpi.up ? '#7CCA5B' : '#e05252', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill={kpi.up ? '#7CCA5B' : '#e05252'}>{kpi.up ? <path d="M6 2l4 5H2z"/> : <path d="M6 10L2 5h8z"/>}</svg>
              {kpi.change}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Network revenue trend</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Last 12 months — all locations combined</div>
          <div style={{ height: '200px' }}><Line data={trendChart} options={chartOpts as any} /></div>
        </div>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Leads by source</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>This month — all locations</div>
          <div style={{ height: '200px' }}><Bar data={sourceChart} options={chartOpts as any} /></div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Location leaderboard</div>
        <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Top 10 by revenue this month</div>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px', gap: '10px', padding: '6px 8px', marginBottom: '4px' }}>
          {['#', 'Location', 'Revenue', 'MoM', 'New Customers'].map(h => (
            <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {leaderboard.map((loc: any, i: number) => {
          const mom = loc.prev_revenue > 0 ? ((loc.revenue - loc.prev_revenue) / loc.prev_revenue) * 100 : null
          return (
            <div key={loc.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px', gap: '10px', padding: '10px 8px', alignItems: 'center', borderTop: '0.5px solid #E6F1F4' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: i < 3 ? '#0C85C2' : '#A7DBE7' }}>#{i + 1}</div>
              <div style={{ fontSize: '13.5px', color: '#2C3E50', fontWeight: 600 }}>{loc.name_ghl}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>{fmt(loc.revenue)}</div>
              <div style={{ fontSize: '12px', color: mom === null ? '#aaa' : mom >= 0 ? '#7CCA5B' : '#e05252', fontWeight: 600 }}>{mom === null ? '—' : fmtPct(mom)}</div>
              <div style={{ fontSize: '13px', color: '#888' }}>{loc.won_count}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ZEE DASHBOARD ────────────────────────────────────────────
function ZeeDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [bizProfileId, setBizProfileId] = useState<string | null>(null)
  const [forecastInput, setForecastInput] = useState('')
  const [editingForecast, setEditingForecast] = useState(false)
  const [session, setSession] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)
      fetch('/api/dashboard/zee', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }).then(r => r.json()).then(d => { setData(d); setBizProfileId(d.biz_profile_id ?? null); setLoading(false) })
    })
  }, [])

  async function saveForecast() {
    setEditingForecast(false)
    const val = parseFloat(forecastInput) || 0
    if (!bizProfileId) return
    await supabase.from('business_profiles').update({ forecasted_sales: val }).eq('id', bizProfileId)
    setData((prev: any) => prev ? { ...prev, kpis: { ...prev.kpis, forecasted_sales: val } } : prev)
  }

  if (loading) return <LoadingState />

  const { kpis, trend, targets, leaderboard, goals, profile, period, hasGamePlan } = data

  const trendChart = {
    labels: trend.map((t: any) => monthLabel(t.month)),
    datasets: [
      {
        label: 'Revenue', data: trend.map((t: any) => t.amount),
        borderColor: '#0C85C2', backgroundColor: 'rgba(90,179,201,0.08)',
        borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#0C85C2', fill: true, tension: 0.4,
      },
      ...(targets?.some((t: any) => t.amount !== null) ? [{
        label: 'Game Plan Target', data: (targets ?? []).map((t: any) => t.amount),
        borderColor: '#FFB600', backgroundColor: 'transparent',
        borderWidth: 2, borderDash: [5, 5], pointRadius: 2, pointBackgroundColor: '#FFB600',
        fill: false, tension: 0.4, spanGaps: true,
      }] : []),
    ]
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#aaa', callback: (v: any) => fmt(v) } }
    }
  }

  const firstName = profile?.name?.split(' ')[0] || 'there'
  const today = new Date()
  const weekNum = Math.ceil((((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)

  const todos = [
    { text: 'Review your Blueprint game plan', badge: 'This week', color: '#0C85C2', badgeBg: '#e6f4fb', badgeText: '#0C85C2' },
    { text: 'Follow up with 3 inactive clients', badge: 'In progress', color: '#7CCA5B', badgeBg: '#eafbdf', badgeText: '#3B7A1A' },
    { text: 'Check your Google Business Profile reviews', badge: 'This week', color: '#A7DBE7', badgeBg: '#e6f4fb', badgeText: '#0C85C2' },
  ]

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

      {/* Announcement banner */}
      <div style={{ background: '#fff8e1', border: '1px solid #FFB600', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ width: '18px', height: '18px', background: '#FFB600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="#7A5F00"><path d="M5 1l.5 5h-1L5 1zm0 6.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>
        </div>
        <div style={{ fontSize: '13px', color: '#7A5F00' }}>{ANNOUNCEMENT}</div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#5AB3C9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50', flexShrink: 0, overflow: 'hidden', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (profile?.name ? profile.name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() : '?')}
          </div>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>
              {greeting()}, <span style={{ color: '#0C85C2' }}>{firstName}.</span> Let's get it.
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>
              {period?.current ? monthLabel(period.current) : ''} &nbsp;·&nbsp; Week {weekNum} of 52
            </div>
          </div>
        </div>
        <select style={{ height: '36px', border: '1px solid #A7DBE7', borderRadius: '10px', background: '#fff', padding: '0 12px', fontSize: '13px', color: '#2C3E50', outline: 'none' }}>
          <option>This month</option>
          <option>Last month</option>
          <option>This quarter</option>
          <option>YTD</option>
        </select>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>

        {/* Forecasted Sales — manually editable */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Forecasted Sales</div>
            <span
              title="Find this in your CRM under Reports → Revenue Forecast or your pipeline summary. Update it manually each month."
              style={{ fontSize: '13px', color: '#A7DBE7', cursor: 'help', userSelect: 'none', lineHeight: 1 }}
            >ⓘ</span>
          </div>
          {editingForecast ? (
            <input
              autoFocus type="number" value={forecastInput}
              onChange={e => setForecastInput(e.target.value)}
              onBlur={saveForecast}
              onKeyDown={e => { if (e.key === 'Enter') saveForecast(); if (e.key === 'Escape') setEditingForecast(false) }}
              style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50', border: '1.5px solid #0C85C2', borderRadius: '8px', padding: '2px 8px', outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: '#2C3E50' }}>{fmt(kpis.forecasted_sales)}</div>
              <button
                onClick={() => { setForecastInput(String(kpis.forecasted_sales || 0)); setEditingForecast(true) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A7DBE7', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#A7DBE7" strokeWidth="1.5"><path d="M9 2l2 2-7 7H2V9l7-7z"/><path d="M7.5 3.5l2 2"/></svg>
              </button>
            </div>
          )}
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#aaa' }}>this month · click to update</div>
        </div>

        {/* Recurring Sales (MRR) */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Recurring Sales</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: '#2C3E50' }}>{fmt(kpis.mrr)}</div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#7CCA5B', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="#7CCA5B"><path d="M6 2l4 5H2z"/></svg>
            {hasGamePlan
              ? (kpis.mrr_target > kpis.mrr ? fmt(kpis.mrr_target - kpis.mrr) + ' projected growth' : 'on plan')
              : 'set in Game Plan'}
          </div>
        </div>

        {/* Avg Ticket Price */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Avg Ticket Price</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: '#2C3E50' }}>{fmt(kpis.avg_job_value)}</div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#7CCA5B', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="#7CCA5B"><path d="M6 2l4 5H2z"/></svg>
            per booking
          </div>
        </div>

        {/* Network Standing */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Network Standing</div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: kpis.network_rank <= 3 ? '#3B8C2A' : '#2C3E50' }}>
            #{kpis.network_rank}
          </div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#aaa', lineHeight: 1.5 }}>
            {period?.current ? monthLabel(period.current) : ''} · Updated mid-month
            {kpis.revenue_to_next_rank > 0 && (
              <div style={{ color: '#7CCA5B', marginTop: '1px' }}>{fmt(kpis.revenue_to_next_rank)} to next rank</div>
            )}
          </div>
        </div>

      </div>

      {/* Mid grid: chart + goals */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>
            Revenue — <span style={{ color: '#0C85C2' }}>{profile?.location}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>Last 12 months</div>
          {targets?.some((t: any) => t.amount !== null) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#888' }}>
                <div style={{ width: '18px', height: '2px', background: '#0C85C2', borderRadius: '2px' }} />
                Actual
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#888' }}>
                <div style={{ width: '18px', height: '2px', background: '#FFB600', borderRadius: '2px', borderTop: '2px dashed #FFB600', boxSizing: 'border-box' as const }} />
                Game Plan
              </div>
            </div>
          )}
          <div style={{ height: '200px' }}><Line data={trendChart} options={chartOpts as any} /></div>
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Monthly goal progress</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>
            {hasGamePlan ? `Targets from your active Game Plan` : `${fmt(kpis.revenue)} this month`}
          </div>
          {goals.map((g: any) => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0
            const over = g.target > 0 && g.current >= g.target
            return (
              <div key={g.label} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', color: '#2C3E50', flex: 1 }}>{g.label}</div>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>
                    {g.hasTarget ? `${['Revenue', 'MRR'].includes(g.label) ? fmt(g.current) : g.current} / ${['Revenue', 'MRR'].includes(g.label) ? fmt(g.target) : g.target}` : '—'}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: over ? '#3B8C2A' : '#0C85C2', width: '36px', textAlign: 'right' }}>
                    {g.hasTarget ? `${pct}%` : '—'}
                  </div>
                </div>
                <div style={{ height: '8px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: over ? '#7CCA5B' : g.color, borderRadius: '20px', transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
          {!hasGamePlan && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid #E6F1F4', fontSize: '12px', color: '#aaa' }}>
              Set your <span onClick={() => router.push('/blueprint/game-plan')} style={{ color: '#0C85C2', cursor: 'pointer', fontWeight: 600 }}>Game Plan</span> to see real targets here.
            </div>
          )}
        </div>
      </div>

      {/* Bottom grid: todos + leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Your to-dos</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Things that need your attention</div>
          {todos.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: i < todos.length - 1 ? '0.5px solid #E6F1F4' : 'none' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <div style={{ fontSize: '13.5px', color: '#2C3E50', flex: 1 }}>{t.text}</div>
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', background: t.badgeBg, color: t.badgeText }}>{t.badge}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Network leaderboard</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Top franchisees by revenue this month</div>
          {leaderboard.map((item: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', marginBottom: '2px',
              background: item.you ? '#E6F1F4' : 'transparent',
              borderRadius: item.you ? '8px' : '0',
              borderBottom: !item.you && i < leaderboard.length - 1 ? '0.5px solid #E6F1F4' : 'none',
            }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: item.you ? '#0C85C2' : '#A7DBE7', width: '24px' }}>#{item.rank}</div>
              <div style={{ flex: 1, fontSize: '13.5px', color: item.you ? '#0C85C2' : '#2C3E50', fontWeight: item.you ? 700 : 400 }}>{item.name}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#0C85C2' }}>{fmt(item.revenue)}</div>
            </div>
          ))}
          {kpis.revenue_to_next_rank > 0 && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#aaa' }}>
              {fmt(kpis.revenue_to_next_rank)} away from the next rank. Just saying.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── LOADING STATE ────────────────────────────────────────────
function LoadingState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#888', fontFamily: "'Open Sans', sans-serif" }}>Loading your dashboard...</p>
    </div>
  )
}

// ── MAIN PAGE — routes by role ────────────────────────────────
export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: p }) => setRole(p?.role ?? 'franchisee'))
    })
  }, [])

  if (!role) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4' }}>
      <Sidebar />
      <LoadingState />
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      {role === 'corporate' ? <ZorDashboard /> : <ZeeDashboard />}
    </div>
  )
}
