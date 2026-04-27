'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const nav = [
  {
    label: 'Dashboard', href: '/dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
  },
  {
    label: 'Blueprint', href: '/blueprint',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 13V5l5-4 5 4v8H9V9H7v4H2z"/></svg>,
    children: [
      { label: 'The Vision', href: '/blueprint/vision' },
      { label: 'The Game Plan', href: '/blueprint/game-plan' },
      { label: 'Summary', href: '/blueprint/summary' },
    ]
  },
  {
    label: 'Resources', href: '/resources',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 3v4l3 2-1 1.5L6 9V4h2z"/></svg>
  },
  {
    label: 'Settings', href: '/settings',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 1 1 0 6A3 3 0 0 1 8 1zm0 8c-3.3 0-6 1.3-6 3v1h12v-1c0-1.7-2.7-3-6-3z"/></svg>,
    children: [
      { label: 'Business Info', href: '/settings/business' },
      { label: 'Personal Info', href: '/settings/personal' },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<{ full_name?: string; mailing_city?: string; mailing_state?: string; avatar_url?: string; role?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('full_name, mailing_city, mailing_state, avatar_url, role').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) setUserProfile(p) })
    })
  }, [])

  // Track which parent items are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    nav.forEach(item => {
      if (item.children) {
        const anyActive = item.children.some(c => pathname.startsWith(c.href)) || pathname.startsWith(item.href)
        if (anyActive) init[item.href] = true
      }
    })
    return init
  })

  function toggleExpand(href: string) {
    setExpanded(prev => ({ ...prev, [href]: !prev[href] }))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      width: '220px', minWidth: '220px', background: '#2C3E50',
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: "'Open Sans', sans-serif",
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img src="/MAID THIS - LOGO white.png" alt="MaidThis" style={{ width: '140px', height: 'auto' }} />
      </div>

      {userProfile?.role !== 'corporate' && (
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '20px 16px 8px' }}>
          Main Menu
        </div>
      )}

      {/* Nav items */}
      <div style={{ flex: 1 }}>
        {/* Admin-only section for Zor users */}
        {userProfile?.role === 'corporate' && (
          <>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#FFB600', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '16px 16px 6px' }}>
              Admin
            </div>
            {[{ label: 'Franchisees', href: '/admin/franchisees', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 8A3 3 0 1 0 5 2a3 3 0 0 0 0 6zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-9 4c0-1.5 1.8-2.5 4-2.5 2.2 0 4 1 4 2.5v.5H2v-.5zm6.5-.3c.5-.4 1.3-.7 2.5-.7 1.8 0 3 .8 3 2v.5h-4.5A3.6 3.6 0 0 0 11.5 11.7z"/></svg> }].map(item => {
              const isActive = pathname.startsWith(item.href)
              return (
                <div key={item.href} onClick={() => router.push(item.href)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', fontSize: '13.5px', cursor: 'pointer', color: isActive ? '#FFB600' : 'rgba(255,255,255,0.65)', background: isActive ? 'rgba(255,182,0,0.12)' : 'transparent', fontWeight: isActive ? 600 : 400 }}>
                  <span style={{ opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                  {item.label}
                </div>
              )
            })}
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '16px 16px 6px' }}>
              Main Menu
            </div>
          </>
        )}
        {nav.map(item => {
          const isActive = pathname === item.href || (item.children ? item.children.some(c => pathname === c.href) : false)
          const isExpanded = expanded[item.href]

          return (
            <div key={item.href}>
              <div
                onClick={() => {
                  if (item.children) {
                    toggleExpand(item.href)
                  } else {
                    router.push(item.href)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px', fontSize: '13.5px', cursor: 'pointer',
                  color: isActive ? '#5AB3C9' : 'rgba(255,255,255,0.65)',
                  background: isActive && !item.children ? 'rgba(90,179,201,0.18)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 0.15s',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </div>
                {item.children && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="rgba(255,255,255,0.4)"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <path d="M2 3l3 4 3-4"/>
                  </svg>
                )}
              </div>

              {/* Sub-items */}
              {item.children && isExpanded && item.children.map(child => {
                const childActive = pathname === child.href
                return (
                  <div
                    key={child.href}
                    onClick={() => router.push(child.href)}
                    style={{
                      padding: '7px 16px 7px 42px', fontSize: '12.5px', cursor: 'pointer',
                      color: childActive ? '#5AB3C9' : 'rgba(255,255,255,0.45)',
                      fontWeight: childActive ? 600 : 400,
                      transition: 'color 0.15s',
                    }}
                  >
                    ▸ {child.label}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* User footer */}
      <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          onClick={() => router.push('/settings')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer' }}
        >
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%', background: '#5AB3C9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, color: '#2C3E50', flexShrink: 0,
            overflow: 'hidden',
          }}>
            {userProfile?.avatar_url
              ? <img src={userProfile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (userProfile?.full_name
                  ? userProfile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                  : '?')}
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{userProfile?.full_name || 'My Account'}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
              {userProfile?.mailing_city && userProfile?.mailing_state
                ? `${userProfile.mailing_city}, ${userProfile.mailing_state}`
                : 'Settings'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            width: '100%', padding: '7px', background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
            fontFamily: "'Open Sans', sans-serif",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
