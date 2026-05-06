'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

type Tab = 'profile' | 'blueprint' | 'dashboard'

interface UserDetail {
  profile: {
    id: string; full_name: string; email: string; role: string
    location_id: string | null; location_name: string | null
    mailing_street?: string; mailing_city?: string; mailing_state?: string
    mailing_zip?: string; avatar_url?: string; status?: string; created_at?: string
  }
  biz_profile: {
    territory?: string; dba_name?: string; forecasted_sales?: number
    recurring_sales?: number; avg_ticket_price?: number
  } | null
  vision: {
    inspiring_why?: string; five_year_vision?: string; one_year_vision?: string
    north_star_metric?: string; north_star_value?: number
  } | null
  gameplan: {
    revenue_target?: number; jobs_target?: number; mrr_target?: number
    reviews_target?: number
  } | null
  stats: {
    revenue_this_month: number; revenue_prev_month: number
    jobs_this_month: number; network_rank: number
  }
  trend: { month: string; amount: number }[]
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] +
    ' ' + d.getDate() + ', ' + d.getFullYear()
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: value ? '#2C3E50' : '#bbb' }}>{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '14px', color: '#2C3E50', marginBottom: '18px' }}>{title}</div>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>{children}</div>
}

export default function AdminUserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params?.id as string

  const [tab, setTab] = useState<Tab>('profile')
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role !== 'corporate') { router.push('/dashboard'); return }

      const res = await fetch(`/api/admin/user/${userId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!json.error) setData(json)
      setLoading(false)
    })
  }, [userId])

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '14px' }}>Loading…</div>
    </div>
  )

  if (!data) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '14px' }}>User not found.</div>
    </div>
  )

  const { profile, biz_profile, vision, gameplan, stats, trend } = data
  const isZor = profile.role === 'corporate'
  const initials = profile.full_name
    ? profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const trendLabels = trend.map(t => {
    const [y, m] = t.month.split('-')
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]
  })
  const trendAmounts = trend.map(t => t.amount)

  const pct = stats.revenue_prev_month > 0
    ? Math.round(((stats.revenue_this_month - stats.revenue_prev_month) / stats.revenue_prev_month) * 100)
    : null

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', border: 'none',
    fontFamily: "'Open Sans', sans-serif", fontWeight: tab === t ? 700 : 400,
    background: tab === t ? '#0C85C2' : 'transparent',
    color: tab === t ? '#fff' : '#888',
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Back + Header */}
        <button onClick={() => router.push('/admin/users')} style={{ background: 'none', border: 'none', color: '#5AB3C9', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ← All Users
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#5AB3C9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#2C3E50', overflow: 'hidden', flexShrink: 0 }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>{profile.full_name || '—'}</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>{profile.email}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: isZor ? '#fff8e1' : '#e6f4fb', color: isZor ? '#B87800' : '#0C85C2' }}>
              {isZor ? 'Zor' : 'Zee'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: profile.status === 'active' ? '#edfae5' : '#fff8e1', color: profile.status === 'active' ? '#3B8C2A' : '#B87800' }}>
              {profile.status === 'active' ? 'Active' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: '#fff', border: '0.5px solid #A7DBE7', borderRadius: '12px', padding: '4px', width: 'fit-content', marginBottom: '24px' }}>
          <button style={tabStyle('profile')} onClick={() => setTab('profile')}>Profile</button>
          <button style={tabStyle('blueprint')} onClick={() => setTab('blueprint')}>Blueprint</button>
          {!isZor && <button style={tabStyle('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>}
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <>
            <Section title="Personal Information">
              <Grid>
                <Field label="Full Name" value={profile.full_name} />
                <Field label="Email" value={profile.email} />
                <Field label="Role" value={isZor ? 'Zor (Franchisor)' : 'Zee (Franchisee)'} />
                <Field label="Joined" value={fmtDate(profile.created_at)} />
                <Field label="Street" value={profile.mailing_street} />
                <Field label="City" value={profile.mailing_city} />
                <Field label="State" value={profile.mailing_state} />
                <Field label="Zip" value={profile.mailing_zip} />
              </Grid>
            </Section>

            {!isZor && (
              <Section title="Business Information">
                <Grid>
                  <Field label="Territory" value={biz_profile?.territory} />
                  <Field label="DBA Name" value={biz_profile?.dba_name} />
                  <Field label="Location" value={profile.location_name} />
                  <div />
                  <Field label="Forecasted Sales" value={biz_profile?.forecasted_sales != null ? fmt(biz_profile.forecasted_sales) : undefined} />
                  <Field label="Recurring Sales (MRR)" value={biz_profile?.recurring_sales != null ? fmt(biz_profile.recurring_sales) : undefined} />
                  <Field label="Avg Ticket Price" value={biz_profile?.avg_ticket_price != null ? fmt(biz_profile.avg_ticket_price) : undefined} />
                </Grid>
              </Section>
            )}
          </>
        )}

        {/* ── BLUEPRINT TAB ── */}
        {tab === 'blueprint' && (
          <>
            <Section title="The Vision">
              {!vision ? (
                <div style={{ color: '#bbb', fontSize: '13px' }}>No vision set up yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <Field label="Inspiring Why" value={vision.inspiring_why} />
                  <Field label="5-Year Vision" value={vision.five_year_vision} />
                  <Field label="1-Year Vision" value={vision.one_year_vision} />
                  <Grid>
                    <Field label="North Star Metric" value={vision.north_star_metric} />
                    <Field label="North Star Target" value={vision.north_star_value != null ? String(vision.north_star_value) : undefined} />
                  </Grid>
                </div>
              )}
            </Section>

            <Section title="The Game Plan">
              {!gameplan ? (
                <div style={{ color: '#bbb', fontSize: '13px' }}>No game plan set up yet.</div>
              ) : (
                <Grid>
                  <Field label="Revenue Target" value={gameplan.revenue_target != null ? fmt(gameplan.revenue_target) : undefined} />
                  <Field label="Jobs Target" value={gameplan.jobs_target != null ? String(gameplan.jobs_target) : undefined} />
                  <Field label="MRR Target" value={gameplan.mrr_target != null ? fmt(gameplan.mrr_target) : undefined} />
                  <Field label="Google Reviews Target" value={gameplan.reviews_target != null ? String(gameplan.reviews_target) : undefined} />
                </Grid>
              )}
            </Section>
          </>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab === 'dashboard' && !isZor && (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '16px' }}>
              {[
                { label: 'Revenue This Month', value: fmt(stats.revenue_this_month) },
                { label: 'Revenue Last Month', value: fmt(stats.revenue_prev_month) },
                { label: 'Jobs This Month', value: String(stats.jobs_this_month) },
                { label: 'Network Rank', value: stats.network_rank ? `#${stats.network_rank}` : '—' },
              ].map(card => (
                <div key={card.label} style={{ background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '18px 20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '8px' }}>{card.label}</div>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>{card.value}</div>
                  {card.label === 'Revenue This Month' && pct !== null && (
                    <div style={{ fontSize: '12px', marginTop: '4px', color: pct >= 0 ? '#3B8C2A' : '#c0392b', fontWeight: 600 }}>
                      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs last month
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Revenue trend chart */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '14px', color: '#2C3E50', marginBottom: '16px' }}>Revenue Trend (6 months)</div>
              {trend.length === 0 ? (
                <div style={{ color: '#bbb', fontSize: '13px' }}>No revenue data available.</div>
              ) : (
                <div style={{ height: '180px' }}>
                  <Line
                    data={{
                      labels: trendLabels,
                      datasets: [{
                        label: 'Revenue',
                        data: trendAmounts,
                        borderColor: '#0C85C2',
                        backgroundColor: 'rgba(12,133,194,0.08)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#0C85C2',
                        pointRadius: 4,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } },
                        y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, color: '#aaa', callback: (v: any) => '$' + (v / 1000).toFixed(0) + 'k' } },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            {/* Goal targets */}
            {gameplan && (
              <Section title="Game Plan Targets">
                <Grid>
                  <Field label="Revenue Target" value={gameplan.revenue_target != null ? fmt(gameplan.revenue_target) : undefined} />
                  <Field label="Jobs Target" value={gameplan.jobs_target != null ? String(gameplan.jobs_target) + ' jobs' : undefined} />
                  <Field label="MRR Target" value={gameplan.mrr_target != null ? fmt(gameplan.mrr_target) : undefined} />
                  <Field label="Google Reviews Target" value={gameplan.reviews_target != null ? String(gameplan.reviews_target) + ' reviews' : undefined} />
                </Grid>
              </Section>
            )}
          </>
        )}

      </div>
    </div>
  )
}
