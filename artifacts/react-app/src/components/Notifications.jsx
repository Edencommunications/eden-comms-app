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
import { sbBearer } from '../lib/sbAuth'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach',    role:'coach' },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Client', role:'client' },
  'admin@edencomms.io': { uuid:null,                                    name:'Eden Admin',      role:'super_admin' },
}

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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H })
  if (!res.ok) return []
  return res.json()
}

async function dbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!res.ok) console.error('INSERT', await res.text())
}

async function dbUpdate(table, params, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
}

// ── Format relative time ──────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)  return 'Just now'
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago'
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago'
  return Math.floor(diff/86400) + 'd ago'
}

// ── Notification type config ──────────────────────────────────
const NOTIF_CONFIG = {
  message:      { icon:'💬', label:'New Message',          color: C.gold },
  diet_update:  { icon:'🥗', label:'Diet Plan Updated',    color: C.success },
  supp_update:  { icon:'💊', label:'Supplement Updated',   color:'#D4A8F0' },
  checkin_received: { icon:'📋', label:'Check-In Received',color: C.gold },
  lab_uploaded: { icon:'🧪', label:'Lab Uploaded',         color:'#6FB8E8' },
  update_note:  { icon:'📝', label:'Coach Update',         color: C.gold },
  loom_posted:  { icon:'🎥', label:'Video Update Posted',  color: C.gold },
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Renders as a bell icon with badge count + dropdown panel
// ════════════════════════════════════════════════════════════════
export default function Notifications({ currentUser, onNavigate }) {
  const [open,    setOpen]    = useState(false)
  const [notifs,  setNotifs]  = useState([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  const email  = currentUser?.email || ''
  const info   = KNOWN_USERS[email] || { role:'client', name:'User', uuid:null }
  const myUUID = info.uuid
  const role   = info.role

  const unreadCount = notifs.filter(n => !n.is_read).length

  // ── Load notifications on mount + poll every 15s ──────────
  useEffect(() => {
    if (!myUUID) return
    loadNotifs()
    const interval = setInterval(loadNotifs, 15000)
    return () => clearInterval(interval)
  }, [myUUID])

  // ── Close panel when clicking outside ─────────────────────
  useEffect(() => {
    function handleClick(e) {
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

  async function markRead(id) {
    await dbUpdate('notifications', `id=eq.${id}`, {
      is_read: true,
      read_at: new Date().toISOString(),
    })
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read:true } : n))
  }

  async function markAllRead() {
    await dbUpdate('notifications', `recipient_id=eq.${myUUID}&is_read=eq.false`, {
      is_read: true,
      read_at: new Date().toISOString(),
    })
    setNotifs(prev => prev.map(n => ({ ...n, is_read:true })))
  }

  function handleNotifClick(notif) {
    markRead(notif.id)
    setOpen(false)
    // Tell the parent app to navigate to the right tab
    if (onNavigate && notif.link_to) {
      onNavigate(notif.link_to)
    }
  }

  const cfg = (type) => NOTIF_CONFIG[type] || { icon:'🔔', label:'Notification', color:C.gold }

  return (
    <div ref={panelRef} style={{ position:'relative', display:'inline-flex' }}>

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
      </button>

      {/* ── Notification panel ────────────────────────────── */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0,
          width:340, maxHeight:480,
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

          {/* Footer */}
          <div style={{
            padding:'10px 16px', borderTop:`1px solid ${C.border}`,
            flexShrink:0, textAlign:'center',
          }}>
            <div style={{ fontSize:10, color:C.muted }}>
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
export async function sendNotification({ recipientId, senderId, senderName, type, body, linkTo }) {
  if (!recipientId) return
  await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      recipient_id: recipientId,
      sender_id:    senderId,
      sender_name:  senderName,
      type,
      body,
      link_to:      linkTo,
      is_read:      false,
    }),
  })
}
