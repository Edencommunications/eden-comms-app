// ═══════════════════════════════════════════════════════════════
// sbAuth.js — shared auth header for direct Supabase REST calls.
//
// With Row Level Security enabled, requests carrying only the anon
// key see NOTHING. Every REST/storage call must send the signed-in
// user's access token instead. supabase-js keeps the session (and
// auto-refreshes it) in localStorage; we read the live token from
// there at call time so refreshed tokens are always picked up.
//
// Usage:
//   import { sbBearer } from '../lib/sbAuth'
//   const H = { 'apikey': ANON, get Authorization() { return sbBearer() } }
// The getter makes module-scope header objects dynamic — both
// `headers: H` and `{ ...H }` re-read the current token.
// ═══════════════════════════════════════════════════════════════

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

export function sbAccessToken() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const j = JSON.parse(localStorage.getItem(k) || 'null')
        const t = j?.access_token || j?.currentSession?.access_token
        if (t) return t
      }
    }
  } catch {}
  return null
}

// Bearer value: the user's live JWT when signed in, anon key otherwise
// (pre-login screens — RLS decides what anon may see).
export function sbBearer() {
  return `Bearer ${sbAccessToken() || ANON}`
}
