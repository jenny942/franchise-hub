import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    // Get auth token from request header
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get profile + location
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*, locations(id, name, name_ghl)')
      .eq('id', user.id)
      .single()

    if (!profile?.location_id) {
      return NextResponse.json({ error: 'No location assigned' }, { status: 400 })
    }

    const locationId = profile.location_id

    // Use the most recent month that has opportunity data
    // Parse date components directly from string to avoid timezone shift issues
    const { data: latestOpp } = await supabaseAdmin
      .from('opportunities')
      .select('date')
      .eq('status', 'won')
      .order('date', { ascending: false })
      .limit(1)
      .single()

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

    // Current + previous month won opportunities for this location
    const [{ data: currentOpps }, { data: prevOpps }] = await Promise.all([
      supabaseAdmin.from('opportunities').select('status, value, frequency_type')
        .eq('location_id', locationId).gte('date', currentPeriod).lte('date', currentPeriodEnd),
      supabaseAdmin.from('opportunities').select('status, value')
        .eq('location_id', locationId).gte('date', prevPeriodStr).lte('date', prevPeriodEnd),
    ])

    const wonOpps = (currentOpps ?? []).filter(o => o.status === 'won')
    const prevWon = (prevOpps ?? []).filter(o => o.status === 'won')

    // Revenue = sum of first job values for won opportunities
    const currentRevenue = wonOpps.reduce((s, o) => s + (o.value || 0), 0)
    const prevRevenue = prevWon.reduce((s, o) => s + (o.value || 0), 0)
    const revMoM = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0

    const jobsCompleted = wonOpps.length
    const avgJobValue = jobsCompleted > 0 ? currentRevenue / jobsCompleted : 0
    const jobsMoM = prevWon.length > 0 ? jobsCompleted - prevWon.length : null

    // Network rank by won opportunity value this month (same source as KPIs — stays current)
    const { data: allWonOpps } = await supabaseAdmin
      .from('opportunities')
      .select('location_id, value')
      .eq('status', 'won')
      .gte('date', currentPeriod)
      .lte('date', currentPeriodEnd)

    const networkTotals: Record<string, number> = {}
    for (const r of allWonOpps ?? []) {
      networkTotals[r.location_id] = (networkTotals[r.location_id] ?? 0) + (r.value || 0)
    }
    const sorted = Object.entries(networkTotals).sort(([, a], [, b]) => b - a)
    const rank = sorted.findIndex(([id]) => id === locationId) + 1
    const prevRankEntry = sorted[rank - 2]
    const revenueToNextRank = prevRankEntry ? prevRankEntry[1] - currentRevenue : 0

    // Revenue trend — last 12 months from won opportunities
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
    const { data: trendData } = await supabaseAdmin
      .from('opportunities')
      .select('date, value')
      .eq('location_id', locationId)
      .eq('status', 'won')
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })

    const trendMap: Record<string, number> = {}
    for (const r of trendData ?? []) {
      const key = r.date.substring(0, 7)
      trendMap[key] = (trendMap[key] ?? 0) + (r.value || 0)
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }))

    // Active game plan + vision for goal targets
    const [{ data: gamePlan }, { data: vision }] = await Promise.all([
      supabaseAdmin.from('gameplans').select('*').eq('user_id', user.id).eq('is_active', true).single(),
      supabaseAdmin.from('vision').select('avg_ticket, baseline_revenue, one_yr_rev').eq('user_id', user.id).single(),
    ])

    // Parse seasonality and calculate this month's revenue target
    let monthlyRevenueTarget = 0
    let annualGoal = 0
    let planAvgTicket = vision?.avg_ticket ?? 0
    let reviewsGoal = 0
    let reviewsYtd = 0

    if (gamePlan) {
      const seasonality: number[] = typeof gamePlan.seasonality === 'string'
        ? JSON.parse(gamePlan.seasonality)
        : (gamePlan.seasonality ?? [])
      const seasonSum = seasonality.reduce((a: number, b: number) => a + b, 0) || 1
      const monthIdx = month - 1 // convert 1-12 to 0-11
      annualGoal = gamePlan.annual_goal ?? 0
      monthlyRevenueTarget = annualGoal * ((seasonality[monthIdx] ?? 0) / seasonSum)
      planAvgTicket = gamePlan.avg_ticket || vision?.avg_ticket || 0
      reviewsGoal = gamePlan.reviews_goal ?? 100
      reviewsYtd = gamePlan.reviews_ytd ?? 0
    }

    const monthlyJobsTarget = planAvgTicket > 0 ? Math.round(monthlyRevenueTarget / planAvgTicket) : 0
    const newClientsCount = wonOpps.filter(o => o.frequency_type === 'One Time').length
    const newClientsTarget = planAvgTicket > 0 ? Math.round(monthlyRevenueTarget / planAvgTicket * 0.6) : 20

    // Leaderboard top 10 with this location highlighted
    const { data: locations } = await supabaseAdmin
      .from('locations')
      .select('id, name_ghl')

    const locMap: Record<string, string> = {}
    for (const l of locations ?? []) locMap[l.id] = l.name_ghl

    const leaderboard = sorted.slice(0, 10).map(([id, revenue], i) => ({
      rank: i + 1,
      name: locMap[id] ?? id,
      revenue,
      you: id === locationId,
    }))

    // Include this location even if outside top 10
    const myRankInBoard = leaderboard.find(l => l.you)
    if (!myRankInBoard) {
      leaderboard.push({ rank, name: (profile.locations as any)?.name_ghl ?? '', revenue: currentRevenue, you: true })
    }

    return NextResponse.json({
      _debug: { locationId, currentPeriod, currentPeriodEnd, wonCount: wonOpps.length, latestOppDate: latestOpp?.date },
      period: { current: currentPeriod, end: currentPeriodEnd },
      profile: { name: profile.full_name, location: (profile.locations as any)?.name_ghl },
      kpis: {
        revenue: currentRevenue,
        revenue_mom: revMoM,
        jobs_completed: jobsCompleted,
        jobs_mom: jobsMoM,
        avg_job_value: avgJobValue,
        network_rank: rank,
        total_locations: sorted.length,
        revenue_to_next_rank: revenueToNextRank,
      },
      trend,
      leaderboard,
      goals: [
        { label: 'Revenue',     current: currentRevenue,  target: monthlyRevenueTarget, color: '#0C85C2', hasTarget: !!gamePlan },
        { label: 'Jobs booked', current: jobsCompleted,   target: monthlyJobsTarget,    color: '#5AB3C9', hasTarget: !!gamePlan && monthlyJobsTarget > 0 },
        { label: 'New clients', current: newClientsCount, target: newClientsTarget,      color: '#7CCA5B', hasTarget: !!gamePlan },
        { label: 'Reviews YTD', current: reviewsYtd,      target: reviewsGoal,           color: '#FFB600', hasTarget: !!gamePlan },
      ],
      hasGamePlan: !!gamePlan,
    })
  } catch (err: any) {
    console.error('Zee dashboard error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
