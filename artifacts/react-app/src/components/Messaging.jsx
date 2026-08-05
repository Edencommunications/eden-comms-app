// ═══════════════════════════════════════════════════════════════
// Messaging.jsx — Multi-client conversation list
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'
import { supabase } from '../supabaseClient'
import { sendNotification } from './Notifications'
import { TZ_OPTIONS, DEFAULT_TZ, zonedTimeToIso, tzShort } from '../lib/tz'
import Communities from './Communities'
import { loomIsShown, useLoomOn } from './LoomPrivacy'

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => window.innerWidth < bp)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

// ── Supabase credentials ──────────────────────────────────────
const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':       { uuid: '414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach', role: 'coach' },
  'client@eden.io':      { uuid: 'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Client', role: 'client' },
  'admin@edencomms.io':  { uuid: null, name: 'Eden Admin', role: 'super_admin' },
}

// ── Brand colors ──────────────────────────────────────────────
const C = {
  gold: '#ffa600', black: '#000000', white: '#ffffff',
  surface: '#111111', card: '#1a1a1a', border: '#2a2a2a',
  muted: '#888888', success: '#4FD89A', danger: '#ff4444',
}

// Demo conversation seed data removed — conversations load live from the database.

// ── Supabase helpers ──────────────────────────────────────────
const H = {
  'apikey': SUPABASE_ANON,
  get Authorization(){ return sbBearer() },
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}
async function dbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H })
  if (!res.ok) { console.error('GET error', await res.text()); return [] }
  return res.json()
}
async function dbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: H, body: JSON.stringify(body)
  })
  if (!res.ok) { console.error('INSERT error', await res.text()); return null }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
async function dbDelete(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'DELETE', headers: H })
  return res.ok
}
async function dbUpdate(table, params, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body)
  })
  if (!res.ok) console.error('UPDATE error', await res.text())
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diffDays = Math.floor((new Date() - d) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString([], { month:'short', day:'numeric' })
}
function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼'
  if (ext === 'pdf') return '📄'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  return '📎'
}
function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return Math.round(b/1024) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}


