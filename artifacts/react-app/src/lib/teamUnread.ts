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

const lsKey = (uuid: any) => `teamhub_seen_${uuid}`

export function loadSeen(uuid: any) {
  try { return JSON.parse(localStorage.getItem(lsKey(uuid)) || '{}') || {} } catch { return {} }
}

export function saveSeen(uuid: any, map: any, delta?: any) {
  try { localStorage.setItem(lsKey(uuid), JSON.stringify(map)) } catch {}
  try { window.dispatchEvent(new CustomEvent('teamhub-seen')) } catch {}
  // Sync only what changed (falls back to the full map for older callers)
  pushSeen(uuid, delta || map)
}

// ── Cross-device sync (DB is the source of truth; localStorage is cache) ──
// The api-server merges per-key with max(), so a stale device can never
// roll another device's newer read state backwards.
const API = (p: any) => `${(import.meta.env.BASE_URL || '/')}api/${p}`

// Push state is scoped per user AND the bearer token is captured at enqueue
// time — after an account switch a delayed flush goes out with the OLD
// session's token (server rejects it) instead of writing under the new user.
const pushState: any = {} // uuid -> { timer, queue, token }
function pushSeen(uuid: any, map: any) {
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
export async function syncSeen(uuid: any): Promise<any> {
  const local: any = loadSeen(uuid)
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

// Merge a delta (per-key max) into the local cache WITHOUT pushing to the
// server — used when another device broadcasts its own "seen" event, which
// that device already persisted. Returns the merged map.
export function mergeSeenLocal(uuid: any, delta: any) {
  const local = loadSeen(uuid)
  let changed = false
  for (const [k, t] of Object.entries(delta || {})) {
    const n = Number(t)
    if (Number.isFinite(n) && n > (local[k] || 0)) { local[k] = n; changed = true }
  }
  if (changed) {
    try { localStorage.setItem(lsKey(uuid), JSON.stringify(local)) } catch {}
    try { window.dispatchEvent(new CustomEvent('teamhub-seen')) } catch {}
  }
  return local
}

// Timestamp a conversation was last viewed (0 = never)
export const seenAt = (seen: any, key: any) => seen?.[key] ?? 0

// App-shell hook: true when Team Hub chat has anything unread for this user.
// Polls lightly (20s) and re-checks instantly whenever Week7 marks a
// conversation as seen. Only relevant for staff — clients never see Team Hub.
export function useTeamHubUnread(user: any) {
  const [unread, setUnread] = useState(false)
  const email = user?.email || ''
  const role = user?.role || ''
  useEffect(() => {
    if (!email || role === 'client' || user?.communityOnly) { setUnread(false); return }
    let stopped = false
    let me: any = null
    let liveChan: any = null
    let checking = false // in-flight guard: poll + seen events must not overlap
    const H = { apikey: SUPABASE_ANON, get Authorization() { return sbBearer() } }
    async function check() {
      if (checking) return
      checking = true
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
        let any = rows.some((m: any) => {
          const t = new Date(m.created_at).getTime()
          if (m.is_dm) {
            if (m.dm_to_id !== me.id) return false
            return t > seenAt(seen, [m.sender_id, m.dm_to_id].sort().join('_'))
          }
          return t > seenAt(seen, 'general')
        })
        // Team-context communities live inside the Team Hub too — light the
        // dot when any of them has a message newer than its last-read stamp.
        if (!any) {
          try {
            const isAdminRole = role === 'super_admin' || role === 'company_admin'
            let comms: any[] = []
            if (isAdminRole) {
              const rc = await fetch(`${SUPABASE_URL}/rest/v1/communities?company_id=eq.${orgId}&context=eq.team&is_active=eq.true&select=id`, { headers: H })
              comms = rc.ok ? await rc.json() : []
            } else {
              const rms = await fetch(`${SUPABASE_URL}/rest/v1/community_members?user_id=eq.${me.id}&select=community_id`, { headers: H })
              const memberIds = (rms.ok ? await rms.json() : []).map((m: any) => m.community_id)
              const [mine, joined] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/communities?created_by=eq.${me.id}&context=eq.team&is_active=eq.true&select=id`, { headers: H }).then(r => r.ok ? r.json() : []),
                memberIds.length
                  ? fetch(`${SUPABASE_URL}/rest/v1/communities?id=in.(${memberIds.join(',')})&context=eq.team&is_active=eq.true&select=id`, { headers: H }).then(r => r.ok ? r.json() : [])
                  : Promise.resolve([]),
              ])
              const dedup = new Set()
              comms = [...mine, ...joined].filter((c: any) => { if (dedup.has(c.id)) return false; dedup.add(c.id); return true })
            }
            if (comms.length && !stopped) {
              // Communities.jsx keeps its own local seen-map (ISO or ms stamps);
              // the server copy (already merged into `seen`) uses comm:<id> keys.
              let localComm: any = {}
              try { localComm = JSON.parse(localStorage.getItem(`community_seen_${me.id}`) || '{}') || {} } catch {}
              const stamp = (v: any) => typeof v === 'number' ? v : (Date.parse(v) || 0)
              // Check each community against ITS OWN seen stamp (one busy,
              // already-read community must not mask an unread quiet one)
              const hits = await Promise.all(comms.map(async (c: any) => {
                const lastRead = Math.max(stamp(localComm[c.id]), Number(seen[`comm:${c.id}`]) || 0)
                const since = new Date(lastRead || 0).toISOString()
                const rm = await fetch(
                  `${SUPABASE_URL}/rest/v1/community_messages?community_id=eq.${c.id}&sender_id=neq.${me.id}&created_at=gt.${encodeURIComponent(since)}&select=id&limit=1`,
                  { headers: H })
                const msgs = rm.ok ? await rm.json() : []
                return Array.isArray(msgs) && msgs.length > 0
              }))
              any = hits.some(Boolean)
            }
          } catch {}
        }
        if (!stopped) setUnread(any)
      } catch {} finally { checking = false }
    }
    check()
    const iv = setInterval(check, 20000)
    const onSeen = () => check()
    window.addEventListener('teamhub-seen', onSeen)
    // Communities.jsx fires this when a community chat is opened/read
    window.addEventListener('hub-seen-updated', onSeen)
    return () => {
      stopped = true; clearInterval(iv)
      window.removeEventListener('teamhub-seen', onSeen)
      window.removeEventListener('hub-seen-updated', onSeen)
      try { if (liveChan) supabase.removeChannel(liveChan) } catch {}
    }
  }, [email, role]) // eslint-disable-line
  return unread
}

// App-shell hook: true when any client↔staff conversation has unread messages
// addressed to this user (messages.is_read=false, sender != me). Messaging.jsx
// marks messages read when the conversation is opened.
export function useMessagesUnread(user: any) {
  const [unread, setUnread] = useState(false)
  const email = user?.email || ''
  useEffect(() => {
    if (!email || user?.communityOnly) { setUnread(false); return }
    let stopped = false
    let me: any = null
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
        const ids = convos.map((c: any) => c.id).join(',')
        const rm = await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=in.(${ids})&is_read=eq.false&sender_id=neq.${me.id}&select=id&limit=1`, { headers: H })
        const rows = rm.ok ? await rm.json() : []
        let any = rows.length > 0
        // Manually "kept unread" chats/threads count too (persisted via /api/msgs/unread)
        if (!any) {
          try {
            const rman = await fetch(`${(import.meta as any).env?.BASE_URL || '/'}api/msgs/unread`, { headers: { Authorization: sbBearer() } })
            const b = rman.ok ? await rman.json() : null
            any = (Array.isArray(b?.unread) && b.unread.length > 0) ||
                  (Array.isArray(b?.threads) && b.threads.length > 0)
          } catch {}
        }
        if (!stopped) setUnread(any)
      } catch {}
    }
    check()
    const iv = setInterval(check, 30000)
    // Realtime: a broadcast on my user channel means a message just landed —
    // light the Messages tab instantly instead of waiting for the next poll.
    let chan: any = null
    ;(async () => {
      try {
        // me may not be resolved yet — check() resolves it on first run
        for (let i = 0; i < 20 && !me; i++) await new Promise(r => setTimeout(r, 500))
        if (stopped || !me?.id) return
        // Own topic (msgs-tab-*) — Messaging.tsx owns msgs-user-*, and two
        // subscribers on one topic conflict in the realtime client.
        chan = supabase.channel(`msgs-tab-${me.id}`)
          .on('broadcast', { event: 'new-message' }, () => { if (!stopped) setUnread(true) })
          .subscribe()
      } catch {}
    })()
    return () => { stopped = true; clearInterval(iv); try { if (chan) supabase.removeChannel(chan) } catch {} }
  }, [email]) // eslint-disable-line
  return unread
}
