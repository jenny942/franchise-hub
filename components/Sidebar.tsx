'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
  { label: 'Goals & Tracking', href: '/goals', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 5v2h14V5L8 1zM2 8v5h3v-3h2v3h2v-3h2v3h3V8H2z"/></svg> },
  { label: 'Growth Plan', href: '/growth-plan', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 12L5 6l3 4 3-5 3 3"/></svg> },
  { label: 'Marketing Tools', href: '/marketing', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v2H1zm2 4h10v2H3zm2 4h6v2H5z"/></svg> },
  { label: 'Resources', href: '/resources', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 3v4l3 2-1 1.5L6 9V4h2z"/></svg> },
  { label: 'Network', href: '/network', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-1 2-1-2H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/></svg> },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      width: '220px', minWidth: '220px', background: '#2C3E50',
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
    }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img
          src="/MAID THIS - LOGO white.png"
          alt="MaidThis"
          style={{ width: '140px', height: 'auto' }}
        />
      </div>

      <div style={{ fontSize: '10px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '20px 16px 8px' }}>
        Main Menu
      </div>

      {navItems.map(item => {
        const active = pathname === item.href
        return (
          <div
            key={item.href}
            onClick={() => router.push(item.href)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 16px', fontSize: '13.5px', cursor: 'pointer',
              color: active ? '#5AB3C9' : 'rgba(255,255,255,0.65)',
              background: active ? 'rgba(90,179,201,0.18)' : 'transparent',
              fontWeight: active ? 600 : 400,
            }}
          >
            <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </div>
        )
      })}

      <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
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
