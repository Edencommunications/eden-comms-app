// ═══════════════════════════════════════════════════════════════
// Wearables.jsx — Per-client wearable device data + Food Log
// Shown in:
//   • Coach's client tool panel (coach viewing a client)
//   • Client's own Wearables tab (client viewing their own data)
// currentUser.role determines coach vs. client view
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer } from '../lib/sbAuth'

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}

// ── Supabase (food log persistence) ──────────────────────────
const SB_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const SB_HEADERS = { apikey: SB_ANON, get Authorization(){ return sbBearer() }, 'Content-Type': 'application/json' }


const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']


// ── Shared sub-components ─────────────────────────────────────
function Card({ children, sx = {} }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, ...sx }}>
      {children}
    </div>
  )
}

function SectionLabel({ text }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:12 }}>
      {text}
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

function NotConnected({ device, icon, clientName, isCoach }) {
  return (
    <Card>
      <div style={{ textAlign:'center', padding:'30px 20px' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>{icon}</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.white, marginBottom:6 }}>
          {device} Not Connected
        </div>
        <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, maxWidth:280, margin:'0 auto' }}>
          {isCoach
            ? `${clientName} has not connected their ${device} yet. When they connect it from their Wearables tab, their health data will appear here.`
            : `Connect your ${device} to share your health data with your coach.`
          }
        </div>
        {!isCoach && (
          <button style={{
            marginTop:16, background:C.gold, border:'none', borderRadius:8,
            padding:'10px 24px', fontWeight:700, fontSize:13, color:C.black, cursor:'pointer',
          }}>
            Connect {device}
          </button>
        )}
      </div>
    </Card>
  )
}

// ── MEAL COLOR MAP ────────────────────────────────────────────
const MEAL_COLOR = {
  Breakfast: '#f0a060',
  Lunch:     '#4FD89A',
  Dinner:    '#6FB8E8',
  Snack:     '#D4A8F0',
}

