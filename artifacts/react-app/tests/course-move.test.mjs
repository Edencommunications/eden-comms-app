// Unit tests for the "move lesson to another section" planning logic.
// Run with: node --test tests/course-move.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { planLessonMove, planLessonDrop, rollbackLessonDrop, executeLessonDrop, restoreProgressSteps, staleProgressIds } from '../src/components/courseMoveUtils.js'

const mod = (section_id, sort_order, extra = {}) => ({
  id: `${section_id}-${sort_order}`,
  section_id,
  sort_order,
  module_id: `${section_id}.${sort_order}`,
  ...extra,
})

const SEC2 = { id: 2, title: 'Section Two', color: '#4CAF7D' }

test('moving into a populated section appends at the end with a renumbered module_id', () => {
  const modules = [mod(1, 1), mod(1, 2), mod(2, 1), mod(2, 2), mod(2, 3)]
  const lesson = modules[1] // "1.2"
  const plan = planLessonMove(modules, lesson, SEC2)
  assert.ok(plan)
  assert.equal(plan.update.section_id, 2)
  assert.equal(plan.update.section_title, 'Section Two')
  assert.equal(plan.update.section_color, '#4CAF7D')
  assert.equal(plan.update.sort_order, 4)          // appended after 3 existing lessons
  assert.equal(plan.update.module_id, '2.4')
  assert.deepEqual(plan.remap, [{ from: '1.2', to: '2.4' }])
})

test('moving into an empty section starts at sort_order 1', () => {
  const modules = [mod(1, 1), mod(1, 2)]
  const plan = planLessonMove(modules, modules[0], SEC2)
  assert.equal(plan.update.sort_order, 1)
  assert.equal(plan.update.module_id, '2.1')
  assert.deepEqual(plan.remap, [{ from: '1.1', to: '2.1' }])
})

test('appends after the max sort_order even with gaps', () => {
  const modules = [mod(1, 1), mod(2, 1), mod(2, 5)]
  const plan = planLessonMove(modules, modules[0], SEC2)
  assert.equal(plan.update.sort_order, 6)
  assert.equal(plan.update.module_id, '2.6')
})

test('no-op when moving to the lesson\'s own section or a missing target', () => {
  const modules = [mod(1, 1)]
  assert.equal(planLessonMove(modules, modules[0], { id: 1, title: 'One' }), null)
  assert.equal(planLessonMove(modules, modules[0], undefined), null)
})

// ── planLessonDrop (drag-and-drop to an exact position) ──────────────

test('drop within the same section reorders and renumbers only what changed', () => {
  const modules = [mod(1, 1), mod(1, 2), mod(1, 3)]
  // drag "1.3" before "1.1" (displayed index 0)
  const plan = planLessonDrop(modules, modules[2], { id: 1, title: 'One', color: '#D4AF37' }, 0)
  assert.ok(plan)
  const byId = Object.fromEntries(plan.updates.map(u => [u.id, u.fields]))
  assert.equal(byId['1-3'].sort_order, 1)
  assert.equal(byId['1-3'].module_id, '1.1')
  assert.equal(byId['1-1'].sort_order, 2)
  assert.equal(byId['1-2'].sort_order, 3)
  assert.deepEqual(plan.remap.sort((a, b) => a.from.localeCompare(b.from)), [
    { from: '1.1', to: '1.2' }, { from: '1.2', to: '1.3' }, { from: '1.3', to: '1.1' },
  ])
})

test('drop after own position within a section accounts for the removed slot', () => {
  const modules = [mod(1, 1), mod(1, 2), mod(1, 3)]
  // drag "1.1" to displayed index 2 (before "1.3") → order 2,1,3
  const plan = planLessonDrop(modules, modules[0], { id: 1, title: 'One', color: '#D4AF37' }, 2)
  const byId = Object.fromEntries(plan.updates.map(u => [u.id, u.fields]))
  assert.equal(byId['1-2'].sort_order, 1)
  assert.equal(byId['1-1'].sort_order, 2)
  assert.equal(byId['1-3'], undefined) // untouched lesson has no update
})

