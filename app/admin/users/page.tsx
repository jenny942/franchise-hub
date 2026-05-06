'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  full_name: string
  email: string
  role: string
  location_name: string
  status: string
  created_at: string
}

interface Location { id: string; name_ghl: string }

function RoleBadge({ role }: { role: string }) {
  const isZor = role === 'corporate'
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: isZor ? '#fff8e1' : '#e6f4fb', color: isZor ? '#B87800' : '#0C85C2' }}>
      {isZor ? 'Zor' : 'Zee'}
    </span>
  )
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers]         = useState<User[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading]     = useState(true)
  const [session, setSession]     = useState<any>(null)
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'corporate' | 'franchisee'>('all')
  const [showModal, setShowModal] = useState(false)

  // Invite form
  const [inviteName, setInviteName]         = useState('')
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteRole, setInviteRole]         = useState<'franchisee' | 'corporate'>('franchisee')
  const [inviteLocation, setInviteLocation] = useState('')
  const [inviting, setInviting]             = useState(false)
  const [inviteMsg, setInviteMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role !== 'corporate') { router.push('/dashboard'); return }

      const { data: locs } = await supabase.from('locations').select('id, name_ghl').order('name_ghl')
      setLocations(locs ?? [])

      await loadUsers(locs ?? [])
      setLoading(false)
    })
  }, [])

  async function loadUsers(locs?: Location[]) {
    const locList = locs ?? locations
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const json = await res.json()
    console.log('[loadUsers] status:', res.status, 'response:', json)
    const profiles = json.profiles ?? []

    const locMap: Record<string, string> = {}
    for (const l of locList) locMap[l.id] = l.name_ghl

    setUsers(profiles.map((p: any) => ({
      id:            p.id,
      full_name:     p.full_name || '—',
      email:         p.email    || '—',
      role:          p.role     || 'franchisee',
      location_name: p.location_id ? (locMap[p.location_id] ?? '—') : '—',
      status:        'active',
      created_at:    p.created_at || '',
    })))
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !inviteName) { setInviteMsg({ type: 'error', text: 'Name and email are required.' }); return }
    setInviting(true); setInviteMsg(null)

    const res = await fetch('/api/admin/invite-franchisee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName, location_id: inviteLocation || null, role: inviteRole }),
    })
    const json = await res.json()
    setInviting(false)

    if (json.error) {
      setInviteMsg({ type: 'error', text: json.error })
    } else {
      setInviteMsg({ type: 'success', text: `Invite sent to ${inviteEmail}.` })
      setInviteName(''); setInviteEmail(''); setInviteLocation(''); setInviteRole('franchisee')
      setTimeout(async () => { setShowModal(false); setInviteMsg(null); await loadUsers() }, 2000)
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
  }

  const filtered = users.filter(u => {
    const matchRole   = roleFilter === 'all' || u.role === roleFilter
    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const inputStyle: React.CSSProperties = { width: '100%', height: '42px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', boxSizing: 'border-box', background: '#fff' }
  const labelStyle: React.CSSProperties = { fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Users</div>
            <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px' }}>Manage all Zor and Zee accounts.</div>
          </div>
          <button
            onClick={() => { setShowModal(true); setInviteMsg(null) }}
            style={{ height: '40px', padding: '0 20px', background: '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            + Add User
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input
            type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ height: '38px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '13px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', width: '260px', background: '#fff' }}
          />
          {(['all', 'franchisee', 'corporate'] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} style={{ height: '38px', padding: '0 16px', borderRadius: '10px', border: '1.5px solid', borderColor: roleFilter === r ? '#0C85C2' : '#A7DBE7', background: roleFilter === r ? '#0C85C2' : '#fff', color: roleFilter === r ? '#fff' : '#888', fontFamily: "'Open Sans', sans-serif", fontSize: '13px', cursor: 'pointer', fontWeight: roleFilter === r ? 600 : 400 }}>
              {r === 'all' ? 'All' : r === 'franchisee' ? 'Zee' : 'Zor'}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#aaa', display: 'flex', alignItems: 'center' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 2fr 100px 120px', gap: '10px', padding: '10px 20px', borderBottom: '0.5px solid #E6F1F4' }}>
            {['Name', 'Email', 'Role', 'Location', 'Status', 'Joined'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#5AB3C9', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No users found.</div>
          ) : filtered.map((u, i) => (
            <div
              key={u.id}
              onClick={() => router.push(`/admin/users/${u.id}`)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 2fr 100px 120px', gap: '10px', padding: '12px 20px', alignItems: 'center', borderTop: i > 0 ? '0.5px solid #E6F1F4' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fcfd')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2C3E50' }}>{u.full_name}</div>
              <div style={{ fontSize: '13px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
              <div><RoleBadge role={u.role} /></div>
              <div style={{ fontSize: '13px', color: '#888' }}>{u.location_name}</div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: u.status === 'active' ? '#edfae5' : '#fff8e1', color: u.status === 'active' ? '#3B8C2A' : '#B87800' }}>
                  {u.status === 'active' ? 'Active' : 'Pending'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#aaa' }}>{fmtDate(u.created_at)}</div>
            </div>
          ))}
        </div>

        {/* Invite modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,62,80,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
            <div style={{ background: '#fff', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '18px', color: '#2C3E50', marginBottom: '4px' }}>Add User</div>
              <div style={{ fontSize: '13px', color: '#888', marginBottom: '22px' }}>They'll receive an invite email to set up their account.</div>

              {inviteMsg && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', background: inviteMsg.type === 'success' ? '#edfae5' : '#fde8e8', color: inviteMsg.type === 'success' ? '#3B8C2A' : '#c0392b' }}>
                  {inviteMsg.text}
                </div>
              )}

              <form onSubmit={handleInvite}>
                {/* Role toggle */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Role</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {([['franchisee', 'Zee (Franchisee)'], ['corporate', 'Zor (Franchisor)']] as const).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setInviteRole(val)}
                        style={{ flex: 1, height: '40px', borderRadius: '10px', border: '1.5px solid', borderColor: inviteRole === val ? '#0C85C2' : '#A7DBE7', background: inviteRole === val ? '#e6f4fb' : '#fff', color: inviteRole === val ? '#0C85C2' : '#888', fontFamily: "'Open Sans', sans-serif", fontSize: '13px', fontWeight: inviteRole === val ? 700 : 400, cursor: 'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Full name</label>
                  <input style={inputStyle} type="text" placeholder="Jane Smith" value={inviteName} onChange={e => setInviteName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Email address</label>
                  <input style={inputStyle} type="email" placeholder="jane@maidthis.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                </div>
                {inviteRole === 'franchisee' && (
                  <div style={{ marginBottom: '22px' }}>
                    <label style={labelStyle}>Location <span style={{ color: '#aaa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={inviteLocation} onChange={e => setInviteLocation(e.target.value)}>
                      <option value="">Select a location…</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name_ghl}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: inviteRole === 'corporate' ? '22px' : '0' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, height: '44px', background: '#E6F1F4', color: '#2C3E50', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
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