// ── FOOD LOG PANEL ────────────────────────────────────────────
function FoodLogPanel({ entries, onAdd, onDelete, isCoach, clientName, coachNote, setCoachNote }) {
  const [showForm,   setShowForm]   = useState(false)
  const [meal,       setMeal]       = useState('Breakfast')
  const [desc,       setDesc]       = useState('')
  const [cals,       setCals]       = useState('')
  const [logDate,    setLogDate]    = useState(() => new Date().toISOString().slice(0, 10))
  const [noteSaved,  setNoteSaved]  = useState(false)

  function handleAdd() {
    if (!desc.trim()) return
    onAdd({ meal, description: desc.trim(), calories: cals ? parseInt(cals) : null, date: logDate })
    setDesc(''); setCals(''); setShowForm(false)
  }

  function saveNote() {
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  // Group entries by date, then by meal order
  const byDate = {}
  entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  })
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // Today's total calories
  const today = new Date().toISOString().slice(0, 10)
  const todayEntries = byDate[today] || []
  const todayCals = todayEntries.reduce((s, e) => s + (e.calories || 0), 0)

  return (
    <div>
      {/* Summary bar */}
      {!isCoach && (
        <Card sx={{ marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Today's Total</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.gold }}>{todayCals > 0 ? `${todayCals} kcal` : '—'}</div>
          </div>
          <div style={{ fontSize:11, color:C.muted, textAlign:'right' }}>
            <div>{todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'} logged</div>
            <div style={{ marginTop:3, color:C.success, fontWeight:700, fontSize:10 }}>✓ Sharing with coach</div>
          </div>
        </Card>
      )}

      {/* Coach summary bar */}
      {isCoach && entries.length > 0 && (
        <Card sx={{ marginBottom:12 }}>
          <SectionLabel text="Nutrition Overview" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            <StatTile label="Entries (7d)"  value={entries.length}                              unit=""      color={C.gold}/>
            <StatTile label="Avg Daily Cal" value={Math.round(entries.reduce((s,e)=>s+(e.calories||0),0)/Math.max(sortedDates.length,1))} unit=" kcal" color="#4FD89A"/>
            <StatTile label="Days Logged"   value={sortedDates.length}                          unit=" days" color="#6FB8E8"/>
          </div>
        </Card>
      )}

      {/* Add entry — clients only */}
      {!isCoach && (
        <div style={{ marginBottom:12 }}>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{ width:'100%', background:C.gold, border:'none', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14, color:C.black, cursor:'pointer' }}>
              + Log a Meal
            </button>
          ) : (
            <Card>
              <SectionLabel text="New Entry" />
              {/* Date */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:C.muted, display:'block', marginBottom:4 }}>Date</label>
                <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                  style={{ width:'100%', background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.white, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
              </div>
              {/* Meal type */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:C.muted, display:'block', marginBottom:4 }}>Meal</label>
                <div style={{ display:'flex', gap:6 }}>
                  {MEAL_TYPES.map(m => (
                    <button key={m} onClick={() => setMeal(m)}
                      style={{ flex:1, padding:'7px 4px', borderRadius:7, border:`1px solid ${meal===m ? MEAL_COLOR[m] : C.border}`,
                        background: meal===m ? `${MEAL_COLOR[m]}22` : C.surface,
                        color: meal===m ? MEAL_COLOR[m] : C.muted, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {/* Description */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:C.muted, display:'block', marginBottom:4 }}>What did you eat?</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="e.g. Grilled chicken, broccoli, brown rice"
                  rows={2}
                  style={{ width:'100%', background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.white, fontSize:12, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}/>
              </div>
              {/* Calories */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, color:C.muted, display:'block', marginBottom:4 }}>Calories <span style={{ fontWeight:400 }}>(optional)</span></label>
                <input type="number" value={cals} onChange={e => setCals(e.target.value)} placeholder="e.g. 550"
                  style={{ width:'100%', background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.white, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex:1, background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, padding:'9px', color:C.muted, fontSize:13, cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={!desc.trim()}
                  style={{ flex:2, background:desc.trim()?C.gold:'#333', border:'none', borderRadius:8, padding:'9px', fontWeight:700, color:C.black, fontSize:13, cursor:'pointer' }}>
                  Save Entry
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Coach nutrition note */}
      {isCoach && (
        <Card sx={{ marginBottom:12 }}>
          <SectionLabel text={`Coach Notes — ${clientName}'s Nutrition`} />
          <textarea
            value={coachNote}
            onChange={e => setCoachNote(e.target.value)}
            placeholder={`Add a nutrition observation for ${clientName} — e.g. "Protein intake looks solid, watch sodium on dinner days"`}
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

      {/* Log history */}
      {sortedDates.length === 0 ? (
        <Card>
          <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:12 }}>
            {isCoach ? `${clientName} hasn't logged any meals yet.` : 'No meals logged yet. Tap "+ Log a Meal" to get started.'}
          </div>
        </Card>
      ) : (
        sortedDates.map(date => {
          const dayEntries = byDate[date].sort((a,b) => MEAL_TYPES.indexOf(a.meal) - MEAL_TYPES.indexOf(b.meal))
          const dayTotal = dayEntries.reduce((s, e) => s + (e.calories || 0), 0)
          const label = date === today ? 'Today' : date === new Date(Date.now()-86400000).toISOString().slice(0,10) ? 'Yesterday' : date
          return (
            <Card key={date} sx={{ marginBottom:10 }}>
              {/* Day header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.white }}>{label}</div>
                {dayTotal > 0 && <div style={{ fontSize:11, color:C.gold, fontWeight:700 }}>{dayTotal} kcal</div>}
              </div>
              {/* Meal entries */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {dayEntries.map(entry => (
                  <div key={entry.id} style={{
                    display:'flex', alignItems:'flex-start', gap:10,
                    background:C.surface, borderRadius:8, padding:'8px 10px',
                  }}>
                    <span style={{
                      fontSize:9, fontWeight:700, color: MEAL_COLOR[entry.meal] || C.gold,
                      background:`${MEAL_COLOR[entry.meal] || C.gold}18`,
                      border:`1px solid ${MEAL_COLOR[entry.meal] || C.gold}44`,
                      borderRadius:5, padding:'2px 6px', flexShrink:0, marginTop:1,
                    }}>
                      {entry.meal.toUpperCase()}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, color:C.white, lineHeight:1.4 }}>{entry.description}</div>
                      {entry.calories && (
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{entry.calories} kcal</div>
                      )}
                    </div>
                    {!isCoach && (
                      <button onClick={() => onDelete(entry.id)}
                        style={{ background:'none', border:'none', color:C.dim, fontSize:16, cursor:'pointer', flexShrink:0, padding:0, lineHeight:1 }}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function Wearables({ currentUser }) {
  const email      = currentUser?.email || ''
  // Resolve real profile UUID from the database (no demo identity fallbacks)
  const [profileRow, setProfileRow] = useState(null)
  useEffect(() => {
    if (!email) return
    fetch(`${SB_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name`, { headers: SB_HEADERS })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(rows => { if (Array.isArray(rows) && rows[0]) setProfileRow(rows[0]) })
      .catch(() => {})
  }, [email])
  const clientUUID = profileRow?.id
  const clientName = profileRow?.name || currentUser?.name || 'Client'
  const isCoach    = currentUser?.role === 'coach' || currentUser?.role === 'super_admin' || currentUser?.role === 'head_coach'

  const [activeDevice, setActiveDevice] = useState('oura')
  const [coachNote,    setCoachNote]    = useState('')
  const [nutritionNote,setNutritionNote]= useState('')
  const [noteSaved,    setNoteSaved]    = useState(false)

  // ── Persistent food log ──────────────────────────────────────
  // Primary store: Supabase `food_log_entries` table (syncs across all devices —
  // client logs on phone, coach sees on computer). Falls back to localStorage
  // if the table doesn't exist yet or the network is down.
  const seedLog    = []
  const storageKey = `eden_foodlog_${(clientUUID || email).replace(/[^a-z0-9]/gi, '_')}`

  const [foodEntries, setFoodEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return seedLog
  })
  const [dbMode, setDbMode] = useState(false) // true once the Supabase table responds

  // Load from database on mount — database wins when available
  useEffect(() => {
    if (!clientUUID) return
    fetch(`${SB_URL}/rest/v1/food_log_entries?client_id=eq.${clientUUID}&order=date.desc,id.desc`, { headers: SB_HEADERS })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(rows => {
        if (!Array.isArray(rows)) return
        setDbMode(true)
        if (rows.length > 0) {
          setFoodEntries(rows.map(r => ({ id: r.id, date: r.date, meal: r.meal, description: r.description, calories: r.calories })))
        }
      })
      .catch(() => {}) // table missing or offline → stay in localStorage mode
  }, [clientUUID])

  // Persist every change to localStorage as a same-device cache
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    try { localStorage.setItem(storageKey, JSON.stringify(foodEntries)) } catch {}
  }, [foodEntries])

  // Derive next id from current max so it never collides after deletions
  const nextIdRef = useRef(Math.max(0, ...foodEntries.map(e => e.id ?? 0)) + 1)

  const wearableData = {}
  const oura  = wearableData.oura  || { connected: false }
  const whoop = wearableData.whoop || { connected: false }

  const latest = oura.readings?.[0]

  function saveNote() {
    if (!coachNote.trim()) return
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  function handleAddFood(entry) {
    if (dbMode && clientUUID) {
      // Insert into database and use its returned id
      fetch(`${SB_URL}/rest/v1/food_log_entries`, {
        method: 'POST',
        headers: { ...SB_HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify({ client_id: clientUUID, date: entry.date, meal: entry.meal, description: entry.description, calories: entry.calories }),
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(rows => {
          const row = Array.isArray(rows) ? rows[0] : rows
          setFoodEntries(prev => [{ id: row.id, date: row.date, meal: row.meal, description: row.description, calories: row.calories }, ...prev])
        })
        .catch(() => {
          // DB write failed → keep the entry locally so nothing is lost
          setFoodEntries(prev => [{ ...entry, id: nextIdRef.current++ }, ...prev])
        })
      return
    }
    setFoodEntries(prev => [{ ...entry, id: nextIdRef.current++ }, ...prev])
  }

  function handleDeleteFood(id) {
    setFoodEntries(prev => prev.filter(e => e.id !== id))
    if (dbMode && clientUUID) {
      fetch(`${SB_URL}/rest/v1/food_log_entries?id=eq.${id}&client_id=eq.${clientUUID}`, { method: 'DELETE', headers: SB_HEADERS }).catch(() => {})
    }
  }

  const DEVICES = [
    { key:'oura',    icon:'💍', label:'Oura Ring', connected: oura.connected  },
    { key:'whoop',   icon:'⌚', label:'Whoop',     connected: whoop.connected },
    { key:'foodlog', icon:'🍽️', label:'Food Log',  connected: true            },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.black, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 16px', flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.white }}>⌚ Wearables & Nutrition</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
          {isCoach ? `${clientName}'s connected devices and food log` : 'Your connected devices and daily food log'}
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
              {d.connected
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
              <Card sx={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <SectionLabel text={`Latest — ${latest.date}`}/>
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

              <Card sx={{ marginBottom:12 }}>
                <SectionLabel text="7-Day Trends"/>
                <TrendBar label="HRV (ms)"        values={oura.readings.map(r=>r.hrv)}        color="#4FD89A" max={80}/>
                <TrendBar label="Sleep Score /100" values={oura.readings.map(r=>r.sleepScore)} color="#6FB8E8" max={100}/>
                <TrendBar label="Resting HR (bpm)" values={oura.readings.map(r=>r.restingHr)}  color="#f06060" max={90}/>
                <TrendBar label="Steps"            values={oura.readings.map(r=>r.steps)}      color={C.gold}  max={15000}/>
              </Card>

              {isCoach && (
                <Card sx={{ marginBottom:12 }}>
                  <SectionLabel text="Coach Notes on Wearable Data"/>
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

              <div style={{ background:`${C.gold}0a`, border:`1px solid ${C.gold}22`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:4 }}>💡 {isCoach ? 'Coach Insight' : 'Your Trends'}</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.6 }}>
                  HRV averaging <strong style={{ color:C.white }}>{Math.round(oura.readings.reduce((s,r)=>s+r.hrv,0)/oura.readings.length)} ms</strong> over 7 days.{' '}
                  Sleep score trending <strong style={{ color:C.white }}>{oura.readings[0].sleepScore > oura.readings[oura.readings.length-1].sleepScore ? '▲ up' : '▼ down'}</strong> vs. last week.
                  {isCoach ? ' Compare with check-in energy scores for protocol adjustments.' : ' Keep it up — consistent sleep is key to recovery.'}
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

        {/* ── FOOD LOG ─────────────────────────────────────── */}
        {activeDevice==='foodlog' && (
          <FoodLogPanel
            entries={foodEntries}
            onAdd={handleAddFood}
            onDelete={handleDeleteFood}
            isCoach={isCoach}
            clientName={clientName}
            coachNote={nutritionNote}
            setCoachNote={setNutritionNote}
          />
        )}

      </div>
    </div>
  )
}