test('drop into another section at an exact position shifts later lessons down', () => {
  const modules = [mod(1, 1), mod(2, 1), mod(2, 2)]
  // drag "1.1" between "2.1" and "2.2"
  const plan = planLessonDrop(modules, modules[0], SEC2, 1)
  const byId = Object.fromEntries(plan.updates.map(u => [u.id, u.fields]))
  assert.equal(byId['1-1'].section_id, 2)
  assert.equal(byId['1-1'].section_title, 'Section Two')
  assert.equal(byId['1-1'].sort_order, 2)
  assert.equal(byId['1-1'].module_id, '2.2')
  assert.equal(byId['2-2'].sort_order, 3)
  assert.equal(byId['2-1'], undefined) // lesson before the drop point is untouched
  assert.deepEqual(plan.remap.sort((a, b) => a.from.localeCompare(b.from)), [
    { from: '1.1', to: '2.2' }, { from: '2.2', to: '2.3' },
  ])
})

test('drop into an empty section works and compacts to sort_order 1', () => {
  const modules = [mod(1, 1)]
  const plan = planLessonDrop(modules, modules[0], SEC2, 0)
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].fields.sort_order, 1)
  assert.equal(plan.updates[0].fields.module_id, '2.1')
})

test('drop onto its own current position is a no-op', () => {
  const modules = [mod(1, 1), mod(1, 2)]
  const secOne = { id: 1, title: 'One', color: '#D4AF37' }
  assert.equal(planLessonDrop(modules, modules[0], secOne, 0), null)
  assert.equal(planLessonDrop(modules, modules[0], secOne, 1), null) // just after itself = same spot
  assert.equal(planLessonDrop(modules, modules[1], secOne, 2), null)
  assert.equal(planLessonDrop(modules, modules[0], undefined, 0), null)
})

test('drop renumbers gapped sort_orders and remaps their progress ids too', () => {
  const modules = [mod(1, 1), mod(2, 2), mod(2, 5)]
  // drag "1.1" to the top of section 2 → 1.1→2.1, 2.2→2.2? no: renumber 2,5 → 2,3 after insert
  const plan = planLessonDrop(modules, modules[0], SEC2, 0)
  const byId = Object.fromEntries(plan.updates.map(u => [u.id, u.fields]))
  assert.equal(byId['1-1'].module_id, '2.1')
  assert.equal(byId['2-2'], undefined) // already at sort_order 2 / "2.2" — untouched
  assert.equal(byId['2-5'].module_id, '2.3')
  assert.deepEqual(plan.remap.sort((a, b) => a.from.localeCompare(b.from)), [
    { from: '1.1', to: '2.1' }, { from: '2.5', to: '2.3' },
  ])
})

test('cross-section drop compacts the source section too — no sort_order gaps left behind', () => {
  const modules = [mod(1, 1), mod(1, 2), mod(1, 3), mod(2, 1)]
  // drag "1.2" to the end of section 2
  const plan = planLessonDrop(modules, modules[1], SEC2, 1)
  const byId = Object.fromEntries(plan.updates.map(u => [u.id, u.fields]))
  assert.equal(byId['1-2'].section_id, 2)
  assert.equal(byId['1-2'].module_id, '2.2')
  // "1.3" slides up to close the gap; "1.1" is untouched
  assert.equal(byId['1-3'].sort_order, 2)
  assert.equal(byId['1-3'].module_id, '1.2')
  assert.equal(byId['1-3'].section_id, 1)
  assert.equal(byId['1-1'], undefined)
  assert.deepEqual(plan.remap.sort((a, b) => a.from.localeCompare(b.from)), [
    { from: '1.2', to: '2.2' }, { from: '1.3', to: '1.2' },
  ])
})

