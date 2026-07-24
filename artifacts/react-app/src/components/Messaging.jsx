// ═══════════════════════════════════════════════════════════════
// Messaging.jsx — Multi-client conversation list
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'

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
const JORDAN_CONVO_ID = 'e8499d22-acde-4528-8403-39ffece7b9c5'

const KNOWN_USERS = {
  'coach@eden.io':       { uuid: '414b1fb3-f38c-4480-bdb2-fe7b1d844051', name: 'Coach Marcus', role: 'coach' },
  'client@eden.io':      { uuid: 'ece58b33-3f2a-4ce7-bed9-a157c914056c', name: 'Jordan Williams', role: 'client' },
  'admin@edencomms.io':  { uuid: null, name: 'Eden Admin', role: 'super_admin' },
}

// ── Brand colors ──────────────────────────────────────────────
const C = {
  gold: '#ffa600', black: '#000000', white: '#ffffff',
  surface: '#111111', card: '#1a1a1a', border: '#2a2a2a',
  muted: '#888888', success: '#4FD89A', danger: '#ff4444',
}

// ── Admin conversation (client → admin thread) ─────────────────
const ADMIN_CONVO = {
  id: 'admin',
  name: 'Eden Admin',
  initials: 'EA',
  supabaseConvoId: null,
  lastMessage: 'Feel free to message us for anything account-related.',
  lastTime: '3d ago',
  unread: 1,
  online: true,
  thread: [
    { id:1, from:'coach', text:"Welcome to Eden Communications, Jordan! I'm the Eden admin. For anything outside your coaching sessions — account questions, billing, technical issues — I'm your contact here.", time:'Mon 8:00 AM' },
    { id:2, from:'client', text:"Thank you! Great to be here.", time:'Mon 8:05 AM' },
    { id:3, from:'coach', text:"Glad to have you 🙏 Coach Marcus handles everything health and protocol. I'm here for the rest. Don't hesitate to reach out anytime.", time:'Mon 8:07 AM' },
  ],
}

// ── Coach conversation as seen by the CLIENT (labels flipped) ──
// Clients see "Coach Marcus" in the thread, not their own name.
const CLIENT_COACH_CONVO = {
  id: 'jordan',
  name: 'Coach Marcus',
  initials: 'CM',
  supabaseConvoId: JORDAN_CONVO_ID,
  lastMessage: "Thank you! I'll start the new protocol tomorrow 🙏",
  lastTime: '2h ago',
  unread: 2,
  online: true,
  thread: [
    { id:1, from:'coach', text:"Hey Jordan! Just reviewed your check-in. Great numbers this week — weight is trending in the right direction.", time:'Mon 9:14 AM' },
    { id:2, from:'client', text:"Thank you so much! I've been really consistent with the supplements.", time:'Mon 9:22 AM' },
    { id:3, from:'coach', text:"It shows. Your energy score jumped from a 5 to a 7. Sleep is improving too. Keep that same sleep window this week.", time:'Mon 9:31 AM' },
    { id:4, from:'client', text:"Will do. One question — should I take the Cort Eaze every day or just on high-stress days?", time:'Mon 11:05 AM' },
    { id:5, from:'coach', text:"High-stress days only. If you're waking up and already feel calm and your HRV is solid, skip it.", time:'Mon 11:18 AM' },
    { id:6, from:'client', text:"Got it! That makes sense.", time:'Mon 11:19 AM' },
    { id:7, from:'coach', text:"Also — I'm updating your protocol with a new magnesium dose. You'll see it in the Diet & Supps tab. Take it 30 min before bed.", time:'Tue 8:02 AM' },
    { id:8, from:'client', text:"Okay I saw it! Do I take both the glycinate and the threonate or just one?", time:'Tue 8:45 AM' },
    { id:9, from:'coach', text:"Just the glycinate for now. We'll add threonate in 4 weeks once your sleep baseline stabilizes.", time:'Tue 9:00 AM' },
    { id:10, from:'client', text:"Thank you! I'll start the new protocol tomorrow 🙏", time:'Tue 9:03 AM' },
  ],
}

