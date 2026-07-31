// ═══════════════════════════════════════════════════════════════
// Week7.jsx — Team Hub (Chat · Booking · Calendar · Huddle · Wearables)
// Coach-only — clients blocked in App.jsx and by safety guard here
//
// In App.jsx:
//   import Week7 from './components/Week7'
//   {tab === 'team' && <Week7 currentUser={currentUser} />}
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'
import Communities from './Communities'
import MentionInput from './MentionInput'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => window.innerWidth < bp)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const DAILY_DOMAIN = 'edencommunications'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach', role:'coach',       orgId:'b0000000-0000-0000-0000-000000000001' },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',   role:'super_admin', orgId:'b0000000-0000-0000-0000-000000000001' },
}

const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'

// Demo roster removed — the team list loads live from the database.
const DEMO_COACHES = []

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}

const H = {
  'apikey': SUPABASE_ANON,
  get Authorization(){ return sbBearer() },
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

async function dbGet(table, params='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:H })
  if (!r.ok) return []
  return r.json()
}
async function dbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) { console.error('INSERT', table, await r.text()); return null }
  const t = await r.text(); return t ? JSON.parse(t) : null
}
async function dbUpdate(table, params, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) console.error('UPDATE', table, await r.text())
  return r.ok
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago'
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago'
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'})
}

