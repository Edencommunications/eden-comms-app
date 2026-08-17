// ═══════════════════════════════════════════════════════════════
// Notifications.jsx — Week 3: Notification System
// Place at: src/components/Notifications.jsx in Replit
//
// HOW TO USE IN App.jsx:
// 1. Import: import Notifications from './components/Notifications'
// 2. Add <Notifications currentUser={currentUser} /> anywhere
//    in your top bar / header area
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

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

async function dbGet(table: any, params='') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H })
  if (!res.ok) return []
  return res.json()
}

async function dbInsert(table: any, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!res.ok) console.error('INSERT', await res.text())
}

async function dbUpdate(table: any, params: any, body: any) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
}

// ── Format relative time ──────────────────────────────────────
function timeAgo(ts: any) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - (new Date(ts) as any)) / 1000)
  if (diff < 60)  return 'Just now'
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago'
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago'
  return Math.floor(diff/86400) + 'd ago'
}

// ── Notification type config ──────────────────────────────────
const NOTIF_CONFIG = {
  message:      { icon:'💬', label:'New Message',          color: C.gold },
  dm_thread_reply: { icon:'↩️', label:'Thread Reply',       color: C.gold },
  diet_update:  { icon:'🥗', label:'Diet Plan Updated',    color: C.success },
  supp_update:  { icon:'💊', label:'Supplement Updated',   color:'#D4A8F0' },
  workout_update: { icon:'💪', label:'Workout Plan Updated', color:'#6FE8A8' },
  checkin_received: { icon:'📋', label:'Check-In Received',color: C.gold },
  lab_uploaded: { icon:'🧪', label:'Lab Uploaded',         color:'#6FB8E8' },
  update_note:  { icon:'📝', label:'Coach Update',         color: C.gold },
  loom_posted:  { icon:'🎥', label:'Video Update Posted',  color: C.gold },
  start_reminder_7: { icon:'🚀', label:'Program Starts Soon', color: C.gold },
  start_reminder_1: { icon:'⏰', label:'Starts Tomorrow',     color:'#ffa600' },
  start_reminder_0: { icon:'🎉', label:'Starts Today',        color: C.success },
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Renders as a bell icon with badge count + dropdown panel
// ════════════════════════════════════════════════════════════════
export default function Notifications({ currentUser, onNavigate }: any) {
  const [open,    setOpen]    = useState(false)
  const [notifs,  setNotifs]  = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<any>(null)

  const email  = currentUser?.email || ''
  const info   = { role: currentUser?.role || 'client', name: currentUser?.name || 'User', uuid:null }
  const role   = info.role

  // Resolve the real profile UUID from the database by email.
  const [myUUID, setMyUUID] = useState<any>(null)
  useEffect(() => {
    let live = true
    if (!email) { setMyUUID(null); return }
    dbGet('user_profiles', `email=eq.${encodeURIComponent(email)}&select=id`)
      .then(rows => { if (live) setMyUUID(Array.isArray(rows) ? rows[0]?.id || null : null) })
    return () => { live = false }
  }, [email])

  const unreadCount = notifs.filter((n: any) => !n.is_read).length

  // ── Phone push notifications (Web Push) ─────────────────────
  // Fallback labels in case an older server doesn't send `categories` yet.
  const PUSH_CATEGORIES_FALLBACK = [
    { id: 'messages', label: 'Messages' },
    { id: 'plan_updates', label: 'Plan updates' },
    { id: 'checkins', label: 'Check-ins' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'ads_recaps', label: 'Ads recaps' },
  ]
  const [pushState, setPushState] = useState<any>(null)   // null loading · {enabled, devices, supported, needsInstall}
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as any).standalone === true

  // ── One-time "turn on phone notifications" nudge ────────────
  // Dismissal is remembered per-user SERVER-SIDE (push prefs), so dismissing
  // on one device silences it on every device. localStorage is kept as an
  // instant-read cache so the banner never flashes before prefs load.
  // On iPhone Safari that isn't installed to the home screen, push isn't
  // possible yet — the InstallBanner already tells those users to install
  // first, so we stay quiet there.
  const nudgeKey = `push-nudge-dismissed:${email || 'anon'}`
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try { return localStorage.getItem(`push-nudge-dismissed:${email || 'anon'}`) === '1' } catch { return true }
  })
  useEffect(() => {
    try { setNudgeDismissed(localStorage.getItem(nudgeKey) === '1') } catch { setNudgeDismissed(true) }
  }, [nudgeKey])
  function dismissNudge() {
    try { localStorage.setItem(nudgeKey, '1') } catch {}
    setNudgeDismissed(true)
    // Persist server-side so other devices stay quiet too (best-effort).
    fetch('/api/push/prefs', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      body: JSON.stringify({ nudgeDismissed: true }),
    }).catch(() => {})
  }
  const pushPossibleHere = pushSupported && !(isIOS && !isStandalone)
  const showNudge = !nudgeDismissed && pushPossibleHere &&
    pushState !== null && !pushState.enabled
  useEffect(() => {
    if (!myUUID) return
    fetch('/api/push/prefs', { headers: { Authorization: sbBearer() } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setPushState({ enabled: !!d?.enabled, devices: d?.devices || 0, cats: d?.cats || {}, categories: d?.categories || PUSH_CATEGORIES_FALLBACK, quiet: d?.quiet || { on: false, start: '22:00', end: '07:00' } })
        // Server-side dismissal (from any device) wins over the local cache.
        if (d?.nudgeDismissed) {
          try { localStorage.setItem(nudgeKey, '1') } catch {}
          setNudgeDismissed(true)
        }
      })
      .catch(() => setPushState({ enabled: false, devices: 0, cats: {}, categories: PUSH_CATEGORIES_FALLBACK, quiet: { on: false, start: '22:00', end: '07:00' } }))
  }, [myUUID])

  async function enablePush() {
    setPushBusy(true); setPushMsg('')
    try {
      if (!pushSupported) { setPushMsg('This browser does not support notifications.'); setPushBusy(false); return }
      if (isIOS && !isStandalone) {
        setPushMsg('On iPhone: first add this app to your Home Screen (Share button → "Add to Home Screen"), then open it from there and turn this on.')
        setPushBusy(false); return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPushMsg('Notifications were blocked — allow them in your browser/phone settings, then try again.'); setPushBusy(false); return }
      const kr = await fetch('/api/push/public-key', { headers: { Authorization: sbBearer() } })
      const kd = await kr.json().catch(() => null)
      if (!kr.ok || !kd?.publicKey) { setPushMsg('Could not reach the notification server — try again in a minute.'); setPushBusy(false); return }
      const reg = await navigator.serviceWorker.ready
      // Convert base64url VAPID key to the byte array subscribe() expects
      const pad = '='.repeat((4 - kd.publicKey.length % 4) % 4)
      const raw = atob((kd.publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'))
      const appKey = new Uint8Array([...raw].map(ch => ch.charCodeAt(0)))
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
      const sr = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      const sd = await sr.json().catch(() => null)
      if (!sr.ok) { setPushMsg(sd?.error || 'Could not turn on notifications.'); setPushBusy(false); return }
      // Preserve saved per-category choices — the server echoes them back.
      setPushState((p: any) => ({
        enabled: true, devices: sd?.devices || 1,
        cats: sd?.cats ?? p?.cats ?? {},
        categories: sd?.categories ?? p?.categories ?? PUSH_CATEGORIES_FALLBACK,
        quiet: sd?.quiet ?? p?.quiet ?? { on: false, start: '22:00', end: '07:00' },
      }))
      setPushMsg('✅ Phone notifications are on for this device.')
      dismissNudge() // enabled — never nudge again
    } catch (e) {
      setPushMsg('Could not turn on notifications — ' + ((e as any)?.message || 'unknown error'))
    }
    setPushBusy(false)
  }

  async function toggleCat(catId: any) {
    const next = !(pushState?.cats?.[catId] !== false)
    // optimistic flip
    setPushState((p: any) => ({ ...(p || {}), cats: { ...(p?.cats || {}), [catId]: next } }))
    try {
      const r = await fetch('/api/push/prefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ cats: { [catId]: next } }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || 'save failed')
      if (d?.cats) setPushState((p: any) => ({ ...(p || {}), cats: d.cats }))
    } catch {
      // revert on failure
      setPushState((p: any) => ({ ...(p || {}), cats: { ...(p?.cats || {}), [catId]: !next } }))
      setPushMsg('Could not save that preference — try again.')
    }
  }

  async function saveQuiet(patch: any) {
    const prev = pushState?.quiet || { on: false, start: '22:00', end: '07:00' }
    const next = { ...prev, ...patch }
    // Save with the phone's own timezone so "10pm" means 10pm where the user is.
    let tz
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch {}
    setPushState((p: any) => ({ ...(p || {}), quiet: next })) // optimistic
    try {
      const r = await fetch('/api/push/prefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ quiet: { ...next, ...(tz ? { tz } : {}) } }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || 'save failed')
      if (d?.quiet) setPushState((p: any) => ({ ...(p || {}), quiet: d.quiet }))
    } catch {
      setPushState((p: any) => ({ ...(p || {}), quiet: prev })) // revert on failure
      setPushMsg('Could not save quiet hours — try again.')
    }
  }

  async function disablePush() {
    setPushBusy(true); setPushMsg('')
    try {
      const r = await fetch('/api/push/prefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ enabled: false }),
      })
      if (r.ok) { setPushState((p: any) => ({ ...(p || {}), enabled: false })); setPushMsg('Phone notifications are off (all devices).') }
      else setPushMsg('Could not turn off — try again.')
    } catch { setPushMsg('Could not turn off — try again.') }
    setPushBusy(false)
  }

  // ── Load notifications on mount; realtime pushes new ones instantly,
  //    the 15s poll only fires while the websocket channel is down ─────
  useEffect(() => {
    if (!myUUID) return
    loadNotifs()
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 5 } } })
    // With RLS on, realtime only delivers rows the subscriber may see — authenticate the channel.
    try { const tok = sbAccessToken(); if (tok) sb.realtime.setAuth(tok) } catch {}
    let realtimeUp = false
    // Only trust realtime once an event has ACTUALLY arrived — a channel can
    // report SUBSCRIBED even when the table isn't in the supabase_realtime
    // publication, in which case no events are ever delivered.
    let lastEventAt = 0
    let debounce: any = null
    const scheduleLoad = () => { lastEventAt = Date.now(); clearTimeout(debounce); debounce = setTimeout(loadNotifs, 250) }
    const channel = sb
      .channel('notifs-' + myUUID)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${myUUID}` },
        scheduleLoad)
      .subscribe(status => {
        const wasUp = realtimeUp
        realtimeUp = status === 'SUBSCRIBED'
        if (realtimeUp && !wasUp) loadNotifs() // catch up on anything missed
      })
    // Fallback poll: keeps running until realtime has proven itself with a real
    // event recently; skipped only when the channel is up AND events flow.
    const interval = setInterval(() => {
      const proven = realtimeUp && (Date.now() - lastEventAt) < 120_000
      if (!proven) loadNotifs()
    }, 15000)
    return () => { clearTimeout(debounce); clearInterval(interval); sb.removeChannel(channel) }
  }, [myUUID])

  // ── Close panel when clicking outside ─────────────────────
  useEffect(() => {
    function handleClick(e: any) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifs() {
    if (!myUUID) return
    setLoading(true)
    const data = await dbGet('notifications',
      `recipient_id=eq.${myUUID}&order=created_at.desc&limit=30`
    )
    setNotifs(data || [])
    setLoading(false)
  }

  // Mark-read goes through the API server: the notifications RLS policy
  // blocks clients from updating rows they didn't SEND, so a direct PATCH
  // silently updated nothing and the badge kept coming back.
  async function markRead(id: any) {
    setNotifs((prev: any) => prev.map((n: any) => n.id === id ? { ...n, is_read:true } : n))
    try {
      const r = await fetch('/api/notifs/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ id }),
      })
      if (!r.ok) loadNotifs()
    } catch {}
  }

  async function markAllRead() {
    setNotifs((prev: any) => prev.map((n: any) => ({ ...n, is_read:true })))
    try {
      const r = await fetch('/api/notifs/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      })
      if (!r.ok) loadNotifs()
    } catch {}
  }

  async function handleNotifClick(notif: any) {
    markRead(notif.id)
    setOpen(false)
    // Older notification rows were saved without a link — fall back to a
    // sensible destination per type so every notification still navigates.
    const FALLBACK_GOTO: any = {
      message: 'msgs', dm_thread_reply: 'team', diet_update: 'diet', supp_update: 'diet',
      workout_update: 'workout', checkin_received: 'checkin', lab_uploaded: 'labs',
      update_note: 'checkin', loom_posted: 'checkin', community_post: 'community',
      community_added: 'community', community: 'community', meta_ads: 'admin',
      mention: 'team', huddle_invite: 'team', huddle_ping: 'team', team_message: 'team',
      broadcast: 'msgs', coach_response: 'checkin', coach_update: 'checkin',
      start_reminder_7: 'home', start_reminder_1: 'home', start_reminder_0: 'home',
    }
    let dest = notif.link_to || FALLBACK_GOTO[notif.type]
    // Community deep-link: "<tab>?comm=<communityId>" — stash the community id
    // so the Communities pane auto-opens that exact conversation after the
    // tab switch (Week7 / CommunityScreen pick it up on mount).
    if (typeof dest === 'string' && dest.includes('?comm=')) {
      const [tab, commId] = dest.split('?comm=')
      try {
        sessionStorage.setItem('eden_open_community', commId)
        // Already on the destination tab? A mount won't happen — let the
        // mounted components react to the deep-link immediately.
        window.dispatchEvent(new CustomEvent('eden-open-community'))
      } catch {}
      dest = tab
    }
    // Clients never have the staff-only Team Hub or admin tabs — reroute
    // those destinations to a tab the client actually has.
    if (role === 'client' && (dest === 'team' || dest === 'admin')) dest = 'community'
    if (!onNavigate || !dest) return
    notif = { ...notif, link_to: dest }
    // Check-in notifications deep-link to the submitting client's Check-In Hub:
    // look up the sender's profile so the app can pre-select that client.
    // DM thread replies deep-link to the sender's DM in the Team Hub: look up
    // the sender's profile so Week7 can pre-open that conversation.
    if (notif.type === 'dm_thread_reply' && notif.sender_id) {
      try {
        const rows = await dbGet('user_profiles', `id=eq.${notif.sender_id}&select=email,name`)
        const p = rows?.[0]
        if (p?.email) {
          onNavigate(notif.link_to, { email: p.email, name: p.name || notif.sender_name })
          return
        }
      } catch { /* fall through to plain tab navigation */ }
    }
    if (notif.type === 'checkin_received' && notif.sender_id) {
      try {
        const rows = await dbGet('user_profiles', `id=eq.${notif.sender_id}&select=email,name`)
        const p = rows?.[0]
        if (p?.email) {
          onNavigate(notif.link_to, { email: p.email, name: p.name || notif.sender_name, role: 'client' })
          return
        }
      } catch { /* fall through to plain tab navigation */ }
    }
    onNavigate(notif.link_to)
  }

  const cfg = (type: any) => (NOTIF_CONFIG as any)[type] || { icon:'🔔', label:'Notification', color:C.gold }

  return (
    <div ref={panelRef} style={{ position:'relative', display:'inline-flex' }}>

      {/* ── One-time push opt-in nudge banner ─────────────────
          Fixed pill at the top of the screen (the InstallBanner owns the
          bottom edge). Tapping it opens the bell panel where the enable
          toggle lives; the × remembers the dismissal per user. */}
      {showNudge && (
        <div style={{
          position:'fixed', top:10, left:'50%', transform:'translateX(-50%)',
          zIndex:9998, display:'flex', alignItems:'center', gap:8,
          background:C.card, border:`1px solid ${C.gold}66`,
          borderRadius:22, padding:'7px 8px 7px 14px',
          boxShadow:'0 4px 20px rgba(255,166,0,.25)',
          maxWidth:'calc(100vw - 24px)',
        }}>
          <button
            onClick={() => { setOpen(true); loadNotifs(); dismissNudge() }}
            style={{
              background:'none', border:'none', cursor:'pointer', padding:0,
              display:'flex', alignItems:'center', gap:8, textAlign:'left',
            }}>
            <span style={{ fontSize:15 }}>📱</span>
            <span style={{ fontSize:12, fontWeight:700, color:C.white, lineHeight:1.35 }}>
              Turn on phone notifications
              <span style={{ display:'block', fontSize:10, fontWeight:500, color:C.muted }}>
                Get buzzes for messages &amp; huddles
              </span>
            </span>
          </button>
          <button
            onClick={dismissNudge}
            aria-label="Dismiss notification nudge"
            style={{
              background:'none', border:'none', color:C.muted, fontSize:18,
              cursor:'pointer', padding:'0 6px', lineHeight:1, flexShrink:0,
            }}>×</button>
        </div>
      )}

      {/* ── Bell button ──────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) loadNotifs() }}
        style={{
          position:'relative', background:'none',
          border:`1px solid ${open ? C.gold : C.border}`,
          borderRadius:8, padding:'6px 10px', cursor:'pointer',
          display:'flex', alignItems:'center', gap:6,
          color: open ? C.gold : C.muted,
          transition:'all .15s',
        }}>
        <span style={{ fontSize:16 }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position:'absolute', top:-6, right:-6,
            background:C.danger, color:C.white,
            fontSize:10, fontWeight:800,
            minWidth:18, height:18, borderRadius:9,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'0 4px', border:`2px solid ${C.black}`,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {/* Gold dot: push not yet enabled & nudge not dismissed (hidden while
            the unread badge occupies the same corner) */}
        {showNudge && unreadCount === 0 && (
          <span style={{
            position:'absolute', top:-3, right:-3,
            width:10, height:10, borderRadius:5,
            background:C.gold, border:`2px solid ${C.black}`,
          }}/>
        )}
      </button>

      {/* ── Notification panel ──────────────────────────────
          On phones the bell can sit anywhere in the (wrapped) top bar, so an
          absolute right-anchored panel could hang off the left edge. Pin it
          to the screen instead on small displays. */}
      {open && (
        <div style={window.innerWidth <= 600 ? {
          position:'fixed',
          top: Math.min((panelRef.current?.getBoundingClientRect?.().bottom || 60) + 8, 120),
          right:12, left:12, width:'auto',
          maxHeight:'calc(100vh - 160px)',
          background:C.card, border:`1px solid ${C.border}`,
          borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,.6)',
          display:'flex', flexDirection:'column',
          zIndex:9999, overflow:'hidden',
        } : {
          position:'absolute', top:'calc(100% + 8px)', right:0,
          width:'min(340px, calc(100vw - 24px))',
          maxHeight:'min(480px, calc(100vh - 140px))',
          background:C.card, border:`1px solid ${C.border}`,
          borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,.6)',
          display:'flex', flexDirection:'column',
          zIndex:999, overflow:'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            flexShrink:0,
          }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:C.white }}>Notifications</div>
              {unreadCount > 0 && (
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                  {unreadCount} unread
                </div>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{ background:'none', border:'none', color:C.gold, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading && notifs.length === 0 && (
              <div style={{ padding:24, textAlign:'center', color:C.muted, fontSize:13 }}>
                Loading…
              </div>
            )}

            {!loading && notifs.length === 0 && (
              <div style={{ padding:32, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🔔</div>
                <div style={{ fontSize:13, color:C.white, fontWeight:600, marginBottom:4 }}>All caught up</div>
                <div style={{ fontSize:12, color:C.muted }}>No notifications yet</div>
              </div>
            )}

            {notifs.map(n => {
              const c = cfg(n.type)
              return (
                <button key={n.id} onClick={() => handleNotifClick(n)}
                  style={{
                    width:'100%', textAlign:'left', background:n.is_read ? 'none' : `${C.gold}08`,
                    border:'none', borderBottom:`1px solid ${C.border}`,
                    padding:'12px 16px', cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${C.gold}12`}
                  onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'none' : `${C.gold}08`}>

                  {/* Icon */}
                  <div style={{
                    width:36, height:36, borderRadius:10, flexShrink:0,
                    background:`${c.color}22`, border:`1px solid ${c.color}44`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:16,
                  }}>
                    {c.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:c.color, letterSpacing:.5 }}>
                        {c.label}
                      </div>
                      <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:n.is_read ? C.muted : C.white, marginTop:3, lineHeight:1.4 }}>
                      {n.body}
                    </div>
                    {n.sender_name && (
                      <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
                        From {n.sender_name}
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <div style={{
                      width:8, height:8, borderRadius:4,
                      background:C.gold, flexShrink:0, marginTop:4,
                    }}/>
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer — phone push toggle */}
          <div style={{
            padding:'10px 16px', borderTop:`1px solid ${C.border}`,
            flexShrink:0,
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:C.white }}>📱 Phone notifications</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                  {pushState === null ? 'Checking…'
                    : pushState.enabled ? `On${pushState.devices ? ` · ${pushState.devices} device${pushState.devices > 1 ? 's' : ''}` : ''}`
                    : 'Get alerts even when the app is closed'}
                </div>
              </div>
              <button
                onClick={() => pushState?.enabled ? disablePush() : enablePush()}
                disabled={pushBusy || pushState === null}
                style={{
                  width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', flexShrink:0,
                  background: pushState?.enabled ? C.gold : C.border, position:'relative', transition:'background .2s',
                  opacity: pushBusy ? 0.6 : 1,
                }}>
                <span style={{
                  position:'absolute', top:2, left: pushState?.enabled ? 22 : 2,
                  width:20, height:20, borderRadius:10, background:C.white, transition:'left .2s', display:'block',
                }}/>
              </button>
            </div>
            {pushState?.enabled && (
              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                {(pushState.categories || PUSH_CATEGORIES_FALLBACK).map((cat: any) => {
                  const on = pushState.cats?.[cat.id] !== false
                  return (
                    <div key={cat.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, paddingLeft:6 }}>
                      <div style={{ fontSize:11, color:C.muted }}>{cat.label}</div>
                      <button
                        onClick={() => toggleCat(cat.id)}
                        aria-label={`${cat.label} phone alerts ${on ? 'on' : 'off'}`}
                        style={{
                          width:34, height:18, borderRadius:9, border:'none', cursor:'pointer', flexShrink:0,
                          background: on ? C.gold : C.border, position:'relative', transition:'background .2s',
                        }}>
                        <span style={{
                          position:'absolute', top:2, left: on ? 18 : 2,
                          width:14, height:14, borderRadius:7, background:C.white, transition:'left .2s', display:'block',
                        }}/>
                      </button>
                    </div>
                  )
                })}
                {/* Quiet hours — no buzzes during the window (bell alerts still land in-app) */}
                {(() => {
                  const q = pushState.quiet || { on: false, start: '22:00', end: '07:00' }
                  return (
                    <div style={{ paddingLeft:6, marginTop:2, borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                        <div>
                          <div style={{ fontSize:11, color:C.white, fontWeight:600 }}>🌙 Quiet hours</div>
                          <div style={{ fontSize:9, color:C.muted, marginTop:1 }}>No buzzes during these hours — alerts still show in the app</div>
                        </div>
                        <button
                          onClick={() => saveQuiet({ on: !q.on })}
                          aria-label={`Quiet hours ${q.on ? 'on' : 'off'}`}
                          style={{
                            width:34, height:18, borderRadius:9, border:'none', cursor:'pointer', flexShrink:0,
                            background: q.on ? C.gold : C.border, position:'relative', transition:'background .2s',
                          }}>
                          <span style={{
                            position:'absolute', top:2, left: q.on ? 18 : 2,
                            width:14, height:14, borderRadius:7, background:C.white, transition:'left .2s', display:'block',
                          }}/>
                        </button>
                      </div>
                      {q.on && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                          <span style={{ fontSize:10, color:C.muted }}>From</span>
                          <input
                            type="time" value={q.start} aria-label="Quiet hours start"
                            onChange={e => e.target.value && saveQuiet({ start: e.target.value })}
                            style={{ fontSize:11, background:'transparent', color:C.white, border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 6px', colorScheme:'dark' }}
                          />
                          <span style={{ fontSize:10, color:C.muted }}>to</span>
                          <input
                            type="time" value={q.end} aria-label="Quiet hours end"
                            onChange={e => e.target.value && saveQuiet({ end: e.target.value })}
                            style={{ fontSize:11, background:'transparent', color:C.white, border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 6px', colorScheme:'dark' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
            {pushMsg && <div style={{ fontSize:10, color: pushMsg.startsWith('✅') ? C.success : '#ffa600', marginTop:6, lineHeight:1.5 }}>{pushMsg}</div>}
            <div style={{ fontSize:9, color:C.muted, marginTop:6, textAlign:'center' }}>
              🔒 Notifications are private and encrypted
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// NOTIFICATION SENDER UTILITY
// Import and call these anywhere in your app to send notifications
//
// Usage examples:
//   import { sendNotification } from './components/Notifications'
//
//   // When coach sends a message:
//   sendNotification({
//     recipientId: CLIENT_UUID,
//     senderId:    COACH_UUID,
//     senderName: 'Coach',
//     type:        'message',
//     body:        'Your coach sent you a message',
//     linkTo:      'msgs',
//   })
//
//   // When coach updates diet plan:
//   sendNotification({
//     recipientId: CLIENT_UUID,
//     senderId:    COACH_UUID,
//     senderName: 'Coach',
//     type:        'diet_update',
//     body:        'Your diet plan has been updated. Check your Meal Plan tab.',
//     linkTo:      'diet',
//   })
// ════════════════════════════════════════════════════════════════
// Failures are never swallowed: the insert is checked, retried once, and if it
// still fails it's logged to the console AND to the server-side audit trail so
// a missing bell alert always leaves a trace.
export async function sendNotification({ recipientId, senderId, senderName, type, body, linkTo }: any) {
  if (!recipientId) return false
  if (senderId && recipientId === senderId) return false // never notify yourself
  const row = {
    recipient_id: recipientId,
    sender_id:    senderId,
    sender_name:  senderName,
    type,
    body,
    link_to:      linkTo || null,
    is_read:      false,
  }
  const attempt = async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST', headers: H, body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>'')).slice(0,300)}`)
  }
  let lastErr: any = null
  for (let i = 0; i < 2; i++) {
    try { await attempt(); return true }
    catch (e: any) {
      lastErr = e
      if (i === 0) await new Promise(r => setTimeout(r, 800)) // brief pause, then retry once
    }
  }
  const errMsg = lastErr?.message || String(lastErr)
  console.error('[notifications] insert failed after retry', { type, recipientId, linkTo, error: errMsg })
  // Best-effort audit-trail record (server-side, service key) so the gap is visible to admins
  try {
    const tok = sbAccessToken()
    if (tok) fetch('/api/audit/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        action: 'notification_send_failed',
        target_type: 'notification',
        target_id: String(recipientId),
        details: { type, link_to: linkTo || null, error: errMsg.slice(0, 300) },
      }),
    }).catch(() => {})
  } catch {}
  return false
}