test('rollbackLessonDrop restores every changed module to its exact original fields', () => {
  const modules = [mod(1, 1), mod(1, 2), mod(2, 1), mod(2, 2)]
  const plan = planLessonDrop(modules, modules[0], SEC2, 1)
  assert.ok(plan)
  const undo = rollbackLessonDrop(modules, plan)
  assert.deepEqual(undo.updates.map(u => u.id).sort(), plan.updates.map(u => u.id).sort())
  for (const u of undo.updates) {
    const orig = modules.find(m => m.id === u.id)
    assert.equal(u.fields.section_id, orig.section_id)
    assert.equal(u.fields.section_title, orig.section_title)
    assert.equal(u.fields.sort_order, orig.sort_order)
    assert.equal(u.fields.module_id, orig.module_id)
  }
})

// ── executeLessonDrop integration tests (mock db with injectable failures) ──

// In-memory Supabase-ish db understanding exactly the queries the transaction
// issues. opts.failUpdate(n)/opts.failGet(n) fail the nth update/get call.
function makeDb(moduleRows, progressRows, opts = {}) {
  const state = {
    modules: moduleRows.map(m => ({ ...m })),
    progress: progressRows.map(p => ({ ...p })),
    getCalls: 0, updateCalls: 0,
  }
  const parseList = s => decodeURIComponent(s).split(',').map(x => x.replace(/^"|"$/g, ''))
  const db = {
    async get(table, params) {
      state.getCalls++
      if (opts.failGet && opts.failGet(state.getCalls, params)) return null
      const mIn = params.match(/module_id=in\.\((.*?)\)&/) || params.match(/module_id=in\.\((.*)\)/)
      const idIn = params.match(/&id=in\.\((.*?)\)&/) || params.match(/&id=in\.\((.*)\)/)
      if (idIn) return state.progress.filter(r => parseList(idIn[1]).includes(String(r.id))).map(r => ({ id: r.id, module_id: r.module_id }))
      if (mIn) return state.progress.filter(r => parseList(mIn[1]).includes(r.module_id)).map(r => ({ id: r.id, module_id: r.module_id }))
      return []
    },
    async update(table, params, body) {
      state.updateCalls++
      if (opts.failUpdate && opts.failUpdate(state.updateCalls, table, body)) return false
      const id = params.match(/id=eq\.([^&]+)/)[1]
      const list = table === 'course_modules' ? state.modules : state.progress
      const row = list.find(r => String(r.id) === id)
      if (!row) return false
      Object.assign(row, body)
      return true
    },
  }
  return { state, db }
}

const runDrop = (modules, lesson, sec, index, moduleRows, progressRows, opts) => {
  const plan = planLessonDrop(modules, lesson, sec, index)
  const { state, db } = makeDb(moduleRows, progressRows, opts)
  return executeLessonDrop({ plan, undo: rollbackLessonDrop(modules, plan), courseId: 'crs', nowISO: '2026-08-10T00:00:00Z', db })
    .then(res => ({ res, state, plan }))
}

test('same-section cyclic reorder WITH progress rows completes and verifies (no false rollback)', async () => {
  const modules = [mod(1, 1), mod(1, 2), mod(1, 3)]
  const secOne = { id: 1, title: 'One', color: '#D4AF37' }
  const progress = [
    { id: 'ra', module_id: '1.1' }, { id: 'rb', module_id: '1.2' }, { id: 'rc', module_id: '1.3' },
  ]
  // drag "1.3" to the top → cyclic permutation 1.3→1.1, 1.1→1.2, 1.2→1.3
  const { res, state } = await runDrop(modules, modules[2], secOne, 0, modules, progress)
  assert.equal(res.status, 'moved')
  assert.deepEqual(Object.fromEntries(state.progress.map(r => [r.id, r.module_id])),
    { ra: '1.2', rb: '1.3', rc: '1.1' })
  assert.deepEqual(Object.fromEntries(state.modules.map(m => [m.id, m.module_id])),
    { '1-3': '1.1', '1-1': '1.2', '1-2': '1.3' })
})

