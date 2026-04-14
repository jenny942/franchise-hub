import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // Get the most recent period in the revenue table
    const { data: latestPeriod } = await supabaseAdmin
      .from('revenue')
      .select('period_start, period_end')
      .order('period_start', { ascending: false })
      .limit(1)
      .single()

    const currentPeriod = latestPeriod?.period_start
    const prevPeriod = new Date(currentPeriod)
    prevPeriod.setMonth(prevPeriod.getMonth() - 1)
    const prevPeriodStr = prevPeriod.toISOString().split('T')[0]

    // Current month revenue by location
    const { data: currentRevenue } = await supabaseAdmin
      .from('revenue')
      .select('location_id, source_type, amount, locations(name, name_ghl)')
      .eq('period_start', currentPeriod)

    // Previous month revenue by location
    const { data: prevRevenue } = await supabaseAdmin
      .from('revenue')
      .select('location_id, source_type, amount')
      .eq('period_start', prevPeriodStr)

    // Last 12 months of revenue for trend chart
    const { data: trendRevenue } = await supabaseAdmin
      .from('revenue')
      .select('period_start, amount')
      .order('period_start', { ascending: true })
      .limit(24) // 12 months × 2 source types

    // Current month opportunities (won deals) by location
    const { data: opportunities } = await supabaseAdmin
      .from('opportunities')
      .select('location_id, status, value, primary_source')
      .gte('date', currentPeriod)
      .lte('date', latestPeriod?.period_end)

    // ── Aggregate by location ─────────────────────────────────
    const locationMap: Record<string, {
      name: string
      name_ghl: string
      revenue: number
      prev_revenue: number
      won_count: number
      won_value: number
    }> = {}

    for (const row of currentRevenue ?? []) {
      const loc = row.locations as any
      const id = row.location_id
      if (!locationMap[id]) {
        locationMap[id] = { name: loc?.name ?? '', name_ghl: loc?.name_ghl ?? '', revenue: 0, prev_revenue: 0, won_count: 0, won_value: 0 }
      }
      locationMap[id].revenue += row.amount
    }

    for (const row of prevRevenue ?? []) {
      if (locationMap[row.location_id]) {
        locationMap[row.location_id].prev_revenue += row.amount
      }
    }

    for (const opp of opportunities ?? []) {
      if (opp.status === 'won' && locationMap[opp.location_id]) {
        locationMap[opp.location_id].won_count += 1
        locationMap[opp.location_id].won_value += opp.value
      }
    }

    // Sort by revenue descending for leaderboard
    const leaderboard = Object.entries(locationMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)

    // ── Network totals ────────────────────────────────────────
    const totalRevenue = leaderboard.reduce((sum, l) => sum + l.revenue, 0)
    const totalPrevRevenue = leaderboard.reduce((sum, l) => sum + l.prev_revenue, 0)
    const totalWon = leaderboard.reduce((sum, l) => sum + l.won_count, 0)
    const totalWonValue = leaderboard.reduce((sum, l) => sum + l.won_value, 0)
    const activeLocations = leaderboard.filter(l => l.revenue > 0).length
    const revenueMoM = totalPrevRevenue > 0
      ? ((totalRevenue - totalPrevRevenue) / totalPrevRevenue) * 100
      : 0

    // ── Revenue trend (last 12 months) ────────────────────────
    const trendMap: Record<string, number> = {}
    for (const row of trendRevenue ?? []) {
      const key = row.period_start.substring(0, 7) // "YYYY-MM"
      trendMap[key] = (trendMap[key] ?? 0) + row.amount
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }))

    // ── Lead source breakdown (current month) ────────────────
    const sourceMap: Record<string, number> = {}
    for (const opp of opportunities ?? []) {
      const src = opp.primary_source || 'Unknown'
      sourceMap[src] = (sourceMap[src] ?? 0) + 1
    }
    const sources = Object.entries(sourceMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([source, count]) => ({ source, count }))

    return NextResponse.json({
      period: { current: currentPeriod, end: latestPeriod?.period_end },
      kpis: {
        total_revenue: totalRevenue,
        revenue_mom: revenueMoM,
        active_locations: activeLocations,
        total_won: totalWon,
        total_won_value: totalWonValue,
      },
      leaderboard: leaderboard.slice(0, 10),
      trend,
      sources,
    })
  } catch (err: any) {
    console.error('Zor dashboard error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
