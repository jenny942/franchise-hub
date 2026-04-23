'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

// ── Constants ─────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DEFAULT_SEASONALITY = [8, 7, 9, 8, 9, 10, 9, 10, 10, 10, 6, 4]

// ── Types ─────────────────────────────────────────────────────
type Channel = {
  id: string
  name: string
  type: 'paid' | 'community'
  cpl?: number
  conv: number
  max_spend?: number
  max_actions?: number
  action_label?: string
}
type MonthData = Record<string, number>
type Plan = {
  id?: string
  name: string
  is_active: boolean
  annual_goal: number
  avg_ticket: number
  base_mrr: number
  recurring_pct: number
  mrr_value: number
  mrr_overridden: boolean
  seasonality: number[]
  use_seasonality: boolean
  plan_start: string       // YYYY-MM e.g. "2026-04"
  plan_horizon: 'eoy' | '12mo'
  channels: { paid: Channel[]; community: Channel[] }
  month_data: Record<string, MonthData>
  reviews_goal: number
  reviews_ytd: number
}

// ── Defaults ──────────────────────────────────────────────────
const DEFAULT_CHANNELS = {
  paid: [
    { id: 'cohesive',  name: 'Cohesive AI',  type: 'paid' as const, cpl: 18, conv: 20, max_spend: 500  },
    { id: 'meta',      name: 'Meta Ads',      type: 'paid' as const, cpl: 14, conv: 12, max_spend: 5000 },
    { id: 'thumbtack', name: 'Thumbtack',     type: 'paid' as const, cpl: 35, conv: 15, max_spend: 3000 },
    { id: 'lsa',       name: 'LSA',           type: 'paid' as const, cpl: 40, conv: 25, max_spend: 3000 },
  ],
  community: [
    { id: 'bni',      name: 'BNI / Networking',   type: 'community' as const, conv: 33, max_actions: 20,  action_label: 'events attended' },
    { id: 'dropoffs', name: 'Drop-offs / Flyers', type: 'community' as const, conv: 5,  max_actions: 500, action_label: 'flyers dropped'  },
  ],
}

function makePlan(vision: any): Plan {
  const now = new Date()
  const planStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return {
    name: `${now.getFullYear()} Main Plan`,
    is_active: false,
    annual_goal: vision?.one_yr_rev ?? 0,
    avg_ticket: vision?.avg_ticket ?? 0,
    base_mrr: vision?.baseline_revenue ?? 0,
    recurring_pct: 20,
    mrr_value: vision?.avg_ticket ?? 0,
    mrr_overridden: false,
    seasonality: [...DEFAULT_SEASONALITY],
    use_seasonality: false,
    plan_start: planStart,
    plan_horizon: 'eoy',
    channels: JSON.parse(JSON.stringify(DEFAULT_CHANNELS)),
    month_data: {},
    reviews_goal: 100,
    reviews_ytd: 0,
  }
}

// Returns ordered list of months covered by this plan
function getPlanMonths(planStart: string, horizon: 'eoy' | '12mo') {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const start = planStart || fallback
  const [sy, sm] = start.split('-').map(Number)
  const startIdx = sm - 1  // 0-11

  const entries: { year: number; monthIdx: number }[] = []
  if (horizon === 'eoy') {
    for (let m = startIdx; m <= 11; m++) entries.push({ year: sy, monthIdx: m })
  } else {
    for (let i = 0; i < 12; i++) {
      const total = startIdx + i
      entries.push({ year: sy + Math.floor(total / 12), monthIdx: total % 12 })
    }
  }
  return entries.map(({ year, monthIdx }) => ({
    year, monthIdx,
    key: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
    label: MONTHS[monthIdx],
    shortLabel: year !== sy ? `${MONTHS_SHORT[monthIdx]} '${String(year).slice(2)}` : MONTHS_SHORT[monthIdx],
  }))
}

// ── Helpers ───────────────────────────────────────────────────
function fmt$(n: number) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtN(n: number) { return Math.round(n || 0).toLocaleString() }

function calcPaid(ch: Channel, spend: number, avgTicket: number, recurringPct: number, mrrValue: number) {
  const leads = ch.cpl ? spend / ch.cpl : 0
  const customers = leads * (ch.conv / 100)
  const oneTimeRev = customers * avgTicket
  const newMrr = customers * (recurringPct / 100) * mrrValue
  return { leads, customers, oneTimeRev, newMrr, total: oneTimeRev + newMrr }
}

function calcCommunity(ch: Channel, actions: number, avgTicket: number, recurringPct: number, mrrValue: number) {
  const customers = actions * (ch.conv / 100)
  const oneTimeRev = customers * avgTicket
  const newMrr = customers * (recurringPct / 100) * mrrValue
  return { customers, oneTimeRev, newMrr, total: oneTimeRev + newMrr }
}

function parsePlan(raw: any): Plan {
  return {
    ...raw,
    seasonality: Array.isArray(raw.seasonality) ? raw.seasonality : JSON.parse(raw.seasonality ?? JSON.stringify(DEFAULT_SEASONALITY)),
    channels: typeof raw.channels === 'object' && !Array.isArray(raw.channels) ? raw.channels : JSON.parse(raw.channels ?? JSON.stringify(DEFAULT_CHANNELS)),
    month_data: typeof raw.month_data === 'object' && !Array.isArray(raw.month_data) ? raw.month_data : JSON.parse(raw.month_data ?? '{}'),
  }
}

