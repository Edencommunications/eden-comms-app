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

export function saveSeen(uuid, map) {
  try { localStorage.setItem(lsKey(uuid), JSON.stringify(map)) } catch {}
  try { window.dispatchEvent(new CustomEvent('teamhub-seen')) } catch {}
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
        const seen = loadSeen(me.id)
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
