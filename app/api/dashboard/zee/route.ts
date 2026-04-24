import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function getPlanMonths(planStart: string, horizon: string) {
  const [sy, sm] = planStart.split('-').map(Number)
  const months: { year: number; monthIdx: number; key: string }[] = []
  if (horizon === '12mo') {
    for (let i = 0; i < 12; i++) {
      const d = new Date(sy, sm - 1 + i, 1)
      months.push({ year: d.getFullYear(), monthIdx: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    }
  } else {
    // eoy: start month through Dec of that year
    for (let mi = sm - 1; mi <= 11; mi++) {
      months.push({ year: sy, monthIdx: mi, key: `${sy}-${String(mi + 1).padStart(2, '0')}` })
    }
  }
  return months
}

function getMonthlyTarget(monthIdx: number, plan: any, planMonths: { monthIdx: number }[]) {
  if (!plan) return null
  const annual = plan.annual_goal ?? 0
  if (plan.use_seasonality) {
    const seasonality: number[] = Array.isArray(plan.seasonality) ? plan.seasonality : []
    const seasonSum = seasonality.reduce((a: number, b: number) => a + b, 0) || 1
    return annual * ((seasonality[monthIdx] ?? 0) / seasonSum)
  }
  return annual / Math.max(planMonths.length, 1)
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*, locations(id, name, name_ghl)')
      .eq('id', user.id)
      .single()

    if (!profile?.location_id) return NextResponse.json({ error: 'No location assigned' }, { status: 400 })

    const locationId = profile.location_id

    // Business profile (for forecasted sales)
    const { data: bizProfile } = await supabaseAdmin
      .from('business_profiles')
      .select('id, forecasted_sales')
      .eq('profile_id', user.id)
      .single()

    // Period setup
    const { data: latestOpp } = await supabaseAdmin
      .from('opportunities').select('date').eq('status', 'won')
      .order('date', { ascending: false }).limit(1).single()

    const dateStr = latestOpp?.date ?? new Date().toISOString().split('T')[0]
    const [yearStr, monthStr] = dateStr.split('-')
    const year = parseInt(yearStr)
    const month = parseInt(monthStr) // 1-12

    const currentPeriod = `${year}-${String(month).padStart(2, '0')}-01`
    const currentPeriodEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevPeriodStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const prevPeriodEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`
    const now = new Date(year, month - 1, 1)
    const currentKey = `${year}-${String(month).padStart(2, '0')}`

    // Jobs from opportunities (for jobs completed / avg ticket)
    const [{ data: currentOpps }, { data: prevOpps }] = await Promise.all([
      supabaseAdmin.from('opportunities').select('status, value, frequency_type')
        .eq('location_id', locationId).gte('date', currentPeriod).lte('date', currentPeriodEnd),
      supabaseAdmin.from('opportunities').select('status, value')
        .eq('location_id', locationId).gte('date', prevPeriodStr).lte('date', prevPeriodEnd),
    ])

    const wonOpps = (currentOpps ?? []).filter(o => o.status === 'won')
    const prevWon = (prevOpps ?? []).filter(o => o.status === 'won')
    const jobsCompleted = wonOpps.length
    const jobsMoM = prevWon.length > 0 ? jobsCompleted - prevWon.length : null

    // Revenue from revenue table — sum Short Term + Long Term per month
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
    const [{ data: currentRevData }, { data: prevRevData }, { data: allRevData }, { data: trendRevData }] = await Promise.all([
      supabaseAdmin.from('revenue').select('amount')
        .eq('location_id', locationId).gte('period_start', currentPeriod).lte('period_start', currentPeriodEnd),
      supabaseAdmin.from('revenue').select('amount')
        .eq('location_id', locationId).gte('period_start', prevPeriodStr).lte('period_start', prevPeriodEnd),
      supabaseAdmin.from('revenue').select('location_id, amount')
        .gte('period_start', currentPeriod).lte('period_start', currentPeriodEnd),
      supabaseAdmin.from('revenue').select('period_start, amount')
        .eq('location_id', locationId).gte('period_start', twelveMonthsAgo)
        .order('period_start', { ascending: true }),
    ])

    const currentRevenue = (currentRevData ?? []).reduce((s, r) => s + (r.amount || 0), 0)
    const prevRevenue = (prevRevData ?? []).reduce((s, r) => s + (r.amount || 0), 0)
    const revMoM = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0
    const avgJobValue = jobsCompleted > 0 ? currentRevenue / jobsCompleted : 0

    // Network rank from revenue table
    const networkTotals: Record<string, number> = {}
    for (const r of allRevData ?? []) {
      networkTotals[r.location_id] = (networkTotals[r.location_id] ?? 0) + (r.amount || 0)
    }
    const sorted = Object.entries(networkTotals).sort(([, a], [, b]) => b - a)
    const rank = sorted.findIndex(([id]) => id === locationId) + 1
    const prevRankEntry = sorted[rank - 2]
    const revenueToNextRank = prevRankEntry ? prevRankEntry[1] - currentRevenue : 0

    // Revenue trend — last 12 months from revenue table
    const trendMap: Record<string, number> = {}
    for (const r of trendRevData ?? []) {
      const key = r.period_start.substring(0, 7)
      trendMap[key] = (trendMap[key] ?? 0) + (r.amount || 0)
    }
    const trend = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([month, amount]) => ({ month, amount }))

    // Game plan + vision
    const [{ data: gamePlan }, { data: vision }] = await Promise.all([
      supabaseAdmin.from('gameplans').select('*').eq('user_id', user.id).eq('is_active', true).single(),
      supabaseAdmin.from('vision').select('avg_ticket, baseline_revenue, one_yr_rev').eq('user_id', user.id).single(),
    ])

    let monthlyRevenueTarget = 0
    let planAvgTicket = vision?.avg_ticket ?? 0
    let reviewsGoal = 0
    let reviewsYtd = 0
    let baseMrr = 0
    let projectedMrr = 0
    let planMonths: ReturnType<typeof getPlanMonths> = []

    if (gamePlan) {
      const monthIdx = month - 1
      planAvgTicket = gamePlan.avg_ticket || vision?.avg_ticket || 0
      reviewsGoal = gamePlan.reviews_goal ?? 100
      reviewsYtd = gamePlan.reviews_ytd ?? 0
      baseMrr = gamePlan.base_mrr ?? 0

      const planStart = gamePlan.plan_start ?? currentKey
      const planHorizon = gamePlan.plan_horizon ?? 'eoy'
      planMonths = getPlanMonths(planStart, planHorizon)

      monthlyRevenueTarget = getMonthlyTarget(monthIdx, gamePlan, planMonths) ?? 0

      // Projected accumulated MRR up to and including current month
      projectedMrr = baseMrr
      for (const pm of planMonths) {
        if (pm.key > currentKey) break
        const monthTarget = getMonthlyTarget(pm.monthIdx, gamePlan, planMonths) ?? 0
        projectedMrr += monthTarget * ((gamePlan.recurring_pct ?? 0) / 100)
      }
    }

    const monthlyJobsTarget = planAvgTicket > 0 ? Math.round(monthlyRevenueTarget / planAvgTicket) : 0

    // Build targets array parallel to trend (for chart dotted line)
    const targets = trend.map(t => {
      if (!gamePlan || planMonths.length === 0) return { month: t.month, amount: null }
      const pm = planMonths.find(p => p.key === t.month)
      if (!pm) return { month: t.month, amount: null }
      return { month: t.month, amount: getMonthlyTarget(pm.monthIdx, gamePlan, planMonths) }
    })

    // Leaderboard top 10
    const { data: locations } = await supabaseAdmin.from('locations').select('id, name_ghl')
    const locMap: Record<string, string> = {}
    for (const l of locations ?? []) locMap[l.id] = l.name_ghl

    const leaderboard = sorted.slice(0, 10).map(([id, revenue], i) => ({
      rank: i + 1, name: locMap[id] ?? id, revenue, you: id === locationId,
    }))
    if (!leaderboard.find(l => l.you)) {
      leaderboard.push({ rank, name: (profile.locations as any)?.name_ghl ?? '', revenue: currentRevenue, you: true })
    }

    return NextResponse.json({
      _debug: { locationId, currentPeriod, currentPeriodEnd, wonCount: wonOpps.length, latestOppDate: latestOpp?.date },
      period: { current: currentPeriod, end: currentPeriodEnd },
      profile: { name: profile.full_name, location: (profile.locations as any)?.name_ghl, avatar_url: profile.avatar_url ?? null },
      biz_profile_id: bizProfile?.id ?? null,
      kpis: {
        revenue: currentRevenue,
        revenue_mom: revMoM,
        jobs_completed: jobsCompleted,
        jobs_mom: jobsMoM,
        avg_job_value: avgJobValue,
        network_rank: rank,
        total_locations: sorted.length,
        revenue_to_next_rank: revenueToNextRank,
        forecasted_sales: (bizProfile as any)?.forecasted_sales ?? 0,
        mrr: baseMrr,
        mrr_target: projectedMrr,
      },
      trend,
      targets,
      leaderboard,
      goals: [
        { label: 'Revenue',         current: currentRevenue, target: monthlyRevenueTarget, color: '#0C85C2', hasTarget: !!gamePlan },
        { label: 'Jobs booked',     current: jobsCompleted,  target: monthlyJobsTarget,    color: '#5AB3C9', hasTarget: !!gamePlan && monthlyJobsTarget > 0 },
        { label: 'MRR',             current: baseMrr,         target: projectedMrr,          color: '#7CCA5B', hasTarget: !!gamePlan },
        { label: 'Google reviews',  current: reviewsYtd,     target: reviewsGoal,           color: '#FFB600', hasTarget: !!gamePlan },
      ],
      hasGamePlan: !!gamePlan,
    })
  } catch (err: any) {
    console.error('Zee dashboard error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
