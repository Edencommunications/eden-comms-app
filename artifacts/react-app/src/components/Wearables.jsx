// ═══════════════════════════════════════════════════════════════
// Wearables.jsx — Per-client wearable device data
// Shown in the coach's client tool panel (like Diet, Labs, Habits)
// currentUser = the selected client's email/name with coach's role
// ═══════════════════════════════════════════════════════════════
import { useState } from 'react'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'client@eden.io':     { uuid:'c1000000-0000-0000-0000-000000000001', name:'Jordan Williams' },
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus'   },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin'      },
}

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}

// Demo wearable data — keyed by client UUID
// In production: fetched from wearable_connections + wearable_readings tables
const DEMO_WEARABLE_DATA = {
  'c1000000-0000-0000-0000-000000000001': {
    oura: {
      connected: true,
      lastSync: '2026-07-19',
      readings: [
        { date:'2026-07-19', hrv:51, restingHr:57, sleepScore:85, sleepHours:7.6, steps:10240, bodyTemp:98.1 },
        { date:'2026-07-18', hrv:44, restingHr:60, sleepScore:74, sleepHours:6.9, steps:8310,  bodyTemp:97.8 },
        { date:'2026-07-17', hrv:48, restingHr:58, sleepScore:80, sleepHours:7.2, steps:9100,  bodyTemp:97.9 },
        { date:'2026-07-16', hrv:55, restingHr:56, sleepScore:88, sleepHours:8.0, steps:11200, bodyTemp:98.0 },
        { date:'2026-07-15', hrv:42, restingHr:62, sleepScore:70, sleepHours:6.5, steps:7800,  bodyTemp:97.7 },
        { date:'2026-07-14', hrv:48, restingHr:58, sleepScore:82, sleepHours:7.4, steps:9840,  bodyTemp:97.9 },
        { date:'2026-07-13', hrv:50, restingHr:57, sleepScore:83, sleepHours:7.5, steps:10100, bodyTemp:98.0 },
      ]
    },
    whoop: { connected: false },
    apple: { connected: false },
  }
}

function Card({ children, sx = {} }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, ...sx }}>
      {children}
    </div>
  )
}

