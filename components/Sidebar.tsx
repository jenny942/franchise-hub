'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const nav = [
  {
    label: 'Dashboard', href: '/dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
  },
  {
    label: 'Goals & Tracking', href: '/goals',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h8v2H2z"/></svg>
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
    label: 'Marketing Tools', href: '/marketing',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v2H1zm2 4h10v2H3zm2 4h6v2H5z"/></svg>
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

      <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '20px 16px 8px' }}>
        Main Menu
      </div>

      {/* Nav items */}
      <div style={{ flex: 1 }}>
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
          }}>
            JD
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>Jamie D.</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Denver, CO</div>
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
