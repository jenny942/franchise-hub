'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ConfirmPage() {
  const router = useRouter()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [ready, setReady]         = useState(false)
  const [done, setDone]           = useState(false)

  useEffect(() => {
    // Supabase processes the invite token from the URL hash and fires SIGNED_IN
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setReady(true)
    })
    // Also check if already signed in (e.g. page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm)   { setError('Passwords do not match'); return }
    if (password.length < 8)    { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/onboarding'), 2000)
    }
  }

  const Logo = () => (
    <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
      <div style={{ width: '56px', height: '56px', background: '#5AB3C9', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
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
  )

  return (
    <div style={{ minHeight: '100vh', background: '#E6F1F4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: "'Open Sans', sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', padding: '2.5rem 2.5rem 2rem', border: '0.5px solid #A7DBE7' }}>
        <Logo />
        <hr style={{ border: 'none', borderTop: '0.5px solid #A7DBE7', margin: '0 0 1.5rem' }} />

        {done ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: '48px', height: '48px', background: '#edfae5', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5L18 6" stroke="#3B8C2A" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </div>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#2C3E50', margin: '0 0 0.5rem' }}>You're in!</p>
            <p style={{ fontSize: '13.5px', color: '#888' }}>Setting up your profile…</p>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', margin: '0 0 0.5rem' }}>Welcome to the Hub</p>
            <p style={{ fontSize: '13.5px', color: '#aaa' }}>Verifying your invite link…</p>
          </div>
        ) : (
          <>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', margin: '0 0 0.25rem' }}>Welcome to the Hub</p>
            <p style={{ fontSize: '13.5px', color: '#888', margin: '0 0 1.5rem' }}>Create a password to finish setting up your account.</p>

            <form onSubmit={handleSubmit}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" required
                style={{ width: '100%', height: '44px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '14.5px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', background: '#fff', boxSizing: 'border-box' as const, outline: 'none', marginBottom: '1rem' }}
              />
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Confirm password
              </label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Same password again" required
                style={{ width: '100%', height: '44px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '14.5px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', background: '#fff', boxSizing: 'border-box' as const, outline: 'none', marginBottom: '1rem' }}
              />
              {error && <p style={{ fontSize: '13px', color: '#e05252', marginBottom: '0.75rem' }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ width: '100%', height: '48px', background: loading ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Saving…' : 'Create password & continue →'}
              </button>
            </form>
          </>
        )}

        <div style={{ height: '4px', background: 'linear-gradient(90deg, #5AB3C9 0%, #0C85C2 50%, #FFB600 100%)', borderRadius: '0 0 20px 20px', margin: '1.5rem -2.5rem -2rem' }} />
      </div>
    </div>
  )
}
