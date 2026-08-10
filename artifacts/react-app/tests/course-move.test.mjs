// Unit tests for the "move lesson to another section" planning logic.
// Run with: node --test tests/course-move.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { planLessonMove, staleProgressIds } from '../src/components/courseMoveUtils.js'

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
