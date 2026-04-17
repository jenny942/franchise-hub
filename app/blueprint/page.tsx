'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

function fmt(n: number) {
  if (!n) return '—'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

export default function BlueprintPage() {
  const router = useRouter()
  const [vision, setVision] = useState<any>(null)
  const [gameplan, setGameplan] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const userId = session.user.id

      const [{ data: v }, { data: g }] = await Promise.all([
        supabase.from('vision').select('*').eq('user_id', userId).single(),
        supabase.from('gameplans').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
      ])
      setVision(v)
      setGameplan(g)
      setLoading(false)
    })
  }, [])

  // Calculate completion percentages
  const visionFields = [
    { key: 'personal_why', check: (v: any) => !!v?.personal_why },
    { key: 'core_values',  check: (v: any) => Array.isArray(v?.core_values) ? v.core_values.length > 0 : v?.core_values && v.core_values !== '[]' },
    { key: 'core_purpose', check: (v: any) => !!v?.core_purpose || !!v?.core_niche },
    { key: 'horizon_1yr',  check: (v: any) => !!v?.horizon_1yr || !!v?.horizon_3yr },
    { key: 'one_year_plan',check: (v: any) => !!v?.one_year_plan },
    { key: 'rocks',        check: (v: any) => Array.isArray(v?.rocks) ? v.rocks.length > 0 : v?.rocks && v.rocks !== '[]' },
  ]
  const visionDone = visionFields.filter(f => f.check(vision)).length
  const visionPct = Math.round((visionDone / 6) * 100)

  const gameplanFields = ['revenue_goal', 'base_revenue', 'avg_job_value', 'close_rate', 'monthly_curve', 'marketing_mix', 'team_goals', 'quarterly_milestones']
  const gameplanDone = gameplan ? gameplanFields.filter(f => gameplan[f] && gameplan[f] !== '[]' && gameplan[f] !== '{}' && gameplan[f] !== '0').length : 0
  const gameplanPct = Math.round((gameplanDone / gameplanFields.length) * 100)

  const overallPct = Math.round((visionPct + gameplanPct) / 2)

  const visionStatus = visionPct === 0 ? 'Not started' : visionPct === 100 ? 'Complete' : 'In progress'
  const gameplanStatus = gameplanPct === 0 ? 'Not started' : gameplanPct === 100 ? 'Complete' : 'In progress'

  const visionItems = [
    { label: 'Personal why', field: 'personal_why' },
    { label: 'Core values', field: 'core_values' },
    { label: 'Core focus & purpose', field: 'core_focus' },
    { label: '3-year picture', field: 'three_year_picture' },
    { label: '1-year plan', field: 'one_year_plan' },
    { label: 'Rocks (quarterly priorities)', field: 'rocks' },
  ]

  const gameplanItems = [
    { label: 'Revenue goal + base revenue', field: 'revenue_goal' },
    { label: 'Customer value & conversion', field: 'avg_job_value' },
    { label: 'Monthly revenue curve', field: 'monthly_curve' },
    { label: 'Marketing channel mix', field: 'marketing_mix' },
    { label: 'Team & staffing goals', field: 'team_goals' },
    { label: 'Quarterly milestones', field: 'quarterly_milestones' },
  ]

  const statusStyle = (s: string) => {
    if (s === 'Complete') return { background: '#edfae5', color: '#3B8C2A' }
    if (s === 'In progress') return { background: '#fff8e1', color: '#B87800' }
    return { background: '#E6F1F4', color: '#888' }
  }

  const lastUpdated = () => {
    const dates = [vision?.updated_at, gameplan?.updated_at].filter(Boolean)
    if (!dates.length) return null
    const d = new Date(dates.sort().reverse()[0])
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Blueprint</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Blueprint</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '24px' }}>
          Your complete franchise planning system — where your vision drives your numbers.
        </div>

        {/* Hero */}
        <div style={{ background: '#2C3E50', borderRadius: '18px', padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-60px', top: '-60px', width: '260px', height: '260px', borderRadius: '50%', background: 'rgba(90,179,201,0.08)' }} />
          <div style={{ position: 'absolute', right: '40px', bottom: '-80px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(12,133,194,0.1)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Your planning system</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '28px', color: '#fff', lineHeight: 1.2, marginBottom: '10px' }}>
              Build it once.<br />Execute all year.
            </div>
            <div style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.6)', maxWidth: '480px', lineHeight: 1.6 }}>
              Blueprint has two parts. <strong style={{ color: '#5AB3C9' }}>The Vision</strong> is your long-range foundation — your why, your values, your 3-year picture. <strong style={{ color: '#7CCA5B' }}>The Game Plan</strong> is where that vision becomes this year's numbers.
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, background: 'rgba(90,179,201,0.12)', border: '1px solid rgba(90,179,201,0.25)', borderRadius: '14px', padding: '18px 22px', textAlign: 'center', minWidth: '130px' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '32px', color: '#5AB3C9', lineHeight: 1 }}>{overallPct}%</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>Blueprint complete</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '16px 22px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#2C3E50', whiteSpace: 'nowrap' }}>Overall progress</div>
          <div style={{ flex: 1, height: '8px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ width: `${overallPct}%`, height: '100%', borderRadius: '20px', background: 'linear-gradient(90deg, #0C85C2, #5AB3C9)', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0C85C2', whiteSpace: 'nowrap' }}>{overallPct}%</div>
        </div>

        {/* Quick stats */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
            {[
              { label: 'Revenue goal', value: gameplan?.revenue_goal ? fmt(gameplan.revenue_goal) : '$0', sub: 'Set in Game Plan', blue: !!gameplan?.revenue_goal },
              { label: '3-year target', value: vision?.three_yr_rev ? fmt(vision.three_yr_rev) : '—', sub: 'Set in The Vision', blue: !!vision?.three_yr_rev },
              { label: 'Rocks this quarter', value: vision?.rocks ? (Array.isArray(vision.rocks) ? vision.rocks.length : (JSON.parse(vision.rocks)?.length ?? 0)) : '—', sub: 'priorities set', green: true },
              { label: 'Last updated', value: lastUpdated() ?? '—', sub: 'Blueprint activity', small: true },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: s.small ? '16px' : '22px', color: s.blue ? '#0C85C2' : s.green ? '#3B8C2A' : '#2C3E50' }}>{s.value}</div>
                <div style={{ fontSize: '11.5px', color: '#aaa', marginTop: '3px' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Module cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '24px' }}>

          {/* Vision card */}
          <div
            onClick={() => router.push('/blueprint/vision')}
            style={{ background: '#fff', borderRadius: '18px', border: `0.5px solid ${visionPct === 100 ? '#7CCA5B' : '#A7DBE7'}`, padding: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(12,133,194,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#0C85C2' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = visionPct === 100 ? '#7CCA5B' : '#A7DBE7' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(180deg, #0C85C2, #5AB3C9)', borderRadius: '18px 0 0 18px' }} />
            <div style={{ paddingLeft: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#e6f4fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#0C85C2" strokeWidth="1.6">
                    <circle cx="11" cy="11" r="9" />
                    <path d="M11 6v5l3 3" />
                    <circle cx="11" cy="11" r="2" fill="#0C85C2" stroke="none" />
                  </svg>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', ...statusStyle(visionStatus) }}>{visionStatus}</span>
              </div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '17px', color: '#2C3E50', marginBottom: '4px' }}>The Vision</div>
              <div style={{ fontSize: '11px', color: '#5AB3C9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Revisit annually</div>
              <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.6, marginBottom: '16px' }}>Your foundation. Define why you own this business, what you stand for, and where you're headed — 1 year, 3 years, and beyond.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                {visionItems.map(item => {
                  const done = vision && vision[item.field] && vision[item.field] !== '[]'
                  return (
                    <div key={item.field} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: done ? '#aaa' : '#2C3E50' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: done ? '#ccc' : '#0C85C2' }} />
                      <span style={done ? { textDecoration: 'line-through' } : {}}>{item.label}</span>
                    </div>
                  )
                })}
              </div>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 18px', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12.5px', border: 'none', cursor: 'pointer', background: '#0C85C2', color: '#fff' }}>
                {visionPct === 0 ? 'Start Vision ↗' : visionPct === 100 ? 'Review Vision ↗' : 'Continue Vision ↗'}
              </button>
            </div>
          </div>

          {/* Game Plan card */}
          <div
            onClick={() => gameplanPct > 0 || visionPct > 0 ? router.push('/blueprint/game-plan') : undefined}
            style={{ background: '#fff', borderRadius: '18px', border: `0.5px solid ${gameplanPct === 100 ? '#7CCA5B' : '#A7DBE7'}`, padding: '24px', cursor: visionPct > 0 ? 'pointer' : 'default', position: 'relative', overflow: 'hidden', opacity: visionPct === 0 ? 0.6 : 1, transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { if (visionPct > 0) { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(12,133,194,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = '#7CCA5B' }}}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = gameplanPct === 100 ? '#7CCA5B' : '#A7DBE7' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(180deg, #7CCA5B, #5AB3C9)', borderRadius: '18px 0 0 18px' }} />
            <div style={{ paddingLeft: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#edfae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#7CCA5B" strokeWidth="1.6">
                    <rect x="3" y="3" width="16" height="16" rx="3" />
                    <path d="M7 15l3-4 3 3 3-5" />
                  </svg>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', ...statusStyle(gameplanStatus) }}>{gameplanStatus}</span>
              </div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '17px', color: '#2C3E50', marginBottom: '4px' }}>The Game Plan</div>
              <div style={{ fontSize: '11px', color: '#5AB3C9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Revisit monthly</div>
              <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.6, marginBottom: '16px' }}>Your year in numbers. Set revenue targets, model your lead flow, map your seasonality, and build the team that gets you there.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                {gameplanItems.map(item => {
                  const done = gameplan && gameplan[item.field] && gameplan[item.field] !== '[]' && gameplan[item.field] !== '0'
                  return (
                    <div key={item.field} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: done ? '#aaa' : '#2C3E50' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: done ? '#ccc' : '#7CCA5B' }} />
                      <span style={done ? { textDecoration: 'line-through' } : {}}>{item.label}</span>
                    </div>
                  )
                })}
              </div>
              {visionPct === 0 ? (
                <div style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>Complete The Vision first to unlock the Game Plan.</div>
              ) : (
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 18px', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12.5px', border: 'none', cursor: 'pointer', background: '#7CCA5B', color: '#fff' }}>
                  {gameplanPct === 0 ? 'Start Game Plan ↗' : gameplanPct === 100 ? 'Review Game Plan ↗' : 'Continue Game Plan ↗'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Connection note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: '#A7DBE7', maxWidth: '160px' }} />
          <div style={{ background: '#E6F1F4', borderRadius: '20px', padding: '4px 14px', fontSize: '11.5px', color: '#5AB3C9', fontWeight: 700 }}>The Vision informs The Game Plan</div>
          <div style={{ flex: 1, height: '1px', background: '#A7DBE7', maxWidth: '160px' }} />
        </div>

        {/* Tip */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#e6f4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#0C85C2" strokeWidth="1.5">
              <circle cx="9" cy="9" r="7" />
              <path d="M9 8v5M9 6v.5" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#2C3E50', marginBottom: '2px' }}>Start with The Vision, then build The Game Plan</div>
            <div style={{ fontSize: '12.5px', color: '#888', lineHeight: 1.5 }}>Your 1-year plan and quarterly Rocks in The Vision should directly shape the revenue targets and milestones you set in The Game Plan. Do them in order for the best results.</div>
          </div>
        </div>

      </div>
    </div>
  )
}
