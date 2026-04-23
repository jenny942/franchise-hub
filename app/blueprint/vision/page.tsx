'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

function fmt(n: number) {
  if (!n) return '$0'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

type Rock = { outcome: string; quarter: string; status: string }

type VisionForm = {
  income_goal: number
  income_target_date: string
  profit_margin: number
  growth_multiplier: number
  one_yr_rev: number
  one_yr_overridden: boolean
  three_yr_rev: number
  three_yr_overridden: boolean
  why_statement: string
  core_values: string[]
  core_purpose: string
  horizon_1yr: string
  horizon_3yr: string
  horizon_dream: string
  one_year_plan: string
  one_yr_obstacle: string
  avg_ticket: number
  baseline_revenue: number
  rocks: Rock[]
}

const MAIDTHIS_CORE_FOCUS = "We are a tech-forward cleaning company that puts the customer experience front and center. We prioritize efficient and flexible cleaning solutions to give our clients back their time. Our service guarantees back our brand promise whether it's a home owner, small business, or vacation rental."

const BRENE_VALUES = [
  'Accountability','Achievement','Adventure','Authenticity','Balance','Beauty','Being the best',
  'Belonging','Career','Caring','Collaboration','Commitment','Community','Compassion',
  'Competence','Confidence','Connection','Contentment','Contribution','Cooperation','Courage',
  'Creativity','Curiosity','Dignity','Diversity','Environment','Equality','Ethics','Excellence',
  'Fairness','Faith','Family','Financial stability','Forgiveness','Freedom','Friendship','Fun',
  'Future generations','Generosity','Grace','Gratitude','Growth','Harmony','Health','Home',
  'Honesty','Hope','Humility','Humor','Inclusion','Independence','Integrity','Initiative',
  'Joy','Justice','Kindness','Knowledge','Leadership','Learning','Legacy','Loyalty',
  'Making a difference','Meaningful work','Openness','Optimism','Order','Patience','Patriotism',
  'Peace','Perseverance','Power','Pride','Recognition','Reliability','Respect','Responsibility',
  'Security','Self-discipline','Self-expression','Service','Simplicity','Spirituality','Stewardship',
  'Success','Thrift','Time','Tradition','Travel','Trust','Truth','Vision','Vulnerability','Well-being','Wisdom',
]

const DEFAULTS: VisionForm = {
  income_goal: 0,
  income_target_date: '',
  profit_margin: 18,
  growth_multiplier: 2,
  one_yr_rev: 0,
  one_yr_overridden: false,
  three_yr_rev: 0,
  three_yr_overridden: false,
  why_statement: '',
  core_values: [],
  core_purpose: '',
  horizon_1yr: '',
  horizon_3yr: '',
  horizon_dream: '',
  one_year_plan: '',
  one_yr_obstacle: '',
  avg_ticket: 0,
  baseline_revenue: 0,
  rocks: [],
}

type PlanDrift = {
  annual_goal?: { vision: number; plan: number }
  avg_ticket?: { vision: number; plan: number }
  base_mrr?: { vision: number; plan: number }
}

export default function VisionPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<VisionForm>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [newValue, setNewValue] = useState('')
  const [showValueSuggestions, setShowValueSuggestions] = useState(false)
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [planDrift, setPlanDrift] = useState<PlanDrift | null>(null)
  const [syncingPlan, setSyncingPlan] = useState(false)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Computed values
  const oneYrCalc = form.profit_margin > 0 ? form.income_goal / (form.profit_margin / 100) : 0
  const threeYrCalc = oneYrCalc * form.growth_multiplier
  const displayOneYr = form.one_yr_overridden ? form.one_yr_rev : oneYrCalc
  const displayThreeYr = form.three_yr_overridden ? form.three_yr_rev : threeYrCalc

  // Section completion
  const sectionDone = [
    !!form.why_statement,
    form.core_values.length > 0,
    !!form.core_purpose,
    !!(form.horizon_1yr || form.horizon_3yr || form.horizon_dream),
    !!form.one_year_plan,
    form.rocks.length > 0,
  ]

  // Load existing data
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)
      const [{ data: v }, { data: ps }] = await Promise.all([
        supabase.from('vision').select('*').eq('user_id', uid).single(),
        supabase.from('gameplans').select('id, annual_goal, avg_ticket, base_mrr, is_active').eq('user_id', uid).order('created_at', { ascending: false }),
      ])
      if (v) {
        setForm({
          ...DEFAULTS,
          ...v,
          core_values: Array.isArray(v.core_values) ? v.core_values : (v.core_values ? JSON.parse(v.core_values) : []),
          rocks: Array.isArray(v.rocks) ? v.rocks : (v.rocks ? JSON.parse(v.rocks) : []),
        })
        if (v.created_at) setCreatedAt(v.created_at)
      }
      if (ps && ps.length > 0) {
        const active = ps.find((p: any) => p.is_active) ?? ps[0]
        setActivePlanId(active.id)
      }
      setLoading(false)
    })
  }, [])

  // Auto-save with debounce
  const save = useCallback(async (data: VisionForm, uid: string) => {
    setSaveStatus('saving')
    const finalOneYr = data.one_yr_overridden ? data.one_yr_rev : Math.round(oneYrCalc)
    const payload = {
      ...data,
      one_yr_rev: finalOneYr,
      three_yr_rev: data.three_yr_overridden ? data.three_yr_rev : Math.round(threeYrCalc),
      updated_at: new Date().toISOString(),
    }
    await supabase.from('vision').upsert({ ...payload, user_id: uid }, { onConflict: 'user_id' })
    setSaveStatus('saved')

    // Check if active game plan is out of sync with vision on the 3 fields that flow through
    if (activePlanId) {
      const { data: plan } = await supabase
        .from('gameplans')
        .select('annual_goal, avg_ticket, base_mrr')
        .eq('id', activePlanId)
        .single()
      if (plan) {
        const drift: PlanDrift = {}
        if (finalOneYr > 0 && Math.round(finalOneYr) !== Math.round(plan.annual_goal ?? 0))
          drift.annual_goal = { vision: finalOneYr, plan: plan.annual_goal ?? 0 }
        if (data.avg_ticket > 0 && Math.round(data.avg_ticket) !== Math.round(plan.avg_ticket ?? 0))
          drift.avg_ticket = { vision: data.avg_ticket, plan: plan.avg_ticket ?? 0 }
        if (data.baseline_revenue > 0 && Math.round(data.baseline_revenue) !== Math.round(plan.base_mrr ?? 0))
          drift.base_mrr = { vision: data.baseline_revenue, plan: plan.base_mrr ?? 0 }
        setPlanDrift(Object.keys(drift).length > 0 ? drift : null)
      }
    }
  }, [oneYrCalc, threeYrCalc, activePlanId])

  async function syncToGamePlan() {
    if (!activePlanId || !planDrift) return
    setSyncingPlan(true)
    const patch: Record<string, number> = {}
    if (planDrift.annual_goal) patch.annual_goal = planDrift.annual_goal.vision
    if (planDrift.avg_ticket)  patch.avg_ticket  = planDrift.avg_ticket.vision
    if (planDrift.base_mrr)    patch.base_mrr    = planDrift.base_mrr.vision
    await supabase.from('gameplans').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', activePlanId)
    setSyncingPlan(false)
    setPlanDrift(null)
  }

  const scheduleAutoSave = useCallback((updated: VisionForm) => {
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (userId) save(updated, userId)
    }, 1200)
  }, [userId, save])

  function update(patch: Partial<VisionForm>) {
    setForm(prev => {
      const next = { ...prev, ...patch }
      scheduleAutoSave(next)
      return next
    })
  }

  function addValue() {
    const v = newValue.trim()
    if (!v || form.core_values.includes(v)) return
    update({ core_values: [...form.core_values, v] })
    setNewValue('')
  }

  function removeValue(val: string) {
    update({ core_values: form.core_values.filter(v => v !== val) })
  }

  function addRock() {
    update({ rocks: [...form.rocks, { outcome: '', quarter: 'Q2 2026', status: 'Not started' }] })
  }

  function updateRock(i: number, patch: Partial<Rock>) {
    const next = form.rocks.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    update({ rocks: next })
  }

  function removeRock(i: number) {
    update({ rocks: form.rocks.filter((_, idx) => idx !== i) })
  }

  async function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (userId) await save(form, userId)
  }

  const stepLabels = ['Personal why', 'Core values', 'Core focus', '3-year picture', '1-year plan', 'Rocks']

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888' }}>Loading your Vision...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#0C85C2', cursor: 'pointer' }} onClick={() => router.push('/blueprint')}>Blueprint</span>
          <span style={{ color: '#ccc' }}>›</span>
          <span>The Vision</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>The Vision</div>
          {createdAt && (
            <div style={{ fontSize: '12px', color: '#aaa', fontWeight: 600 }}>
              Created {new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '20px' }}>
          Your foundation. Do this once a year — it's the work that makes every other decision easier.
        </div>

        {/* Step progress */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
          {stepLabels.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: sectionDone[i] ? '#3B8C2A' : '#aaa', cursor: 'default' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${sectionDone[i] ? '#7CCA5B' : '#A7DBE7'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: '10px', fontWeight: 700,
                  background: sectionDone[i] ? '#7CCA5B' : 'transparent',
                  color: sectionDone[i] ? '#fff' : '#aaa',
                }}>
                  {sectionDone[i] ? '✓' : i + 1}
                </div>
                {label}
              </div>
              {i < stepLabels.length - 1 && (
                <div style={{ width: '24px', height: '1px', background: '#E6F1F4', margin: '0 4px' }} />
              )}
            </div>
          ))}
        </div>

        {/* Save bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '12px 20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: saveStatus === 'saved' ? '#7CCA5B' : saveStatus === 'saving' ? '#5AB3C9' : '#FFB600', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saveStatus === 'saved' && <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#7CCA5B" strokeWidth="2"/></svg>Changes saved automatically</>}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved changes'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveNow} style={{ height: '38px', padding: '0 22px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Save Vision
            </button>
            <button onClick={() => { saveNow(); router.push('/blueprint/game-plan') }} style={{ height: '38px', padding: '0 22px', background: '#7CCA5B', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Build Game Plan ↗
            </button>
          </div>
        </div>

        {/* ── Game Plan sync prompt ── */}
        {planDrift && (
          <div style={{ background: '#fff8e1', border: '1.5px solid #FFB600', borderRadius: '14px', padding: '16px 20px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff3b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#B87800" strokeWidth="1.5"><path d="M2 13V5l5-4 5 4v8H9V9H7v4H2z"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: '#7A5F00', marginBottom: '6px' }}>
                Your Vision changed — do you want to update your Game Plan?
              </div>
              <div style={{ fontSize: '12.5px', color: '#7A5F00', lineHeight: 1.7 }}>
                {planDrift.annual_goal && (
                  <div>· <strong>1-year revenue goal:</strong> Vision says {fmt(planDrift.annual_goal.vision)}, Game Plan still shows {fmt(planDrift.annual_goal.plan)}</div>
                )}
                {planDrift.avg_ticket && (
                  <div>· <strong>Avg ticket:</strong> Vision says {fmt(planDrift.avg_ticket.vision)}, Game Plan still shows {fmt(planDrift.avg_ticket.plan)}</div>
                )}
                {planDrift.base_mrr && (
                  <div>· <strong>Recurring MRR:</strong> Vision says {fmt(planDrift.base_mrr.vision)}, Game Plan still shows {fmt(planDrift.base_mrr.plan)}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => setPlanDrift(null)}
                style={{ height: '34px', padding: '0 14px', background: 'transparent', color: '#B87800', border: '1.5px solid #FFB600', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                Keep as is
              </button>
              <button
                onClick={syncToGamePlan}
                disabled={syncingPlan}
                style={{ height: '34px', padding: '0 16px', background: '#FFB600', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer', opacity: syncingPlan ? 0.7 : 1 }}>
                {syncingPlan ? 'Updating…' : 'Update Game Plan ↗'}
              </button>
            </div>
          </div>
        )}

        {/* ── INCOME ENGINE ── */}
        <div style={{ background: '#2C3E50', borderRadius: '16px', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>
            Income target — drives your revenue goals below
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', lineHeight: 1.6, fontStyle: 'italic' }}>
            Note: these revenue goals are based purely on your income target — they don't yet factor in your existing baseline or recurring revenue. We'll get to that!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.3fr)', gap: '20px', marginBottom: '20px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>This year's personal income goal</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '10px', overflow: 'hidden', height: '44px' }}>
                <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', borderRight: '1.5px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>$</div>
                <input type="number" value={form.income_goal || ''} placeholder="120,000"
                  onChange={e => update({ income_goal: parseFloat(e.target.value) || 0 })}
                  style={{ border: 'none', background: 'transparent', height: '100%', padding: '0 14px', fontSize: '15px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#fff', outline: 'none', width: '100%' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '6px' }}>Used for next 12-month planning — revisit this each year.</div>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  Profit margin assumption
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#5AB3C9', lineHeight: 1 }}>{form.profit_margin}%</span>
                </span>
              </label>
              <input type="range" min={5} max={40} step={1} value={form.profit_margin}
                onChange={e => update({ profit_margin: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: '#5AB3C9', height: '5px', borderRadius: '20px', cursor: 'pointer', display: 'block' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.25)' }}>5% conservative</span>
                <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.25)' }}>40% optimistic</span>
              </div>
            </div>
          </div>

          {/* Live math */}
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[
              { val: fmt(form.income_goal), label: 'income goal', color: '#5AB3C9' },
              { op: '÷' },
              { val: `${form.profit_margin}%`, label: 'profit margin', color: '#5AB3C9' },
              { op: '=' },
              { val: fmt(oneYrCalc), label: '1-year revenue needed', color: '#7CCA5B' },
              { op: '× ' + form.growth_multiplier + '×' },
              { val: fmt(threeYrCalc), label: '3-year revenue target', color: '#FFB600' },
            ].map((item: any, i) => item.op !== undefined ? (
              <div key={i} style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.2)', flexShrink: 0, padding: '0 8px', textAlign: 'center' }}>{item.op}</div>
            ) : (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '0 4px' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', lineHeight: 1.1, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Growth multiplier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', marginTop: '12px' }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', flex: 1, lineHeight: 1.4 }}>
              Growth multiplier: your 3-year target is <strong style={{ color: '#5AB3C9' }}>{form.growth_multiplier}×</strong> your 1-year revenue goal.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>1×</span>
              <input type="range" min={1} max={5} step={0.5} value={form.growth_multiplier}
                onChange={e => update({ growth_multiplier: parseFloat(e.target.value) })}
                style={{ width: '120px', accentColor: '#5AB3C9', height: '5px', cursor: 'pointer' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>5×</span>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#5AB3C9', minWidth: '32px', textAlign: 'right' }}>{form.growth_multiplier}×</div>
            </div>
          </div>
        </div>

        {/* ── WHERE YOU ARE TODAY ── */}
        {(() => {
          const mrr = form.baseline_revenue
          const annualRunRate = mrr * 12
          const goalOneYr = form.one_yr_overridden ? form.one_yr_rev : Math.round(oneYrCalc)
          const annualGap = goalOneYr > 0 ? goalOneYr - annualRunRate : 0
          const monthlyGap = goalOneYr > 0 ? (goalOneYr / 12) - mrr : 0
          const pctOfGoal = goalOneYr > 0 ? Math.min(100, Math.round((annualRunRate / goalOneYr) * 100)) : 0
          return (
            <div style={{ background: '#fff', borderRadius: '16px', border: '1.5px solid #5AB3C9', padding: '22px 24px', marginBottom: '18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
                Where you are today
              </div>
              <div style={{ fontSize: '12.5px', color: '#aaa', marginBottom: '18px', lineHeight: 1.5 }}>
                Your current recurring revenue — clients on a regular cleaning schedule. This anchors your gap calculation.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <FieldLabel>Recurring Monthly Revenue (MRR)</FieldLabel>
                  <FieldHint>Revenue from customers on a recurring cleaning plan — not one-time jobs.</FieldHint>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #A7DBE7', borderRadius: '10px', overflow: 'hidden', maxWidth: '240px', marginTop: '8px' }}>
                    <div style={{ background: '#E6F1F4', padding: '0 12px', height: '44px', display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 700, color: '#2C3E50', borderRight: '1.5px solid #A7DBE7', flexShrink: 0 }}>$</div>
                    <input type="number" value={mrr || ''} placeholder="0"
                      onChange={e => update({ baseline_revenue: parseFloat(e.target.value) || 0 })}
                      style={{ border: 'none', background: 'transparent', height: '42px', flex: 1, padding: '0 14px', fontSize: '15px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', outline: 'none' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>Annual run rate</span>
                    <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50' }}>{fmt(annualRunRate)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>1-year revenue goal</span>
                    <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#0C85C2' }}>{goalOneYr > 0 ? fmt(goalOneYr) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>Monthly gap to close</span>
                    <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: monthlyGap > 0 ? '#FFB600' : '#7CCA5B' }}>
                      {goalOneYr > 0 ? (monthlyGap > 0 ? `${fmt(monthlyGap)}/mo` : 'Goal met!') : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {goalOneYr > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2C3E50' }}>
                      {pctOfGoal}% of your annual goal covered by recurring revenue
                    </span>
                    <span style={{ fontSize: '12px', color: '#aaa' }}>
                      {annualGap > 0 ? `${fmt(annualGap)} gap to close` : 'On track'}
                    </span>
                  </div>
                  <div style={{ height: '10px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
                    <div style={{ width: `${pctOfGoal}%`, height: '100%', background: pctOfGoal >= 100 ? '#7CCA5B' : '#5AB3C9', borderRadius: '20px', transition: 'width 0.35s' }} />
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#aaa', marginTop: '6px' }}>
                    The remaining {fmt(Math.max(0, annualGap))}/yr needs to come from new customer acquisition — that's what your Game Plan is built to solve.
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* ── SECTION 1: Personal Why ── */}
        <SectionCard done={sectionDone[0]} num={1} title="Personal why" hint="Why did you invest in this franchise? What does success look like for your life — not just your business?">
          <FieldLabel>Why I own this franchise</FieldLabel>
          <FieldHint>Be honest. This is your north star — the reason you'll push through the hard days.</FieldHint>
          <textarea rows={4} value={form.why_statement} placeholder="I'm building this business to..."
            onChange={e => update({ why_statement: e.target.value })}
            style={textareaStyle} />
        </SectionCard>

        {/* ── SECTION 2: Core Values ── */}
        <SectionCard done={sectionDone[1]} num={2} title="Core values" hint="What principles are non-negotiable in how you run your business and treat your team and customers? Aim for 3–5.">
          {form.core_values.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {form.core_values.map(val => (
                <div key={val} style={{ position: 'relative', background: '#e6f4fb', border: '1.5px solid #0C85C2', borderRadius: '10px', padding: '8px 32px 8px 14px', fontSize: '13px', color: '#0C85C2', fontWeight: 600 }}>
                  {val}
                  <button onClick={() => removeValue(val)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input type="text" value={newValue} placeholder="Type a value and press Enter…"
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addValue()}
              style={inputStyle} />
            <button onClick={addValue} style={{ height: '42px', padding: '0 18px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
          </div>
          <button
            onClick={() => setShowValueSuggestions(v => !v)}
            style={{ background: 'none', border: 'none', color: '#0C85C2', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', padding: '0', fontFamily: "'Open Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '5px', marginBottom: showValueSuggestions ? '12px' : '0' }}
          >
            <span style={{ fontSize: '14px' }}>{showValueSuggestions ? '▾' : '▸'}</span>
            {showValueSuggestions ? 'Hide suggestions' : 'Need core value ideas? Check this out.'}
          </button>
          {showValueSuggestions && (
            <div style={{ background: '#f8f9fa', border: '1.5px solid #A7DBE7', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '11.5px', color: '#888', marginBottom: '10px', lineHeight: 1.5 }}>
                Click any value to add it to your list. Click it again to remove it.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {BRENE_VALUES.map(val => {
                  const selected = form.core_values.includes(val)
                  return (
                    <button
                      key={val}
                      onClick={() => selected ? removeValue(val) : (update({ core_values: [...form.core_values, val] }))}
                      style={{
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontFamily: "'Open Sans', sans-serif", cursor: 'pointer',
                        border: `1.5px solid ${selected ? '#0C85C2' : '#A7DBE7'}`,
                        background: selected ? '#e6f4fb' : '#fff',
                        color: selected ? '#0C85C2' : '#555',
                        fontWeight: selected ? 700 : 400,
                      }}
                    >
                      {selected ? '✓ ' : ''}{val}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── SECTION 3: Core Focus ── */}
        <SectionCard done={sectionDone[2]} num={3} title="Core focus" hint="What do you do better than anyone in your market? This is your unique offer — the promise behind every clean.">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <FieldLabel>Your unique offer</FieldLabel>
            {form.core_purpose !== MAIDTHIS_CORE_FOCUS && form.core_purpose !== '' && (
              <button
                onClick={() => update({ core_purpose: MAIDTHIS_CORE_FOCUS })}
                style={{ background: 'none', border: 'none', color: '#5AB3C9', fontSize: '12px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", fontWeight: 700, padding: 0 }}
              >
                ↺ Reset to MaidThis default
              </button>
            )}
          </div>
          <FieldHint>Pre-filled with the MaidThis brand standard. Edit to reflect your market or personal voice.</FieldHint>
          <textarea rows={5}
            value={form.core_purpose === '' ? MAIDTHIS_CORE_FOCUS : form.core_purpose}
            placeholder={MAIDTHIS_CORE_FOCUS}
            onChange={e => update({ core_purpose: e.target.value })}
            style={textareaStyle}
          />
        </SectionCard>

        {/* ── SECTION 4: 3-Year Picture ── */}
        <SectionCard done={sectionDone[3]} num={4} title="3-year picture" hint="Project yourself 3 years forward. What does your business look like? Be specific — revenue, team size, how it feels to run it." active>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { key: 'horizon_1yr' as const, label: 'End of 2026', color: '#0C85C2', bg: '#e6f4fb', placeholder: 'Revenue, team, systems, customers… what\'s true in 12 months?' },
              { key: 'horizon_3yr' as const, label: 'End of 2028 (3 years)', color: '#3B8C2A', bg: '#edfae5', placeholder: 'Revenue target, team size, market position, how you spend your days…' },
              { key: 'horizon_dream' as const, label: 'Dream state', color: '#6B5CE7', bg: '#f3f0ff', placeholder: 'If everything went perfectly — what does it look like?' },
            ].map(h => (
              <div key={h.key} style={{ border: '1.5px solid #A7DBE7', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: h.bg, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '12px', color: h.color }}>{h.label}</div>
                </div>
                <textarea value={form[h.key]} placeholder={h.placeholder} rows={5}
                  onChange={e => update({ [h.key]: e.target.value })}
                  style={{ ...textareaStyle, border: 'none', borderRadius: 0, minHeight: '100px' }} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: '8px' }}>
            <FieldLabel>3-year revenue target</FieldLabel>
            <FieldHint>Auto-calculated from your income goal × multiplier. Override directly if needed.</FieldHint>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ maxWidth: '260px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${form.three_yr_overridden ? '#FFB600' : '#5AB3C9'}`, borderRadius: '10px', overflow: 'hidden', background: form.three_yr_overridden ? '#fffdf0' : '#f4fbfd' }}>
                  <div style={{ background: form.three_yr_overridden ? '#fff3cd' : '#d8f2f8', padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 700, color: '#2C3E50', borderRight: `1.5px solid ${form.three_yr_overridden ? '#FFB600' : '#5AB3C9'}`, flexShrink: 0 }}>$</div>
                  <input type="number" value={form.three_yr_overridden ? form.three_yr_rev : Math.round(threeYrCalc) || ''}
                    onChange={e => update({ three_yr_rev: parseFloat(e.target.value) || 0, three_yr_overridden: true })}
                    style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 40px 0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                  <span style={{ position: 'absolute', right: '10px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: form.three_yr_overridden ? '#fff3cd' : '#d8f2f8', color: form.three_yr_overridden ? '#B87800' : '#0C85C2', pointerEvents: 'none' }}>
                    {form.three_yr_overridden ? 'Overridden' : 'Auto-calculated'}
                  </span>
                </div>
              </div>
              {form.three_yr_overridden && (
                <button onClick={() => update({ three_yr_overridden: false })} style={{ fontSize: '11.5px', color: '#5AB3C9', cursor: 'pointer', background: 'none', border: 'none', fontFamily: "'Open Sans', sans-serif" }}>↺ Reset to calculated</button>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── SECTION 5: 1-Year Plan ── */}
        <SectionCard done={sectionDone[4]} num={5} title="1-year plan" hint={`What must be true by December 31, ${new Date().getFullYear()}? Your income goal back-calculates the revenue you need — confirm or adjust it here.`}>
          <div style={{ marginBottom: '16px' }}>
            <FieldLabel>Revenue goal this year</FieldLabel>
            <FieldHint>Auto-filled from your income goal. Override anytime.</FieldHint>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ maxWidth: '260px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${form.one_yr_overridden ? '#FFB600' : '#5AB3C9'}`, borderRadius: '10px', overflow: 'hidden', background: form.one_yr_overridden ? '#fffdf0' : '#f4fbfd' }}>
                  <div style={{ background: form.one_yr_overridden ? '#fff3cd' : '#d8f2f8', padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 700, color: '#2C3E50', borderRight: `1.5px solid ${form.one_yr_overridden ? '#FFB600' : '#5AB3C9'}`, flexShrink: 0 }}>$</div>
                  <input type="number" value={form.one_yr_overridden ? form.one_yr_rev : Math.round(oneYrCalc) || ''}
                    onChange={e => update({ one_yr_rev: parseFloat(e.target.value) || 0, one_yr_overridden: true })}
                    style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 40px 0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                  <span style={{ position: 'absolute', right: '10px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: form.one_yr_overridden ? '#fff3cd' : '#d8f2f8', color: form.one_yr_overridden ? '#B87800' : '#0C85C2', pointerEvents: 'none' }}>
                    {form.one_yr_overridden ? 'Overridden' : 'Auto-calculated'}
                  </span>
                </div>
              </div>
              {form.one_yr_overridden && (
                <button onClick={() => update({ one_yr_rev: 0, one_yr_overridden: false })} style={{ fontSize: '11.5px', color: '#5AB3C9', cursor: 'pointer', background: 'none', border: 'none', fontFamily: "'Open Sans', sans-serif" }}>↺ Reset to calculated</button>
              )}
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <FieldLabel>Average first-job ticket ($)</FieldLabel>
            <FieldHint>What a new customer typically pays for their first clean. Flows into Game Plan to calculate how many jobs you need.</FieldHint>
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #A7DBE7', borderRadius: '10px', overflow: 'hidden', maxWidth: '200px' }}>
              <div style={{ background: '#E6F1F4', padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 700, color: '#2C3E50', borderRight: '1.5px solid #A7DBE7', flexShrink: 0 }}>$</div>
              <input type="number" value={form.avg_ticket || ''} placeholder="180"
                onChange={e => update({ avg_ticket: parseFloat(e.target.value) || 0 })}
                style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <FieldLabel>What has to be true by Dec 31, {new Date().getFullYear()}?</FieldLabel>
            <FieldHint>Think beyond revenue — team, systems, marketing, your own role in the business.</FieldHint>
            <textarea rows={4} value={form.one_year_plan} placeholder="e.g. I have a full-time ops manager, I am not doing cleans myself, I have 3 reliable lead channels…"
              onChange={e => update({ one_year_plan: e.target.value })}
              style={textareaStyle} />
          </div>
          <div>
            <FieldLabel>Biggest obstacle this year</FieldLabel>
            <FieldHint>What's the single thing most likely to get in the way?</FieldHint>
            <textarea rows={2} value={form.one_yr_obstacle} placeholder="e.g. Finding and keeping reliable cleaners…"
              onChange={e => update({ one_yr_obstacle: e.target.value })}
              style={textareaStyle} />
          </div>
        </SectionCard>

        {/* ── SECTION 6: Rocks ── */}
        <SectionCard done={sectionDone[5]} num={6} title="Rocks — quarterly priorities" hint="Rocks are the 3–5 most important things to accomplish this quarter. Not tasks — outcomes. If these get done, the quarter was a success.">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 130px 36px', gap: '10px', alignItems: 'center', padding: '0 0 8px', borderBottom: '0.5px solid #E6F1F4', marginBottom: '4px' }}>
            {['Rock (outcome)', 'Quarter', 'Status', ''].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {form.rocks.map((rock, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 130px 36px', gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #E6F1F4' }}>
              <input type="text" value={rock.outcome} placeholder="Outcome to achieve…"
                onChange={e => updateRock(i, { outcome: e.target.value })}
                style={{ ...inputStyle, height: '38px' }} />
              <select value={rock.quarter} onChange={e => updateRock(i, { quarter: e.target.value })}
                style={{ height: '38px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 10px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', background: '#fff', cursor: 'pointer', width: '100%' }}>
                {['Q1 2026','Q2 2026','Q3 2026','Q4 2026','Q1 2027','Q2 2027','Q3 2027','Q4 2027'].map(q => <option key={q}>{q}</option>)}
              </select>
              <select value={rock.status} onChange={e => updateRock(i, { status: e.target.value })}
                style={{ height: '38px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 10px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', background: '#fff', cursor: 'pointer', width: '100%' }}>
                {['Not started','In progress','Done'].map(s => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => removeRock(i)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '4px', borderRadius: '6px' }}>×</button>
            </div>
          ))}
          <button onClick={addRock} style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#0C85C2', cursor: 'pointer', background: 'none', border: 'none', fontFamily: "'Open Sans', sans-serif" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#0C85C2" strokeWidth="1.5"/><path d="M7 4v6M4 7h6" stroke="#0C85C2" strokeWidth="1.5"/></svg>
            Add Rock
          </button>
        </SectionCard>

        {/* Bottom save bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '12px 20px', marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', color: saveStatus === 'saved' ? '#7CCA5B' : saveStatus === 'saving' ? '#5AB3C9' : '#FFB600', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saveStatus === 'saved' && <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#7CCA5B" strokeWidth="2"/></svg>Changes saved automatically</>}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved changes'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveNow} style={{ height: '38px', padding: '0 22px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Save Vision
            </button>
            <button onClick={() => { saveNow(); router.push('/blueprint/game-plan') }} style={{ height: '38px', padding: '0 22px', background: '#7CCA5B', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Build Game Plan ↗
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function SectionCard({ children, done, num, title, hint, active }: {
  children: React.ReactNode
  done: boolean
  num: number
  title: string
  hint: string
  active?: boolean
}) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: `0.5px solid ${active ? '#0C85C2' : '#A7DBE7'}`, padding: '22px 24px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? '#7CCA5B' : '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {done ? '✓' : num}
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>{title}</div>
        {active && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, background: '#e6f4fb', color: '#0C85C2', padding: '3px 10px', borderRadius: '20px' }}>You are here</span>}
      </div>
      <div style={{ fontSize: '12.5px', color: '#aaa', marginBottom: '18px', paddingLeft: '38px', lineHeight: 1.5 }}>{hint}</div>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{children}</label>
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px', display: 'block', lineHeight: 1.5 }}>{children}</span>
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid #A7DBE7',
  borderRadius: '10px',
  padding: '12px 14px',
  fontSize: '13.5px',
  fontFamily: "'Open Sans', sans-serif",
  color: '#2C3E50',
  outline: 'none',
  resize: 'vertical',
  lineHeight: 1.6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '42px',
  border: '1.5px solid #A7DBE7',
  borderRadius: '10px',
  padding: '0 14px',
  fontSize: '14px',
  fontFamily: "'Open Sans', sans-serif",
  color: '#2C3E50',
  outline: 'none',
}
