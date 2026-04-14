'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => setProfile(p))
    })
  }, [])

  const initials = profile?.full_name
    ? profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const fields = [
    profile?.full_name, profile?.email, profile?.mailing_street,
    profile?.mailing_city, profile?.tshirt_size, profile?.hobby,
  ]
  const filled = fields.filter(Boolean).length
  const completePct = Math.round((filled / fields.length) * 100)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Settings</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Settings</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '28px' }}>
          Manage your business profile, personal details, and account preferences.
        </div>

        {/* Profile preview */}
        <div style={{ background: '#fff', border: '0.5px solid #A7DBE7', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '28px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#0C85C2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#fff', flexShrink: 0 }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : initials}
          </div>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '16px', color: '#2C3E50' }}>
              {profile?.full_name || 'Your Name'}
            </div>
            <div style={{ fontSize: '12.5px', color: '#888', marginTop: '2px' }}>
              {profile?.email || '—'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#0C85C2' }}>{completePct}%</div>
            <div style={{ fontSize: '11.5px', color: '#aaa' }}>Profile complete</div>
            <div style={{ width: '120px', height: '6px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden', marginTop: '4px', marginLeft: 'auto' }}>
              <div style={{ width: `${completePct}%`, height: '100%', background: '#0C85C2', borderRadius: '20px' }} />
            </div>
          </div>
        </div>

        {/* Business tile */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Business</div>
        <div style={{ height: '0.5px', background: '#A7DBE7', marginBottom: '20px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '32px' }}>
          <div
            onClick={() => router.push('/settings/business')}
            style={{ background: '#fff', border: '0.5px solid #A7DBE7', borderRadius: '16px', padding: '24px', cursor: 'pointer' }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e6f4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#0C85C2" strokeWidth="1.6"><rect x="2" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a4 4 0 0 1 8 0v2"/></svg>
            </div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50', marginBottom: '4px' }}>Business info</div>
            <div style={{ fontSize: '12.5px', color: '#888', lineHeight: 1.5, marginBottom: '14px' }}>
              Your territory, DBA, open date, service area zip codes, business listing details, and website.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {['Territory', 'DBA', 'Open date', 'Zip codes', 'GBP address', 'Website', 'GBP link'].map(f => (
                <span key={f} style={{ fontSize: '11px', background: '#E6F1F4', color: '#5AB3C9', fontWeight: 600, padding: '3px 9px', borderRadius: '20px' }}>{f}</span>
              ))}
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0C85C2' }}>Edit business info ↗</div>
          </div>
        </div>

        {/* Personal tile */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Personal</div>
        <div style={{ height: '0.5px', background: '#A7DBE7', marginBottom: '20px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div
            onClick={() => router.push('/settings/personal')}
            style={{ background: '#fff', border: '0.5px solid #A7DBE7', borderRadius: '16px', padding: '24px', cursor: 'pointer' }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#edfae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#3B8C2A" strokeWidth="1.6"><circle cx="11" cy="7" r="4"/><path d="M3 19c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50', marginBottom: '4px' }}>Personal info</div>
            <div style={{ fontSize: '12.5px', color: '#888', lineHeight: 1.5, marginBottom: '14px' }}>
              Your display name, contact details, mailing address, profile photo, and gift preferences.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {['Display name', 'Email', 'Mailing address', 'Profile photo', 'Gift profile'].map(f => (
                <span key={f} style={{ fontSize: '11px', background: '#E6F1F4', color: '#5AB3C9', fontWeight: 600, padding: '3px 9px', borderRadius: '20px' }}>{f}</span>
              ))}
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#3B8C2A' }}>Edit personal info ↗</div>
          </div>
        </div>
      </div>
    </div>
  )
}