test('failed snapshot read aborts before ANY write', async () => {
  const modules = [mod(1, 1), mod(2, 1)]
  const { res, state } = await runDrop(modules, modules[0], SEC2, 0, modules,
    [{ id: 'ra', module_id: '1.1' }], { failGet: n => n === 1 })
  assert.equal(res.status, 'aborted')
  assert.equal(state.updateCalls, 0)
  assert.equal(state.progress[0].module_id, '1.1')
  assert.equal(state.modules[0].module_id, '1.1')
})

test('failed progress write rolls back modules AND progress to originals', async () => {
  const modules = [mod(1, 1), mod(1, 2), mod(2, 1), mod(2, 2)]
  const progress = [{ id: 'ra', module_id: '1.1' }, { id: 'rb', module_id: '2.2' }, { id: 'rc', module_id: '1.2' }]
  // fail one of the course_progress writes mid-transaction
  let failed = false
  const { res, state } = await runDrop(modules, modules[0], SEC2, 1, modules, progress, {
    failUpdate: (n, table) => { if (table === 'course_progress' && !failed) { failed = true; return true } return false },
  })
  assert.equal(res.status, 'rolled_back')
  assert.deepEqual(Object.fromEntries(state.progress.map(r => [r.id, r.module_id])),
    { ra: '1.1', rb: '2.2', rc: '1.2' })
  for (const m of modules)
    assert.equal(state.modules.find(x => x.id === m.id).module_id, m.module_id)
  assert.equal(state.progress.filter(r => r.module_id.startsWith('tmp.')).length, 0)
})

test('failed forward verification read triggers a verified rollback', async () => {
  const modules = [mod(1, 1), mod(2, 1)]
  const progress = [{ id: 'ra', module_id: '1.1' }]
  // get #1 = snapshot (ok), get #2 = forward verify (fails), get #3 = rollback verify (ok)
  const { res, state } = await runDrop(modules, modules[0], SEC2, 1, modules, progress,
    { failGet: n => n === 2 })
  assert.equal(res.status, 'rolled_back')
  assert.equal(state.progress[0].module_id, '1.1')
  assert.equal(state.modules[0].module_id, '1.1')
})

test('a failed rollback write is reported as undo_failed, never as a clean undo', async () => {
  const modules = [mod(1, 1), mod(2, 1)]
  const progress = [{ id: 'ra', module_id: '1.1' }]
  let progressWrites = 0
  const { res } = await runDrop(modules, modules[0], SEC2, 1, modules, progress, {
    // fail the forward progress writes (forces rollback) and the first restore write (breaks the undo)
    failUpdate: (n, table) => table === 'course_progress' && ++progressWrites <= 3,
  })
  assert.equal(res.status, 'undo_failed')
})

test('staleProgressIds lists old ids and temporary ids, skipping unchanged pairs', () => {
  const ids = staleProgressIds([{ from: '1.2', to: '2.4' }, { from: '3.1', to: '3.1' }])
  assert.deepEqual(ids, ['1.2', 'tmp.2.4'])
})

test('simulated remap moves every completed progress row to the new id', () => {
  // Mirrors the two-pass rename the app performs against course_progress
  const plan = planLessonMove([mod(1, 1), mod(2, 1)], mod(1, 1), SEC2)
  let rows = [
    { user_id: 'a', module_id: '1.1', completed: true },
    { user_id: 'b', module_id: '1.1', completed: true },
    { user_id: 'c', module_id: '2.1', completed: true },
  ]
  for (const p of plan.remap)
    rows = rows.map(r => r.module_id === p.from ? { ...r, module_id: `tmp.${p.to}` } : r)
  for (const p of plan.remap)
    rows = rows.map(r => r.module_id === `tmp.${p.to}` ? { ...r, module_id: p.to } : r)
  const stale = new Set(staleProgressIds(plan.remap))
  assert.equal(rows.filter(r => stale.has(r.module_id)).length, 0)
  assert.deepEqual(rows.filter(r => r.module_id === '2.2').map(r => r.user_id), ['a', 'b'])
  assert.equal(rows.find(r => r.user_id === 'c').module_id, '2.1') // untouched lesson keeps its progress
})
