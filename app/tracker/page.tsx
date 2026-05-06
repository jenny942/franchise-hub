'use client'

// SQL needed — run once in Supabase:
// create table if not exists tracker_actuals (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users not null,
//   month_key text not null,
//   data jsonb default '{}',
//   created_at timestamptz default now(),
//   updated_at timestamptz default now(),
//   unique(user_id, month_key)
// );
// alter table tracker_actuals enable row level security;
// create policy "Users manage own tracker actuals" on tracker_actuals for all using (auth.uid() = user_id);

// tracker_weekly table (run once in Supabase):
// create table if not exists tracker_weekly (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users not null,
//   week_start date not null,
//   data jsonb default '{}',
//   created_at timestamptz default now(),
//   updated_at timestamptz default now(),
//   unique(user_id, week_start)
// );
// alter table tracker_weekly enable row level security;
// create policy "Users manage own weekly data" on tracker_weekly for all using (auth.uid() = user_id);

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

// ── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DEFAULT_SEASONALITY = [8,7,9,8,9,10,9,10,10,10,6,4]

// ── Types ────────────────────────────────────────────────────────────────────
type Channel = {
  id: string; name: string; type: 'paid' | 'community'
  cpl?: number; conv: number; max_spend?: number; max_actions?: number; action_label?: string
}
type Plan = {
  id?: string; name: string; is_active: boolean
  annual_goal: number; avg_ticket: number; base_mrr: number; recurring_pct: number
  seasonality: number[]; use_seasonality: boolean
  plan_start: string; plan_horizon: 'eoy' | '12mo'
  channels: { paid: Channel[]; community: Channel[] }
  month_data: Record<string, Record<string, number>>
  reviews_goal: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtN(n: number, dec = 0) {
  const r = Number((n || 0).toFixed(dec))
  return dec > 0 ? r.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : Math.round(r).toLocaleString()
}
function fmtPct(n: number) { return Math.round(n || 0) + '%' }

function getPlanMonths(planStart: string, horizon: 'eoy' | '12mo') {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const start = planStart || fallback
  const [sy, sm] = start.split('-').map(Number)
  const startIdx = sm - 1
  const entries: { year: number; monthIdx: number }[] = []
  if (horizon === 'eoy') {
    for (let m = startIdx; m <= 11; m++) entries.push({ year: sy, monthIdx: m })
  } else {
    for (let i = 0; i < 12; i++) {
      const total = startIdx + i
      entries.push({ year: sy + Math.floor(total/12), monthIdx: total % 12 })
    }
  }
  return entries.map(({ year, monthIdx }) => ({
    year, monthIdx,
    key: `${year}-${String(monthIdx+1).padStart(2,'0')}`,
    label: MONTHS[monthIdx],
    shortLabel: year !== sy ? `${MONTHS_SHORT[monthIdx]} '${String(year).slice(2)}` : MONTHS_SHORT[monthIdx],
  }))
}

function getCalendarWeeksForMonth(year: number, month: number) {
  // month is 1-indexed
  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0)

  // Find the Sunday on or before the first day of the month
  const start = new Date(firstDay)
  start.setDate(start.getDate() - start.getDay()) // rewind to Sunday

  const weeks: { weekStart: string; label: string }[] = []
  const cur = new Date(start)

  while (cur <= lastDay) {
    const weekEnd = new Date(cur)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const startMonth = cur.getMonth() + 1
    const endMonth   = weekEnd.getMonth() + 1

    // Format label: "Apr 6–12" or "Mar 30–Apr 5" for cross-month weeks
    const fmt = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
    const label = startMonth === endMonth
      ? `${MONTHS_SHORT[cur.getMonth()]} ${cur.getDate()}–${weekEnd.getDate()}`
      : `${fmt(cur)}–${fmt(weekEnd)}`

    const isoDate = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`

    weeks.push({ weekStart: isoDate, label })
    cur.setDate(cur.getDate() + 7)
  }

  return weeks
}

function parsePlan(raw: any): Plan {
  return {
    ...raw,
    seasonality: Array.isArray(raw.seasonality) ? raw.seasonality : JSON.parse(raw.seasonality ?? JSON.stringify(DEFAULT_SEASONALITY)),
    channels: typeof raw.channels === 'object' && !Array.isArray(raw.channels) ? raw.channels : JSON.parse(raw.channels ?? '{"paid":[],"community":[]}'),
    month_data: typeof raw.month_data === 'object' && !Array.isArray(raw.month_data) ? raw.month_data : JSON.parse(raw.month_data ?? '{}'),
  }
}

// ── Small UI helpers (defined OUTSIDE page component) ────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', marginBottom: '24px', overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function SectionHeader({ iconBg, icon, title, sub }: { iconBg: string; icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #A7DBE7', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fcfd' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '14px', color: '#2C3E50' }}>{title}</div>
        {sub && <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{sub}</div>}
      </div>
    </div>
  )
}

function StatusDot({ actual, plan, higherBetter = true }: { actual: number; plan: number; higherBetter?: boolean }) {
  if (actual === 0) return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ccc', marginRight: '6px' }} />
  const good = higherBetter ? actual >= plan : actual <= plan
  return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: good ? '#7CCA5B' : '#C0392B', marginRight: '6px' }} />
}

function VarBadge({ actual, plan, higherBetter = true, isPct = false }: { actual: number; plan: number | null; higherBetter?: boolean; isPct?: boolean }) {
  if (plan === null || plan === 0) return <span style={{ fontSize: '11px', color: '#aaa' }}>—</span>
  const diff = actual - plan
  const good = higherBetter ? diff >= 0 : diff <= 0
  const pct = Math.round(Math.abs(diff) / plan * 100)
  const label = isPct ? `${diff > 0 ? '+' : ''}${Math.round(diff)}pp` : `${diff > 0 ? '+' : ''}${pct}%`
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '='
  const bg = diff === 0 ? '#E6F1F4' : good ? '#edfae5' : '#fde8e8'
  const color = diff === 0 ? '#888' : good ? '#3B8C2A' : '#C0392B'
  return <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: bg, color, whiteSpace: 'nowrap' }}>{arrow} {label}</span>
}

// Input cell for table rows — uncontrolled, remounts when monthKey changes
function InputCell({
  monthKey, fieldKey, actuals, onBlur, prefix = '', suffix = '', width = 90, align = 'right'
}: {
  monthKey: string; fieldKey: string; actuals: Record<string,number>
  onBlur: (key: string, val: number) => void
  prefix?: string; suffix?: string; width?: number; align?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {prefix && <span style={{ fontSize: '12px', color: '#666' }}>{prefix}</span>}
      <input
        key={`${monthKey}-${fieldKey}`}
        defaultValue={actuals[fieldKey] || ''}
        onBlur={e => {
          const v = parseFloat(e.target.value.replace(/[^0-9.-]/g,'')) || 0
          onBlur(fieldKey, v)
        }}
        style={{
          width: `${width}px`, textAlign: 'right', border: '1px solid #A7DBE7', borderRadius: '6px',
          padding: '4px 6px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif",
          background: '#f8fcfd', color: '#2C3E50', outline: 'none',
        }}
        placeholder="0"
      />
      {suffix && <span style={{ fontSize: '12px', color: '#666' }}>{suffix}</span>}
    </div>
  )
}

function WeekInputCells({ weeks, fieldKey, weeklyData, onWeekChange }: {
  weeks: { weekStart: string; label: string }[]
  fieldKey: string
  weeklyData: Record<string, Record<string, number>>
  onWeekChange: (weekStart: string, key: string, val: number) => void
}) {
  return (
    <>
      {weeks.map(w => (
        <td key={w.weekStart} style={tdStyle}>
          <InputCell
            monthKey={w.weekStart}
            fieldKey={fieldKey}
            actuals={weeklyData[w.weekStart] ?? {}}
            onBlur={(key, val) => onWeekChange(w.weekStart, key, val)}
            width={70}
          />
        </td>
      ))}
    </>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700,
  color: '#666', background: '#f0f8fb', whiteSpace: 'nowrap',
}
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: 'left' }
const tdStyle: React.CSSProperties = { padding: '7px 12px', textAlign: 'right', fontSize: '13px', color: '#2C3E50', borderTop: '1px solid #E6F1F4', verticalAlign: 'middle' }
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left' }
const tdReadStyle: React.CSSProperties = { ...tdStyle, color: '#888', fontStyle: 'italic' }

// ── Page component ───────────────────────────────────────────────────────────
export default function TrackerPage() {
  const router = useRouter()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planMonths, setPlanMonths] = useState<ReturnType<typeof getPlanMonths>>([])
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  })
  const [mode, setMode] = useState<'monthly' | 'weekly'>('monthly')
  const [actuals, setActuals] = useState<Record<string,number>>({})
  const [notes, setNotes] = useState<Record<string,string>>({})
  const [customPaidChannels, setCustomPaidChannels] = useState<{id: string; name: string; type: 'paid'}[]>([])
  const [customCommChannels, setCustomCommChannels] = useState<{id: string; name: string; type: 'community'}[]>([])
  const [customCommunityRows, setCustomCommunityRows] = useState<{id: string; name: string}[]>([])
  const [trackerActualId, setTrackerActualId] = useState<string|null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved'|'saving'|'unsaved'>('saved')
  const [userId, setUserId] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  const [weeklyData, setWeeklyData] = useState<Record<string, Record<string, number>>>({})
  const weekSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  // ── Load on mount ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const uid = session.user.id

      const { data: profile } = await supabase.from('profiles').select('role, profile_complete').eq('id', uid).single()
      if (profile?.role !== 'corporate' && !profile?.profile_complete) { router.push('/onboarding'); return }

      setUserId(uid)

      const { data: gp } = await supabase.from('gameplans').select('*').eq('user_id', uid).eq('is_active', true).single()

      if (gp) {
        const parsed = parsePlan(gp)
        setPlan(parsed)
        setPlanId(gp.id)
        const months = getPlanMonths(parsed.plan_start, parsed.plan_horizon)
        setPlanMonths(months)

        const now = new Date()
        const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
        const inPlan = months.some(m => m.key === curKey)
        setSelectedMonthKey(inPlan ? curKey : (months[0]?.key ?? curKey))
      }

      setLoading(false)
    })
  }, [])

  // ── Load tracker actuals + revenue when month changes ──────────
  useEffect(() => {
    if (!userId || !selectedMonthKey) return

    async function loadMonth() {
      // tracker_actuals
      const { data: ta } = await supabase
        .from('tracker_actuals')
        .select('*')
        .eq('user_id', userId!)
        .eq('month_key', selectedMonthKey)
        .maybeSingle()

      if (ta) {
        setTrackerActualId(ta.id)
        const nums: Record<string,number> = {}
        const nts: Record<string,string> = {}
        for (const [k, v] of Object.entries(ta.data || {})) {
          if (k.startsWith('n_')) nts[k.slice(2)] = String(v)
          else if (typeof v === 'number') nums[k] = v
        }
        setActuals(nums)
        setNotes(nts)
        try { setCustomPaidChannels((JSON.parse(nts['customPaidChannels'] || '[]') as any[]).map(c => ({ ...c, type: 'paid' as const }))) } catch { setCustomPaidChannels([]) }
        try { setCustomCommChannels((JSON.parse(nts['customCommChannels'] || '[]') as any[]).map(c => ({ ...c, type: 'community' as const }))) } catch { setCustomCommChannels([]) }
        try { setCustomCommunityRows(JSON.parse(nts['customCommunityRows'] || '[]')) } catch { setCustomCommunityRows([]) }
      } else {
        setTrackerActualId(null)
        setActuals({})
        setNotes({})
        setCustomPaidChannels([])
        setCustomCommChannels([])
        setCustomCommunityRows([])
      }

      // Load weekly data for this month
      const entry = planMonths.find(m => m.key === selectedMonthKey) ?? { year: Number(selectedMonthKey.split('-')[0]), monthIdx: Number(selectedMonthKey.split('-')[1]) - 1 }
      const [yr, mo] = [entry.year ?? Number(selectedMonthKey.split('-')[0]), (entry.monthIdx ?? Number(selectedMonthKey.split('-')[1]) - 1) + 1]
      const weeks = getCalendarWeeksForMonth(yr, mo)
      const weekStarts = weeks.map(w => w.weekStart)

      const { data: weekRows } = await supabase
        .from('tracker_weekly')
        .select('week_start, data')
        .eq('user_id', userId!)
        .in('week_start', weekStarts)

      const wData: Record<string, Record<string, number>> = {}
      for (const row of (weekRows ?? [])) {
        wData[row.week_start] = row.data ?? {}
      }
      setWeeklyData(wData)
    }

    loadMonth()
  }, [userId, selectedMonthKey])

  // ── Save helpers ───────────────────────────────────────────────
  const buildData = useCallback((a: Record<string,number>, n: Record<string,string>) => {
    const d: Record<string, number|string> = { ...a }
    for (const [k, v] of Object.entries(n)) { if (v) d[`n_${k}`] = v }
    return d
  }, [])

  const doSave = useCallback(async (a: Record<string,number>, n: Record<string,string>, taId: string|null) => {
    if (!userId) return
    setSaveStatus('saving')
    const data = buildData(a, n)
    if (taId) {
      await supabase.from('tracker_actuals').update({ data, updated_at: new Date().toISOString() }).eq('id', taId)
    } else {
      const { data: ins } = await supabase.from('tracker_actuals')
        .upsert({ user_id: userId, month_key: selectedMonthKey, data }, { onConflict: 'user_id,month_key' })
        .select().single()
      if (ins) setTrackerActualId(ins.id)
    }
    setSaveStatus('saved')
  }, [userId, selectedMonthKey, buildData])

  const scheduleAutoSave = useCallback((a: Record<string,number>, n: Record<string,string>, taId: string|null) => {
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(a, n, taId), 1500)
  }, [doSave])

  function handleActualChange(key: string, val: number) {
    setActuals(prev => {
      const next = { ...prev, [key]: val }
      scheduleAutoSave(next, notes, trackerActualId)
      return next
    })
  }

  function handleNoteChange(key: string, val: string) {
    setNotes(prev => {
      const next = { ...prev, [key]: val }
      scheduleAutoSave(actuals, next, trackerActualId)
      return next
    })
  }

  function handleManualSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    doSave(actuals, notes, trackerActualId)
  }

  async function saveWeekData(weekStart: string, data: Record<string, number>) {
    if (!userId) return
    await supabase
      .from('tracker_weekly')
      .upsert({ user_id: userId, week_start: weekStart, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' })
  }

  function setWeekActual(weekStart: string, key: string, val: number) {
    setWeeklyData(prev => {
      const next = { ...prev, [weekStart]: { ...(prev[weekStart] ?? {}), [key]: val } }
      // debounce save per week
      if (weekSaveTimers.current[weekStart]) clearTimeout(weekSaveTimers.current[weekStart])
      weekSaveTimers.current[weekStart] = setTimeout(() => {
        saveWeekData(weekStart, next[weekStart])
      }, 1500)
      setSaveStatus('unsaved')
      return next
    })
  }

  function getWeekA(weekStart: string, key: string): number {
    return weeklyData[weekStart]?.[key] ?? 0
  }

  // ── Plan targets ───────────────────────────────────────────────
  const selectedMonthEntry = planMonths.find(m => m.key === selectedMonthKey)
  const monthIdx = selectedMonthEntry?.monthIdx ?? 0

  const seasonality = plan?.seasonality ?? DEFAULT_SEASONALITY
  const seasonSum = seasonality.reduce((a, b) => a + b, 0) || 1
  const monthlyRevTarget = plan
    ? (plan.use_seasonality
        ? plan.annual_goal * (seasonality[monthIdx] / seasonSum)
        : plan.annual_goal / (planMonths.length || 1))
    : 0
  const monthlyCleaningsTarget = plan?.avg_ticket ? monthlyRevTarget / plan.avg_ticket : 0

  const paidChannels = plan?.channels?.paid ?? []
  const commChannels = plan?.channels?.community ?? []

  function chPlanSpend(chId: string) { return plan?.month_data?.[selectedMonthKey]?.[chId] ?? 0 }
  function chPlanActions(chId: string) { return plan?.month_data?.[selectedMonthKey]?.[chId] ?? 0 }
  function chPlanLeads(ch: Channel) { return ch.cpl ? chPlanSpend(ch.id) / ch.cpl : 0 }
  function chCommLeads(ch: Channel) { return chPlanActions(ch.id) * (ch.conv / 100) }

  const totalPlanSpend = paidChannels.reduce((s, ch) => s + chPlanSpend(ch.id), 0)
  const totalPlanPaidLeads = paidChannels.reduce((s, ch) => s + chPlanLeads(ch), 0)
  const totalPlanCommLeads = commChannels.reduce((s, ch) => s + chCommLeads(ch), 0)
  const totalPlanLeads = totalPlanPaidLeads + totalPlanCommLeads

  const closeRatePlan = totalPlanLeads > 0 ? (monthlyCleaningsTarget / totalPlanLeads * 100) : 15

  const reviewsMonthlyTarget = plan?.reviews_goal ? plan.reviews_goal / (planMonths.length || 1) : 0

  // ── Actuals derived ────────────────────────────────────────────
  function getA(key: string) { return actuals[key] ?? 0 }

  // Compute the current month's calendar weeks
  const [cmYear, cmMonth] = selectedMonthKey.split('-').map(Number)
  const calendarWeeks = getCalendarWeeksForMonth(cmYear, cmMonth)

  // Weekly sum for a field across all calendar weeks of the selected month
  // Used to pre-populate monthly mode fields when no manual override exists
  function weeklySum(key: string) {
    return calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, key), 0)
  }

  // Effective monthly value: manual override takes precedence, otherwise falls back to weekly sum
  function monthlyVal(key: string) {
    return actuals[key] != null ? actuals[key] : weeklySum(key)
  }

  // Monthly totals derived from weekly entries (used when mode === 'weekly')
  const weeklyRevTotal       = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, 'revenue'), 0)
  const weeklyCleaningsTotal = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, 'cleanings'), 0)
  const weeklyPayTotal       = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, 'cleanerPay'), 0)

  const revenueActual    = mode === 'weekly' ? weeklyRevTotal       : monthlyVal('revenue')
  const displayCleanings = mode === 'weekly' ? weeklyCleaningsTotal : monthlyVal('cleanings')
  const displayPay       = mode === 'weekly' ? weeklyPayTotal       : monthlyVal('cleanerPay')

  const cleaningsActual = getA('cleanings')
  const cleanerPayActual = getA('cleanerPay')

  const totalActualPaidLeads = mode === 'weekly'
    ? paidChannels.reduce((s, ch) => s + calendarWeeks.reduce((ws, w) => ws + getWeekA(w.weekStart, `leads_${ch.id}`), 0), 0)
      + customPaidChannels.reduce((s, ch) => s + calendarWeeks.reduce((ws, w) => ws + getWeekA(w.weekStart, `leads_${ch.id}`), 0), 0)
    : paidChannels.reduce((s, ch) => s + getA(`leads_${ch.id}`), 0)
      + customPaidChannels.reduce((s, ch) => s + getA(`leads_${ch.id}`), 0)
  const totalActualCommLeads = mode === 'weekly'
    ? commChannels.reduce((s, ch) => s + calendarWeeks.reduce((ws, w) => ws + getWeekA(w.weekStart, `leads_${ch.id}`), 0), 0)
      + customCommChannels.reduce((s, ch) => s + calendarWeeks.reduce((ws, w) => ws + getWeekA(w.weekStart, `leads_${ch.id}`), 0), 0)
    : commChannels.reduce((s, ch) => s + getA(`leads_${ch.id}`), 0)
      + customCommChannels.reduce((s, ch) => s + getA(`leads_${ch.id}`), 0)
  const totalActualLeads = totalActualPaidLeads + totalActualCommLeads

  const totalActualSpend = paidChannels.reduce((s, ch) => s + getA(`spend_${ch.id}`), 0)
    + customPaidChannels.reduce((s, ch) => s + getA(`spend_${ch.id}`), 0)

  const avgTicketActual = displayCleanings > 0 ? revenueActual / displayCleanings : 0
  const closeRateActual = totalActualLeads > 0 ? (displayCleanings / totalActualLeads * 100) : 0
  const cleanerPayRate = revenueActual > 0 ? (displayPay / revenueActual * 100) : 0

  // Dropoffs channel plan
  const dropoffsCh = commChannels.find(c => c.id === 'dropoffs')
  const dropoffsPlanActions = dropoffsCh ? chPlanActions(dropoffsCh.id) : null

  // KPI card color
  function kpiStripe(actual: number, plan: number, higherBetter = true) {
    if (plan === 0) return '#5AB3C9'
    const ratio = actual / plan
    if (higherBetter) {
      if (ratio >= 0.9) return '#7CCA5B'
      if (ratio >= 0.7) return '#FFB600'
      return '#C0392B'
    } else {
      if (ratio <= 1.1) return '#7CCA5B'
      if (ratio <= 1.3) return '#FFB600'
      return '#C0392B'
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Open Sans', sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E6F1F4' }}>
          <div style={{ color: '#5AB3C9', fontSize: '16px' }}>Loading tracker…</div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Open Sans', sans-serif", background: '#E6F1F4' }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* ── Top bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50', margin: 0 }}>Monthly Tracker</h1>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Track actuals vs plan</div>
          </div>

          {/* Month selector */}
          {(() => {
            // Build 24 months of history before the plan start
            const now = new Date()
            const planStartKey = planMonths[0]?.key ?? `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
            const [psy, psm] = planStartKey.split('-').map(Number)
            const histMonths: { key: string; label: string }[] = []
            for (let i = 24; i >= 1; i--) {
              let m = psm - i, y = psy
              while (m <= 0) { m += 12; y-- }
              const key = `${y}-${String(m).padStart(2,'0')}`
              histMonths.push({ key, label: `${MONTHS_SHORT[m-1]} '${String(y).slice(2)}` })
            }
            return (
              <select
                value={selectedMonthKey}
                onChange={e => setSelectedMonthKey(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #A7DBE7', borderRadius: '8px', fontSize: '13px', background: '#fff', color: '#2C3E50', fontFamily: "'Open Sans', sans-serif", cursor: 'pointer' }}
              >
                {planMonths.length > 0 && (
                  <optgroup label="── Current Plan ──">
                    {planMonths.map(m => (
                      <option key={m.key} value={m.key}>{m.shortLabel}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="── Historical ──">
                  {histMonths.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            )
          })()}

          {/* Plan name */}
          {plan?.name && (
            <span style={{ fontSize: '12px', color: '#888', background: '#fff', border: '1px solid #A7DBE7', borderRadius: '6px', padding: '5px 10px' }}>
              {plan.name}
            </span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: saveStatus === 'saved' ? '#3B8C2A' : saveStatus === 'saving' ? '#FFB600' : '#C0392B' }}>
              {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
            </span>
            <button onClick={handleManualSave} style={{
              padding: '7px 18px', background: '#0C85C2', color: '#fff', border: 'none',
              borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", fontWeight: 600,
            }}>Save</button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            {
              label: 'Revenue', value: fmt$(revenueActual), plan: fmt$(monthlyRevTarget),
              stripe: kpiStripe(revenueActual, monthlyRevTarget),
              progress: monthlyRevTarget > 0 ? Math.min(revenueActual / monthlyRevTarget, 1) : 0,
            },
            {
              label: 'Total Leads', value: fmtN(totalActualLeads), plan: fmtN(totalPlanLeads) + ' leads',
              stripe: kpiStripe(totalActualLeads, totalPlanLeads),
              progress: totalPlanLeads > 0 ? Math.min(totalActualLeads / totalPlanLeads, 1) : 0,
            },
            {
              label: 'Active Recurring', value: fmtN(getA('recurAirbnb') + getA('recurResidential') + getA('recurCommercial')), plan: 'Airbnb + Res + Comm',
              stripe: '#6B5CE7',
              progress: 0,
            },
            {
              label: 'Marketing Spend', value: fmt$(totalActualSpend), plan: fmt$(totalPlanSpend) + ' plan',
              stripe: '#0C85C2',
              progress: totalPlanSpend > 0 ? Math.min(totalActualSpend / totalPlanSpend, 1) : 0,
            },
            {
              label: 'Avg Ticket', value: avgTicketActual > 0 ? fmt$(avgTicketActual) : '—', plan: fmt$(plan?.avg_ticket ?? 0) + ' plan',
              stripe: '#5AB3C9',
              progress: plan?.avg_ticket ? Math.min(avgTicketActual / plan.avg_ticket, 1) : 0,
            },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{card.label}</div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>{card.value}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Plan: {card.plan}</div>
              </div>
              <div style={{ height: '4px', background: '#E6F1F4' }}>
                <div style={{ height: '100%', width: `${card.progress * 100}%`, background: card.stripe, transition: 'width 0.3s' }} />
              </div>
              <div style={{ height: '3px', background: card.stripe }} />
            </div>
          ))}
        </div>

        {/* ── Active Recurring Customers (compact) ── */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', marginBottom: '24px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B5CE7', textTransform: 'uppercase', letterSpacing: '0.8px', flexShrink: 0 }}>Active Recurring</div>
          {[
            { label: 'Airbnb / STR', key: 'recurAirbnb', color: '#0C85C2', bg: '#e6f2fb' },
            { label: 'Residential',  key: 'recurResidential', color: '#6B5CE7', bg: '#f0edfb' },
            { label: 'Commercial',   key: 'recurCommercial', color: '#3B8C2A', bg: '#edfae5' },
          ].map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</div>
              <input
                key={`${selectedMonthKey}-${c.key}`}
                defaultValue={getA(c.key) || ''}
                onBlur={e => handleActualChange(c.key, parseFloat(e.target.value) || 0)}
                type="number"
                placeholder="0"
                style={{
                  width: '64px', height: '32px', border: `1.5px solid ${c.color}50`, borderRadius: '7px',
                  padding: '0 8px', fontSize: '14px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
                  color: c.color, background: c.bg, outline: 'none', textAlign: 'center',
                }}
              />
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Total:</span>
            <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#2C3E50' }}>
              {fmtN(getA('recurAirbnb') + getA('recurResidential') + getA('recurCommercial'))}
            </span>
          </div>
        </div>

        {/* ── Grouped card: Revenue & Operations + Leads & Marketing ROI ── */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', marginBottom: '24px', overflow: 'hidden' }}>
          {/* Shared header with mode toggle */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #A7DBE7', display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fcfd', flexWrap: 'wrap' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E6F1F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50' }}>Performance</div>
              <div style={{ fontSize: '11.5px', color: '#aaa', marginTop: '1px' }}>Revenue, cleanings &amp; marketing — weekly or monthly view</div>
            </div>
            {/* Mode toggle */}
            <div style={{ display: 'flex', border: '1px solid #A7DBE7', borderRadius: '8px', overflow: 'hidden', marginLeft: 'auto' }}>
              {(['monthly','weekly'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '7px 14px', fontSize: '12px', cursor: 'pointer', border: 'none',
                  background: mode === m ? '#0C85C2' : '#fff', color: mode === m ? '#fff' : '#666',
                  fontFamily: "'Open Sans', sans-serif", fontWeight: mode === m ? 700 : 400,
                }}>
                  {m === 'monthly' ? 'Monthly totals' : 'Weekly'}
                </button>
              ))}
            </div>
          </div>
          {/* Revenue & Operations sub-header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E6F1F4', display: 'flex', alignItems: 'center', gap: '10px', background: '#fafcfd' }}>
            <span style={{ fontSize: '16px' }}>💰</span>
            <div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>Revenue &amp; Operations</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>Core performance metrics for the month</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Metric</th>
                  <th style={thStyle}>Monthly plan</th>
                  {mode === 'weekly'
                    ? <>
                        {calendarWeeks.map(w => (
                          <th key={w.weekStart} style={thStyle}>{w.label}</th>
                        ))}
                        <th style={thStyle}>Total</th>
                      </>
                    : <th style={thStyle}>Actual</th>
                  }
                  <th style={thStyle}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue — manual input */}
                <tr>
                  <td style={tdLeftStyle}>Total Revenue</td>
                  <td style={tdStyle}>{fmt$(monthlyRevTarget)}</td>
                  {mode === 'weekly'
                    ? <>
                        <WeekInputCells weeks={calendarWeeks} fieldKey="revenue" weeklyData={weeklyData} onWeekChange={setWeekActual} />
                        <td style={tdStyle}><strong>{fmt$(weeklyRevTotal)}</strong></td>
                      </>
                    : <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey="revenue" actuals={{ ...actuals, revenue: monthlyVal('revenue') }} onBlur={handleActualChange} prefix="$" width={110} /></td>
                  }
                  <td style={tdStyle}><VarBadge actual={revenueActual} plan={monthlyRevTarget} /></td>
                </tr>

                {/* Total cleanings */}
                <tr>
                  <td style={tdLeftStyle}>Total Cleanings</td>
                  <td style={tdStyle}>{fmtN(monthlyCleaningsTarget)}</td>
                  {mode === 'weekly'
                    ? <>
                        <WeekInputCells weeks={calendarWeeks} fieldKey="cleanings" weeklyData={weeklyData} onWeekChange={setWeekActual} />
                        <td style={tdStyle}><strong>{fmtN(weeklyCleaningsTotal)}</strong></td>
                      </>
                    : <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey="cleanings" actuals={{ ...actuals, cleanings: monthlyVal('cleanings') }} onBlur={handleActualChange} /></td>
                  }
                  <td style={tdStyle}><VarBadge actual={displayCleanings} plan={monthlyCleaningsTarget} /></td>
                </tr>

                {/* Avg ticket — computed */}
                <tr>
                  <td style={tdLeftStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Avg Ticket
                      <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>computed</span>
                    </div>
                  </td>
                  <td style={tdStyle}>{fmt$(plan?.avg_ticket ?? 0)}</td>
                  {mode === 'weekly'
                    ? <>
                        {calendarWeeks.map(w => {
                          const wRev = getWeekA(w.weekStart, 'revenue')
                          const wClns = getWeekA(w.weekStart, 'cleanings')
                          const wAvg = wClns > 0 ? wRev / wClns : 0
                          return <td key={w.weekStart} style={tdReadStyle}>{wAvg > 0 ? fmt$(wAvg) : '—'}</td>
                        })}
                        <td style={tdReadStyle}>{avgTicketActual > 0 ? fmt$(avgTicketActual) : '—'}</td>
                      </>
                    : <td style={tdReadStyle}>{avgTicketActual > 0 ? fmt$(avgTicketActual) : '—'}</td>
                  }
                  <td style={tdStyle}><VarBadge actual={avgTicketActual} plan={plan?.avg_ticket ?? 0} /></td>
                </tr>

                {/* Close rate — computed */}
                <tr>
                  <td style={tdLeftStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Close Rate
                      <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>computed</span>
                    </div>
                  </td>
                  <td style={tdStyle}>{fmtPct(closeRatePlan)}</td>
                  {mode === 'weekly'
                    ? <><td style={tdReadStyle} colSpan={calendarWeeks.length} /><td style={tdReadStyle}>{totalActualLeads > 0 ? fmtPct(closeRateActual) : '—'}</td></>
                    : <td style={tdReadStyle}>{totalActualLeads > 0 ? fmtPct(closeRateActual) : '—'}</td>
                  }
                  <td style={tdStyle}><VarBadge actual={closeRateActual} plan={closeRatePlan} isPct /></td>
                </tr>

                {/* Total cleaner pay */}
                <tr>
                  <td style={tdLeftStyle}>Total Cleaner Pay</td>
                  <td style={tdStyle}>—</td>
                  {mode === 'weekly'
                    ? <>
                        <WeekInputCells weeks={calendarWeeks} fieldKey="cleanerPay" weeklyData={weeklyData} onWeekChange={setWeekActual} />
                        <td style={tdStyle}><strong>{fmt$(weeklyPayTotal)}</strong></td>
                      </>
                    : <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey="cleanerPay" actuals={{ ...actuals, cleanerPay: monthlyVal('cleanerPay') }} onBlur={handleActualChange} prefix="$" /></td>
                  }
                  <td style={tdStyle}>
                    {revenueActual > 0 && displayPay > 0 && (
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        color: cleanerPayRate <= 50 ? '#3B8C2A' : cleanerPayRate <= 55 ? '#B87800' : '#C0392B',
                      }}>
                        {fmtPct(cleanerPayRate)} — {cleanerPayRate <= 50 ? 'Healthy' : cleanerPayRate <= 55 ? 'Watch' : 'High'}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Divider + Leads & Marketing ROI sub-section */}
          <div style={{ borderTop: '2px solid #A7DBE7' }} />
          {/* Leads & Marketing ROI sub-header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E6F1F4', display: 'flex', alignItems: 'center', gap: '10px', background: '#fafcfd' }}>
            <span style={{ fontSize: '16px' }}>📣</span>
            <div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#2C3E50' }}>Leads &amp; Marketing ROI</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{mode === 'weekly' ? 'Leads · Booked · New Recurring by week' : 'Performance by channel'}</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {mode === 'weekly' ? (
              // ── Weekly mode: leads / booked / recurring sub-rows per channel ──
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#2C3E50' }}>
                    <th style={{ padding: '9px 12px', textAlign: 'left',  fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', minWidth: '140px' }}>Channel / metric</th>
                    {calendarWeeks.map(w => (
                      <th key={w.weekStart} style={{ padding: '9px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{w.label}</th>
                    ))}
                    <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>Total</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>Rate</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>Spend</th>
                    <th style={{ padding: '9px 8px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paidChannels.length === 0 && commChannels.length === 0 && customPaidChannels.length === 0 && customCommChannels.length === 0 && (
                    <tr><td colSpan={calendarWeeks.length + 5} style={{ ...tdLeftStyle, color: '#aaa', textAlign: 'center', padding: '20px' }}>No channels configured in game plan</td></tr>
                  )}
                  {[...paidChannels, ...commChannels, ...customPaidChannels, ...customCommChannels].map((ch, chIdx) => {
                    const isPaid   = ch.type === 'paid'
                    const isCustom = [...customPaidChannels, ...customCommChannels].some(c => c.id === ch.id)
                    const planLeads = isPaid ? ('cpl' in ch ? chPlanLeads(ch as Channel) : 0) : ('conv' in ch ? chCommLeads(ch as Channel) : 0)
                    const dotColor = isPaid ? '#0C85C2' : '#7CCA5B'
                    const rowBg    = isPaid ? undefined : '#fafcfe'

                    const totalLeads   = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, `leads_${ch.id}`), 0)
                    const totalBooked  = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, `booked_${ch.id}`), 0)
                    const totalRecurr  = calendarWeeks.reduce((s, w) => s + getWeekA(w.weekStart, `recurring_${ch.id}`), 0)
                    const closeRate    = totalLeads  > 0 ? totalBooked / totalLeads * 100 : 0
                    const recurrPct    = totalBooked > 0 ? totalRecurr / totalBooked * 100 : 0

                    const isFirstCh = chIdx === 0
                    const topBorder = chIdx > 0 ? '2px solid #E6F1F4' : undefined

                    return (
                      <React.Fragment key={ch.id}>
                        {/* Channel name + leads row */}
                        <tr style={{ background: rowBg, borderTop: topBorder }}>
                          <td style={{ ...tdLeftStyle, paddingTop: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                              <strong style={{ fontSize: '12.5px' }}>{ch.name}</strong>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#5AB3C9', fontWeight: 700, paddingLeft: '13px', marginTop: '2px', letterSpacing: '0.3px' }}>LEADS</div>
                          </td>
                          {calendarWeeks.map(w => (
                            <td key={w.weekStart} style={{ ...tdStyle, padding: '4px 6px', background: rowBg }}>
                              <InputCell monthKey={w.weekStart} fieldKey={`leads_${ch.id}`} actuals={weeklyData[w.weekStart] ?? {}} onBlur={(key, val) => setWeekActual(w.weekStart, key, val)} width={58} />
                            </td>
                          ))}
                          <td style={{ ...tdStyle, fontWeight: 700, background: rowBg }}>{totalLeads > 0 ? fmtN(totalLeads) : '—'}</td>
                          <td style={{ ...tdStyle, color: '#aaa', fontSize: '11px', background: rowBg }}>Plan: {fmtN(planLeads, 1)}</td>
                          <td style={{ ...tdStyle, background: rowBg }}>
                            {isPaid
                              ? <InputCell monthKey={selectedMonthKey} fieldKey={`spend_${ch.id}`} actuals={actuals} onBlur={handleActualChange} prefix="$" width={85} />
                              : <span style={{ color: '#aaa', fontSize: '11px' }}>Time-based</span>}
                          </td>
                          <td style={{ ...tdStyle, background: rowBg }}>
                            {isCustom && (
                              <button onClick={() => { setCustomPaidChannels(p => p.filter(c => c.id !== ch.id)); setCustomCommChannels(p => p.filter(c => c.id !== ch.id)) }}
                                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}>×</button>
                            )}
                          </td>
                        </tr>

                        {/* Booked sub-row */}
                        <tr style={{ background: rowBg }}>
                          <td style={{ ...tdLeftStyle, paddingTop: '2px', paddingBottom: '2px' }}>
                            <div style={{ fontSize: '10.5px', color: '#3B8C2A', fontWeight: 700, paddingLeft: '13px', letterSpacing: '0.3px' }}>↳ BOOKED</div>
                          </td>
                          {calendarWeeks.map(w => (
                            <td key={w.weekStart} style={{ ...tdStyle, padding: '2px 6px', background: rowBg }}>
                              <InputCell monthKey={w.weekStart} fieldKey={`booked_${ch.id}`} actuals={weeklyData[w.weekStart] ?? {}} onBlur={(key, val) => setWeekActual(w.weekStart, key, val)} width={58} />
                            </td>
                          ))}
                          <td style={{ ...tdStyle, fontWeight: 700, color: '#3B8C2A', background: rowBg }}>{totalBooked > 0 ? fmtN(totalBooked) : '—'}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, fontSize: '12px', color: closeRate >= 15 ? '#3B8C2A' : closeRate > 0 ? '#B87800' : '#aaa', background: rowBg }}>
                            {closeRate > 0 ? `${fmtPct(closeRate)} close` : '—'}
                          </td>
                          <td colSpan={2} style={{ background: rowBg }} />
                        </tr>

                        {/* New Recurring sub-row */}
                        <tr style={{ background: rowBg }}>
                          <td style={{ ...tdLeftStyle, paddingTop: '2px', paddingBottom: '10px' }}>
                            <div style={{ fontSize: '10.5px', color: '#6B5CE7', fontWeight: 700, paddingLeft: '13px', letterSpacing: '0.3px' }}>↳ NEW RECURRING</div>
                          </td>
                          {calendarWeeks.map(w => (
                            <td key={w.weekStart} style={{ ...tdStyle, padding: '2px 6px', background: rowBg }}>
                              <InputCell monthKey={w.weekStart} fieldKey={`recurring_${ch.id}`} actuals={weeklyData[w.weekStart] ?? {}} onBlur={(key, val) => setWeekActual(w.weekStart, key, val)} width={58} />
                            </td>
                          ))}
                          <td style={{ ...tdStyle, fontWeight: 700, color: '#6B5CE7', background: rowBg }}>{totalRecurr > 0 ? fmtN(totalRecurr) : '—'}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, fontSize: '12px', color: recurrPct >= 20 ? '#3B8C2A' : recurrPct > 0 ? '#B87800' : '#aaa', background: rowBg }}>
                            {recurrPct > 0 ? `${fmtPct(recurrPct)} rec` : '—'}
                          </td>
                          <td colSpan={2} style={{ background: rowBg }} />
                        </tr>
                      </React.Fragment>
                    )
                  })}
                  {/* Totals row */}
                  {(paidChannels.length > 0 || commChannels.length > 0 || customPaidChannels.length > 0 || customCommChannels.length > 0) && (() => {
                    const allChs = [...paidChannels, ...commChannels, ...customPaidChannels, ...customCommChannels]
                    const grandLeads   = calendarWeeks.reduce((s, w) => s + allChs.reduce((cs, ch) => cs + getWeekA(w.weekStart, `leads_${ch.id}`), 0), 0)
                    const grandBooked  = calendarWeeks.reduce((s, w) => s + allChs.reduce((cs, ch) => cs + getWeekA(w.weekStart, `booked_${ch.id}`), 0), 0)
                    const grandRecurr  = calendarWeeks.reduce((s, w) => s + allChs.reduce((cs, ch) => cs + getWeekA(w.weekStart, `recurring_${ch.id}`), 0), 0)
                    const grandClose   = grandLeads  > 0 ? grandBooked / grandLeads * 100 : 0
                    const grandRecPct  = grandBooked > 0 ? grandRecurr / grandBooked * 100 : 0
                    return (
                      <tr style={{ background: '#f0f8fb', borderTop: '2px solid #A7DBE7' }}>
                        <td style={{ ...tdLeftStyle, fontWeight: 700, fontSize: '12px' }}>
                          <div>Totals</div>
                          <div style={{ fontSize: '10px', color: '#5AB3C9', fontWeight: 700 }}>Leads / Booked / Recurring</div>
                        </td>
                        {calendarWeeks.map(w => {
                          const wLeads  = allChs.reduce((s, ch) => s + getWeekA(w.weekStart, `leads_${ch.id}`), 0)
                          const wBooked = allChs.reduce((s, ch) => s + getWeekA(w.weekStart, `booked_${ch.id}`), 0)
                          const wRecurr = allChs.reduce((s, ch) => s + getWeekA(w.weekStart, `recurring_${ch.id}`), 0)
                          return (
                            <td key={w.weekStart} style={{ ...tdStyle, background: '#f0f8fb', padding: '6px 12px' }}>
                              <div style={{ fontWeight: 700, fontSize: '12px' }}>{wLeads > 0 ? fmtN(wLeads) : '—'}</div>
                              <div style={{ fontSize: '10.5px', color: '#3B8C2A' }}>{wBooked > 0 ? fmtN(wBooked) : '—'}</div>
                              <div style={{ fontSize: '10.5px', color: '#6B5CE7' }}>{wRecurr > 0 ? fmtN(wRecurr) : '—'}</div>
                            </td>
                          )
                        })}
                        <td style={{ ...tdStyle, fontWeight: 700, background: '#f0f8fb', padding: '6px 12px' }}>
                          <div>{grandLeads > 0 ? fmtN(grandLeads) : '—'}</div>
                          <div style={{ fontSize: '10.5px', color: '#3B8C2A' }}>{grandBooked > 0 ? fmtN(grandBooked) : '—'}</div>
                          <div style={{ fontSize: '10.5px', color: '#6B5CE7' }}>{grandRecurr > 0 ? fmtN(grandRecurr) : '—'}</div>
                        </td>
                        <td style={{ ...tdStyle, background: '#f0f8fb', padding: '6px 12px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: grandClose >= 15 ? '#3B8C2A' : grandClose > 0 ? '#B87800' : '#aaa' }}>{grandClose > 0 ? `${fmtPct(grandClose)} close` : '—'}</div>
                          <div style={{ fontSize: '10.5px', fontWeight: 700, color: grandRecPct >= 20 ? '#3B8C2A' : grandRecPct > 0 ? '#B87800' : '#aaa' }}>{grandRecPct > 0 ? `${fmtPct(grandRecPct)} rec` : '—'}</div>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, background: '#f0f8fb' }}>{fmt$(totalActualSpend)}</td>
                        <td style={{ background: '#f0f8fb' }} />
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            ) : (
              // ── Monthly mode: full channel table ──
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#2C3E50' }}>
                    {['Channel','Plan Spend','Actual Spend','Plan Leads','Actual Leads','Booked','Close %','New Recurring','Rec %','CPL','ROAS',''].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paidChannels.length === 0 && commChannels.length === 0 && customPaidChannels.length === 0 && customCommChannels.length === 0 && (
                    <tr><td colSpan={12} style={{ ...tdLeftStyle, color: '#aaa', textAlign: 'center', padding: '20px' }}>No channels configured in game plan</td></tr>
                  )}
                  {[...paidChannels, ...commChannels, ...customPaidChannels, ...customCommChannels].map(ch => {
                    const isPaid = ch.type === 'paid'
                    const isCustom = [...customPaidChannels, ...customCommChannels].some(c => c.id === ch.id)
                    const planSpend  = isPaid ? chPlanSpend(ch.id) : null
                    const planLeads  = isPaid ? ('cpl' in ch ? chPlanLeads(ch as Channel) : 0) : ('conv' in ch ? chCommLeads(ch as Channel) : 0)
                    const actSpend   = isPaid ? getA(`spend_${ch.id}`) : null
                    const actLeads   = getA(`leads_${ch.id}`)
                    const booked     = getA(`booked_${ch.id}`)         // actual cleanings from this channel
                    const newRecurr  = getA(`recurring_${ch.id}`)      // of those booked, became recurring
                    const closeRate  = actLeads > 0 ? booked / actLeads * 100 : 0
                    const recurrPct  = booked > 0 ? newRecurr / booked * 100 : 0
                    const cpl        = isPaid && actLeads > 0 && actSpend ? actSpend / actLeads : 0
                    const chRev      = booked * (plan?.avg_ticket ?? 0)
                    const roas       = isPaid && actSpend && actSpend > 0 ? chRev / actSpend : 0
                    const roasColor  = roas >= 2 ? '#3B8C2A' : roas >= 1 ? '#B87800' : '#C0392B'
                    const rowBg      = isPaid ? undefined : '#fafcfe'
                    return (
                      <tr key={ch.id} style={{ background: rowBg }}>
                        <td style={tdLeftStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isPaid ? '#0C85C2' : '#7CCA5B', display: 'inline-block', flexShrink: 0 }} />
                            <strong>{ch.name}</strong>
                          </div>
                          {!isPaid && <div style={{ fontSize: '11px', color: '#aaa', paddingLeft: '13px' }}>Community</div>}
                        </td>
                        <td style={tdStyle}>{planSpend !== null ? fmt$(planSpend) : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Time-based</span>}</td>
                        <td style={tdStyle}>
                          {isPaid
                            ? <InputCell monthKey={selectedMonthKey} fieldKey={`spend_${ch.id}`} actuals={actuals} onBlur={handleActualChange} prefix="$" width={90} />
                            : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                        <td style={tdStyle}>{planLeads > 0 ? fmtN(planLeads, 1) : '—'}</td>
                        <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey={`leads_${ch.id}`} actuals={actuals} onBlur={handleActualChange} width={75} /></td>
                        <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey={`booked_${ch.id}`} actuals={actuals} onBlur={handleActualChange} width={65} /></td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: closeRate >= 15 ? '#3B8C2A' : closeRate > 0 ? '#B87800' : '#aaa' }}>
                          {closeRate > 0 ? fmtPct(closeRate) : '—'}
                        </td>
                        <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey={`recurring_${ch.id}`} actuals={actuals} onBlur={handleActualChange} width={65} /></td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: recurrPct >= 20 ? '#3B8C2A' : recurrPct > 0 ? '#B87800' : '#aaa' }}>
                          {recurrPct > 0 ? fmtPct(recurrPct) : '—'}
                        </td>
                        <td style={tdStyle}>{cpl > 0 ? fmt$(cpl) : '—'}</td>
                        <td style={tdStyle}>
                          {isPaid && roas > 0
                            ? <span style={{ fontWeight: 700, color: roasColor }}>{fmtN(roas, 1)}x</span>
                            : <span style={{ color: '#aaa' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          {isCustom && (
                            <button
                              onClick={() => {
                                setCustomPaidChannels(prev => prev.filter(c => c.id !== ch.id))
                                setCustomCommChannels(prev => prev.filter(c => c.id !== ch.id))
                              }}
                              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}
                            >×</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {(paidChannels.length > 0 || commChannels.length > 0 || customPaidChannels.length > 0 || customCommChannels.length > 0) && (() => {
                    const allChs = [...paidChannels, ...commChannels, ...customPaidChannels, ...customCommChannels]
                    const totalBooked   = allChs.reduce((s, ch) => s + getA(`booked_${ch.id}`), 0)
                    const totalRecurr   = allChs.reduce((s, ch) => s + getA(`recurring_${ch.id}`), 0)
                    const totalCloseRate = totalActualLeads > 0 ? totalBooked / totalActualLeads * 100 : 0
                    const totalRecurrPct = totalBooked > 0 ? totalRecurr / totalBooked * 100 : 0
                    return (
                      <tr style={{ background: '#f0f8fb', fontWeight: 700 }}>
                        <td style={{ ...tdLeftStyle, fontWeight: 700 }}>Totals</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt$(totalPlanSpend)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt$(totalActualSpend)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(totalPlanLeads, 1)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(totalActualLeads)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{totalBooked > 0 ? fmtN(totalBooked) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: totalCloseRate >= 15 ? '#3B8C2A' : totalCloseRate > 0 ? '#B87800' : '#aaa' }}>{totalCloseRate > 0 ? fmtPct(totalCloseRate) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{totalRecurr > 0 ? fmtN(totalRecurr) : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: totalRecurrPct >= 20 ? '#3B8C2A' : totalRecurrPct > 0 ? '#B87800' : '#aaa' }}>{totalRecurrPct > 0 ? fmtPct(totalRecurrPct) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#aaa' }}>—</td>
                        <td style={{ ...tdStyle, color: '#aaa' }}>—</td>
                        <td style={tdStyle}></td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            )}
          </div>
          {/* Add channel button */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E6F1F4' }}>
            <button
              onClick={() => {
                const name = window.prompt('Enter marketing channel name:')
                if (name) {
                  const newCh = { id: `custom_${Date.now()}`, name, type: 'paid' as const }
                  setCustomPaidChannels(prev => {
                    const next = [...prev, newCh]
                    handleNoteChange('customPaidChannels', JSON.stringify(next))
                    return next
                  })
                }
              }}
              style={{ fontSize: '12px', color: '#0C85C2', background: '#e6f2fb', border: '1px solid #A7DBE7', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}
            >+ Add Marketing Channel</button>
          </div>
        </div>


        {/* ── Sections 4 & 5: Community Activity + Health Indicators side by side ── */}
        {(() => {
          const reviewsGoal = plan?.reviews_goal ? Math.round(plan.reviews_goal / (planMonths.length || 12)) : 0
          const reviewsActual = getA('googleReviews')
          const reviewsPct = reviewsGoal > 0 ? reviewsActual / reviewsGoal : 0
          const reviewsBadgeBg = reviewsPct >= 1 ? '#edfae5' : reviewsPct >= 0.5 ? '#fffbe6' : '#fde8e8'
          const reviewsBadgeColor = reviewsPct >= 1 ? '#3B8C2A' : reviewsPct >= 0.5 ? '#B87800' : '#C0392B'
          const reviewsBadgeText = reviewsGoal > 0
            ? (reviewsPct >= 1 ? `${fmtN(reviewsActual)} / ${fmtN(reviewsGoal)} — On track!` : reviewsPct >= 0.5 ? `${fmtN(reviewsActual)} / ${fmtN(reviewsGoal)} — Almost there` : `${fmtN(reviewsActual)} / ${fmtN(reviewsGoal)} — Needs attention`)
            : null
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Community Marketing Activity */}
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden' }}>
                <SectionHeader iconBg="#edfae5" icon="🤝" title="Community Marketing Activity" sub="Events, outreach and reputation" />
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thLeftStyle}>Activity</th>
                        <th style={thStyle}>Plan</th>
                        <th style={thStyle}>Actual</th>
                        <th style={thStyle}>Var</th>
                        <th style={thStyle}></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLeftStyle}>CM Events</td>
                        <td style={tdStyle}>4</td>
                        <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey="cmEvents" actuals={actuals} onBlur={handleActualChange} width={60} /></td>
                        <td style={tdStyle}><VarBadge actual={getA('cmEvents')} plan={4} /></td>
                        <td style={tdStyle}></td>
                      </tr>
                      <tr>
                        <td style={tdLeftStyle}>Drop-offs / Flyers</td>
                        <td style={tdStyle}>{dropoffsPlanActions !== null ? fmtN(dropoffsPlanActions) : '—'}</td>
                        <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey="dropoffs" actuals={actuals} onBlur={handleActualChange} width={60} /></td>
                        <td style={tdStyle}>{dropoffsPlanActions !== null ? <VarBadge actual={getA('dropoffs')} plan={dropoffsPlanActions} /> : '—'}</td>
                        <td style={tdStyle}></td>
                      </tr>
                      {customCommunityRows.map(row => (
                        <tr key={row.id}>
                          <td style={tdLeftStyle}>{row.name}</td>
                          <td style={{ ...tdStyle, color: '#aaa' }}>—</td>
                          <td style={tdStyle}><InputCell monthKey={selectedMonthKey} fieldKey={`comm_${row.id}`} actuals={actuals} onBlur={handleActualChange} width={60} /></td>
                          <td style={tdStyle}>—</td>
                          <td style={tdStyle}>
                            <button onClick={() => setCustomCommunityRows(prev => prev.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 20px', borderTop: '1px solid #E6F1F4' }}>
                  <button
                    onClick={() => {
                      const name = window.prompt('Enter activity name:')
                      if (name) {
                        const newRow = { id: `custom_${Date.now()}`, name }
                        setCustomCommunityRows(prev => {
                          const next = [...prev, newRow]
                          handleNoteChange('customCommunityRows', JSON.stringify(next))
                          return next
                        })
                      }
                    }}
                    style={{ fontSize: '12px', color: '#3B8C2A', background: '#edfae5', border: '1px solid #A7DBE7', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontFamily: "'Open Sans', sans-serif" }}
                  >+ Add activity</button>
                </div>
              </div>

              {/* Health Indicators */}
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #A7DBE7', overflow: 'hidden' }}>
                <SectionHeader iconBg="#fde8e8" icon="🩺" title="Health Indicators" sub="Key signals to watch this month" />
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Recurring cancellations</div>
                      <InputCell monthKey={selectedMonthKey} fieldKey="cancelRecurring" actuals={actuals} onBlur={handleActualChange} width={100} />
                    </div>
                    {getA('cancelRecurring') > 0 && (
                      <div style={{ padding: '10px 14px', background: '#fde8e8', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#C0392B' }}>
                          {getA('cancelRecurring')} client{getA('cancelRecurring') !== 1 ? 's' : ''} lost
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Review on next coaching call</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Google Reviews (new this month)</div>
                      <InputCell monthKey={selectedMonthKey} fieldKey="googleReviews" actuals={actuals} onBlur={handleActualChange} width={100} />
                    </div>
                    {reviewsBadgeText && (
                      <div style={{ padding: '10px 14px', background: reviewsBadgeBg, borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: reviewsBadgeColor }}>{reviewsBadgeText}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Monthly goal: {fmtN(reviewsGoal)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Section 6: Focus & Notes ── */}
        <SectionCard>
          <SectionHeader iconBg="#fffbe6" icon="📝" title="Focus & Notes" sub="Monthly reflections" />
          <div style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0C85C2', marginBottom: '8px' }}>What to focus on next month</div>
            <textarea
              value={notes['focusNext'] || ''}
              onChange={e => handleNoteChange('focusNext', e.target.value)}
              placeholder="Enter your focus areas for next month…"
              rows={5}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #A7DBE7', borderRadius: '8px',
                fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50',
                background: '#e8f4fb', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
