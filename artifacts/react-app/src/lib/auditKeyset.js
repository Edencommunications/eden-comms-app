// Keyset pagination helpers for the audit log (Week6 Audit tab).
// Order is (created_at DESC, id DESC) — a deterministic composite key — so
// pages never skip or duplicate rows even when many events share a timestamp.

export const AUD_PAGE = 300

// Server-side date-range params (dates are YYYY-MM-DD from <input type=date>)
export function audRangeParams(from, to) {
  let p = ''
  if (from) p += `&created_at=gte.${from}T00:00:00`
  if (to)   p += `&created_at=lte.${to}T23:59:59.999`
  return p
}

// PostgREST quoted value, URL-encoded (handles '+' in ISO timestamps, commas, etc.)
const pgQuote = v => encodeURIComponent(`"${v}"`)

// Build the PostgREST query string for one page of audit rows.
// cursor = { created_at, id } of the last row already loaded (or null for page 1).
export function auditPageQuery({ from = '', to = '', cursor = null, limit = AUD_PAGE } = {}) {
  let q = `select=*&order=created_at.desc,id.desc&limit=${limit}${audRangeParams(from, to)}`
  if (cursor && cursor.created_at != null && cursor.id != null) {
    const ts = pgQuote(cursor.created_at), id = pgQuote(cursor.id)
    q += `&or=(created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id}))`
  }
  return q
}

// Reference implementations of the same ordering/predicate, used by tests to
// verify the keyset walks an entire dataset without skips or duplicates.
export function cmpAuditDesc(a, b) {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  const ai = String(a.id), bi = String(b.id)
  if (ai !== bi) return ai < bi ? 1 : -1
  return 0
}
export function isOlderThanCursor(row, cursor) {
  return row.created_at < cursor.created_at ||
    (row.created_at === cursor.created_at && String(row.id) < String(cursor.id))
}
