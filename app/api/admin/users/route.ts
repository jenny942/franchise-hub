import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  // Verify the caller is a corporate user
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'corporate') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all profiles using service role (bypasses RLS)
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, location_id, mailing_city, mailing_state, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/users] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[admin/users] returning', profiles?.length ?? 0, 'profiles')
  return NextResponse.json({ profiles: profiles ?? [] })
}
