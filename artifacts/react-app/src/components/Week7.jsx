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
import { sendNotification } from './Notifications'
import { supabase } from '../supabaseClient'
import { loadSeen, saveSeen, seenAt, syncSeen, mergeSeenLocal } from '../lib/teamUnread'
import { mergeRemoteSeen } from '../lib/seenMerge'
import Communities from './Communities'
import CanvasPanel from './CanvasPanel'
import MentionInput from './MentionInput'
import DeletedBubble from './DeletedBubble'
import { useHuddle } from './HuddleHub'
import { ReactionBar, fetchReactions } from './Reactions'
import { LN } from './LoomPrivacy'

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
async function dbDelete(table, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method:'DELETE', headers:H })
  if (!r.ok) console.error('DELETE', table, await r.text())
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
  const info   = { role:currentUser?.role||'coach', name:currentUser?.name||'User', uuid:null, orgId:EDEN_ORG_ID }
  const [self, setSelf] = useState(info)
  const myUUID = self.uuid
  const myName = self.name
  const myRole = self.role
  const orgId  = self.orgId || EDEN_ORG_ID

  // Team roster from DB (coaches, head coaches, VAs, admins) — falls back to demo list
  const [team, setTeam] = useState(DEMO_COACHES)
  useEffect(()=>{
    // Resolve own profile from the DB
    if (email) {
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
    dbGet('user_profiles', `role=neq.client&is_active=not.is.false&select=id,name,full_name,role,email&order=name.asc.nullslast`)
      .then(async rows=>{
        if (!Array.isArray(rows)||!rows.length) return
        const labels = await metaP
        const seen = new Set()
        setTeam(rows.filter(r=>{ if(seen.has(r.id)) return false; seen.add(r.id); return true })
          .map(r=>({ uuid:r.id, name:r.name||r.full_name||'Team member', role:r.role, email:(r.email||'').toLowerCase(), label:labels[r.id]||null, isHeadCoach:r.role==='head_coach' })))
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
  const [section, setSection] = useState('chat') // chat | calendar | huddle | dbas

  // ── My DBAs (sub-brands I coach or was delegated into) ──────
  // The server scopes the list: admins get every org DBA, other staff only
  // the ones they run or were granted access to. Empty → tab stays hidden.
  const [myDbas, setMyDbas] = useState([])
  const [dbaScope, setDbaScope] = useState('mine')
  const [openDba, setOpenDba] = useState(null)
  useEffect(() => {
    if (!myUUID || myRole === 'client') return
    fetch('/api/dba/list', { headers: { Authorization: sbBearer() } })
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b?.ok) { setMyDbas(Array.isArray(b.dbas) ? b.dbas : []); setDbaScope(b.scope || 'mine') } })
      .catch(() => {})
  }, [myUUID]) // eslint-disable-line

  // ── Sidebar unread dots for Communities & My DBAs ───────────
  // Reads the same localStorage seen-maps Communities.jsx (`community_seen_<uid>`)
  // and DbaChat.jsx (`dba_seen_<dbaId>_<uid>`) maintain, so opening a
  // conversation there clears the dot here on the next refresh.
  const [commUnread, setCommUnread] = useState(false)
  const [dbaUnread,  setDbaUnread]  = useState(false)
  const readSeenMap = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return {} } }
  const hasNewerMsg = async (communityId, since) => {
    try {
      const rows = await dbGet('community_messages',
        `community_id=eq.${communityId}&created_at=gt.${encodeURIComponent(since || '1970-01-01')}&select=id,sender_id&limit=30`)
      return Array.isArray(rows) && rows.some(m => m.sender_id !== myUUID)
    } catch { return false }
  }
  async function refreshNavUnread() {
    if (!myUUID) return
    const isAdminNav = myRole === 'super_admin' || myRole === 'company_admin'
    // Everything I'm a member of (team communities + DBA channels share community_members)
    let memberIds = []
    try { memberIds = ((await dbGet('community_members', `user_id=eq.${myUUID}&select=community_id`)) || []).map(m => m.community_id) } catch {}
    // Pull the DB read-state copy once up front (server merges per-key max) so
    // a community or DBA chat read on ANOTHER device clears this device's
    // nav dots within a refresh cycle. Keys: `comm:<communityId>` (Communities)
    // and `dba:<dbaId>:<communityId>` (DBA chat), numeric ms stamps.
    let remoteSeen = null
    try {
      const r = await fetch('/api/team/seen', { headers: { Authorization: sbBearer() } })
      const b = r.ok ? await r.json() : null
      if (b?.seen && typeof b.seen === 'object') remoteSeen = b.seen
    } catch { /* offline — local caches still work */ }
    // 1) Team communities — mirrors Communities.jsx loadCommunities() for context='team'
    try {
      let list = []
      if (isAdminNav) {
        list = (await dbGet('communities', `company_id=eq.${orgId}&context=eq.team&is_active=eq.true&select=id`)) || []
      } else {
        const mine  = (await dbGet('communities', `created_by=eq.${myUUID}&context=eq.team&is_active=eq.true&select=id`)) || []
        const inIds = memberIds.length
          ? (await dbGet('communities', `id=in.(${memberIds.join(',')})&context=eq.team&is_active=eq.true&select=id`)) || []
          : []
        const dedup = new Set()
        list = [...mine, ...inIds].filter(c => { if (dedup.has(c.id)) return false; dedup.add(c.id); return true })
      }
      const lsKey = `community_seen_${myUUID}`
      const { map: seenMap, changed } = mergeRemoteSeen(readSeenMap(lsKey), remoteSeen, 'comm:')
      if (changed) { try { localStorage.setItem(lsKey, JSON.stringify(seenMap)) } catch {} }
      const hits = await Promise.all(list.map(c => hasNewerMsg(c.id, seenMap[c.id])))
      setCommUnread(hits.some(Boolean))
    } catch {}
    // 2) DBA chats — group channels I'm a member of + my DMs, per-DBA seen map
    try {
      let any = false
      // remoteSeen (fetched above) merges into the local dba_seen_* caches —
      // a chat read on ANOTHER device clears this device's dot within a cycle.
      for (const d of myDbas.filter(x => x.is_active !== false)) {
        if (any) break
        // Managers (DBA coach, delegated staff, super admins — anyone the server
        // returned under scope 'mine') see every group channel, like DbaChat does.
        const manages = dbaScope === 'mine' || myRole === 'super_admin' ||
          d.coach_id === myUUID || (d.delegates || []).some(g => g.id === myUUID)
        const [groups, dms] = await Promise.all([
          manages
            ? dbGet('communities', `context=eq.${encodeURIComponent(`dba:${d.id}`)}&is_active=eq.true&select=id`)
            : memberIds.length
              ? dbGet('communities', `id=in.(${memberIds.join(',')})&context=eq.${encodeURIComponent(`dba:${d.id}`)}&is_active=eq.true&select=id`)
              : Promise.resolve([]),
          dbGet('communities', `context=eq.${encodeURIComponent(`dbadm:${d.id}`)}&is_active=eq.true&name=like.*${myUUID}*&select=id,name`),
        ])
        const convos = [
          ...(groups || []),
          ...((dms || []).filter(c => String(c.name || '').split('_').includes(myUUID))),
        ]
        if (!convos.length) continue
        const lsKey = `dba_seen_${d.id}_${myUUID}`
        const { map: seenMap, changed } = mergeRemoteSeen(readSeenMap(lsKey), remoteSeen, `dba:${d.id}:`)
        if (changed) { try { localStorage.setItem(lsKey, JSON.stringify(seenMap)) } catch {} }
        const hits = await Promise.all(convos.map(c => hasNewerMsg(c.id, seenMap[c.id])))
        if (hits.some(Boolean)) any = true
      }
      setDbaUnread(any)
    } catch {}
  }
  useEffect(() => {
    if (!myUUID) return
    refreshNavUnread()
    const iv = setInterval(refreshNavUnread, 30000)
    // DBA spaces open in another tab — their markSeen writes fire a storage event here
    const onStorage = (e) => {
      if (e.key && (e.key.startsWith('dba_seen_') || e.key.startsWith('community_seen_'))) refreshNavUnread()
    }
    window.addEventListener('storage', onStorage)
    // Same-window: Communities.jsx (mounted below) fires this when a community is marked seen
    const onSeen = () => refreshNavUnread()
    window.addEventListener('hub-seen-updated', onSeen)
    return () => { clearInterval(iv); window.removeEventListener('storage', onStorage); window.removeEventListener('hub-seen-updated', onSeen) }
  }, [myUUID, orgId, myDbas.length, dbaScope, section]) // eslint-disable-line

  // ── Team Chat state ────────────────────────────────────────
  // Demo seed messages removed — team chat loads live from the database.
  const [messages, setMessages] = useState([])
  const [threadReplies, setThreadReplies] = useState({})
  const [newMessage,   setNewMessage]   = useState('')

  // ── Live team chat: load real messages from the DB (demo rows stay as fallback) ──
  const liveLoadedRef = useRef(false)
  const [reactions, setReactions] = useState({})   // { msgId: { '👍': [{id,n}] } }
  const setRx = (id) => (map) => setReactions(p => ({ ...p, [id]: map }))
  async function loadTeamChat() {
    try {
      // Fetch the NEWEST 500 rows (desc), then flip ascending for display —
      // an ascending fetch would drop recent messages once an org passes 500 rows.
      // Reads go through the api-server, which redacts deleted-message content
      // for non-admins server-side — the original text never reaches the browser.
      const resp = await fetch('/api/team/messages', { headers: { Authorization: sbBearer() } })
      const rows = resp.ok ? (await resp.json())?.messages : []
      if (!Array.isArray(rows) || !rows.length) return
      rows.reverse()
      liveLoadedRef.current = true
      fetchReactions('team_messages', rows.map(r => r.id)).then(setReactions).catch(() => {})
      const roots = [], reps = {}, dms = {}, dmReps = {}
      for (const r of rows) {
        const m = { id:r.id, senderId:r.sender_id, senderName:r.sender_name, senderRole:r.sender_role,
          content:r.content, createdAt:r.created_at, isDm:!!r.is_dm, threadId:r.thread_id,
          deletedAt:r.deleted_at, deletedByName:r.deleted_by_name, replyCount:0 }
        if (r.is_dm) {
          if (r.sender_id===myUUID || r.dm_to_id===myUUID) {
            const key = [r.sender_id, r.dm_to_id].sort().join('_')
            if (r.thread_id) {
              ;((dmReps[key] ||= {})[r.thread_id] ||= []).push(m)
            } else {
              ;(dms[key] ||= []).push(m)
            }
          }
        } else if (r.thread_id) {
          ;(reps[r.thread_id] ||= []).push(m)
        } else {
          roots.push(m)
        }
      }
      // Backfill thread roots that fell outside the fetch window — a reply must
      // never be orphaned just because its parent is older than the last 500 rows.
      const haveIds = new Set([...roots.map(m => m.id), ...Object.values(dms).flat().map(m => m.id)])
      const missingIds = new Set()
      for (const pid of Object.keys(reps)) if (!haveIds.has(pid)) missingIds.add(pid)
      for (const byParent of Object.values(dmReps)) for (const pid of Object.keys(byParent)) if (!haveIds.has(pid)) missingIds.add(pid)
      if (missingIds.size) {
        try {
          const pResp = await fetch(`/api/team/messages?ids=${[...missingIds].join(',')}`, { headers: { Authorization: sbBearer() } })
          const parents = pResp.ok ? (await pResp.json())?.messages : []
          for (const r of (parents || [])) {
            const m = { id:r.id, senderId:r.sender_id, senderName:r.sender_name, senderRole:r.sender_role,
              content:r.content, createdAt:r.created_at, isDm:!!r.is_dm, threadId:r.thread_id,
              deletedAt:r.deleted_at, deletedByName:r.deleted_by_name, replyCount:0 }
            if (r.is_dm) {
              if (r.sender_id===myUUID || r.dm_to_id===myUUID) {
                const key = [r.sender_id, r.dm_to_id].sort().join('_')
                ;(dms[key] ||= []).push(m)
                dms[key].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
              }
            } else {
              roots.push(m)
              roots.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
            }
          }
        } catch {}
      }
      for (const m of roots) m.replyCount = (reps[m.id]||[]).length
      for (const key of Object.keys(dms)) for (const m of dms[key]) m.replyCount = (dmReps[key]?.[m.id]||[]).length
      setMessages(roots)
      setThreadReplies(reps)
      setDmMessages(prev => ({ ...prev, ...dms }))
      setDmReplies(prev => ({ ...prev, ...dmReps }))
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
      // Same user reading on ANOTHER device — merge their new read state so
      // in-conversation unread dividers clear here instantly (no reload).
      // The other device already persisted to the DB, so merge locally only.
      .on('broadcast', { event:'seen' }, ({ payload }) => {
        if (payload?.userId !== myUUID || !payload?.seen) return
        const merged = mergeSeenLocal(myUUID, payload.seen)
        setSeen(prev => {
          let changed = false
          const next = { ...prev }
          for (const [k, t] of Object.entries(merged)) {
            if (Number.isFinite(t) && t > (next[k] || 0)) { next[k] = t; changed = true }
          }
          return changed ? next : prev
        })
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
  // Local cache first for instant paint, then merge the DB copy (source of
  // truth) so read state follows the person across devices.
  useEffect(() => {
    if (!myUUID) return
    let stop = false
    setSeen(loadSeen(myUUID))
    syncSeen(myUUID).then(m => { if (!stop) setSeen(m) }).catch(() => {})
    return () => { stop = true }
  }, [myUUID])
  function markSeen(key) {
    if (!myUUID) return
    setSeen(prev => {
      const ts = Date.now()
      const next = { ...prev, [key]: ts }
      saveSeen(myUUID, next, { [key]: ts })
      // Tell my other open devices right away (lightweight, like typing hints)
      try { rtChanRef.current?.send({ type:'broadcast', event:'seen', payload:{ userId:myUUID, seen:{ [key]: ts } } }) } catch {}
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
    const mentioned = findMentions(text)
    for (const t of mentioned) {
      sendNotification({
        recipientId: t.uuid, senderId: myUUID, senderName: myName,
        type: 'mention', body: `💬 ${myName} tagged you in ${where}: "${text.slice(0,80)}"`,
        linkTo: 'team',
      })
    }
    return mentioned
  }
  // Bell notification for every Team Hub message — recipients get an instant
  // alert (the bell listens via realtime). `skip` = people already notified
  // through an @mention, so nobody gets two alerts for one message.
  function notifyTeamMessage(recipients, body, skip = []) {
    const skipIds = new Set(skip.map(t => t.uuid))
    const preview = String(body || '').replace(/\[\[file\|[^\]]*\]\]/g, '📎 attachment').trim().slice(0, 80)
    for (const r of recipients) {
      if (!r?.uuid || r.uuid === myUUID || skipIds.has(r.uuid)) continue
      sendNotification({
        recipientId: r.uuid, senderId: myUUID, senderName: myName,
        type: 'message', body: `💬 ${myName} in Team Hub: "${preview}"`,
        linkTo: 'team',
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
  // Optional 4th field: URI-encoded transcript (voice memos)
  const ATT_RE = /\[\[file\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)(?:\|([^\]]*))?\]\]/g
  function splitAtts(text) {
    const atts = []
    const rest = String(text||'').replace(ATT_RE, (_, name, url, type, tx) => {
      let transcript = ''
      try { transcript = tx ? decodeURIComponent(tx) : '' } catch {}
      atts.push({ name, url, type, transcript })
      return ''
    })
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
  function renderRich(text, baseColor, mine = false) {
    const parts = String(text||'').split(/((?:https?:\/\/|www\.)[^\s]+)/g)
    return parts.map((p, i) => {
      if (!/^(?:https?:\/\/|www\.)/.test(p)) return <span key={i}>{renderMentions(p, baseColor)}</span>
      const href = /^www\./.test(p) ? `https://${p}` : p
      // Own bubbles have a gold background — a gold link would be invisible
      return <a key={i} href={href} target="_blank" rel="noreferrer" title={linkLabel(href)}
        style={{color:mine?C.black:C.gold,fontWeight:700,textDecoration:'underline',wordBreak:'break-all'}}>{p}</a>
    })
  }
  // Only ever render http(s) URLs as clickable/embedded — markers are stored in
  // chat content, so a crafted message could otherwise smuggle javascript:/data: URLs
  function safeUrl(u) { try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:' } catch { return false } }
  // Voice memo attachment — player plus optional transcript (collapsed by
  // default), download, and copy controls
  function AudioAtt({ att }) {
    const [showTx, setShowTx] = useState(false)
    const [copied, setCopied] = useState(false)
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(att.transcript || att.url)
        setCopied(true); setTimeout(() => setCopied(false), 1500)
      } catch { alert('Could not copy — your browser blocked clipboard access.') }
    }
    const btn = {background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'2px 8px',color:C.muted,fontSize:10,fontWeight:700,cursor:'pointer'}
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:14}}>🎙️</span>
          <audio controls preload="metadata" src={att.url} style={{height:36,maxWidth:230}}/>
        </div>
        <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
          {att.transcript && (
            <button onClick={() => setShowTx(s=>!s)} style={{...btn,color:showTx?C.gold:C.muted,borderColor:showTx?`${C.gold}66`:C.border}}>
              {showTx ? 'Hide transcript' : '📝 Transcript'}
            </button>
          )}
          <a href={att.url} download target="_blank" rel="noreferrer" style={{...btn,textDecoration:'none'}}>⬇️ Download</a>
          <button onClick={copy} style={btn}>{copied ? '✓ Copied' : (att.transcript ? '⧉ Copy text' : '⧉ Copy link')}</button>
        </div>
        {showTx && att.transcript && (
          <div style={{marginTop:6,fontSize:11,color:C.muted,lineHeight:1.6,background:'#00000030',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',maxWidth:280,whiteSpace:'pre-wrap'}}>
            {att.transcript}
          </div>
        )}
      </div>
    )
  }

  function renderBody(content, baseColor, mine = false) {
    const { text, atts: rawAtts } = splitAtts(content)
    const atts = rawAtts.filter(a => safeUrl(a.url))
    return (<>
      {text ? renderRich(text, baseColor, mine) : null}
      {atts.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:text?6:0}}>
          {atts.map((a,i) => /^audio\//.test(a.type||'') ? (
            <AudioAtt key={i} att={a}/>
          ) : /^image\//.test(a.type||'') ? (
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
    return mine.map(a => `[[file|${a.name.replace(/[|[\]]/g,'_')}|${a.url}|${a.type}${a.transcript?`|${encodeURIComponent(a.transcript).replace(/[|[\]]/g,'')}`:''}]]`).join('\n')
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

  // ── Voice memos (Slack-style) — record with the mic, upload like any file ──
  const [recordingFor, setRecordingFor] = useState(null) // composer currently recording
  const [recordSecs, setRecordSecs] = useState(0)
  const recRef = useRef(null)   // { recorder, chunks, stream }
  const [showChannelMembers, setShowChannelMembers] = useState(false)
  // Tier gate: does this org's plan include voice memos? (Eden always yes)
  const [voiceMemosOn, setVoiceMemosOn] = useState(true)
  useEffect(()=>{
    fetch('/api/team/voice-memos-enabled', { headers:{ Authorization:`Bearer ${sbAccessToken()}` } })
      .then(r=>r.json()).then(j=>{ if (j && typeof j.enabled==='boolean') setVoiceMemosOn(j.enabled) })
      .catch(()=>{}) // fail open — worst case the server still refuses transcription
  },[])
  useEffect(() => {
    if (!recordingFor) { setRecordSecs(0); return }
    const t = setInterval(() => setRecordSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [recordingFor])
  const recClock = `${Math.floor(recordSecs/60)}:${String(recordSecs%60).padStart(2,'0')}`
  async function toggleRecord(target) {
    // Stop → the onstop handler uploads
    if (recordingFor === target) { try { recRef.current?.recorder?.stop() } catch {} ; return }
    if (recordingFor) return // one recording at a time
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mime = window.MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm'
                 : window.MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType:mime } : undefined)
      const chunks = []
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecordingFor(null)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        if (blob.size > 15*1024*1024) { alert('Voice memo is over the 15 MB limit — try a shorter one.'); return }
        setUploadingFor(target)
        try {
          const b64 = await new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload  = () => resolve(String(r.result).split(',')[1]||'')
            r.onerror = reject
            r.readAsDataURL(blob)
          })
          const ext = /mp4/.test(blob.type) ? 'm4a' : 'webm'
          const stamp = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
          const resp = await fetch('/api/team/upload', {
            method:'POST',
            headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${sbAccessToken()}` },
            body: JSON.stringify({ filename:`Voice memo ${stamp}.${ext}`, contentType:blob.type, dataBase64:b64 }),
          })
          const out = await resp.json().catch(() => null)
          if (!resp.ok || !out?.url) { alert('Could not upload the voice memo — please try again.'); return }
          // Best-effort transcript — the memo still sends if this fails
          let transcript = ''
          try {
            const tr = await fetch('/api/team/transcribe', {
              method:'POST',
              headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${sbAccessToken()}` },
              body: JSON.stringify({ dataBase64:b64, contentType:blob.type }),
            })
            const tj = await tr.json().catch(() => null)
            if (tr.ok && tj?.text) transcript = tj.text
          } catch {}
          setPendingFiles(prev => [...prev, { name:out.name, url:out.url, type:blob.type, transcript, target }])
        } finally { setUploadingFor(null) }
      }
      recorder.start()
      recRef.current = { recorder, chunks, stream }
      setRecordingFor(target)
    } catch (e) {
      alert('Microphone access was blocked — allow the mic in your browser to record voice memos.')
    }
  }
  const MicBtn = ({ target }) => voiceMemosOn && (
    <button onClick={() => toggleRecord(target)}
      title={recordingFor===target ? 'Stop recording' : 'Record a voice memo'}
      style={{background:recordingFor===target?C.danger:'none',border:`1px solid ${recordingFor===target?C.danger:C.border}`,borderRadius:8,padding:'0 10px',color:recordingFor===target?C.white:C.muted,fontSize:recordingFor===target?12:15,fontWeight:800,cursor:'pointer',flexShrink:0,animation:recordingFor===target?'pulse 1.2s infinite':'none',display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
      {recordingFor===target ? <>⏹ {recClock}</> : '🎙️'}
    </button>
  )

  // ── Delete rules: admin deletes anything; everyone else only their own ──
  const isAdminRole = myRole==='super_admin' || myRole==='company_admin'
  function canDeleteTeamMsg(m) { return typeof m.id==='string' && m.id.length===36 && (isAdminRole || m.senderId===myUUID) }
  async function deleteTeamMsg(m) {
    if (!window.confirm('Delete this message for everyone?\nIt stays permanently visible in the admin audit log.')) return
    // Server-side: RLS hides deleted rows from direct reads/writes, so the
    // soft-delete (and its audit log entry) must go through the api-server.
    const resp = await fetch(`/api/team/messages/${m.id}/delete`, { method:'POST', headers:{ Authorization: sbBearer() } })
    if (!resp.ok) { alert('Could not delete this message.'); return }
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
  const [dmReplies,    setDmReplies]    = useState({})   // { dmKey: { rootMsgId: [replies] } }
  const [dmThreadRoot, setDmThreadRoot] = useState(null) // root DM message whose thread panel is open
  const [newDmReply,   setNewDmReply]   = useState('')
  const [newDm,        setNewDm]        = useState('')
  const [chatView,     setChatView]     = useState('main') // main | thread | dm
  const [showDmPicker, setShowDmPicker] = useState(false)

  // ── #general custom name (admin-renameable, stored in admin_settings) ──
  const [generalName, setGeneralName] = useState('general')
  const iAmAdmin = myRole === 'super_admin' || myRole === 'company_admin'
  useEffect(() => {
    if (!orgId) return
    dbGet('admin_settings', `company_id=eq.${orgId}&key=eq.team_general_name&select=value`)
      .then(rows => {
        try {
          const v = rows?.[0]?.value
          const parsed = typeof v === 'string' ? JSON.parse(v) : v
          if (parsed?.name) setGeneralName(String(parsed.name))
        } catch {}
      }).catch(()=>{})
  }, [orgId])
  async function renameGeneral() {
    if (!iAmAdmin) return
    const next = window.prompt('New name for the main channel:', generalName)
    if (!next || !next.trim() || next.trim() === generalName) return
    const name = next.trim().replace(/^#/, '').slice(0, 40)
    const prev = generalName
    setGeneralName(name)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
        method:'POST', headers:{ ...H, 'Prefer':'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ company_id:orgId, key:'team_general_name', value: JSON.stringify({ name }), updated_at:new Date().toISOString() }),
      })
      if (!res.ok) throw new Error()
      dbInsert('audit_logs', { action:'community_renamed', actor_id:myUUID, actor_name:myName, actor_role:myRole,
        target_type:'team_channel', target_id:orgId, details:{ from:prev, to:name, context:'team_general' } }).catch(()=>{})
    } catch { setGeneralName(prev); alert("Couldn't rename the channel — try again.") }
  }

  // ── Pins for Team Hub (#general + DMs) — per-user rows in message_pins ──
  const [teamPins, setTeamPins] = useState([])
  const isRealMsgId = id => typeof id === 'string' && id.length === 36
  function loadTeamPins() {
    if (!myUUID) return
    dbGet('message_pins', `user_id=eq.${myUUID}&context=in.(team_general,team_dm)&select=*`)
      .then(rows => { if (Array.isArray(rows)) setTeamPins(rows) }).catch(()=>{})
  }
  useEffect(() => { loadTeamPins() }, [myUUID])
  const teamPinnedIds = new Set(teamPins.map(p => p.message_id))
  async function togglePinTeam(m, ctx) {
    if (!isRealMsgId(m.id)) { alert('Give this message a second to finish sending, then pin it.'); return }
    if (teamPinnedIds.has(m.id)) {
      await dbDelete('message_pins', `message_id=eq.${m.id}&user_id=eq.${myUUID}`)
    } else {
      await dbInsert('message_pins', { message_id:m.id, conversation_id:orgId, user_id:myUUID,
        pinned_by:myUUID, pinned_by_name:myName, context:ctx })
    }
    loadTeamPins()
  }
  async function pinForAllTeam(m, ctx) {
    if (!isRealMsgId(m.id)) { alert('Give this message a second to finish sending, then pin it.'); return }
    const targets = ctx === 'team_dm' && dmTarget ? [myUUID, dmTarget.uuid] : team.map(t => t.uuid)
    await Promise.all(targets.map(uid => dbInsert('message_pins', {
      message_id:m.id, conversation_id:orgId, user_id:uid,
      pinned_by:myUUID, pinned_by_name:myName, context:ctx })))
    loadTeamPins()
  }
  const PinBar = ({ ctx, source }) => {
    const list = teamPins.filter(p => p.context === ctx).map(p => ({ p, m: source.find(x => x.id === p.message_id) })).filter(x => x.m && !x.m.deletedAt)
    if (!list.length) return null
    return (
      <div style={{background:`${C.gold}11`,borderBottom:`1px solid ${C.gold}33`,padding:'8px 16px',maxHeight:110,overflowY:'auto',flexShrink:0}}>
        <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>📌 Pinned</div>
        {list.map(({ p, m }) => (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0'}}>
            <div style={{flex:1,fontSize:11,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              <b style={{color:C.gold}}>{m.senderName}:</b> {(splitAtts(m.content).text || '📎 attachment')}
              {p.pinned_by !== myUUID && <span style={{color:C.muted,fontSize:9}}> · pinned by {p.pinned_by_name}</span>}
            </div>
            <button onClick={() => togglePinTeam(m, ctx)} title="Unpin (removes it from your view only)"
              style={{background:'none',border:'none',color:C.muted,fontSize:10,cursor:'pointer',padding:2,flexShrink:0}}>✕</button>
          </div>
        ))}
      </div>
    )
  }
  const PinBtns = ({ m, ctx }) => !m.deletedAt && (
    <>
      <button onClick={() => togglePinTeam(m, ctx)} title={teamPinnedIds.has(m.id) ? 'Unpin' : 'Pin (only for you)'}
        style={{background:'none',border:'none',color:teamPinnedIds.has(m.id)?C.gold:C.muted,fontSize:11,cursor:'pointer',padding:0}}>📌</button>
      <button onClick={() => pinForAllTeam(m, ctx)} title={ctx==='team_dm' ? 'Pin for both of you' : 'Pin for the whole team'}
        style={{background:'none',border:'none',color:C.muted,fontSize:9,fontWeight:700,cursor:'pointer',padding:0}}>📌ALL</button>
    </>
  )

  // ── Shared canvas for the open Team Hub DM ──
  const [dmCanvasOpen, setDmCanvasOpen] = useState(false)
  const [generalCanvasOpen, setGeneralCanvasOpen] = useState(false)
  useEffect(() => { setDmCanvasOpen(false) }, [dmTarget])
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

  // Ping button feedback — huddlePinging = { name, status: 'sending'|'sent'|'failed' }
  const pingStatus = (coach) => (huddlePinging && huddlePinging.name === coach.name) ? huddlePinging.status : null
  const pingLabel = (coach, idle) => {
    const s = pingStatus(coach)
    return s === 'sending' ? 'Sending…' : s === 'sent' ? 'Invited ✓' : s === 'failed' ? 'Failed ✕' : idle
  }
  const pingBtnStyle = (coach, base) => {
    const s = pingStatus(coach)
    if (s === 'sent')   return { ...base, background:`${C.success}22`, border:`1px solid ${C.success}44`, color:C.success }
    if (s === 'failed') return { ...base, background:`${C.danger}22`, border:`1px solid ${C.danger}44`, color:C.danger }
    if (s === 'sending') return { ...base, opacity:.65, cursor:'default' }
    return base
  }
  const PingError = ({ coach }) => pingStatus(coach) === 'failed'
    ? <div style={{fontSize:10,color:C.danger,marginTop:3}}>Could not send invite — try again</div>
    : null

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
    const mentioned = notifyMentions(msg.content, 'Team Hub #general')
    notifyTeamMessage(otherCoaches, msg.content, mentioned)
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
    const mentioned = notifyMentions(reply.content, 'a Team Hub thread')
    // Alert the thread starter plus everyone who has replied in the thread.
    const participants = new Map()
    if (activeThread?.senderId) participants.set(activeThread.senderId, { uuid: activeThread.senderId })
    for (const r of (threadReplies[activeThread.id] || [])) if (r.senderId) participants.set(r.senderId, { uuid: r.senderId })
    notifyTeamMessage([...participants.values()], reply.content, mentioned)
  }

  function sendDm() {
    if ((!newDm.trim() && !hasPending('dm')) || !dmTarget) return
    const markers = takePending('dm')
    const key = [myUUID, dmTarget.uuid].sort().join('_')
    const msg = { id:'dm'+Date.now(), senderId:myUUID, senderName:myName, content:[newDm.trim(), markers].filter(Boolean).join('\n'), createdAt:new Date().toISOString(), threadId:null }
    setDmMessages(prev => ({ ...prev, [key]:[...(prev[key]||[]), msg] }))
    setNewDm('')
    stopTyping()
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, content:msg.content, is_dm:true, dm_to_id:dmTarget.uuid, dm_to_name:dmTarget.name, thread_id:null })
      .then(() => { loadTeamChat(); broadcastNewMessage() })
    notifyTeamMessage([dmTarget], msg.content)
  }
  // Reply inside the DM thread panel — persists as thread_id under the root message
  function sendDmReply() {
    if ((!newDmReply.trim() && !hasPending('dm-thread')) || !dmTarget || !dmThreadRoot) return
    const markers = takePending('dm-thread')
    const key = [myUUID, dmTarget.uuid].sort().join('_')
    const root = dmThreadRoot
    const msg = { id:'dm'+Date.now(), senderId:myUUID, senderName:myName, content:[newDmReply.trim(), markers].filter(Boolean).join('\n'), createdAt:new Date().toISOString(), threadId:root.id }
    setDmReplies(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [root.id]: [ ...((prev[key]||{})[root.id]||[]), msg ] } }))
    setDmMessages(prev => ({ ...prev, [key]:(prev[key]||[]).map(m => m.id===root.id ? {...m, replyCount:(m.replyCount||0)+1} : m) }))
    setNewDmReply('')
    stopTyping()
    dbInsert('team_messages', { org_id:orgId, sender_id:myUUID, sender_name:myName, content:msg.content, is_dm:true, dm_to_id:dmTarget.uuid, dm_to_name:dmTarget.name, thread_id:root.id })
      .then(() => { loadTeamChat(); broadcastNewMessage() })
    // Reply-specific notification: names the thread (parent preview) so the
    // recipient knows which conversation to open — clicking lands in this DM.
    const strip = t => String(t || '').replace(/\[\[file\|[^\]]*\]\]/g, '📎 attachment').trim()
    const parentPreview = strip(root.content).slice(0, 60)
    const replyPreview  = strip(msg.content).slice(0, 80)
    if (dmTarget.uuid && dmTarget.uuid !== myUUID) {
      sendNotification({
        recipientId: dmTarget.uuid, senderId: myUUID, senderName: myName,
        type: 'dm_thread_reply',
        body: `↩️ ${myName} replied in your thread ("${parentPreview}"): "${replyPreview}"`,
        linkTo: 'team',
      })
    }
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
  const dmConvoReplies = dmKey ? (dmReplies[dmKey] || {}) : {}
  useEffect(() => { setDmThreadRoot(null); setNewDmReply('') }, [dmTarget])
  // Eden admins who aren't the owner never see OTHER non-owner Eden admins as a DM option —
  // only the owner account appears for them among admins.
  const OWNER_EMAIL = 'info@edencommunications.io'
  const isAdminRole2 = r => r === 'super_admin' || r === 'company_admin'
  const iAmNonOwnerEdenAdmin = isAdminRole2(myRole) && orgId === EDEN_ORG_ID && email.toLowerCase() !== OWNER_EMAIL
  const otherCoaches = team.filter(c =>
    c.uuid !== myUUID &&
    !(iAmNonOwnerEdenAdmin && isAdminRole2(c.role) && (c.email || '') !== OWNER_EMAIL))

  // ── Mark conversations as seen while they're on screen ──────
  useEffect(() => {
    if (section === 'chat' && (chatView === 'main' || chatView === 'thread')) markSeen('general')
  }, [section, chatView, messages, threadReplies]) // eslint-disable-line
  useEffect(() => {
    if (section === 'chat' && chatView === 'dm' && dmKey) markSeen(dmKey)
  }, [section, chatView, dmKey, dmMessages, dmReplies]) // eslint-disable-line

  // ── Unread counts (messages from others newer than last viewed) ──
  const isUnread = (m, key) => !m.deletedAt && m.senderId !== myUUID && new Date(m.createdAt).getTime() > seenAt(seen, key)
  const generalUnread =
    messages.filter(m => !m.isDm && isUnread(m, 'general')).length +
    Object.values(threadReplies).flat().filter(r => isUnread(r, 'general')).length
  const dmUnreadCount = (key) =>
    (dmMessages[key] || []).filter(m => isUnread(m, key)).length +
    Object.values(dmReplies[key] || {}).flat().filter(m => isUnread(m, key)).length
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
    { key:'communities', icon:'👥', label:'Communities', badge: commUnread && section !== 'communities' },
    { key:'calendar', icon:'🗓',  label:'My Calendar' },
    { key:'huddle',   icon:'🎙',  label:'Huddle',     badge: huddleActive || !!liveHuddle },
    ...(myDbas.length ? [{ key:'dbas', icon:'🏷', label:'My DBAs', badge: dbaUnread }] : []),
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
                  <span style={{color:C.muted}}>#</span> <span style={{fontWeight:generalUnread>0?700:400}}>{generalName}</span>
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
                        <LN>{coach.name[0]}</LN>
                      </div>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,fontWeight:unread>0?700:400}}>
                        <LN>{coach.name.split(' ')[0]}</LN>{isTyping && <span style={{color:C.gold,fontStyle:'italic',fontWeight:400}}> …typing</span>}
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
                  <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',gap:6}}>
                        # {generalName}
                        {iAmAdmin && (
                          <button onClick={renameGeneral} title="Rename this channel (admin only)"
                            style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer',padding:0}}>✏️</button>
                        )}
                      </div>
                      <button onClick={()=>setShowChannelMembers(true)}
                        style={{background:'none',border:'none',padding:0,fontSize:10,color:C.gold,marginTop:1,cursor:'pointer',fontWeight:600}}>
                        Main channel · {team.length} members ▾
                      </button>
                    </div>
                    <button onClick={() => setGeneralCanvasOpen(true)} title="Open the team canvas — a live doc the whole team can edit"
                      style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 12px',color:C.white,fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                      📝 Canvas
                    </button>
                  </div>
                  {generalCanvasOpen && orgId && (
                    <CanvasPanel scope={`teamgeneral:${orgId}`} label={`# ${generalName}`} isMobile={isMobile} myId={myUUID} isAdmin={iAmAdmin} onClose={() => setGeneralCanvasOpen(false)}/>
                  )}

                  <PinBar ctx="team_general" source={messages.filter(m => !m.isDm)}/>
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
                              <DeletedBubble surface="general-root" m={msg} isAdminRole={isAdminRole} C={C} />
                            ) : (
                              <div style={{fontSize:13,lineHeight:1.5,background:C.card,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                                {renderBody(msg.content, C.white)}
                              </div>
                            )}
                            {!msg.deletedAt && liveLoadedRef.current && (
                              <ReactionBar table="team_messages" messageId={msg.id} myId={myUUID}
                                reactions={reactions[msg.id]} accent={C.gold} onChange={setRx(msg.id)} />
                            )}
                            <div style={{display:'flex',gap:8,marginTop:5,alignItems:'center'}}>
                              <PinBtns m={msg} ctx="team_general"/>
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
                      <ClipBtn target="main"/><MicBtn target="main"/>
                      <MentionInput value={newMessage} onChange={v => { setNewMessage(v); if (v) sendTyping('general') }} onSubmit={sendMessage}
                        candidates={team.filter(t => t.uuid !== myUUID).map(t => t.name)}
                        colors={C}
                        placeholder={`Message #${generalName}… tag with @Name (Enter to send)`}
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
                                <DeletedBubble surface="general-reply" m={r} isAdminRole={isAdminRole} C={C} fontSize={11} radius={7} padding="8px 10px" />
                              ) : (
                                <div style={{fontSize:12,lineHeight:1.5,background:C.card,borderRadius:7,padding:'8px 10px',border:`1px solid ${C.border}`}}>{renderBody(r.content, C.white)}</div>
                              )}
                              {!r.deletedAt && liveLoadedRef.current && (
                                <ReactionBar table="team_messages" messageId={r.id} myId={myUUID}
                                  reactions={reactions[r.id]} accent={C.gold} onChange={setRx(r.id)} />
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
                        <ClipBtn target="thread"/><MicBtn target="thread"/>
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
              <div style={{flex:1,display:'flex',flexDirection: isMobile ? 'column' : 'row',overflow: isMobile ? 'auto' : 'hidden'}}>
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight: isMobile ? '80vh' : 'auto'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                  <button onClick={() => setChatView('main')} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                  <div style={{width:30,height:30,borderRadius:15,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.gold,flexShrink:0}}>
                    <LN>{dmTarget.name[0]}</LN>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white}}><LN>{dmTarget.name}</LN></div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:dmTarget.label?'none':'capitalize'}}>
                      {dmTarget.label || dmTarget.role}{dmTarget.isHeadCoach?' · Head Coach':''}
                    </div>
                  </div>
                  <button onClick={() => setDmCanvasOpen(true)} title="Open your shared canvas — a live doc you both can edit"
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 12px',color:C.white,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    📝 Canvas
                  </button>
                  <button onClick={() => { setSection('huddle'); startHuddle() }}
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    🎙 Huddle
                  </button>
                </div>

                {dmCanvasOpen && dmKey && (
                  <CanvasPanel scope={`teamdm:${dmKey}`} label={`you & ${dmTarget.name.split(' ')[0]}`} isMobile={isMobile} myId={myUUID} isAdmin={iAmAdmin} onClose={() => setDmCanvasOpen(false)}/>
                )}
                <PinBar ctx="team_dm" source={dmConvo}/>
                <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                  {dmConvo.length===0 && (
                    <div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>
                      Start your conversation with <LN>{dmTarget.name}</LN>
                    </div>
                  )}
                  {dmConvo.map(msg => {
                    const isMine = msg.senderId===myUUID
                    const reps = dmConvoReplies[msg.id] || []
                    const lastRep = reps[reps.length-1]
                    const repUnread = !!lastRep && lastRep.senderId !== myUUID && new Date(lastRep.createdAt).getTime() > seenAt(seen, dmKey)
                    return (
                      <div key={msg.id} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:isMine?'flex-end':'flex-start'}}>
                          <div style={{maxWidth:'72%'}}>
                            {msg.deletedAt ? (
                              <DeletedBubble surface="dm-root" m={msg} isAdminRole={isAdminRole} C={C} radius={12} padding="10px 13px" />
                            ) : (
                              <div style={{background:isMine?C.gold:C.card,border:isMine?'none':`1px solid ${C.border}`,borderRadius:12,padding:'10px 13px'}}>
                                <div style={{fontSize:13,color:isMine?C.black:C.white,lineHeight:1.5}}>{renderBody(msg.content, isMine?C.black:C.white, isMine)}</div>
                              </div>
                            )}
                            {!msg.deletedAt && liveLoadedRef.current && (
                              <ReactionBar table="team_messages" messageId={msg.id} myId={myUUID}
                                reactions={reactions[msg.id]} accent={C.gold} onChange={setRx(msg.id)} alignRight={isMine} />
                            )}
                            <div style={{fontSize:10,color:C.muted,marginTop:3,textAlign:isMine?'right':'left',display:'flex',gap:8,alignItems:'center',justifyContent:isMine?'flex-end':'flex-start'}}>
                              <span>{timeAgo(msg.createdAt)}</span>
                              <PinBtns m={msg} ctx="team_dm"/>
                              <button onClick={() => setDmThreadRoot(msg)} title="Open the thread under this message"
                                style={{background:'none',border:'none',color:dmThreadRoot?.id===msg.id?C.gold:C.muted,fontSize:10,cursor:'pointer',padding:0,fontWeight:dmThreadRoot?.id===msg.id?700:400}}>↪ Reply</button>
                              {reps.length > 0 && (
                                <button onClick={() => setDmThreadRoot(msg)} title="Open thread"
                                  style={{background:repUnread?`${C.gold}20`:'none',border:repUnread?`1px solid ${C.gold}44`:'none',borderRadius:8,padding:repUnread?'1px 7px':0,fontSize:9,fontWeight:repUnread?800:700,color:repUnread?C.gold:C.muted,cursor:'pointer'}}>
                                  {repUnread && '● '}🧵 {reps.length} {reps.length===1?'reply':'replies'}
                                </button>
                              )}
                            </div>
                          </div>
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
                  <ClipBtn target="dm"/><MicBtn target="dm"/>
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

              {/* DM thread panel — same side-panel experience as #general and client Messages */}
              {dmThreadRoot && (() => {
                const root = dmConvo.find(m => m.id === dmThreadRoot.id) || dmThreadRoot
                const reps = dmConvoReplies[root.id] || []
                const rootMine = root.senderId === myUUID
                return (
                  <div style={{width: isMobile ? '100%' : 320, borderTop: isMobile ? `1px solid ${C.border}` : 'none', borderLeft: isMobile ? 'none' : `1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow: isMobile ? 'visible' : 'hidden'}}>
                    <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
                      <button onClick={() => setDmThreadRoot(null)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.white}}>Thread</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>{reps.length} {reps.length===1?'reply':'replies'}</div>
                      </div>
                      <button onClick={() => setDmThreadRoot(null)}
                        style={{marginLeft:'auto',background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',color:C.muted,fontSize:10,fontWeight:700,cursor:'pointer'}}>✕ Close</button>
                    </div>

                    <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                      <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                        <div style={{width:30,height:30,borderRadius:6,background:rootMine?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:rootMine?C.black:C.gold,flexShrink:0}}>
                          {(root.senderName||'?')[0]}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                            <span style={{fontSize:12,fontWeight:700,color:C.white}}><LN>{root.senderName}</LN></span>
                            <span style={{fontSize:10,color:C.muted}}>{timeAgo(root.createdAt)}</span>
                          </div>
                          {root.deletedAt ? (
                            <DeletedBubble surface="dm-thread-root" m={root} isAdminRole={isAdminRole} C={C} fontSize={11} radius={7} padding="8px 10px" />
                          ) : (
                            <div style={{fontSize:12,color:C.white,lineHeight:1.5}}>{renderBody(root.content, C.white)}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{flex:1,overflowY:'auto',padding:'8px 14px',minHeight: isMobile ? 120 : 'auto'}}>
                      {reps.length===0 && <div style={{fontSize:11,color:C.muted,textAlign:'center',padding:'16px 0'}}>No replies yet — start the thread below.</div>}
                      {reps.map(r => {
                        const rMine = r.senderId===myUUID
                        return (
                          <div key={r.id} style={{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start'}}>
                            <div style={{width:28,height:28,borderRadius:6,background:rMine?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:rMine?C.black:C.gold,flexShrink:0}}>
                              {(r.senderName||'?')[0]}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                                <span style={{fontSize:11,fontWeight:700,color:rMine?C.gold:C.white}}><LN>{r.senderName}</LN></span>
                                <span style={{fontSize:9,color:C.muted}}>{timeAgo(r.createdAt)}</span>
                              </div>
                              {r.deletedAt ? (
                                <DeletedBubble surface="dm-thread-reply" m={r} isAdminRole={isAdminRole} C={C} fontSize={11} radius={7} padding="8px 10px" />
                              ) : (
                                <div style={{fontSize:12,lineHeight:1.5,background:C.card,borderRadius:7,padding:'8px 10px',border:`1px solid ${C.border}`}}>{renderBody(r.content, C.white)}</div>
                              )}
                              {!r.deletedAt && liveLoadedRef.current && (
                                <ReactionBar table="team_messages" messageId={r.id} myId={myUUID}
                                  reactions={reactions[r.id]} accent={C.gold} onChange={setRx(r.id)} />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{padding:'10px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                      <TypingHint ctx={`dm:${dmKey}`}/>
                      <PendingChips target="dm-thread"/>
                      <div style={{display:'flex',gap:8}}>
                        <ClipBtn target="dm-thread"/><MicBtn target="dm-thread"/>
                        <MentionInput value={newDmReply} onChange={v => { setNewDmReply(v); if (v) sendTyping(`dm:${dmKey}`) }} onSubmit={sendDmReply}
                          candidates={[dmTarget.name]}
                          colors={C}
                          placeholder="Reply in thread…"
                          inputStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                        <button onClick={sendDmReply} disabled={!newDmReply.trim() && !hasPending('dm-thread')}
                          style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 12px',fontWeight:800,color:C.black,fontSize:12,cursor:'pointer',opacity:(newDmReply.trim()||hasPending('dm-thread'))?1:.4}}>
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}
              </div>
            )}
            {/* Hidden file input shared by all three composers */}
            <input ref={fileInputRef} type="file" multiple style={{display:'none'}} onChange={onFilePicked}/>

            {/* #general members modal */}
            {showChannelMembers && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
                onClick={()=>setShowChannelMembers(false)}>
                <div onClick={e=>e.stopPropagation()}
                  style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:20,width:'100%',maxWidth:400,maxHeight:'75vh',display:'flex',flexDirection:'column'}}>
                  <div style={{fontSize:15,fontWeight:800,color:C.white,marginBottom:2}}>Members — # {generalName}</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Everyone on your team is in the main channel automatically.</div>
                  <div style={{overflowY:'auto'}}>
                    {team.map(t=>(
                      <div key={t.uuid} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:`1px solid ${C.border}`}}>
                        <div style={{width:30,height:30,borderRadius:15,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.gold,flexShrink:0}}>
                          {(t.name||'?')[0]}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.white}}>{t.name}{t.uuid===myUUID?' (you)':''}</div>
                          <div style={{fontSize:10,color:C.muted,textTransform:t.label?'none':'capitalize'}}>{t.label || (t.role||'').replace(/_/g,' ')}{t.isHeadCoach?' · Head Coach':''}</div>
                        </div>
                        {t.uuid!==myUUID && (
                          <button onClick={()=>{ setShowChannelMembers(false); setDmTarget(t); setChatView('dm') }}
                            style={{background:`${C.gold}15`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:10,fontWeight:700,cursor:'pointer'}}>💬 DM</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setShowChannelMembers(false)}
                    style={{marginTop:14,background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 14px',color:C.muted,fontSize:12,cursor:'pointer',alignSelf:'flex-end'}}>Close</button>
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
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  {calSaved && <span style={{fontSize:10,color:C.success,fontWeight:700}}>✓ Saved</span>}
                  {calendarUrl && (
                    <button onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener')}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:7,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      ↗ Open in Google
                    </button>
                  )}
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
              <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
                {isMobile && (
                  <div style={{padding:'8px 14px',background:`${C.gold}10`,borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.muted,lineHeight:1.5,flexShrink:0}}>
                    📱 On phones, Google blocks sign-in inside embedded calendars. If you see a cookies/sign-in message below, tap <b style={{color:C.gold}}>↗ Open in Google</b> above — or make the calendar public in Google settings so it embeds without sign-in.
                  </div>
                )}
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
            MY DBAs — sub-brands I run or was delegated into
        ══════════════════════════════════════════════════ */}
        {section==='dbas' && (
          <div style={{flex:1,overflowY:'auto',padding:16}}>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white}}>🏷 My DBAs</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2,lineHeight:1.5}}>
                {dbaScope==='org'
                  ? 'Every sub-brand in your organization. Open one to run its chat, huddles, calendar and members.'
                  : 'The sub-brands you run. Open one to manage its chat, huddles, calendar and members.'}
              </div>
            </div>
            {myDbas.map(d => {
              const open = openDba === d.id
              const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/,'')
              const link = `${window.location.origin}${base}/${d.slug}`
              return (
                <div key={d.id} style={{border:`1px solid ${C.border}`,borderLeft:`3px solid ${d.brand_color||C.gold}`,borderRadius:10,padding:'10px 12px',marginBottom:10,opacity:d.is_active?1:0.55}}>
                  <div onClick={() => setOpenDba(open ? null : d.id)} title={open?'Collapse':'Expand'}
                    style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                    <span style={{fontSize:11,color:open?C.gold:C.muted,width:12,display:'inline-block',transform:open?'rotate(90deg)':'none',transition:'transform .15s'}}>▶</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:800,color:C.white}}>
                        {d.name}{!d.is_active && <span style={{fontSize:10,color:C.gold,fontWeight:700}}> · ARCHIVED</span>}
                      </div>
                      <div style={{fontSize:10,color:C.muted}}>
                        /{d.slug} · {d.coach_name ? `Coach: ${d.coach_name}` : 'No coach yet'} · {(d.members||[]).length} member{(d.members||[]).length===1?'':'s'}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); window.open(link, '_blank') }}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:7,padding:'5px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                      Open ↗
                    </button>
                  </div>
                  {open && (
                    <div style={{marginTop:10,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                      {(d.members||[]).length === 0 && <div style={{fontSize:11,color:C.muted}}>No members yet.</div>}
                      {(d.members||[]).map(m => (
                        <div key={m.email} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                          <span style={{flex:1,fontSize:12,color:C.white,fontWeight:600,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            <LN>{m.name}</LN> <span style={{color:C.muted,fontWeight:400}}>· {m.email}</span>
                            {m.pure === false && <span style={{fontSize:9,color:C.success,fontWeight:700}}> · FULL CLIENT</span>}
                          </span>
                        </div>
                      ))}
                      {(d.delegates||[]).length > 0 && (
                        <div style={{fontSize:10,color:C.muted,marginTop:8}}>
                          Staff with access: {(d.delegates||[]).map(g => g.name).join(', ')}
                        </div>
                      )}
                      <div style={{fontSize:10,color:C.muted,marginTop:8}}>
                        Chat, huddles, calendar and channels are managed inside the DBA space — hit <b style={{color:C.gold}}>Open ↗</b> to run it. (Inviting new members is done by your org admin.)
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
                        <LN>{coach.name[0]}</LN>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:C.white,fontWeight:500}}><LN>{coach.name}</LN></div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                          {coach.role}{coach.isHeadCoach?' · Head Coach':''}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <button disabled={pingStatus(coach)==='sending'}
                          onClick={async () => { if (liveHuddle) { pingCoach(coach) } else { const ok = await startHuddle(); if (ok) pingCoach(coach) } }}
                          style={pingBtnStyle(coach, {background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'})}>
                          {pingLabel(coach,'Invite')}
                        </button>
                        <PingError coach={coach}/>
                      </div>
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
                        <LN>{coach.name[0]}</LN>
                      </div>
                      <div style={{flex:1,fontSize:12,color:C.white}}><LN>{coach.name}</LN></div>
                      <div style={{textAlign:'right'}}>
                        <button disabled={pingStatus(coach)==='sending'} onClick={() => pingCoach(coach)}
                          style={pingBtnStyle(coach, {background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'5px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'})}>
                          {pingLabel(coach,'Ping to Join')}
                        </button>
                        <PingError coach={coach}/>
                      </div>
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
                  <LN>{coach.name[0]}</LN>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:C.white,fontWeight:500}}><LN>{coach.name}</LN></div>
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