// ── Demo conversations for all 4 clients (coach view) ─────────
const DEMO_CLIENTS = [
  {
    id: 'jordan',
    name: 'Jordan Williams',
    initials: 'JW',
    supabaseConvoId: JORDAN_CONVO_ID,
    lastMessage: "Thank you! I'll start the new protocol tomorrow 🙏",
    lastTime: '2h ago',
    unread: 2,
    online: true,
    thread: [
      { id:1, from:'coach', text:"Hey Jordan! Just reviewed your check-in. Great numbers this week — weight is trending in the right direction.", time:'Mon 9:14 AM' },
      { id:2, from:'client', text:"Thank you so much! I've been really consistent with the supplements.", time:'Mon 9:22 AM' },
      { id:3, from:'coach', text:"It shows. Your energy score jumped from a 5 to a 7. Sleep is improving too. Keep that same sleep window this week.", time:'Mon 9:31 AM' },
      { id:4, from:'client', text:"Will do. One question — should I take the Cort Eaze every day or just on high-stress days?", time:'Mon 11:05 AM' },
      { id:5, from:'coach', text:"High-stress days only. If you're waking up and already feel calm and your HRV is solid, skip it.", time:'Mon 11:18 AM' },
      { id:6, from:'client', text:"Got it! That makes sense.", time:'Mon 11:19 AM' },
      { id:7, from:'coach', text:"Also — I'm updating your protocol with a new magnesium dose. You'll see it in the Diet & Supps tab. Take it 30 min before bed.", time:'Tue 8:02 AM' },
      { id:8, from:'client', text:"Okay I saw it! Do I take both the glycinate and the threonate or just one?", time:'Tue 8:45 AM' },
      { id:9, from:'coach', text:"Just the glycinate for now. We'll add threonate in 4 weeks once your sleep baseline stabilizes.", time:'Tue 9:00 AM' },
      { id:10, from:'client', text:"Thank you! I'll start the new protocol tomorrow 🙏", time:'Tue 9:03 AM' },
    ],
  },
  {
    id: 'alex',
    name: 'Alex Carter',
    initials: 'AC',
    supabaseConvoId: null,
    lastMessage: "My weight was 184.2 this morning",
    lastTime: 'Yesterday',
    unread: 0,
    online: false,
    thread: [
      { id:1, from:'coach', text:"Alex, big week ahead. I want you hitting 9,000 steps minimum every day. Non-negotiable.", time:'Sun 7:30 AM' },
      { id:2, from:'client', text:"Understood coach. Sunday long walk done — 11,400 steps ✅", time:'Sun 8:14 PM' },
      { id:3, from:'coach', text:"That's what I'm talking about. How's the hunger been on the new macros?", time:'Mon 8:00 AM' },
      { id:4, from:'client', text:"Honestly not bad. I was worried about the calorie drop but I feel full most of the time.", time:'Mon 12:30 PM' },
      { id:5, from:'coach', text:"Good. That's the protein doing its job. Hit 200g protein today.", time:'Mon 12:35 PM' },
      { id:6, from:'client', text:"On it. I meal prepped last night so I'm set.", time:'Mon 12:36 PM' },
      { id:7, from:'coach', text:"Check-in is Wednesday. Make sure you're fasted when you weigh in. Same conditions every week.", time:'Tue 7:45 AM' },
      { id:8, from:'client', text:"My weight was 184.2 this morning", time:'Tue 6:58 AM' },
    ],
  },
  {
    id: 'taylor',
    name: 'Taylor Brooks',
    initials: 'TB',
    supabaseConvoId: null,
    lastMessage: "Feeling way better this week! Energy is up 💪",
    lastTime: '2 days ago',
    unread: 1,
    online: false,
    thread: [
      { id:1, from:'client', text:"Coach Marcus, I wanted to let you know I finally got my blood work done. Sending the PDF now.", time:'Sat 10:02 AM' },
      { id:2, from:'coach', text:"Perfect. I'll review it this weekend and update your protocol. Anything stand out to you?", time:'Sat 10:30 AM' },
      { id:3, from:'client', text:"My ferritin came back low again. 14. Same as last year.", time:'Sat 10:44 AM' },
      { id:4, from:'coach', text:"Okay. We're going to address this directly. I'm adding iron bisglycinate to your protocol. Take it with vitamin C, away from your thyroid meds.", time:'Sat 11:00 AM' },
      { id:5, from:'client', text:"Got it. Will that help with the fatigue?", time:'Sat 11:15 AM' },
      { id:6, from:'coach', text:"Significantly. Low ferritin is one of the top reasons women plateau even when doing everything right. This is a big piece.", time:'Sat 11:22 AM' },
      { id:7, from:'client', text:"That's actually really validating to hear. I've felt like something was off for months.", time:'Sat 11:30 AM' },
      { id:8, from:'coach', text:"Your body was telling you something. Now we listen to it. Give it 6–8 weeks with consistent dosing.", time:'Sat 11:45 AM' },
      { id:9, from:'client', text:"Feeling way better this week! Energy is up 💪", time:'Mon 7:11 PM' },
    ],
  },
  {
    id: 'sam',
    name: 'Sam Rivera',
    initials: 'SR',
    supabaseConvoId: null,
    lastMessage: "Quick question about the Cort Eaze timing...",
    lastTime: '3 days ago',
    unread: 1,
    online: false,
    thread: [
      { id:1, from:'coach', text:"Sam — I reviewed your check-in. Stress scores are elevated three weeks in a row. What's going on outside the protocol?", time:'Fri 9:00 AM' },
      { id:2, from:'client', text:"Work has been brutal. Project deadline, late nights, the whole thing.", time:'Fri 9:42 AM' },
      { id:3, from:'coach', text:"Got it. That explains the sleep disruption and the hunger spike too. Your body is in fight-or-flight. We need to work with that, not against it.", time:'Fri 10:00 AM' },
      { id:4, from:'client', text:"What does that look like?", time:'Fri 10:05 AM' },
      { id:5, from:'coach', text:"Three things: 1) No caffeine after 12 PM. 2) 10-minute walk after dinner — non-negotiable. 3) I'm bumping your Ashwagandha dose for the next 2 weeks.", time:'Fri 10:15 AM' },
      { id:6, from:'client', text:"I can do all of that. The walk especially sounds good honestly.", time:'Fri 10:30 AM' },
      { id:7, from:'coach', text:"Good. The goal isn't perfection right now — it's maintenance. Protect your sleep, keep protein up, and let the body recover.", time:'Fri 10:38 AM' },
      { id:8, from:'client', text:"Quick question about the Cort Eaze timing...", time:'Fri 11:00 AM' },
    ],
  },
]

