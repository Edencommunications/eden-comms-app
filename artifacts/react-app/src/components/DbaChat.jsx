// ════════════════════════════════════════════════════════════════
// DbaChat.jsx — DBA-scoped community chat + 1v1s (Team-Hub-style).
//
// Channels are `communities` rows with context 'dba:<dbaId>' (groups) or
// 'dbadm:<dbaId>' (1v1s — row name is the sorted '<idA>_<idB>' pair key).
// Messages/pins/audit ride the same tables Communities.jsx uses, so DBA
// chat never crosses into org communities or Team Hub (different context).
//
// Server config (per-DBA) comes from /api/dba/chat-config:
//   can_manage (coach / org admin), roster, "everyone" channel flags,
//   dm_enabled gating map (Phase 4 — empty for now), voice memo tier gate.
// Group channels are created via /api/dba/channel-create (server
// materializes membership so canvases + posting work for every member).
// 1v1s open via /api/dba/dm-open (server enforces who may DM whom).
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'
import { supabase } from '../supabaseClient'
import MentionInput from './MentionInput'
import { sendNotification } from './Notifications'
import CanvasPanel from './CanvasPanel'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const H = {
  'apikey': SUPABASE_ANON, get Authorization(){ return sbBearer() },
  'Content-Type': 'application/json',
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
async function apiPost(path, body) {
  try {
    const r = await fetch(`/api/dba/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sbAccessToken()}` },
      body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => null)
    return { ok: r.ok, ...(j || {}) }
  } catch { return { ok: false, error: 'Network error' } }
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

// Attachment markers: [[file|name|url|type]] with optional URI-encoded transcript
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
// Only ever render http(s) URLs — markers ride user content, so a crafted
// message could otherwise smuggle javascript:/data: URLs into the DOM.
function safeUrl(u) { try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:' } catch { return false } }

// ════════════════════════════════════════════════════════════════
// Props:
//   dba     = { id, name, coach_id, coach_name, ... }  (active DBA record)
//   primary = brand accent color for this DBA
//   isMobile
// ════════════════════════════════════════════════════════════════
export default function DbaChat({ dba, primary = '#ffa600', palette = null, isMobile = false }) {
  // Channel rows cycle through the DBA's saved palette so extra colors show up
  // Channels always use the brand's primary color — no palette cycling
  const channelColor = (_i) => primary
  const C = {
    gold: primary, black: '#000000', white: '#ffffff',
    surface: '#111111', card: '#1a1a1a', border: '#2a2a2a',
    muted: '#888888', success: '#4FD89A', danger: '#ff4444',
  }
  const dbaId = dba?.id || null

  // ── Server config: identity, roster, flags, gates ───────────
  const [cfg, setCfg] = useState(null)     // null = loading, false = error
  useEffect(() => {
    let dead = false
    setCfg(null)
    if (!dbaId) return
    fetch(`/api/dba/chat-config?id=${encodeURIComponent(dbaId)}`, {
      headers: { Authorization: `Bearer ${sbAccessToken()}` },
    }).then(r => r.json()).then(j => { if (!dead) setCfg(j?.ok ? j : false) })
      .catch(() => { if (!dead) setCfg(false) })
    return () => { dead = true }
  }, [dbaId])

  const myId      = cfg?.me?.id || null
  const myName    = cfg?.me?.name || 'User'
  const myRole    = cfg?.me?.role || 'client'
  const canManage = !!cfg?.can_manage
  const allFlags  = cfg?.all_flags || {}
  const dmEnabled = cfg?.dm_enabled || {}
  const voiceOn   = cfg?.voice_memos !== false
  // Per-channel delegated authority + tiers (Phase 4)
  const leaders   = cfg?.leaders || {}          // { [communityId]: { [userId]: {del,pin,canvas} } }
  const tiers     = cfg?.tiers || {}            // { [userId]: tierId }
  const tierDefs  = cfg?.tier_defs || []
  const myDm      = !!cfg?.my_dm                // server-computed: can I open 1v1s at all?
  const dmTargets = new Set(cfg?.dm_targets || [])
  const capsFor   = (channelId, userId) => (leaders[channelId] || {})[userId] || {}

  // Everyone who can appear in this DBA's chat (for DMs & pickers)
  const people = cfg ? [
    ...(cfg.coach ? [{ ...cfg.coach, kind: 'coach' }] : []),
    ...(cfg.admins || []).filter(a => a.id !== cfg?.coach?.id),
    ...(cfg.members || []),
  ].filter(p => p.id !== myId) : []
  const isPriv = (id) => id === cfg?.coach?.id || (cfg?.admins || []).some(a => a.id === id)
  // The server decides who can DM whom (tier, explicit grant, leadership,
  // or privilege — BOTH sides must qualify); we just render its answer.
  const dmUnlocked = (p) => myDm && dmTargets.has(p.id)
  // Admins & the coach see every channel automatically, so they are never
  // pickable when creating a group or adding people — only regular members are.
  const pickable = people.filter(p => !p.kind)

  // ── Channels & open conversation ────────────────────────────
  const [channels,   setChannels]   = useState([])
  const [dms,        setDms]        = useState([])   // my open 1v1 rows
  const [myChanIds,  setMyChanIds]  = useState(new Set())
  const [loaded,     setLoaded]     = useState(false)
  const [activeId,   setActiveId]   = useState(null)
  const [members,    setMembers]    = useState([])
  const [messages,   setMessages]   = useState([])
  const [pins,       setPins]       = useState([])
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [newMsg,     setNewMsg]     = useState('')
  const [replyTo,    setReplyTo]    = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newAll,     setNewAll]     = useState(true)
  const [newMembers, setNewMembers] = useState([])
  const [showMembers,setShowMembers]= useState(false)
  const [authPrompt, setAuthPrompt] = useState(null) // {userId,key,grant,userName} — pending scope choice
  const [authPick,   setAuthPick]   = useState(null) // Set of communityIds when "choose groups" is open
  const [dmBusy,     setDmBusy]     = useState(null)
  const bottomRef = useRef(null)
  const listRef = useRef(null)
  const msgCountRef = useRef(-1)

  const allConvos = [...channels, ...dms]
  const active = allConvos.find(c => c.id === activeId) || null
  const activeIsDm = !!active && active.context === `dbadm:${dbaId}`
  const dmPartnerName = (c) => {
    const ids = String(c.name || '').split('_')
    const otherId = ids.find(id => id !== myId)
    const p = people.find(x => x.id === otherId)
    return c._otherName || p?.name || 'Direct message'
  }

  async function loadChannels() {
    if (!myId) return
    try {
      const [chans, mem, myDms] = await Promise.all([
        dbGet('communities', `context=eq.${encodeURIComponent(`dba:${dbaId}`)}&is_active=eq.true&order=created_at.asc`),
        dbGet('community_members', `user_id=eq.${myId}&select=community_id`),
        dbGet('communities', `context=eq.${encodeURIComponent(`dbadm:${dbaId}`)}&is_active=eq.true&name=like.*${myId}*&order=created_at.asc`),
      ])
      const mine = new Set((mem || []).map(m => m.community_id))
      setMyChanIds(mine)
      setChannels((chans || []).filter(c => canManage || allFlags[c.id] || mine.has(c.id)))
      setDms((myDms || []).filter(c => String(c.name||'').split('_').includes(myId)))
    } finally { setLoaded(true) }
  }
  useEffect(() => { setLoaded(false); if (cfg) loadChannels() }, [cfg]) // eslint-disable-line

  async function loadMembers(cid = activeId) {
    if (!cid) return
    const rows = await dbGet('community_members', `community_id=eq.${cid}&order=created_at.asc`)
    if (Array.isArray(rows)) setMembers(rows)
  }
  async function loadMessages(cid = activeId) {
    if (!cid) return
    const rows = await dbGet('community_messages', `community_id=eq.${cid}&order=created_at.asc&limit=500`)
    if (Array.isArray(rows)) {
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
    const iv = setInterval(() => { if (!rtLiveRef.current) loadMessages() }, 6000)
    return () => clearInterval(iv)
  }, [activeId]) // eslint-disable-line

  // ── Realtime (broadcast, DBA-scoped channel; 6s poll only as fallback) ──
  const rtChanRef = useRef(null)
  const rtLiveRef = useRef(false)
  const activeIdRef = useRef(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => {
    if (!myId || !dbaId) return
    const onLive = ({ payload }) => {
      if (!payload?.communityId) return
      if (payload.userId === myId) return
      if (payload.communityId === activeIdRef.current) loadMessages(payload.communityId)
    }
    const ch = supabase.channel(`dba-chat-live-${dbaId}`)
      .on('broadcast', { event: 'new-message' },     onLive)
      .on('broadcast', { event: 'message-deleted' }, onLive)
      .subscribe(status => { rtLiveRef.current = status === 'SUBSCRIBED' })
    rtChanRef.current = ch
    return () => { rtLiveRef.current = false; rtChanRef.current = null; supabase.removeChannel(ch) }
  }, [myId, dbaId]) // eslint-disable-line
  function broadcastLive(event, communityId) {
    try { rtChanRef.current?.send({ type:'broadcast', event, payload:{ communityId, userId: myId } }) } catch {}
  }

  const amMember = members.some(m => m.user_id === myId)
  const canPost  = amMember || canManage || (active && active.created_by === myId)
  // My delegated authority on the OPEN channel only (never carries over)
  const activeCaps  = activeId ? capsFor(activeId, myId) : {}
  const canvasWrite = canManage || activeIsDm || !!activeCaps.canvas

  // ── Create / rename / archive channels (managers only) ──────
  async function createChannel() {
    const name = newName.trim()
    if (!name || !dbaId) return
    const r = await apiPost('channel-create', {
      dbaId, name, allDba: newAll, memberIds: newMembers.map(p => p.id),
    })
    if (!r.ok || !r.id) { alert(r.error || "Couldn't create the channel — try again."); return }
    for (const p of newAll ? people : newMembers) {
      if (!p.id || p.id === myId) continue
      sendNotification({
        recipientId: p.id, senderId: myId, senderName: myName, type: 'community',
        body: `👥 ${myName} added you to the "${name}" group in ${dba?.name || 'your community'}`,
      })
    }
    setNewName(''); setShowCreate(false); setNewMembers([]); setNewAll(true)
    await loadChannels()
    setActiveId(r.id)
  }
  async function renameChannel(c) {
    const next = window.prompt('New name for this group:', c.name)
    if (!next || !next.trim() || next.trim() === c.name) return
    const r = await apiPost('channel-rename', { dbaId, communityId: c.id, name: next.trim().slice(0, 80) })
    if (!r.ok) { alert(r.error || "Couldn't rename the group — try again."); return }
    loadChannels()
  }
  async function archiveChannel(c) {
    if (!window.confirm(`Archive "${c.name}"? Members will no longer see it.`)) return
    const r = await apiPost('channel-archive', { dbaId, communityId: c.id })
    if (!r.ok) { alert(r.error || "Couldn't archive — try again."); return }
    if (activeId === c.id) setActiveId(null)
    loadChannels()
  }
  async function toggleAllDba(c) {
    const making = !allFlags[c.id]
    const r = await apiPost('chat-flags', { dbaId, communityId: c.id, allDba: making })
    if (!r.ok) { alert(r.error || "Couldn't update — try again."); return }
    setCfg(prev => prev ? { ...prev, all_flags: { ...prev.all_flags, [c.id]: making || undefined } } : prev)
    loadMembers(c.id)
  }

  // ── Channel membership (managers, subset channels) ──────────
  async function addMember(p) {
    const r = await apiPost('channel-member-add', { dbaId, communityId: activeId, userId: p.id })
    if (!r.ok) { alert(r.error || "Couldn't add them — try again."); return }
    sendNotification({
      recipientId: p.id, senderId: myId, senderName: myName, type: 'community',
      body: `👥 ${myName} added you to the "${active?.name}" group`,
    })
    loadMembers()
  }
  async function removeMember(m) {
    if (!window.confirm(`Remove ${m.user_name} from "${active?.name}"?`)) return
    const r = await apiPost('channel-member-remove', { dbaId, communityId: activeId, userId: m.user_id })
    if (!r.ok) { alert(r.error || "Couldn't remove them — try again."); return }
    loadMembers()
  }

  // ── 1v1s ─────────────────────────────────────────────────────
  async function openDm(p) {
    if (dmBusy) return
    setDmBusy(p.id)
    try {
      const r = await apiPost('dm-open', { dbaId, otherId: p.id })
      if (!r.ok || !r.id) { alert(r.error || "Couldn't open the conversation."); return }
      await loadChannels()
      setDms(prev => prev.map(c => c.id === r.id ? { ...c, _otherName: r.other?.name } : c))
      setActiveId(r.id)
    } finally { setDmBusy(null) }
  }

  // ── Mentions & rendering (Communities.jsx patterns) ─────────
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
      : <span key={i} style={{ color:baseColor }}>{linkifyText(p, i)}</span>)
  }
  function linkifyText(text) {
    return String(text||'').split(/((?:https?:\/\/|www\.)[^\s]+)/g).map((p, i) => {
      if (!/^(?:https?:\/\/|www\.)/.test(p)) return <span key={i}>{p}</span>
      const href = /^www\./.test(p) ? `https://${p}` : p
      try { const proto = new URL(href).protocol; if (proto !== 'http:' && proto !== 'https:') return <span key={i}>{p}</span> } catch { return <span key={i}>{p}</span> }
      return <a key={i} href={href} target="_blank" rel="noreferrer"
        style={{ color:C.gold, fontWeight:700, textDecoration:'underline', wordBreak:'break-all' }}>{p}</a>
    })
  }
  function AudioAtt({ att }) {
    const [showTx, setShowTx] = useState(false)
    const [copied, setCopied] = useState(false)
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(att.transcript || att.url)
        setCopied(true); setTimeout(() => setCopied(false), 1500)
      } catch { alert('Could not copy — your browser blocked clipboard access.') }
    }
    const btn = { background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px', color:C.muted, fontSize:10, fontWeight:700, cursor:'pointer' }
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14 }}>🎙️</span>
          <audio controls preload="metadata" src={att.url} style={{ height:36, maxWidth:230 }}/>
        </div>
        <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
          {att.transcript && (
            <button onClick={() => setShowTx(s=>!s)} style={{ ...btn, color:showTx?C.gold:C.muted, borderColor:showTx?`${C.gold}66`:C.border }}>
              {showTx ? 'Hide transcript' : '📝 Transcript'}
            </button>
          )}
          <a href={att.url} download target="_blank" rel="noreferrer" style={{ ...btn, textDecoration:'none' }}>⬇️ Download</a>
          <button onClick={copy} style={btn}>{copied ? '✓ Copied' : (att.transcript ? '⧉ Copy text' : '⧉ Copy link')}</button>
        </div>
        {showTx && att.transcript && (
          <div style={{ marginTop:6, fontSize:11, color:C.muted, lineHeight:1.6, background:'#00000030', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 10px', maxWidth:280, whiteSpace:'pre-wrap' }}>
            {att.transcript}
          </div>
        )}
      </div>
    )
  }
  function renderBody(content, baseColor) {
    const { text, atts: rawAtts } = splitAtts(content)
    const atts = rawAtts.filter(a => safeUrl(a.url))
    return (<>
      {text ? renderMentions(text, baseColor) : null}
      {atts.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:text?6:0 }}>
          {atts.map((a,i) => /^audio\//.test(a.type||'') ? (
            <AudioAtt key={i} att={a}/>
          ) : /^image\//.test(a.type||'') ? (
            <a key={i} href={a.url} target="_blank" rel="noreferrer">
              <img src={a.url} alt={a.name} style={{ maxWidth:220, maxHeight:180, borderRadius:8, border:`1px solid ${C.border}`, display:'block' }}/>
            </a>
          ) : (
            <a key={i} href={a.url} target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', gap:8, background:C.surface, border:`1px solid ${C.border}`,
                borderRadius:8, padding:'7px 10px', textDecoration:'none', maxWidth:260 }}>
              <span style={{ fontSize:15 }}>📎</span>
              <span style={{ fontSize:12, fontWeight:600, color:C.gold, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</span>
            </a>
          ))}
        </div>
      )}
    </>)
  }

  // ── File uploads & voice memos (via /api/dba/*) ──────────────
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  function pickFile() { fileInputRef.current?.click() }
  async function onFilePicked(e) {
    const files = Array.from(e.target.files||[]); e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      for (const f of files) {
        if (f.size > 15*1024*1024) { alert(`${f.name} is over the 15 MB limit.`); continue }
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload  = () => resolve(String(r.result).split(',')[1]||'')
          r.onerror = reject
          r.readAsDataURL(f)
        })
        const out = await apiPost('upload', { dbaId, filename:f.name, contentType:f.type, dataBase64:b64 })
        if (!out.ok || !out.url) { alert(`Could not upload ${f.name} — please try again.`); continue }
        setPendingFiles(prev => [...prev, { name:f.name, url:out.url, type:f.type||'' }])
      }
    } finally { setUploading(false) }
  }
  function takePending() {
    const mine = pendingFiles
    if (mine.length) setPendingFiles([])
    return mine.map(a => `[[file|${a.name.replace(/[|[\]]/g,'_')}|${a.url}|${a.type}${a.transcript?`|${encodeURIComponent(a.transcript).replace(/[|[\]]/g,'')}`:''}]]`).join('\n')
  }

  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const recRef = useRef(null)
  useEffect(() => {
    if (!recording) { setRecordSecs(0); return }
    const t = setInterval(() => setRecordSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])
  const recClock = `${Math.floor(recordSecs/60)}:${String(recordSecs%60).padStart(2,'0')}`
  async function toggleRecord() {
    if (recording) { try { recRef.current?.recorder?.stop() } catch {} ; return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mime = window.MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm'
                 : window.MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType:mime } : undefined)
      const chunks = []
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        if (blob.size > 15*1024*1024) { alert('Voice memo is over the 15 MB limit — try a shorter one.'); return }
        setUploading(true)
        try {
          const b64 = await new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload  = () => resolve(String(r.result).split(',')[1]||'')
            r.onerror = reject
            r.readAsDataURL(blob)
          })
          const ext = /mp4/.test(blob.type) ? 'm4a' : 'webm'
          const stamp = new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
          const out = await apiPost('upload', { dbaId, filename:`Voice memo ${stamp}.${ext}`, contentType:blob.type, dataBase64:b64 })
          if (!out.ok || !out.url) { alert('Could not upload the voice memo — please try again.'); return }
          let transcript = ''
          try {
            const tj = await apiPost('transcribe', { dbaId, dataBase64:b64, contentType:blob.type })
            if (tj.ok && tj.text) transcript = tj.text
          } catch {}
          setPendingFiles(prev => [...prev, { name:out.name, url:out.url, type:blob.type, transcript }])
        } finally { setUploading(false) }
      }
      recorder.start()
      recRef.current = { recorder, chunks, stream }
      setRecording(true)
    } catch {
      alert('Microphone access was blocked — allow the mic in your browser to record voice memos.')
    }
  }

  // ── Send / delete / pins ─────────────────────────────────────
  async function send() {
    const typed = newMsg.trim()
    const fileMarkers = takePending()
    const text = [typed, fileMarkers].filter(Boolean).join('\n')
    if (!text || !myId || !activeId) return
    setNewMsg('')
    const r = await dbInsert('community_messages', {
      community_id: activeId, sender_id: myId, sender_name: myName, sender_role: myRole,
      content: text, parent_id: replyTo?.id || null,
    })
    if (r === null) { alert('Could not send — please try again.'); setNewMsg(typed); return }
    setReplyTo(null)
    broadcastLive('new-message', activeId)
    for (const m of findMentions(text)) {
      sendNotification({
        recipientId: m.user_id, senderId: myId, senderName: myName, type: 'mention',
        body: `💬 ${myName} tagged you in "${activeIsDm ? 'a direct message' : active?.name}": "${typed.slice(0,80)}"`,
      })
    }
    loadMessages()
  }
  function mayDelete(m) { return canManage || m.sender_id === myId || !!activeCaps.del }
  async function deleteMsg(m) {
    if (!window.confirm('Delete this message for everyone?\nIt stays permanently visible in the admin audit log.')) return
    // Server-enforced: manager, the sender, or a leader with delete authority
    // on THIS channel (audit row written server-side).
    const r = await apiPost('msg-delete', { dbaId, communityId: activeId, messageId: m.id })
    if (!r.ok) { alert(r.error || 'Could not delete — please try again.'); return }
    broadcastLive('message-deleted', activeId)
    loadMessages()
  }
  const pinnedIds = new Set(pins.map(p => p.message_id))
  function jumpToMsg(id) {
    const el = document.getElementById(`dmsg-${id}`)
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
      if (r === null) { alert('Could not pin — please try again.'); return }
    }
    loadPins()
  }
  async function pinForAll(m) {
    // Server-enforced: manager or a leader with pin authority on THIS channel
    const r = await apiPost('pin-all', { dbaId, communityId: activeId, messageId: m.id })
    if (!r.ok) { alert(r.error || 'Could not pin — please try again.'); return }
    loadPins()
    alert('Pinned for everyone in this conversation.')
  }
  // Manager clicks a leader capability → pick the scope (this group, all, or chosen groups)
  function toggleAuthority(userId, key, userName) {
    const grant = !capsFor(activeId, userId)[key]
    setAuthPick(null)
    setAuthPrompt({ userId, key, grant, userName })
  }
  async function applyAuthority(scope) {
    if (!authPrompt) return
    const { userId, key, grant } = authPrompt
    const body = { dbaId, userId, patch: { [key]: grant } }
    if (scope === 'all') body.all = true
    else if (scope === 'pick') body.communityIds = [...(authPick || [])]
    else body.communityIds = [activeId]
    if (scope === 'pick' && !body.communityIds.length) { alert('Tick at least one group first.'); return }
    const r = await apiPost('authority-set', body)
    if (!r.ok) { alert(r.error || "Couldn't update authority — try again."); return }
    setCfg(prev => prev ? { ...prev, leaders: r.leaders || prev.leaders } : prev)
    setAuthPrompt(null); setAuthPick(null)
  }
  // Manager toggles someone's DBA-wide direct-message access
  async function toggleDm(userId) {
    const enabled = !dmEnabled[userId]
    const r = await apiPost('dm-enable', { dbaId, userId, enabled })
    if (!r.ok) { alert(r.error || "Couldn't update DM access — try again."); return }
    setCfg(prev => {
      if (!prev) return prev
      const d = { ...(prev.dm_enabled || {}) }
      if (enabled) d[userId] = true; else delete d[userId]
      return { ...prev, dm_enabled: d }
    })
  }
  async function setMemberTier(userId, tierId) {
    const r = await apiPost('tier-set', { dbaId, userId, tierId })
    if (!r.ok) { alert(r.error || "Couldn't change their tier — try again."); return }
    setCfg(prev => {
      if (!prev) return prev
      const t = { ...(prev.tiers || {}) }
      if (tierId) t[userId] = tierId; else delete t[userId]
      return { ...prev, tiers: t }
    })
  }

  // ── Grouping ────────────────────────────────────────────────
  const repliesByParent = {}
  for (const m of messages) if (m.parent_id) (repliesByParent[m.parent_id] ||= []).push(m)
  const roots = messages.filter(m => !m.parent_id)

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  if (cfg === null) return <div style={{ padding:40, textAlign:'center', color:C.muted, fontSize:12 }}>Loading community…</div>
  if (cfg === false) return <div style={{ padding:40, textAlign:'center', color:C.muted, fontSize:12 }}>Couldn't load the community — refresh to try again.</div>

  const showList = !isMobile || !activeId
  const showChat = !isMobile || !!activeId

  function bubble(m, isReply = false) {
    const mine = m.sender_id === myId
    return (
      <div key={m.id} id={`dmsg-${m.id}`} style={{ marginBottom: isReply ? 8 : 4, marginLeft: isReply ? 34 : 0, display:'flex', gap:8, alignItems:'flex-start' }}>
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
              {canManage ? <>🗑 Deleted by {m.deleted_by_name||'staff'} (managers only): <span style={{ fontStyle:'normal' }}>{m.content}</span></> : <>Message deleted{m.deleted_by_name?` by ${m.deleted_by_name}`:''}</>}
            </div>
          ) : (
            <div style={{ fontSize:12, lineHeight:1.55, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 11px', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
              {renderBody(m.content, C.white)}
            </div>
          )}
          {!m.deleted_at && (
            <div style={{ display:'flex', gap:10, marginTop:3, alignItems:'center' }}>
              {!isReply && canPost && (
                <button onClick={() => setReplyTo(m)} style={{ background:'none', border:'none', color:C.muted, fontSize:10, cursor:'pointer', padding:0 }}>↪ Reply</button>
              )}
              <button onClick={() => togglePin(m)} title={pinnedIds.has(m.id)?'Unpin':'Pin (only for you)'}
                style={{ background:'none', border:'none', color: pinnedIds.has(m.id)?C.gold:C.muted, fontSize:10, cursor:'pointer', padding:0 }}>📌</button>
              {(canManage || activeCaps.pin) && !activeIsDm && (
                <button onClick={() => pinForAll(m)} title="Pin for everyone here"
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
    <div style={{ display:'flex', height:'100%', minHeight:420, background:C.black, overflow:'hidden', borderRadius:12, border:`1px solid ${C.border}` }}>
      {/* ── Left rail: groups + direct messages ── */}
      {showList && (
        <div style={{ width: isMobile ? '100%' : 250, background:C.surface, borderRight: isMobile ? 'none' : `1px solid ${C.border}`,
          display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'14px 14px 8px', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, fontSize:13, fontWeight:800, color:C.white }}>👥 Community</div>
            {canManage && (
              <button onClick={() => { setShowCreate(true); setNewMembers([]); setNewAll(true) }}
                style={{ background:C.gold, border:'none', borderRadius:6, padding:'4px 10px', color:C.black, fontSize:11, fontWeight:800, cursor:'pointer' }}>＋ New</button>
            )}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'4px 8px' }}>
            {!loaded && <div style={{ padding:20, textAlign:'center', color:C.muted, fontSize:12 }}>Loading…</div>}
            {loaded && channels.length === 0 && (
              <div style={{ padding:'18px 12px', textAlign:'center', color:C.muted, fontSize:12, lineHeight:1.6 }}>
                No groups yet.{canManage ? ' Tap ＋ New to create one.' : ' Your coach can add you to one.'}
              </div>
            )}
            {channels.map((c, ci) => (
              <div key={c.id} onClick={() => setActiveId(c.id)}
                style={{ padding:'10px 10px', borderRadius:8, cursor:'pointer', marginBottom:2,
                  background: activeId===c.id ? `${channelColor(ci)}18` : 'transparent',
                  border: activeId===c.id ? `1px solid ${channelColor(ci)}44` : '1px solid transparent',
                  borderLeft: `3px solid ${activeId===c.id ? channelColor(ci) : 'transparent'}`,
                  display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, color: channelColor(ci) }}>#</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color: activeId===c.id ? channelColor(ci) : C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize:9, color:C.muted }}>{allFlags[c.id] ? 'everyone in this community' : `by ${c.created_by_name || '—'}`}</div>
                </div>
                {canManage && (
                  <button onClick={e => { e.stopPropagation(); archiveChannel(c) }} title="Archive group"
                    style={{ background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer', padding:2 }}>🗄</button>
                )}
              </div>
            ))}

            {/* Direct messages */}
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', padding:'14px 6px 4px' }}>Direct messages</div>
            {people.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:'4px 6px' }}>Nobody else here yet.</div>}
            {people.map(p => {
              const unlocked = dmUnlocked(p)
              const openConvo = dms.find(c => String(c.name||'').split('_').includes(p.id))
              return (
                <div key={p.id}
                  onClick={() => { if (!unlocked) return; openConvo ? setActiveId(openConvo.id) : openDm(p) }}
                  title={unlocked ? `Message ${p.name}` : 'Direct messages unlock soon'}
                  style={{ padding:'8px 10px', borderRadius:8, marginBottom:2, display:'flex', alignItems:'center', gap:8,
                    cursor: unlocked ? 'pointer' : 'default', opacity: unlocked ? 1 : .45,
                    background: openConvo && activeId===openConvo.id ? `${C.gold}18` : 'transparent',
                    border: openConvo && activeId===openConvo.id ? `1px solid ${C.gold}44` : '1px solid transparent' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:`${C.gold}22`, color:C.gold,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>{(p.name||'?')[0]}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize:9, color:C.muted }}>{p.kind === 'coach' ? 'Coach' : p.kind === 'admin' ? 'Admin' : 'Member'}</div>
                  </div>
                  {!unlocked && <span style={{ fontSize:11 }}>🔒</span>}
                  {dmBusy === p.id && <span style={{ fontSize:9, color:C.muted }}>…</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Chat panel ── */}
      {showChat && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {!active ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:13, textAlign:'center', padding:20 }}>
              Pick a group or a person to open the conversation.
            </div>
          ) : (<>
            {/* Header */}
            <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              {isMobile && (
                <button onClick={() => setActiveId(null)} style={{ background:'none', border:'none', color:C.white, fontSize:16, cursor:'pointer', padding:'4px 6px' }}>←</button>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:C.white, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {activeIsDm ? `💬 ${dmPartnerName(active)}` : `# ${active.name}`}
                  </span>
                  {canManage && !activeIsDm && (
                    <button onClick={() => renameChannel(active)} title="Rename this group"
                      style={{ background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer', padding:0, flexShrink:0 }}>✏️</button>
                  )}
                </div>
                <div style={{ fontSize:10, color:C.muted }}>
                  {activeIsDm ? 'Private conversation' : `${members.length} member${members.length===1?'':'s'}${allFlags[active.id] ? ' · everyone in this community' : ''}`}
                </div>
              </div>
              <button onClick={() => setCanvasOpen(true)}
                title={canvasWrite ? 'Open the shared canvas — a live doc' : 'Open the shared canvas (view only — the coach can grant editing)'}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 12px', color:C.white, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                📝 Canvas
              </button>
              {canvasOpen && active && (
                <CanvasPanel scope={`community:${active.id}`} label={activeIsDm ? `💬 ${dmPartnerName(active)}` : `# ${active.name}`}
                  isMobile={isMobile} myId={myId} isAdmin={canManage} readOnly={!canvasWrite} onClose={() => setCanvasOpen(false)}/>
              )}
              {canManage && !activeIsDm && (
                <button onClick={() => setShowMembers(true)}
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
                        style={{ flex:1, fontSize:11, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>{splitAtts(m.content).text || '📎 Attachment'}</div>
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
                    <span style={{ fontSize:10, color:C.muted }}>↪ Replying to <b style={{ color:C.gold }}>{replyTo.sender_name}</b>: {splitAtts(String(replyTo.content||'')).text.slice(0,50)}</span>
                    <button onClick={() => setReplyTo(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer' }}>✕</button>
                  </div>
                )}
                {(pendingFiles.length > 0 || uploading) && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
                    {pendingFiles.map((p,i) => (
                      <span key={i} style={{ display:'flex', alignItems:'center', gap:6, background:C.card, border:`1px solid ${C.gold}55`, borderRadius:14, padding:'3px 9px', fontSize:11, color:C.white }}>
                        {/^audio\//.test(p.type||'') ? '🎙️' : '📎'} <span style={{ maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                        <button onClick={() => setPendingFiles(prev => prev.filter(x => x!==p))}
                          style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', padding:0, fontSize:12 }}>✕</button>
                      </span>
                    ))}
                    {uploading && <span style={{ fontSize:11, color:C.muted, alignSelf:'center' }}>Uploading…</span>}
                  </div>
                )}
                <div style={{ display:'flex', gap:6 }}>
                  <input ref={fileInputRef} type="file" multiple style={{ display:'none' }} onChange={onFilePicked}/>
                  <button onClick={pickFile} title="Attach a file (15 MB max)"
                    style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'0 10px', color:C.muted, fontSize:15, cursor:'pointer', flexShrink:0 }}>📎</button>
                  {voiceOn && (
                    <button onClick={toggleRecord} title={recording ? 'Stop recording' : 'Record a voice memo'}
                      style={{ background:recording?C.danger:'none', border:`1px solid ${recording?C.danger:C.border}`, borderRadius:8, padding:'0 10px',
                        color:recording?C.white:C.muted, fontSize:recording?12:15, fontWeight:800, cursor:'pointer', flexShrink:0,
                        display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                      {recording ? <>⏹ {recClock}</> : '🎙️'}
                    </button>
                  )}
                  <MentionInput value={newMsg} onChange={setNewMsg} onSubmit={send}
                    candidates={members.filter(m => m.user_id !== myId).map(m => m.user_name)}
                    colors={C}
                    placeholder={activeIsDm ? `Message ${dmPartnerName(active)}…` : `Message # ${active.name}… tag people with @Name`}
                    inputStyle={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18,
                      padding: isMobile ? '11px 14px' : '9px 13px', color:C.white, fontSize:13, outline:'none' }}/>
                  <button onClick={send} disabled={!newMsg.trim() && pendingFiles.length === 0}
                    style={{ background:C.gold, border:'none', borderRadius:18, padding:'9px 16px',
                      fontWeight:800, color:C.black, fontSize:12, cursor:'pointer', opacity:(newMsg.trim()||pendingFiles.length)?1:.4, flexShrink:0 }}>Send</button>
                </div>
              </div>
            ) : (
              <div style={{ padding:'10px 14px', background:C.surface, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, textAlign:'center' }}>
                You're viewing this group — only members can post.
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ── Create group modal ── */}
      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
          onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, width:'100%', maxWidth:380 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.white, marginBottom:4 }}>New group</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>A group chat inside {dba?.name || 'this community'}.</div>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key==='Enter' && createChannel()}
              placeholder="e.g. Announcements"
              style={{ width:'100%', boxSizing:'border-box', background:C.card, border:`1px solid ${C.gold}44`, borderRadius:8, padding:'10px 12px', color:C.white, fontSize:13, outline:'none', marginBottom:14 }}/>

            <div onClick={() => setNewAll(a => !a)} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:12 }}>
              <span style={{ width:16, height:16, borderRadius:4, border:`1px solid ${newAll ? C.gold : C.border}`,
                background: newAll ? C.gold : 'transparent', color:C.black, fontSize:11, fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{newAll ? '✓' : ''}</span>
              <span style={{ fontSize:12, color:C.white }}>Everyone in this community <span style={{ fontSize:10, color:C.muted }}>(new members join automatically)</span></span>
            </div>

            {!newAll && (<>
              <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>
                Pick members {newMembers.length > 0 && `(${newMembers.length} selected)`}
              </div>
              <div style={{ maxHeight:180, overflowY:'auto', marginBottom:14, border:`1px solid ${C.border}`, borderRadius:8, padding:'4px 8px' }}>
                {pickable.map(p => {
                  const picked = newMembers.some(x => x.id === p.id)
                  return (
                    <div key={p.id}
                      onClick={() => setNewMembers(prev => picked ? prev.filter(x => x.id !== p.id) : [...prev, p])}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 2px', borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}>
                      <span style={{ width:16, height:16, borderRadius:4, border:`1px solid ${picked ? C.gold : C.border}`,
                        background: picked ? C.gold : 'transparent', color:C.black, fontSize:11, fontWeight:800,
                        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{picked ? '✓' : ''}</span>
                      <span style={{ flex:1, fontSize:12, color:C.white }}>
                        {p.name} <span style={{ fontSize:9, color:C.muted }}>({p.kind === 'coach' ? 'coach' : p.kind === 'admin' ? 'admin' : 'member'})</span>
                      </span>
                    </div>
                  )
                })}
                {people.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:'8px 0' }}>Nobody available to add yet.</div>}
              </div>
            </>)}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowCreate(false)}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 14px', color:C.muted, fontSize:12, cursor:'pointer' }}>Cancel</button>
              <button onClick={createChannel} disabled={!newName.trim()}
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
            <div onClick={() => active && toggleAllDba(active)} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', margin:'10px 0 12px' }}>
              <span style={{ width:16, height:16, borderRadius:4, border:`1px solid ${active && allFlags[active.id] ? C.gold : C.border}`,
                background: active && allFlags[active.id] ? C.gold : 'transparent', color:C.black, fontSize:11, fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{active && allFlags[active.id] ? '✓' : ''}</span>
              <span style={{ fontSize:12, color:C.white }}>Everyone in this community <span style={{ fontSize:10, color:C.muted }}>(new members join automatically)</span></span>
            </div>

            <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Current ({members.length})</div>
            <div style={{ fontSize:10, color:C.muted, marginBottom:6, lineHeight:1.5 }}>
              Leader authority applies to <b style={{ color:C.white }}>this group only</b>: 🗑 delete messages · 📌 pin for everyone · 🎨 edit the canvas.
            </div>
            <div style={{ maxHeight:200, overflowY:'auto', marginBottom:14 }}>
              {members.map(m => {
                const mc = capsFor(activeId, m.user_id)
                const privMember = isPriv(m.user_id)
                const authBtn = (key, icon, label, on) => (
                  <button key={key} onClick={() => toggleAuthority(m.user_id, key, m.user_name)} title={`${on ? 'Revoke' : 'Grant'}: ${label}`}
                    style={{ background: on ? `${C.gold}22` : 'none', border:`1px solid ${on ? C.gold : C.border}`,
                      borderRadius:6, padding:'3px 6px', color: on ? C.gold : C.muted, fontSize:10, cursor:'pointer' }}>{icon}</button>
                )
                const dmOn = !!dmEnabled[m.user_id]
                return (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ flex:1, fontSize:12, color:C.white, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {m.user_name}
                      {(mc.del || mc.pin || mc.canvas) && <span style={{ fontSize:8, background:`${C.gold}22`, color:C.gold, padding:'1px 5px', borderRadius:4, fontWeight:700, marginLeft:5 }}>LEADER</span>}
                    </div>
                    {m.user_id !== myId && !privMember && (<>
                      {authBtn('del', '🗑', 'delete messages', !!mc.del)}
                      {authBtn('pin', '📌', 'pin for everyone', !!mc.pin)}
                      {authBtn('canvas', '🎨', 'edit the canvas', !!mc.canvas)}
                      <button onClick={() => toggleDm(m.user_id)} title={dmOn ? 'Revoke direct-message access (whole DBA)' : 'Grant direct-message access (whole DBA)'}
                        style={{ background: dmOn ? `${C.gold}22` : 'none', border:`1px solid ${dmOn ? C.gold : C.border}`,
                          borderRadius:6, padding:'3px 6px', color: dmOn ? C.gold : C.muted, fontSize:10, cursor:'pointer' }}>💬</button>
                      <button onClick={() => removeMember(m)}
                        style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 8px', color:C.danger, fontSize:10, cursor:'pointer', flexShrink:0 }}>Remove</button>
                    </>)}
                  </div>
                )
              })}
              {members.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:'6px 0' }}>No members yet.</div>}
            </div>

            {/* Scope picker: apply an authority change to this group, all groups, or chosen groups */}
            {authPrompt && (
              <div style={{ background:C.card, border:`1px solid ${C.gold}55`, borderRadius:10, padding:12, marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.white, marginBottom:8 }}>
                  {authPrompt.grant ? 'Grant' : 'Remove'} {authPrompt.key === 'del' ? '🗑 delete messages' : authPrompt.key === 'pin' ? '📌 pin for everyone' : '🎨 edit the canvas'} — {authPrompt.userName}
                </div>
                {authPick === null ? (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button onClick={() => applyAuthority('this')}
                      style={{ background:C.gold, border:'none', borderRadius:7, padding:'6px 10px', color:C.black, fontSize:11, fontWeight:800, cursor:'pointer' }}>This group only</button>
                    <button onClick={() => applyAuthority('all')}
                      style={{ background:'none', border:`1px solid ${C.gold}`, borderRadius:7, padding:'6px 10px', color:C.gold, fontSize:11, fontWeight:700, cursor:'pointer' }}>All groups</button>
                    <button onClick={() => setAuthPick(new Set([activeId]))}
                      style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 10px', color:C.white, fontSize:11, cursor:'pointer' }}>Choose groups…</button>
                    <button onClick={() => setAuthPrompt(null)}
                      style={{ background:'none', border:'none', color:C.muted, fontSize:11, cursor:'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ maxHeight:120, overflowY:'auto', marginBottom:8 }}>
                      {channels.map(c => {
                        const on = authPick.has(c.id)
                        return (
                          <div key={c.id} onClick={() => setAuthPick(prev => { const n = new Set(prev); on ? n.delete(c.id) : n.add(c.id); return n })}
                            style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', cursor:'pointer' }}>
                            <span style={{ width:14, height:14, borderRadius:4, border:`1px solid ${on ? C.gold : C.border}`, background: on ? C.gold : 'transparent',
                              color:C.black, fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{on ? '✓' : ''}</span>
                            <span style={{ fontSize:12, color:C.white }}>{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => applyAuthority('pick')}
                        style={{ background:C.gold, border:'none', borderRadius:7, padding:'6px 12px', color:C.black, fontSize:11, fontWeight:800, cursor:'pointer' }}>Apply</button>
                      <button onClick={() => { setAuthPrompt(null); setAuthPick(null) }}
                        style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 10px', color:C.muted, fontSize:11, cursor:'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Add people</div>
            <div style={{ flex:1, overflowY:'auto', minHeight:80 }}>
              {pickable.filter(p => !members.some(m => m.user_id === p.id)).map(p => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ flex:1, fontSize:12, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name} <span style={{ fontSize:9, color:C.muted }}>({p.kind === 'coach' ? 'coach' : p.kind === 'admin' ? 'admin' : 'member'})</span>
                  </div>
                  <button onClick={() => addMember(p)}
                    style={{ background:C.gold, border:'none', borderRadius:6, padding:'4px 10px', color:C.black, fontSize:10, fontWeight:800, cursor:'pointer' }}>Add</button>
                </div>
              ))}
              {pickable.filter(p => !members.some(m => m.user_id === p.id)).length === 0 &&
                <div style={{ fontSize:11, color:C.muted, padding:'8px 0' }}>Nobody left to add.</div>}
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
