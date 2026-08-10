// Keyset pagination tests for the audit log.
// Verifies that paginating with the composite (created_at DESC, id DESC) keyset
// walks an entire dataset — including hundreds of rows sharing one timestamp —
// with no skipped and no duplicated rows, and that the PostgREST query string
// is correctly encoded.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AUD_PAGE, auditPageQuery, cmpAuditDesc, isOlderThanCursor } from '../src/lib/auditKeyset.js'

// Simulated PostgREST server: applies the same ordering + keyset predicate.
function makeServer(rows) {
  const sorted = [...rows].sort(cmpAuditDesc)
  return (cursor, limit = AUD_PAGE) => {
    const filtered = cursor ? sorted.filter(r => isOlderThanCursor(r, cursor)) : sorted
    return filtered.slice(0, limit)
  }
}

function paginateAll(rows) {
  const server = makeServer(rows)
  const got = []
  let cursor = null
  for (let guard = 0; guard < 100; guard++) {
    const page = server(cursor)
    got.push(...page)
    if (page.length < AUD_PAGE) break
    const last = page[page.length - 1]
    cursor = { created_at: last.created_at, id: last.id }
  }
  return got
}

test('paginates a dataset where 400+ rows share one timestamp — no skips, no dupes', () => {
  const rows = []
  // 200 rows with distinct timestamps
  for (let i = 0; i < 200; i++)
    rows.push({ id: `a-${String(i).padStart(4, '0')}`, created_at: `2026-08-0${(i % 9) + 1}T0${i % 10}:00:0${i % 10}+00:00` })
  // 450 rows all written at the exact same instant (batch insert) — more than one page
  for (let i = 0; i < 450; i++)
    rows.push({ id: `b-${String(i).padStart(4, '0')}`, created_at: '2026-08-10T12:00:00.000000+00:00' })
  // 100 older rows after the batch
  for (let i = 0; i < 100; i++)
    rows.push({ id: `c-${String(i).padStart(4, '0')}`, created_at: `2026-07-0${(i % 9) + 1}T00:00:00+00:00` })

  const got = paginateAll(rows)
  assert.equal(got.length, rows.length, 'every row is retrieved exactly the right number of times')
  const ids = new Set(got.map(r => r.id))
  assert.equal(ids.size, rows.length, 'no duplicates and no skipped rows')
})

test('page boundary that lands mid-batch of identical timestamps continues correctly', () => {
  // Exactly AUD_PAGE rows share a timestamp, plus rows on both sides
  const rows = []
  for (let i = 0; i < 50; i++) rows.push({ id: `new-${i}`, created_at: '2026-08-11T00:00:00+00:00' })
  for (let i = 0; i < AUD_PAGE; i++) rows.push({ id: `same-${String(i).padStart(4, '0')}`, created_at: '2026-08-10T00:00:00+00:00' })
  for (let i = 0; i < 50; i++) rows.push({ id: `old-${i}`, created_at: '2026-08-09T00:00:00+00:00' })

  const got = paginateAll(rows)
  assert.equal(new Set(got.map(r => r.id)).size, rows.length)
  assert.equal(got.length, rows.length)
})

test('query string uses composite order and an encoded OR keyset predicate', () => {
  const q = auditPageQuery({ cursor: { created_at: '2026-08-10T12:00:00.123456+00:00', id: 'abc-123' } })
  assert.ok(q.includes('order=created_at.desc,id.desc'), 'deterministic composite ordering')
  assert.ok(q.includes('&or=(created_at.lt.'), 'keyset OR predicate present')
  assert.ok(q.includes('and(created_at.eq.'), 'tie-break branch present')
  assert.ok(q.includes('id.lt.'), 'id tie-break present')
  assert.ok(!q.includes('+00:00'), "'+' in the timestamp is URL-encoded")
  assert.ok(q.includes('%2B00%3A00'), 'timestamp offset encoded as %2B')
  assert.ok(q.includes('%22'), 'cursor values are PostgREST-quoted')
})

test('first page has no cursor predicate; date range adds server-side filters', () => {
  const first = auditPageQuery({ from: '2026-08-01', to: '2026-08-10' })
  assert.ok(!first.includes('or=('), 'no keyset predicate on page 1')
  assert.ok(first.includes('created_at=gte.2026-08-01T00:00:00'))
  assert.ok(first.includes('created_at=lte.2026-08-10T23:59:59.999'))
  assert.ok(first.includes(`limit=${AUD_PAGE}`))
})
