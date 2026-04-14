'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Tooltip, Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler)

function fmt(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + n.toFixed(0)
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

function monthLabel(iso: string) {
  const [year, month] = iso.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return names[parseInt(month) - 1] + ' ' + year.slice(2)
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/zor')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontFamily: "'Open Sans', sans-serif" }}>Loading network data...</p>
      </div>
    </div>
  )

  const { kpis, leaderboard, trend, sources, period } = data

  const trendChart = {
    labels: trend.map((t: any) => monthLabel(t.month)),
    datasets: [{
      label: 'Network Revenue',
      data: trend.map((t: any) => t.amount),
      borderColor: '#0C85C2',
      backgroundColor: 'rgba(90,179,201,0.08)',
      borderWidth: 2.5,
      pointRadius: 3,
      pointBackgroundColor: '#0C85C2',
      fill: true,
      tension: 0.4,
    }]
  }

  const sourceChart = {
    labels: sources.map((s: any) => s.source),
    datasets: [{
      data: sources.map((s: any) => s.count),
      backgroundColor: ['#0C85C2','#5AB3C9','#7CCA5B','#FFB600','#A7DBE7','#2C3E50'],
      borderRadius: 4,
      borderWidth: 0,
    }]
  }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#aaa', callback: (v: any) => fmt(v) } }
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />

      <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>
              Network Overview
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>
              {period?.current ? monthLabel(period.current) : ''} &nbsp;·&nbsp; All {kpis.active_locations} active locations
            </div>
          </div>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#0C85C2', background: '#e6f4fb', borderRadius: '20px', padding: '4px 12px' }}>
            Zor View
          </span>
        </div>

        {/* KPI cards */}
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
                <svg width="12" height="12" viewBox="0 0 12 12" fill={kpi.up ? '#7CCA5B' : '#e05252'}>
                  {kpi.up ? <path d="M6 2l4 5H2z"/> : <path d="M6 10L2 5h8z"/>}
                </svg>
                {kpi.change}
              </div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Network revenue trend</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Last 12 months — all locations combined</div>
            <div style={{ height: '200px' }}>
              <Line data={trendChart} options={chartOpts as any} />
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Leads by source</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>This month — all locations</div>
            <div style={{ height: '200px' }}>
              <Bar data={sourceChart} options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { font: { size: 11 }, color: '#aaa' } } } } as any} />
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Location leaderboard</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Top 10 by revenue this month</div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px', gap: '10px', padding: '6px 8px', marginBottom: '4px' }}>
            {['#', 'Location', 'Revenue', 'MoM', 'New Customers'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {leaderboard.map((loc: any, i: number) => {
            const mom = loc.prev_revenue > 0
              ? ((loc.revenue - loc.prev_revenue) / loc.prev_revenue) * 100
              : null
            return (
              <div key={loc.id} style={{
                display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px',
                gap: '10px', padding: '10px 8px', alignItems: 'center',
                borderTop: '0.5px solid #E6F1F4',
              }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: i < 3 ? '#0C85C2' : '#A7DBE7' }}>#{i + 1}</div>
                <div style={{ fontSize: '13.5px', color: '#2C3E50', fontWeight: 600 }}>{loc.name_ghl}</div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>{fmt(loc.revenue)}</div>
                <div style={{ fontSize: '12px', color: mom === null ? '#aaa' : mom >= 0 ? '#7CCA5B' : '#e05252', fontWeight: 600 }}>
                  {mom === null ? '—' : fmtPct(mom)}
                </div>
                <div style={{ fontSize: '13px', color: '#888' }}>{loc.won_count}</div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
