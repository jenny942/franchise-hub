import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the requesting user is corporate via their auth token
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await serviceSupabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await serviceSupabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'corporate') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_ids, month_from, month_to } = await req.json() as {
    user_ids?: string[]
    month_from: string
    month_to: string
  }

  // Get franchisee profiles (all or selected subset)
  let profilesQuery = serviceSupabase
    .from('profiles')
    .select('id, full_name, mailing_city, mailing_state')
    .eq('role', 'franchisee')
  if (user_ids?.length) profilesQuery = profilesQuery.in('id', user_ids)
  const { data: profiles } = await profilesQuery

  const targetIds = profiles?.map((p: any) => p.id) ?? []
  if (targetIds.length === 0) {
    return NextResponse.json({ profiles: [], actuals: [], gameplans: [] })
  }

  // Tracker actuals for the date range
  const { data: actuals } = await serviceSupabase
    .from('tracker_actuals')
    .select('user_id, month_key, data')
    .in('user_id', targetIds)
    .gte('month_key', month_from)
    .lte('month_key', month_to)
    .order('month_key')

  // Active game plans for channel name definitions
  const { data: gameplans } = await serviceSupabase
    .from('gameplans')
    .select('user_id, channels, annual_goal, avg_ticket, seasonality, use_seasonality, plan_start, plan_horizon, month_data')
    .in('user_id', targetIds)
    .eq('is_active', true)

  return NextResponse.json({
    profiles: profiles ?? [],
    actuals: actuals ?? [],
    gameplans: gameplans ?? [],
  })
}
