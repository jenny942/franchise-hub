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

    // Business profile (manually-entered KPI values)
    const { data: bizProfile } = await supabaseAdmin
      .from('business_profiles')
      .select('id, forecasted_sales, recurring_sales, avg_ticket_price')
      .eq('profile_id', user.id)
      .single()

    // Period setup — drive off latest won opp date
    const { data: latestOpp } = await supabaseAdmin
      .from('opportunities').select('date').eq('status', 'won')
      .order('date', { ascending: false }).limit(1).single()

    const dateStr = latestOpp?.date ?? new Date().toISOString().split('T')[0]
    const [yearStr, monthStr] = dateStr.split('-')
    const year = parseInt(yearStr)
    const month = parseInt(monthStr) // 1-12

    const currentPeriod    = `${year}-${String(month).padStart(2, '0')}-01`
    const currentPeriodEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
    const prevMonth  = month === 1 ? 12 : month - 1
    const prevYear   = month === 1 ? year - 1 : year
    const prevPeriodStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const prevPeriodEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`
    const now        = new Date(year, month - 1, 1)
    const currentKey = `${year}-${String(month).padStart(2, '0')}`

    // Jobs from opportunities (for jobs count + avg ticket calc)
    const [{ data: currentOpps }, { data: prevOpps }] = await Promise.all([
      supabaseAdmin.from('opportunities').select('status, value, frequency_type')
        .eq('location_id', locationId).gte('date', currentPeriod).lte('date', currentPeriodEnd),
      supabaseAdmin.from('opportunities').select('status, value')
        .eq('location_id', locationId).gte('date', prevPeriodStr).lte('date', prevPeriodEnd),
    ])

    const wonOpps  = (currentOpps ?? []).filter(o => o.status === 'won')
    const prevWon  = (prevOpps ?? []).filter(o => o.status === 'won')
    const jobsCompleted = wonOpps.length
    const jobsMoM  = prevWon.length > 0 ? jobsCompleted - prevWon.length : null

    // Revenue: pull from tracker_actuals (manual entries), fall back to revenue table (GHL sync)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const twelveMonthsAgoKey = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}`

    // This user's tracker actuals for current + prev month
    const [{ data: currentActual }, { data: prevActual }, { data: allPrevActuals }, { data: trendActuals }] = await Promise.all([
      supabaseAdmin.from('tracker_actuals').select('data').eq('user_id', user.id).eq('month_key', currentKey).single(),
      supabaseAdmin.from('tracker_actuals').select('data').eq('user_id', user.id).eq('month_key', `${prevYear}-${String(prevMonth).padStart(2, '0')}`).single(),
      // All users' tracker actuals for prev month — for leaderboard
      supabaseAdmin.from('tracker_actuals').select('user_id, data').eq('month_key', `${prevYear}-${String(prevMonth).padStart(2, '0')}`),
      // This user's last 12 months — for trend chart
      supabaseAdmin.from('tracker_actuals').select('month_key, data').eq('user_id', user.id).gte('month_key', twelveMonthsAgoKey).order('month_key', { ascending: true }),
    ])

    const currentRevenue = (currentActual?.data as any)?.revenue ?? 0
    const prevRevenue    = (prevActual?.data as any)?.revenue ?? 0
    const revMoM         = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0
    const avgJobValue    = jobsCompleted > 0 ? currentRevenue / jobsCompleted : 0

    // Build leaderboard from all users' tracker actuals for prev month
    // We need user_id → location name mapping via profiles
    const { data: allProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, location_id, locations(id, name_ghl)')
      .eq('role', 'franchisee')

    const profileMap: Record<string, { name: string; locationId: string | null }> = {}
    for (const p of allProfiles ?? []) {
      profileMap[p.id] = {
        name: (p.locations as any)?.name_ghl ?? p.full_name ?? p.id,
        locationId: p.location_id ?? null,
      }
    }

    const networkPrevTotals: Record<string, number> = {}
    for (const row of allPrevActuals ?? []) {
      const rev = (row.data as any)?.revenue ?? 0
      if (rev > 0) networkPrevTotals[row.user_id] = rev
    }

    const prevSorted = Object.entries(networkPrevTotals).sort(([, a], [, b]) => b - a)
    const prevRank   = prevSorted.findIndex(([id]) => id === user.id) + 1
    const prevRankAbove = prevSorted[prevRank - 2]
    const revenueToNextRank = prevRankAbove
      ? prevRankAbove[1] - (networkPrevTotals[user.id] ?? 0)
      : 0
    const leaderboardLastUpdated: string | null = null

    // Revenue trend chart — last 12 months from tracker_actuals
    const trendMap: Record<string, number> = {}
    for (const row of trendActuals ?? []) {
      const rev = (row.data as any)?.revenue ?? 0
      if (rev > 0) trendMap[row.month_key] = rev
    }
    const trend = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([month, amount]) => ({ month, amount }))

    // Game plan + vision for targets
    const [{ data: gamePlan }, { data: vision }] = await Promise.all([
      supabaseAdmin.from('gameplans').select('*').eq('user_id', user.id).eq('is_active', true).single(),
      supabaseAdmin.from('vision').select('avg_ticket, baseline_revenue, one_yr_rev').eq('user_id', user.id).single(),
    ])

    let monthlyRevenueTarget = 0
    let planAvgTicket = vision?.avg_ticket ?? 0
    let reviewsGoal = 0
    let reviewsYtd  = 0
    let baseMrr     = 0
    let projectedMrr = 0
    let planMonths: ReturnType<typeof getPlanMonths> = []

    if (gamePlan) {
      const monthIdx = month - 1
      planAvgTicket  = gamePlan.avg_ticket || vision?.avg_ticket || 0
      reviewsGoal    = gamePlan.reviews_goal ?? 100
      reviewsYtd     = gamePlan.reviews_ytd  ?? 0
      baseMrr        = gamePlan.base_mrr     ?? 0

      const planStart   = gamePlan.plan_start   ?? currentKey
      const planHorizon = gamePlan.plan_horizon  ?? 'eoy'
      planMonths        = getPlanMonths(planStart, planHorizon)

      monthlyRevenueTarget = getMonthlyTarget(monthIdx, gamePlan, planMonths) ?? 0

      projectedMrr = baseMrr
      for (const pm of planMonths) {
        if (pm.key > currentKey) break
        const monthTarget = getMonthlyTarget(pm.monthIdx, gamePlan, planMonths) ?? 0
        projectedMrr += monthTarget * ((gamePlan.recurring_pct ?? 0) / 100)
      }
    }

    const monthlyJobsTarget = planAvgTicket > 0 ? Math.round(monthlyRevenueTarget / planAvgTicket) : 0

    // Targets array for chart dotted line
    const targets = trend.map(t => {
      if (!gamePlan || planMonths.length === 0) return { month: t.month, amount: null }
      const pm = planMonths.find(p => p.key === t.month)
      if (!pm) return { month: t.month, amount: null }
      return { month: t.month, amount: getMonthlyTarget(pm.monthIdx, gamePlan, planMonths) }
    })

    // Leaderboard — top 10 by prev month tracker revenue
    const leaderboard = prevSorted.slice(0, 10).map(([uid, revenue], i) => ({
      rank: i + 1,
      name: profileMap[uid]?.name ?? uid,
      revenue,
      you: uid === user.id,
    }))
    if (!leaderboard.find(l => l.you) && prevRank > 0) {
      leaderboard.push({
        rank: prevRank,
        name: profileMap[user.id]?.name ?? (profile.locations as any)?.name_ghl ?? '',
        revenue: networkPrevTotals[user.id] ?? 0,
        you: true,
      })
    }

    return NextResponse.json({
      _debug: { locationId, currentPeriod, currentPeriodEnd, wonCount: wonOpps.length },
      period: { current: currentPeriod, end: currentPeriodEnd },
      profile: { name: profile.full_name, location: (profile.locations as any)?.name_ghl, avatar_url: profile.avatar_url ?? null },
      biz_profile_id: bizProfile?.id ?? null,
      kpis: {
        revenue:            currentRevenue,
        revenue_mom:        revMoM,
        jobs_completed:     jobsCompleted,
        jobs_mom:           jobsMoM,
        avg_job_value:      avgJobValue,
        network_rank:       prevRank || 0,
        revenue_to_next_rank: revenueToNextRank,
        forecasted_sales:   (bizProfile as any)?.forecasted_sales   ?? 0,
        recurring_sales:    (bizProfile as any)?.recurring_sales    ?? 0,
        avg_ticket_price:   (bizProfile as any)?.avg_ticket_price   ?? 0,
        mrr:                baseMrr,
        mrr_target:         projectedMrr,
      },
      leaderboard_month:        prevPeriodStr,
      leaderboard_last_updated: leaderboardLastUpdated,
      trend,
      targets,
      leaderboard,
      goals: [
        { label: 'Revenue',        current: currentRevenue, target: monthlyRevenueTarget, color: '#0C85C2', hasTarget: !!gamePlan },
        { label: 'Jobs booked',    current: jobsCompleted,  target: monthlyJobsTarget,    color: '#5AB3C9', hasTarget: !!gamePlan && monthlyJobsTarget > 0 },
        { label: 'MRR',            current: baseMrr,         target: projectedMrr,          color: '#7CCA5B', hasTarget: !!gamePlan },
        { label: 'Google reviews', current: reviewsYtd,     target: reviewsGoal,           color: '#FFB600', hasTarget: !!gamePlan },
      ],
      hasGamePlan: !!gamePlan,
    })
  } catch (err: any) {
    console.error('Zee dashboard error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
