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
import { supabase } from '../supabaseClient'
import { loadSeen, saveSeen, seenAt } from '../lib/teamUnread'
import Communities from './Communities'
import MentionInput from './MentionInput'
import { useHuddle } from './HuddleHub'

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
export default function Week7({ currentUser, initialDm }) {
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
    // Custom staff titles ("Closer", "Sales Mentor"…) live in admin_settings as staff_meta:<id>
    const metaP = dbGet('admin_settings', `key=like.staff_meta:*&select=key,value`)
      .then(rows => {
        const map = {}
        for (const r of (rows||[])) {
          try {
            const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
            if (v?.label) map[r.key.slice('staff_meta:'.length)] = v.label
          } catch {}
        }
        setStaffLabels(map)
        return map
      }).catch(() => ({}))
    dbGet('user_profiles', `role=neq.client&is_active=not.is.false&select=id,name,full_name,role&order=name.asc.nullslast`)
      .then(async rows=>{
        if (!Array.isArray(rows)||!rows.length) return
        const labels = await metaP
        const seen = new Set()
        setTeam(rows.filter(r=>{ if(seen.has(r.id)) return false; seen.add(r.id); return true })
          .map(r=>({ uuid:r.id, name:r.name||r.full_name||'Team member', role:r.role, label:labels[r.id]||null, isHeadCoach:r.role==='head_coach' })))
      }).catch(()=>{})
  }, []) // eslint-disable-line
  const [staffLabels, setStaffLabels] = useState({})

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

  // ── Realtime: typing hints + instant message delivery ────────
  // Uses a Supabase broadcast channel (no table publication needed).
  // The 8s poll above stays as the fallback per the realtime lesson.
  const [typers, setTypers] = useState({})   // userId -> {name, ctx, until}
  const rtChanRef = useRef(null)
  const lastTypingSentRef = useRef(0)
  useEffect(() => {
    if (!orgId || !myUUID) return
    const ch = supabase.channel(`teamhub-live-${orgId}`)
      .on('broadcast', { event:'typing' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === myUUID) return
        setTypers(prev => {
          if (payload.stop) { if (!prev[payload.userId]) return prev; const n = {...prev}; delete n[payload.userId]; return n }
          return { ...prev, [payload.userId]: { name: payload.name || 'Someone', ctx: payload.ctx, until: Date.now() + 4500 } }
        })
      })
      .on('broadcast', { event:'new-message' }, ({ payload }) => {
        if (payload?.userId !== myUUID) loadTeamChat()
      })
      .subscribe()
    rtChanRef.current = ch
    const prune = setInterval(() => {
      setTypers(prev => {
        const now = Date.now()
        const keep = Object.entries(prev).filter(([,v]) => v.until > now)
        return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep)
      })
    }, 1200)
    return () => { clearInterval(prune); rtChanRef.current = null; supabase.removeChannel(ch) }
  }, [orgId, myUUID]) // eslint-disable-line

  function sendTyping(ctx) {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 1800) return
    lastTypingSentRef.current = now
    rtChanRef.current?.send({ type:'broadcast', event:'typing', payload:{ userId:myUUID, name:myName, ctx } })
  }
  function stopTyping() {
    lastTypingSentRef.current = 0
    rtChanRef.current?.send({ type:'broadcast', event:'typing', payload:{ userId:myUUID, stop:true } })
  }
  function broadcastNewMessage() {
    rtChanRef.current?.send({ type:'broadcast', event:'new-message', payload:{ userId:myUUID } })
  }
  const typingNames = (ctx) => Object.values(typers).filter(t => t.ctx === ctx).map(t => (t.name || '').split(' ')[0] || 'Someone')
  const TypingHint = ({ ctx }) => {
    const names = typingNames(ctx)
    if (!names.length) return null
    return (
      <div style={{fontSize:10,color:C.gold,fontStyle:'italic',padding:'0 2px 5px'}}>
        {names.slice(0,3).join(', ')} {names.length > 1 ? 'are' : 'is'} typing…
      </div>
    )
  }

  // ── Unread tracking: last-viewed timestamps per conversation ──
  const [seen, setSeen] = useState({})
  useEffect(() => { if (myUUID) setSeen(loadSeen(myUUID)) }, [myUUID])
  function markSeen(key) {
    if (!myUUID) return
    setSeen(prev => {
      const next = { ...prev, [key]: Date.now() }
      saveSeen(myUUID, next)
      return next
    })
  }

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

  // ── Attachments & smart links (Slack-style) ─────────────────────────
  // Uploaded files travel inside message content as markers: [[file|name|url|type]]
  const ATT_RE = /\[\[file\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]\]/g
  function splitAtts(text) {
    const atts = []
    const rest = String(text||'').replace(ATT_RE, (_, name, url, type) => { atts.push({ name, url, type }); return '' })
    return { text: rest.trim(), atts }
  }
  function linkLabel(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./,'')
      if (h.includes('loom.com'))         return '▶️ Loom video'
      if (h === 'docs.google.com')        return '📄 Google Doc'
      if (h === 'sheets.google.com')      return '📊 Google Sheet'
      if (h === 'drive.google.com')       return '📁 Google Drive'
      if (h.includes('youtube.com') || h === 'youtu.be') return '▶️ YouTube'
      return '🔗 ' + h
    } catch { return '🔗 Link' }
  }
  function renderRich(text, baseColor) {
    const parts = String(text||'').split(/(https?:\/\/[^\s]+)/g)
    return parts.map((p, i) => /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{color:C.gold,fontWeight:600}}>{linkLabel(p)}</a>
      : <span key={i}>{renderMentions(p, baseColor)}</span>)
  }
  // Only ever render http(s) URLs as clickable/embedded — markers are stored in
  // chat content, so a crafted message could otherwise smuggle javascript:/data: URLs
  function safeUrl(u) { try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:' } catch { return false } }
  function renderBody(content, baseColor, mine = false) {
    const { text, atts: rawAtts } = splitAtts(content)
    const atts = rawAtts.filter(a => safeUrl(a.url))
    return (<>
      {text ? renderRich(text, baseColor) : null}
      {atts.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:text?6:0}}>
          {atts.map((a,i) => /^image\//.test(a.type||'') ? (
            <a key={i} href={a.url} target="_blank" rel="noreferrer">
              <img src={a.url} alt={a.name} style={{maxWidth:220,maxHeight:180,borderRadius:8,border:`1px solid ${C.border}`,display:'block'}}/>
            </a>
          ) : (
            <a key={i} href={a.url} target="_blank" rel="noreferrer"
              style={{display:'flex',alignItems:'center',gap:8,background:mine?'#00000018':C.surface,border:`1px solid ${C.border}`,
                borderRadius:8,padding:'7px 10px',textDecoration:'none',maxWidth:260}}>
              <span style={{fontSize:15}}>📎</span>
              <span style={{fontSize:12,fontWeight:600,color:mine?C.black:C.gold,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span>
            </a>
          ))}
        </div>
      )}
    </>)
  }

  // ── File uploads (api-server → Supabase Storage) ─────────────────────
  const [pendingFiles, setPendingFiles] = useState([])   // {name,url,type,target}
  const [uploadingFor, setUploadingFor] = useState(null) // 'main' | 'thread' | 'dm' | null
  const fileInputRef = useRef(null)
  const uploadTargetRef = useRef('main')
  function pickFile(target) { uploadTargetRef.current = target; fileInputRef.current?.click() }
  async function onFilePicked(e) {
    const files = Array.from(e.target.files||[]); e.target.value = ''
    if (!files.length) return
    const target = uploadTargetRef.current
    setUploadingFor(target)
    try {
      for (const f of files) {
        if (f.size > 15*1024*1024) { alert(`${f.name} is over the 15 MB limit.`); continue }
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload  = () => resolve(String(r.result).split(',')[1]||'')
          r.onerror = reject
          r.readAsDataURL(f)
        })
        const resp = await fetch('/api/team/upload', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${sbAccessToken()}` },
          body: JSON.stringify({ filename:f.name, contentType:f.type, dataBase64:b64 }),
        })
        const out = await resp.json().catch(() => null)
        if (!resp.ok || !out?.url) { alert(`Could not upload ${f.name} — please try again.`); continue }
        setPendingFiles(prev => [...prev, { name:f.name, url:out.url, type:f.type||'', target }])
      }
    } finally { setUploadingFor(null) }
  }
  // Pull this composer's staged files out and turn them into content markers
  function takePending(target) {
    const mine = pendingFiles.filter(p => p.target===target)
    if (mine.length) setPendingFiles(prev => prev.filter(p => p.target!==target))
    return mine.map(a => `[[file|${a.name.replace(/[|[\]]/g,'_')}|${a.url}|${a.type}]]`).join('\n')
  }
  const hasPending = (target) => pendingFiles.some(p => p.target===target)
  const PendingChips = ({ target }) => {
    const mine = pendingFiles.filter(p => p.target===target)
    if (!mine.length && uploadingFor!==target) return null
    return (
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
        {mine.map((p,i) => (
          <span key={i} style={{display:'flex',alignItems:'center',gap:6,background:C.card,border:`1px solid ${C.gold}55`,borderRadius:14,padding:'3px 9px',fontSize:11,color:C.white}}>
            📎 <span style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
            <button onClick={() => setPendingFiles(prev => prev.filter(x => x!==p))}
              style={{background:'none',border:'none',color:C.muted,cursor:'pointer',padding:0,fontSize:12}}>✕</button>
          </span>
        ))}
        {uploadingFor===target && <span style={{fontSize:11,color:C.muted,alignSelf:'center'}}>Uploading…</span>}
      </div>
    )
  }
  const ClipBtn = ({ target }) => (
    <button onClick={() => pickFile(target)} title="Attach a file (15 MB max)"
      style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'0 10px',color:C.muted,fontSize:15,cursor:'pointer',flexShrink:0}}>
      📎
    </button>
  )

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
  // Per-user read state for threads — a thread stays under Threads until its
  // latest reply has been seen; "Mark unread" puts it back.
  const [threadReads, setThreadReads] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`eden_team_thread_reads_${email}`) || '{}') } catch { return {} }
  })
  function setThreadRead(rootId, ts) {
    setThreadReads(prev => {
      const next = { ...prev, [rootId]: ts }
      try { localStorage.setItem(`eden_team_thread_reads_${email}`, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const lastReplyAt = (m) => {
    const rs = threadReplies[m.id] || []
    return rs.length ? rs[rs.length - 1].createdAt : m.createdAt
  }
  const isThreadUnread = (m) => (m.replyCount||0) > 0 && new Date(lastReplyAt(m)).getTime() > (threadReads[m.id] || 0)
  const openThreadRead = (m) => { setThreadRead(m.id, Date.now()); setActiveThread(m); setChatView('thread') }

  // Deep link from admin: "💬 Message" on a coach/staff card opens their DM here
  useEffect(() => {
    if (!initialDm?.email || !team.length) return
    dbGet('user_profiles', `email=eq.${encodeURIComponent(initialDm.email)}&select=id`).then(rows => {
      const id = rows?.[0]?.id
      const t = team.find(x => x.uuid === id)
      if (t) { setSection('chat'); setDmTarget(t); setChatView('dm') }
    }).catch(()=>{})
  }, [initialDm, team]) // eslint-disable-line
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

  // ── Huddle state — GLOBAL (HuddleHub) so the call and the
  //    incoming-call ringer survive navigation anywhere in the app ──
  const huddle = useHuddle() || {}
  const {
    huddleActive = false, huddleRoomUrl = '', liveHuddle = null, liveHuddles = [],
    isStarter = false, huddlePinging = null,
    startHuddle: hubStartHuddle, joinLiveHuddle: hubJoinLiveHuddle,
    endHuddle, pingCoach,
  } = huddle

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
    if (!newMessage.trim() && !hasPending('main')) return
    const markers = takePending('main')
    const body = [newMessage.trim(), markers].filter(Boolean).join('\n')
    const msg = {
      id:'m'+Date.now(), senderId:myUUID, senderName:myName, senderRole:myRole,
      content:body, replyCount:0, createdAt:new Date().toISOString(), isDm:false,
    }
    setMessages(prev => [...prev, msg])
    setNewMessage('')
    stopTyping()
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, sender_role:myRole, content:msg.content, is_dm:false })
      .then(() => { loadTeamChat(); broadcastNewMessage() })
    notifyMentions(msg.content, 'Team Hub #general')
  }

  function sendReply() {
    if ((!newReply.trim() && !hasPending('thread')) || !activeThread) return
    const markers = takePending('thread')
    const reply = {
      id:'r'+Date.now(), senderId:myUUID, senderName:myName, senderRole:myRole,
      content:[newReply.trim(), markers].filter(Boolean).join('\n'), threadId:activeThread.id, createdAt:new Date().toISOString(),
    }
    setThreadReplies(prev => ({ ...prev, [activeThread.id]:[...(prev[activeThread.id]||[]), reply] }))
    setMessages(prev => prev.map(m => m.id===activeThread.id ? {...m, replyCount:(m.replyCount||0)+1} : m))
    setNewReply('')
    stopTyping()
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, sender_role:myRole, content:reply.content, thread_id:activeThread.id, is_dm:false })
      .then(() => { loadTeamChat(); broadcastNewMessage() })
    notifyMentions(reply.content, 'a Team Hub thread')
  }

  function sendDm() {
    if ((!newDm.trim() && !hasPending('dm')) || !dmTarget) return
    const markers = takePending('dm')
    const key = [myUUID, dmTarget.uuid].sort().join('_')
    const msg = { id:'dm'+Date.now(), senderId:myUUID, senderName:myName, content:[newDm.trim(), markers].filter(Boolean).join('\n'), createdAt:new Date().toISOString() }
    setDmMessages(prev => ({ ...prev, [key]:[...(prev[key]||[]), msg] }))
    setNewDm('')
    stopTyping()
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, content:msg.content, is_dm:true, dm_to_id:dmTarget.uuid, dm_to_name:dmTarget.name })
      .then(() => { loadTeamChat(); broadcastNewMessage() })
  }

  // ── Huddle helpers — thin wrappers over the global HuddleHub ─
  async function startHuddle() { return hubStartHuddle ? await hubStartHuddle() : false }
  function joinLiveHuddle(row) {
    if (!hubJoinLiveHuddle) return
    hubJoinLiveHuddle(row && row.room_url ? row : undefined)
    setSection('huddle')
  }

  const dmKey    = dmTarget ? [myUUID, dmTarget.uuid].sort().join('_') : null
  const dmConvo  = dmKey ? (dmMessages[dmKey] || []) : []
  const otherCoaches = team.filter(c => c.uuid !== myUUID)

  // ── Mark conversations as seen while they're on screen ──────
  useEffect(() => {
    if (section === 'chat' && (chatView === 'main' || chatView === 'thread')) markSeen('general')
  }, [section, chatView, messages, threadReplies]) // eslint-disable-line
  useEffect(() => {
    if (section === 'chat' && chatView === 'dm' && dmKey) markSeen(dmKey)
  }, [section, chatView, dmKey, dmMessages]) // eslint-disable-line

  // ── Unread counts (messages from others newer than last viewed) ──
  const isUnread = (m, key) => !m.deletedAt && m.senderId !== myUUID && new Date(m.createdAt).getTime() > seenAt(seen, key)
  const generalUnread =
    messages.filter(m => !m.isDm && isUnread(m, 'general')).length +
    Object.values(threadReplies).flat().filter(r => isUnread(r, 'general')).length
  const dmUnreadCount = (key) => (dmMessages[key] || []).filter(m => isUnread(m, key)).length
  const totalDmUnread = otherCoaches.reduce((n, c) => n + dmUnreadCount([myUUID, c.uuid].sort().join('_')), 0)
  const chatUnread = generalUnread + totalDmUnread
  const UnreadPill = ({ n }) => n > 0 ? (
    <span style={{marginLeft:'auto',background:C.gold,color:C.black,borderRadius:9,fontSize:9,fontWeight:800,padding:'1px 6px',flexShrink:0,lineHeight:1.5}}>
      {n > 9 ? '9+' : n}
    </span>
  ) : null

  // ─── Sidebar nav items ─────────────────────────────────────
  const NAV = [
    { key:'chat',     icon:'💬', label:'Team Chat',  badge: chatUnread > 0 },
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
        {liveHuddles.length > 0 && !huddleActive && liveHuddles.map(h => (
          <div key={h.id} style={{background:`${C.success}18`,borderBottom:`1px solid ${C.success}44`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{width:10,height:10,borderRadius:5,background:C.success,animation:'pulse 1.5s infinite'}}/>
            <div style={{flex:1,fontSize:12,color:C.white,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              <b style={{color:C.success}}>Huddle live</b>
              {h.creator_name ? ` — started by ${h.creator_name}` : ''}
            </div>
            <button onClick={() => joinLiveHuddle(h)}
              style={{background:C.success,border:'none',borderRadius:8,padding:'6px 16px',color:C.black,fontSize:12,fontWeight:800,cursor:'pointer',flexShrink:0}}>
              Join
            </button>
          </div>
        ))}

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
                  <span style={{color:C.muted}}>#</span> <span style={{fontWeight:generalUnread>0?700:400}}>general</span>
                  <UnreadPill n={generalUnread}/>
                </button>
              </div>

              {/* Threads tab — like the Threads button in coach Messages */}
              <div style={{padding:'2px 14px 0'}}>
                <button onClick={() => setChatView('threads')}
                  style={{width:'100%',textAlign:'left',background:chatView==='threads'?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:chatView==='threads'?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                  <span>🧵</span> Threads
                  {messages.filter(m=>!m.isDm&&isThreadUnread(m)).length>0 && (
                    <span style={{marginLeft:'auto',fontSize:9,fontWeight:800,color:C.black,background:C.gold,borderRadius:8,padding:'1px 6px'}}>{messages.filter(m=>!m.isDm&&isThreadUnread(m)).length}</span>
                  )}
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
                  const unread = dmUnreadCount(key)
                  const isTyping = typingNames(`dm:${key}`).length > 0
                  return (
                    <button key={coach.uuid} onClick={() => { setDmTarget(coach); setChatView('dm') }}
                      style={{width:'100%',textAlign:'left',background:isDmActive?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:isDmActive?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                      <div style={{width:20,height:20,borderRadius:10,background:`${C.gold}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.gold,flexShrink:0}}>
                        {coach.name[0]}
                      </div>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,fontWeight:unread>0?700:400}}>
                        {coach.name.split(' ')[0]}{isTyping && <span style={{color:C.gold,fontStyle:'italic',fontWeight:400}}> …typing</span>}
                      </span>
                      {coach.isHeadCoach && unread===0 && <span style={{fontSize:8,color:C.gold,fontWeight:700,flexShrink:0}}>HC</span>}
                      <UnreadPill n={unread}/>
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
            {/* THREADS INBOX — every #general thread, like the coach Messages Threads tab */}
            {chatView==='threads' && (
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.white}}>🧵 Threads</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>Threads with replies you haven't read yet — they clear once opened</div>
                </div>
                <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                  {messages.filter(m=>!m.isDm&&isThreadUnread(m)).length===0 && (
                    <div style={{fontSize:12,color:C.muted,textAlign:'center',padding:'40px 20px',lineHeight:1.7}}>
                      ✅ You're all caught up — no unread thread replies.<br/>New replies in any #general thread will show up here.
                    </div>
                  )}
                  {messages.filter(m=>!m.isDm&&isThreadUnread(m))
                    .slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
                    .map(m=>{
                      const replies = threadReplies[m.id]||[]
                      const last = replies[replies.length-1]
                      return (
                        <button key={m.id} onClick={()=>openThreadRead(m)}
                          style={{width:'100%',textAlign:'left',background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',marginBottom:10,cursor:'pointer',display:'block'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                            <div style={{width:24,height:24,borderRadius:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.gold,flexShrink:0}}>{m.senderName[0]}</div>
                            <span style={{fontSize:12,fontWeight:700,color:C.white}}>{m.senderName}</span>
                            <span style={{fontSize:10,color:C.muted}}>{timeAgo(m.createdAt)}</span>
                            <span style={{marginLeft:'auto',fontSize:10,fontWeight:800,color:C.gold,background:`${C.gold}20`,borderRadius:8,padding:'2px 8px',flexShrink:0}}>{m.replyCount} {m.replyCount===1?'reply':'replies'}</span>
                          </div>
                          <div style={{fontSize:12,color:C.white,lineHeight:1.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(splitAtts(m.content).text||'📎 attachment')}</div>
                          {last && (
                            <div style={{fontSize:11,color:C.muted,marginTop:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              ↳ <b style={{color:C.gold}}>{last.senderName}:</b> {(splitAtts(last.content).text||'📎 attachment')}
                            </div>
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

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
                                {renderBody(msg.content, C.white)}
                              </div>
                            )}
                            <div style={{display:'flex',gap:8,marginTop:5,alignItems:'center'}}>
                              {!msg.deletedAt && canDeleteTeamMsg(msg) && (
                                <button onClick={() => deleteTeamMsg(msg)} title="Delete (kept in admin audit log)"
                                  style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer',padding:0}}>🗑</button>
                              )}
                              <button onClick={() => openThreadRead(msg)}
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
                    <TypingHint ctx="general"/>
                    <PendingChips target="main"/>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <ClipBtn target="main"/>
                      <MentionInput value={newMessage} onChange={v => { setNewMessage(v); if (v) sendTyping('general') }} onSubmit={sendMessage}
                        candidates={team.filter(t => t.uuid !== myUUID).map(t => t.name)}
                        colors={C}
                        placeholder="Message #general… tag with @Name (Enter to send)"
                        inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                      <button onClick={sendMessage} disabled={!newMessage.trim() && !hasPending('main')}
                        style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:(newMessage.trim()||hasPending('main'))?1:.4}}>
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
                      <button onClick={() => { setThreadRead(activeThread.id, 0); setChatView('threads') }}
                        title="Put this thread back under Threads as unread"
                        style={{marginLeft:'auto',background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',color:C.muted,fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                        Mark unread
                      </button>
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
                          <div style={{fontSize:12,color:C.white,lineHeight:1.5}}>{renderBody(activeThread.content, C.white)}</div>
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
                                <div style={{fontSize:12,lineHeight:1.5,background:C.card,borderRadius:7,padding:'8px 10px',border:`1px solid ${C.border}`}}>{renderBody(r.content, C.white)}</div>
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
                      <TypingHint ctx={`thread:${activeThread.id}`}/>
                      <PendingChips target="thread"/>
                      <div style={{display:'flex',gap:8}}>
                        <ClipBtn target="thread"/>
                        <MentionInput value={newReply} onChange={v => { setNewReply(v); if (v) sendTyping(`thread:${activeThread.id}`) }} onSubmit={sendReply}
                          candidates={team.filter(t => t.uuid !== myUUID).map(t => t.name)}
                          colors={C}
                          placeholder="Reply in thread…"
                          inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                        <button onClick={sendReply} disabled={!newReply.trim() && !hasPending('thread')}
                          style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 12px',fontWeight:800,color:C.black,fontSize:12,cursor:'pointer',opacity:(newReply.trim()||hasPending('thread'))?1:.4}}>
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
                    <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:dmTarget.label?'none':'capitalize'}}>
                      {dmTarget.label || dmTarget.role}{dmTarget.isHeadCoach?' · Head Coach':''}
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
                            <div style={{fontSize:13,color:isMine?C.black:C.white,lineHeight:1.5}}>{renderBody(msg.content, isMine?C.black:C.white, isMine)}</div>
                          </div>
                          <div style={{fontSize:10,color:C.muted,marginTop:3,textAlign:isMine?'right':'left'}}>{timeAgo(msg.createdAt)}</div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={dmBottomRef}/>
                </div>

                <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                  <TypingHint ctx={`dm:${dmKey}`}/>
                  <PendingChips target="dm"/>
                  <div style={{display:'flex',gap:8}}>
                  <ClipBtn target="dm"/>
                  <MentionInput value={newDm} onChange={v => { setNewDm(v); if (v) sendTyping(`dm:${dmKey}`) }} onSubmit={sendDm}
                    candidates={[dmTarget.name]}
                    colors={C}
                    placeholder={`Message ${dmTarget.name.split(' ')[0]}…`}
                    inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                  <button onClick={sendDm} disabled={!newDm.trim() && !hasPending('dm')}
                    style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:(newDm.trim()||hasPending('dm'))?1:.4}}>
                    Send
                  </button>
                  </div>
                </div>
              </div>
            )}
            {/* Hidden file input shared by all three composers */}
            <input ref={fileInputRef} type="file" multiple style={{display:'none'}} onChange={onFilePicked}/>
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
                {liveHuddles.map(h => (
                  <div key={h.id} style={{background:`${C.success}15`,border:`1px solid ${C.success}44`,borderRadius:12,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <div style={{width:12,height:12,borderRadius:6,background:C.success,animation:'pulse 1.5s infinite',flexShrink:0}}/>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.success}}>Huddle live now</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>Started by {h.creator_name || 'a teammate'} · {timeAgo(h.created_at)}</div>
                    </div>
                    <button onClick={() => joinLiveHuddle(h)}
                      style={{background:C.success,border:'none',borderRadius:8,padding:'8px 18px',color:C.black,fontSize:12,fontWeight:800,cursor:'pointer'}}>
                      Join Huddle
                    </button>
                  </div>
                ))}
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
                      <button onClick={async () => { if (liveHuddle) { pingCoach(coach) } else { const ok = await startHuddle(); if (ok) pingCoach(coach) } }}
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
                  <button onClick={endHuddle}
                    style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:8,padding:'6px 14px',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    {isStarter ? 'End Huddle' : 'Leave Huddle'}
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
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Your call is in the floating window</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                    🎥 The video call lives in the <span style={{color:C.gold,fontWeight:700}}>floating window in the corner</span> of your screen — just like Slack.
                    <br/>Go anywhere in the app (check-ins, labs, client updates) and the call follows you, even while screen sharing.
                    <br/>Use <span style={{color:C.gold}}>⇲ Shrink</span> on the window to tuck it out of the way, or <span style={{color:C.gold}}>⇱ Expand</span> to make it big.
                  </div>
                  <div style={{marginTop:10,fontSize:10,color:C.muted}}>
                    Room link: <span style={{color:C.gold}}>{huddleRoomUrl}</span>
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
