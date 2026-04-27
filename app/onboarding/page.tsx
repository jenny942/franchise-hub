'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STEPS = ['Personal info', 'Business info', 'Your Blueprint']

function StepDot({ n, current }: { n: number; current: number }) {
  const done    = n < current
  const active  = n === current
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: done ? '#7CCA5B' : active ? '#0C85C2' : '#E6F1F4',
        color: done || active ? '#fff' : '#A7DBE7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px',
        transition: 'background 0.2s',
      }}>
        {done
          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="#fff" strokeWidth="2"/></svg>
          : n + 1}
      </div>
      <div style={{ fontSize: '11px', color: active ? '#0C85C2' : done ? '#7CCA5B' : '#aaa', fontWeight: active ? 700 : 400 }}>
        {STEPS[n]}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [userId, setUserId]       = useState<string | null>(null)
  const [bizId, setBizId]         = useState<string | null>(null)
  const [step, setStep]           = useState(0)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Step 1 fields
  const [fullName, setFullName]           = useState('')
  const [email, setEmail]                 = useState('')
  const [street, setStreet]               = useState('')
  const [city, setCity]                   = useState('')
  const [state, setState]                 = useState('')
  const [zip, setZip]                     = useState('')

  // Step 2 fields
  const [territory, setTerritory]         = useState('')
  const [dba, setDba]                     = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      const uid = data.user.id
      setUserId(uid)

      // Load existing profile data
      const [{ data: p }, { data: bp }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('business_profiles').select('*').eq('profile_id', uid).single(),
      ])

      if (p) {
        setFullName(p.full_name || '')
        setEmail(p.email || data.user.email || '')
        setStreet(p.mailing_street || '')
        setCity(p.mailing_city || '')
        setState(p.mailing_state || '')
        setZip(p.mailing_zip || '')
      } else {
        setEmail(data.user.email || '')
      }

      if (bp) {
        setBizId(bp.id)
        setTerritory(bp.territory || '')
        setDba(bp.dba || '')
      }

      // Determine which step to start on
      const personalDone = p?.full_name && p?.mailing_street && p?.mailing_city && p?.mailing_state && p?.mailing_zip
      const businessDone = bp?.territory
      if (personalDone && businessDone) {
        setStep(2) // Jump to blueprint step
      } else if (personalDone) {
        setStep(1)
      }
    })
  }, [])

  async function saveStep1() {
    if (!fullName.trim())   { setError('Display name is required'); return false }
    if (!email.trim())      { setError('Company email is required'); return false }
    if (!street.trim())     { setError('Street address is required'); return false }
    if (!city.trim())       { setError('City is required'); return false }
    if (!state.trim())      { setError('State is required'); return false }
    if (!zip.trim())        { setError('Zip code is required'); return false }

    setSaving(true); setError('')
    const { error } = await supabase.from('profiles').update({
      full_name:       fullName.trim(),
      email:           email.trim(),
      mailing_street:  street.trim(),
      mailing_city:    city.trim(),
      mailing_state:   state.trim(),
      mailing_zip:     zip.trim(),
    }).eq('id', userId!)
    setSaving(false)
    if (error) { setError(error.message); return false }
    return true
  }

  async function saveStep2() {
    if (!territory.trim()) { setError('Territory name is required'); return false }

    setSaving(true); setError('')
    let err: any
    if (bizId) {
      const { error } = await supabase.from('business_profiles').update({ territory: territory.trim(), dba: dba.trim() }).eq('id', bizId)
      err = error
    } else {
      const { data, error } = await supabase.from('business_profiles')
        .insert({ profile_id: userId!, territory: territory.trim(), dba: dba.trim(), status: 'active', zip_codes: [] })
        .select().single()
      if (data) setBizId(data.id)
      err = error
    }
    setSaving(false)
    if (err) { setError(err.message); return false }
    return true
  }

  async function handleNext() {
    setError('')
    if (step === 0) {
      const ok = await saveStep1()
      if (ok) setStep(1)
    } else if (step === 1) {
      const ok = await saveStep2()
      if (ok) setStep(2)
    } else {
      router.push('/blueprint/vision')
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
  const req = <span style={{ color: '#e05252', marginLeft: '2px' }}>*</span>

  return (
    <div style={{ minHeight: '100vh', background: '#E6F1F4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 20px 80px', fontFamily: "'Open Sans', sans-serif" }}>

      {/* Logo */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#5AB3C9', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
          <svg viewBox="0 0 32 32" fill="none" width="26" height="26">
            <path d="M16 4L4 13h3v11h7v-7h4v7h7V13h3L16 4z" fill="white" />
            <circle cx="22" cy="7" r="2.5" fill="#FFB600" />
          </svg>
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50' }}>
          Maid<span style={{ color: '#0C85C2' }}>This</span> <span style={{ fontWeight: 400, color: '#888', fontSize: '16px' }}>Franchise Hub</span>
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0', marginBottom: '32px' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <StepDot n={i} current={step} />
            {i < STEPS.length - 1 && (
              <div style={{ width: '60px', height: '2px', background: i < step ? '#7CCA5B' : '#E6F1F4', margin: '0 6px', marginBottom: '22px', transition: 'background 0.2s' }} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div style={{ background: '#fff', borderRadius: '20px', border: '0.5px solid #A7DBE7', padding: '32px', width: '100%', maxWidth: '560px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        {/* Step 1: Personal Info */}
        {step === 0 && (
          <>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', marginBottom: '4px' }}>Let's set up your profile</div>
            <div style={{ fontSize: '13.5px', color: '#888', marginBottom: '24px' }}>This is how you appear across the Hub and how we reach you.</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Display name {req}</label>
                <input style={inputStyle} type="text" placeholder="Jane Smith" value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Company email {req}</label>
                <input style={inputStyle} type="email" placeholder="you@maidthis.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Street address {req}</label>
              <input style={inputStyle} type="text" placeholder="123 Main St" value={street} onChange={e => setStreet(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', gap: '12px' }}>
              <div>
                <label style={labelStyle}>City {req}</label>
                <input style={inputStyle} type="text" placeholder="Tulsa" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>State {req}</label>
                <input style={inputStyle} type="text" placeholder="OK" value={state} onChange={e => setState(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Zip {req}</label>
                <input style={inputStyle} type="text" placeholder="74101" value={zip} onChange={e => setZip(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {/* Step 2: Business Info */}
        {step === 1 && (
          <>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', marginBottom: '4px' }}>Your business info</div>
            <div style={{ fontSize: '13.5px', color: '#888', marginBottom: '24px' }}>Your territory details and how your business is known locally.</div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Territory name {req}</label>
              <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>Your assigned franchise territory (e.g. Tulsa, OK)</div>
              <input style={inputStyle} type="text" placeholder="Tulsa, OK" value={territory} onChange={e => setTerritory(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>DBA — Doing Business As <span style={{ color: '#aaa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>The name your business operates under locally</div>
              <input style={inputStyle} type="text" placeholder="MaidThis Tulsa" value={dba} onChange={e => setDba(e.target.value)} />
            </div>
          </>
        )}

        {/* Step 3: Blueprint intro */}
        {step === 2 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <div style={{ width: '52px', height: '52px', background: '#e6f4fb', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#0C85C2" strokeWidth="2"><path d="M3 20V9l8-7 8 7v11H16v-6h-6v6H3z"/><path d="M10 14h6"/></svg>
              </div>
            </div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '20px', color: '#2C3E50', marginBottom: '4px', textAlign: 'center' }}>Time to build your Blueprint</div>
            <div style={{ fontSize: '13.5px', color: '#888', marginBottom: '24px', textAlign: 'center', lineHeight: 1.6 }}>
              Your Blueprint is your business roadmap — it captures your revenue goals, marketing plan, and monthly targets. You need to complete it before you can access your dashboard.
            </div>

            <div style={{ background: '#E6F1F4', borderRadius: '12px', padding: '16px 18px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { icon: '🎯', title: 'The Vision', desc: 'Set your revenue goal and income target' },
                  { icon: '📋', title: 'The Game Plan', desc: 'Map out your marketing channels and monthly targets' },
                ].map(item => (
                  <div key={item.title} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2C3E50' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ fontSize: '13px', color: '#e05252', marginTop: '12px', marginBottom: '4px' }}>{error}</div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '28px' }}>
          <button
            onClick={() => step > 0 && setStep(step - 1)}
            style={{ height: '44px', padding: '0 20px', background: 'transparent', color: step > 0 ? '#888' : 'transparent', border: 'none', fontFamily: "'Open Sans', sans-serif", fontSize: '14px', cursor: step > 0 ? 'pointer' : 'default' }}
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            disabled={saving}
            style={{ height: '44px', padding: '0 32px', background: saving ? '#5AB3C9' : '#0C85C2', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : step === 2 ? 'Set Up My Blueprint →' : 'Continue →'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#aaa' }}>
        {step < 2 ? `Step ${step + 1} of 3` : 'Almost done!'}
      </div>
    </div>
  )
}
