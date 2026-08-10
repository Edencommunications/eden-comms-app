// ═══════════════════════════════════════════════════════════════
// teamUnread.js — shared "last viewed" tracking for Team Hub chat.
//
// The seen-map lives in localStorage per user:
//   teamhub_seen_<uuid> = { general: ts, "<idA>_<idB>": ts, ... }
// Week7 writes it (markSeen) and dispatches a 'teamhub-seen' window
// event; the App shell's useTeamHubUnread hook reads it to show the
// unread dot on the Team Hub tab even when Week7 is not mounted.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { sbBearer } from './sbAuth'
import { supabase } from '../supabaseClient'

const SUPABASE_URL = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'

const lsKey = (uuid) => `teamhub_seen_${uuid}`

export function loadSeen(uuid) {
  try { return JSON.parse(localStorage.getItem(lsKey(uuid)) || '{}') || {} } catch { return {} }
}

export function saveSeen(uuid, map, delta) {
  try { localStorage.setItem(lsKey(uuid), JSON.stringify(map)) } catch {}
  try { window.dispatchEvent(new CustomEvent('teamhub-seen')) } catch {}
  // Sync only what changed (falls back to the full map for older callers)
  pushSeen(uuid, delta || map)
}

// ── Cross-device sync (DB is the source of truth; localStorage is cache) ──
// The api-server merges per-key with max(), so a stale device can never
// roll another device's newer read state backwards.
const API = (p) => `${(import.meta.env.BASE_URL || '/')}api/${p}`

// Push state is scoped per user AND the bearer token is captured at enqueue
// time — after an account switch a delayed flush goes out with the OLD
// session's token (server rejects it) instead of writing under the new user.
const pushState = {} // uuid -> { timer, queue, token }
function pushSeen(uuid, map) {
  if (!uuid) return
  const st = (pushState[uuid] ||= { timer: null, queue: null, token: null })
  st.queue = { ...(st.queue || {}), ...map }
  st.token = sbBearer()
  if (st.timer) return
  // Lightly debounced so rapid conversation switches send one request
  st.timer = setTimeout(async () => {
    const { queue, token } = st
    st.timer = null; st.queue = null
    try {
      await fetch(API('team/seen'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ seen: queue }),
      })
    } catch { /* offline — local cache still works; next markSeen retries */ }
  }, 800)
}

// Fetch the DB copy, merge (per-key max) into localStorage, return merged map.
// Never throws — falls back to the local cache on any failure.
export async function syncSeen(uuid) {
  const local = loadSeen(uuid)
  try {
    const r = await fetch(API('team/seen'), { headers: { Authorization: sbBearer() } })
    const b = r.ok ? await r.json() : null
    const remote = b?.seen
    if (!remote || typeof remote !== 'object') return local
    const merged = { ...local }
    let changed = false
    for (const [k, t] of Object.entries(remote)) {
      const n = Number(t)
      if (Number.isFinite(n) && n > (merged[k] || 0)) { merged[k] = n; changed = true }
    }
    if (changed) {
      try { localStorage.setItem(lsKey(uuid), JSON.stringify(merged)) } catch {}
      try { window.dispatchEvent(new CustomEvent('teamhub-seen')) } catch {}
    }
    return merged
  } catch { return local }
}

// Timestamp a conversation was last viewed (0 = never)
export const seenAt = (seen, key) => seen?.[key] ?? 0

// App-shell hook: true when Team Hub chat has anything unread for this user.
// Polls lightly (20s) and re-checks instantly whenever Week7 marks a
// conversation as seen. Only relevant for staff — clients never see Team Hub.
export function useTeamHubUnread(user) {
  const [unread, setUnread] = useState(false)
  const email = user?.email || ''
  const role = user?.role || ''
  useEffect(() => {
    if (!email || role === 'client' || user?.communityOnly) { setUnread(false); return }
    let stopped = false
    let me = null
    let liveChan = null
    const H = { apikey: SUPABASE_ANON, get Authorization() { return sbBearer() } }
    async function check() {
      try {
        if (!me) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,company_id`, { headers: H })
          const rows = r.ok ? await r.json() : []
          me = rows?.[0]
          if (!me?.id) return
          // Instant updates: listen to the same broadcast channel Week7 uses
          // when anyone sends a Team Hub message, so the sidebar dot lights
          // up immediately instead of waiting for the next poll.
          if (!stopped && !liveChan) {
            try {
              liveChan = supabase.channel(`teamhub-live-${me.company_id || EDEN_ORG_ID}`)
                .on('broadcast', { event: 'new-message' }, () => check())
                .subscribe()
            } catch {}
          }
        }
        const orgId = me.company_id || EDEN_ORG_ID
        const r2 = await fetch(
          `${SUPABASE_URL}/rest/v1/team_messages?org_id=eq.${orgId}&sender_id=neq.${me.id}&deleted_at=is.null&order=created_at.desc&limit=100&select=created_at,sender_id,is_dm,dm_to_id`,
          { headers: H })
        const rows = r2.ok ? await r2.json() : []
        if (stopped || !Array.isArray(rows)) return
        // Pull the DB read state each cycle so a chat read on another
        // device clears this device's badge within a poll cycle.
        const seen = await syncSeen(me.id)
        if (stopped) return
        const any = rows.some(m => {
          const t = new Date(m.created_at).getTime()
          if (m.is_dm) {
            if (m.dm_to_id !== me.id) return false
            return t > seenAt(seen, [m.sender_id, m.dm_to_id].sort().join('_'))
          }
          return t > seenAt(seen, 'general')
        })
        setUnread(any)
      } catch {}
    }
    check()
    const iv = setInterval(check, 20000)
    const onSeen = () => check()
    window.addEventListener('teamhub-seen', onSeen)
    return () => {
      stopped = true; clearInterval(iv); window.removeEventListener('teamhub-seen', onSeen)
      try { if (liveChan) supabase.removeChannel(liveChan) } catch {}
    }
  }, [email, role]) // eslint-disable-line
  return unread
}

// App-shell hook: true when any client↔staff conversation has unread messages
// addressed to this user (messages.is_read=false, sender != me). Messaging.jsx
// marks messages read when the conversation is opened.
export function useMessagesUnread(user) {
  const [unread, setUnread] = useState(false)
  const email = user?.email || ''
  useEffect(() => {
    if (!email || user?.communityOnly) { setUnread(false); return }
    let stopped = false
    let me = null
    const H = { apikey: SUPABASE_ANON, get Authorization() { return sbBearer() } }
    async function check() {
      try {
        if (!me) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id`, { headers: H })
          const rows = r.ok ? await r.json() : []
          me = rows?.[0]
          if (!me?.id) return
        }
        const rc = await fetch(`${SUPABASE_URL}/rest/v1/conversations?or=(participant_a_id.eq.${me.id},participant_b_id.eq.${me.id})&select=id&limit=200`, { headers: H })
        const convos = rc.ok ? await rc.json() : []
        if (!convos.length) { if (!stopped) setUnread(false); return }
        const ids = convos.map(c => c.id).join(',')
        const rm = await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=in.(${ids})&is_read=eq.false&sender_id=neq.${me.id}&select=id&limit=1`, { headers: H })
        const rows = rm.ok ? await rm.json() : []
        if (!stopped) setUnread(rows.length > 0)
      } catch {}
    }
    check()
    const iv = setInterval(check, 30000)
    return () => { stopped = true; clearInterval(iv) }
  }, [email]) // eslint-disable-line
  return unread
}
