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

export function audSearchGroup(search) {
  const q = String(search || '').trim().replace(/["\\]/g, '')
  if (!q) return ''
  // ILIKE pattern, quoted so commas/parens in the query can't break PostgREST syntax
  const pat = pgQuote(`*${q}*`)
  return `or(actor_name.ilike.${pat},action.ilike.${pat},target_type.ilike.${pat})`
}

// Build the PostgREST query string for one page of audit rows.
// cursor = { created_at, id } of the last row already loaded (or null for page 1).
// Server-side person/action params ('all' or '' means no filter)
export function audFilterParams(person, action) {
  let p = ''
  if (person && person !== 'all') p += `&actor_name=eq.${encodeURIComponent(person)}`
  if (action && action !== 'all') p += `&action=eq.${encodeURIComponent(action)}`
  return p
}

export function auditPageQuery({ from = '', to = '', person = '', action = '', search = '', cursor = null, limit = AUD_PAGE } = {}) {
  let q = `select=*&order=created_at.desc,id.desc&limit=${limit}${audRangeParams(from, to)}${audFilterParams(person, action)}`
  let cursorGroup = ''
  if (cursor && cursor.created_at != null && cursor.id != null) {
    const ts = pgQuote(cursor.created_at), id = pgQuote(cursor.id)
    cursorGroup = `or(created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id}))`
  }
  const searchGroup = audSearchGroup(search)
  // PostgREST can't repeat the `or` key, so two groups must nest under `and=(...)`
  if (cursorGroup && searchGroup) q += `&and=(${cursorGroup},${searchGroup})`
  else if (cursorGroup) q += `&${cursorGroup.replace(/^or\(/, 'or=(')}`
  else if (searchGroup) q += `&${searchGroup.replace(/^or\(/, 'or=(')}`
  return q
}

export function makeLatestWins() {
  let seq = 0
  return {
    start: () => ++seq,
    isCurrent: t => t === seq,
  }
}

// ---- Whole-history facet lists (distinct people / actions) ----
// PostgREST has no DISTINCT, so we walk the column in ascending keyset pages:
// after each page we resume STRICTLY AFTER the last value seen (value.gt),
// which also skips that value's remaining duplicate rows — every distinct
// value is still reached because pages are ordered by the value itself.
export const AUD_FACET_PAGE = 1000
const AUD_FACET_MAX_PAGES = 50 // safety valve: 50k+ distinct values → treat as error, never as complete

export function auditFacetPageQuery(column, afterValue = null, limit = AUD_FACET_PAGE) {
  let q = `select=${column}&order=${column}.asc&limit=${limit}&${column}=not.is.null`
  if (afterValue != null) q += `&${column}=gt.${pgQuote(afterValue)}`
  return q
}

// Fetch ALL distinct values of `column` via the fetcher (params) => Promise<rows>.
// Throws on any fetch failure or if the page cap is hit — callers must surface
// a retriable error instead of silently treating a truncated list as complete.
export async function fetchAuditFacet(fetcher, column, pageSize = AUD_FACET_PAGE) {
  const out = []
  let after = null
  for (let page = 0; page < AUD_FACET_MAX_PAGES; page++) {
    const rows = await fetcher(auditFacetPageQuery(column, after, pageSize))
    if (!Array.isArray(rows)) throw new Error(`audit facet fetch failed for ${column}`)
    for (const r of rows) {
      const v = r?.[column]
      if (v != null && v !== '' && v !== after) { out.push(v); after = v }
      else if (v != null && v !== '') after = v
    }
    if (rows.length < pageSize) return out
  }
  throw new Error(`audit facet scan for ${column} exceeded ${AUD_FACET_MAX_PAGES} pages`)
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
