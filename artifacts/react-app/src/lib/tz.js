// ═══════════════════════════════════════════════════════════════
// tz.js — timezone support for check-in deadlines & scheduling.
//
// • Coaches pick their timezone (saved on their user_profiles row).
// • Clients see deadline text in THEIR COACH's timezone.
// • Broadcast scheduling converts a wall-clock time in a chosen
//   timezone to a UTC instant before saving.
// ═══════════════════════════════════════════════════════════════
import { sbBearer } from './sbAuth'

const SB_URL = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

export const TZ_OPTIONS = [
  { value: 'America/Chicago',     label: 'Central (CST/CDT)',   short: 'CST' },
  { value: 'America/New_York',    label: 'Eastern (EST/EDT)',   short: 'EST' },
  { value: 'America/Denver',      label: 'Mountain (MST/MDT)',  short: 'MST' },
  { value: 'America/Phoenix',     label: 'Arizona (no DST)',    short: 'MST' },
  { value: 'America/Los_Angeles', label: 'Pacific (PST/PDT)',   short: 'PST' },
  { value: 'America/Anchorage',   label: 'Alaska',              short: 'AKST' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii',              short: 'HST' },
  { value: 'Europe/London',       label: 'UK (GMT/BST)',        short: 'GMT' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST)',       short: 'AEST' },
]

export const DEFAULT_TZ = 'America/Chicago'

export function tzShort(tz) {
  return (TZ_OPTIONS.find(o => o.value === tz) || TZ_OPTIONS[0]).short
}
export function tzLabel(tz) {
  return (TZ_OPTIONS.find(o => o.value === tz) || TZ_OPTIONS[0]).label
}

// Convert "YYYY-MM-DD" + "HH:MM" wall-clock time IN the given tz → UTC ISO string.
// Two-pass offset resolution keeps DST transition edges correct: the first pass
// estimates the offset, the second re-derives it at the corrected instant so a
// time on the other side of a spring-forward/fall-back boundary lands right.
function wallClockInTz(ms, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
}
export function zonedTimeToIso(dateStr, timeStr, tz) {
  const target = new Date(`${dateStr}T${timeStr}:00Z`).getTime()
  let guess = target
  for (let i = 0; i < 3; i++) {                    // converges in ≤2 passes
    const diff = wallClockInTz(guess, tz) - target
    if (diff === 0) break
    guess -= diff
  }
  // Nonexistent local times (spring-forward gap) settle on the instant after
  // the jump — the closest real moment — rather than silently drifting.
  return new Date(guess).toISOString()
}

// ── Deadline timezone resolution (cached per email) ──────────
// Coaches/staff → their own saved timezone.
// Clients → their coach's saved timezone.
const cache = {}

async function get(pathQuery) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathQuery}`, {
    headers: { apikey: ANON, Authorization: sbBearer() },
  })
  if (!r.ok) return []
  return r.json()
}

export async function fetchDeadlineTz(email) {
  if (!email) return DEFAULT_TZ
  if (cache[email]) return cache[email]
  try {
    const rows = await get(`user_profiles?email=eq.${encodeURIComponent(email)}&select=role,timezone,coach_id`)
    const me = Array.isArray(rows) ? rows[0] : null
    if (!me) return DEFAULT_TZ
    let tz = me.timezone
    if (!tz && me.role === 'client' && me.coach_id) {
      const c = await get(`user_profiles?id=eq.${me.coach_id}&select=timezone`)
      tz = Array.isArray(c) ? c[0]?.timezone : null
    }
    cache[email] = tz || DEFAULT_TZ
    return cache[email]
  } catch { return DEFAULT_TZ }
}

// Clear ALL cached entries — clients cache their coach's resolved timezone,
// so a coach changing their setting must invalidate every key, not just their own.
export function clearTzCache() { for (const k of Object.keys(cache)) delete cache[k]; }

// React hook: returns the short label (e.g. "CST", "EST") for deadline text
import { useState, useEffect } from 'react'
export function useDeadlineTzShort(email) {
  const [short, setShort] = useState(tzShort(cache[email] || DEFAULT_TZ))
  useEffect(() => {
    let live = true
    fetchDeadlineTz(email).then(tz => { if (live) setShort(tzShort(tz)) })
    return () => { live = false }
  }, [email])
  return short
}
