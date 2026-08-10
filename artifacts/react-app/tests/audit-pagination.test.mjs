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

test('person/action filters add encoded server-side eq params on page 1 and paged queries', () => {
  const q = auditPageQuery({ person: "Sofia O'Brien", action: 'client_transferred' })
  assert.ok(q.includes(`actor_name=eq.${encodeURIComponent("Sofia O'Brien")}`), 'actor_name eq param, URL-encoded')
  assert.ok(q.includes('action=eq.client_transferred'), 'action eq param')
  const paged = auditPageQuery({ person: 'Ana', action: 'login', cursor: { created_at: '2026-08-10T12:00:00+00:00', id: 'x1' } })
  assert.ok(paged.includes('actor_name=eq.Ana') && paged.includes('action=eq.login'), 'Load older keeps filters')
  assert.ok(paged.includes('&or=(created_at.lt.'), 'keyset predicate still present with filters')
  const none = auditPageQuery({ person: 'all', action: 'all' })
  assert.ok(!none.includes('actor_name=') && !none.includes('action='), "'all' adds no filter params")
})

test('filtered keyset pagination walks the whole filtered dataset — no skips, no dupes', () => {
  const rows = []
  for (let i = 0; i < 900; i++)
    rows.push({ id: `r-${String(i).padStart(4, '0')}`, created_at: `2026-0${(i % 6) + 1}-10T00:00:00+00:00`,
      actor_name: i % 3 === 0 ? 'Old Actor' : 'Other', action: i % 2 === 0 ? 'login' : 'user_added' })
  const match = r => r.actor_name === 'Old Actor' && r.action === 'login'
  // Simulated server applies filters BEFORE the keyset predicate, like PostgREST
  const sorted = rows.filter(match).sort(cmpAuditDesc)
  const server = cursor => (cursor ? sorted.filter(r => isOlderThanCursor(r, cursor)) : sorted).slice(0, AUD_PAGE)
  const got = []
  let cursor = null
  for (let guard = 0; guard < 100; guard++) {
    const page = server(cursor)
    got.push(...page)
    if (page.length < AUD_PAGE) break
    const last = page[page.length - 1]
    cursor = { created_at: last.created_at, id: last.id }
  }
  const expected = rows.filter(match)
  assert.equal(got.length, expected.length)
  assert.equal(new Set(got.map(r => r.id)).size, expected.length)
})

test('stale responses from a superseded filter generation are discarded', async () => {
  // Mirrors Week6's audReqSeq guard: only the latest generation may apply results.
  let seq = 0, state = null
  const request = (result, delay) => {
    const mySeq = ++seq
    return new Promise(res => setTimeout(res, delay)).then(() => { if (mySeq === seq) state = result })
  }
  const slow = request('old-filter-results', 30) // fired first, resolves last
  const fast = request('new-filter-results', 1)
  await Promise.all([slow, fast])
  assert.equal(state, 'new-filter-results', 'slow stale response must not overwrite newer results')
})

import { auditFacetPageQuery, fetchAuditFacet, AUD_FACET_PAGE } from '../src/lib/auditKeyset.js'

// Simulated PostgREST facet endpoint: ordered single-column pages with value.gt resume
function makeFacetServer(values, column) {
  const rows = [...values].sort().map(v => ({ [column]: v }))
  return async (params) => {
    const m = /&[a-z_]+=gt\.([^&]+)/.exec(params)
    const after = m ? decodeURIComponent(m[1]).replace(/^"|"$/g, '') : null
    const lim = Number(/limit=(\d+)/.exec(params)[1])
    return rows.filter(r => after == null || r[column] > after).slice(0, lim)
  }
}

test('facet scan pages through the whole history — a person only on a later page is found', async () => {
  // 2500 rows across many duplicate actors; "Zz Ancient Actor" sorts last and
  // only appears beyond page 2 at pageSize=1000
  const values = []
  for (let i = 0; i < 2500; i++) values.push(`Actor ${String(i % 1100).padStart(4, '0')}`)
  values.push('Zz Ancient Actor')
  const got = await fetchAuditFacet(makeFacetServer(values, 'actor_name'), 'actor_name', AUD_FACET_PAGE)
  assert.equal(new Set(got).size, got.length, 'deduped')
  assert.equal(got.length, 1101, 'every distinct value found')
  assert.ok(got.includes('Zz Ancient Actor'), 'later-page-only value is reachable')
})

test('facet scan skips duplicate runs larger than one page via value.gt resume', async () => {
  const values = []
  for (let i = 0; i < 1500; i++) values.push('Bulk Importer') // > one page of one value
  values.push('After Bulk')
  const got = await fetchAuditFacet(makeFacetServer(values, 'actor_name'), 'actor_name', 1000)
  assert.deepEqual([...got].sort(), ['After Bulk', 'Bulk Importer'])
})

test('facet scan throws instead of silently returning a truncated list', async () => {
  // Server ignores the resume cursor (always returns the same full page) →
  // page cap must trip and surface an error, never a partial "complete" list.
  const stuck = async () => Array.from({ length: 1000 }, (_, i) => ({ actor_name: `A${i}` }))
  await assert.rejects(() => fetchAuditFacet(stuck, 'actor_name', 1000), /exceeded/)
  await assert.rejects(() => fetchAuditFacet(async () => null, 'actor_name'), /failed/)
})

test('facet page query is ordered asc, excludes nulls, and resumes after the last value', () => {
  const q1 = auditFacetPageQuery('actor_name')
  assert.ok(q1.includes('select=actor_name') && q1.includes('order=actor_name.asc') && q1.includes('actor_name=not.is.null'))
  assert.ok(!q1.includes('gt.'), 'first page has no resume cursor')
  const q2 = auditFacetPageQuery('action', 'client_transferred')
  assert.ok(q2.includes('action=gt.%22client_transferred%22'), 'resume value is quoted+encoded')
})
