'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const GIFT_FIELDS = [
  { id: 'tshirt_size', label: 'T-shirt size', type: 'select', options: ['Small (S)', 'Medium (M)', 'Large (L)', 'XL', '2XL', '3XL'] },
  { id: 'fav_coffee', label: 'Favorite coffee', placeholder: 'e.g. Oat milk latte, black coffee…' },
  { id: 'fav_fast_food', label: 'Favorite fast food', placeholder: 'e.g. Chick-fil-A, Chipotle…' },
  { id: 'fav_treat', label: 'Favorite treat / snack', placeholder: 'e.g. Sour Patch Kids, dark chocolate…' },
  { id: 'shoe_size', label: 'Shoe size', placeholder: "e.g. Men's 10, Women's 8…" },
  { id: 'sports_team', label: 'Favorite sports team', placeholder: 'e.g. OKC Thunder, Chiefs…' },
  { id: 'hobby', label: 'Hobby or interest', placeholder: 'e.g. Running, woodworking, cooking…', full: true },
]

export default function PersonalSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState('Changes saved automatically')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserId(data.user.id)
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) setForm(p) })
    })
  }, [])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave({ ...form, [field]: value }), 1000)
  }

  async function autoSave(data: Record<string, string>) {
    if (!userId) return
    await supabase.from('profiles').update(data).eq('id', userId)
    setSaveMsg('Saved just now')
  }

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', userId)
    setSaving(false)
    setSaveMsg('Saved just now')
  }

  const initials = form.full_name
    ? form.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const inputStyle = { width: '100%', height: '42px', border: '1.5px solid #A7DBE7', borderRadius: '10px', padding: '0 14px', fontSize: '14px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: '11.5px', fontWeight: 700, color: '#2C3E50', letterSpacing: '0.5px', textTransform: 'uppercase' as const, display: 'block', marginBottom: '6px' }
  const hintStyle = { fontSize: '12px', color: '#aaa', marginBottom: '8px', display: 'block', lineHeight: 1.5 }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#0C85C2', cursor: 'pointer' }} onClick={() => router.push('/settings')}>Settings</span>
          <span style={{ color: '#ccc' }}>›</span>
          <span>Personal Info</span>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Personal info</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '22px' }}>
          Your profile, contact details, and a few things that help us celebrate you as part of the MaidThis family.
        </div>

        {/* Save bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '12px 20px', marginBottom: '18px' }}>
          <div style={{ fontSize: '13px', color: '#7CCA5B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#7CCA5B" strokeWidth="2"/></svg>
            {saveMsg}
          </div>
          <button onClick={handleSave} disabled={saving} style={{ height: '38px', padding: '0 22px', background: saving ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {/* Section 1: Profile */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Profile</div>
          </div>
          <div style={{ ...hintStyle, paddingLeft: '38px', marginBottom: '18px' }}>How you appear across the Franchise Hub — on the leaderboard, in reports, and to your support team.</div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '18px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#0C85C2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
              {form.avatar_url ? <img src={form.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div>
              <button style={{ height: '38px', padding: '0 18px', background: '#E6F1F4', color: '#2C3E50', border: '1.5px solid #A7DBE7', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                Upload photo
              </button>
              <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>JPG or PNG, max 5MB. Square crops look best.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Display name</label>
              <span style={hintStyle}>How your name appears on leaderboards and reports</span>
              <input style={inputStyle} type="text" value={form.full_name || ''} onChange={e => update('full_name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Company email</label>
              <span style={hintStyle}>Your primary email for Hub notifications and support</span>
              <input style={inputStyle} type="email" value={form.email || ''} onChange={e => update('email', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Section 2: Mailing Address */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Mailing address</div>
          </div>
          <div style={{ ...hintStyle, paddingLeft: '38px', marginBottom: '18px' }}>Where we send physical mail, recognition awards, and gifts. Keep this current.</div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Street address</label>
            <input style={inputStyle} type="text" value={form.mailing_street || ''} onChange={e => update('mailing_street', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} type="text" value={form.mailing_city || ''} onChange={e => update('mailing_city', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input style={inputStyle} type="text" value={form.mailing_state || ''} onChange={e => update('mailing_state', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Zip code</label>
              <input style={inputStyle} type="text" value={form.mailing_zip || ''} onChange={e => update('mailing_zip', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Section 3: Gift Profile */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1.5px solid #FFB600', padding: '22px 24px', marginBottom: '18px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '160px', height: '160px', background: 'radial-gradient(circle at top right, rgba(255,182,0,0.06), transparent 70%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fff8e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#FFB600" strokeWidth="1.6"><rect x="2" y="8" width="16" height="11" rx="2"/><path d="M10 8V19M2 12h16M10 8c0 0-2-4 0-6s4 2 0 6M10 8c0 0 2-4 0-6S6 4 10 8"/></svg>
            </div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Gift profile</div>
          </div>
          <div style={{ fontSize: '12.5px', color: '#aaa', marginBottom: '20px', paddingLeft: '48px', lineHeight: 1.5 }}>
            We love sending surprises to our owners. Fill this out and you might just find something special at your door.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {GIFT_FIELDS.map(f => (
              <div key={f.id} style={f.full ? { gridColumn: '1 / -1' } : {}}>
                <label style={labelStyle}>{f.label}</label>
                {f.type === 'select' ? (
                  <select style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }} value={form[f.id] || ''} onChange={e => update(f.id, e.target.value)}>
                    <option value="">Select size…</option>
                    {f.options?.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input style={inputStyle} type="text" placeholder={f.placeholder} value={form[f.id] || ''} onChange={e => update(f.id, e.target.value)} />
                )}
                {f.full && <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10.5px', fontWeight: 700, background: '#fff8e1', color: '#B87800', padding: '2px 8px', borderRadius: '20px' }}>Helps us find the perfect gift</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom save bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '14px', border: '0.5px solid #A7DBE7', padding: '12px 20px' }}>
          <div style={{ fontSize: '13px', color: '#7CCA5B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#7CCA5B" strokeWidth="2"/></svg>
            {saveMsg}
          </div>
          <button onClick={handleSave} disabled={saving} style={{ height: '38px', padding: '0 22px', background: saving ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

      </div>
    </div>
  )
}
