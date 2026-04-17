'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt$(n: number) {
  if (!n) return '$0'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function fmtN(n: number) { return Math.round(n || 0).toLocaleString() }

// ── Marketing calc helpers (mirrors game-plan logic) ─────────
function calcPaid(cpl: number, conv: number, spend: number, avgTicket: number, recurPct: number, mrrVal: number) {
  const leads = cpl > 0 ? spend / cpl : 0
  const customers = leads * (conv / 100)
  return { leads, customers, oneTimeRev: customers * avgTicket, newMrr: customers * (recurPct / 100) * mrrVal }
}
function calcCommunity(conv: number, actions: number, avgTicket: number, recurPct: number, mrrVal: number) {
  const customers = actions * (conv / 100)
  return { customers, oneTimeRev: customers * avgTicket, newMrr: customers * (recurPct / 100) * mrrVal }
}

export default function BlueprintSummaryPage() {
  const router = useRouter()
  const [vision, setVision] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [coachMode, setCoachMode] = useState(false)
  const [coachNote, setCoachNote] = useState('')
  const [coachSaved, setCoachSaved] = useState(false)
  const [showVisionDetails, setShowVisionDetails] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      const [{ data: v }, { data: ps }, { data: pr }] = await Promise.all([
        supabase.from('vision').select('*').eq('user_id', uid).single(),
        supabase.from('gameplans').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', uid).single(),
      ])
      setVision(v)
      setProfile(pr)
      if (ps && ps.length > 0) {
        const active = ps.find((p: any) => p.is_active) ?? ps[0]
        const parsed = {
          ...active,
          seasonality: typeof active.seasonality === 'string' ? JSON.parse(active.seasonality) : active.seasonality ?? [],
          channels: typeof active.channels === 'string' ? JSON.parse(active.channels) : active.channels ?? { paid: [], community: [] },
          month_data: typeof active.month_data === 'string' ? JSON.parse(active.month_data) : active.month_data ?? {},
        }
        setPlan(parsed)
      }
      setLoading(false)
    })
  }, [])

  function saveCoachNote() {
    setCoachSaved(true)
    setTimeout(() => setCoachSaved(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888' }}>Loading Blueprint summary…</p>
        </div>
      </div>
    )
  }

  // ── Derived data ─────────────────────────────────────────────
  const rocks: any[] = Array.isArray(vision?.rocks) ? vision.rocks : (vision?.rocks ? JSON.parse(vision.rocks) : [])
  const coreValues: string[] = Array.isArray(vision?.core_values) ? vision.core_values : (vision?.core_values ? JSON.parse(vision.core_values) : [])
  const seasonality: number[] = plan?.seasonality ?? []
  const seasonSum = seasonality.reduce((a: number, b: number) => a + b, 0) || 1
  const annualGoal = plan?.annual_goal ?? vision?.one_yr_rev ?? 0
  const avgTicket = plan?.avg_ticket ?? vision?.avg_ticket ?? 0
  const baseMrr = plan?.base_mrr ?? vision?.baseline_revenue ?? 0
  const recurringPct = plan?.recurring_pct ?? 20
  const mrrVal = plan?.mrr_overridden ? plan.mrr_value : avgTicket
  const reviewsGoal = plan?.reviews_goal ?? 100
  const reviewsYtd = plan?.reviews_ytd ?? 0
  const reviewsPct = reviewsGoal > 0 ? Math.min(100, (reviewsYtd / reviewsGoal) * 100) : 0
  const monthsLeft = 12 - new Date().getMonth()
  const reviewsPace = monthsLeft > 0 ? Math.ceil(Math.max(0, reviewsGoal - reviewsYtd) / monthsLeft) : 0

  // Monthly revenue targets
  const monthTargets = seasonality.map((s: number) => annualGoal * (s / seasonSum))
  const maxTarget = Math.max(...monthTargets, 1)

  // Marketing for selected month
  const monthData = plan?.month_data?.[String(currentMonth)] ?? {}
  const paidChannels: any[] = plan?.channels?.paid ?? []
  const communityChannels: any[] = plan?.channels?.community ?? []

  let totalSpend = 0, totalLeads = 0, totalCustomers = 0, totalOneTime = 0, totalMrr = 0
  const paidRows = paidChannels.map(ch => {
    const spend = monthData[ch.id] ?? 0
    const out = calcPaid(ch.cpl ?? 0, ch.conv ?? 0, spend, avgTicket, recurringPct, mrrVal)
    totalSpend += spend
    totalLeads += out.leads
    totalCustomers += out.customers
    totalOneTime += out.oneTimeRev
    totalMrr += out.newMrr
    return { ...ch, spend, ...out }
  })
  const communityRows = communityChannels.map(ch => {
    const actions = monthData[ch.id] ?? 0
    const out = calcCommunity(ch.conv ?? 0, actions, avgTicket, recurringPct, mrrVal)
    totalLeads += out.customers // community doesn't separate leads
    totalCustomers += out.customers
    totalOneTime += out.oneTimeRev
    totalMrr += out.newMrr
    return { ...ch, actions, ...out }
  })

  // Profile display
  const displayName = profile?.full_name || profile?.name || profile?.email?.split('@')[0] || 'Franchisee'
  const initials = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
  const location = profile?.location ?? ''

  // Rock counts
  const onTrack = rocks.filter(r => r.status === 'In progress').length
  const notStarted = rocks.filter(r => r.status === 'Not started').length
  const done = rocks.filter(r => r.status === 'Done').length

  const rockStatusStyle = (status: string) => {
    if (status === 'Done') return { bg: '#edfae5', border: '#c8eed0', dot: '#7CCA5B', pill: { bg: '#edfae5', color: '#3B8C2A', label: 'Done' } }
    if (status === 'In progress') return { bg: '#f4fdf5', border: '#c8eed0', dot: '#7CCA5B', pill: { bg: '#edfae5', color: '#3B8C2A', label: 'In progress' } }
    return { bg: '#fafafa', border: '#E6F1F4', dot: '#ccc', pill: { bg: '#E6F1F4', color: '#888', label: 'Not started' } }
  }

  const qColor = (q: string) => {
    if (q?.includes('Q1')) return { bg: '#e6f4fb', color: '#0C85C2' }
    if (q?.includes('Q2')) return { bg: '#edfae5', color: '#3B8C2A' }
    if (q?.includes('Q3')) return { bg: '#fff8e1', color: '#B87800' }
    return { bg: '#f3f0ff', color: '#6B5CE7' }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#0C85C2', cursor: 'pointer' }} onClick={() => router.push('/blueprint')}>Blueprint</span>
          <span style={{ color: '#ccc' }}>›</span>
          <span>Summary</span>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Blueprint Summary</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '20px' }}>
          A single view of your full plan — Vision, Game Plan, and goals in one place.
        </div>

        {/* ── Identity bar ── */}
        <div style={{ background: '#2C3E50', borderRadius: '16px', padding: '22px 28px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#0C85C2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#fff', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#fff', lineHeight: 1.1 }}>{displayName}</div>
            <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.45)', marginTop: '3px' }}>
              {location && <>{location} &nbsp;·&nbsp;</>}
              {plan?.name ?? 'No active plan'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {vision && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(124,202,91,0.15)', color: '#7CCA5B' }}>Vision ✓</span>}
              {plan && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(90,179,201,0.15)', color: '#5AB3C9' }}>Game Plan ✓</span>}
              {vision && plan && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(124,202,91,0.15)', color: '#7CCA5B' }}>Blueprint complete</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => setCoachMode(m => !m)}
              style={{ height: '34px', padding: '0 14px', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: coachMode ? 'rgba(255,183,0,0.2)' : 'rgba(255,255,255,0.08)', color: coachMode ? '#FFB600' : 'rgba(255,255,255,0.7)', transition: 'all 0.15s' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: '5px', verticalAlign: 'middle' }}><circle cx="6" cy="4" r="2.5"/><path d="M1 11c0-2.8 2.2-4 5-4s5 1.2 5 4"/></svg>
              {coachMode ? 'Exit coach view' : 'Coach view'}
            </button>
            <button
              onClick={() => window.print()}
              style={{ height: '34px', padding: '0 14px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: '5px', verticalAlign: 'middle' }}><rect x="2" y="4" width="8" height="6" rx="1"/><path d="M4 4V2h4v2M4 8h4"/></svg>
              Print / save
            </button>
          </div>
        </div>

        {/* ── Coach note banner ── */}
        {coachMode && (
          <div style={{ background: '#fff8e1', border: '1px solid #FFE066', borderRadius: '12px', padding: '12px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fff3b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#B87800" strokeWidth="1.5"><path d="M7 1l1.2 3.6H12L9 7.8l1.2 3.6L7 9.2 3.8 11.4 5 7.8 2 5.6h3.8z"/></svg>
            </div>
            <div style={{ fontSize: '12.5px', color: '#7A5F00', lineHeight: 1.5, flexShrink: 0 }}><strong>Coach note</strong> — visible only to you.</div>
            <input
              type="text" value={coachNote} onChange={e => setCoachNote(e.target.value)}
              placeholder="Add a note for this coaching session… (e.g. 'Focus on Meta Ads ROI, ask about cleaner retention')"
              style={{ flex: 1, border: '1px solid #FFE066', borderRadius: '8px', padding: '7px 10px', fontSize: '12.5px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', background: '#fff', minWidth: '200px' }} />
            <button onClick={saveCoachNote} style={{ height: '30px', padding: '0 14px', background: '#FFB600', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {coachSaved ? 'Saved!' : 'Save note'}
            </button>
          </div>
        )}

        {/* ── Why statement ── */}
        {vision?.why_statement && (
          <div style={{ background: '#fff', borderRadius: '16px', borderLeft: '4px solid #5AB3C9', border: '0.5px solid #A7DBE7', padding: '20px 24px', marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Why statement — The Vision</span>
              <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Doesn't change month to month</span>
            </div>
            <div style={{ fontSize: '16px', color: '#2C3E50', fontStyle: 'italic', lineHeight: 1.6, padding: '14px 16px', background: '#f4fbfd', borderLeft: '3px solid #5AB3C9', borderRadius: '0 10px 10px 0' }}>
              "{vision.why_statement}"
            </div>
          </div>
        )}

        {/* ── Collapsible: Core values + Core focus ── */}
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => setShowVisionDetails(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '0.5px solid #A7DBE7', borderRadius: '10px', padding: '10px 16px', fontFamily: "'Open Sans', sans-serif", fontSize: '13px', fontWeight: 600, color: '#5AB3C9', cursor: 'pointer', width: '100%' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5AB3C9" strokeWidth="2"
              style={{ transition: 'transform 0.2s', transform: showVisionDetails ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
              <path d="M3 5l4 4 4-4"/>
            </svg>
            Core values &amp; core focus
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#aaa', fontWeight: 400 }}>
              {showVisionDetails ? 'Click to collapse' : 'Click to expand'}
            </span>
          </button>
          {showVisionDetails && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '10px' }}>
              <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 22px' }}>
                <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6B5CE7" strokeWidth="1.5"><path d="M7 1l1.2 3.6H12L9 7.8l1.2 3.6L7 9.2 3.8 11.4 5 7.8 2 5.6h3.8z"/></svg>} iconBg="#f3f0ff" title="Core values" source="The Vision" />
                {coreValues.length > 0
                  ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {coreValues.map(v => (
                        <span key={v} style={{ background: '#e6f4fb', color: '#0C85C2', fontSize: '12.5px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px' }}>{v}</span>
                      ))}
                    </div>
                  : <Empty>No core values saved yet.</Empty>
                }
              </div>
              <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 22px' }}>
                <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5AB3C9" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M7 4v3l2 2"/></svg>} iconBg="#E6F1F4" title="Core focus" source="The Vision" />
                {vision?.core_purpose
                  ? <div style={{ background: '#E6F1F4', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#2C3E50', lineHeight: 1.6 }}>{vision.core_purpose}</div>
                  : <Empty>No core focus saved yet.</Empty>
                }
              </div>
            </div>
          )}
        </div>

        {/* ── Revenue targets ── */}
        <div style={{ background: '#fff', borderRadius: '16px', borderTop: '3px solid #0C85C2', border: '0.5px solid #A7DBE7', padding: '20px 24px', marginBottom: '18px' }}>
          <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0C85C2" strokeWidth="1.5"><path d="M2 10l3-4 3 3 4-6"/></svg>} iconBg="#e6f4fb" title="Revenue targets" source="Vision + Game Plan" large />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
            {[
              { val: fmt$(annualGoal),                             label: '1-year revenue goal',   color: '#0C85C2', bg: '#e6f4fb', border: '#A7DBE7' },
              { val: fmt$(vision?.three_yr_rev ?? annualGoal * 2), label: '3-year target (2028)',   color: '#3B8C2A', bg: '#f4fdf5', border: '#c8eed0' },
              { val: fmt$(baseMrr),                                label: 'Base MRR today',         color: '#2C3E50', bg: '#E6F1F4', border: '#A7DBE7' },
              { val: `${vision?.profit_margin ?? 18}%`,            label: 'Target profit margin',   color: '#B87800', bg: '#fff8e1', border: '#FFE066' },
              { val: fmt$(avgTicket),                              label: 'Avg ticket value',        color: '#5AB3C9', bg: '#f4fbfd', border: '#A7DBE7' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {seasonality.length > 0 && (
            <div style={{ borderTop: '1px solid #E6F1F4', paddingTop: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Monthly distribution</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '52px' }}>
                {seasonality.map((v: number, i: number) => {
                  const h = maxTarget > 0 ? Math.round((monthTargets[i] / maxTarget) * 100) : 0
                  const isNow = i === new Date().getMonth()
                  return (
                    <div key={i} title={`${MONTHS_SHORT[i]}: ${fmt$(monthTargets[i])}`}
                      style={{ flex: 1, height: `${Math.max(h, 4)}%`, background: isNow ? '#0C85C2' : '#A7DBE7', borderRadius: '3px 3px 0 0', cursor: 'default', transition: 'background 0.15s' }} />
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                {MONTHS_SHORT.map(m => <div key={m} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: '#aaa', fontWeight: 700 }}>{m}</div>)}
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '5px' }}>Hover each bar for monthly target · current month highlighted in blue</div>
            </div>
          )}
        </div>

        {/* ── Google Reviews ── */}
        {plan && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 24px', marginBottom: '18px' }}>
            <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FFB600" strokeWidth="1.5"><path d="M7 1l1.2 3.6H12L9 7.8l1.2 3.6L7 9.2 3.8 11.4 5 7.8 2 5.6h3.8z"/></svg>} iconBg="#fff8e1" title="Google reviews" source="Game Plan" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#2C3E50' }}>{reviewsYtd} of {reviewsGoal} reviews</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: reviewsPct >= 100 ? '#3B8C2A' : '#0C85C2' }}>{Math.round(reviewsPct)}%</span>
                </div>
                <div style={{ height: '10px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ width: `${reviewsPct}%`, height: '100%', background: reviewsPct >= 100 ? '#7CCA5B' : '#FFB600', borderRadius: '20px', transition: 'width 0.35s' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { val: String(reviewsGoal), label: 'Annual goal', color: '#FFB600' },
                  { val: String(Math.max(0, reviewsGoal - reviewsYtd)), label: 'Still to earn', color: '#0C85C2' },
                  { val: `${reviewsPace}/mo`, label: 'Pace needed', color: '#3B8C2A' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#E6F1F4', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: s.color, lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Marketing snapshot ── */}
        {plan && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 24px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', paddingBottom: '12px', borderBottom: '1px solid #E6F1F4', flexWrap: 'wrap' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#e6f4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0C85C2" strokeWidth="1.5"><path d="M1 7h12M7 1l5 6-5 6"/></svg>
              </div>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13.5px', color: '#2C3E50' }}>
                Marketing plan — {MONTHS[currentMonth]} snapshot
              </span>
              <span style={{ fontSize: '11px', color: '#aaa' }}>Game Plan · paid + community</span>
              <div style={{ marginLeft: 'auto' }}>
                <select value={currentMonth} onChange={e => setCurrentMonth(parseInt(e.target.value))}
                  style={{ height: '28px', border: '1px solid #A7DBE7', borderRadius: '6px', fontSize: '12px', padding: '0 8px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', background: '#fff', cursor: 'pointer' }}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Channel','Conv. rate','Spend / input','Leads','Customers','One-time rev.','New MRR'].map((h, i) => (
                    <th key={h} style={{ background: '#E6F1F4', padding: '8px 12px', textAlign: i > 1 ? 'right' : 'left', fontSize: '10.5px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paidRows.length > 0 && (
                  <tr><td colSpan={7} style={{ background: '#f0f8ff', fontSize: '10.5px', fontWeight: 700, color: '#0C85C2', letterSpacing: '1px', textTransform: 'uppercase', padding: '6px 12px' }}>Paid leads</td></tr>
                )}
                {paidRows.map(ch => (
                  <tr key={ch.id}>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', color: '#2C3E50', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#0C85C2', flexShrink: 0 }} />{ch.name}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '60px', height: '6px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden', display: 'inline-block' }}>
                          <div style={{ width: `${Math.min(100, ch.conv)}%`, height: '100%', borderRadius: '20px', background: '#0C85C2' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#888' }}>{ch.conv}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>{fmt$(ch.spend)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>{fmtN(ch.leads)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#0C85C2' }}>{fmtN(ch.customers)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#3B8C2A' }}>{fmt$(ch.oneTimeRev)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#5AB3C9' }}>{fmt$(ch.newMrr)}</td>
                  </tr>
                ))}
                {communityRows.length > 0 && (
                  <tr><td colSpan={7} style={{ background: '#f4fdf5', fontSize: '10.5px', fontWeight: 700, color: '#3B8C2A', letterSpacing: '1px', textTransform: 'uppercase', padding: '6px 12px' }}>Community marketing</td></tr>
                )}
                {communityRows.map(ch => (
                  <tr key={ch.id}>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', color: '#2C3E50', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#7CCA5B', flexShrink: 0 }} />{ch.name}
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '60px', height: '6px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden', display: 'inline-block' }}>
                          <div style={{ width: `${Math.min(100, ch.conv)}%`, height: '100%', borderRadius: '20px', background: '#7CCA5B' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#888' }}>{ch.conv}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#3B8C2A' }}>{fmtN(ch.actions)} {ch.action_label ?? 'actions'}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>—</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#0C85C2' }}>{fmtN(ch.customers)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#3B8C2A' }}>{fmt$(ch.oneTimeRev)}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '0.5px solid #f0f4f6', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#5AB3C9' }}>{fmt$(ch.newMrr)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f7fbfd' }}>
                  <td colSpan={2} style={{ padding: '9px 12px', fontWeight: 700, borderTop: '1.5px solid #A7DBE7', color: '#2C3E50' }}>Totals</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, borderTop: '1.5px solid #A7DBE7' }}>{fmt$(totalSpend)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, borderTop: '1.5px solid #A7DBE7' }}>{fmtN(totalLeads)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#0C85C2', borderTop: '1.5px solid #A7DBE7' }}>{fmtN(totalCustomers)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#3B8C2A', borderTop: '1.5px solid #A7DBE7' }}>{fmt$(totalOneTime)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#5AB3C9', borderTop: '1.5px solid #A7DBE7' }}>{fmt$(totalMrr)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: '12px', background: '#E6F1F4', borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {[
                { val: fmt$(totalSpend), label: 'Total marketing spend', color: '#0C85C2' },
                { val: fmtN(totalLeads), label: 'Est. total leads',      color: '#2C3E50' },
                { val: fmt$(totalOneTime + totalMrr), label: 'Projected revenue', color: '#3B8C2A' },
                { val: fmt$(totalMrr),   label: 'New MRR added',         color: '#5AB3C9' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rocks ── */}
        {rocks.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 24px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', paddingBottom: '12px', borderBottom: '1px solid #E6F1F4', flexWrap: 'wrap' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#B87800" strokeWidth="1.5"><path d="M7 1l1.2 3.6H12L9 7.8l1.2 3.6L7 9.2 3.8 11.4 5 7.8 2 5.6h3.8z"/></svg>
              </div>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13.5px', color: '#2C3E50' }}>Rocks — quarterly priorities</span>
              <span style={{ fontSize: '11px', color: '#aaa' }}>The Vision</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {done > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B8C2A', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7CCA5B', display: 'inline-block' }} />{done} done</span>}
                {onTrack > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B8C2A', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7CCA5B', display: 'inline-block' }} />{onTrack} in progress</span>}
                {notStarted > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: '#888', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ccc', display: 'inline-block' }} />{notStarted} not started</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rocks.map((rock, i) => {
                const s = rockStatusStyle(rock.status)
                const q = qColor(rock.quarter)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${s.border}`, background: s.bg }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', color: '#2C3E50', flex: 1, lineHeight: 1.4 }}>{rock.outcome}</div>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: q.bg, color: q.color, flexShrink: 0 }}>{rock.quarter}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: s.pill.bg, color: s.pill.color, flexShrink: 0 }}>{s.pill.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 3-year picture ── */}
        {(vision?.horizon_1yr || vision?.horizon_3yr || vision?.horizon_dream) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 22px' }}>
              <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6B5CE7" strokeWidth="1.5"><path d="M2 10l3-4 3 3 4-6M2 13h10"/></svg>} iconBg="#f3f0ff" title="3-year picture" source="The Vision" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {vision?.horizon_1yr && (
                  <div style={{ background: '#e6f4fb', borderRadius: '10px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0C85C2', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>End of {new Date().getFullYear()}</div>
                    <div style={{ fontSize: '13px', color: '#2C3E50', lineHeight: 1.5, fontStyle: 'italic' }}>{vision.horizon_1yr}</div>
                  </div>
                )}
                {vision?.horizon_3yr && (
                  <div style={{ background: '#edfae5', borderRadius: '10px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#3B8C2A', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>End of {new Date().getFullYear() + 2} (3 years)</div>
                    <div style={{ fontSize: '13px', color: '#2C3E50', lineHeight: 1.5, fontStyle: 'italic' }}>{vision.horizon_3yr}</div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '20px 22px' }}>
              <BlockHeader icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6B5CE7" strokeWidth="1.5"><path d="M7 1l1.2 3.6H12L9 7.8l1.2 3.6L7 9.2 3.8 11.4 5 7.8 2 5.6h3.8z"/></svg>} iconBg="#f3f0ff" title="Dream state" source="The Vision" />
              {vision?.horizon_dream
                ? <div style={{ fontSize: '13px', color: '#2C3E50', lineHeight: 1.6, fontStyle: 'italic', padding: '10px 14px', background: '#f3f0ff', borderRadius: '10px' }}>{vision.horizon_dream}</div>
                : <div style={{ textAlign: 'center', padding: '24px', color: '#aaa', fontSize: '13px' }}>Complete The Vision to see your dream state.</div>
              }
            </div>
          </div>
        )}

        {/* ── Cleaner capacity placeholder ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px dashed #A7DBE7', padding: '20px 24px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#edfae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="#3B8C2A" strokeWidth="1.5"><circle cx="5" cy="4" r="2"/><circle cx="9" cy="4" r="2"/><path d="M1 12c0-2.2 1.8-4 4-4M9 8c2.2 0 4 1.8 4 4"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50' }}>Cleaner capacity</div>
            <div style={{ fontSize: '12.5px', color: '#aaa', marginTop: '2px' }}>Coming soon — track current teams, hiring targets, and what you need to onboard to hit your revenue goal.</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#E6F1F4', color: '#888', flexShrink: 0 }}>In development</span>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function BlockHeader({ icon, iconBg, title, source, large }: {
  icon: React.ReactNode; iconBg: string; title: string; source: string; large?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #E6F1F4' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: large ? '15px' : '13.5px', color: '#2C3E50' }}>{title}</span>
      <span style={{ fontSize: '11px', color: '#aaa', marginLeft: 'auto' }}>{source}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '12.5px', color: '#aaa', fontStyle: 'italic', padding: '10px 0' }}>{children}</div>
}
