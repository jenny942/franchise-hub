'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

interface Franchisee {
  id: string
  full_name: string
  email: string
  location_name: string
  status: string
  created_at: string
}

interface Location {
  id: string
  name_ghl: string
}

export default function AdminFranchiseesPage() {
  const router = useRouter()
  const [franchisees, setFranchisees]   = useState<Franchisee[]>([])
  const [locations, setLocations]       = useState<Location[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [session, setSession]           = useState<any>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteName, setInviteName]     = useState('')
  const [inviteLocation, setInviteLocation] = useState('')
  const [inviting, setInviting]         = useState(false)
  const [inviteMsg, setInviteMsg]       = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)

      // Verify corporate role
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role !== 'corporate') { router.push('/dashboard'); return }

      // Load franchisees
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, location_id, status, created_at')
        .eq('role', 'franchisee')
        .order('created_at', { ascending: false })

      const { data: locs } = await supabase.from('locations').select('id, name_ghl')
      setLocations(locs ?? [])

      const locMap: Record<string, string> = {}
      for (const l of locs ?? []) locMap[l.id] = l.name_ghl

      setFranchisees((profiles ?? []).map(p => ({
        id:            p.id,
        full_name:     p.full_name || '—',
        email:         p.email || '—',
        location_name: p.location_id ? (locMap[p.location_id] ?? p.location_id) : '—',
        status:        p.status || 'active',
        created_at:    p.created_at || '',
      })))
      setLoading(false)
    })
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !inviteName) { setInviteMsg({ type: 'error', text: 'Name and email are required.' }); return }
    setInviting(true); setInviteMsg(null)

    const res = await fetch('/api/admin/invite-franchisee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName, location_id: inviteLocation || null }),
    })
    const json = await res.json()
    setInviting(false)

    if (json.error) {
      setInviteMsg({ type: 'error', text: json.error })
    } else {
      setInviteMsg({ type: 'success', text: `Invite sent to ${inviteEmail}. They'll receive an email to set up their account.` })
      setInviteEmail(''); setInviteName(''); setInviteLocation('')
      // Refresh list
      setTimeout(() => {
        setShowModal(false); setInviteMsg(null)
        router.refresh()
      }, 2500)
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
  }

  const inputStyle: React.CSSProperties = { width: '100%', height: '42px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', boxSizing: 'border-box', background: '#fff' }
  const labelStyle: React.CSSProperties = { fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Franchisees</div>
            <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px' }}>Manage franchisee accounts and send invites.</div>
          </div>
          <button
            onClick={() => { setShowModal(true); setInviteMsg(null) }}
            style={{ height: '40px', padding: '0 20px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="white"><path d="M7 1v12M1 7h12" strokeWidth="2" stroke="white" strokeLinecap="round"/></svg>
            Invite Franchisee
          </button>
        </div>

        {/* Franchisee table */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 120px 120px', gap: '10px', padding: '10px 20px', borderBottom: '0.5px solid #E6F1F4' }}>
            {['Name', 'Email', 'Location', 'Status', 'Joined'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Loading…</div>
          ) : franchisees.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
              No franchisees yet. Use "Invite Franchisee" to add one.
            </div>
          ) : franchisees.map((f, i) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 120px 120px', gap: '10px', padding: '12px 20px', alignItems: 'center', borderTop: i > 0 ? '0.5px solid #E6F1F4' : 'none' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2C3E50' }}>{f.full_name}</div>
              <div style={{ fontSize: '13px', color: '#888' }}>{f.email}</div>
              <div style={{ fontSize: '13px', color: '#888' }}>{f.location_name}</div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: f.status === 'active' ? '#edfae5' : '#fff8e1', color: f.status === 'active' ? '#3B8C2A' : '#B87800' }}>
                  {f.status === 'active' ? 'Active' : 'Pending'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#aaa' }}>{fmtDate(f.created_at)}</div>
            </div>
          ))}
        </div>

        {/* Invite modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,62,80,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
            <div style={{ background: '#fff', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#2C3E50', marginBottom: '4px' }}>Invite a Franchisee</div>
              <div style={{ fontSize: '13px', color: '#888', marginBottom: '22px' }}>They'll get an email to set up their account and complete onboarding.</div>

              {inviteMsg && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', background: inviteMsg.type === 'success' ? '#edfae5' : '#fde8e8', color: inviteMsg.type === 'success' ? '#3B8C2A' : '#c0392b' }}>
                  {inviteMsg.text}
                </div>
              )}

              <form onSubmit={handleInvite}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Full name</label>
                  <input style={inputStyle} type="text" placeholder="Jane Smith" value={inviteName} onChange={e => setInviteName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Email address</label>
                  <input style={inputStyle} type="email" placeholder="jane@maidthis.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                </div>
                <div style={{ marginBottom: '22px' }}>
                  <label style={labelStyle}>Location assignment <span style={{ color: '#aaa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={inviteLocation} onChange={e => setInviteLocation(e.target.value)}>
                    <option value="">Select a location…</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name_ghl}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, height: '44px', background: '#E6F1F4', color: '#2C3E50', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={inviting} style={{ flex: 2, height: '44px', background: inviting ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: inviting ? 'not-allowed' : 'pointer' }}>
                    {inviting ? 'Sending…' : 'Send invite →'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
