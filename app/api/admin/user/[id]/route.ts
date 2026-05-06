import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: requestor } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
    if (requestor?.role !== 'corporate') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: targetId } = await params

    // Fetch all profile data
    const [
      { data: profile },
      { data: bizProfile },
      { data: vision },
      { data: gameplan },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*, locations(id, name_ghl)').eq('id', targetId).single(),
      supabaseAdmin.from('business_profiles').select('*').eq('profile_id', targetId).single(),
      supabaseAdmin.from('vision').select('*').eq('user_id', targetId).single(),
      supabaseAdmin.from('gameplans').select('*').eq('user_id', targetId).eq('is_active', true).single(),
    ])

    // Performance stats (revenue + jobs for their location)
    let stats = { revenue_this_month: 0, revenue_prev_month: 0, jobs_this_month: 0, network_rank: 0 }

    if (profile?.location_id) {
      const locationId = profile.location_id
      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth() + 1
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1

      const pad = (n: number) => String(n).padStart(2, '0')
      const curStart  = `${y}-${pad(m)}-01`
      const curEnd    = `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`
      const prevStart = `${py}-${pad(pm)}-01`
      const prevEnd   = `${py}-${pad(pm)}-${new Date(py, pm, 0).getDate()}`

      const [{ data: curRev }, { data: prevRev }, { data: curOpps }, { data: allRev }] = await Promise.all([
        supabaseAdmin.from('revenue').select('amount').eq('location_id', locationId).gte('period_start', curStart).lte('period_start', curEnd),
        supabaseAdmin.from('revenue').select('amount').eq('location_id', locationId).gte('period_start', prevStart).lte('period_start', prevEnd),
        supabaseAdmin.from('opportunities').select('status').eq('location_id', locationId).eq('status', 'won').gte('date', curStart).lte('date', curEnd),
        supabaseAdmin.from('revenue').select('location_id, amount').gte('period_start', prevStart).lte('period_start', prevEnd),
      ])

      const revThis  = (curRev  ?? []).reduce((s, r) => s + (r.amount || 0), 0)
      const revPrev  = (prevRev ?? []).reduce((s, r) => s + (r.amount || 0), 0)

      // Network rank from prev month
      const totals: Record<string, number> = {}
      for (const r of allRev ?? []) totals[r.location_id] = (totals[r.location_id] ?? 0) + (r.amount || 0)
      const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a)
      const rank = sorted.findIndex(([id]) => id === locationId) + 1

      stats = {
        revenue_this_month:  revThis,
        revenue_prev_month:  revPrev,
        jobs_this_month:     (curOpps ?? []).length,
        network_rank:        rank || 0,
      }
    }

    // Revenue trend (last 6 months) for mini chart
    let trend: { month: string; amount: number }[] = []
    if (profile?.location_id) {
      const sixAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().split('T')[0]
      const { data: trendData } = await supabaseAdmin.from('revenue').select('period_start, amount')
        .eq('location_id', profile.location_id).gte('period_start', sixAgo).order('period_start', { ascending: true })
      const map: Record<string, number> = {}
      for (const r of trendData ?? []) {
        const k = r.period_start.substring(0, 7)
        map[k] = (map[k] ?? 0) + (r.amount || 0)
      }
      trend = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }))
    }

    return NextResponse.json({
      profile: {
        ...profile,
        location_name: (profile?.locations as any)?.name_ghl ?? null,
      },
      biz_profile:  bizProfile  ?? null,
      vision:       vision      ?? null,
      gameplan:     gameplan    ?? null,
      stats,
      trend,
    })
  } catch (err: any) {
    console.error('Admin user detail error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
