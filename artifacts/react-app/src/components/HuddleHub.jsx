// ═══════════════════════════════════════════════════════════════
// HuddleHub.jsx — Global huddle system (Slack-style)
//
// Mounted ONCE in AppShell so the call survives navigation:
//  • Floating call window — the Daily iframe lives HERE (not in Week7),
//    so you can go anywhere in the app while staying on the call.
//  • Loud incoming-call ringer — full-screen overlay + ring sound on
//    ANY screen when a teammate invites you to a huddle.
//  • Do Not Disturb — per-device toggle that silences the ringer.
//
// Week7 consumes this via useHuddle() instead of holding its own state.
// ═══════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { LN } from './LoomPrivacy'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'
const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444',
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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers:H, body:JSON.stringify(body) })
  if (!r.ok) { console.error('INSERT', table, await r.text()); return null }
  const t = await r.text(); return t ? JSON.parse(t) : null
}
async function dbUpdate(table, params, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method:'PATCH', headers:H, body:JSON.stringify(body) })
  if (!r.ok) console.error('UPDATE', table, await r.text())
  return r.ok
}

// ── Ring sound (Web Audio — no asset files needed) ──────────────
// Classic two-burst phone ring, repeated every 2.4s while ringing.
function createRinger() {
  let ctx = null, timer = null
  function burst(at) {
    for (const [freq, off] of [[880, 0], [660, 0], [880, 0.45], [660, 0.45]]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at + off)
      gain.gain.exponentialRampToValueAtTime(0.4, at + off + 0.03)
      gain.gain.setValueAtTime(0.4, at + off + 0.3)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + off + 0.4)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(at + off); osc.stop(at + off + 0.45)
    }
  }
  return {
    start() {
      if (timer) return // already ringing — never stack intervals
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
        if (ctx.state === 'suspended') ctx.resume().catch(()=>{})
        const ring = () => { try { burst(ctx.currentTime + 0.05) } catch {} }
        ring()
        timer = setInterval(ring, 2400)
      } catch {}
    },
    stop() { clearInterval(timer); timer = null },
  }
}

const HuddleContext = createContext(null)
export function useHuddle() { return useContext(HuddleContext) }

