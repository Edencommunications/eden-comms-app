// ═══════════════════════════════════════════════════════════════
// Wearables.jsx — Per-client wearable device data + Food Log
// Shown in:
//   • Coach's client tool panel (coach viewing a client)
//   • Client's own Wearables tab (client viewing their own data)
// currentUser.role determines coach vs. client view
// ═══════════════════════════════════════════════════════════════
import { T } from "../lib/theme";
import { useState, useEffect, useRef } from 'react'
import { sbBearer } from '../lib/sbAuth'

const C: any = T

// ── Supabase (food log persistence) ──────────────────────────
const SB_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const SB_HEADERS = { apikey: SB_ANON, get Authorization(){ return sbBearer() }, 'Content-Type': 'application/json' }


const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']


// ── Shared sub-components ─────────────────────────────────────
function Card({ children, sx = {} }: any) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, ...sx }}>
      {children}
    </div>
  )
}

function SectionLabel({ text }: any) {
  return (
    <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:12 }}>
      {text}
    </div>
  )
}

function StatTile({ label, value, unit, color }: any) {
  return (
    <div style={{ background:C.surface, borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
      <div style={{ fontSize:16, fontWeight:800, color }}>{value ?? '—'}{value != null ? unit : ''}</div>
      <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{label}</div>
    </div>
  )
}

function TrendBar({ label, values, color, max }: any) {
  const peak = max || Math.max(...values.map((v: any) => v ?? 0), 1)
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, color:C.muted }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:700, color }}>{values[0] ?? '—'}</span>
      </div>
      <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:36 }}>
        {[...values].reverse().map((v: any, i: any) => (
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

function NotConnected({ device, icon, clientName, isCoach, onConnect, connecting, error }: any) {
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
          <>
            <button
              onClick={onConnect}
              disabled={connecting || !onConnect}
              style={{
                marginTop:16, background:connecting ? '#333' : C.gold, border:'none', borderRadius:8,
                padding:'10px 24px', fontWeight:700, fontSize:13, color:connecting ? C.muted : C.black,
                cursor: onConnect ? 'pointer' : 'default',
              }}>
              {connecting ? 'Opening…' : `Connect ${device}`}
            </button>
            {error && (
              <div style={{ marginTop:10, fontSize:11, color:C.danger }}>{error}</div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ── MEAL COLOR MAP ────────────────────────────────────────────
const MEAL_COLOR: any = {
  Breakfast: '#f0a060',
  Lunch:     '#4FD89A',
  Dinner:    '#6FB8E8',
  Snack:     '#D4A8F0',
}

// ── FOOD LOG PANEL ────────────────────────────────────────────
function FoodLogPanel({ entries, onAdd, onDelete, isCoach, clientName, coachNote, setCoachNote, onSaveNote }: any) {
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

  async function saveNote() {
    const ok = onSaveNote ? await onSaveNote(coachNote.trim()) : false
    if (!ok) { alert('Could not save the note — please try again.'); return }
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  // Group entries by date, then by meal order
  const byDate: any = {}
  entries.forEach((e: any) => {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  })
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // Today's total calories
  const today = new Date().toISOString().slice(0, 10)
  const todayEntries = byDate[today] || []
  const todayCals = todayEntries.reduce((s: any, e: any) => s + (e.calories || 0), 0)

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
            <StatTile label="Avg Daily Cal" value={Math.round(entries.reduce((s: any, e: any)=>s+(e.calories||0),0)/Math.max(sortedDates.length,1))} unit=" kcal" color="#4FD89A"/>
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
              style={{ width:'100%', background:C.gold, border:'none', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14, color:C.onAccent, cursor:'pointer' }}>
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
                  style={{ flex:2, background:desc.trim()?C.gold:'#333', border:'none', borderRadius:8, padding:'9px', fontWeight:700, color:C.onAccent, fontSize:13, cursor:'pointer' }}>
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
              style={{ background:coachNote.trim()?C.gold:'#333', border:'none', borderRadius:7, padding:'7px 18px', fontWeight:700, color:C.onAccent, fontSize:12, cursor:'pointer' }}>
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
          const dayEntries = byDate[date].sort((a: any, b: any) => MEAL_TYPES.indexOf(a.meal) - MEAL_TYPES.indexOf(b.meal))
          const dayTotal = dayEntries.reduce((s: any, e: any) => s + (e.calories || 0), 0)
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
                {dayEntries.map((entry: any) => (
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
export default function Wearables({ currentUser }: any) {
  const email      = currentUser?.email || ''
  // Resolve real profile UUID from the database (no demo identity fallbacks)
  const [profileRow, setProfileRow] = useState<any>(null)
  useEffect(() => {
    if (!email) return
    fetch(`${SB_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,company_id`, { headers: SB_HEADERS })
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

  // ── Coach notes persistence (admin_settings, org-scoped, per client) ──
  const EDEN_CID = 'b0000000-0000-0000-0000-000000000001'
  const noteCompanyId = profileRow?.company_id || EDEN_CID
  useEffect(() => {
    if (!clientUUID) return
    let stale = false
    const load = (key: string, set: (v: string) => void) =>
      fetch(`${SB_URL}/rest/v1/admin_settings?company_id=eq.${noteCompanyId}&key=eq.${encodeURIComponent(key + ':' + clientUUID)}&select=value`, { headers: SB_HEADERS })
        .then(r => r.ok ? r.json() : [])
        .then((rows: any[]) => { if (!stale && rows?.[0]?.value) { try { set(JSON.parse(rows[0].value)?.text || '') } catch {} } })
        .catch(() => {})
    load('wearable_note', setCoachNote)
    load('nutrition_note', setNutritionNote)
    return () => { stale = true }
  }, [clientUUID]) // eslint-disable-line

  async function persistNote(key: string, text: string): Promise<boolean> {
    if (!clientUUID) return false
    const r = await fetch(`${SB_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ company_id: noteCompanyId, key: key + ':' + clientUUID,
        value: JSON.stringify({ text }), updated_at: new Date().toISOString() }),
    }).catch(() => null)
    return !!r?.ok
  }

  // ── Persistent food log ──────────────────────────────────────
  // Primary store: Supabase `food_log_entries` table (syncs across all devices —
  // client logs on phone, coach sees on computer). Falls back to localStorage
  // if the table doesn't exist yet or the network is down.
  const seedLog: any[] = []
  const storageKey = `eden_foodlog_${(clientUUID || email).replace(/[^a-z0-9]/gi, '_')}`

  const [foodEntries, setFoodEntries] = useState<any>(() => {
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
          setFoodEntries(rows.map((r: any) => ({ id: r.id, date: r.date, meal: r.meal, description: r.description, calories: r.calories })))
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
  const nextIdRef = useRef(Math.max(0, ...foodEntries.map((e: any) => e.id ?? 0)) + 1)

  // ── Oura Ring connection + synced data ──────────────────────
  const [oura, setOura] = useState<any>({ connected: false, readings: [], loading: true })
  const [ouraConnecting, setOuraConnecting] = useState(false)
  const [ouraError, setOuraError] = useState('')
  const [ouraBanner, setOuraBanner] = useState('')
  const [ouraRefresh, setOuraRefresh] = useState(0)

  // Pick up ?oura= result after the OAuth redirect and clean the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('oura')
    if (!result) return
    if (result === 'connected') { setOuraBanner('✓ Oura Ring connected — syncing your data…'); setOuraRefresh(n => n + 1) }
    else if (result === 'denied') setOuraError('Connection cancelled — you declined access on Oura\'s page.')
    else setOuraError('Something went wrong connecting your Oura Ring. Please try again.')
    params.delete('oura')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    setTimeout(() => setOuraBanner(''), 6000)
  }, [])

  // Load connection status + last 7 days of data from the server
  useEffect(() => {
    if (!clientUUID) return
    let cancelled = false
    fetch(`/api/oura/data?clientId=${clientUUID}`, { headers: { Authorization: sbBearer() } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!cancelled) setOura({ connected: !!d.connected, readings: Array.isArray(d.readings) ? d.readings : [], loading: false }) })
      .catch(() => { if (!cancelled) setOura((prev: any) => ({ ...prev, loading: false })) })
    return () => { cancelled = true }
  }, [clientUUID, ouraRefresh])

  function connectOura() {
    setOuraConnecting(true)
    setOuraError('')
    fetch('/api/oura/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      body: JSON.stringify({ origin: window.location.origin, returnPath: window.location.pathname }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.url) { window.location.href = d.url; return }
        setOuraConnecting(false)
        setOuraError(d.error || 'Could not start the Oura connection. Please try again.')
      })
      .catch(() => {
        setOuraConnecting(false)
        setOuraError('Could not reach the server. Please try again.')
      })
  }

  function disconnectOura() {
    if (!window.confirm('Disconnect your Oura Ring? Your coach will no longer see new ring data.')) return
    fetch('/api/oura/disconnect', { method: 'POST', headers: { Authorization: sbBearer() } }).catch(() => {})
    setOura({ connected: false, readings: [], loading: false })
  }

  const whoop = { connected: false }

  const latest = oura.readings?.[0]

  async function saveNote() {
    if (!coachNote.trim()) return
    const ok = await persistNote('wearable_note', coachNote.trim())
    if (!ok) { alert('Could not save the note — please try again.'); return }
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  function handleAddFood(entry: any) {
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
          setFoodEntries((prev: any) => [{ id: row.id, date: row.date, meal: row.meal, description: row.description, calories: row.calories }, ...prev])
        })
        .catch(() => {
          // DB write failed → keep the entry locally so nothing is lost
          setFoodEntries((prev: any) => [{ ...entry, id: nextIdRef.current++ }, ...prev])
        })
      return
    }
    setFoodEntries((prev: any) => [{ ...entry, id: nextIdRef.current++ }, ...prev])
  }

  function handleDeleteFood(id: any) {
    setFoodEntries((prev: any) => prev.filter((e: any) => e.id !== id))
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
        {activeDevice==='oura' && ouraBanner && (
          <div style={{ background:`${C.success}15`, border:`1px solid ${C.success}44`, borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:C.success, fontWeight:700 }}>
            {ouraBanner}
          </div>
        )}
        {activeDevice==='oura' && oura.loading && (
          <Card>
            <div style={{ textAlign:'center', padding:'30px 0', color:C.muted, fontSize:12 }}>Checking Oura connection…</div>
          </Card>
        )}
        {activeDevice==='oura' && !oura.loading && oura.connected && !latest && (
          <Card>
            <div style={{ textAlign:'center', padding:'30px 20px' }}>
              <div style={{ fontSize:44, marginBottom:12 }}>💍</div>
              <div style={{ fontSize:14, fontWeight:700, color:C.white, marginBottom:6 }}>Oura Ring Connected</div>
              <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, maxWidth:280, margin:'0 auto' }}>
                No data has synced yet. Oura data appears after the ring syncs with the Oura app — check back after your next sync.
              </div>
              {!isCoach && (
                <button onClick={disconnectOura}
                  style={{ marginTop:16, background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 20px', fontSize:12, color:C.muted, cursor:'pointer' }}>
                  Disconnect
                </button>
              )}
            </div>
          </Card>
        )}
        {activeDevice==='oura' && !oura.loading && (
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
                  <StatTile label="Readiness"   value={latest.readinessScore} unit="/100" color="#E8B86D"/>
                </div>
              </Card>

              <Card sx={{ marginBottom:12 }}>
                <SectionLabel text="7-Day Trends"/>
                <TrendBar label="HRV (ms)"        values={oura.readings.map((r: any)=>r.hrv)}        color="#4FD89A" max={80}/>
                <TrendBar label="Sleep Score /100" values={oura.readings.map((r: any)=>r.sleepScore)} color="#6FB8E8" max={100}/>
                <TrendBar label="Resting HR (bpm)" values={oura.readings.map((r: any)=>r.restingHr)}  color="#f06060" max={90}/>
                <TrendBar label="Steps"            values={oura.readings.map((r: any)=>r.steps)}      color={C.gold}  max={15000}/>
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
                      style={{ background:coachNote.trim()?C.gold:'#333', border:'none', borderRadius:7, padding:'7px 18px', fontWeight:700, color:C.onAccent, fontSize:12, cursor:'pointer' }}>
                      Save Note
                    </button>
                  </div>
                </Card>
              )}

              <div style={{ background:`${C.gold}0a`, border:`1px solid ${C.gold}22`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:4 }}>💡 {isCoach ? 'Coach Insight' : 'Your Trends'}</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.6 }}>
                  HRV averaging <strong style={{ color:C.white }}>{Math.round(oura.readings.reduce((s: any, r: any)=>s+(r.hrv||0),0)/Math.max(oura.readings.filter((r: any)=>r.hrv!=null).length,1))} ms</strong> over 7 days.{' '}
                  Sleep score trending <strong style={{ color:C.white }}>{(oura.readings[0].sleepScore||0) >= (oura.readings[oura.readings.length-1].sleepScore||0) ? '▲ up' : '▼ down'}</strong> vs. last week.
                  {isCoach ? ' Compare with check-in energy scores for protocol adjustments.' : ' Keep it up — consistent sleep is key to recovery.'}
                </div>
              </div>

              {!isCoach && (
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <button onClick={disconnectOura}
                    style={{ background:'transparent', border:'none', fontSize:11, color:C.dim, cursor:'pointer', textDecoration:'underline' }}>
                    Disconnect Oura Ring
                  </button>
                </div>
              )}
            </>
          ) : !oura.connected ? (
            <NotConnected device="Oura Ring" icon="💍" clientName={clientName} isCoach={isCoach}
              onConnect={connectOura} connecting={ouraConnecting} error={ouraError}/>
          ) : null
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
            onSaveNote={(text: string) => persistNote('nutrition_note', text)}
          />
        )}

      </div>
    </div>
  )
}
