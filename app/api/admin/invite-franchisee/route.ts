import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify requesting user is corporate
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'corporate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, full_name, location_id } = await request.json()
    if (!email || !full_name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://franchise-hub.vercel.app'

    // Create the user + send invite email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/confirm`,
      data: { full_name, role: 'franchisee', location_id: location_id || null },
    })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 })
    }

    const newUserId = inviteData.user.id

    // Pre-create the profile record so it's ready when they land on onboarding
    await supabaseAdmin.from('profiles').upsert({
      id:          newUserId,
      email:       email,
      full_name:   full_name,
      role:        'franchisee',
      location_id: location_id || null,
    }, { onConflict: 'id' })

    return NextResponse.json({ success: true, user_id: newUserId })
  } catch (err: any) {
    console.error('Invite error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