// ── Broadcast Composer ────────────────────────────────────────
function BroadcastComposer({ onClose, senderName, senderEmail }) {
  const [audienceType,    setAudienceType]    = useState('company_wide')
  const [senderId,        setSenderId]        = useState(null)   // sender's own profile id — needed for real delivery
  // Real coach → client roster from the database (for broadcast targeting)
  const [broadcastCoaches, setBroadcastCoaches] = useState([])
  useEffect(() => { (async () => {
    try {
      const me = await dbGet('user_profiles', `email=eq.${encodeURIComponent(senderEmail || '')}&select=id,company_id`)
      const cid = me?.[0]?.company_id
      if (me?.[0]?.id) setSenderId(me[0].id)
      if (!cid) return
      const [coachRows, clientRows] = await Promise.all([
        dbGet('user_profiles', `company_id=eq.${cid}&role=in.(coach,head_coach)&is_active=not.is.false&select=id,name&order=name.asc`),
        dbGet('user_profiles', `company_id=eq.${cid}&role=eq.client&is_active=not.is.false&select=id,name,coach_id,update_day&order=name.asc`),
      ])
      setBroadcastCoaches((coachRows || []).map(c => ({
        id: c.id, name: c.name,
        clients: (clientRows || []).filter(cl => cl.coach_id === c.id)
          .map(cl => ({ id: cl.id, name: cl.name, checkInDay: cl.update_day || 'Unassigned' })),
      })))
    } catch {}
  })() }, [senderEmail])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [selectedDays,    setSelectedDays]    = useState([])
  const [selectedClients, setSelectedClients] = useState(new Set())
  const [message,         setMessage]         = useState('')
  const [sending,         setSending]         = useState(false)
  const [sent,            setSent]            = useState(false)
  const [history,         setHistory]         = useState([])
  const [view,            setView]            = useState('compose') // 'compose' | 'history'
  // ── Scheduling ────────────────────────────────────────────
  const [sendMode,      setSendMode]      = useState('now')   // 'now' | 'schedule'
  const [scheduleDates, setScheduleDates] = useState([])      // [{id, date, time}]
  const [newSchedDate,  setNewSchedDate]  = useState('')
  const [newSchedTime,  setNewSchedTime]  = useState('09:00')
  const [schedTz,       setSchedTz]       = useState(DEFAULT_TZ)
  const [histTab,       setHistTab]       = useState('sent')  // 'sent' | 'scheduled'

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    try {
      const rows = await dbGet('broadcast_messages',
        'order=scheduled_for.asc.nullslast,sent_at.desc&limit=60')
      if (rows) setHistory(rows)
    } catch {}
  }

  function addScheduleDate() {
    if (!newSchedDate || !newSchedTime) return
    const iso = zonedTimeToIso(newSchedDate, newSchedTime, schedTz)
    if (scheduleDates.find(d => d.iso === iso)) return  // dedupe
    setScheduleDates(prev => [...prev, { id: Date.now(), date: newSchedDate, time: newSchedTime, tz: schedTz, iso }])
    setNewSchedDate(''); setNewSchedTime('09:00')
  }

  function removeScheduleDate(id) {
    setScheduleDates(prev => prev.filter(d => d.id !== id))
  }

  async function cancelScheduled(id) {
    try {
      await dbUpdate('broadcast_messages', `id=eq.${id}`, { status: 'cancelled' })
      await loadHistory()
    } catch {}
  }

  const coach = broadcastCoaches.find(c => c.id === selectedCoachId)

  const availableDays = coach
    ? [...new Set(coach.clients.map(c => c.checkInDay))].sort()
    : []

  const filteredClients = (() => {
    if (!coach) return []
    if (audienceType === 'coach_day' && selectedDays.length)
      return coach.clients.filter(c => selectedDays.includes(c.checkInDay))
    return coach.clients
  })()

  function toggleClient(id) {
    setSelectedClients(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function audienceLabel() {
    switch (audienceType) {
      case 'company_wide': return '🌐 Everyone — all coaches & their clients'
      case 'coaches_only': return '👨‍💼 Coaches only'
      case 'coach_roster': return coach ? `All clients of ${coach.name} (${coach.clients.length} clients)` : '— pick a coach —'
      case 'coach_day':    return (coach && selectedDays.length) ? `${coach.name} · ${selectedDays.join(' + ')} clients (${filteredClients.length})` : '— pick coach & day(s) —'
      case 'individuals':  return selectedClients.size > 0
        ? `${selectedClients.size} selected: ${[...selectedClients].map(id => coach?.clients.find(c=>c.id===id)?.name).filter(Boolean).join(', ')}`
        : '— pick coach, then select clients —'
      default: return ''
    }
  }

  function audienceReady() {
    if (audienceType === 'company_wide' || audienceType === 'coaches_only') return true
    if (!selectedCoachId) return false
    if (audienceType === 'coach_roster') return true
    if (audienceType === 'coach_day') return selectedDays.length > 0
    if (audienceType === 'individuals') return selectedClients.size > 0
    return false
  }

  function isReady() {
    if (!message.trim() || !audienceReady()) return false
    if (sendMode === 'schedule') return scheduleDates.length > 0
    return true
  }

  // Resolve exactly who this broadcast goes to — client ids + staff ids —
  // so the server can deliver real messages & notifications to each person.
  function resolveRecipients() {
    const allClients = broadcastCoaches.flatMap(c => c.clients.map(cl => cl.id))
    const allCoaches = broadcastCoaches.map(c => c.id)
    switch (audienceType) {
      case 'company_wide': return { ids: allClients, staff: allCoaches }
      case 'coaches_only': return { ids: [], staff: allCoaches }
      case 'coach_roster': return { ids: (coach?.clients || []).map(c => c.id), staff: [] }
      case 'coach_day':    return { ids: filteredClients.map(c => c.id), staff: [] }
      case 'individuals':  return { ids: [...selectedClients], staff: [] }
      default:             return { ids: [], staff: [] }
    }
  }

  async function send() {
    if (!isReady()) return
    setSending(true)
    try {
      const { ids, staff } = resolveRecipients()
      const base = {
        sent_by_name:   senderName || 'Admin',
        audience_type:  audienceType,
        audience_label: audienceLabel(),
        coach_id:       selectedCoachId || null,
        check_in_day:   selectedDays.join(', ') || null,
        recipient_ids:  JSON.stringify({ sender: senderId, ids, staff }),
        message:        message.trim(),
      }
      if (sendMode === 'now') {
        const ins = await dbInsert('broadcast_messages', { ...base, status:'sent', sent_at: new Date().toISOString() })
        // Actually deliver it — messages into each client's chat + bell
        // notifications for everyone (server-side, service key)
        const newId = Array.isArray(ins) ? ins[0]?.id : ins?.id
        if (newId) {
          try {
            const r = await fetch('/api/broadcasts/deliver', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', get Authorization() { return sbBearer() } },
              body: JSON.stringify({ id: newId }),
              signal: AbortSignal.timeout(15000), // never hang the composer
            })
            if (!r.ok) console.error('broadcast deliver failed', r.status, await r.text().catch(()=>''))
          } catch(e) { console.error('broadcast deliver failed', e) }
        }
      } else {
        for (const sd of scheduleDates) {
          await dbInsert('broadcast_messages', { ...base, status:'scheduled', scheduled_for: sd.iso })
        }
      }
      setSent(true)
      await loadHistory()
    } catch {
      alert('Could not save — run the broadcast_messages SQL in Supabase first.')
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setAudienceType('company_wide'); setSelectedCoachId(''); setSelectedDays([])
    setSelectedClients(new Set()); setMessage(''); setSent(false)
    setSendMode('now'); setScheduleDates([]); setNewSchedDate(''); setNewSchedTime('09:00')
    setView('compose')
  }

  const aud = [
    { key:'company_wide', icon:'🌐', label:'Everyone',         sub:'All coaches + their clients' },
    { key:'coaches_only', icon:'👨‍💼', label:'Coaches only',     sub:'Just the coaching team' },
    { key:'coach_roster', icon:'👥', label:'One coach\'s roster', sub:'All clients under a specific coach' },
    { key:'coach_day',    icon:'📅', label:'By check-in day',  sub:'Clients on a specific update day' },
    { key:'individuals',  icon:'✅', label:'Specific clients', sub:'Hand-pick clients from a roster' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.black, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.muted, fontSize:18, cursor:'pointer', padding:'2px 6px 2px 0', lineHeight:1 }}>←</button>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.white }}>📢 Broadcast Message</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Send to a targeted group</div>
          </div>
        </div>
        <button onClick={() => setView(v => v === 'history' ? 'compose' : 'history')}
          style={{ background:view==='history'?`${C.gold}22`:'#1a1a1a', border:`1px solid ${view==='history'?C.gold:C.border}`,
            borderRadius:8, padding:'6px 12px', color:view==='history'?C.gold:C.muted, fontSize:11, fontWeight:700, cursor:'pointer' }}>
          {view === 'history' ? '✏️ Compose' : '📋 Sent History'}
        </button>
      </div>

      {/* ── History ── */}
      {view === 'history' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Sent / Scheduled tabs */}
          <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            {[{key:'sent',label:'📤 Sent'},{key:'scheduled',label:'🕐 Scheduled'}].map(t=>(
              <button key={t.key} onClick={()=>setHistTab(t.key)}
                style={{ flex:1, padding:'10px', background:histTab===t.key?`${C.gold}18`:'none', border:'none',
                  borderBottom:`2px solid ${histTab===t.key?C.gold:'transparent'}`,
                  color:histTab===t.key?C.gold:C.muted, fontSize:12, fontWeight:histTab===t.key?700:500, cursor:'pointer' }}>
                {t.label}
                <span style={{ marginLeft:6, fontSize:10, color:C.muted }}>
                  ({history.filter(b=> t.key==='scheduled' ? b.status==='scheduled' : (b.status==='sent'||!b.status)).length})
                </span>
              </button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:16 }}>
            {/* Sent tab */}
            {histTab==='sent'&&(()=>{
              const sent = history.filter(b=>b.status==='sent'||!b.status)
              if (!sent.length) return <div style={{ textAlign:'center', padding:40, color:C.muted }}>No broadcasts sent yet</div>
              return sent.map((b,i)=>(
                <div key={b.id||i} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.gold, background:`${C.gold}18`, border:`1px solid ${C.gold}33`, borderRadius:6, padding:'2px 8px', maxWidth:'70%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {b.audience_label||b.audience_type}
                    </span>
                    <span style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                      {b.sent_at ? new Date(b.sent_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}
                    </span>
                  </div>
                  <div style={{ fontSize:13, color:C.white, lineHeight:1.5, marginBottom:4 }}>{b.message}</div>
                  <div style={{ fontSize:10, color:C.muted }}>Sent by {b.sent_by_name}</div>
                </div>
              ))
            })()}

            {/* Scheduled tab */}
            {histTab==='scheduled'&&(()=>{
              const pending = history.filter(b=>b.status==='scheduled')
              if (!pending.length) return (
                <div style={{ textAlign:'center', padding:40, color:C.muted }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🕐</div>
                  No scheduled broadcasts
                </div>
              )
              return pending.sort((a,b)=>a.scheduled_for?.localeCompare(b.scheduled_for||'')||0).map((b,i)=>(
                <div key={b.id||i} style={{ background:C.card, border:`1px solid ${C.gold}33`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#6FB8E8', background:'#6FB8E822', border:'1px solid #6FB8E844', borderRadius:6, padding:'2px 8px' }}>🕐 SCHEDULED</span>
                    </div>
                    <button onClick={()=>cancelScheduled(b.id)}
                      style={{ background:'#ff444422', border:'1px solid #ff444444', borderRadius:6, padding:'4px 10px',
                        color:'#ff4444', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                  <div style={{ fontSize:12, color:C.gold, fontWeight:700, marginBottom:6 }}>
                    📅 {b.scheduled_for ? new Date(b.scheduled_for).toLocaleString([],{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>{b.audience_label||b.audience_type}</div>
                  <div style={{ fontSize:13, color:C.white, lineHeight:1.5 }}>{b.message}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>By {b.sent_by_name}</div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* ── Compose view ── */}
      {view === 'compose' && !sent && (
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>

          {/* Audience */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>1 · Choose Audience</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {aud.map(a => (
                <button key={a.key} onClick={() => { setAudienceType(a.key); setSelectedCoachId(''); setSelectedDays([]); setSelectedClients(new Set()) }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`2px solid ${audienceType===a.key ? C.gold : C.border}`,
                    background: audienceType===a.key ? `${C.gold}12` : C.card, cursor:'pointer', textAlign:'left' }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{a.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: audienceType===a.key ? C.gold : C.white }}>{a.label}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{a.sub}</div>
                  </div>
                  {audienceType===a.key && <span style={{ color:C.gold, fontSize:16, flexShrink:0 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Coach picker */}
          {['coach_roster','coach_day','individuals'].includes(audienceType) && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>2 · Select Coach</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {broadcastCoaches.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCoachId(c.id); setSelectedDays([]); setSelectedClients(new Set()) }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10,
                      border:`2px solid ${selectedCoachId===c.id ? C.gold : C.border}`,
                      background: selectedCoachId===c.id ? `${C.gold}12` : C.card, cursor:'pointer', textAlign:'left' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color: selectedCoachId===c.id ? C.gold : C.white }}>{c.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{c.clients.length} clients</div>
                    </div>
                    {selectedCoachId===c.id && <span style={{ color:C.gold }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day picker */}
          {audienceType === 'coach_day' && selectedCoachId && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>3 · Check-In Day(s) — pick one or more</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {availableDays.map(d => { const on = selectedDays.includes(d); return (
                  <button key={d} onClick={() => setSelectedDays(prev => on ? prev.filter(x=>x!==d) : [...prev, d])}
                    style={{ padding:'8px 16px', borderRadius:20, border:`2px solid ${on ? C.gold : C.border}`,
                      background: on ? `${C.gold}18` : C.card, color: on ? C.gold : C.muted,
                      fontWeight: on ? 700 : 400, fontSize:12, cursor:'pointer' }}>
                    {on ? '✓ ' : ''}{d}
                    <span style={{ fontSize:10, marginLeft:6, color:C.muted }}>
                      ({coach?.clients.filter(c=>c.checkInDay===d).length})
                    </span>
                  </button>
                )})}
              </div>
              {selectedDays.length > 0 && (
                <div style={{ marginTop:10, padding:'8px 12px', background:'#0d1a00', border:`1px solid ${C.gold}33`, borderRadius:8 }}>
                  <div style={{ fontSize:11, color:C.gold, fontWeight:600, marginBottom:4 }}>Recipients:</div>
                  <div style={{ fontSize:12, color:C.white }}>
                    {filteredClients.map(c => c.name).join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Individual picker */}
          {audienceType === 'individuals' && selectedCoachId && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase' }}>3 · Select Clients</div>
                <button onClick={() => {
                  if (selectedClients.size === coach?.clients.length) setSelectedClients(new Set())
                  else setSelectedClients(new Set(coach?.clients.map(c=>c.id)))
                }} style={{ background:'none', border:'none', color:C.gold, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {selectedClients.size === coach?.clients.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {coach?.clients.map(cl => (
                  <button key={cl.id} onClick={() => toggleClient(cl.id)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10,
                      border:`2px solid ${selectedClients.has(cl.id) ? C.gold : C.border}`,
                      background: selectedClients.has(cl.id) ? `${C.gold}12` : C.card, cursor:'pointer', textAlign:'left' }}>
                    <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${selectedClients.has(cl.id) ? C.gold : C.border}`,
                      background: selectedClients.has(cl.id) ? C.gold : 'transparent', flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:C.black, fontWeight:800 }}>
                      {selectedClients.has(cl.id) ? '✓' : ''}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color: selectedClients.has(cl.id) ? C.gold : C.white }}><LN>{cl.name}</LN></div>
                      <div style={{ fontSize:11, color:C.muted }}>Check-in: {cl.checkInDay}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audience summary chip */}
          {isReady() && (
            <div style={{ marginBottom:16, padding:'8px 12px', background:`${C.gold}12`, border:`1px solid ${C.gold}44`, borderRadius:8 }}>
              <div style={{ fontSize:11, color:C.gold, fontWeight:600 }}>📢 {audienceLabel()}</div>
            </div>
          )}

          {/* Message */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
              {['coach_roster','coach_day','individuals'].includes(audienceType) ? '4' : '2'} · Message
            </div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4}
              placeholder="Type your broadcast message here…"
              style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 14px',
                color:C.white, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.6 }}/>
            <div style={{ textAlign:'right', fontSize:10, color:C.muted, marginTop:4 }}>{message.length} chars</div>
          </div>

          {/* ── When to Send ── */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>
              {['coach_roster','coach_day','individuals'].includes(audienceType) ? '5' : '3'} · When to Send
            </div>
            {/* Toggle */}
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {[{key:'now',label:'📢 Send Now'},{key:'schedule',label:'🕐 Schedule'}].map(m=>(
                <button key={m.key} onClick={()=>setSendMode(m.key)}
                  style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${sendMode===m.key?C.gold:C.border}`,
                    background: sendMode===m.key?`${C.gold}18`:C.card, color:sendMode===m.key?C.gold:C.muted,
                    fontWeight:sendMode===m.key?700:500, fontSize:13, cursor:'pointer' }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Schedule date builder */}
            {sendMode==='schedule'&&(
              <div>
                {/* Date + time row */}
                <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'flex-end' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
                    <input type="date" value={newSchedDate} onChange={e=>setNewSchedDate(e.target.value)}
                      style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 10px',
                        color:C.white, fontSize:12, outline:'none', boxSizing:'border-box', colorScheme:'dark' }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Time</div>
                    <input type="time" value={newSchedTime} onChange={e=>setNewSchedTime(e.target.value)}
                      style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 10px',
                        color:C.white, fontSize:12, outline:'none', boxSizing:'border-box', colorScheme:'dark' }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Timezone</div>
                    <select value={schedTz} onChange={e=>setSchedTz(e.target.value)}
                      style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 10px',
                        color:C.white, fontSize:12, outline:'none', boxSizing:'border-box', cursor:'pointer' }}>
                      {TZ_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <button onClick={addScheduleDate} disabled={!newSchedDate||!newSchedTime}
                    style={{ background:newSchedDate&&newSchedTime?C.gold:'#2a2a2a', border:'none', borderRadius:8, padding:'8px 14px',
                      color:newSchedDate&&newSchedTime?C.black:C.muted, fontWeight:700, fontSize:12, cursor:newSchedDate&&newSchedTime?'pointer':'not-allowed', whiteSpace:'nowrap', flexShrink:0 }}>
                    + Add
                  </button>
                </div>

                {/* Scheduled dates list */}
                {scheduleDates.length>0&&(
                  <div style={{ background:'#0d1a00', border:`1px solid ${C.gold}33`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
                      📅 {scheduleDates.length} scheduled send{scheduleDates.length>1?'s':''}
                    </div>
                    {scheduleDates.sort((a,b)=>a.iso.localeCompare(b.iso)).map(sd=>(
                      <div key={sd.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'6px 0', borderBottom:`1px solid ${C.gold}22` }}>
                        <span style={{ fontSize:12, color:C.white }}>
                          {sd.tz
                            ? `${new Date(sd.iso).toLocaleString('en-US',{timeZone:sd.tz,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})} ${tzShort(sd.tz)}`
                            : new Date(sd.iso).toLocaleString([],{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                        </span>
                        <button onClick={()=>removeScheduleDate(sd.id)}
                          style={{ background:'none', border:'none', color:C.muted, fontSize:16, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {scheduleDates.length===0&&(
                  <div style={{ fontSize:11, color:C.muted, padding:'6px 0' }}>Add at least one date to schedule this broadcast.</div>
                )}
              </div>
            )}
          </div>

          {/* Send / Schedule button */}
          <button onClick={send} disabled={!isReady()||sending}
            style={{ width:'100%', background:isReady()?C.gold:'#2a2a2a', border:'none', borderRadius:12,
              padding:'14px', fontWeight:800, color:isReady()?C.black:C.muted, fontSize:15,
              cursor:isReady()?'pointer':'not-allowed', marginBottom:16, opacity:sending?0.7:1 }}>
            {sending
              ? (sendMode==='schedule'?'Scheduling…':'Sending…')
              : sendMode==='schedule'
                ? `🕐 Schedule (${scheduleDates.length} date${scheduleDates.length!==1?'s':''})`
                : '📢 Send Now'}
          </button>
        </div>
      )}

      {/* ── Success state ── */}
      {view==='compose'&&sent&&(
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:16 }}>
          <div style={{ fontSize:56 }}>{sendMode==='schedule'?'🕐':'✅'}</div>
          <div style={{ fontSize:18, fontWeight:800, color:C.white }}>
            {sendMode==='schedule'?'Broadcasts Scheduled!':'Broadcast Sent!'}
          </div>
          {sendMode==='schedule'&&scheduleDates.length>0&&(
            <div style={{ background:'#0d1a00', border:`1px solid ${C.gold}33`, borderRadius:12, padding:'14px 18px', width:'100%', maxWidth:320 }}>
              <div style={{ fontSize:11, color:C.gold, fontWeight:700, marginBottom:8 }}>Scheduled send times:</div>
              {scheduleDates.sort((a,b)=>a.iso.localeCompare(b.iso)).map(sd=>(
                <div key={sd.id} style={{ fontSize:12, color:C.white, padding:'4px 0', borderBottom:`1px solid ${C.gold}22` }}>
                  {new Date(sd.iso).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize:13, color:C.muted, textAlign:'center', maxWidth:280, lineHeight:1.6 }}>
            To: <span style={{ color:C.gold, fontWeight:700 }}>{audienceLabel()}</span>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button onClick={reset}
              style={{ background:C.gold, border:'none', borderRadius:10, padding:'12px 24px', fontWeight:800, color:C.black, fontSize:14, cursor:'pointer' }}>
              {sendMode==='schedule'?'Schedule Another':'Send Another'}
            </button>
            <button onClick={()=>{ setHistTab(sendMode==='schedule'?'scheduled':'sent'); setView('history') }}
              style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 24px', color:C.muted, fontSize:14, cursor:'pointer' }}>
              View {sendMode==='schedule'?'Scheduled':'History'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Multi-tenant helpers ──────────────────────────────────────
function makeInitials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??'
}
async function dbGetOne(table, params = '') {
  const rows = await dbGet(table, params + '&limit=1')
  return rows?.[0] ?? null
}
// Convert a user_profiles row into the shape the sidebar / chat expect
function profileToConvo(profile, supabaseConvoId) {
  return {
    id:              profile.id,
    name:            profile.name,
    initials:        profile.initials || makeInitials(profile.name),
    supabaseConvoId: supabaseConvoId || null,
    lastMessage:     profile._lastMessage || '',
    lastTime:        '',
    unread:          0,
    online:          !!profile.is_online,
    thread:          [],
  }
}
// Find existing conversation between two users, or create one.
// IDs are sorted before insert so the unique constraint (a,b) is always satisfied.
async function findOrCreateConvo(aId, bId, companyId) {
  const [pA, pB] = [aId, bId].sort()
  const rows = await dbGet('conversations',
    `participant_a_id=eq.${pA}&participant_b_id=eq.${pB}&select=id&limit=1`)
  if (rows?.length) return rows[0].id
  const created = await dbInsert('conversations', {
    participant_a_id: pA, participant_b_id: pB, company_id: companyId ?? null,
  })
  return created?.[0]?.id ?? null
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Props: currentUser = { email, name, role }
// ════════════════════════════════════════════════════════════════
export default function Messaging({ currentUser, loomMode = false, loomFeatured = new Set(), initialConvoName = null }) {
  useLoomOn() // re-render when the app-wide visible-names list changes
  const isMobile = useIsMobile()

  const email    = currentUser?.email || ''
  const userInfo = KNOWN_USERS[email] || { uuid: null, name: currentUser?.name || 'User', role: currentUser?.role || 'client' }
  const myUUID   = userInfo.uuid
  const myRole   = userInfo.role
  const myName   = userInfo.name

  // ── Dynamic multi-tenant conversations (loaded from Supabase) ─
  // Falls back to hardcoded demo data when user_profiles isn't set up yet.
  const [dynConversations, setDynConversations] = useState(null) // null = not loaded
  const [myProfileId,      setMyProfileId]      = useState(myUUID)

  const [showBroadcast, setShowBroadcast] = useState(false)
  const [mainView,      setMainView]      = useState('messages') // 'messages' | 'communities'
  const [convoSearch,   setConvoSearch]   = useState('')

  const isAdmin = myRole === 'super_admin' || myRole === 'company_admin'

  // Clients see their coach + admin; ALL staff (coach, admin, VA, head coach) see client threads only —
  // teammate conversations live in the Team Hub, never here.
  const demoConversations = []
  // Only switch to Supabase-loaded convos when they are strictly richer than the demo set.
  // A partial load (e.g. only some participants found in the DB) must not wipe
  // demo conversations that have pre-seeded threads — otherwise the chat shows blank.
  // Real DB-auth users (not in the demo KNOWN_USERS list) always use live data;
  // demo accounts only switch when the live set is at least as rich as the demo set,
  // so a partial load never wipes pre-seeded demo threads.
  const isRealDbUser = !KNOWN_USERS[email]
  const baseConversations = (dynConversations && dynConversations.length &&
      (isRealDbUser || dynConversations.length >= demoConversations.length))
    ? dynConversations
    : (isRealDbUser ? [] : demoConversations) // real users never see demo threads

  // Extra stub conversations created on the fly when Follow Up targets a client not yet in the list
  const [extraConvos, setExtraConvos] = useState([])
  const conversations = extraConvos.length
    ? [...baseConversations.filter(c => !extraConvos.find(e => e.id === c.id)), ...extraConvos]
    : baseConversations

  // ── Conversation selection ────────────────────────────────
  // null = no conversation open (list-only view)
  const [activeId, setActiveId] = useState(null)
  const activeConvo = activeId ? (conversations.find(c => c.id === activeId) ?? null) : null

  // ── Auto-open a specific conversation when navigated here from Follow Up ──
  // If the client has a demo thread, open it directly.
  // If not, create a blank stub conversation so the coach can start one.
  useEffect(() => {
    if (!initialConvoName) return
    const match = conversations.find(c => c.name === initialConvoName)
    if (match) {
      openConvo(match.id)
    } else {
      // No existing conversation — create a stub so the coach can message them
      const initials = initialConvoName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      const stub = {
        id:              'stub-' + initialConvoName.toLowerCase().replace(/\s+/g, '-'),
        name:            initialConvoName,
        initials,
        supabaseConvoId: null,
        lastMessage:     '',
        lastTime:        '',
        unread:          0,
        online:          false,
        thread:          [],
      }
      setExtraConvos(prev => prev.find(e => e.id === stub.id) ? prev : [...prev, stub])
      setActiveId(stub.id)
    }
  }, [initialConvoName, baseConversations.length])

  // ── Mark-as-unread ────────────────────────────────────────
  const [openedConvos, setOpenedConvos] = useState(() => new Set())
  const [markedUnread, setMarkedUnread] = useState(() => new Set())

  function openConvo(id) {
    setActiveId(id)
    setOpenedConvos(prev => new Set([...prev, id]))
    setMarkedUnread(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function closeConvo() { setActiveId(null) }

  function markCurrentUnread() {
    if (!activeId) return
    setMarkedUnread(prev => new Set([...prev, activeId]))
    // On mobile go back to list so user sees the badge immediately
    if (isMobile) setActiveId(null)
  }

  function effectiveUnread(convo) {
    if (markedUnread.has(convo.id)) return 1
    if (openedConvos.has(convo.id)) return 0
    return convo.unread || 0
  }

  // ── Live Supabase messages ────────────────────────────────
  const [liveMessages, setLiveMessages] = useState([])
  const [liveFiles,    setLiveFiles]    = useState([])
  const [newMsg,       setNewMsg]       = useState('')
  const [tab,          setTab]          = useState('chat')
  const [fileTab,      setFileTab]      = useState('all')
  const [uploading,    setUploading]    = useState(false)
  const bottomRef = useRef(null)
  const listRef = useRef(null)          // messages scroll container
  const msgCountRef = useRef(-1)        // -1 = convo just opened (force scroll once)
  const fileRef   = useRef(null)

  const isLive = !!activeConvo?.supabaseConvoId

  // ── Threads (Slack-style replies on any message) ─────────────
  const [threadRootId, setThreadRootId] = useState(null)   // message id whose thread panel is open
  const [threadMsg,    setThreadMsg]    = useState('')
  const [showThreads,  setShowThreads]  = useState(false)  // Threads inbox panel
  const [threadInbox,  setThreadInbox]  = useState([])     // [{root, replies, convo}]
  const [threadReads,  setThreadReads]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(`eden_thread_reads_${email}`) || '{}') } catch { return {} }
  })
  function markThreadRead(rootId) {
    setThreadReads(prev => {
      const next = { ...prev, [rootId]: new Date().toISOString() }
      try { localStorage.setItem(`eden_thread_reads_${email}`, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function openThread(rootId) {
    setThreadRootId(rootId)
    markThreadRead(rootId)
  }
  function threadUnread(item) {
    const last = item.replies[item.replies.length - 1]
    if (!last || last.sender_id === myProfileId) return false
    const readAt = threadReads[item.root.id]
    return !readAt || last.created_at > readAt
  }

  // Load all thread replies across my conversations → Threads inbox
  async function loadThreadInbox() {
    try {
      // Own conversations only — monitor (oversight) convos are excluded so the
      // inbox query stays bounded and the inbox only shows threads the admin is part of.
      const ids = conversations.filter(c => !c.monitor).map(c => c.supabaseConvoId).filter(Boolean)
      if (!ids.length) return
      const replies = await dbGet('messages',
        `conversation_id=in.(${ids.join(',')})&parent_id=not.is.null&order=created_at.desc&limit=200`)
      if (!Array.isArray(replies) || !replies.length) { setThreadInbox([]); return }
      const rootIds = [...new Set(replies.map(r => r.parent_id))]
      const roots = await dbGet('messages', `id=in.(${rootIds.join(',')})`)
      const items = rootIds.map(rid => {
        const root = (roots || []).find(r => r.id === rid)
        if (!root) return null
        const reps = replies.filter(r => r.parent_id === rid)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        const convo = conversations.find(c => c.supabaseConvoId === root.conversation_id)
        return convo ? { root, replies: reps, convo } : null
      }).filter(Boolean)
      items.sort((a, b) => (b.replies[b.replies.length-1].created_at > a.replies[a.replies.length-1].created_at ? 1 : -1))
      setThreadInbox(items)
    } catch {}
  }
  useEffect(() => {
    loadThreadInbox()
    const iv = setInterval(loadThreadInbox, 15000)
    return () => clearInterval(iv)
  }, [conversations.length, myProfileId])
  const unreadThreadCount = threadInbox.filter(threadUnread).length

  async function sendThreadReply() {
    if (activeConvo?.monitor) return  // oversight threads are read-only
    const text = threadMsg.trim()
    if (!text || !myProfileId || !threadRootId) return
    const root = liveMessages.find(m => m.id === threadRootId) || threadInbox.find(t => t.root.id === threadRootId)?.root
    const convoId = root?.conversation_id || activeConvo?.supabaseConvoId
    if (!convoId) return
    setThreadMsg('')
    await dbInsert('messages', {
      conversation_id: convoId, sender_id: myProfileId,
      content: text, message_type: 'text', parent_id: threadRootId,
    })
    // Alert the other side of whichever conversation this thread lives in
    const convo = conversations.find(c => c.supabaseConvoId === convoId)
    if (convo?.id && convo.id !== myProfileId && !convo.monitor) {
      sendNotification({
        recipientId: convo.id, senderId: myProfileId, senderName: myName,
        type: 'message', body: `💬 ${myName} replied in a thread: "${text.slice(0, 80)}"`,
        linkTo: 'msgs',
      })
    }
    markThreadRead(threadRootId)
    broadcastNewMessage(convoId, `↪️ ${text}`)
    loadLiveMessages()
    loadThreadInbox()
  }

  // ── Load dynamic conversations from Supabase on mount ────────
  useEffect(() => { loadDynamicConversations() }, [email])

  async function loadDynamicConversations() {
    if (!email) return
    try {
      // 1. Fetch the current user's own profile
      const me = await dbGetOne('user_profiles', `email=eq.${encodeURIComponent(email)}`)
      if (!me?.id) return  // table not set up yet → stay on demo data
      setMyProfileId(me.id)

      const convos = []

      // Helper: dedup by profile id so the same person never appears twice
      const seen = new Set()
      function pushConvo(profile, convoId) {
        if (!profile?.id || seen.has(profile.id)) return
        seen.add(profile.id)
        convos.push(profileToConvo(profile, convoId))
      }

      // Helper: load all staff assigned to a client via client_access (messages enabled)
      async function loadAccessedStaff(clientId, companyId) {
        const rows = await dbGet('client_access',
          `company_id=eq.${companyId}&client_id=eq.${clientId}`)
        const companyWide = await dbGet('client_access',
          `company_id=eq.${companyId}&client_id=is.null`)
        for (const row of [...(rows||[]), ...(companyWide||[])]) {
          if (!row.permissions?.messages) continue
          const staff = await dbGetOne('user_profiles', `id=eq.${row.staff_id}`)
          if (staff) {
            const convoId = await findOrCreateConvo(clientId, staff.id, companyId)
            pushConvo(staff, convoId)
          }
        }
      }

      // Helper: load all clients a staff member has messaging access to
      async function loadAccessedClients(staffId, companyId) {
        const rows = await dbGet('client_access',
          `company_id=eq.${companyId}&staff_id=eq.${staffId}`)
        for (const row of rows || []) {
          if (!row.permissions?.messages) continue
          if (row.client_id) {
            // Specific client
            const client = await dbGetOne('user_profiles', `id=eq.${row.client_id}`)
            if (client) {
              const convoId = await findOrCreateConvo(staffId, client.id, companyId)
              pushConvo(client, convoId)
            }
          } else {
            // Company-wide — load all clients in the company
            const clients = await dbGet('user_profiles',
              `company_id=eq.${companyId}&role=eq.client&order=created_at.asc`)
            for (const client of clients || []) {
              const convoId = await findOrCreateConvo(staffId, client.id, companyId)
              pushConvo(client, convoId)
            }
          }
        }
      }

      // NOTE: staff↔staff DMs live in the Team Hub, not here — Messages is for
      // client conversations only (avoids the same chat living in two places).

      if (myRole === 'client') {
        // Primary coach
        if (me.coach_id) {
          const coach = await dbGetOne('user_profiles', `id=eq.${me.coach_id}`)
          if (coach) {
            const convoId = await findOrCreateConvo(me.id, coach.id, me.company_id)
            pushConvo(coach, convoId)
          }
        }
        // Company admin
        if (me.company_id) {
          const admin = await dbGetOne('user_profiles',
            `company_id=eq.${me.company_id}&role=in.(company_admin,super_admin)&id=neq.${me.id}`)
          if (admin) {
            const convoId = await findOrCreateConvo(me.id, admin.id, me.company_id)
            pushConvo(admin, convoId)
          }
        }
        // Additional staff assigned to this client via client_access
        if (me.company_id) {
          await loadAccessedStaff(me.id, me.company_id)
        }

      } else if (myRole === 'coach') {
        // Primary clients (assigned coach)
        const clients = await dbGet('user_profiles',
          `coach_id=eq.${me.id}&company_id=eq.${me.company_id}&order=created_at.asc`)
        for (const client of clients || []) {
          const convoId = await findOrCreateConvo(me.id, client.id, me.company_id)
          pushConvo(client, convoId)
        }
        // Additional clients from client_access (e.g. coach is also a VA for other clients)
        if (me.company_id) await loadAccessedClients(me.id, me.company_id)

      } else if (myRole === 'super_admin' || myRole === 'company_admin') {
        // Admin: CLIENT conversations only — teammate chats live in the Team Hub
        const users = await dbGet('user_profiles',
          `company_id=eq.${me.company_id}&role=eq.client&id=neq.${me.id}&order=created_at.asc`)
        for (const user of users || []) {
          const convoId = await findOrCreateConvo(me.id, user.id, me.company_id)
          pushConvo(user, convoId)
        }

        // Admin oversight of other people's conversations lives in the
        // Conversations tab of the admin panel (AdminConversationMonitor) —
        // no read-only monitor entries here anymore.

      } else {
        // Staff (VA, head_coach, etc.) — load all clients from client_access.
        // Teammate DMs happen in the Team Hub tab.
        if (me.company_id) await loadAccessedClients(me.id, me.company_id)
      }

      if (convos.length) {
        setDynConversations(convos)
        // Don't auto-open — let user choose
      }
    } catch (e) {
      console.warn('Dynamic messaging unavailable — using demo data:', e)
    }
  }

  // ── Reload messages when active conversation changes ──────────
  // Realtime-first: a Supabase channel per open conversation delivers new
  // messages instantly (hybrid postgres_changes + broadcast, same pattern as
  // Team Hub chat). The 4s poll below only fires while realtime is unproven —
  // a channel can report SUBSCRIBED even when no events ever arrive, so we
  // only trust it once a real event has landed recently.
  const convoChanRef = useRef(null)
  useEffect(() => {
    setLiveMessages([])
    setLiveFiles([])
    setTab('chat')
    msgCountRef.current = -1
    if (isLive) {
      loadLiveMessages()
      loadLiveFiles()
      const convoId = activeConvo.supabaseConvoId
      // With RLS on, realtime only delivers rows the subscriber may see — authenticate.
      try { const tok = sbAccessToken(); if (tok) supabase.realtime.setAuth(tok) } catch {}
      let realtimeUp = false
      let lastEventAt = 0
      let debounce = null
      const scheduleLoad = () => {
        lastEventAt = Date.now()
        clearTimeout(debounce)
        debounce = setTimeout(loadLiveMessages, 150)
      }
      const ch = supabase.channel(`msgs-convo-${convoId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convoId}` },
          scheduleLoad)
        .on('broadcast', { event: 'new-message' }, scheduleLoad)
        .subscribe(status => {
          const wasUp = realtimeUp
          realtimeUp = status === 'SUBSCRIBED'
          if (realtimeUp && !wasUp) loadLiveMessages() // catch up on anything missed
        })
      convoChanRef.current = ch
      // Fallback poll — skipped only while the channel is up AND events flow.
      const iv = setInterval(() => {
        const proven = realtimeUp && (Date.now() - lastEventAt) < 120_000
        if (!proven) loadLiveMessages()
      }, 4000)
      return () => {
        clearTimeout(debounce)
        clearInterval(iv)
        convoChanRef.current = null
        supabase.removeChannel(ch)
      }
    }
  }, [activeId])

  // ── Realtime inbox: one per-user channel so new messages update the
  // conversation list / thread inbox instantly even when the convo is closed.
  // Senders push a broadcast to `msgs-user-<recipientProfileId>` after every send.
  const conversationsRef = useRef(conversations)
  useEffect(() => { conversationsRef.current = conversations })
  const activeIdRef = useRef(activeId)
  useEffect(() => { activeIdRef.current = activeId })
  useEffect(() => {
    if (!myProfileId) return
    try { const tok = sbAccessToken(); if (tok) supabase.realtime.setAuth(tok) } catch {}
    let debounce = null
    const ch = supabase.channel(`msgs-user-${myProfileId}`)
      .on('broadcast', { event: 'new-message' }, ({ payload }) => {
        const convoId = payload?.conversationId
        if (!convoId) return
        // Flag the conversation unread in the list the moment the message lands
        const convo = conversationsRef.current.find(c => c.supabaseConvoId === convoId)
        if (convo && convo.id !== activeIdRef.current) {
          setMarkedUnread(prev => prev.has(convo.id) ? prev : new Set([...prev, convo.id]))
          setDynConversations(prev => Array.isArray(prev) ? prev.map(c =>
            c.supabaseConvoId === convoId
              ? { ...c, lastMessage: payload?.preview ?? c.lastMessage, lastTime: 'now' }
              : c) : prev)
        }
        // Thread replies land in the Threads inbox instantly too
        clearTimeout(debounce)
        debounce = setTimeout(loadThreadInbox, 250)
      })
      .subscribe()
    return () => { clearTimeout(debounce); supabase.removeChannel(ch) }
  }, [myProfileId])

  // Cached, never-subscribed channels used purely for HTTP broadcast sends
  const sendChansRef = useRef({})
  useEffect(() => () => {
    for (const ch of Object.values(sendChansRef.current)) { try { supabase.removeChannel(ch) } catch {} }
    sendChansRef.current = {}
  }, [])
  // Tell the other participant a message just landed — instantly updates their
  // open conversation (convo channel) and their inbox (user channel).
  function broadcastNewMessage(convoId, preview = '') {
    if (!convoId) return
    const payload = { conversationId: convoId, senderId: myProfileId, preview: String(preview).slice(0, 80) }
    try {
      convoChanRef.current?.send({ type: 'broadcast', event: 'new-message', payload })
      const other = conversationsRef.current.find(c => c.supabaseConvoId === convoId)
      if (other?.id && other.id !== myProfileId) {
        const topic = `msgs-user-${other.id}`
        // send() on an unjoined channel goes over HTTP — no subscribe needed
        const ch = sendChansRef.current[topic] ||= supabase.channel(topic)
        ch.send({ type: 'broadcast', event: 'new-message', payload })
      }
    } catch {}
  }

  async function loadLiveMessages() {
    if (!activeConvo?.supabaseConvoId) return
    const data = await dbGet('messages', `conversation_id=eq.${activeConvo.supabaseConvoId}&order=created_at.asc`)
    if (data) {
      // Only auto-scroll on first open, or when NEW messages arrive while the
      // user is already near the bottom — never yank them down while reading old messages.
      const el = listRef.current
      const nearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 150)
      const firstLoad = msgCountRef.current < 0
      const grew = data.length > msgCountRef.current
      msgCountRef.current = data.length
      setLiveMessages(data)
      if (firstLoad || (grew && nearBottom)) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
      }
    }
  }
  async function loadLiveFiles() {
    if (!activeConvo?.supabaseConvoId) return
    const data = await dbGet('conversation_files', `conversation_id=eq.${activeConvo.supabaseConvoId}&order=created_at.desc`)
    if (data) setLiveFiles(data)
  }

  // ── Message pins (per-user — pinning never affects the other person) ──
  const [pins, setPins] = useState([])
  async function loadPins() {
    if (!activeConvo?.supabaseConvoId || !myProfileId) return
    const data = await dbGet('message_pins', `conversation_id=eq.${activeConvo.supabaseConvoId}&user_id=eq.${myProfileId}`)
    if (Array.isArray(data)) setPins(data)
  }
  useEffect(() => { setPins([]); if (activeConvo?.supabaseConvoId) loadPins() }, [activeId, myProfileId])
  const pinnedIds = new Set(pins.map(p => p.message_id))

  function jumpToMsg(id) {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior:'smooth', block:'center' })
    el.style.transition = 'background 0.4s'
    el.style.background = `${C.gold}33`
    el.style.borderRadius = '10px'
    setTimeout(() => { el.style.background = 'transparent' }, 1600)
  }

  async function togglePin(msg) {
    if (!myProfileId) return
    if (pinnedIds.has(msg.id)) {
      await dbDelete('message_pins', `message_id=eq.${msg.id}&user_id=eq.${myProfileId}`)
    } else {
      const r = await dbInsert('message_pins', {
        message_id: msg.id, conversation_id: msg.conversation_id, context: 'dm',
        user_id: myProfileId, pinned_by: myProfileId, pinned_by_name: myName,
      })
      if (r === null) { alert('Pinning is not set up yet — run the database update first.'); return }
    }
    loadPins()
  }
  // Admin/VA: pin a message for every participant in this conversation
  async function pinForAll(msg) {
    const convo = await dbGetOne('conversations', `id=eq.${msg.conversation_id}&select=participant_a_id,participant_b_id`)
    const targets = [...new Set([myProfileId, convo?.participant_a_id, convo?.participant_b_id].filter(Boolean))]
    for (const uid of targets) {
      await dbInsert('message_pins', {
        message_id: msg.id, conversation_id: msg.conversation_id, context: 'dm',
        user_id: uid, pinned_by: myProfileId, pinned_by_name: myName,
      }) // duplicate pins fail silently on the unique constraint — that's fine
    }
    loadPins()
    alert('Pinned for everyone in this conversation.')
  }

  // ── Message delete (soft delete — always visible in the admin audit log) ──
  const canDeleteAnyMsg = ['coach', 'head_coach', 'super_admin', 'company_admin'].includes(myRole)
  async function deleteMsg(msg) {
    if (!window.confirm('Delete this message for everyone in the chat?\nIt stays permanently visible in the admin audit log.')) return
    const ok = await dbUpdate('messages', `id=eq.${msg.id}`, {
      deleted_at: new Date().toISOString(), deleted_by: myProfileId, deleted_by_name: myName,
    })
    if (!ok) { alert('Could not delete the message — run the database update first.'); return }
    dbInsert('audit_logs', {
      action: 'message_deleted', actor_id: myProfileId, actor_name: myName, actor_role: myRole,
      target_type: 'message', target_id: String(msg.id),
      details: { content: msg.content || null, file_url: msg.file_url || null, file_name: msg.file_name || null,
        conversation_id: msg.conversation_id, sender_id: msg.sender_id, sent_at: msg.created_at || null, context: 'dm' },
    })
    loadLiveMessages()
  }

  // Bell notification for the person on the other side of this conversation —
  // they get an instant alert (the bell listens via realtime) that links back
  // to the Messages tab. activeConvo.id is the other person's profile id.
  function notifyRecipient(preview) {
    const otherId = activeConvo?.id
    if (!otherId || !myProfileId || otherId === myProfileId || activeConvo?.monitor) return
    sendNotification({
      recipientId: otherId, senderId: myProfileId, senderName: myName,
      type: 'message', body: `💬 New message from ${myName}: "${String(preview || '').slice(0, 80)}"`,
      linkTo: 'msgs',
    })
  }

  async function sendMessage() {
    const text = newMsg.trim()
    if (!text || !myProfileId || !isLive) return
    setNewMsg('')
    await dbInsert('messages', {
      conversation_id: activeConvo?.supabaseConvoId,
      sender_id: myProfileId,
      content: text,
      message_type: 'text',
    })
    await dbUpdate('conversations', `id=eq.${activeConvo?.supabaseConvoId}`, {
      last_message: text.slice(0, 80),
      last_message_at: new Date().toISOString(),
    })
    notifyRecipient(text)
    broadcastNewMessage(activeConvo?.supabaseConvoId, text)
    loadLiveMessages()
  }

  // ── Voice memos — COACH-SIDE ONLY (clients never get a mic button).
  // Records with MediaRecorder, uploads to chat-media, transcribes best-effort,
  // then sends as an audio file message with the transcript in content.
  const [recording,  setRecording]  = useState(false)
  const [recSecs,    setRecSecs]    = useState(0)
  const recRef      = useRef(null)
  const recChunks   = useRef([])
  const recTimerRef = useRef(null)

  async function startVoiceMemo() {
    if (recording || !isLive) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mr = new MediaRecorder(stream)
      recChunks.current = []
      mr.ondataavailable = ev => { if (ev.data?.size) recChunks.current.push(ev.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t=>t.stop())
        clearInterval(recTimerRef.current)
        const blob = new Blob(recChunks.current, { type:'audio/webm' })
        setRecording(false); setRecSecs(0)
        if (blob.size < 1000) return
        setUploading(true)
        try {
          const path  = `${activeConvo?.supabaseConvoId}/${Date.now()}-voice-memo.webm`
          const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/chat-media/${path}`, {
            method:'POST', headers:{ 'apikey':SUPABASE_ANON, get Authorization(){ return sbBearer() }, 'Content-Type':'audio/webm' }, body: blob,
          })
          if (!upRes.ok) throw new Error('upload failed')
          const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/chat-media/${path}`
          // Best-effort transcript — memo still sends if this fails
          let transcript = null
          try {
            const fd = new FormData()
            fd.append('audio', blob, 'voice-memo.webm')
            const tr = await fetch('/api/team/transcribe', { method:'POST', headers:{ get Authorization(){ return sbBearer() } }, body:fd })
            if (tr.ok) { const d = await tr.json(); transcript = d?.text || null }
          } catch {}
          await dbInsert('messages', {
            conversation_id: activeConvo?.supabaseConvoId, sender_id: myProfileId,
            content: transcript, message_type:'file',
            file_url: fileUrl, file_name:'Voice memo', file_size: blob.size, file_type:'audio/webm',
          })
          await dbUpdate('conversations', `id=eq.${activeConvo?.supabaseConvoId}`, {
            last_message:'🎙️ Voice memo', last_message_at:new Date().toISOString(),
          })
          notifyRecipient('🎙️ Voice memo')
          broadcastNewMessage(activeConvo?.supabaseConvoId, '🎙️ Voice memo')
          loadLiveMessages()
        } catch { alert('Voice memo failed to send. Please try again.') }
        finally { setUploading(false) }
      }
      recRef.current = mr
      mr.start()
      setRecording(true); setRecSecs(0)
      recTimerRef.current = setInterval(()=>setRecSecs(s=>s+1), 1000)
    } catch { alert('Microphone access was blocked. Allow mic access in your browser and try again.') }
  }
  function stopVoiceMemo() { try { recRef.current?.stop() } catch {} }
  const recClock = `${Math.floor(recSecs/60)}:${String(recSecs%60).padStart(2,'0')}`

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !myProfileId || !isLive) return
    setUploading(true)
    try {
      const path   = `${activeConvo?.supabaseConvoId}/${Date.now()}-${file.name}`
      const bucket = file.type.startsWith('image/') ? 'chat-media' : 'lab-files'
      const upRes  = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, get Authorization(){ return sbBearer() }, 'Content-Type': file.type },
        body: file,
      })
      if (!upRes.ok) throw new Error('Upload failed')
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
      const isImage = file.type.startsWith('image/')
      const fileType = isImage ? 'image' : file.name.toLowerCase().includes('lab') ? 'lab' : 'document'
      await dbInsert('messages', {
        conversation_id: activeConvo?.supabaseConvoId,
        sender_id: myProfileId,
        content: isImage ? null : file.name,
        message_type: isImage ? 'image' : 'file',
        file_url: fileUrl, file_name: file.name, file_size: file.size, file_type: file.type,
      })
      await dbInsert('conversation_files', {
        conversation_id: activeConvo?.supabaseConvoId,
        uploaded_by: myProfileId,
        file_url: fileUrl, file_name: file.name, file_size: file.size, file_type: fileType,
      })
      await dbUpdate('conversations', `id=eq.${activeConvo?.supabaseConvoId}`, {
        last_message: isImage ? '📷 Photo' : `📎 ${file.name}`,
        last_message_at: new Date().toISOString(),
      })
      notifyRecipient(isImage ? '📷 Photo' : `📎 ${file.name}`)
      broadcastNewMessage(activeConvo?.supabaseConvoId, isImage ? '📷 Photo' : `📎 ${file.name}`)
      loadLiveMessages()
      loadLiveFiles()
    } catch {
      alert('Upload failed. Check storage buckets exist in Supabase.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Which messages to show ─────────────────────────────────
  // Live messages when connected to Supabase; otherwise the conversation thread from state.
  // Group thread replies under their parent; the main chat only shows root messages
  const repliesByParent = {}
  for (const m of liveMessages) if (m.parent_id) (repliesByParent[m.parent_id] ||= []).push(m)
  const rootLiveMessages = liveMessages.filter(m => !m.parent_id)
  const displayMessages = isLive && liveMessages.length > 0
    ? rootLiveMessages
    : (activeConvo?.thread ?? [])
  const threadRoot = threadRootId
    ? (liveMessages.find(m => m.id === threadRootId) || threadInbox.find(t => t.root.id === threadRootId)?.root || null)
    : null
  const threadReplies = threadRootId
    ? (repliesByParent[threadRootId] || threadInbox.find(t => t.root.id === threadRootId)?.replies || [])
    : []
  function isMine(msg) {
    if (isLive) return msg.sender_id === myProfileId
    if (myRole === 'coach') return msg.from === 'coach'
    return msg.from === 'client'
  }
  function msgText(msg)  { return isLive ? msg.content  : msg.text }
  // Turn pasted http(s) URLs into clickable links (only http/https — never js:/data:)
  function linkify(text, mine = false) {
    return String(text||'').split(/((?:https?:\/\/|www\.)[^\s]+)/g).map((p, i) => {
      if (!/^(?:https?:\/\/|www\.)/.test(p)) return <span key={i}>{p}</span>
      const href = /^www\./.test(p) ? `https://${p}` : p
      try { const proto = new URL(href).protocol; if (proto !== 'http:' && proto !== 'https:') return <span key={i}>{p}</span> } catch { return <span key={i}>{p}</span> }
      return <a key={i} href={href} target="_blank" rel="noreferrer"
        style={{ color: mine ? C.black : C.gold, fontWeight:700, textDecoration:'underline', wordBreak:'break-all' }}>{p}</a>
    })
  }
  function msgTime(msg)  { return isLive ? formatTime(msg.created_at) : msg.time }
  function msgType(msg)  { return isLive ? msg.message_type : 'text' }
  function otherInitial(){ return activeConvo?.initials?.[0] ?? '' }

  const shownFiles = liveFiles.filter(f => {
    if (fileTab === 'all')       return true
    if (fileTab === 'images')    return f.file_type === 'image'
    if (fileTab === 'documents') return f.file_type === 'document'
    if (fileTab === 'labs')      return f.file_type === 'lab'
    return true
  })

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  // On mobile: show list panel when no convo open, chat panel when convo open
  // On desktop: both panels always visible side-by-side
  const showList  = !isMobile || activeId === null
  const showChat  = !isMobile || activeId !== null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.black, overflow:'hidden', position:'relative' }}>

      {/* ── Messages | Communities switcher ── */}
      <div style={{ display:'flex', background:C.surface, borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {[['messages','💬 Messages'],['communities','👥 Communities']].map(([k,label]) => (
          <button key={k} onClick={() => setMainView(k)}
            style={{ flex: isMobile ? 1 : 'none', padding: isMobile ? '12px 10px' : '11px 22px', background:'none', border:'none',
              borderBottom:`2px solid ${mainView===k?C.gold:'transparent'}`,
              color: mainView===k?C.gold:C.muted, fontSize:12, fontWeight: mainView===k?800:500, cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {mainView === 'communities' ? (
        <div style={{ flex:1, overflow:'hidden' }}>
          <Communities me={{ id: myProfileId, name: myName, role: myRole }} context="clients" isMobile={isMobile}/>
        </div>
      ) : (
      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>

      {/* ── LEFT SIDEBAR ──────────────────────────────────────── */}
      <div style={{
        width: isMobile ? '100%' : 250,
        display: showList ? 'flex' : 'none',
        flexDirection:'column',
        background:C.surface,
        borderRight: isMobile ? 'none' : `1px solid ${C.border}`,
        flexShrink:0,
      }}>
        {/* Header */}
        <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.white }}>Messages</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
              {myRole === 'coach' ? `${conversations.length} clients` : isAdmin ? 'All staff & clients' : 'Your coach & support team'}
            </div>
          </div>
          {/* Threads inbox button — everyone */}
          <button onClick={() => { setShowThreads(s => !s); setShowBroadcast(false) }}
            title="Threads — replies to messages you're part of"
            style={{ position:'relative', background: showThreads ? C.gold : 'transparent',
              border:`1px solid ${showThreads ? C.gold : C.border}`, borderRadius:8,
              padding:'6px 10px', color: showThreads ? C.black : (unreadThreadCount ? C.gold : C.muted),
              fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            🧵 Threads
            {unreadThreadCount > 0 && !showThreads && (
              <span style={{ position:'absolute', top:-6, right:-6, minWidth:16, height:16,
                borderRadius:8, background:C.gold, color:C.black, fontSize:9, fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                {unreadThreadCount}
              </span>
            )}
          </button>
          {/* Broadcast button — admin only */}
          {isAdmin && (
            <button onClick={() => { setShowBroadcast(true); setActiveId(null) }}
              style={{ background:showBroadcast?C.gold:`${C.gold}22`, border:`1px solid ${showBroadcast?C.gold:C.gold+'55'}`,
                borderRadius:8, padding:'6px 10px', color:showBroadcast?C.black:C.gold,
                fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              📢 Broadcast
            </button>
          )}
        </div>

        {/* Loom Mode banner */}
        {loomMode && (myRole === 'coach' || myRole === 'super_admin') && (
          <div style={{ padding:'6px 12px', background:'#ff525218', borderBottom:`1px solid #ff525433` }}>
            <div style={{ fontSize:10, color:'#ff5252', fontWeight:700 }}>
              🔴 Loom Mode — other clients hidden
            </div>
          </div>
        )}

        {/* Threads inbox — replaces the conversation list while open */}
        {showThreads && (
          <div style={{ flex:1, overflowY:'auto' }}>
            <button onClick={() => { setShowThreads(false); setThreadRootId(null) }}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:8, background:C.card,
                border:'none', borderBottom:`1px solid ${C.border}`, padding:'12px 14px',
                color:C.gold, fontSize:12, fontWeight:700, cursor:'pointer', textAlign:'left' }}>
              ← Back to Messages
            </button>
            <div style={{ padding:'10px 14px', fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
              Threads you're in
            </div>
            {threadInbox.length === 0 && (
              <div style={{ padding:'32px 20px', textAlign:'center', color:C.muted, fontSize:12, lineHeight:1.7 }}>
                No threads yet.<br/>Tap ↪ on any message to start one — replies stay attached so nothing gets missed.
              </div>
            )}
            {threadInbox.map(item => {
              const last   = item.replies[item.replies.length - 1]
              const unread = threadUnread(item)
              return (
                <button key={item.root.id}
                  onClick={() => { openConvo(item.convo.id); openThread(item.root.id); setShowThreads(false); setTab('chat') }}
                  style={{ width:'100%', textAlign:'left', background: unread ? `${C.gold}0d` : 'transparent',
                    border:'none', borderBottom:`1px solid ${C.border}`,
                    borderLeft:`3px solid ${unread ? C.gold : 'transparent'}`,
                    padding:'10px 14px', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:700, color: unread ? C.gold : C.white }}>
                      {unread && <span style={{ fontSize:8, marginRight:4 }}>●</span>}{item.convo.name}
                    </span>
                    <span style={{ fontSize:10, color:C.muted }}>{formatTime(last.created_at)}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {item.root.content || '📎 Attachment'}
                  </div>
                  <div style={{ fontSize:11, color: unread ? C.white : C.muted, marginTop:2,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: unread ? 600 : 400 }}>
                    ↪ {last.sender_id === myProfileId ? 'You: ' : ''}{last.content}
                  </div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>🧵 {item.replies.length} {item.replies.length===1?'reply':'replies'}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Search bar — find a chat by name */}
        {!showThreads && (
          <div style={{ padding:'8px 12px', borderBottom:`1px solid ${C.border}`, position:'relative' }}>
            <span style={{ position:'absolute', left:22, top:'50%', transform:'translateY(-50%)', fontSize:12, color:C.muted }}>🔍</span>
            <input value={convoSearch} onChange={e => setConvoSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ width:'100%', boxSizing:'border-box', background:C.card, border:`1px solid ${C.border}`,
                borderRadius:8, padding:'8px 28px 8px 32px', color:C.white, fontSize:12, outline:'none' }}/>
            {convoSearch && (
              <button onClick={() => setConvoSearch('')}
                style={{ position:'absolute', right:18, top:'50%', transform:'translateY(-50%)', background:'none',
                  border:'none', color:C.muted, fontSize:13, cursor:'pointer', padding:2, lineHeight:1 }}>×</button>
            )}
          </div>
        )}

        {/* Conversation list */}
        {!showThreads && (
        <div style={{ flex:1, overflowY:'auto' }}>
          {conversations.filter(c => !convoSearch.trim() ||
              c.name.toLowerCase().includes(convoSearch.trim().toLowerCase())).length === 0 && (
            <div style={{ padding:'28px 16px', textAlign:'center', color:C.muted, fontSize:12 }}>
              No chats match "{convoSearch}"
            </div>
          )}
          {conversations.filter(c => !convoSearch.trim() ||
              c.name.toLowerCase().includes(convoSearch.trim().toLowerCase())).map((convo, i) => {
            const isActive  = convo.id === activeId
            // In Loom Mode: active conversation always shows real name;
            // all others are anonymised so they can't be read on camera
            const isHidden  = loomMode && (myRole === 'coach' || myRole === 'super_admin') && !isActive && !loomFeatured.has(convo.name) && !loomIsShown(convo.name)
            const label     = isHidden ? `Client ${String.fromCharCode(65 + i)}` : convo.name
            const snippet   = isHidden ? '···' : convo.lastMessage
            const avatarTxt = isHidden ? String.fromCharCode(65 + i) : convo.initials

            return (
              <button key={convo.id}
                onClick={() => openConvo(convo.id)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:10,
                  padding:'12px 14px', background: isActive ? `${C.gold}15` : 'transparent',
                  border:'none', borderLeft:`3px solid ${isActive ? C.gold : 'transparent'}`,
                  cursor:'pointer', textAlign:'left',
                }}>
                {/* Avatar */}
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{ width:38, height:38, borderRadius:19,
                    background: isActive ? C.gold : C.card,
                    border:`1px solid ${isActive ? C.gold : C.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:isHidden ? 14 : 13, fontWeight:800,
                    color: isActive ? C.black : C.muted }}>
                    {avatarTxt}
                  </div>
                  {/* Online dot — only show for active or non-loom */}
                  {convo.online && !isHidden && (
                    <div style={{ position:'absolute', bottom:1, right:1, width:9, height:9,
                      borderRadius:5, background:C.success, border:`2px solid ${C.surface}` }}/>
                  )}
                </div>
                {/* Text */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:700,
                      color: isActive ? C.gold : isHidden ? C.border : C.white,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>
                      {label}
                    </span>
                    {/* Hide timestamp for masked entries */}
                    {!isHidden && (
                      <span style={{ fontSize:10, color:C.muted, flexShrink:0, marginLeft:4 }}>{convo.lastTime}</span>
                    )}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>
                      {snippet}
                    </span>
                    {/* Unread badges hidden for masked entries */}
                    {!isHidden && effectiveUnread(convo) > 0 && (
                      <span style={{ flexShrink:0, marginLeft:4, minWidth:18, height:18, borderRadius:9,
                        background: markedUnread.has(convo.id) ? '#555' : C.gold,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:800,
                        color: markedUnread.has(convo.id) ? C.white : C.black,
                        padding:'0 5px' }}>
                        {markedUnread.has(convo.id) ? '●' : effectiveUnread(convo)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        )}

        {/* HIPAA footer */}
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.muted, lineHeight:1.6 }}>
            🔒 All messages encrypted
          </div>
        </div>
      </div>

      {/* ── THREAD PANEL — side panel on desktop, full-screen on mobile ── */}
      {threadRoot && (
        <div style={{ position:'absolute', top:0, right:0, bottom:0, zIndex:30,
          width: isMobile ? '100%' : 360, background:C.surface,
          borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
          display:'flex', flexDirection:'column', boxShadow:'-8px 0 24px rgba(0,0,0,0.5)' }}>
          {/* Header */}
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            {isMobile && (
              <button onClick={() => setThreadRootId(null)}
                style={{ background:'none', border:'none', color:C.white, fontSize:16, cursor:'pointer', padding:'4px 8px 4px 0' }}>←</button>
            )}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:C.white }}>🧵 Thread</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                {(conversations.find(c => c.supabaseConvoId === threadRoot.conversation_id)?.name) || activeConvo?.name || ''}
              </div>
            </div>
            {!isMobile && (
              <button onClick={() => setThreadRootId(null)}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:14, cursor:'pointer', padding:'3px 9px', lineHeight:1 }}>×</button>
            )}
          </div>
          {/* Root message */}
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Original message</div>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'9px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, color: threadRoot.sender_id === myProfileId ? C.gold : C.white, marginBottom:3 }}>
                {threadRoot.sender_id === myProfileId ? 'You' :
                  (conversations.find(c => c.supabaseConvoId === threadRoot.conversation_id)?.name || 'Them')}
                <span style={{ fontSize:10, fontWeight:400, color:C.muted, marginLeft:6 }}>{formatTime(threadRoot.created_at)}</span>
              </div>
              <div style={{ fontSize:12, color:C.white, lineHeight:1.5, wordBreak:'break-word' }}>{threadRoot.content || '📎 Attachment'}</div>
            </div>
          </div>
          {/* Replies */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
            {threadReplies.length === 0 && (
              <div style={{ textAlign:'center', color:C.muted, fontSize:12, padding:'24px 12px' }}>No replies yet — start the thread below.</div>
            )}
            {threadReplies.map(r => {
              const mine = r.sender_id === myProfileId
              return (
                <div key={r.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom:8 }}>
                  <div style={{ maxWidth:'85%' }}>
                    <div style={{ background: mine ? C.gold : C.card, border: mine ? 'none' : `1px solid ${C.border}`,
                      borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding:'8px 11px' }}>
                      {r.deleted_at ? (
                        <div style={{ fontSize:11, color: mine ? 'rgba(0,0,0,.5)' : C.muted, fontStyle:'italic' }}>
                          {isAdmin ? `🗑 Deleted by ${r.deleted_by_name||'staff'}: ${r.content||''}` : `Message deleted${r.deleted_by_name?` by ${r.deleted_by_name}`:''}`}
                        </div>
                      ) : (
                        <div style={{ fontSize:12, color: mine ? C.black : C.white, lineHeight:1.5, wordBreak:'break-word' }}>{linkify(r.content, mine)}</div>
                      )}
                      {!r.deleted_at && canDeleteAnyMsg && (
                        <button onClick={() => deleteMsg(r)} title="Delete reply (kept in admin audit log)"
                          style={{ background:'none', border:'none', color: mine ? 'rgba(0,0,0,.4)' : C.muted, fontSize:10, cursor:'pointer', padding:'2px 0 0', lineHeight:1 }}>
                          🗑 delete
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize:9, color:C.muted, marginTop:2, textAlign: mine ? 'right' : 'left' }}>{formatTime(r.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Reply composer — hidden in read-only oversight threads */}
          {activeConvo?.monitor ? (
            <div style={{ padding:'10px 12px 12px', borderTop:`1px solid ${C.border}`, fontSize:11, color:C.gold, fontWeight:700 }}>
              👁 Admin oversight — read-only
            </div>
          ) : (
          <div style={{ padding:'10px 12px 12px', borderTop:`1px solid ${C.border}`, display:'flex', gap:6, flexShrink:0 }}>
            <input value={threadMsg} onChange={e => setThreadMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendThreadReply())}
              placeholder="Reply in thread…"
              style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:18,
                padding: isMobile ? '11px 14px' : '9px 13px', color:C.white, fontSize:13, outline:'none', minWidth:0 }}/>
            <button onClick={sendThreadReply} disabled={!threadMsg.trim()}
              style={{ background:C.gold, border:'none', borderRadius:18, padding:'9px 16px',
                fontWeight:800, color:C.black, fontSize:12, cursor:'pointer', opacity: threadMsg.trim() ? 1 : 0.4 }}>
              ↑
            </button>
          </div>
          )}
        </div>
      )}

      {/* ── RIGHT CONTENT ─────────────────────────────────────── */}
      <div style={{ flex:1, display: (showChat || (showBroadcast && !isMobile)) ? 'flex' : 'none', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Broadcast Composer — full right panel on desktop, full screen on mobile */}
        {showBroadcast && (
          <BroadcastComposer senderName={myName} senderEmail={email} onClose={() => setShowBroadcast(false)} />
        )}

        {/* No conversation selected — desktop placeholder */}
        {!showBroadcast && !activeConvo && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:12, color:C.muted, padding:32 }}>
            <div style={{ fontSize:48, opacity:0.4 }}>💬</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.white }}>Select a conversation</div>
            <div style={{ fontSize:13, color:C.muted, textAlign:'center', maxWidth:240 }}>
              Choose someone from the list to open the chat
            </div>
            {isAdmin && (
              <button onClick={() => setShowBroadcast(true)}
                style={{ marginTop:8, background:`${C.gold}22`, border:`1px solid ${C.gold}55`,
                  borderRadius:10, padding:'10px 20px', color:C.gold, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                📢 Send a Broadcast Message
              </button>
            )}
          </div>
        )}

        {/* Active conversation UI */}
        {!showBroadcast && activeConvo && (<>

        {/* Top bar */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`,
          padding:'0 12px', display:'flex', alignItems:'center', flexShrink:0, gap:8, height: isMobile ? 64 : 52 }}>
          {/* Back button — mobile only */}
          {/* Back / close button — on mobile shows ← Back, on desktop shows × */}
          {isMobile ? (
            <button onClick={closeConvo}
              style={{ background:'none', border:'none', color:C.white, fontSize:18, cursor:'pointer',
                padding:'12px 16px 12px 0', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
              ← <span style={{ fontSize:15, fontWeight:600 }}>Back</span>
            </button>
          ) : (
            <button onClick={closeConvo} title="Close conversation"
              style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8,
                color:C.muted, fontSize:16, cursor:'pointer', padding:'4px 10px',
                flexShrink:0, lineHeight:1, display:'flex', alignItems:'center' }}>
              ×
            </button>
          )}
          {/* Active client info */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            <div style={{ width:30, height:30, borderRadius:15, background:C.gold,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, color:C.black, flexShrink:0 }}>
              {activeConvo.initials}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {activeConvo.name}
              </div>
              <div style={{ fontSize:10, color: activeConvo.online ? C.success : C.muted }}>
                {activeConvo.online ? '● Online now' : ''}
              </div>
            </div>
          </div>
          {/* Mark as unread button — tap to flag this conversation to come back to later */}
          <button onClick={markCurrentUnread}
            title="Mark as unread — flag to come back to later"
            style={{
              display:'flex', alignItems:'center', gap:4, flexShrink:0,
              background: markedUnread.has(activeId) ? '#2a2a2a' : 'transparent',
              border:`1px solid ${markedUnread.has(activeId) ? '#555' : C.border}`,
              borderRadius:8, padding: isMobile ? '7px 9px' : '6px 12px',
              cursor:'pointer', color: markedUnread.has(activeId) ? C.white : C.muted,
              fontSize:11, fontWeight:markedUnread.has(activeId) ? 700 : 400,
            }}>
            <span style={{ fontSize:8, lineHeight:1,
              color: markedUnread.has(activeId) ? '#aaa' : C.muted }}>●</span>
            {!isMobile && (
              <span>{markedUnread.has(activeId) ? 'Marked unread' : 'Mark unread'}</span>
            )}
          </button>
          {/* Tab buttons */}
          {['chat','files'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: isMobile ? '14px 8px' : '14px 14px', background:'none', border:'none',
                borderBottom:`2px solid ${tab===t?C.gold:'transparent'}`,
                color:tab===t?C.gold:C.muted, fontSize: isMobile ? 11 : 12,
                fontWeight:tab===t?700:400, cursor:'pointer', flexShrink:0 }}>
              {t === 'chat' ? (isMobile ? '💬' : '💬 Chat') : (isMobile ? '📁' : '📁 Files')}
            </button>
          ))}
        </div>

        {/* ── CHAT ──────────────────────────────────────────────── */}
        {tab === 'chat' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Demo notice */}
            {!isLive && myRole === 'coach' && (
              <div style={{ padding:'6px 16px', background:'#ffa60011', borderBottom:`1px solid ${C.gold}33`, fontSize:11, color:C.gold }}>
                📋 Demo conversation — real messages appear here once {activeConvo.name.split(' ')[0]} has a live Supabase account
              </div>
            )}

            {/* Pinned messages bar — personal to this user's perspective */}
            {isLive && pins.length > 0 && (
              <div style={{ background:`${C.gold}11`, borderBottom:`1px solid ${C.gold}33`, padding:'8px 14px', maxHeight:120, overflowY:'auto', flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>📌 Pinned</div>
                {pins.map(p => {
                  const m = liveMessages.find(x => x.id === p.message_id)
                  if (!m || m.deleted_at) return null
                  return (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0' }}>
                      <div onClick={() => jumpToMsg(m.id)} title="Jump to message"
                        style={{ flex:1, fontSize:12, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                        {m.content || m.file_name || '📎 Attachment'}
                      </div>
                      <span style={{ fontSize:9, color:C.muted, flexShrink:0 }}>{formatTime(m.created_at)}</span>
                      <button onClick={() => togglePin(m)} title="Unpin"
                        style={{ background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer', padding:2, flexShrink:0 }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} style={{ flex:1, overflowY:'auto', padding: isMobile ? '12px 10px' : '16px' }}>
              {displayMessages.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                  No messages yet.
                </div>
              )}
              {displayMessages.map((msg, i) => {
                const mine = isMine(msg)
                const type = msgType(msg)
                // Soft-deleted messages: admins still see the content (flagged); everyone else sees a placeholder
                if (isLive && msg.deleted_at) {
                  return (
                    <div key={msg.id || i} style={{ display:'flex', justifyContent:mine?'flex-end':'flex-start', marginBottom:10 }}>
                      <div style={{ maxWidth: isMobile ? '82%' : '68%' }}>
                        {activeConvo?.monitor && (
                          <div style={{ fontSize:10, fontWeight:700, color:C.gold, marginBottom:2 }}>
                            {activeConvo.senderNames?.[msg.sender_id] || 'Unknown'}
                          </div>
                        )}
                        <div style={{ background:'none', border:`1px dashed ${C.border}`, borderRadius:12, padding:'8px 12px' }}>
                          {isAdmin ? (
                            <>
                              <div style={{ fontSize:9, fontWeight:700, color:C.danger, letterSpacing:.8, textTransform:'uppercase', marginBottom:3 }}>
                                🗑 Deleted by {msg.deleted_by_name || 'staff'} — visible to admins only
                              </div>
                              <div style={{ fontSize:12, color:C.muted, lineHeight:1.5, wordBreak:'break-word' }}>{msg.content || msg.file_name || '📎 Attachment'}</div>
                            </>
                          ) : (
                            <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>Message deleted{msg.deleted_by_name?` by ${msg.deleted_by_name}`:''}</div>
                          )}
                        </div>
                        <div style={{ fontSize:9, color:C.muted, marginTop:3, textAlign: mine ? 'right' : 'left' }}>{msgTime(msg)}</div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={msg.id || i} id={msg.id ? `msg-${msg.id}` : undefined} className="msg-row" style={{ display:'flex', justifyContent:mine?'flex-end':'flex-start', marginBottom:10, alignItems:'flex-end' }}>
                    {!mine && (
                      <div style={{ width:26, height:26, borderRadius:13, background:C.card, border:`1px solid ${C.border}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, color:C.gold, flexShrink:0, marginRight:6 }}>
                        {otherInitial()}
                      </div>
                    )}
                    <div style={{ maxWidth: isMobile ? '82%' : '68%', minWidth:0 }}>
                      {activeConvo?.monitor && (
                        <div style={{ fontSize:10, fontWeight:700, color:C.gold, marginBottom:2 }}>
                          {activeConvo.senderNames?.[msg.sender_id] || 'Unknown'}
                        </div>
                      )}
                      {isLive && pinnedIds.has(msg.id) && (
                        <div style={{ fontSize:9, color:C.gold, fontWeight:700, marginBottom:2, textAlign: mine ? 'right' : 'left' }}>📌 Pinned</div>
                      )}
                      <div style={{
                        background: mine ? C.gold : C.card,
                        border: mine ? 'none' : `1px solid ${C.border}`,
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        padding:'9px 13px',
                      }}>
                        {(type === 'text' || !isLive) && (
                          <div style={{ fontSize:13, color:mine?C.black:C.white, lineHeight:1.55, wordBreak:'break-word' }}>
                            {linkify(msgText(msg), mine)}
                          </div>
                        )}
                        {isLive && type === 'image' && (
                          <img src={msg.file_url} alt={msg.file_name}
                            style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', cursor:'pointer' }}
                            onClick={() => window.open(msg.file_url,'_blank')}/>
                        )}
                        {isLive && type === 'file' && (msg.file_type||'').startsWith('audio/') && (
                          <div style={{ maxWidth:260 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:mine?C.black:C.gold, marginBottom:4 }}>🎙️ Voice memo</div>
                            <audio controls src={msg.file_url} style={{ width:'100%', height:36 }}/>
                            {msg.content && (
                              <details style={{ marginTop:6 }}>
                                <summary style={{ fontSize:11, fontWeight:700, color:mine?'rgba(0,0,0,.6)':C.muted, cursor:'pointer' }}>📝 Transcript</summary>
                                <div style={{ fontSize:12, color:mine?C.black:C.white, lineHeight:1.5, marginTop:4, whiteSpace:'pre-wrap' }}>{msg.content}</div>
                              </details>
                            )}
                          </div>
                        )}
                        {isLive && type === 'file' && !(msg.file_type||'').startsWith('audio/') && (
                          <a href={msg.file_url} target="_blank" rel="noreferrer"
                            style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
                            <span style={{ fontSize:22 }}>{fileIcon(msg.file_name)}</span>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, color:mine?C.black:C.gold, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.file_name}</div>
                              <div style={{ fontSize:10, color:mine?'rgba(0,0,0,.5)':C.muted }}>{formatBytes(msg.file_size)}</div>
                            </div>
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:3,
                        textAlign:mine?'right':'left',
                        display:'flex', gap:6, alignItems:'center', justifyContent:mine?'flex-end':'flex-start' }}>
                        <span>{msgTime(msg)}</span>
                        {mine && isLive && <span style={{ color:msg.is_read?C.success:C.muted }}>{msg.is_read?'✓✓':'✓'}</span>}
                        {isLive && !(repliesByParent[msg.id]?.length) && (
                          <button onClick={() => openThread(msg.id)} title="Reply in thread"
                            style={{ background:'none', border:'none', color:C.muted, fontSize:11,
                              cursor:'pointer', padding:'2px 4px', lineHeight:1 }}>
                            ↪
                          </button>
                        )}
                        {isLive && (
                          <button onClick={() => togglePin(msg)} title={pinnedIds.has(msg.id)?'Unpin':'Pin to top (only for you)'}
                            style={{ background:'none', border:'none', color:pinnedIds.has(msg.id)?C.gold:C.muted, fontSize:11,
                              cursor:'pointer', padding:'2px 4px', lineHeight:1 }}>
                            📌
                          </button>
                        )}
                        {isLive && (isAdmin || myRole === 'va') && (
                          <button onClick={() => pinForAll(msg)} title="Pin for everyone in this conversation"
                            style={{ background:'none', border:'none', color:C.muted, fontSize:10,
                              cursor:'pointer', padding:'2px 4px', lineHeight:1, fontWeight:700 }}>
                            📌ALL
                          </button>
                        )}
                        {isLive && canDeleteAnyMsg && (
                          <button onClick={() => deleteMsg(msg)} title="Delete message (kept in admin audit log)"
                            style={{ background:'none', border:'none', color:C.muted, fontSize:11,
                              cursor:'pointer', padding:'2px 4px', lineHeight:1 }}>
                            🗑
                          </button>
                        )}
                      </div>
                      {/* Thread reply-count chip */}
                      {isLive && (repliesByParent[msg.id]?.length > 0) && (() => {
                        const reps = repliesByParent[msg.id]
                        const last = reps[reps.length - 1]
                        const unread = last.sender_id !== myProfileId &&
                          (!threadReads[msg.id] || last.created_at > threadReads[msg.id])
                        return (
                          <button onClick={() => openThread(msg.id)}
                            style={{ marginTop:4, display:'flex', alignItems:'center', gap:5,
                              background: unread ? `${C.gold}22` : C.card,
                              border:`1px solid ${unread ? C.gold+'66' : C.border}`, borderRadius:12,
                              padding:'4px 10px', cursor:'pointer',
                              color: unread ? C.gold : C.muted, fontSize:11, fontWeight:unread?700:500,
                              marginLeft: mine ? 'auto' : 0 }}>
                            {unread && <span style={{ fontSize:7, lineHeight:1 }}>●</span>}
                            🧵 {reps.length} {reps.length === 1 ? 'reply' : 'replies'} · {formatTime(last.created_at)}
                          </button>
                        )
                      })()}
                    </div>
                    {mine && (
                      <div style={{ width:26, height:26, borderRadius:13, background:C.gold,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, color:C.black, flexShrink:0, marginLeft:6 }}>
                        {myName?.[0]}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef}/>
            </div>

            {/* Read-only banner for admin oversight threads */}
            {activeConvo?.monitor && (
              <div style={{ padding:'8px 14px', background:`${C.gold}11`, borderTop:`1px solid ${C.gold}33`,
                fontSize:11, color:C.gold, fontWeight:700, flexShrink:0 }}>
                👁 Admin oversight — read-only. Deleted messages are shown flagged with their original content.
              </div>
            )}
            {/* Input bar — hidden for demo threads and read-only oversight threads.
                Admins CAN write in their own (non-monitor) conversations. */}
            {!activeConvo?.monitor && (isLive || myRole === 'client' || myRole === 'super_admin') && (
              <div style={{ padding: isMobile ? '8px 10px 12px' : '10px 14px 14px',
                background:C.surface, borderTop:`1px solid ${C.border}`,
                display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                <input type="file" ref={fileRef} onChange={handleUpload} style={{ display:'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"/>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                    width: isMobile ? 44 : 38, height: isMobile ? 44 : 38, cursor:'pointer', fontSize:17, flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {uploading ? '⏳' : '📎'}
                </button>
                {/* Voice memo — coaches/staff only, never shown to clients */}
                {myRole !== 'client' && isLive && (
                  <button onClick={recording ? stopVoiceMemo : startVoiceMemo} disabled={uploading}
                    title={recording ? 'Stop & send voice memo' : 'Record a voice memo'}
                    style={{ background: recording ? '#e5484d' : C.card, border:`1px solid ${recording ? '#e5484d' : C.border}`, borderRadius:8,
                      minWidth: isMobile ? 44 : 38, height: isMobile ? 44 : 38, cursor:'pointer', fontSize: recording ? 11 : 17, flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding: recording ? '0 8px' : 0,
                      color:'#fff', fontWeight:800, animation: recording ? 'pulse 1.2s infinite' : 'none' }}>
                    {recording ? `■ ${recClock}` : '🎙️'}
                  </button>
                )}
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                  placeholder={isMobile ? 'Message…' : 'Type a message… Enter to send'}
                  style={{ flex:1, background:C.card, border:`1px solid ${C.border}`,
                    borderRadius:20, padding: isMobile ? '12px 16px' : '10px 14px', color:C.white, fontSize:14, outline:'none', minWidth:0 }}/>
                <button onClick={sendMessage} disabled={!newMsg.trim()}
                  style={{ background:C.gold, border:'none', borderRadius:20,
                    padding: isMobile ? '12px 20px' : '10px 20px',
                    fontWeight:800, color:C.black, fontSize: isMobile ? 16 : 13, cursor:'pointer',
                    opacity:newMsg.trim()?1:0.4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isMobile ? '↑' : 'Send'}
                </button>
              </div>
            )}
            {/* Coach on demo thread — reply placeholder */}
            {myRole === 'coach' && !isLive && (
              <div style={{ padding:'10px 16px', background:C.surface, borderTop:`1px solid ${C.border}`,
                display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:20,
                  padding:'10px 14px', fontSize:12, color:C.muted }}>
                  Live replies available once {activeConvo.name.split(' ')[0]} has a Supabase account
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FILES ─────────────────────────────────────────────── */}
        {tab === 'files' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
              display:'flex', gap:8, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
              <input type="file" ref={fileRef} onChange={handleUpload} style={{ display:'none' }}
                accept="image/*,.pdf,.doc,.docx"/>
              {isLive && (
                <button onClick={() => fileRef.current?.click()}
                  style={{ background:C.gold, border:'none', borderRadius:8, padding:'8px 16px',
                    fontWeight:700, color:C.black, fontSize:12, cursor:'pointer' }}>
                  ⬆ Upload
                </button>
              )}
              <span style={{ fontSize:11, color:C.muted }}>
                {isLive ? 'Photos, PDFs, lab results' : 'File sharing available on live accounts'}
              </span>
            </div>
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`,
              display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
              {[['all','All'],['images','📷 Photos'],['documents','📄 Docs'],['labs','🧪 Labs']].map(([k,l]) => (
                <button key={k} onClick={() => setFileTab(k)}
                  style={{ padding:'5px 12px', borderRadius:6,
                    border:`1px solid ${fileTab===k?C.gold:C.border}`,
                    background:fileTab===k?`${C.gold}20`:C.card,
                    color:fileTab===k?C.gold:C.muted,
                    fontSize:11, fontWeight:fileTab===k?700:400, cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {shownFiles.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                  {isLive ? 'No files yet. Upload above or send in chat.' : 'No files in demo preview.'}
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fill,minmax(${isMobile?130:150}px,1fr))`, gap:10 }}>
                  {shownFiles.map(f => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                      style={{ display:'block', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', textDecoration:'none' }}>
                      {f.file_type === 'image'
                        ? <img src={f.file_url} alt={f.file_name} style={{ width:'100%', height:100, objectFit:'cover', display:'block' }}/>
                        : <div style={{ height:70, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, background:C.surface }}>{fileIcon(f.file_name)}</div>
                      }
                      <div style={{ padding:'7px 9px' }}>
                        <div style={{ fontSize:11, color:C.white, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.file_name}</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{formatBytes(f.file_size)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        </>)}
        {/* end activeConvo guard */}
      </div>
      </div>
      )}
    </div>
  )
}