function Card({children, sx={}}) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// LEFT NAV SIDEBAR ITEM
// ════════════════════════════════════════════════════════════════
function NavItem({ icon, label, active, onClick, badge }) {
  const isMobile = window.innerWidth < 768;
  return (
    <button onClick={onClick} style={{
      width: isMobile ? 'auto' : '100%', 
      flex: isMobile ? 1 : 'none',
      display:'flex', 
      flexDirection: isMobile ? 'row' : 'column', 
      justifyContent: 'center',
      alignItems:'center',
      gap:4, padding: isMobile ? '8px 12px' : '12px 6px', background:'none', border:'none',
      borderLeft: isMobile ? 'none' : `3px solid ${active ? C.gold : 'transparent'}`,
      borderBottom: isMobile ? `3px solid ${active ? C.gold : 'transparent'}` : 'none',
      cursor:'pointer', position:'relative', transition:'background .15s',
      backgroundColor: active ? `${C.gold}12` : 'transparent',
    }}>
      <span style={{fontSize:18, lineHeight:1}}>{icon}</span>
      <span style={{fontSize:9, fontWeight:active?700:500, color:active?C.gold:C.muted, textAlign:'center', lineHeight:1.2, letterSpacing:.2}}>
        {label}
      </span>
      {badge && (
        <span style={{position:'absolute', top:8, right:10, width:8, height:8, borderRadius:4, background:C.success, border:`2px solid ${C.black}`}}/>
      )}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function Week7({ currentUser }) {
  const isMobile = useIsMobile()
  const email  = currentUser?.email || ''
  const info   = KNOWN_USERS[email] || { role:currentUser?.role||'coach', name:currentUser?.name||'User', uuid:null, orgId:EDEN_ORG_ID }
  const [self, setSelf] = useState(info)
  const myUUID = self.uuid
  const myName = self.name
  const myRole = self.role
  const orgId  = self.orgId || EDEN_ORG_ID

  // Team roster from DB (coaches, head coaches, VAs, admins) — falls back to demo list
  const [team, setTeam] = useState(DEMO_COACHES)
  useEffect(()=>{
    // Resolve own profile from DB when not in the hardcoded map (VAs, new staff…)
    if (!info.uuid && email) {
      dbGet('user_profiles', `email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role,company_id`)
        .then(rows=>{
          const me = rows?.[0]
          if (me) setSelf({ uuid:me.id, name:me.name||me.full_name||currentUser?.name||'User', role:me.role, orgId:me.company_id||EDEN_ORG_ID })
        }).catch(()=>{})
    }
    dbGet('user_profiles', `role=neq.client&is_active=not.is.false&select=id,name,full_name,role&order=name.asc.nullslast`)
      .then(rows=>{
        if (!Array.isArray(rows)||!rows.length) return
        const seen = new Set()
        setTeam(rows.filter(r=>{ if(seen.has(r.id)) return false; seen.add(r.id); return true })
          .map(r=>({ uuid:r.id, name:r.name||r.full_name||'Team member', role:r.role, isHeadCoach:r.role==='head_coach' })))
      }).catch(()=>{})
  }, []) // eslint-disable-line

  // Safety block — clients must never reach this
  if (myRole === 'client') {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:C.black}}>
        <div style={{textAlign:'center',color:C.muted,fontSize:13}}>This area is not available.</div>
      </div>
    )
  }

  // ── Section tab ────────────────────────────────────────────
  const [section, setSection] = useState('chat') // chat | calendar | huddle

  // ── Team Chat state ────────────────────────────────────────
  // Demo seed messages removed — team chat loads live from the database.
  const [messages, setMessages] = useState([])
  const [threadReplies, setThreadReplies] = useState({})
  const [newMessage,   setNewMessage]   = useState('')

  // ── Live team chat: load real messages from the DB (demo rows stay as fallback) ──
  const liveLoadedRef = useRef(false)
  async function loadTeamChat() {
    try {
      const rows = await dbGet('team_messages', `org_id=eq.${orgId}&order=created_at.asc&limit=500`)
      if (!Array.isArray(rows) || !rows.length) return
      liveLoadedRef.current = true
      const roots = [], reps = {}, dms = {}
      for (const r of rows) {
        const m = { id:r.id, senderId:r.sender_id, senderName:r.sender_name, senderRole:r.sender_role,
          content:r.content, createdAt:r.created_at, isDm:!!r.is_dm, threadId:r.thread_id,
          deletedAt:r.deleted_at, deletedByName:r.deleted_by_name, replyCount:0 }
        if (r.is_dm) {
          if (r.sender_id===myUUID || r.dm_to_id===myUUID) {
            const key = [r.sender_id, r.dm_to_id].sort().join('_')
            ;(dms[key] ||= []).push(m)
          }
        } else if (r.thread_id) {
          ;(reps[r.thread_id] ||= []).push(m)
        } else {
          roots.push(m)
        }
      }
      for (const m of roots) m.replyCount = (reps[m.id]||[]).length
      setMessages(roots)
      setThreadReplies(reps)
      setDmMessages(prev => ({ ...prev, ...dms }))
    } catch {}
  }
  useEffect(() => {
    if (!orgId) return
    loadTeamChat()
    const iv = setInterval(loadTeamChat, 8000)
    return () => clearInterval(iv)
  }, [orgId, myUUID])

  // ── @Mentions: parse against the team roster and notify tagged people ──
  function findMentions(text) {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hits = []
    for (const t of team) {
      if (t.uuid===myUUID || !t.name) continue
      const first = t.name.split(' ')[0]
      const re = new RegExp(`@(${esc(t.name)}|${esc(first)})(\\b|$)`, 'i')
      if (re.test(text)) hits.push(t)
    }
    return hits
  }
  function notifyMentions(text, where) {
    for (const t of findMentions(text)) {
      dbInsert('notifications', {
        recipient_id: t.uuid, sender_id: myUUID, sender_name: myName,
        type: 'mention', body: `💬 ${myName} tagged you in ${where}: "${text.slice(0,80)}"`,
        is_read: false,
      })
    }
  }
  // Render message text with highlighted @mentions
  function renderMentions(text, baseColor) {
    const parts = String(text||'').split(/(@[A-Za-z][A-Za-z'-]*(?:\s[A-Z][A-Za-z'-]*)?)/g)
    return parts.map((p,i) => p.startsWith('@')
      ? <span key={i} style={{color:C.gold,fontWeight:700}}>{p}</span>
      : <span key={i} style={{color:baseColor}}>{p}</span>)
  }

  // ── Delete rules: admin deletes anything; everyone else only their own ──
  const isAdminRole = myRole==='super_admin' || myRole==='company_admin'
  function canDeleteTeamMsg(m) { return typeof m.id==='string' && m.id.length===36 && (isAdminRole || m.senderId===myUUID) }
  async function deleteTeamMsg(m) {
    if (!window.confirm('Delete this message for everyone?\nIt stays permanently visible in the admin audit log.')) return
    const ok = await dbUpdate('team_messages', `id=eq.${m.id}`, { deleted_at:new Date().toISOString(), deleted_by:myUUID, deleted_by_name:myName })
    if (!ok) { alert('Could not delete — run the database update first.'); return }
    dbInsert('audit_logs', { action:'message_deleted', actor_id:myUUID, actor_name:myName, actor_role:myRole,
      target_type:'team_message', target_id:String(m.id),
      details:{ content:m.content, sender_id:m.senderId, sender_name:m.senderName, context:'team_hub', org_id:orgId } })
    loadTeamChat()
  }
  const [activeThread, setActiveThread] = useState(null)
  const [newReply,     setNewReply]     = useState('')
  const [dmTarget,     setDmTarget]     = useState(null)
  const [dmMessages,   setDmMessages]   = useState({})
  const [newDm,        setNewDm]        = useState('')
  const [chatView,     setChatView]     = useState('main') // main | thread | dm
  const [showDmPicker, setShowDmPicker] = useState(false)
  const bottomRef   = useRef(null)
  const dmBottomRef = useRef(null)

  // ── My Calendar (Google Calendar embed) ───────────────────
  const [calendarUrl, setCalendarUrl] = useState('https://calendar.google.com/calendar/embed?src=lifestyleofeden%40gmail.com&ctz=America%2FChicago')
  const [editingCal,  setEditingCal]  = useState(false)
  const [tempCalUrl,  setTempCalUrl]  = useState('')
  const [calSaved,    setCalSaved]    = useState(false)

  // ── Huddle state ───────────────────────────────────────────
  const [huddleActive,  setHuddleActive]  = useState(false)
  const [huddleRoomUrl, setHuddleRoomUrl] = useState('')
  const [huddlePinging, setHuddlePinging] = useState(null)
  const [liveHuddle,    setLiveHuddle]    = useState(null) // active huddle row in the org (from DB)
  const [huddleRowId,   setHuddleRowId]   = useState(null) // huddle_rooms row I created
  const startedByMeRef = useRef(false)

  // Watch for a live huddle in the org so teammates see it and can join.
  // Realtime pushes changes instantly; polling stays as a fallback while the
  // websocket channel is not connected (same pattern as admin lifecycle sync).
  useEffect(() => {
    if (!orgId) return
    let stop = false
    async function checkLiveHuddle() {
      try {
        const rows = await dbGet('huddle_rooms',
          `org_id=eq.${orgId}&is_active=eq.true&select=id,room_url,created_by,creator_name,created_at&order=created_at.desc&limit=1`)
        if (stop) return
        let row = Array.isArray(rows) && rows.length ? rows[0] : null
        // Ignore stale rooms — Daily rooms self-expire after 4 hours
        if (row && (Date.now() - new Date(row.created_at).getTime()) >= 4*3600*1000) row = null
        setLiveHuddle(row)
        // If the huddle was ended by whoever started it, close it for joiners too.
        if (!row && !startedByMeRef.current) {
          setHuddleActive(a => { if (a) { setHuddleRoomUrl('') } return false })
        }
      } catch {}
    }
    checkLiveHuddle()
    // Realtime channel on huddle_rooms — INSERT/UPDATE re-checks the live row.
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 5 } } })
    // With RLS on, realtime only delivers rows the subscriber may see — authenticate the channel.
    try { const tok = sbAccessToken(); if (tok) sb.realtime.setAuth(tok) } catch {}
    let realtimeUp = false
    // Only trust realtime once a row event has ACTUALLY arrived — a channel can
    // report SUBSCRIBED even when the table isn't in the supabase_realtime
    // publication, in which case no events are ever delivered.
    let lastEventAt = 0
    let debounce = null
    const scheduleCheck = () => { lastEventAt = Date.now(); clearTimeout(debounce); debounce = setTimeout(checkLiveHuddle, 250) }
    const channel = sb
      .channel('huddle-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'huddle_rooms' }, scheduleCheck)
      .subscribe(status => {
        const wasUp = realtimeUp
        realtimeUp = status === 'SUBSCRIBED'
        // Catch up on anything missed while the channel was down
        if (realtimeUp && !wasUp) checkLiveHuddle()
      })
    // Fallback poll: keeps running until realtime has proven itself with a real
    // event recently; skipped only when the channel is up AND events flow.
    const iv = setInterval(() => {
      const proven = realtimeUp && (Date.now() - lastEventAt) < 60_000
      if (!proven) checkLiveHuddle()
    }, 5000)
    return () => { stop = true; clearTimeout(debounce); clearInterval(iv); sb.removeChannel(channel) }
  }, [orgId])

  // Load saved URLs from Supabase on mount
  useEffect(() => {
    if (myUUID) loadSettings()
  }, [myUUID]) // eslint-disable-line

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
  }, [messages])

  async function loadSettings() {
    const data = await dbGet('coach_settings', `user_id=eq.${myUUID}`)
    if (data?.[0]?.calendar_url)  setCalendarUrl(data[0].calendar_url)
  }

  async function saveCalendarUrl() {
    if (!tempCalUrl.trim()) return
    await fetch(`${SUPABASE_URL}/rest/v1/coach_settings`, {
      method:'POST',
      headers:{...H,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({ user_id:myUUID, org_id:orgId, calendar_url:tempCalUrl.trim(), updated_at:new Date().toISOString() }),
    })
    setCalendarUrl(tempCalUrl.trim())
    setTempCalUrl('')
    setEditingCal(false)
    setCalSaved(true)
    setTimeout(() => setCalSaved(false), 3000)
  }

  // ── Chat helpers ───────────────────────────────────────────
  function sendMessage() {
    if (!newMessage.trim()) return
    const msg = {
      id:'m'+Date.now(), senderId:myUUID, senderName:myName, senderRole:myRole,
      content:newMessage.trim(), replyCount:0, createdAt:new Date().toISOString(), isDm:false,
    }
    setMessages(prev => [...prev, msg])
    setNewMessage('')
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, sender_role:myRole, content:msg.content, is_dm:false })
      .then(() => loadTeamChat())
    notifyMentions(msg.content, 'Team Hub #general')
  }

  function sendReply() {
    if (!newReply.trim() || !activeThread) return
    const reply = {
      id:'r'+Date.now(), senderId:myUUID, senderName:myName, senderRole:myRole,
      content:newReply.trim(), threadId:activeThread.id, createdAt:new Date().toISOString(),
    }
    setThreadReplies(prev => ({ ...prev, [activeThread.id]:[...(prev[activeThread.id]||[]), reply] }))
    setMessages(prev => prev.map(m => m.id===activeThread.id ? {...m, replyCount:(m.replyCount||0)+1} : m))
    setNewReply('')
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, sender_role:myRole, content:reply.content, thread_id:activeThread.id, is_dm:false })
      .then(() => loadTeamChat())
    notifyMentions(reply.content, 'a Team Hub thread')
  }

  function sendDm() {
    if (!newDm.trim() || !dmTarget) return
    const key = [myUUID, dmTarget.uuid].sort().join('_')
    const msg = { id:'dm'+Date.now(), senderId:myUUID, senderName:myName, content:newDm.trim(), createdAt:new Date().toISOString() }
    setDmMessages(prev => ({ ...prev, [key]:[...(prev[key]||[]), msg] }))
    setNewDm('')
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, content:msg.content, is_dm:true, dm_to_id:dmTarget.uuid, dm_to_name:dmTarget.name })
      .then(() => loadTeamChat())
  }

  // ── Huddle helpers ──────────────────────────────────────────
  // Creates a REAL Daily.co room via the API server (rooms self-expire).
  async function startHuddle() {
    try {
      const r = await fetch('/api/huddle/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      })
      const data = await r.json().catch(() => null)
      if (!r.ok || !data?.url) {
        alert(data?.error || 'Could not start the huddle — please try again.')
        return
      }
      setHuddleRoomUrl(data.url)
      setHuddleActive(true)
      startedByMeRef.current = true
      // Clear any stale active rooms of mine, then record the new live room.
      await dbUpdate('huddle_rooms', `org_id=eq.${orgId}&created_by=eq.${myUUID}&is_active=eq.true`, { is_active:false })
      const rows = await dbInsert('huddle_rooms', { org_id:orgId, room_url:data.url, created_by:myUUID, creator_name:myName, is_active:true })
      const row = Array.isArray(rows) ? rows[0] : null
      if (row) { setHuddleRowId(row.id); setLiveHuddle(row) }
    } catch {
      alert('Could not start the huddle — please try again.')
    }
  }

  // Teammate joins the huddle someone else started.
  function joinLiveHuddle() {
    if (!liveHuddle) return
    // Ownership comes from the DB row, so the starter can still End after a page reload
    startedByMeRef.current = liveHuddle.created_by === myUUID
    setHuddleRoomUrl(liveHuddle.room_url)
    setHuddleActive(true)
    setSection('huddle')
  }

  async function endHuddle() {
    setHuddleActive(false)
    setHuddleRoomUrl('')
    setHuddlePinging(null)
    // Only the starter ends it for everyone; joiners just leave locally.
    if (startedByMeRef.current) {
      startedByMeRef.current = false
      if (huddleRowId) await dbUpdate('huddle_rooms', `id=eq.${huddleRowId}`, { is_active:false })
      else await dbUpdate('huddle_rooms', `org_id=eq.${orgId}&created_by=eq.${myUUID}&is_active=eq.true`, { is_active:false })
      setHuddleRowId(null)
      setLiveHuddle(null)
    }
  }

  // Real invite: in-app notification the teammate sees in their bell.
  function pingCoach(coach) {
    setHuddlePinging(coach.name)
    dbInsert('notifications', {
      recipient_id: coach.uuid, sender_id: myUUID, sender_name: myName,
      type: 'huddle_invite',
      body: `🎙 ${myName} invited you to a live huddle — open Team Hub → Huddle and hit Join.`,
      is_read: false,
    })
    setTimeout(() => setHuddlePinging(null), 3000)
    // Real in-app notification (bell) for that coach
    dbInsert('notifications', {
      recipient_id: coach.uuid, sender_id: myUUID, type: 'huddle_ping',
      body: `🎙 ${myName} is inviting you to a live huddle — open Team Hub → Huddle to join`,
      is_read: false, created_at: new Date().toISOString(),
    })
  }

  const dmKey    = dmTarget ? [myUUID, dmTarget.uuid].sort().join('_') : null
  const dmConvo  = dmKey ? (dmMessages[dmKey] || []) : []
  const otherCoaches = team.filter(c => c.uuid !== myUUID)

  // ─── Sidebar nav items ─────────────────────────────────────
  const NAV = [
    { key:'chat',     icon:'💬', label:'Team Chat'   },
    { key:'communities', icon:'👥', label:'Communities' },
    { key:'calendar', icon:'🗓',  label:'My Calendar' },
    { key:'huddle',   icon:'🎙',  label:'Huddle',     badge: huddleActive || !!liveHuddle },
  ]

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex', flexDirection: isMobile ? 'column' : 'row', height:'100%',background:C.black,overflow: isMobile ? 'auto' : 'hidden'}}>

      {/* ── LEFT NAV SIDEBAR ───────────────────────────────── */}
      <div style={{
        width: isMobile ? '100%' : 72,
        height: isMobile ? 'auto' : '100%',
        background:C.surface,
        borderRight: isMobile ? 'none' : `1px solid ${C.border}`,
        borderBottom: isMobile ? `1px solid ${C.border}` : 'none',
        display:'flex',
        flexDirection: isMobile ? 'row' : 'column',
        flexShrink:0
      }}>
        {/* Brand mark */}
        <div style={{padding: isMobile ? '8px 16px' : '12px 0 8px',textAlign:'center',borderBottom: isMobile ? 'none' : `1px solid ${C.border}`, borderRight: isMobile ? `1px solid ${C.border}` : 'none', flexShrink:0, display:'flex', alignItems:'center'}}>
          <div style={{fontSize:9,fontWeight:800,color:C.gold,letterSpacing:.5,lineHeight:1.3}}>TEAM<br/>HUB</div>
        </div>

        {/* Nav items */}
        <div style={{flex:1,overflowY: isMobile ? 'hidden' : 'auto', overflowX: isMobile ? 'auto' : 'hidden', paddingTop: isMobile ? 0 : 4, display:'flex', flexDirection: isMobile ? 'row' : 'column'}}>
          {NAV.map(n => (
            <NavItem key={n.key} icon={n.icon} label={n.label} active={section===n.key} badge={n.badge} onClick={() => setSection(n.key)}/>
          ))}
        </div>

        {/* Huddle quick indicator */}
        {(huddleActive || liveHuddle) && (
          <div style={{padding:'8px 6px',borderTop:`1px solid ${C.border}`,textAlign:'center'}}>
            <div style={{width:8,height:8,borderRadius:4,background:C.success,margin:'0 auto 3px',animation:'pulse 1.5s infinite'}}/>
            <div style={{fontSize:8,color:C.success,fontWeight:700}}>LIVE</div>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ───────────────────────────────────── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow: isMobile ? 'auto' : 'hidden'}}>

        {/* Live huddle banner — visible to teammates who haven't joined yet */}
        {liveHuddle && !huddleActive && (
          <div style={{background:`${C.success}18`,borderBottom:`1px solid ${C.success}44`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{width:10,height:10,borderRadius:5,background:C.success,animation:'pulse 1.5s infinite'}}/>
            <div style={{flex:1,fontSize:12,color:C.white,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              <b style={{color:C.success}}>Huddle live</b>
              {liveHuddle.creator_name ? ` — started by ${liveHuddle.creator_name}` : ''}
            </div>
            <button onClick={joinLiveHuddle}
              style={{background:C.success,border:'none',borderRadius:8,padding:'6px 16px',color:C.black,fontSize:12,fontWeight:800,cursor:'pointer',flexShrink:0}}>
              Join
            </button>
          </div>
        )}

        <div style={{flex:1,display:'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden'}}>

        {/* ══════════════════════════════════════════════════
            TEAM CHAT
        ══════════════════════════════════════════════════ */}
        {section==='chat' && (
          <div style={{flex:1,display:'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden'}}>

            {/* Chat sidebar — channels + DMs */}
            <div style={{width: isMobile ? '100%' : 196, background:C.surface, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', display:'flex', flexDirection: isMobile ? 'row' : 'column', flexShrink:0, overflowX: isMobile ? 'auto' : 'hidden'}}>
              <div style={{padding:'12px 14px 6px'}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Channels</div>
                <button onClick={() => setChatView('main')}
                  style={{width:'100%',textAlign:'left',background:chatView==='main'?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:chatView==='main'?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:C.muted}}>#</span> general
                </button>
              </div>

              <div style={{padding:'10px 14px 6px'}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  Direct Messages
                  <button onClick={() => setShowDmPicker(true)} style={{background:'none',border:'none',color:C.gold,fontSize:14,cursor:'pointer',padding:0,lineHeight:1}}>+</button>
                </div>
                {otherCoaches.map(coach => {
                  const key = [myUUID, coach.uuid].sort().join('_')
                  const isDmActive = chatView==='dm' && dmTarget?.uuid===coach.uuid
                  return (
                    <button key={coach.uuid} onClick={() => { setDmTarget(coach); setChatView('dm') }}
                      style={{width:'100%',textAlign:'left',background:isDmActive?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:isDmActive?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                      <div style={{width:20,height:20,borderRadius:10,background:`${C.gold}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.gold,flexShrink:0}}>
                        {coach.name[0]}
                      </div>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{coach.name.split(' ')[0]}</span>
                      {coach.isHeadCoach && <span style={{fontSize:8,color:C.gold,fontWeight:700,flexShrink:0}}>HC</span>}
                    </button>
                  )
                })}
              </div>

              {/* Huddle quick start */}
              <div style={{marginTop:'auto',padding:'12px 14px',borderTop:`1px solid ${C.border}`}}>
                <button onClick={() => { if (!huddleActive && liveHuddle) joinLiveHuddle(); else setSection('huddle') }}
                  style={{width:'100%',background:(huddleActive||liveHuddle)?`${C.success}22`:`${C.gold}22`,border:`1px solid ${(huddleActive||liveHuddle)?C.success:C.gold}44`,borderRadius:8,padding:'8px 10px',color:(huddleActive||liveHuddle)?C.success:C.gold,fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                  {huddleActive ? <><span style={{width:8,height:8,borderRadius:4,background:C.success,display:'inline-block'}}/> In Huddle</>
                    : liveHuddle ? <><span style={{width:8,height:8,borderRadius:4,background:C.success,display:'inline-block'}}/> Join Huddle</>
                    : '🎙 Start Huddle'}
                </button>
              </div>
            </div>

            {/* Main channel */}
            {(chatView==='main' || chatView==='thread') && (
              <div style={{flex:1,display:'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden'}}>
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight: isMobile ? '80vh' : 'auto'}}>
                  <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.white}}># general</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>Main channel · {team.length} members</div>
                  </div>

                  <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                    {messages.filter(m => !m.isDm).map(msg => {
                      const isMine = msg.senderId === myUUID
                      return (
                        <div key={msg.id} style={{marginBottom:16,display:'flex',gap:10,alignItems:'flex-start'}}>
                          <div style={{width:34,height:34,borderRadius:8,background:isMine?C.gold:`${C.gold}22`,border:`1px solid ${C.gold}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:isMine?C.black:C.gold,flexShrink:0,marginTop:2}}>
                            {msg.senderName[0]}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                              <span style={{fontSize:13,fontWeight:700,color:isMine?C.gold:C.white}}>{msg.senderName}</span>
                              {msg.senderRole==='super_admin' && <span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'1px 5px',borderRadius:4,fontWeight:700}}>ADMIN</span>}
                              <span style={{fontSize:10,color:C.muted}}>{timeAgo(msg.createdAt)}</span>
                            </div>
                            {msg.deletedAt ? (
                              <div style={{fontSize:12,color:C.muted,fontStyle:'italic',background:'none',borderRadius:8,padding:'10px 12px',border:`1px dashed ${C.border}`}}>
                                {isAdminRole ? <>🗑 Deleted by {msg.deletedByName||'staff'} (admins only): <span style={{fontStyle:'normal'}}>{msg.content}</span></> : <>Message deleted{msg.deletedByName?` by ${msg.deletedByName}`:''}</>}
                              </div>
                            ) : (
                              <div style={{fontSize:13,lineHeight:1.5,background:C.card,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                                {renderMentions(msg.content, C.white)}
                              </div>
                            )}
                            <div style={{display:'flex',gap:8,marginTop:5,alignItems:'center'}}>
                              {!msg.deletedAt && canDeleteTeamMsg(msg) && (
                                <button onClick={() => deleteTeamMsg(msg)} title="Delete (kept in admin audit log)"
                                  style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer',padding:0}}>🗑</button>
                              )}
                              <button onClick={() => { setActiveThread(msg); setChatView('thread') }}
                                style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4,fontWeight:msg.replyCount>0?600:400}}>
                                {msg.replyCount > 0 ? (
                                  <>
                                    <div style={{display:'flex'}}>
                                      {(threadReplies[msg.id]||[]).slice(0,3).map((r,i) => (
                                        <div key={i} style={{width:18,height:18,borderRadius:9,background:`${C.gold}33`,border:`1px solid ${C.black}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:C.gold,marginLeft:i>0?-6:0}}>
                                          {r.senderName[0]}
                                        </div>
                                      ))}
                                    </div>
                                    <span style={{color:C.gold}}>{msg.replyCount} {msg.replyCount===1?'reply':'replies'}</span>
                                  </>
                                ) : (
                                  <span style={{color:C.muted}}>💬 Reply in thread</span>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={bottomRef}/>
                  </div>

                  <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <MentionInput value={newMessage} onChange={setNewMessage} onSubmit={sendMessage}
                        candidates={team.filter(t => t.uuid !== myUUID).map(t => t.name)}
                        colors={C}
                        placeholder="Message #general… tag with @Name (Enter to send)"
                        inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                      <button onClick={sendMessage} disabled={!newMessage.trim()}
                        style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newMessage.trim()?1:.4}}>
                        Send
                      </button>
                    </div>
                  </div>
                </div>

                {/* Thread panel */}
                {activeThread && chatView==='thread' && (
                  <div style={{width: isMobile ? '100%' : 320, borderTop: isMobile ? `1px solid ${C.border}` : 'none', borderLeft: isMobile ? 'none' : `1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow: isMobile ? 'visible' : 'hidden'}}>
                    <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
                      <button onClick={() => setChatView('main')} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.white}}>Thread</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>{(threadReplies[activeThread.id]||[]).length} replies</div>
                      </div>
                    </div>

                    <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                      <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                        <div style={{width:30,height:30,borderRadius:6,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.gold,flexShrink:0}}>
                          {activeThread.senderName[0]}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                            <span style={{fontSize:12,fontWeight:700,color:C.white}}>{activeThread.senderName}</span>
                            <span style={{fontSize:10,color:C.muted}}>{timeAgo(activeThread.createdAt)}</span>
                          </div>
                          <div style={{fontSize:12,color:C.white,lineHeight:1.5}}>{activeThread.content}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{flex:1,overflowY:'auto',padding:'8px 14px'}}>
                      {(threadReplies[activeThread.id]||[]).map(r => {
                        const isMine = r.senderId===myUUID
                        return (
                          <div key={r.id} style={{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start'}}>
                            <div style={{width:28,height:28,borderRadius:6,background:isMine?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:isMine?C.black:C.gold,flexShrink:0}}>
                              {r.senderName[0]}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                                <span style={{fontSize:11,fontWeight:700,color:isMine?C.gold:C.white}}>{r.senderName}</span>
                                <span style={{fontSize:9,color:C.muted}}>{timeAgo(r.createdAt)}</span>
                              </div>
                              {r.deletedAt ? (
                                <div style={{fontSize:11,color:C.muted,fontStyle:'italic',borderRadius:7,padding:'8px 10px',border:`1px dashed ${C.border}`}}>
                                  {isAdminRole ? `🗑 Deleted by ${r.deletedByName||'staff'}: ${r.content||''}` : `Message deleted${r.deletedByName?` by ${r.deletedByName}`:''}`}
                                </div>
                              ) : (
                                <div style={{fontSize:12,lineHeight:1.5,background:C.card,borderRadius:7,padding:'8px 10px',border:`1px solid ${C.border}`}}>{renderMentions(r.content, C.white)}</div>
                              )}
                              {!r.deletedAt && canDeleteTeamMsg(r) && (
                                <button onClick={() => deleteTeamMsg(r)} title="Delete (kept in admin audit log)"
                                  style={{background:'none',border:'none',color:C.muted,fontSize:10,cursor:'pointer',padding:'2px 0 0'}}>🗑 delete</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{padding:'10px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                      <div style={{display:'flex',gap:8}}>
                        <MentionInput value={newReply} onChange={setNewReply} onSubmit={sendReply}
                          candidates={team.filter(t => t.uuid !== myUUID).map(t => t.name)}
                          colors={C}
                          placeholder="Reply in thread…"
                          inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                        <button onClick={sendReply} disabled={!newReply.trim()}
                          style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 12px',fontWeight:800,color:C.black,fontSize:12,cursor:'pointer',opacity:newReply.trim()?1:.4}}>
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DM view */}
            {chatView==='dm' && dmTarget && (
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight: isMobile ? '80vh' : 'auto'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                  <button onClick={() => setChatView('main')} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                  <div style={{width:30,height:30,borderRadius:15,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.gold,flexShrink:0}}>
                    {dmTarget.name[0]}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white}}>{dmTarget.name}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                      {dmTarget.role}{dmTarget.isHeadCoach?' · Head Coach':''}
                    </div>
                  </div>
                  <button onClick={() => { setSection('huddle'); startHuddle() }}
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    🎙 Huddle
                  </button>
                </div>

                <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                  {dmConvo.length===0 && (
                    <div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>
                      Start your conversation with {dmTarget.name}
                    </div>
                  )}
                  {dmConvo.map(msg => {
                    const isMine = msg.senderId===myUUID
                    return (
                      <div key={msg.id} style={{display:'flex',justifyContent:isMine?'flex-end':'flex-start',marginBottom:10}}>
                        <div style={{maxWidth:'72%'}}>
                          <div style={{background:isMine?C.gold:C.card,border:isMine?'none':`1px solid ${C.border}`,borderRadius:12,padding:'10px 13px'}}>
                            <div style={{fontSize:13,color:isMine?C.black:C.white,lineHeight:1.5}}>{msg.content}</div>
                          </div>
                          <div style={{fontSize:10,color:C.muted,marginTop:3,textAlign:isMine?'right':'left'}}>{timeAgo(msg.createdAt)}</div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={dmBottomRef}/>
                </div>

                <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',gap:8}}>
                  <MentionInput value={newDm} onChange={setNewDm} onSubmit={sendDm}
                    candidates={[dmTarget.name]}
                    colors={C}
                    placeholder={`Message ${dmTarget.name.split(' ')[0]}…`}
                    inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                  <button onClick={sendDm} disabled={!newDm.trim()}
                    style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newDm.trim()?1:.4}}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            MY CALENDAR — coach's personal Google Calendar
        ══════════════════════════════════════════════════ */}
        {section==='communities' && (
          <div style={{flex:1, overflow:'hidden'}}>
            <Communities me={{ id: myUUID, name: myName, role: myRole }} companyId={orgId} context="team" isMobile={isMobile}/>
          </div>
        )}

        {section==='calendar' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight: isMobile ? '80vh' : 'auto'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.white}}>🗓 My Calendar</div>
                <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                  Your personal Google Calendar — team meetings, client calls, schedule
                </div>
              </div>

              {!editingCal ? (
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  {calSaved && <span style={{fontSize:10,color:C.success,fontWeight:700}}>✓ Saved</span>}
                  <button onClick={() => { setEditingCal(true); setTempCalUrl(calendarUrl) }}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 12px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                    ✏️ Update Calendar URL
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input value={tempCalUrl} onChange={e => setTempCalUrl(e.target.value)}
                    placeholder="Paste Google Calendar embed URL…"
                    style={{width: isMobile ? '100%' : 280,background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',color:C.white,fontSize:11,outline:'none'}}/>
                  <button onClick={saveCalendarUrl}
                    style={{background:C.gold,border:'none',borderRadius:7,padding:'6px 12px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>
                    Save
                  </button>
                  <button onClick={() => { setEditingCal(false); setTempCalUrl('') }}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {!calendarUrl && (
              <div style={{margin:16,background:`${C.gold}12`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>How to add your Google Calendar</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
                  1. Go to calendar.google.com<br/>
                  2. Click the ⚙️ Settings gear → Settings<br/>
                  3. Click your calendar name on the left<br/>
                  4. Scroll down to "Integrate calendar"<br/>
                  5. Copy the "Public URL to this calendar" link<br/>
                  6. Paste it above and click Save
                </div>
              </div>
            )}

            {calendarUrl && (
              <div style={{flex:1,overflow:'hidden',position:'relative'}}>
                <iframe
                  src={calendarUrl}
                  style={{width:'100%',height:'100%',border:'none'}}
                  title="My Google Calendar"
                  allow="camera; microphone; autoplay; encrypted-media"
                />
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            HUDDLE
        ══════════════════════════════════════════════════ */}
        {section==='huddle' && (
          <div style={{flex:1,overflowY:'auto',padding:16}}>
            {!huddleActive ? (
              <>
                {/* A teammate's huddle is live — join it */}
                {liveHuddle && (
                  <div style={{background:`${C.success}15`,border:`1px solid ${C.success}44`,borderRadius:12,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <div style={{width:12,height:12,borderRadius:6,background:C.success,animation:'pulse 1.5s infinite',flexShrink:0}}/>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.success}}>Huddle live now</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>Started by {liveHuddle.creator_name || 'a teammate'} · {timeAgo(liveHuddle.created_at)}</div>
                    </div>
                    <button onClick={joinLiveHuddle}
                      style={{background:C.success,border:'none',borderRadius:8,padding:'8px 18px',color:C.black,fontSize:12,fontWeight:800,cursor:'pointer'}}>
                      Join Huddle
                    </button>
                  </div>
                )}
                <div style={{textAlign:'center',padding:'40px 20px'}}>
                  <div style={{fontSize:48,marginBottom:16}}>🎙</div>
                  {liveHuddle ? (
                    <>
                      <div style={{fontSize:18,fontWeight:700,color:C.success,marginBottom:8}}>Huddle in progress</div>
                      <div style={{fontSize:13,color:C.muted,maxWidth:320,margin:'0 auto 24px',lineHeight:1.6}}>
                        {liveHuddle.creator_name || 'A teammate'} started a live huddle. Jump in!
                      </div>
                      <button onClick={joinLiveHuddle}
                        style={{background:C.success,border:'none',borderRadius:12,padding:'14px 32px',fontWeight:800,color:C.black,fontSize:16,cursor:'pointer'}}>
                        Join Huddle
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{fontSize:18,fontWeight:700,color:C.white,marginBottom:8}}>Start a Huddle</div>
                      <div style={{fontSize:13,color:C.muted,maxWidth:320,margin:'0 auto 24px',lineHeight:1.6}}>
                        Instant face-to-face call with your team. One click to start, one click to join.
                      </div>
                      <button onClick={startHuddle}
                        style={{background:C.gold,border:'none',borderRadius:12,padding:'14px 32px',fontWeight:800,color:C.black,fontSize:16,cursor:'pointer'}}>
                        🎙 Start Huddle Now
                      </button>
                    </>
                  )}
                </div>

                <Card sx={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:12}}>Your Team</div>
                  {otherCoaches.map(coach => (
                    <div key={coach.uuid} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                      <div style={{width:36,height:36,borderRadius:18,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>
                        {coach.name[0]}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:C.white,fontWeight:500}}>{coach.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                          {coach.role}{coach.isHeadCoach?' · Head Coach':''}
                        </div>
                      </div>
                      <button onClick={async () => { if (liveHuddle) { pingCoach(coach) } else { await startHuddle(); pingCoach(coach) } }}
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        {huddlePinging===coach.name?'Invited ✓':'Invite'}
                      </button>
                    </div>
                  ))}
                </Card>
              </>
            ) : (
              <>
                <div style={{background:`${C.success}15`,border:`1px solid ${C.success}44`,borderRadius:12,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:12,height:12,borderRadius:6,background:C.success,animation:'pulse 1.5s infinite'}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.success}}>Huddle Active</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>You are in a live huddle room</div>
                  </div>
                  <button
                    onClick={() => window.open(huddleRoomUrl, 'eden-huddle', 'width=980,height=680,noopener')}
                    title="Open the call in its own window so you can move around the app while staying on the call"
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer',marginRight:8}}>
                    ↗ Pop Out Call
                  </button>
                  <button onClick={endHuddle}
                    style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:8,padding:'6px 14px',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    {startedByMeRef.current ? 'End Huddle' : 'Leave Huddle'}
                  </button>
                </div>

                <Card sx={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:12}}>Invite to Huddle</div>
                  {otherCoaches.map(coach => (
                    <div key={coach.uuid} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderTop:`1px solid ${C.border}`}}>
                      <div style={{width:32,height:32,borderRadius:16,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.gold,flexShrink:0}}>
                        {coach.name[0]}
                      </div>
                      <div style={{flex:1,fontSize:12,color:C.white}}>{coach.name}</div>
                      <button onClick={() => pingCoach(coach)}
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'5px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        {huddlePinging===coach.name?'Invited ✓':'Ping to Join'}
                      </button>
                    </div>
                  ))}
                </Card>

                <Card sx={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Video Call Room</div>
                  <div style={{background:C.surface,borderRadius:10,overflow:'hidden',position:'relative',paddingTop:'56.25%'}}>
                    <iframe src={huddleRoomUrl}
                      allowFullScreen
                      style={{position:'absolute',inset:0,width:'100%',height:'100%',border:'none'}}
                      allow="camera; microphone; autoplay; fullscreen; display-capture; clipboard-write"
                      title="Huddle Room"/>
                  </div>
                  <div style={{marginTop:10,fontSize:10,color:C.muted,textAlign:'center'}}>
                    Room link: <span style={{color:C.gold}}>{huddleRoomUrl}</span>
                    <br/>Tip: use <span style={{color:C.gold}}>↗ Pop Out Call</span> above to keep the call going while you move around the app (e.g. to show labs while screen sharing).
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        </div>
      </div>

      {/* ── DM Picker Modal ──────────────────────────────────── */}
      {showDmPicker && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e => { if(e.target===e.currentTarget) setShowDmPicker(false) }}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,width:'100%',maxWidth:360,padding:20}}>
            <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:14}}>Start a Direct Message</div>
            {otherCoaches.map(coach => (
              <button key={coach.uuid}
                onClick={() => { setDmTarget(coach); setChatView('dm'); setShowDmPicker(false) }}
                style={{width:'100%',textAlign:'left',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:18,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>
                  {coach.name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:C.white,fontWeight:500}}>{coach.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                    {coach.role}{coach.isHeadCoach?' · Head Coach':''}
                  </div>
                </div>
                <span style={{fontSize:12,color:C.gold}}>→</span>
              </button>
            ))}
            <button onClick={() => setShowDmPicker(false)}
              style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer',marginTop:4}}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