// ── Supabase helpers ──────────────────────────────────────────
const H = {
  'apikey': SUPABASE_ANON,
  'Authorization': `Bearer ${SUPABASE_ANON}`,
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

// ── Demo coaches + clients for broadcast targeting ────────────
const BROADCAST_COACHES = [
  {
    id: '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
    name: 'Coach Marcus',
    clients: [
      { id: 'c-jordan', name: 'Jordan Williams', checkInDay: 'Wednesday' },
      { id: 'c-alex',   name: 'Alex Carter',     checkInDay: 'Wednesday' },
      { id: 'c-taylor', name: 'Taylor Reyes',    checkInDay: 'Friday'    },
      { id: 'c-sam',    name: 'Sam Thompson',    checkInDay: 'Monday'    },
    ],
  },
]

// ── Broadcast Composer ────────────────────────────────────────
function BroadcastComposer({ onClose, senderName }) {
  const [audienceType,    setAudienceType]    = useState('company_wide')
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [selectedDay,     setSelectedDay]     = useState('')
  const [selectedClients, setSelectedClients] = useState(new Set())
  const [message,         setMessage]         = useState('')
  const [sending,         setSending]         = useState(false)
  const [sent,            setSent]            = useState(false)
  const [history,         setHistory]         = useState([])
  const [view,            setView]            = useState('compose') // 'compose' | 'history'

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    try {
      const rows = await dbGet('broadcast_messages', 'order=sent_at.desc&limit=30')
      if (rows) setHistory(rows)
    } catch {}
  }

  const coach = BROADCAST_COACHES.find(c => c.id === selectedCoachId)

  const availableDays = coach
    ? [...new Set(coach.clients.map(c => c.checkInDay))].sort()
    : []

  const filteredClients = (() => {
    if (!coach) return []
    if (audienceType === 'coach_day' && selectedDay)
      return coach.clients.filter(c => c.checkInDay === selectedDay)
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
      case 'coach_day':    return (coach && selectedDay) ? `${coach.name} · ${selectedDay} clients (${filteredClients.length})` : '— pick coach & day —'
      case 'individuals':  return selectedClients.size > 0
        ? `${selectedClients.size} selected: ${[...selectedClients].map(id => coach?.clients.find(c=>c.id===id)?.name).filter(Boolean).join(', ')}`
        : '— pick coach, then select clients —'
      default: return ''
    }
  }

  function isReady() {
    if (!message.trim()) return false
    if (audienceType === 'company_wide' || audienceType === 'coaches_only') return true
    if (!selectedCoachId) return false
    if (audienceType === 'coach_roster') return true
    if (audienceType === 'coach_day') return !!selectedDay
    if (audienceType === 'individuals') return selectedClients.size > 0
    return false
  }

  async function send() {
    if (!isReady()) return
    setSending(true)
    try {
      await dbInsert('broadcast_messages', {
        sent_by_name:  senderName || 'Admin',
        audience_type: audienceType,
        audience_label: audienceLabel(),
        coach_id:      selectedCoachId || null,
        check_in_day:  selectedDay     || null,
        recipient_ids: JSON.stringify([...selectedClients]),
        message:       message.trim(),
        sent_at:       new Date().toISOString(),
      })
      setSent(true)
      await loadHistory()
    } catch {
      alert('Could not save — run the broadcast_messages SQL in Supabase first.')
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setAudienceType('company_wide'); setSelectedCoachId(''); setSelectedDay('')
    setSelectedClients(new Set()); setMessage(''); setSent(false)
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

      {/* ── Sent History ── */}
      {view === 'history' && (
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          {history.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:C.muted }}>No broadcasts sent yet</div>
          ) : history.map((b,i) => (
            <div key={b.id||i} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.gold, background:`${C.gold}18`, border:`1px solid ${C.gold}33`, borderRadius:6, padding:'2px 8px' }}>
                  {b.audience_label || b.audience_type}
                </span>
                <span style={{ fontSize:10, color:C.muted }}>{b.sent_at ? new Date(b.sent_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</span>
              </div>
              <div style={{ fontSize:13, color:C.white, lineHeight:1.5, marginBottom:4 }}>{b.message}</div>
              <div style={{ fontSize:10, color:C.muted }}>Sent by {b.sent_by_name}</div>
            </div>
          ))}
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
                <button key={a.key} onClick={() => { setAudienceType(a.key); setSelectedCoachId(''); setSelectedDay(''); setSelectedClients(new Set()) }}
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
                {BROADCAST_COACHES.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCoachId(c.id); setSelectedDay(''); setSelectedClients(new Set()) }}
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
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>3 · Check-In Day</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {availableDays.map(d => (
                  <button key={d} onClick={() => setSelectedDay(d)}
                    style={{ padding:'8px 16px', borderRadius:20, border:`2px solid ${selectedDay===d ? C.gold : C.border}`,
                      background: selectedDay===d ? `${C.gold}18` : C.card, color: selectedDay===d ? C.gold : C.muted,
                      fontWeight: selectedDay===d ? 700 : 400, fontSize:12, cursor:'pointer' }}>
                    {d}
                    <span style={{ fontSize:10, marginLeft:6, color:C.muted }}>
                      ({coach?.clients.filter(c=>c.checkInDay===d).length})
                    </span>
                  </button>
                ))}
              </div>
              {selectedDay && (
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
                      <div style={{ fontSize:13, fontWeight:600, color: selectedClients.has(cl.id) ? C.gold : C.white }}>{cl.name}</div>
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
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
              {['coach_roster','coach_day','individuals'].includes(audienceType) ? '4' : '2'} · Message
            </div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5}
              placeholder="Type your broadcast message here…"
              style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 14px',
                color:C.white, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.6 }}/>
            <div style={{ textAlign:'right', fontSize:10, color:C.muted, marginTop:4 }}>{message.length} chars</div>
          </div>

          {/* Send button */}
          <button onClick={send} disabled={!isReady() || sending}
            style={{ width:'100%', background: isReady() ? C.gold : '#2a2a2a', border:'none', borderRadius:12,
              padding:'14px', fontWeight:800, color: isReady() ? C.black : C.muted, fontSize:15,
              cursor: isReady() ? 'pointer' : 'not-allowed', marginBottom:16, opacity: sending ? 0.7 : 1 }}>
            {sending ? 'Sending…' : '📢 Send Broadcast'}
          </button>
        </div>
      )}

      {/* ── Success state ── */}
      {view === 'compose' && sent && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:16 }}>
          <div style={{ fontSize:56 }}>✅</div>
          <div style={{ fontSize:18, fontWeight:800, color:C.white }}>Broadcast Sent</div>
          <div style={{ fontSize:13, color:C.muted, textAlign:'center', maxWidth:280, lineHeight:1.6 }}>
            Your message has been delivered to <span style={{ color:C.gold, fontWeight:700 }}>{audienceLabel()}</span>.
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button onClick={reset}
              style={{ background:C.gold, border:'none', borderRadius:10, padding:'12px 24px', fontWeight:800, color:C.black, fontSize:14, cursor:'pointer' }}>
              Send Another
            </button>
            <button onClick={() => setView('history')}
              style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 24px', color:C.muted, fontSize:14, cursor:'pointer' }}>
              View History
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
export default function Messaging({ currentUser, loomMode = false }) {
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

  const isAdmin = myRole === 'super_admin' || myRole === 'company_admin'

  const demoConversations = myRole === 'coach' ? DEMO_CLIENTS : [CLIENT_COACH_CONVO, ADMIN_CONVO]
  const conversations     = dynConversations ?? demoConversations

  // ── Conversation selection ────────────────────────────────
  // null = no conversation open (list-only view)
  const [activeId, setActiveId] = useState(null)
  const activeConvo = activeId ? (conversations.find(c => c.id === activeId) ?? null) : null

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

  // ── Live Supabase messages (Jordan only when connected) ────
  const [liveMessages, setLiveMessages] = useState([])
  const [liveFiles,    setLiveFiles]    = useState([])
  const [newMsg,       setNewMsg]       = useState('')
  const [tab,          setTab]          = useState('chat')
  const [fileTab,      setFileTab]      = useState('all')
  const [uploading,    setUploading]    = useState(false)
  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  const isLive = !!activeConvo?.supabaseConvoId

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
        // Admin: see all users in their company
        const users = await dbGet('user_profiles',
          `company_id=eq.${me.company_id}&id=neq.${me.id}&order=created_at.asc`)
        for (const user of users || []) {
          const convoId = await findOrCreateConvo(me.id, user.id, me.company_id)
          pushConvo(user, convoId)
        }

      } else {
        // Staff (VA, head_coach, etc.) — load all clients from client_access
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
  useEffect(() => {
    setLiveMessages([])
    setLiveFiles([])
    setTab('chat')
    if (isLive) {
      loadLiveMessages()
      loadLiveFiles()
      const iv = setInterval(loadLiveMessages, 4000)
      return () => clearInterval(iv)
    }
  }, [activeId])

  async function loadLiveMessages() {
    if (!activeConvo?.supabaseConvoId) return
    const data = await dbGet('messages', `conversation_id=eq.${activeConvo.supabaseConvoId}&order=created_at.asc`)
    if (data) {
      setLiveMessages(data)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
    }
  }
  async function loadLiveFiles() {
    if (!activeConvo?.supabaseConvoId) return
    const data = await dbGet('conversation_files', `conversation_id=eq.${activeConvo.supabaseConvoId}&order=created_at.desc`)
    if (data) setLiveFiles(data)
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
    loadLiveMessages()
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !myProfileId || !isLive) return
    setUploading(true)
    try {
      const path   = `${activeConvo?.supabaseConvoId}/${Date.now()}-${file.name}`
      const bucket = file.type.startsWith('image/') ? 'chat-media' : 'lab-files'
      const upRes  = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': file.type },
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
  // Live for Jordan (coach+client); demo thread for others
  const displayMessages = isLive ? liveMessages : (activeConvo?.thread ?? [])
  const coachUUID = KNOWN_USERS['coach@eden.io'].uuid
  const clientUUID = KNOWN_USERS['client@eden.io'].uuid

  function isMine(msg) {
    if (isLive) return msg.sender_id === myUUID
    if (myRole === 'coach') return msg.from === 'coach'
    return msg.from === 'client'
  }
  function msgText(msg)  { return isLive ? msg.content  : msg.text }
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
    <div style={{ display:'flex', height:'100%', background:C.black, overflow:'hidden', position:'relative' }}>

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
              {myRole === 'coach' ? `${conversations.length} clients` : isAdmin ? 'All staff & clients' : 'Coach Marcus · Eden Admin'}
            </div>
          </div>
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
        {loomMode && myRole === 'coach' && (
          <div style={{ padding:'6px 12px', background:'#ff525218', borderBottom:`1px solid #ff525433` }}>
            <div style={{ fontSize:10, color:'#ff5252', fontWeight:700 }}>
              🔴 Loom Mode — other clients hidden
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {conversations.map((convo, i) => {
            const isActive  = convo.id === activeId
            // In Loom Mode: active conversation always shows real name;
            // all others are anonymised so they can't be read on camera
            const isHidden  = loomMode && myRole === 'coach' && !isActive
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

        {/* HIPAA footer */}
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.muted, lineHeight:1.6 }}>
            🔒 All messages encrypted · HIPAA compliant
          </div>
        </div>
      </div>

      {/* ── RIGHT CONTENT ─────────────────────────────────────── */}
      <div style={{ flex:1, display: (showChat || (showBroadcast && !isMobile)) ? 'flex' : 'none', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Broadcast Composer — full right panel on desktop, full screen on mobile */}
        {showBroadcast && (
          <BroadcastComposer senderName={myName} onClose={() => setShowBroadcast(false)} />
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
          padding:'0 12px', display:'flex', alignItems:'center', flexShrink:0, gap:8, height:52 }}>
          {/* Back button — mobile only */}
          {/* Back / close button — on mobile shows ← Back, on desktop shows × */}
          {isMobile ? (
            <button onClick={closeConvo}
              style={{ background:'none', border:'none', color:C.white, fontSize:18, cursor:'pointer',
                padding:'4px 8px 4px 0', flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
              ← <span style={{ fontSize:13, fontWeight:600 }}>Back</span>
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
                {activeConvo.online ? '● Online now' : '● Last seen recently'}
              </div>
            </div>
          </div>
          {/* Demo badge for non-Jordan threads */}
          {!isLive && myRole === 'coach' && (
            <span style={{ fontSize:10, background:`${C.gold}22`, color:C.gold,
              border:`1px solid ${C.gold}44`, borderRadius:20, padding:'3px 8px', fontWeight:700, flexShrink:0 }}>
              Demo preview
            </span>
          )}
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

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '12px 10px' : '16px' }}>
              {displayMessages.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                  No messages yet.
                </div>
              )}
              {displayMessages.map((msg, i) => {
                const mine = isMine(msg)
                const type = msgType(msg)
                return (
                  <div key={msg.id || i} style={{ display:'flex', justifyContent:mine?'flex-end':'flex-start', marginBottom:10, alignItems:'flex-end' }}>
                    {!mine && (
                      <div style={{ width:26, height:26, borderRadius:13, background:C.card, border:`1px solid ${C.border}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, color:C.gold, flexShrink:0, marginRight:6 }}>
                        {otherInitial()}
                      </div>
                    )}
                    <div style={{ maxWidth: isMobile ? '82%' : '68%', minWidth:0 }}>
                      <div style={{
                        background: mine ? C.gold : C.card,
                        border: mine ? 'none' : `1px solid ${C.border}`,
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        padding:'9px 13px',
                      }}>
                        {(type === 'text' || !isLive) && (
                          <div style={{ fontSize:13, color:mine?C.black:C.white, lineHeight:1.55, wordBreak:'break-word' }}>
                            {msgText(msg)}
                          </div>
                        )}
                        {isLive && type === 'image' && (
                          <img src={msg.file_url} alt={msg.file_name}
                            style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', cursor:'pointer' }}
                            onClick={() => window.open(msg.file_url,'_blank')}/>
                        )}
                        {isLive && type === 'file' && (
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
                        display:'flex', gap:4, justifyContent:mine?'flex-end':'flex-start' }}>
                        <span>{msgTime(msg)}</span>
                        {mine && isLive && <span style={{ color:msg.is_read?C.success:C.muted }}>{msg.is_read?'✓✓':'✓'}</span>}
                      </div>
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

            {/* Input bar — hidden for demo threads and admin */}
            {myRole !== 'super_admin' && (isLive || myRole === 'client') && (
              <div style={{ padding: isMobile ? '8px 10px 12px' : '10px 14px 14px',
                background:C.surface, borderTop:`1px solid ${C.border}`,
                display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                <input type="file" ref={fileRef} onChange={handleUpload} style={{ display:'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"/>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                    width:38, height:38, cursor:'pointer', fontSize:17, flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {uploading ? '⏳' : '📎'}
                </button>
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                  placeholder={isMobile ? 'Message…' : 'Type a message… Enter to send'}
                  style={{ flex:1, background:C.card, border:`1px solid ${C.border}`,
                    borderRadius:20, padding:'10px 14px', color:C.white, fontSize:13, outline:'none', minWidth:0 }}/>
                <button onClick={sendMessage} disabled={!newMsg.trim()}
                  style={{ background:C.gold, border:'none', borderRadius:20,
                    padding: isMobile ? '10px 14px' : '10px 20px',
                    fontWeight:800, color:C.black, fontSize:13, cursor:'pointer',
                    opacity:newMsg.trim()?1:0.4, flexShrink:0 }}>
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
  )
}