function StatTile({ label, value, unit, color }) {
  return (
    <div style={{ background:C.surface, borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
      <div style={{ fontSize:16, fontWeight:800, color }}>{value ?? '—'}{value != null ? unit : ''}</div>
      <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{label}</div>
    </div>
  )
}

function TrendBar({ label, values, color, max }) {
  const peak = max || Math.max(...values.map(v => v ?? 0), 1)
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, color:C.muted }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:700, color }}>{values[0] ?? '—'}</span>
      </div>
      <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:36 }}>
        {[...values].reverse().map((v, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <div style={{
              width:'100%', borderRadius:3,
              height: v != null ? `${Math.round((v / peak) * 100)}%` : 4,
              background: i === values.length - 1 ? color : `${color}55`,
              minHeight:4,
            }}/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
        <span style={{ fontSize:8, color:C.dim }}>7 days ago</span>
        <span style={{ fontSize:8, color:C.dim }}>today</span>
      </div>
    </div>
  )
}

export default function Wearables({ currentUser }) {
  const email      = currentUser?.email || ''
  const clientInfo = KNOWN_USERS[email]
  const clientUUID = clientInfo?.uuid
  const clientName = clientInfo?.name || currentUser?.name || 'Client'
  const isCoach    = currentUser?.role === 'coach' || currentUser?.role === 'super_admin'

  const [activeDevice, setActiveDevice] = useState('oura')
  const [coachNote,    setCoachNote]    = useState('')
  const [noteSaved,    setNoteSaved]    = useState(false)

  const wearableData = DEMO_WEARABLE_DATA[clientUUID] || {}
  const oura  = wearableData.oura  || { connected: false }
  const whoop = wearableData.whoop || { connected: false }
  const apple = wearableData.apple || { connected: false }

  const latest = oura.readings?.[0]

  function saveNote() {
    if (!coachNote.trim()) return
    // In production: insert into wearable_coach_notes table
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  const DEVICES = [
    { key:'oura',  icon:'💍', label:'Oura Ring', data:oura  },
    { key:'whoop', icon:'⌚', label:'Whoop',     data:whoop },
    { key:'apple', icon:'🍎', label:'Apple Health', data:apple },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.black, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 16px', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.white }}>⌚ Wearables</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
          {clientName}'s connected devices and health data
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:16 }}>

        {/* Device selector */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {DEVICES.map(d => (
            <button key={d.key} onClick={() => setActiveDevice(d.key)}
              style={{
                flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                padding:'10px 8px', borderRadius:10,
                background: activeDevice===d.key ? `${C.gold}18` : C.card,
                border: `1px solid ${activeDevice===d.key ? C.gold : C.border}`,
                cursor:'pointer', position:'relative',
              }}>
              <span style={{ fontSize:20 }}>{d.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color: activeDevice===d.key ? C.gold : C.muted }}>{d.label}</span>
              {d.data.connected
                ? <span style={{ position:'absolute', top:8, right:8, width:7, height:7, borderRadius:4, background:C.success }}/>
                : <span style={{ position:'absolute', top:8, right:8, fontSize:8, color:C.dim }}>—</span>
              }
            </button>
          ))}
        </div>

        {/* ── OURA ─────────────────────────────────────────── */}
        {activeDevice==='oura' && (
          oura.connected && latest ? (
            <>
              {/* Latest snapshot */}
              <Card sx={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase' }}>
                    Latest — {latest.date}
                  </div>
                  <span style={{ fontSize:10, background:`${C.success}22`, color:C.success, padding:'2px 8px', borderRadius:8, fontWeight:700 }}>
                    ✓ Synced
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  <StatTile label="HRV"        value={latest.hrv}         unit=" ms"  color="#4FD89A"/>
                  <StatTile label="Resting HR"  value={latest.restingHr}   unit=" bpm" color="#f06060"/>
                  <StatTile label="Sleep Score" value={latest.sleepScore}  unit="/100" color="#6FB8E8"/>
                  <StatTile label="Sleep"       value={latest.sleepHours}  unit=" hrs" color="#D4A8F0"/>
                  <StatTile label="Steps"       value={latest.steps?.toLocaleString()} unit="" color={C.gold}/>
                  <StatTile label="Body Temp"   value={latest.bodyTemp}    unit="°F"  color="#E8B86D"/>
                </div>
              </Card>

              {/* 7-day trends */}
              <Card sx={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:14 }}>
                  7-Day Trends
                </div>
                <TrendBar label="HRV (ms)"        values={oura.readings.map(r=>r.hrv)}        color="#4FD89A" max={80}/>
                <TrendBar label="Sleep Score /100" values={oura.readings.map(r=>r.sleepScore)} color="#6FB8E8" max={100}/>
                <TrendBar label="Resting HR (bpm)" values={oura.readings.map(r=>r.restingHr)}  color="#f06060" max={90}/>
                <TrendBar label="Steps"            values={oura.readings.map(r=>r.steps)}      color={C.gold}  max={15000}/>
              </Card>

              {/* Coach flag / insight */}
              {isCoach && (
                <Card sx={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>
                    Coach Notes on Wearable Data
                  </div>
                  <textarea
                    value={coachNote}
                    onChange={e => setCoachNote(e.target.value)}
                    placeholder={`Add an observation about ${clientName}'s trends — e.g. "HRV dipping mid-week, correlate with sleep timing"`}
                    rows={3}
                    style={{ width:'100%', background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', color:C.white, fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
                  />
                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, gap:8, alignItems:'center' }}>
                    {noteSaved && <span style={{ fontSize:11, color:C.success, fontWeight:700 }}>✓ Saved</span>}
                    <button onClick={saveNote}
                      style={{ background:coachNote.trim()?C.gold:'#333', border:'none', borderRadius:7, padding:'7px 18px', fontWeight:700, color:C.black, fontSize:12, cursor:'pointer' }}>
                      Save Note
                    </button>
                  </div>
                </Card>
              )}

              {/* Correlation hint */}
              <div style={{ background:`${C.gold}0a`, border:`1px solid ${C.gold}22`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:4 }}>💡 Coach Insight</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.6 }}>
                  HRV averaging <strong style={{ color:C.white }}>{Math.round(oura.readings.reduce((s,r)=>s+r.hrv,0)/oura.readings.length)} ms</strong> over 7 days.
                  Sleep score trending <strong style={{ color:C.white }}>{oura.readings[0].sleepScore > oura.readings[oura.readings.length-1].sleepScore ? '▲ up' : '▼ down'}</strong> vs. last week.
                  Compare with check-in energy scores for protocol adjustments.
                </div>
              </div>
            </>
          ) : (
            <NotConnected device="Oura Ring" icon="💍" clientName={clientName} isCoach={isCoach}/>
          )
        )}

        {/* ── WHOOP ────────────────────────────────────────── */}
        {activeDevice==='whoop' && (
          whoop.connected ? (
            <Card>
              <div style={{ fontSize:12, color:C.muted }}>Whoop data loaded.</div>
            </Card>
          ) : (
            <NotConnected device="Whoop" icon="⌚" clientName={clientName} isCoach={isCoach}/>
          )
        )}

        {/* ── APPLE HEALTH ─────────────────────────────────── */}
        {activeDevice==='apple' && (
          <NotConnected device="Apple Health" icon="🍎" clientName={clientName} isCoach={isCoach} comingSoon/>
        )}

      </div>
    </div>
  )
}

function NotConnected({ device, icon, clientName, isCoach, comingSoon }) {
  return (
    <Card>
      <div style={{ textAlign:'center', padding:'30px 20px' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>{icon}</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.white, marginBottom:6 }}>
          {comingSoon ? `${device} — Coming Soon` : `${device} Not Connected`}
        </div>
        <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, maxWidth:280, margin:'0 auto' }}>
          {comingSoon
            ? `Apple Health integration requires the Eden Communications mobile app and will be available in a future update.`
            : isCoach
              ? `${clientName} has not connected their ${device} yet. When they connect it from their profile, their health data will appear here.`
              : `Connect your ${device} to share your health data with your coach.`
          }
        </div>
      </div>
    </Card>
  )
}
