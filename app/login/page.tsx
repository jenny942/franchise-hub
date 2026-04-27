'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const uid = authData.user?.id
    if (!uid) { router.push('/dashboard'); return }

    // Check role and onboarding status to route correctly
    const [{ data: profile }, { data: bizProfile }, { data: vision }] = await Promise.all([
      supabase.from('profiles').select('role, full_name, mailing_street, mailing_city, mailing_state, mailing_zip').eq('id', uid).single(),
      supabase.from('business_profiles').select('territory').eq('profile_id', uid).single(),
      supabase.from('vision').select('id').eq('user_id', uid).single(),
    ])

    if (profile?.role === 'corporate') { router.push('/dashboard'); return }

    const personalDone = profile?.full_name && profile?.mailing_street && profile?.mailing_city && profile?.mailing_state && profile?.mailing_zip
    const businessDone = bizProfile?.territory

    if (!personalDone || !businessDone) { router.push('/onboarding'); return }
    if (!vision) { router.push('/blueprint/vision'); return }
    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E6F1F4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: "'Open Sans', sans-serif",
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '440px',
        padding: '2.5rem 2.5rem 2rem',
        border: '0.5px solid #A7DBE7',
      }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '56px', height: '56px', background: '#5AB3C9',
            borderRadius: '14px', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem',
          }}>
            <svg viewBox="0 0 32 32" fill="none" width="32" height="32">
              <path d="M16 4L4 13h3v11h7v-7h4v7h7V13h3L16 4z" fill="white" />
              <circle cx="22" cy="7" r="2.5" fill="#FFB600" />
            </svg>
          </div>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50', margin: 0 }}>
            Maid<span style={{ color: '#0C85C2' }}>This</span>
          </p>
          <p style={{ fontSize: '13px', color: '#5AB3C9', margin: '4px 0 0', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Franchise Hub
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '0.5px solid #A7DBE7', margin: '0 0 1.5rem' }} />

        <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', margin: '0 0 0.25rem' }}>
          Welcome back
        </p>
        <p style={{ fontSize: '13.5px', color: '#888', margin: '0 0 1.5rem' }}>
          Sign in to your franchisee dashboard
        </p>

        <form onSubmit={handleLogin}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
            Email address
          </label>
          <input
            type="email"
            placeholder="you@maidthis.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              width: '100%', height: '44px', border: '1.5px solid #A7DBE7',
              borderRadius: '10px', padding: '0 14px', fontSize: '14.5px',
              fontFamily: "'Open Sans', sans-serif", color: '#2C3E50',
              background: '#fff', boxSizing: 'border-box', outline: 'none', marginBottom: '1rem',
            }}
          />

          <label style={{ fontSize: '12px', fontWeight: 600, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%', height: '44px', border: '1.5px solid #A7DBE7',
              borderRadius: '10px', padding: '0 14px', fontSize: '14.5px',
              fontFamily: "'Open Sans', sans-serif", color: '#2C3E50',
              background: '#fff', boxSizing: 'border-box', outline: 'none', marginBottom: '0.5rem',
            }}
          />

          <a href="#" style={{ fontSize: '12.5px', color: '#0C85C2', textDecoration: 'none', display: 'block', textAlign: 'right', marginBottom: '1rem' }}>
            Forgot password?
          </a>

          {error && (
            <p style={{ fontSize: '13px', color: '#e05252', marginBottom: '0.75rem' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: '48px', background: loading ? '#5AB3C9' : '#0C85C2',
              color: '#fff', border: 'none', borderRadius: '10px',
              fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '15px',
              letterSpacing: '0.5px', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <hr style={{ border: 'none', borderTop: '0.5px solid #E6F1F4', margin: '1.5rem 0 1rem' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#7CCA5B', background: '#eafbdf', borderRadius: '20px', padding: '4px 10px' }}>
            Franchisee Portal
          </span>
          <span style={{ fontSize: '12px', color: '#aaa' }}>
            Need help? <a href="#" style={{ color: '#0C85C2', textDecoration: 'none' }}>Contact support</a>
          </span>
        </div>

        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, #5AB3C9 0%, #0C85C2 50%, #FFB600 100%)',
          borderRadius: '0 0 20px 20px',
          margin: '1.25rem -2.5rem -2rem',
        }} />
      </div>
    </div>
  )
}