// ── Page ──────────────────────────────────────────────────────
export default function GamePlanPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [vision, setVision] = useState<any>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [planIds, setPlanIds] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showSeasonality, setShowSeasonality] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [editingChannels, setEditingChannels] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      const [{ data: v }, { data: ps }] = await Promise.all([
        supabase.from('vision').select('*').eq('user_id', session.user.id).single(),
        supabase.from('gameplans').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
      ])
      setVision(v)

      if (ps && ps.length > 0) {
        const parsed = ps.map(parsePlan)
        setPlans(parsed)
        setPlanIds(ps.map((p: any) => p.id))
        const activeIdx = parsed.findIndex((p: Plan) => p.is_active)
        const idx = activeIdx >= 0 ? activeIdx : 0
        setSelectedIdx(idx)
        setPlan(parsed[idx])
      } else {
        setPlan(makePlan(v))
      }
      setLoading(false)
    })
  }, [])

  const doSave = useCallback(async (p: Plan, uid: string, id?: string) => {
    setSaveStatus('saving')
    if (id) {
      await supabase.from('gameplans').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id)
      setSaveStatus('saved')
    } else {
      const { data } = await supabase.from('gameplans').insert({ ...p, user_id: uid }).select().single()
      setSaveStatus('saved')
      return data?.id as string | undefined
    }
  }, [])

  const scheduleAutoSave = useCallback((updated: Plan) => {
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (userId) doSave(updated, userId, planIds[selectedIdx])
    }, 1500)
  }, [userId, planIds, selectedIdx, doSave])

  function updatePlan(patch: Partial<Plan>) {
    if (!plan) return
    const next = { ...plan, ...patch }
    setPlan(next)
    scheduleAutoSave(next)
  }

  function getSpend(channelId: string): number {
    if (!plan) return 0
    return plan.month_data[currentMonthKey]?.[channelId] ?? 0
  }

  function setSpend(channelId: string, value: number) {
    if (!plan) return
    const next: Plan = {
      ...plan,
      month_data: { ...plan.month_data, [currentMonthKey]: { ...(plan.month_data[currentMonthKey] ?? {}), [channelId]: value } },
    }
    setPlan(next)
    scheduleAutoSave(next)
  }

  function applyToAllMonths() {
    if (!plan) return
    const src = plan.month_data[currentMonthKey] ?? {}
    const months = getPlanMonths(plan.plan_start, plan.plan_horizon)
    const newMonthData: Record<string, MonthData> = { ...plan.month_data }
    months.forEach(m => { newMonthData[m.key] = { ...src } })
    updatePlan({ month_data: newMonthData })
  }

  async function deletePlan() {
    if (!userId || plans.length <= 1) return
    const id = planIds[selectedIdx]
    if (id) await supabase.from('gameplans').delete().eq('id', id)
    const newPlans = plans.filter((_, i) => i !== selectedIdx)
    const newIds = planIds.filter((_, i) => i !== selectedIdx)
    const newIdx = Math.max(0, selectedIdx - 1)
    setPlans(newPlans)
    setPlanIds(newIds)
    setSelectedIdx(newIdx)
    setPlan(newPlans[newIdx])
    setConfirmDelete(false)
  }

  async function saveNow() {
    if (!plan || !userId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const id = planIds[selectedIdx]
    if (id) {
      await doSave(plan, userId, id)
    } else {
      const newId = await doSave(plan, userId)
      if (newId) setPlanIds(prev => { const next = [...prev]; next[selectedIdx] = newId; return next })
    }
  }

  async function activatePlan() {
    if (!plan || !userId) return
    await supabase.from('gameplans').update({ is_active: false }).eq('user_id', userId)
    if (planIds[selectedIdx]) {
      await supabase.from('gameplans').update({ is_active: true }).eq('id', planIds[selectedIdx])
    }
    const updated = plans.map((p, i) => ({ ...p, is_active: i === selectedIdx }))
    setPlans(updated)
    updatePlan({ is_active: true })
  }

  async function createNewPlan() {
    if (!userId) return
    const p = makePlan(vision)
    const { data } = await supabase.from('gameplans').insert({ ...p, user_id: userId }).select().single()
    if (data) {
      const parsed = parsePlan(data)
      setPlans(prev => [parsed, ...prev])
      setPlanIds(prev => [data.id, ...prev])
      setSelectedIdx(0)
      setPlan(parsed)
    }
  }

  function switchPlan(idx: number) {
    setSelectedIdx(idx)
    setPlan(plans[idx])
    const p = plans[idx]
    const months = getPlanMonths(p.plan_start, p.plan_horizon)
    const now = new Date()
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setCurrentMonthKey(months.find(m => m.key === nowKey) ? nowKey : months[0]?.key ?? nowKey)
  }

  function addChannel(type: 'paid' | 'community') {
    if (!plan) return
    const id = `${type}_${Date.now()}`
    const ch: Channel = type === 'paid'
      ? { id, name: 'New Channel', type: 'paid', cpl: 20, conv: 10, max_spend: 1000 }
      : { id, name: 'New Channel', type: 'community', conv: 10, max_actions: 50, action_label: 'actions' }
    const next = { ...plan, channels: { ...plan.channels, [type]: [...plan.channels[type], ch] } }
    setPlan(next)
    scheduleAutoSave(next)
    setEditingChannels(prev => new Set([...prev, id]))
  }

  function removeChannel(type: 'paid' | 'community', id: string) {
    if (!plan) return
    const next = { ...plan, channels: { ...plan.channels, [type]: plan.channels[type].filter(c => c.id !== id) } }
    setPlan(next)
    scheduleAutoSave(next)
  }

  function updateChannel(type: 'paid' | 'community', id: string, patch: Partial<Channel>) {
    if (!plan) return
    const next = { ...plan, channels: { ...plan.channels, [type]: plan.channels[type].map(c => c.id === id ? { ...c, ...patch } : c) } }
    setPlan(next)
    scheduleAutoSave(next)
  }

  function toggleEdit(id: string) {
    setEditingChannels(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Calculations ──────────────────────────────────────────
  const planMonths = plan ? getPlanMonths(plan.plan_start || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}` })(), plan.plan_horizon || 'eoy') : []
  const currentMonthEntry = planMonths.find(m => m.key === currentMonthKey) ?? planMonths[0]

  const seasonSum = plan?.use_seasonality ? planMonths.reduce((s, m) => s + (plan.seasonality[m.monthIdx] ?? 1), 0) || 1 : planMonths.length || 1
  const monthlyTarget = plan ? (
    plan.use_seasonality
      ? plan.annual_goal * ((plan.seasonality[currentMonthEntry?.monthIdx ?? 0] ?? 1) / seasonSum)
      : plan.annual_goal / (planMonths.length || 1)
  ) : 0

  const mrrDisplay = plan ? (plan.mrr_overridden ? plan.mrr_value : plan.avg_ticket) : 0

  const allPaidOut = plan ? plan.channels.paid.map(ch => calcPaid(ch, getSpend(ch.id), plan.avg_ticket, plan.recurring_pct, mrrDisplay)) : []
  const allCommOut = plan ? plan.channels.community.map(ch => calcCommunity(ch, getSpend(ch.id), plan.avg_ticket, plan.recurring_pct, mrrDisplay)) : []

  const totalOneTime = [...allPaidOut, ...allCommOut].reduce((s, o) => s + o.oneTimeRev, 0)
  const totalNewMrr = [...allPaidOut, ...allCommOut].reduce((s, o) => s + o.newMrr, 0)
  const totalMarketing = totalOneTime + totalNewMrr

  // MRR rollover = one-time revenue × recurring% (how much of new revenue becomes monthly recurring)
  const currentMonthRollover = plan ? totalOneTime * (plan.recurring_pct / 100) : 0

  // Cumulative MRR from prior months using same rollover formula
  const priorRollover = plan ? planMonths
    .filter(m => m.key < currentMonthKey)
    .reduce((total, m) => {
      const ot = [
        ...plan.channels.paid.map(ch => calcPaid(ch, plan.month_data[m.key]?.[ch.id] ?? 0, plan.avg_ticket, plan.recurring_pct, mrrDisplay).oneTimeRev),
        ...plan.channels.community.map(ch => calcCommunity(ch, plan.month_data[m.key]?.[ch.id] ?? 0, plan.avg_ticket, plan.recurring_pct, mrrDisplay).oneTimeRev),
      ].reduce((s, v) => s + v, 0)
      return total + ot * (plan.recurring_pct / 100)
    }, 0) : 0
  const stableRecurring = (plan?.base_mrr ?? 0) + priorRollover

  const totalCovered = stableRecurring + totalMarketing
  const gap = monthlyTarget - totalCovered

  const basePct = monthlyTarget > 0 ? Math.min(100, (stableRecurring / monthlyTarget) * 100) : 0
  const mktPct = monthlyTarget > 0 ? Math.min(100 - basePct, (totalMarketing / monthlyTarget) * 100) : 0
  const overPct = totalCovered > monthlyTarget ? Math.min(30, ((totalCovered - monthlyTarget) / monthlyTarget) * 100) : 0

  const monthHasData = (key: string) => plan ? Object.values(plan.month_data[key] ?? {}).some(v => v > 0) : false

  // Running total
  const totalSpend = plan ? plan.channels.paid.reduce((s, ch) => s + getSpend(ch.id), 0) : 0
  const totalLeads = allPaidOut.reduce((s, o) => s + o.leads, 0)
  const totalCustomers = [...allPaidOut, ...allCommOut].reduce((s, o) => s + o.customers, 0)
  const totalRev = totalOneTime + totalNewMrr
  const overTarget = totalRev > monthlyTarget

  // Detect which default channels have been removed
  const missingPaidDefaults = plan ? DEFAULT_CHANNELS.paid.filter(dc => !plan.channels.paid.find(c => c.id === dc.id)) : []
  const missingCommDefaults = plan ? DEFAULT_CHANNELS.community.filter(dc => !plan.channels.community.find(c => c.id === dc.id)) : []

  // Today's key for greying out past months
  const todayKey = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}` })()

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888' }}>Loading Game Plan...</p>
        </div>
      </div>
    )
  }

  if (!plan) return null

  // ── Shared styles ─────────────────────────────────────────
  const prefixWrap = (override?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center',
    border: `1.5px solid ${override ? '#FFB600' : '#A7DBE7'}`,
    borderRadius: '10px', overflow: 'hidden',
    background: override ? '#fffdf0' : '#fff',
  })
  const pfx = (override?: boolean): React.CSSProperties => ({
    background: override ? '#fff3cd' : '#E6F1F4',
    padding: '0 11px', height: '42px', display: 'flex', alignItems: 'center',
    fontSize: '13px', fontWeight: 700, color: '#2C3E50',
    borderRight: `1.5px solid ${override ? '#FFB600' : '#A7DBE7'}`, flexShrink: 0,
  })
  const fieldLabel: React.CSSProperties = { fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }
  const fieldHint: React.CSSProperties = { fontSize: '11px', color: '#aaa', display: 'block', marginTop: '4px' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto', maxWidth: 'calc(100vw - 220px)' }}>

        {/* Breadcrumb + title */}
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#0C85C2', cursor: 'pointer' }} onClick={() => router.push('/blueprint')}>Blueprint</span>
          <span style={{ color: '#ccc' }}>›</span><span>The Game Plan</span>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>The Game Plan</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '20px' }}>
          Pull the levers. See what your marketing spend generates — and whether it closes the gap to your revenue target.
        </div>

        {/* ── Plan bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '12px 20px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Plan</div>
            {plans.length > 1 && (
              <select value={selectedIdx} onChange={e => switchPlan(parseInt(e.target.value))}
                style={{ height: '36px', border: '1.5px solid #A7DBE7', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', outline: 'none', background: '#fff', cursor: 'pointer' }}>
                {plans.map((p, i) => <option key={i} value={i}>{p.name}{p.is_active ? ' ★' : ''}</option>)}
              </select>
            )}
            <input type="text" value={plan.name} onChange={e => updatePlan({ name: e.target.value })}
              placeholder="Name this plan…"
              style={{ flex: 1, height: '36px', border: '1.5px solid #A7DBE7', borderRadius: '8px', padding: '0 12px', fontSize: '13.5px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', outline: 'none', maxWidth: '240px' }} />
            <button onClick={createNewPlan}
              style={{ height: '36px', padding: '0 14px', background: '#E6F1F4', color: '#0C85C2', border: '1.5px solid #A7DBE7', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + New plan
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {plan.is_active
              ? <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B8C2A', background: '#edfae5', borderRadius: '20px', padding: '4px 12px' }}>★ Active plan</span>
              : <button onClick={activatePlan} style={{ height: '36px', padding: '0 14px', background: '#edfae5', color: '#3B8C2A', border: '1.5px solid #7CCA5B', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>Set as active ★</button>
            }
            <div style={{ fontSize: '13px', fontWeight: 600, color: saveStatus === 'saved' ? '#7CCA5B' : saveStatus === 'saving' ? '#5AB3C9' : '#FFB600' }}>
              {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
            </div>
            <button onClick={saveNow} style={{ height: '38px', padding: '0 22px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Save Game Plan
            </button>
            {plans.length > 1 && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                style={{ height: '38px', padding: '0 14px', background: 'transparent', color: '#e05252', border: '1.5px solid #e05252', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                Delete
              </button>
            )}
            {confirmDelete && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff2f2', border: '1.5px solid #e05252', borderRadius: '10px', padding: '0 12px', height: '38px' }}>
                <span style={{ fontSize: '12px', color: '#e05252', fontWeight: 600, whiteSpace: 'nowrap' }}>Delete this plan?</span>
                <button onClick={deletePlan} style={{ height: '26px', padding: '0 10px', background: '#e05252', color: '#fff', border: 'none', borderRadius: '6px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} style={{ height: '26px', padding: '0 10px', background: 'transparent', color: '#888', border: '1px solid #ddd', borderRadius: '6px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Vision banner */}
        <div style={{ background: '#2C3E50', borderRadius: '12px', padding: '12px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5AB3C9" strokeWidth="1.5"><path d="M2 13V5l5-4 5 4v8H9V9H7v4H2z"/></svg>
          <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, flex: 1 }}>
            Revenue goal and average ticket pulled from <strong style={{ color: '#5AB3C9' }}>The Vision</strong>. Update those numbers there to change defaults here.
          </div>
          <span onClick={() => router.push('/blueprint/vision')} style={{ fontSize: '12px', color: '#5AB3C9', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Edit Vision ↗</span>
        </div>

        {/* ── Section 1: Foundations ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <SectionHead num={1} title="Plan foundations" hint="Set your annual revenue goal and the assumptions that drive every calculation below." />

          {/* Plan horizon */}
          <div style={{ background: '#E6F1F4', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Plan period</div>
              <div style={{ fontSize: '11px', color: '#888' }}>
                {planMonths.length > 0 ? `${planMonths[0].label} ${planMonths[0].year} → ${planMonths[planMonths.length-1].label} ${planMonths[planMonths.length-1].year} (${planMonths.length} months)` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['eoy', '12mo'] as const).map(h => {
                const now = new Date()
                const label = h === 'eoy' ? `End of ${now.getFullYear()}` : 'Next 12 months'
                return (
                  <button key={h} onClick={() => updatePlan({ plan_horizon: h })}
                    style={{ height: '34px', padding: '0 16px', borderRadius: '8px', border: `1.5px solid ${plan.plan_horizon === h ? '#0C85C2' : '#A7DBE7'}`, background: plan.plan_horizon === h ? '#0C85C2' : '#fff', color: plan.plan_horizon === h ? '#fff' : '#888', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', flex: 1, textAlign: 'right' }}>
              Plan start: <strong style={{ color: '#2C3E50' }}>
                {plan.plan_start ? `${MONTHS[parseInt(plan.plan_start.split('-')[1]) - 1]} ${plan.plan_start.split('-')[0]}` : '—'}
              </strong>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
            {([
              { label: 'Annual revenue goal', hint: 'From Vision — override anytime', prefix: '$', key: 'annual_goal' },
              { label: 'Average ticket ($)',   hint: 'From Vision — override anytime', prefix: '$', key: 'avg_ticket' },
              { label: 'Recurring conv. %',   hint: '% of new customers who recur',  prefix: '%', key: 'recurring_pct' },
              { label: 'Recurring MRR',       hint: 'Revenue from recurring clients', prefix: '$', key: 'base_mrr' },
            ] as { label: string; hint: string; prefix: string; key: keyof Plan }[]).map(f => (
              <div key={String(f.key)}>
                <label style={fieldLabel}>{f.label}</label>
                <div style={prefixWrap()}>
                  <div style={pfx()}>{f.prefix}</div>
                  <input type="number" value={(plan[f.key] as number) || ''}
                    onChange={e => updatePlan({ [f.key]: parseFloat(e.target.value) || 0 })}
                    style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 12px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                </div>
                <span style={fieldHint}>{f.hint}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E6F1F4', paddingTop: '14px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', alignItems: 'start' }}>
            <div>
              <label style={fieldLabel}>Avg monthly recurring value</label>
              <span style={{ ...fieldHint, marginBottom: '8px', display: 'block' }}>What a recurring customer pays monthly. Defaults to avg ticket.</span>
              <div style={prefixWrap(plan.mrr_overridden)}>
                <div style={pfx(plan.mrr_overridden)}>$</div>
                <input type="number" value={plan.mrr_overridden ? plan.mrr_value || '' : plan.avg_ticket || ''}
                  onChange={e => updatePlan({ mrr_value: parseFloat(e.target.value) || 0, mrr_overridden: true })}
                  style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 12px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: plan.mrr_overridden ? '#B87800' : '#0C85C2', fontWeight: 700, outline: 'none' }} />
              </div>
              {plan.mrr_overridden && (
                <button onClick={() => updatePlan({ mrr_overridden: false })}
                  style={{ fontSize: '11.5px', color: '#5AB3C9', cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginTop: '4px', fontFamily: "'Open Sans', sans-serif" }}>
                  ↺ Reset to avg ticket
                </button>
              )}
            </div>
            <div style={{ background: '#edfae5', borderRadius: '10px', padding: '12px 16px', marginTop: '28px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#3B8C2A', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>How Recurring MRR works</div>
              <div style={{ fontSize: '12.5px', color: '#3B8C2A', lineHeight: 1.5 }}>Recurring MRR is the green segment in the gap bar — it covers part of your monthly target before you spend a dollar on marketing. The more recurring clients you build, the smaller the gap you need to close each month.</div>
            </div>
          </div>
        </div>

        {/* ── Seasonality ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '18px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50' }}>Monthly seasonality</div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', background: '#e6f4fb', padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.5px' }}>Optional</span>
              </div>
              <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>Useful once you know your busy and slow months. Skip it for now if you're just getting started.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {plan.use_seasonality && (
                <button onClick={() => updatePlan({ seasonality: [...DEFAULT_SEASONALITY] })}
                  style={{ fontSize: '11.5px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}>
                  Reset to default
                </button>
              )}
              <button onClick={() => {
                const turning = !plan.use_seasonality
                updatePlan({ use_seasonality: turning })
                setShowSeasonality(turning)
              }}
                style={{ fontSize: '12.5px', fontWeight: 700, color: plan.use_seasonality ? '#0C85C2' : '#888', background: plan.use_seasonality ? '#e6f4fb' : '#E6F1F4', border: 'none', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}>
                {plan.use_seasonality ? 'Seasonality on ▲' : 'Enable seasonality ▼'}
              </button>
            </div>
          </div>

          {/* Mini bar preview */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '28px', marginTop: '12px' }}>
            {planMonths.map((m) => {
              const val = plan.use_seasonality ? (plan.seasonality[m.monthIdx] ?? 1) : 1
              const maxV = plan.use_seasonality ? Math.max(...planMonths.map(pm => plan.seasonality[pm.monthIdx] ?? 1)) : 1
              const h = maxV > 0 ? Math.round((val / maxV) * 100) : 100
              return <div key={m.key} title={m.shortLabel} style={{ flex: 1, height: `${h}%`, background: m.key === currentMonthKey ? '#0C85C2' : '#A7DBE7', borderRadius: '2px 2px 0 0', transition: 'height 0.2s' }} />
            })}
          </div>

          {plan.use_seasonality && showSeasonality && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginTop: '16px' }}>
              {planMonths.map((m) => {
                const val = plan.seasonality[m.monthIdx] ?? 1
                const pct = Math.round((val / seasonSum) * 100)
                return (
                  <div key={m.key} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '12px', color: m.key === currentMonthKey ? '#0C85C2' : '#2C3E50', marginBottom: '2px' }}>{m.shortLabel}</div>
                    <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#0C85C2', marginBottom: '4px' }}>{pct}%</div>
                    <input type="range" min={1} max={20} step={1} value={val}
                      onChange={e => { const s = [...plan.seasonality]; s[m.monthIdx] = parseInt(e.target.value); updatePlan({ seasonality: s }) }}
                      style={{ width: '100%', accentColor: m.key === currentMonthKey ? '#0C85C2' : '#5AB3C9', cursor: 'pointer' }} />
                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{fmt$(plan.annual_goal * (val / seasonSum))}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Month selector ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '16px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={fieldLabel}>Select month to plan</div>
              <div style={{ fontSize: '12px', color: '#aaa' }}>Each month can have its own mix. Highlighted months have spend entered. Past months are locked.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#888' }}>Viewing: <strong style={{ color: '#0C85C2' }}>{currentMonthEntry?.label} {currentMonthEntry?.year}</strong></span>
              <button onClick={applyToAllMonths}
                style={{ height: '32px', padding: '0 14px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Copy to all months
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {planMonths.map(m => {
              const isPast = m.key < todayKey
              const isActive = m.key === currentMonthKey
              const hasData = monthHasData(m.key)
              return (
                <button key={m.key}
                  onClick={() => !isPast && setCurrentMonthKey(m.key)}
                  disabled={isPast}
                  style={{
                    height: '34px', padding: '0 14px',
                    border: `1.5px solid ${isActive ? '#0C85C2' : hasData ? '#5AB3C9' : isPast ? '#E6F1F4' : '#A7DBE7'}`,
                    borderRadius: '8px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '12px',
                    cursor: isPast ? 'default' : 'pointer',
                    background: isActive ? '#0C85C2' : isPast ? '#f7f7f7' : '#fff',
                    color: isActive ? '#fff' : isPast ? '#ccc' : hasData ? '#5AB3C9' : '#888',
                    opacity: isPast ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}>{m.shortLabel}</button>
              )
            })}
          </div>
        </div>

        {/* ── Gap bar ── */}
        <div style={{ background: '#2C3E50', borderRadius: '16px', padding: '20px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '14px', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>{currentMonthEntry?.label} {currentMonthEntry?.year}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '28px', color: '#fff', lineHeight: 1 }}>{fmt$(monthlyTarget)}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>monthly revenue target</div>
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#7CCA5B', lineHeight: 1 }}>{fmt$(totalCovered)}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>covered</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: gap > 0 ? '#FFB600' : '#5AB3C9', lineHeight: 1 }}>
                  {gap > 0 ? fmt$(gap) : `+${fmt$(-gap)}`}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{gap > 0 ? 'still to cover' : 'over target!'}</div>
              </div>
            </div>
          </div>
          <div style={{ height: '18px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${basePct}%`, height: '100%', background: '#7CCA5B', borderRadius: basePct > 0 ? '20px 0 0 20px' : '0', transition: 'width 0.35s' }} />
            <div style={{ width: `${mktPct}%`, height: '100%', background: '#0C85C2', transition: 'width 0.35s' }} />
            <div style={{ width: `${overPct}%`, height: '100%', background: '#5AB3C9', transition: 'width 0.35s' }} />
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
            {[['#7CCA5B','Cumulative recurring MRR'],['#0C85C2',"This month's marketing"],['#5AB3C9','Exceeded target']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'rgba(255,255,255,0.5)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, flexShrink: 0 }} />{l}
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 2: Marketing Levers ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <SectionHead num={2} title="Marketing levers" hint={`Set your spend and activity for ${currentMonthEntry?.label} ${currentMonthEntry?.year}. The gap bar above updates in real time.`} />

          {/* Paid channels */}
          <GroupLabel color="#0C85C2">Paid leads</GroupLabel>
          {plan.channels.paid.map((ch, idx) => {
            const spend = getSpend(ch.id)
            const out = calcPaid(ch, spend, plan.avg_ticket, plan.recurring_pct, mrrDisplay)
            const isEditing = editingChannels.has(ch.id)
            return (
              <div key={ch.id} style={{ borderTop: `1.5px solid ${spend > 0 ? '#0C85C2' : '#A7DBE7'}`, borderRight: `1.5px solid ${spend > 0 ? '#0C85C2' : '#A7DBE7'}`, borderBottom: `1.5px solid ${spend > 0 ? '#0C85C2' : '#A7DBE7'}`, borderLeft: '3px solid #0C85C2', borderRadius: '14px', padding: '16px 18px', marginBottom: '10px', background: spend > 0 ? '#fafeff' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  {isEditing
                    ? <input type="text" value={ch.name} onChange={e => updateChannel('paid', ch.id, { name: e.target.value })}
                        style={{ flex: 1, height: '32px', border: '1.5px solid #A7DBE7', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', outline: 'none' }} />
                    : <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', flex: 1 }}>{ch.name}</div>
                  }
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#e6f4fb', color: '#0C85C2', flexShrink: 0 }}>Paid</span>
                  <button onClick={() => toggleEdit(ch.id)} style={{ fontSize: '11.5px', color: '#888', background: '#E6F1F4', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", flexShrink: 0 }}>
                    {isEditing ? 'Done' : 'Edit settings'}
                  </button>
                  <button onClick={() => removeChannel('paid', ch.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px', borderRadius: '6px', flexShrink: 0 }}>×</button>
                </div>
                {isEditing && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <SmallInputField label="Cost per lead ($)" prefix="$" value={ch.cpl ?? 0} onChange={v => updateChannel('paid', ch.id, { cpl: v })} />
                    <SmallInputField label="Conversion rate (%)" prefix="%" value={ch.conv} onChange={v => updateChannel('paid', ch.id, { conv: v })} />
                  </div>
                )}
                <SliderRow label="Spend" min={0} max={ch.max_spend ?? 5000} step={50} value={spend} accentColor="#0C85C2" onChange={v => setSpend(ch.id, v)} />
                <OutputPills items={[
                  { val: fmtN(out.leads),       label: 'Est. leads',      color: '#2C3E50' },
                  { val: fmtN(out.customers),   label: 'New customers',   color: '#0C85C2' },
                  { val: fmt$(out.oneTimeRev),  label: 'One-time rev',    color: '#3B8C2A' },
                  { val: fmt$(out.newMrr),      label: 'New MRR',         color: '#5AB3C9' },
                ]} />
                {out.customers > 0 && (
                  <div style={{ fontSize: '11.5px', color: '#5AB3C9', marginTop: '8px', padding: '6px 10px', background: '#f0faff', borderRadius: '8px' }}>
                    ↺ {Math.round(out.customers * (plan.recurring_pct / 100))} recurring → {fmt$(out.newMrr)}/mo added to MRR
                  </div>
                )}
              </div>
            )
          })}
          <AddChannelBtn type="paid" onClick={() => addChannel('paid')} />
          {missingPaidDefaults.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {missingPaidDefaults.map(dc => (
                <button key={dc.id} onClick={() => { const next = { ...plan, channels: { ...plan.channels, paid: [...plan.channels.paid, { ...dc }] } }; setPlan(next); scheduleAutoSave(next) }}
                  style={{ height: '30px', padding: '0 12px', border: '1.5px dashed #5AB3C9', borderRadius: '8px', background: '#f0faff', color: '#0C85C2', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}>
                  ↺ Restore {dc.name}
                </button>
              ))}
            </div>
          )}

          {/* Community channels */}
          <GroupLabel color="#3B8C2A" style={{ marginTop: '20px' }}>Community marketing</GroupLabel>
          {plan.channels.community.map((ch) => {
            const actions = getSpend(ch.id)
            const out = calcCommunity(ch, actions, plan.avg_ticket, plan.recurring_pct, mrrDisplay)
            const isEditing = editingChannels.has(ch.id)
            return (
              <div key={ch.id} style={{ borderTop: `1.5px solid ${actions > 0 ? '#7CCA5B' : '#A7DBE7'}`, borderRight: `1.5px solid ${actions > 0 ? '#7CCA5B' : '#A7DBE7'}`, borderBottom: `1.5px solid ${actions > 0 ? '#7CCA5B' : '#A7DBE7'}`, borderLeft: '3px solid #7CCA5B', borderRadius: '14px', padding: '16px 18px', marginBottom: '10px', background: actions > 0 ? '#fafff8' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  {isEditing
                    ? <input type="text" value={ch.name} onChange={e => updateChannel('community', ch.id, { name: e.target.value })}
                        style={{ flex: 1, height: '32px', border: '1.5px solid #A7DBE7', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', outline: 'none' }} />
                    : <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', flex: 1 }}>{ch.name}</div>
                  }
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#edfae5', color: '#3B8C2A', flexShrink: 0 }}>Community</span>
                  <button onClick={() => toggleEdit(ch.id)} style={{ fontSize: '11.5px', color: '#888', background: '#E6F1F4', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", flexShrink: 0 }}>
                    {isEditing ? 'Done' : 'Edit settings'}
                  </button>
                  <button onClick={() => removeChannel('community', ch.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px', borderRadius: '6px', flexShrink: 0 }}>×</button>
                </div>
                {isEditing && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <SmallInputField label="Conversion rate (%)" prefix="%" value={ch.conv} onChange={v => updateChannel('community', ch.id, { conv: v })} />
                    <SmallInputField label="Max actions" prefix="#" value={ch.max_actions ?? 100} onChange={v => updateChannel('community', ch.id, { max_actions: v })} />
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Action label</div>
                      <input type="text" value={ch.action_label ?? 'actions'} onChange={e => updateChannel('community', ch.id, { action_label: e.target.value })}
                        style={{ width: '100%', height: '36px', border: '1px solid #d0e8f0', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                    </div>
                  </div>
                )}
                <SliderRow label={ch.action_label ?? 'Actions'} min={0} max={ch.max_actions ?? 100} step={1} value={actions} accentColor="#7CCA5B" onChange={v => setSpend(ch.id, v)} />
                <OutputPills items={[
                  { val: fmtN(out.customers),  label: 'New customers',  color: '#0C85C2' },
                  { val: fmt$(out.oneTimeRev), label: 'One-time rev',   color: '#3B8C2A' },
                  { val: fmt$(out.newMrr),     label: 'New MRR',        color: '#5AB3C9' },
                ]} />
              </div>
            )
          })}
          <AddChannelBtn type="community" onClick={() => addChannel('community')} />
          {missingCommDefaults.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {missingCommDefaults.map(dc => (
                <button key={dc.id} onClick={() => { const next = { ...plan, channels: { ...plan.channels, community: [...plan.channels.community, { ...dc }] } }; setPlan(next); scheduleAutoSave(next) }}
                  style={{ height: '30px', padding: '0 12px', border: '1.5px dashed #7CCA5B', borderRadius: '8px', background: '#f4fff0', color: '#3B8C2A', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}>
                  ↺ Restore {dc.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 3: Google Reviews ── */}
        {(() => {
          const reviewsGoal = plan.reviews_goal ?? 100
          const reviewsYtd = plan.reviews_ytd ?? 0
          const monthlyReviewTarget = Math.round(reviewsGoal * (plan.seasonality[currentMonth] / seasonSum))
          const pctDone = reviewsGoal > 0 ? Math.min(100, (reviewsYtd / reviewsGoal) * 100) : 0
          const remaining = Math.max(0, reviewsGoal - reviewsYtd)
          const monthsLeft = 12 - new Date().getMonth()
          const pace = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining
          return (
            <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
              <SectionHead num={3} title="Google reviews" hint="Reviews are your trust engine — they drive organic leads and conversion. First-year target: 100." />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={fieldLabel}>Annual review goal</label>
                  <div style={prefixWrap()}>
                    <div style={pfx()}>#</div>
                    <input type="number" value={reviewsGoal || ''} placeholder="100"
                      onChange={e => updatePlan({ reviews_goal: parseInt(e.target.value) || 0 })}
                      style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 12px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                  </div>
                  <span style={fieldHint}>Year 1 benchmark is 100 — puts you in the top tier for your market.</span>
                </div>
                <div>
                  <label style={fieldLabel}>Reviews earned so far (YTD)</label>
                  <div style={prefixWrap()}>
                    <div style={pfx()}>#</div>
                    <input type="number" value={reviewsYtd || ''} placeholder="0"
                      onChange={e => updatePlan({ reviews_ytd: parseInt(e.target.value) || 0 })}
                      style={{ border: 'none', background: 'transparent', height: '40px', flex: 1, padding: '0 12px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
                  </div>
                  <span style={fieldHint}>Update this as you collect reviews throughout the year.</span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#2C3E50' }}>{reviewsYtd} of {reviewsGoal} reviews</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: pctDone >= 100 ? '#3B8C2A' : '#0C85C2' }}>{Math.round(pctDone)}%</span>
                </div>
                <div style={{ height: '12px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ width: `${pctDone}%`, height: '100%', background: pctDone >= 100 ? '#7CCA5B' : '#FFB600', borderRadius: '20px', transition: 'width 0.35s' }} />
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ background: '#E6F1F4', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#FFB600', lineHeight: 1.1 }}>{monthlyReviewTarget}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{MONTHS[currentMonth]} target</div>
                </div>
                <div style={{ background: '#E6F1F4', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#0C85C2', lineHeight: 1.1 }}>{remaining}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Still to earn</div>
                </div>
                <div style={{ background: '#E6F1F4', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#3B8C2A', lineHeight: 1.1 }}>{pace}/mo</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Pace needed</div>
                </div>
              </div>

              {pctDone >= 100 && (
                <div style={{ background: '#edfae5', border: '1px solid #7CCA5B', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#2C6B1A', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#3B8C2A" strokeWidth="2"/></svg>
                  Goal hit! You've collected {reviewsYtd} reviews — well above the first-year benchmark.
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Running Total ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '2px solid #0C85C2', padding: '20px 24px', marginBottom: '32px' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#0C85C2" strokeWidth="1.5"><path d="M2 12l3-5 3 3 3-4 3 2"/></svg>
            {currentMonthEntry?.label} {currentMonthEntry?.year} — monthly summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '12px' }}>
            {[
              { val: fmt$(totalSpend),    label: 'Total spend',     color: '#0C85C2' },
              { val: fmtN(totalLeads),    label: 'Est. leads',      color: '#2C3E50' },
              { val: fmtN(totalCustomers),label: 'New customers',   color: '#0C85C2' },
              { val: fmt$(totalOneTime),  label: 'One-time revenue',color: '#3B8C2A' },
              { val: fmt$(totalNewMrr),   label: 'New MRR added',   color: '#5AB3C9' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '12px', background: '#E6F1F4', borderRadius: '12px' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: s.color, lineHeight: 1.1 }}>{s.val}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* MRR carry-forward summary */}
          {(() => {
            const nextMonthEntry = planMonths[planMonths.findIndex(m => m.key === currentMonthKey) + 1]
            const mrrNextMonth = stableRecurring + currentMonthRollover
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0faff', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>↺ MRR</span>
                <span style={{ fontSize: '12.5px', color: '#2C3E50' }}>
                  <strong>{fmt$(stableRecurring)}</strong> recurring entering {currentMonthEntry?.label}
                  {totalOneTime > 0 && <>
                    {' + '}<strong style={{ color: '#5AB3C9' }}>{fmt$(totalOneTime)}</strong> new revenue × {plan.recurring_pct}% recurring
                    {' = '}<strong style={{ color: '#0C85C2' }}>{fmt$(currentMonthRollover)}</strong> new MRR
                    {nextMonthEntry && <> → <strong style={{ color: '#0C85C2' }}>{fmt$(mrrNextMonth)}</strong> entering {nextMonthEntry.label} {nextMonthEntry.year}</>}
                  </>}
                </span>
              </div>
            )
          })()}
          <div style={{ height: '14px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, monthlyTarget > 0 ? (totalRev / monthlyTarget) * 100 : 0)}%`, height: '100%', background: overTarget ? '#7CCA5B' : '#0C85C2', borderRadius: '20px', transition: 'width 0.35s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11.5px', color: '#888' }}>
            <span>$0</span><span>{fmt$(monthlyTarget)} target</span>
          </div>
          {overTarget ? (
            <div style={{ background: '#edfae5', border: '1px solid #7CCA5B', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#2C6B1A', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#3B8C2A" strokeWidth="2"/></svg>
              You're projected to exceed your {currentMonthEntry?.label} target by {fmt$(totalRev - monthlyTarget)}. Keep it up.
            </div>
          ) : totalRev > 0 ? (
            <div style={{ background: '#fff8e1', border: '1px solid #FFB600', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#7A5F00', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="#FFB600"><path d="M7 2l.5 6h-1L7 2zm0 7.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>
              You're {fmt$(gap)} short of your {currentMonthEntry?.label} target. Add more spend or channels to close the gap.
            </div>
          ) : null}
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function SectionHead({ num, title, hint }: { num: number; title: string; hint: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{num}</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>{title}</div>
      </div>
      <div style={{ fontSize: '12.5px', color: '#aaa', marginBottom: '18px', paddingLeft: '38px', lineHeight: 1.5 }}>{hint}</div>
    </>
  )
}

function GroupLabel({ children, color, style }: { children: React.ReactNode; color: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', ...style }}>
      {children}
      <div style={{ flex: 1, height: '1px', background: '#E6F1F4' }} />
    </div>
  )
}

function SliderRow({ label, min, max, step, value, accentColor, onChange }: {
  label: string; min: number; max: number; step: number; value: number; accentColor: string; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', width: '64px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor, height: '5px', borderRadius: '20px', cursor: 'pointer' }} />
      <input type="number" value={value || ''} placeholder="0" onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: '90px', height: '36px', border: '1.5px solid #A7DBE7', borderRadius: '8px', padding: '0 10px', fontSize: '13.5px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: '#2C3E50', textAlign: 'right', outline: 'none', flexShrink: 0 }} />
    </div>
  )
}

function OutputPills({ items }: { items: { val: string; label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {items.map(o => (
        <div key={o.label} style={{ background: '#E6F1F4', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: '80px' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: o.color, lineHeight: 1.1 }}>{o.val}</div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: '3px' }}>{o.label}</div>
        </div>
      ))}
    </div>
  )
}

function SmallInputField({ label, prefix, value, onChange }: { label: string; prefix: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d0e8f0', borderRadius: '8px', overflow: 'hidden', height: '36px' }}>
        <div style={{ background: '#E6F1F4', padding: '0 9px', height: '100%', display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 700, color: '#888', borderRight: '1px solid #d0e8f0', flexShrink: 0 }}>{prefix}</div>
        <input type="number" value={value || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ border: 'none', background: 'transparent', height: '100%', flex: 1, padding: '0 10px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none' }} />
      </div>
    </div>
  )
}

function AddChannelBtn({ type, onClick }: { type: 'paid' | 'community'; onClick: () => void }) {
  const isPaid = type === 'paid'
  const color = isPaid ? '#0C85C2' : '#3B8C2A'
  const stroke = isPaid ? '#0C85C2' : '#7CCA5B'
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: '1.5px dashed #A7DBE7', borderRadius: '12px', fontSize: '13px', fontWeight: 700, color, cursor: 'pointer', background: '#fff', width: '100%', fontFamily: "'Open Sans', sans-serif", transition: 'all 0.15s' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={stroke} strokeWidth="1.5"/><path d="M7 4v6M4 7h6" stroke={stroke} strokeWidth="1.5"/></svg>
      Add {isPaid ? 'paid' : 'community'} channel
    </button>
  )
}
