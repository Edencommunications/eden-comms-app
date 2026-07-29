// ════════════════════════════════════════════════════════════════
// Communities.jsx — group chat spaces (client communities + team communities)
// Used from Messaging.jsx (context="clients") and Week7 Team Hub (context="team").
//
// Tables: communities, community_members, community_messages,
//         message_pins (context='community'), audit_logs, notifications
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const EDEN_ORG_ID   = 'b0000000-0000-0000-0000-000000000001'
const H = {
  'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
}
const C = {
  gold: '#ffa600', black: '#000000', white: '#ffffff',
  surface: '#111111', card: '#1a1a1a', border: '#2a2a2a',
  muted: '#888888', success: '#4FD89A', danger: '#ff4444',
}

async function dbGet(table, params = '') {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}
async function dbInsert(table, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(body),
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}
async function dbUpdate(table, params, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method: 'PATCH', headers: H, body: JSON.stringify(body),
    })
    return r.ok
  } catch { return false }
}
async function dbDelete(table, params) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'DELETE', headers: H })
    return r.ok
  } catch { return false }
}
function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
const escRe = s => String(s||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ════════════════════════════════════════════════════════════════
// Props:
//   me        = { id, name, role }   (id = user_profiles uuid — may be null on pure-demo accounts)
//   companyId = org uuid (defaults to Eden)
//   context   = 'clients' | 'team'
//   isMobile  = bool
// ════════════════════════════════════════════════════════════════
export default function Communities({ me, companyId = EDEN_ORG_ID, context = 'clients', isMobile = false }) {
  const myId   = me?.id || null
  const myName = me?.name || 'User'
  const myRole = me?.role || 'client'
  const isAdmin  = myRole === 'super_admin' || myRole === 'company_admin'
  const isStaff  = myRole !== 'client'
  // Who can create/manage communities here
  const canManage = context === 'team' ? isAdmin : (isAdmin || myRole === 'coach' || myRole === 'head_coach')
  // Who can delete any message (others can always delete their own)
  const canDeleteAny = context === 'team' ? isAdmin : (isAdmin || myRole === 'coach' || myRole === 'head_coach')

  const [communities, setCommunities] = useState([])
  const [loaded,      setLoaded]      = useState(false)
  const [activeId,    setActiveId]    = useState(null)
  const [members,     setMembers]     = useState([])
  const [messages,    setMessages]    = useState([])
  const [pins,        setPins]        = useState([])
  const [newMsg,      setNewMsg]      = useState('')
  const [replyTo,     setReplyTo]     = useState(null)   // root message being replied to
  const [showCreate,  setShowCreate]  = useState(false)
  const [newName,     setNewName]     = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [roster,      setRoster]      = useState(null)   // candidates for adding
  const [rosterSearch,setRosterSearch]= useState('')
  const bottomRef = useRef(null)
  const listRef = useRef(null)
  const msgCountRef = useRef(-1)   // -1 = community just opened (force scroll once)

  const active = communities.find(c => c.id === activeId) || null

  // ── Load community list ─────────────────────────────────────
  async function loadCommunities() {
    if (!myId) { setLoaded(true); return }
    try {
      let list = []
      if (isAdmin) {
        list = (await dbGet('communities', `company_id=eq.${companyId}&context=eq.${context}&is_active=eq.true&order=created_at.asc`)) || []
      } else {
        const mem = (await dbGet('community_members', `user_id=eq.${myId}&select=community_id`)) || []
        const ids = mem.map(m => m.community_id)
        const mine = (await dbGet('communities', `created_by=eq.${myId}&context=eq.${context}&is_active=eq.true`)) || []
        const inIds = ids.length
          ? (await dbGet('communities', `id=in.(${ids.join(',')})&context=eq.${context}&is_active=eq.true`)) || []
          : []
        const seen = new Set()
        list = [...mine, ...inIds].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      }
      setCommunities(list)
    } finally { setLoaded(true) }
  }
  useEffect(() => { loadCommunities() }, [myId, companyId, context])

  // ── Load members + messages + pins for the open community ──
  async function loadMembers(cid = activeId) {
    if (!cid) return
    const rows = await dbGet('community_members', `community_id=eq.${cid}&order=created_at.asc`)
    if (Array.isArray(rows)) setMembers(rows)
  }
  async function loadMessages(cid = activeId) {
    if (!cid) return
    const rows = await dbGet('community_messages', `community_id=eq.${cid}&order=created_at.asc&limit=500`)
    if (Array.isArray(rows)) {
      // Only auto-scroll on first open, or when new messages arrive while the user
      // is already near the bottom — never yank them down while reading old messages.
      const el = listRef.current
      const nearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 150)
      const firstLoad = msgCountRef.current < 0
      const grew = rows.length > msgCountRef.current
      msgCountRef.current = rows.length
      setMessages(rows)
      if (firstLoad || (grew && nearBottom)) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
      }
    }
  }
  async function loadPins(cid = activeId) {
    if (!cid || !myId) return
    const rows = await dbGet('message_pins', `conversation_id=eq.${cid}&user_id=eq.${myId}&context=eq.community`)
    if (Array.isArray(rows)) setPins(rows)
  }
  useEffect(() => {
    setMembers([]); setMessages([]); setPins([]); setReplyTo(null)
    msgCountRef.current = -1
    if (!activeId) return
    loadMembers(); loadMessages(); loadPins()
    const iv = setInterval(() => loadMessages(), 6000)
    return () => clearInterval(iv)
  }, [activeId])

  const amMember = members.some(m => m.user_id === myId)
  const canPost  = amMember || isAdmin || (active && active.created_by === myId)

  // ── Create community ────────────────────────────────────────
  async function createCommunity() {
    const name = newName.trim()
    if (!name || !myId) return
    const rows = await dbInsert('communities', {
      company_id: companyId, name, context, created_by: myId, created_by_name: myName, is_active: true,
    })
    if (!rows?.[0]?.id) { alert('Could not create the community — run the database update first.'); return }
    // creator is automatically a member
    await dbInsert('community_members', {
      community_id: rows[0].id, user_id: myId, user_name: myName, user_role: myRole,
      added_by: myId, added_by_name: myName,
    })
    setNewName(''); setShowCreate(false)
    await loadCommunities()
    setActiveId(rows[0].id)
  }
  async function archiveCommunity(c) {
    if (!window.confirm(`Archive "${c.name}"? Members will no longer see it.`)) return
    await dbUpdate('communities', `id=eq.${c.id}`, { is_active: false })
    dbInsert('audit_logs', { action:'community_archived', actor_id:myId, actor_name:myName, actor_role:myRole,
      target_type:'community', target_id:String(c.id), details:{ name:c.name, context } })
    if (activeId === c.id) setActiveId(null)
    loadCommunities()
  }

  // ── Member management ───────────────────────────────────────
  async function openMembers() {
    setShowMembers(true); setRoster(null); setRosterSearch('')
    let rows = []
    if (context === 'team') {
      rows = (await dbGet('user_profiles', `company_id=eq.${companyId}&role=neq.client&select=id,name,full_name,email,role,is_active,community_only&order=name.asc.nullslast`)) || []
    } else if (isAdmin) {
      rows = (await dbGet('user_profiles', `company_id=eq.${companyId}&select=id,name,full_name,email,role,is_active,community_only,coach_id&order=name.asc.nullslast`)) || []
    } else {
      // coach: own active roster + offboarded own clients (community-only re-entry) + staff
      const [mine, staff] = await Promise.all([
        dbGet('user_profiles', `company_id=eq.${companyId}&role=eq.client&coach_id=eq.${myId}&select=id,name,full_name,email,role,is_active,community_only`),
        dbGet('user_profiles', `company_id=eq.${companyId}&role=neq.client&select=id,name,full_name,email,role,is_active,community_only`),
      ])
      rows = [...(mine||[]), ...(staff||[])]
    }
    setRoster(rows)
  }
  async function addMember(p) {
    const r = await dbInsert('community_members', {
      community_id: activeId, user_id: p.id, user_name: p.name || p.full_name || p.email,
      user_role: p.role, added_by: myId, added_by_name: myName,
    })
    if (r === null) return // duplicate or table missing — list refresh will show truth
    // Offboarded client being added → grant community-only login access
    if (p.role === 'client' && p.is_active === false && !p.community_only) {
      await dbUpdate('user_profiles', `id=eq.${p.id}`, { community_only: true })
    }
    dbInsert('notifications', {
      recipient_id: p.id, sender_id: myId, sender_name: myName, type: 'community',
      body: `👥 ${myName} added you to the "${active?.name}" community`, is_read: false,
    })
    loadMembers()
  }
  async function removeMember(m) {
    if (!window.confirm(`Remove ${m.user_name} from "${active?.name}"?`)) return
    await dbDelete('community_members', `id=eq.${m.id}`)
    loadMembers()
  }

  // ── Mentions ────────────────────────────────────────────────
  function findMentions(text) {
    const hits = []
    for (const m of members) {
      if (m.user_id === myId || !m.user_name) continue
      const first = m.user_name.split(' ')[0]
      const re = new RegExp(`@(${escRe(m.user_name)}|${escRe(first)})(\\b|$)`, 'i')
      if (re.test(text)) hits.push(m)
    }
    return hits
  }
  function renderMentions(text, baseColor) {
    const parts = String(text||'').split(/(@[A-Za-z][A-Za-z'-]*(?:\s[A-Z][A-Za-z'-]*)?)/g)
    return parts.map((p,i) => p.startsWith('@')
      ? <span key={i} style={{ color:C.gold, fontWeight:700 }}>{p}</span>
      : <span key={i} style={{ color:baseColor }}>{p}</span>)
  }

  // ── Send / reply ────────────────────────────────────────────
  async function send() {
    const text = newMsg.trim()
    if (!text || !myId || !activeId) return
    setNewMsg('')
    const r = await dbInsert('community_messages', {
      community_id: activeId, sender_id: myId, sender_name: myName, sender_role: myRole,
      content: text, parent_id: replyTo?.id || null,
    })
    if (r === null) { alert('Could not send — run the database update first.'); setNewMsg(text); return }
    setReplyTo(null)
    for (const m of findMentions(text)) {
      dbInsert('notifications', {
        recipient_id: m.user_id, sender_id: myId, sender_name: myName, type: 'mention',
        body: `💬 ${myName} tagged you in "${active?.name}": "${text.slice(0,80)}"`, is_read: false,
      })
    }
    loadMessages()
  }

  // ── Delete (soft — audit-logged) ────────────────────────────
  function mayDelete(m) { return canDeleteAny || m.sender_id === myId }
  async function deleteMsg(m) {
    if (!window.confirm('Delete this message for everyone?\nIt stays permanently visible in the admin audit log.')) return
    const ok = await dbUpdate('community_messages', `id=eq.${m.id}`, {
      deleted_at: new Date().toISOString(), deleted_by: myId, deleted_by_name: myName,
    })
    if (!ok) { alert('Could not delete — run the database update first.'); return }
    dbInsert('audit_logs', { action:'message_deleted', actor_id:myId, actor_name:myName, actor_role:myRole,
      target_type:'community_message', target_id:String(m.id),
      details:{ content:m.content, sender_id:m.sender_id, sender_name:m.sender_name, community_id:activeId, community_name:active?.name, context:'community' } })
    loadMessages()
  }

  // ── Pins ────────────────────────────────────────────────────
  const pinnedIds = new Set(pins.map(p => p.message_id))

  function jumpToMsg(id) {
    const el = document.getElementById(`cmsg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior:'smooth', block:'center' })
    el.style.transition = 'background 0.4s'
    el.style.background = `${C.gold}33`
    el.style.borderRadius = '10px'
    setTimeout(() => { el.style.background = 'transparent' }, 1600)
  }
  async function togglePin(m) {
    if (!myId) return
    if (pinnedIds.has(m.id)) {
      await dbDelete('message_pins', `message_id=eq.${m.id}&user_id=eq.${myId}`)
    } else {
      const r = await dbInsert('message_pins', {
        message_id: m.id, conversation_id: activeId, context: 'community',
        user_id: myId, pinned_by: myId, pinned_by_name: myName,
      })
      if (r === null) { alert('Pinning is not set up yet — run the database update first.'); return }
    }
    loadPins()
  }
  async function pinForAll(m) {
    for (const mem of members) {
      await dbInsert('message_pins', {
        message_id: m.id, conversation_id: activeId, context: 'community',
        user_id: mem.user_id, pinned_by: myId, pinned_by_name: myName,
      })
    }
    loadPins()
    alert('Pinned for every member of this community.')
  }

  // ── Message grouping (roots + replies) ──────────────────────
  const repliesByParent = {}
  for (const m of messages) if (m.parent_id) (repliesByParent[m.parent_id] ||= []).push(m)
  const roots = messages.filter(m => !m.parent_id)

  const filteredRoster = (roster || []).filter(p => {
    const q = rosterSearch.trim().toLowerCase()
    if (!q) return true
    return (p.name || p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
  }).filter(p => !members.some(m => m.user_id === p.id))

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  const showList = !isMobile || !activeId
  const showChat = !isMobile || !!activeId

  function bubble(m, isReply = false) {
    const mine = m.sender_id === myId
    return (
      <div key={m.id} id={`cmsg-${m.id}`} style={{ marginBottom: isReply ? 8 : 4, marginLeft: isReply ? 34 : 0, display:'flex', gap:8, alignItems:'flex-start' }}>
        <div style={{ width: isReply?24:30, height: isReply?24:30, borderRadius:6, background: mine ? C.gold : `${C.gold}22`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize: isReply?9:11, fontWeight:700,
          color: mine ? C.black : C.gold, flexShrink:0 }}>
          {(m.sender_name||'?')[0]}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, fontWeight:700, color: mine ? C.gold : C.white }}>{m.sender_name}</span>
            {['super_admin','company_admin'].includes(m.sender_role) && <span style={{ fontSize:8, background:`${C.gold}22`, color:C.gold, padding:'1px 5px', borderRadius:4, fontWeight:700 }}>ADMIN</span>}
            {m.sender_role==='coach' && <span style={{ fontSize:8, background:'#2a2a2a', color:C.muted, padding:'1px 5px', borderRadius:4, fontWeight:700 }}>COACH</span>}
            <span style={{ fontSize:9, color:C.muted }}>{timeAgo(m.created_at)}</span>
            {pinnedIds.has(m.id) && <span style={{ fontSize:9, color:C.gold }}>📌</span>}
          </div>
          {m.deleted_at ? (
            <div style={{ fontSize:11, color:C.muted, fontStyle:'italic', border:`1px dashed ${C.border}`, borderRadius:8, padding:'8px 10px' }}>
              {isAdmin ? <>🗑 Deleted by {m.deleted_by_name||'staff'} (admins only): <span style={{ fontStyle:'normal' }}>{m.content}</span></> : <>Message deleted{m.deleted_by_name?` by ${m.deleted_by_name}`:''}</>}
            </div>
          ) : (
            <div style={{ fontSize:12, lineHeight:1.55, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 11px', wordBreak:'break-word' }}>
              {renderMentions(m.content, C.white)}
            </div>
          )}
          {!m.deleted_at && (
            <div style={{ display:'flex', gap:10, marginTop:3, alignItems:'center' }}>
              {!isReply && canPost && (
                <button onClick={() => setReplyTo(m)} style={{ background:'none', border:'none', color:C.muted, fontSize:10, cursor:'pointer', padding:0 }}>↪ Reply</button>
              )}
              <button onClick={() => togglePin(m)} title={pinnedIds.has(m.id)?'Unpin':'Pin (only for you)'}
                style={{ background:'none', border:'none', color: pinnedIds.has(m.id)?C.gold:C.muted, fontSize:10, cursor:'pointer', padding:0 }}>📌</button>
              {isStaff && (isAdmin || myRole==='va') && (
                <button onClick={() => pinForAll(m)} title="Pin for every member"
                  style={{ background:'none', border:'none', color:C.muted, fontSize:9, fontWeight:700, cursor:'pointer', padding:0 }}>📌ALL</button>
              )}
              {mayDelete(m) && (
                <button onClick={() => deleteMsg(m)} title="Delete (kept in admin audit log)"
                  style={{ background:'none', border:'none', color:C.muted, fontSize:10, cursor:'pointer', padding:0 }}>🗑</button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', background:C.black, overflow:'hidden' }}>
      {/* ── Community list ── */}
      {showList && (
        <div style={{ width: isMobile ? '100%' : 240, background:C.surface, borderRight: isMobile ? 'none' : `1px solid ${C.border}`,
          display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'14px 14px 8px', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, fontSize:13, fontWeight:800, color:C.white }}>👥 Communities</div>
            {canManage && (
              <button onClick={() => setShowCreate(true)}
                style={{ background:C.gold, border:'none', borderRadius:6, padding:'4px 10px', color:C.black, fontSize:11, fontWeight:800, cursor:'pointer' }}>＋ New</button>
            )}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'4px 8px' }}>
            {!loaded && <div style={{ padding:20, textAlign:'center', color:C.muted, fontSize:12 }}>Loading…</div>}
            {loaded && communities.length === 0 && (
              <div style={{ padding:'24px 12px', textAlign:'center', color:C.muted, fontSize:12, lineHeight:1.6 }}>
                No communities yet.{canManage ? ' Tap ＋ New to create one.' : ' Your coach can add you to one.'}
              </div>
            )}
            {communities.map(c => (
              <div key={c.id} onClick={() => setActiveId(c.id)}
                style={{ padding:'10px 10px', borderRadius:8, cursor:'pointer', marginBottom:2,
                  background: activeId===c.id ? `${C.gold}18` : 'transparent',
                  border: activeId===c.id ? `1px solid ${C.gold}44` : '1px solid transparent',
                  display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14 }}>#</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color: activeId===c.id ? C.gold : C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize:9, color:C.muted }}>by {c.created_by_name || '—'}</div>
                </div>
                {(isAdmin || c.created_by === myId) && (
                  <button onClick={e => { e.stopPropagation(); archiveCommunity(c) }} title="Archive community"
                    style={{ background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer', padding:2 }}>🗄</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat panel ── */}
      {showChat && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {!active ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:13, textAlign:'center', padding:20 }}>
              Select a community to open the conversation.
            </div>
          ) : (<>
            {/* Header */}
            <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              {isMobile && (
                <button onClick={() => setActiveId(null)} style={{ background:'none', border:'none', color:C.white, fontSize:16, cursor:'pointer', padding:'4px 6px' }}>←</button>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:C.white }}># {active.name}</div>
                <div style={{ fontSize:10, color:C.muted }}>{members.length} member{members.length===1?'':'s'}</div>
              </div>
              {(canManage && (isAdmin || active.created_by === myId)) && (
                <button onClick={openMembers}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 12px', color:C.white, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  👥 Members
                </button>
              )}
            </div>

            {/* Pinned bar */}
            {pins.length > 0 && (
              <div style={{ background:`${C.gold}11`, borderBottom:`1px solid ${C.gold}33`, padding:'8px 14px', maxHeight:110, overflowY:'auto', flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>📌 Pinned</div>
                {pins.map(p => {
                  const m = messages.find(x => x.id === p.message_id)
                  if (!m || m.deleted_at) return null
                  return (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 0' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:C.gold, flexShrink:0 }}>{m.sender_name}:</span>
                      <div onClick={() => jumpToMsg(m.id)} title="Jump to message"
                        style={{ flex:1, fontSize:11, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>{m.content}</div>
                      <button onClick={() => togglePin(m)} title="Unpin" style={{ background:'none', border:'none', color:C.muted, fontSize:10, cursor:'pointer', padding:2, flexShrink:0 }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'14px 14px 8px' }}>
              {roots.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:12 }}>No messages yet — start the conversation.</div>
              )}
              {roots.map(m => (
                <div key={m.id} style={{ marginBottom:12 }}>
                  {bubble(m)}
                  {(repliesByParent[m.id]||[]).map(r => bubble(r, true))}
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>

            {/* Composer */}
            {canPost ? (
              <div style={{ padding:'8px 12px 12px', background:C.surface, borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
                {replyTo && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 10px' }}>
                    <span style={{ fontSize:10, color:C.muted }}>↪ Replying to <b style={{ color:C.gold }}>{replyTo.sender_name}</b>: {String(replyTo.content||'').slice(0,50)}</span>
                    <button onClick={() => setReplyTo(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer' }}>✕</button>
                  </div>
                )}
                <div style={{ display:'flex', gap:6 }}>
                  <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), send())}
                    placeholder={`Message # ${active.name}… tag people with @Name`}
                    style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:18,
                      padding: isMobile ? '11px 14px' : '9px 13px', color:C.white, fontSize:13, outline:'none', minWidth:0 }}/>
                  <button onClick={send} disabled={!newMsg.trim()}
                    style={{ background:C.gold, border:'none', borderRadius:18, padding:'9px 16px',
                      fontWeight:800, color:C.black, fontSize:12, cursor:'pointer', opacity:newMsg.trim()?1:.4, flexShrink:0 }}>Send</button>
                </div>
              </div>
            ) : (
              <div style={{ padding:'10px 14px', background:C.surface, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, textAlign:'center' }}>
                You're viewing this community — only members can post.
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
          onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, width:'100%', maxWidth:380 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.white, marginBottom:4 }}>New {context==='team' ? 'team ' : ''}community</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>A group space where every member sees the same conversation.</div>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key==='Enter' && createCommunity()}
              placeholder={context==='team' ? 'e.g. Coach Standup' : 'e.g. Fat Loss Accountability'}
              style={{ width:'100%', boxSizing:'border-box', background:C.card, border:`1px solid ${C.gold}44`, borderRadius:8, padding:'10px 12px', color:C.white, fontSize:13, outline:'none', marginBottom:14 }}/>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowCreate(false)}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 14px', color:C.muted, fontSize:12, cursor:'pointer' }}>Cancel</button>
              <button onClick={createCommunity} disabled={!newName.trim()}
                style={{ background:C.gold, border:'none', borderRadius:8, padding:'8px 16px', color:C.black, fontSize:12, fontWeight:800, cursor:'pointer', opacity:newName.trim()?1:.4 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Members modal ── */}
      {showMembers && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
          onClick={() => setShowMembers(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, width:'100%', maxWidth:440, maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.white, marginBottom:2 }}>Members — {active?.name}</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>Adding an offboarded client automatically restores their login for communities only.</div>

            <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Current ({members.length})</div>
            <div style={{ maxHeight:140, overflowY:'auto', marginBottom:14 }}>
              {members.map(m => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ flex:1, fontSize:12, color:C.white }}>{m.user_name} <span style={{ fontSize:9, color:C.muted }}>({m.user_role})</span></div>
                  {m.user_id !== myId && (
                    <button onClick={() => removeMember(m)}
                      style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 8px', color:C.danger, fontSize:10, cursor:'pointer' }}>Remove</button>
                  )}
                </div>
              ))}
              {members.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:'6px 0' }}>No members yet.</div>}
            </div>

            <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Add people</div>
            <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search by name or email…"
              style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 11px', color:C.white, fontSize:12, outline:'none', marginBottom:8 }}/>
            <div style={{ flex:1, overflowY:'auto', minHeight:100 }}>
              {roster === null && <div style={{ fontSize:11, color:C.muted, padding:'8px 0' }}>Loading roster…</div>}
              {roster !== null && filteredRoster.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:'8px 0' }}>Nobody left to add.</div>}
              {filteredRoster.map(p => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {p.name || p.full_name || p.email}
                      <span style={{ fontSize:9, color:C.muted }}> ({p.role})</span>
                      {p.role==='client' && p.is_active===false && <span style={{ fontSize:8, background:'#2a2a2a', color:C.muted, padding:'1px 5px', borderRadius:4, fontWeight:700, marginLeft:5 }}>OFFBOARDED</span>}
                    </div>
                  </div>
                  <button onClick={() => addMember(p)}
                    style={{ background:C.gold, border:'none', borderRadius:6, padding:'4px 10px', color:C.black, fontSize:10, fontWeight:800, cursor:'pointer' }}>Add</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={() => setShowMembers(false)}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 16px', color:C.muted, fontSize:12, cursor:'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