// ════════════════════════════════════════════════════════════════
// PROVIDER
// ════════════════════════════════════════════════════════════════
export function HuddleProvider({ currentUser, children }) {
  const email = currentUser?.email || ''
  const info  = { role:currentUser?.role||'client', name:currentUser?.name||'User', uuid:null, orgId:EDEN_ORG_ID }
  const [self, setSelf] = useState(info)
  const myUUID = self.uuid
  const myName = self.name
  const orgId  = self.orgId || EDEN_ORG_ID
  const isStaff = self.role && self.role !== 'client'

  // Resolve real profile for non-demo users
  useEffect(() => {
    let live = true
    if (info.uuid || !email) return
    dbGet('user_profiles', `email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role,company_id`)
      .then(rows => {
        const me = rows?.[0]
        if (live && me) setSelf({ uuid:me.id, name:me.name||me.full_name||currentUser?.name||'User', role:me.role, orgId:me.company_id||EDEN_ORG_ID })
      }).catch(()=>{})
    return () => { live = false }
  }, [email]) // eslint-disable-line

  // ── Call state ───────────────────────────────────────────────
  const [huddleActive,  setHuddleActive]  = useState(false)
  const [huddleRoomUrl, setHuddleRoomUrl] = useState('')
  const [liveHuddle,    setLiveHuddle]    = useState(null)
  const [liveHuddles,   setLiveHuddles]   = useState([]) // ALL active huddles in the org (newest first)
  const [huddleRowId,   setHuddleRowId]   = useState(null)
  const [isStarter,     setIsStarter]     = useState(false)
  const [huddlePinging, setHuddlePinging] = useState(null)
  const [expanded,      setExpanded]      = useState(true) // floating window size
  const [fullscreen,    setFullscreen]    = useState(false) // call fills the whole screen
  const startedByMeRef = useRef(false)
  const roomUrlRef = useRef('')
  useEffect(() => { roomUrlRef.current = huddleRoomUrl }, [huddleRoomUrl])

  // ── Do Not Disturb — synced across ALL your devices ──────────
  // Server keeps the truth (admin_settings via api-server); localStorage
  // is only a boot cache so the button doesn't flicker on load.
  const [dndUntil, setDndUntil] = useState(() => { try { return localStorage.getItem('eden_dnd_until') || null } catch { return null } })
  const dndIsOn = u => u === 'forever' || (u && Date.parse(u) > Date.now())
  const dnd = dndIsOn(dndUntil)
  const cacheDnd = u => { try { u ? localStorage.setItem('eden_dnd_until', u) : localStorage.removeItem('eden_dnd_until') } catch {} }

  // Load + keep in sync (60s poll so DND set on another device applies here)
  useEffect(() => {
    if (!myUUID || !isStaff) return
    let stop = false
    async function syncDnd() {
      try {
        const r = await fetch('/api/dnd', { headers: { Authorization: sbBearer() } })
        const data = await r.json().catch(() => null)
        if (!stop && r.ok && data) { setDndUntil(data.on ? data.until : null); cacheDnd(data.on ? data.until : null) }
      } catch {}
    }
    syncDnd()
    const iv = setInterval(syncDnd, 60_000)
    return () => { stop = true; clearInterval(iv) }
  }, [myUUID, isStaff])

  // Timed DND flips itself off the moment it expires
  useEffect(() => {
    if (!dndUntil || dndUntil === 'forever') return
    const ms = Date.parse(dndUntil) - Date.now()
    if (ms <= 0) { setDndUntil(null); cacheDnd(null); return }
    const t = setTimeout(() => { setDndUntil(null); cacheDnd(null) }, ms + 500)
    return () => clearTimeout(t)
  }, [dndUntil])

  // until: null = off, 'forever', or an ISO timestamp
  const setDndFor = useCallback(async (until) => {
    setDndUntil(until); cacheDnd(until) // instant feedback
    try {
      const r = await fetch('/api/dnd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ until }),
      })
      const data = await r.json().catch(() => null)
      if (r.ok && data) { setDndUntil(data.on ? data.until : null); cacheDnd(data.on ? data.until : null) }
    } catch {} // offline → device-local DND still applies until sync
  }, [])
  const setDnd = useCallback(v => setDndFor(v ? 'forever' : null), [setDndFor])
  const dndRef = useRef(dnd); dndRef.current = dnd
  const activeRef = useRef(false); activeRef.current = huddleActive

  // ── Incoming call (ring) state ───────────────────────────────
  const [incoming, setIncoming] = useState(null) // { name, notifIds }
  const ringerRef  = useRef(null)
  const seenIdsRef = useRef(new Set())
  const ringTimeoutRef = useRef(null)

  const stopRinging = useCallback(() => {
    ringerRef.current?.stop()
    clearTimeout(ringTimeoutRef.current)
    setIncoming(null)
  }, [])

  const startRinging = useCallback((name, notifIds) => {
    if (dndRef.current || activeRef.current) return
    // Merge invite ids while ringing so Answer/Decline marks ALL of them read
    setIncoming(prev => prev
      ? { ...prev, notifIds: [...new Set([...(prev.notifIds||[]), ...notifIds])] }
      : { name, notifIds })
    if (!ringerRef.current) ringerRef.current = createRinger()
    ringerRef.current.start()
    clearTimeout(ringTimeoutRef.current)
    // Ring for 45 seconds max, then go quiet (invite stays in the bell)
    ringTimeoutRef.current = setTimeout(() => { ringerRef.current?.stop(); setIncoming(null) }, 45000)
  }, [])

  // ── Watch live huddles in the org (realtime + poll fallback) ─
  useEffect(() => {
    if (!orgId || !isStaff || !myUUID) return
    let stop = false
    async function checkLiveHuddle() {
      try {
        const rows = await dbGet('huddle_rooms',
          `org_id=eq.${orgId}&is_active=eq.true&select=id,room_url,created_by,creator_name,created_at&order=created_at.desc&limit=20`)
        if (stop) return
        const list = (Array.isArray(rows) ? rows : [])
          .filter(r => (Date.now() - new Date(r.created_at).getTime()) < 4*3600*1000)
        setLiveHuddles(list)
        setLiveHuddle(list[0] || null)
        // The huddle I joined was ended by its starter → close it for me too
        if (!startedByMeRef.current) {
          const myRoom = roomUrlRef.current
          const myRoomStillLive = myRoom && list.some(r => r.room_url === myRoom)
          if (!myRoomStillLive) {
            setHuddleActive(a => { if (a) setHuddleRoomUrl('') ; return false })
          }
          if (!list.length) stopRinging()
        }
      } catch {}
    }
    checkLiveHuddle()
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 5 } } })
    try { const tok = sbAccessToken(); if (tok) sb.realtime.setAuth(tok) } catch {}
    let realtimeUp = false, lastEventAt = 0, debounce = null
    const scheduleCheck = () => { lastEventAt = Date.now(); clearTimeout(debounce); debounce = setTimeout(checkLiveHuddle, 250) }
    const channel = sb
      .channel('huddle-hub-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'huddle_rooms' }, scheduleCheck)
      .subscribe(status => {
        const wasUp = realtimeUp
        realtimeUp = status === 'SUBSCRIBED'
        if (realtimeUp && !wasUp) checkLiveHuddle()
      })
    const iv = setInterval(() => {
      const proven = realtimeUp && (Date.now() - lastEventAt) < 60_000
      if (!proven) checkLiveHuddle()
    }, 5000)
    return () => { stop = true; clearTimeout(debounce); clearInterval(iv); sb.removeChannel(channel) }
  }, [orgId, myUUID, isStaff, stopRinging])

  // ── Global incoming-call ringer (realtime + poll fallback) ───
  useEffect(() => {
    if (!myUUID || !isStaff) return
    let stop = false
    const isInvite = n => n && (n.type === 'huddle_invite' || n.type === 'huddle_ping')
    function handleNotif(n) {
      if (stop || !isInvite(n) || n.is_read) return
      if (seenIdsRef.current.has(n.id)) return
      // Only ring for FRESH invites (ignore old unread ones from hours ago)
      if (Date.now() - new Date(n.created_at).getTime() > 90_000) { seenIdsRef.current.add(n.id); return }
      seenIdsRef.current.add(n.id)
      const name = n.sender_name || (String(n.body||'').match(/🎙\s*(.+?)\s+(is inviting|invited)/)?.[1]) || 'A teammate'
      startRinging(name, [n.id])
    }
    async function pollInvites() {
      try {
        const since = new Date(Date.now() - 90_000).toISOString()
        const rows = await dbGet('notifications',
          `recipient_id=eq.${myUUID}&is_read=eq.false&type=in.(huddle_invite,huddle_ping)&created_at=gte.${since}&select=id,type,sender_name,body,created_at,is_read&order=created_at.desc&limit=5`)
        if (!stop && Array.isArray(rows)) rows.forEach(handleNotif)
      } catch {}
    }
    pollInvites()
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 5 } } })
    try { const tok = sbAccessToken(); if (tok) sb.realtime.setAuth(tok) } catch {}
    let realtimeUp = false, lastEventAt = 0
    const channel = sb
      .channel('huddle-hub-ring-' + myUUID)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${myUUID}` },
        payload => { lastEventAt = Date.now(); handleNotif(payload?.new) })
      .subscribe(status => { realtimeUp = status === 'SUBSCRIBED' })
    const iv = setInterval(() => {
      const proven = realtimeUp && (Date.now() - lastEventAt) < 120_000
      if (!proven) pollInvites()
    }, 8000)
    return () => { stop = true; clearInterval(iv); sb.removeChannel(channel) }
  }, [myUUID, isStaff, startRinging])

  // Stop ringing the moment DND turns on
  useEffect(() => { if (dnd) stopRinging() }, [dnd, stopRinging])
  // Cleanup on unmount (logout)
  useEffect(() => () => { ringerRef.current?.stop(); clearTimeout(ringTimeoutRef.current) }, [])

  // ── Actions ──────────────────────────────────────────────────
  const startHuddle = useCallback(async () => {
    try {
      const r = await fetch('/api/huddle/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      })
      const data = await r.json().catch(() => null)
      if (!r.ok || !data?.url) {
        alert(data?.error || 'Could not start the huddle — please try again.')
        return false
      }
      setHuddleRoomUrl(data.url)
      setHuddleActive(true)
      setExpanded(true)
      startedByMeRef.current = true
      setIsStarter(true)
      await dbUpdate('huddle_rooms', `org_id=eq.${orgId}&created_by=eq.${myUUID}&is_active=eq.true`, { is_active:false })
      const rows = await dbInsert('huddle_rooms', { org_id:orgId, room_url:data.url, created_by:myUUID, creator_name:myName, is_active:true })
      const row = Array.isArray(rows) ? rows[0] : null
      if (row) { setHuddleRowId(row.id); setLiveHuddle(row) }
      return true
    } catch {
      alert('Could not start the huddle — please try again.')
      return false
    }
  }, [orgId, myUUID, myName])

  const joinLiveHuddle = useCallback((row) => {
    const h = row || liveHuddle
    if (!h) return
    startedByMeRef.current = h.created_by === myUUID
    setIsStarter(startedByMeRef.current)
    setHuddleRoomUrl(h.room_url)
    setHuddleActive(true)
    setExpanded(true)
    stopRinging()
  }, [liveHuddle, myUUID, stopRinging])

  const endHuddle = useCallback(async () => {
    setHuddleActive(false)
    setHuddleRoomUrl('')
    setHuddlePinging(null)
    if (startedByMeRef.current) {
      startedByMeRef.current = false
      setIsStarter(false)
      if (huddleRowId) await dbUpdate('huddle_rooms', `id=eq.${huddleRowId}`, { is_active:false })
      else await dbUpdate('huddle_rooms', `org_id=eq.${orgId}&created_by=eq.${myUUID}&is_active=eq.true`, { is_active:false })
      setHuddleRowId(null)
      setLiveHuddle(null)
    }
  }, [huddleRowId, orgId, myUUID])

  // Ping = insert a notification row and wait for the INSERT to actually
  // resolve, so the sender gets real success/failure feedback instead of a
  // fire-and-forget spinner. huddlePinging = { name, status } where status is
  // 'sending' | 'sent' | 'failed'.
  const pingCoach = useCallback(async (coach) => {
    setHuddlePinging({ name: coach.name, status: 'sending' })
    let ok = false
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          recipient_id: coach.uuid, sender_id: myUUID, sender_name: myName,
          type: 'huddle_invite',
          body: `🎙 ${myName} is inviting you to a live huddle — hit Join to jump in.`,
          is_read: false,
        }),
      })
      ok = r.ok
      if (!r.ok) console.error('INSERT notifications', await r.text())
    } catch (e) {
      console.error('INSERT notifications', e)
    }
    setHuddlePinging({ name: coach.name, status: ok ? 'sent' : 'failed' })
    // Success clears quickly; failure lingers so the sender can read it and retry
    setTimeout(() => {
      setHuddlePinging(p => (p && p.name === coach.name ? null : p))
    }, ok ? 3000 : 6000)
    return ok
  }, [myUUID, myName])

  // Answer the incoming call: mark invite read + join whatever huddle is live
  const answerIncoming = useCallback(async () => {
    const ids = incoming?.notifIds || []
    stopRinging()
    for (const id of ids) dbUpdate('notifications', `id=eq.${id}`, { is_read:true, read_at:new Date().toISOString() })
    let h = liveHuddle
    if (!h) {
      try {
        const rows = await dbGet('huddle_rooms',
          `org_id=eq.${orgId}&is_active=eq.true&select=id,room_url,created_by,creator_name,created_at&order=created_at.desc&limit=1`)
        h = Array.isArray(rows) && rows.length ? rows[0] : null
      } catch {}
    }
    if (h) joinLiveHuddle(h)
    else alert('That huddle has already ended.')
  }, [incoming, liveHuddle, orgId, joinLiveHuddle, stopRinging])

  const declineIncoming = useCallback(() => {
    const ids = incoming?.notifIds || []
    stopRinging()
    for (const id of ids) dbUpdate('notifications', `id=eq.${id}`, { is_read:true, read_at:new Date().toISOString() })
  }, [incoming, stopRinging])

  const value = {
    enabled: isStaff, dnd, setDnd, dndUntil, setDndFor,
    huddleActive, huddleRoomUrl, liveHuddle, liveHuddles, isStarter, huddlePinging,
    startHuddle, joinLiveHuddle, endHuddle, pingCoach,
    expanded, setExpanded,
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const bigW = Math.min(760, (typeof window !== 'undefined' ? window.innerWidth : 800) - 24)

  // ── Draggable floating window ────────────────────────────────
  // pos = null → default bottom-right pin. Once dragged, we switch to
  // left/top coordinates and keep them (survives navigation because
  // this provider is mounted once in AppShell).
  const [winPos, setWinPos] = useState(null) // { x, y } or null
  const winRef  = useRef(null)
  const dragRef = useRef(null) // { startX, startY, origX, origY, moved }

  const clampPos = useCallback((x, y) => {
    const el = winRef.current
    const w = el ? el.offsetWidth  : 320
    const h = el ? el.offsetHeight : 220
    const maxX = Math.max(0, window.innerWidth  - w)
    const maxY = Math.max(0, window.innerHeight - h)
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }, [])

  const onHeaderPointerDown = useCallback((e) => {
    // Don't hijack the Shrink/End buttons
    if (e.target.closest('button')) return
    const el = winRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }, [])

  const onHeaderPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    d.moved = true
    setWinPos(clampPos(d.origX + dx, d.origY + dy))
  }, [clampPos])

  const onHeaderPointerUp = useCallback(() => { dragRef.current = null }, [])

  // Keep the window on-screen when the viewport shrinks / rotates
  useEffect(() => {
    if (!winPos) return
    const onResize = () => setWinPos(p => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [winPos !== null, clampPos]) // eslint-disable-line

  // Re-clamp after Shrink/Expand changes the window size
  useEffect(() => {
    if (!winPos) return
    const id = requestAnimationFrame(() => setWinPos(p => (p ? clampPos(p.x, p.y) : p)))
    return () => cancelAnimationFrame(id)
  }, [expanded]) // eslint-disable-line

  return (
    <HuddleContext.Provider value={value}>
      {children}

      {/* ══ Floating call window — persists across ALL screens ══ */}
      {isStaff && huddleActive && huddleRoomUrl && (
        <div ref={winRef} style={ fullscreen ? {
          position:'fixed', inset:0, zIndex:6000, background:C.black,
          display:'flex', flexDirection:'column',
        } : {
          position:'fixed', zIndex:6000,
          ...(winPos ? { left:winPos.x, top:winPos.y } : { right:12, bottom:12 }),
          width: expanded ? bigW : (isMobile ? 240 : 320),
          background:C.card, border:`1px solid ${C.gold}66`, borderRadius:14,
          boxShadow:'0 12px 48px rgba(0,0,0,.75)', overflow:'hidden',
          display:'flex', flexDirection:'column',
        }}>
          <div
            onPointerDown={fullscreen ? undefined : onHeaderPointerDown}
            onPointerMove={fullscreen ? undefined : onHeaderPointerMove}
            onPointerUp={fullscreen ? undefined : onHeaderPointerUp}
            onPointerCancel={fullscreen ? undefined : onHeaderPointerUp}
            title={fullscreen ? undefined : 'Drag to move the call window'}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:C.surface,
              borderBottom:`1px solid ${C.border}`, cursor: fullscreen ? 'default' : 'grab', touchAction:'none', userSelect:'none' }}>
            <div style={{ width:9, height:9, borderRadius:5, background:C.success, animation:'pulse 1.5s infinite', flexShrink:0 }}/>
            <div style={{ flex:1, fontSize:12, fontWeight:800, color:C.success, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              Live Huddle
            </div>
            <button onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? 'Back to the floating window' : 'Make the call fill the whole screen'}
              style={{ background: fullscreen ? `${C.gold}22` : 'none', border:`1px solid ${fullscreen ? C.gold : C.border}`, borderRadius:7, padding:'4px 10px', color: fullscreen ? C.gold : C.muted, fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {fullscreen ? '🗗 Exit Full Screen' : '⛶ Full Screen'}
            </button>
            {!fullscreen && (
              <button onClick={() => setExpanded(e => !e)}
                title={expanded ? 'Shrink to a mini window' : 'Expand the call'}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'4px 10px', color:C.muted, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {expanded ? '⇲ Shrink' : '⇱ Expand'}
              </button>
            )}
            <button onClick={endHuddle}
              style={{ background:`${C.danger}22`, border:`1px solid ${C.danger}44`, borderRadius:7, padding:'4px 10px', color:C.danger, fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {isStarter ? 'End' : 'Leave'}
            </button>
          </div>
          {/* The iframe stays mounted while you navigate — the call never drops */}
          <div style={ fullscreen
            ? { position:'relative', flex:1, background:C.black }
            : { position:'relative', width:'100%', paddingTop: expanded ? '56.25%' : '62%', background:C.black }}>
            <iframe src={huddleRoomUrl}
              allowFullScreen
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
              allow="camera; microphone; autoplay; fullscreen; display-capture; clipboard-write"
              title="Huddle Room"/>
          </div>
          {expanded && !fullscreen && (
            <div style={{ padding:'6px 10px', fontSize:10, color:C.muted, textAlign:'center' }}>
              You can go anywhere in the app — the call stays with you. Use ⇲ Shrink to tuck it in the corner.
            </div>
          )}
        </div>
      )}

      {/* ══ Incoming call — loud, full-screen, on ANY screen ══ */}
      {isStaff && incoming && !huddleActive && (
        <div style={{ position:'fixed', inset:0, zIndex:7000, background:'rgba(0,0,0,.88)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:C.card, border:`2px solid ${C.gold}`, borderRadius:20, padding:'36px 30px',
            width:'100%', maxWidth:380, textAlign:'center', boxShadow:`0 0 60px ${C.gold}44`,
            animation:'pulse 1.5s infinite' }}>
            <div style={{ fontSize:56, marginBottom:14 }}>🎙</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.white, marginBottom:6 }}>
              <LN>{incoming.name}</LN> is calling you
            </div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:26 }}>
              Live huddle invite — jump in face-to-face
            </div>
            <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
              <button onClick={declineIncoming}
                style={{ flex:1, background:`${C.danger}22`, border:`1px solid ${C.danger}55`, borderRadius:12,
                  padding:'14px 0', color:C.danger, fontSize:15, fontWeight:800, cursor:'pointer' }}>
                Decline
              </button>
              <button onClick={answerIncoming}
                style={{ flex:1, background:C.success, border:'none', borderRadius:12,
                  padding:'14px 0', color:C.black, fontSize:15, fontWeight:800, cursor:'pointer' }}>
                ✓ Join
              </button>
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:16 }}>
              Tip: turn on 🌙 Do Not Disturb in the top bar to silence calls while you work.
            </div>
          </div>
        </div>
      )}
    </HuddleContext.Provider>
  )
}

// ════════════════════════════════════════════════════════════════
// DND BUTTON — drop into the top bar next to the notification bell
// ════════════════════════════════════════════════════════════════
export function DndButton({ isMobile }) {
  const huddle = useHuddle()
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onClick = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  if (!huddle || !huddle.enabled) return null
  const { dnd, dndUntil, setDndFor } = huddle

  const untilLabel = () => {
    if (dndUntil === 'forever') return 'until you turn it off'
    if (!dndUntil) return ''
    const d = new Date(dndUntil)
    const today = new Date().toDateString() === d.toDateString()
    return 'until ' + (today ? '' : d.toLocaleDateString('en-US',{weekday:'short'}) + ' ') +
      d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  }
  const pick = until => { setDndFor(until); setOpen(false); setCustomOpen(false) }
  const at8 = daysAhead => { const d = new Date(); d.setDate(d.getDate()+daysAhead); d.setHours(8,0,0,0); return d.toISOString() }
  const tomorrow8 = () => at8(1)
  const nextMonday8 = () => { const d = new Date(); const ahead = ((8 - d.getDay()) % 7) || 7; return at8(ahead) }
  const inMins = m => new Date(Date.now() + m*60000).toISOString()

  const OPTIONS = [
    { label:'For 30 minutes',          until: inMins(30) },
    { label:'For 1 hour',              until: inMins(60) },
    { label:'For 2 hours',             until: inMins(120) },
    { label:'Until tomorrow (8 AM)',   until: tomorrow8() },
    { label:'Until Monday (8 AM)',     until: nextMonday8() },
    { label:'Until I turn it off',     until: 'forever' },
  ]

  // Custom picker — pick any date & time up to 7 days out
  const [customOpen, setCustomOpen] = useState(false)
  const [customVal,  setCustomVal]  = useState('')
  const toLocalInput = d => {
    const p = n => String(n).padStart(2,'0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const customLimits = {
    min: toLocalInput(new Date(Date.now() + 5*60000)),
    max: toLocalInput(new Date(Date.now() + 7*24*3600*1000)),
  }
  function saveCustom() {
    const t = Date.parse(customVal)
    if (!Number.isFinite(t) || t <= Date.now()) { alert('Pick a time in the future.') ; return }
    if (t > Date.now() + 7*24*3600*1000) { alert('Do Not Disturb can be set for up to 7 days.'); return }
    pick(new Date(t).toISOString())
    setCustomVal('')
  }

  return (
    <div ref={boxRef} style={{ position:'relative', display:'inline-flex' }}>
      <button onClick={() => setOpen(o => !o)}
        title={dnd ? `Do Not Disturb is ON ${untilLabel()} — calls won\u2019t ring on any of your devices` : 'Do Not Disturb — silence huddle calls on all your devices while you work'}
        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
          background: dnd ? '#a86bff22' : 'transparent',
          border:`1.5px solid ${dnd ? '#a86bff' : C.border}`,
          borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>
        <span style={{ fontSize:15 }}>{dnd ? '🌙' : '📵'}</span>
        {!isMobile && (
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:'uppercase', color: dnd ? '#a86bff' : C.muted }}>
            {dnd ? 'DND ON' : 'DND'}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:230,
          background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
          boxShadow:'0 8px 32px rgba(0,0,0,.6)', zIndex:6500, overflow:'hidden', padding:6 }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', padding:'8px 10px 6px' }}>
            🌙 Do Not Disturb
          </div>
          {dnd && (
            <div style={{ fontSize:11, color:'#a86bff', padding:'0 10px 8px', fontWeight:700 }}>
              On {untilLabel()} — syncs to all your devices
            </div>
          )}
          {dnd && (
            <button onClick={() => pick(null)}
              style={{ width:'100%', textAlign:'left', background:`${C.success}15`, border:`1px solid ${C.success}44`,
                borderRadius:8, padding:'10px 12px', color:C.success, fontSize:12, fontWeight:800, cursor:'pointer', marginBottom:6 }}>
              📞 Turn off — start ringing again
            </button>
          )}
          {dnd && (
            <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:.8, textTransform:'uppercase', padding:'2px 10px 4px' }}>
              Or change to…
            </div>
          )}
          {OPTIONS.map(o => (
            <button key={o.label} onClick={() => pick(o.until)}
              style={{ width:'100%', textAlign:'left', background:'none', border:'none', borderRadius:8,
                padding:'9px 12px', color:C.white, fontSize:12, fontWeight:600, cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.gold}15`}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {o.label}
            </button>
          ))}
          <button onClick={() => setCustomOpen(v => !v)}
            style={{ width:'100%', textAlign:'left', background: customOpen ? `${C.gold}15` : 'none', border:'none', borderRadius:8,
              padding:'9px 12px', color:C.gold, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            🗓 Pick a date &amp; time…
          </button>
          {customOpen && (
            <div style={{ padding:'4px 10px 8px', display:'flex', gap:6, alignItems:'center' }}>
              <input type="datetime-local" value={customVal} min={customLimits.min} max={customLimits.max}
                onChange={e => setCustomVal(e.target.value)}
                style={{ flex:1, minWidth:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:7,
                  padding:'7px 8px', color:C.white, fontSize:11, colorScheme:'dark' }}/>
              <button onClick={saveCustom} disabled={!customVal}
                style={{ background: customVal ? C.gold : C.border, border:'none', borderRadius:7, padding:'7px 12px',
                  color:C.black, fontSize:11, fontWeight:800, cursor: customVal ? 'pointer' : 'default' }}>
                Set
              </button>
            </div>
          )}
          <div style={{ fontSize:9, color:C.muted, padding:'8px 10px 6px', lineHeight:1.5 }}>
            While on, huddle calls won't ring or pop up on any device you're signed into. Invites still land quietly in the 🔔 bell.
          </div>
        </div>
      )}
    </div>
  )
}
