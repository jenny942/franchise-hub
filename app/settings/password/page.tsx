'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

export default function PasswordSettingsPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving]                   = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setEmail(data.user.email ?? '')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    if (newPassword.length < 8) {
      setMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }

    setSaving(true)

    // Re-authenticate with current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })

    if (signInError) {
      setSaving(false)
      setMsg({ type: 'error', text: 'Current password is incorrect.' })
      return
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updateError) {
      setMsg({ type: 'error', text: updateError.message })
    } else {
      setMsg({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: '44px', border: '1.5px solid #A7DBE7', borderRadius: '10px',
    padding: '0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif",
    color: '#2C3E50', outline: 'none', boxSizing: 'border-box', background: '#fff',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px',
    textTransform: 'uppercase', display: 'block', marginBottom: '6px',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        <button onClick={() => router.push('/settings')} style={{ background: 'none', border: 'none', color: '#5AB3C9', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ← Settings
        </button>

        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Password</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '28px' }}>
          Update your account password.
        </div>

        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '28px', maxWidth: '480px' }}>
          {msg && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', background: msg.type === 'success' ? '#edfae5' : '#fde8e8', color: msg.type === 'success' ? '#3B8C2A' : '#c0392b' }}>
              {msg.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Current password</label>
              <input
                style={inputStyle} type="password" value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password"
              />
            </div>

            <div style={{ height: '0.5px', background: '#E6F1F4', margin: '20px 0' }} />

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>New password</label>
              <input
                style={inputStyle} type="password" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm new password</label>
              <input
                style={inputStyle} type="password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password"
              />
            </div>

            <button
              type="submit" disabled={saving}
              style={{ width: '100%', height: '44px', background: saving ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Updating…' : 'Update password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
