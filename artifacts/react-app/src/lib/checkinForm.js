// ═══════════════════════════════════════════════════════════════
// checkinForm.js — customizable weekly check-in forms.
//
// Every org and coach starts with Eden's standard form (the registry
// below). Customizations are stored in admin_settings (existing
// org-scoped table — no schema changes needed):
//   • org-wide form:   key 'checkin_form'
//   • per-coach form:  key 'checkin_form:<coachProfileId>'
//
// Resolution for a client: their coach's form → their org's form →
// the standard default. Saved form shape:
//   { off: ['hrv', ...], custom: [{ id, label, type }] }
//     off    — standard metric keys the form has turned OFF
//     custom — extra metrics: type 'number' | 'scale' (1–10) | 'text'
// ═══════════════════════════════════════════════════════════════
import { sbBearer } from './sbAuth'

const SB_URL = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const H = { apikey: ANON, get Authorization() { return sbBearer() }, 'Content-Type': 'application/json' }

// ── The standard (Eden master) form — every org/coach starts here ──
export const CHECKIN_SECTIONS = [
  { id: 'vitals', label: 'Vitals', items: [
    { key: 'weight',    label: 'Body Weight (lbs)' },
    { key: 'temp',      label: 'Body Temperature (°F)' },
    { key: 'steps',     label: 'Avg Daily Steps' },
    { key: 'bp',        label: 'Blood Pressure' },
    { key: 'heartRate', label: 'Morning Heart Rate (BPM)' },
    { key: 'hrv',       label: 'HRV' },
  ]},
  { id: 'scales', label: 'Wellbeing Scales (1–10)', items: [
    { key: 'sleep',    label: 'Sleep Quality' },
    { key: 'bloating', label: 'Bloating' },
    { key: 'brainFog', label: 'Brain Fog' },
    { key: 'sexDrive', label: 'Sex Drive' },
    { key: 'energy',   label: 'Energy' },
    { key: 'hunger',   label: 'Hunger' },
  ]},
  { id: 'sleepDigestion', label: 'Sleep & Digestion', items: [
    { key: 'wakeTime',   label: 'Sleep window (fall asleep / wake)' },
    { key: 'sleepNotes', label: 'Sleep disruption notes' },
    { key: 'bowelCount', label: 'Avg daily bowel movements' },
    { key: 'bowelType',  label: 'Stool consistency' },
  ]},
  { id: 'women', label: 'For Women Only', items: [
    { key: 'cycle', label: 'Cycle notes & period pain' },
  ]},
]
export const ALL_STANDARD_KEYS = CHECKIN_SECTIONS.flatMap(s => s.items.map(i => i.key))

export const DEFAULT_FORM = { off: [], custom: [] }

export const CUSTOM_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'scale',  label: 'Scale 1–10' },
  { value: 'text',   label: 'Text' },
]

function normalizeForm(raw) {
  let v = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
  if (!v || typeof v !== 'object') return { ...DEFAULT_FORM }
  return {
    off: Array.isArray(v.off) ? v.off.filter(k => ALL_STANDARD_KEYS.includes(k)) : [],
    custom: Array.isArray(v.custom)
      ? v.custom.filter(c => c && c.label).map(c => ({
          id: c.id || String(c.label).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label: String(c.label),
          type: ['number', 'scale', 'text'].includes(c.type) ? c.type : 'text',
        }))
      : [],
  }
}

const keyFor = (coachId) => coachId ? `checkin_form:${coachId}` : 'checkin_form'

async function get(pathQuery) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathQuery}`, { headers: H })
  if (!r.ok) return []
  return r.json()
}

// ── Cache + change notification (same pattern as tz.js) ──────────
const cache = {}
let version = 0
const listeners = new Set()
export function clearCheckinFormCache() {
  for (const k of Object.keys(cache)) delete cache[k]
  version++
  listeners.forEach(fn => { try { fn(version) } catch {} })
}

// Load the form saved at ONE exact scope (org or a specific coach).
// Returns null when that scope has no customization.
export async function loadFormAtScope(companyId, coachId) {
  if (!companyId) return null
  const rows = await get(`admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(keyFor(coachId))}&select=value`)
  if (!Array.isArray(rows) || !rows.length) return null
  return normalizeForm(rows[0].value)
}

// Resolve the EFFECTIVE form for a client/coach:
// coach's customization → org's customization → standard default.
export async function resolveCheckinForm(companyId, coachId) {
  const ck = `${companyId}|${coachId || ''}`
  if (cache[ck]) return cache[ck]
  try {
    if (!companyId) return { ...DEFAULT_FORM }
    const keys = coachId ? `in.("checkin_form","${keyFor(coachId)}")` : 'eq.checkin_form'
    const rows = await get(`admin_settings?company_id=eq.${companyId}&key=${encodeURIComponent(keys).replace(/%2C/g, ',')}&select=key,value`)
    const byKey = {}
    for (const r of (rows || [])) byKey[r.key] = r.value
    const raw = (coachId && byKey[keyFor(coachId)] != null) ? byKey[keyFor(coachId)]
      : (byKey['checkin_form'] != null) ? byKey['checkin_form']
      : null
    cache[ck] = raw != null ? normalizeForm(raw) : { ...DEFAULT_FORM }
    return cache[ck]
  } catch { return { ...DEFAULT_FORM } }
}

// Save a form at a scope (org-wide when coachId is null, else that coach).
// Goes through the API server, which verifies the caller's JWT and enforces
// scope ownership (coaches: own form only; admins: their org + its coaches).
export async function saveCheckinForm(companyId, coachId, form) {
  const r = await fetch('/api/checkin-form/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
    body: JSON.stringify({ coachId: coachId || null, form: { off: form.off || [], custom: form.custom || [] } }),
  })
  if (!r.ok) return false
  clearCheckinFormCache()
  return true
}

// Remove a coach's customization so they inherit the org form again.
export async function deleteCheckinForm(companyId, coachId) {
  const r = await fetch('/api/checkin-form/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
    body: JSON.stringify({ coachId: coachId || null }),
  })
  if (r.ok) clearCheckinFormCache()
  return r.ok
}

// React hook: effective form for a client/coach, live-updating on saves.
import { useState, useEffect } from 'react'
export function useCheckinForm(companyId, coachId) {
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [v, setV] = useState(version)
  useEffect(() => {
    listeners.add(setV)
    return () => { listeners.delete(setV) }
  }, [])
  useEffect(() => {
    let live = true
    if (!companyId) return
    resolveCheckinForm(companyId, coachId).then(f => { if (live) setForm(f) })
    return () => { live = false }
  }, [companyId, coachId, v])
  return form
}
