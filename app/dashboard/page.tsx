'use client'

import Sidebar from '@/components/Sidebar'

const kpis = [
  { label: 'Monthly Revenue', value: '$24,820', change: '+12% vs last month', up: true },
  { label: 'Jobs Completed', value: '148', change: '+9 vs last month', up: true },
  { label: 'Avg Job Value', value: '$168', change: '-$4 vs last month', up: false },
  { label: 'Network Rank', value: '#4', change: 'Up 2 spots this month', up: true, green: true },
]

const goals = [
  { label: 'Revenue', pct: 83, color: '#0C85C2' },
  { label: 'Jobs booked', pct: 74, color: '#5AB3C9' },
  { label: 'New clients', pct: 60, color: '#7CCA5B' },
  { label: '5-star reviews', pct: 90, color: '#FFB600' },
]

const todos = [
  { text: 'Set weekly marketing mix', badge: 'Urgent', color: '#FFB600', badgeBg: '#fff7e0', badgeText: '#B8840A' },
  { text: 'Review Q1 growth plan progress', badge: 'This week', color: '#0C85C2', badgeBg: '#e6f4fb', badgeText: '#0C85C2' },
  { text: 'Follow up with 3 inactive clients', badge: 'In progress', color: '#7CCA5B', badgeBg: '#eafbdf', badgeText: '#3B7A1A' },
  { text: 'Submit March cleaner feedback', badge: 'This week', color: '#A7DBE7', badgeBg: '#e6f4fb', badgeText: '#0C85C2' },
]

const leaderboard = [
  { rank: 1, name: 'Alex R.', location: 'Austin, TX', revenue: '$41,200', you: false },
  { rank: 2, name: 'Maria S.', location: 'Phoenix, AZ', revenue: '$38,750', you: false },
  { rank: 3, name: 'Chris B.', location: 'Nashville, TN', revenue: '$31,100', you: false },
  { rank: 4, name: 'You', location: 'Denver, CO', revenue: '$24,820', you: true },
  { rank: 5, name: 'Taylor M.', location: 'Orlando, FL', revenue: '$22,400', you: false },
]

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#E6F1F4', fontFamily: "'Open Sans', sans-serif" }}>
      <Sidebar />

      <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '22px', color: '#2C3E50' }}>
              Good morning, <span style={{ color: '#0C85C2' }}>Jamie.</span> Let's get it.
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>
              Week 13 of 52 &nbsp;·&nbsp; You're on a 4-week revenue streak
            </div>
          </div>
          <select style={{ height: '36px', border: '1px solid #A7DBE7', borderRadius: '10px', background: '#fff', padding: '0 12px', fontSize: '13px', color: '#2C3E50', outline: 'none' }}>
            <option>This month</option>
            <option>Last month</option>
            <option>This quarter</option>
            <option>YTD</option>
          </select>
        </div>

        {/* Alert banner */}
        <div style={{ background: '#fff8e1', border: '1px solid #FFB600', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '18px', height: '18px', background: '#FFB600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="#7A5F00"><path d="M5 1l.5 5h-1L5 1zm0 6.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#7A5F00' }}>
              <strong>Your weekly marketing mix hasn't been set yet.</strong> Don't leave money on the table — it takes 2 minutes.
            </div>
            <div style={{ marginTop: '6px', display: 'inline-block', padding: '5px 14px', background: '#FFB600', color: '#7A5F00', fontSize: '12px', fontWeight: 700, borderRadius: '20px', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif" }}>
              Set my mix
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
          {kpis.map(kpi => (
            <div key={kpi.label} style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '0.5px solid #A7DBE7' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>{kpi.label}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '26px', color: kpi.green ? '#3B8C2A' : '#2C3E50' }}>{kpi.value}</div>
              <div style={{ fontSize: '12px', marginTop: '5px', color: kpi.up ? '#7CCA5B' : '#e05252', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill={kpi.up ? '#7CCA5B' : '#e05252'}>
                  {kpi.up ? <path d="M6 2l4 5H2z"/> : <path d="M6 10L2 5h8z"/>}
                </svg>
                {kpi.change}
              </div>
            </div>
          ))}
        </div>

        {/* Mid grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Revenue this month</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Daily bookings — tracking ahead of last month</div>
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '13px', background: '#f9fcfd', borderRadius: '8px' }}>
              Chart coming soon
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Monthly goal progress</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>$24,820 of $30,000 target</div>
            {goals.map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', color: '#2C3E50', width: '110px', flexShrink: 0 }}>{g.label}</div>
                <div style={{ flex: 1, height: '8px', background: '#E6F1F4', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ width: `${g.pct}%`, height: '100%', background: g.color, borderRadius: '20px' }} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0C85C2', width: '36px', textAlign: 'right' }}>{g.pct}%</div>
              </div>
            ))}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '0.5px solid #E6F1F4', fontSize: '12.5px', color: '#888' }}>
              At this pace you'll hit <strong style={{ color: '#0C85C2' }}>$29,900</strong> by month end. Go get it.
            </div>
          </div>
        </div>

        {/* Bottom grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Your to-dos</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Things that need your attention today</div>
            {todos.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: i < todos.length - 1 ? '0.5px solid #E6F1F4' : 'none' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                <div style={{ fontSize: '13.5px', color: '#2C3E50', flex: 1 }}>{t.text}</div>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', background: t.badgeBg, color: t.badgeText }}>{t.badge}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '0.5px solid #A7DBE7' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '14px', color: '#2C3E50', marginBottom: '4px' }}>Network leaderboard</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Top franchisees by revenue this month</div>
            {leaderboard.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                borderBottom: i < leaderboard.length - 1 ? '0.5px solid #E6F1F4' : 'none',
                background: item.you ? '#E6F1F4' : 'transparent',
                borderRadius: item.you ? '8px' : '0',
                margin: item.you ? '0 -4px' : '0',
              }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '13px', color: item.you ? '#0C85C2' : '#A7DBE7', width: '24px' }}>#{item.rank}</div>
                <div style={{ flex: 1, fontSize: '13.5px', color: item.you ? '#0C85C2' : '#2C3E50', fontWeight: item.you ? 700 : 400 }}>
                  {item.name} <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 400 }}>{item.location}</span>
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', color: '#0C85C2' }}>{item.revenue}</div>
              </div>
            ))}
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#aaa' }}>$6,280 away from #3. Just saying.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
