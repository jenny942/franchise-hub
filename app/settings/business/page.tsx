'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

export default function BusinessSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [bizId, setBizId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>({ zip_codes: [], status: 'active' })
  const [zipInput, setZipInput] = useState('')
  const [saveMsg, setSaveMsg] = useState('Changes saved automatically')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      const uid = data.user.id
      setUserId(uid)
      // Zors don't have business profiles — redirect them away
      supabase.from('profiles').select('role').eq('id', uid).single()
        .then(({ data: p }) => { if (p?.role === 'corporate') router.push('/settings') })
      supabase.from('business_profiles').select('*').eq('profile_id', uid).single()
        .then(({ data: b }) => {
          if (b) { setBizId(b.id); setForm({ ...b, zip_codes: b.zip_codes || [] }) }
        })
    })
  }, [])

  function update(field: string, value: any) {
    const next = { ...form, [field]: value }
    setForm(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(next), 1000)
  }

  async function autoSave(data: Record<string, any>) {
    if (!userId) return
    if (bizId) {
      const { error } = await supabase.from('business_profiles').update(data).eq('id', bizId)
      setSaveMsg(error ? 'Save failed: ' + error.message : 'Saved just now')
    } else {
      const { data: created, error } = await supabase.from('business_profiles').insert({ ...data, profile_id: userId }).select().single()
      if (created) setBizId(created.id)
      setSaveMsg(error ? 'Save failed: ' + error.message : 'Saved just now')
    }
  }

  async function handleSave() {
    setSaving(true)
    await autoSave(form)
    setSaving(false)
  }

  function addZip(val: string) {
    const clean = val.replace(',', '').trim()
    if (clean.length === 5 && /^\d+$/.test(clean) && !form.zip_codes.includes(clean)) {
      update('zip_codes', [...form.zip_codes, clean])
    }
    setZipInput('')
  }

  function removeZip(zip: string) {
    update('zip_codes', form.zip_codes.filter((z: string) => z !== zip))
  }

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
          <span>Business Info</span>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '24px', color: '#2C3E50' }}>Business info</div>
        <div style={{ fontSize: '13.5px', color: '#888', marginTop: '4px', marginBottom: '22px' }}>
          Your territory details, business identity, and online presence. Used across your Blueprint, marketing tools, and reporting.
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

        {/* Section 1: Territory & Identity */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Territory & identity</div>
          </div>
          <div style={{ ...hintStyle, paddingLeft: '38px', marginBottom: '18px' }}>Your official franchise territory and business name as registered.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Territory name</label>
              <span style={hintStyle}>Your assigned territory (e.g. Tulsa, OK)</span>
              <input style={inputStyle} type="text" value={form.territory || ''} onChange={e => update('territory', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>DBA (Doing Business As)</label>
              <span style={hintStyle}>The name your business operates under locally</span>
              <input style={inputStyle} type="text" value={form.dba || ''} onChange={e => update('dba', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Franchise open date</label>
              <span style={hintStyle}>The date you officially opened for business</span>
              <input style={inputStyle} type="date" value={form.open_date || ''} onChange={e => update('open_date', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Franchise status</label>
              <span style={hintStyle}>Current standing with MaidThis corporate</span>
              <div style={{ paddingTop: '10px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: form.status === 'active' ? '#edfae5' : '#fff8e1', color: form.status === 'active' ? '#3B8C2A' : '#B87800' }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill={form.status === 'active' ? '#3B8C2A' : '#B87800'}><circle cx="4" cy="4" r="4"/></svg>
                  {form.status === 'active' ? 'Active' : 'Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Service Area Zip Codes */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Service area zip codes</div>
          </div>
          <div style={{ ...hintStyle, paddingLeft: '38px', marginBottom: '18px' }}>The zip codes that make up your territory. Used for lead routing and territory mapping.</div>

          <label style={labelStyle}>Zip codes</label>
          <span style={hintStyle}>Type a zip code and press Enter or comma to add it.</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', padding: '10px 12px', border: '1.5px solid #A7DBE7', borderRadius: '10px', minHeight: '48px', background: '#fff', cursor: 'text' }}>
            {form.zip_codes.map((zip: string) => (
              <span key={zip} style={{ background: '#e6f4fb', color: '#0C85C2', fontSize: '12.5px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {zip}
                <button onClick={() => removeZip(zip)} style={{ background: 'none', border: 'none', color: '#5AB3C9', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
            <input
              type="text" maxLength={5} placeholder="Add zip…" value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addZip(zipInput) } }}
              style={{ border: 'none', outline: 'none', fontSize: '13.5px', fontFamily: "'Open Sans', sans-serif", color: '#2C3E50', minWidth: '80px', flex: 1, background: 'transparent' }}
            />
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#aaa' }}>{form.zip_codes.length} zip code{form.zip_codes.length !== 1 ? 's' : ''} added</div>
        </div>

        {/* Section 3: Business Listing */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #A7DBE7', padding: '22px 24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0C85C2', color: '#fff', fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '15px', color: '#2C3E50' }}>Business listing (Google Business Profile)</div>
          </div>
          <div style={{ ...hintStyle, paddingLeft: '38px', marginBottom: '18px' }}>Keep this consistent with what's on your GBP. Inconsistencies hurt local SEO.</div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Business listing address</label>
            <span style={hintStyle}>The exact address shown on your Google Business Profile</span>
            <input style={inputStyle} type="text" value={form.gbp_address || ''} onChange={e => update('gbp_address', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Business website</label>
              <span style={hintStyle}>Your local franchise website URL</span>
              <input style={inputStyle} type="url" placeholder="https://" value={form.website || ''} onChange={e => update('website', e.target.value)} />
              {form.website && <div style={{ marginTop: '8px', fontSize: '12px', color: '#5AB3C9' }}>
                <a href={form.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0C85C2', textDecoration: 'none', fontWeight: 600 }}>View website ↗</a>
              </div>}
            </div>
            <div>
              <label style={labelStyle}>Google Business Profile link</label>
              <span style={hintStyle}>The direct URL to your GBP listing</span>
              <input style={inputStyle} type="url" placeholder="https://g.page/…" value={form.gbp_link || ''} onChange={e => update('gbp_link', e.target.value)} />
              {form.gbp_link && <div style={{ marginTop: '8px', fontSize: '12px', color: '#5AB3C9' }}>
                <a href={form.gbp_link} target="_blank" rel="noopener noreferrer" style={{ color: '#0C85C2', textDecoration: 'none', fontWeight: 600 }}>View GBP listing ↗</a>
              </div>}
            </div>
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
