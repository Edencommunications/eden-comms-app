// Pure helpers for the Course Content builder's "move lesson to another
// section" action. Kept free of React/DOM so they can be unit-tested with
// plain node --test.

// Plan moving `lesson` into `targetSec` ({id,title,color}):
// appended at the end of the target section, module_id renumbered to
// "<sectionId>.<sortOrder>", and the course_progress remap pair included.
// Returns null when the move is a no-op (same section or missing target).
export function planLessonMove(modules, lesson, targetSec) {
  if (!targetSec || !lesson || targetSec.id === lesson.section_id) return null
  const inTarget = (modules || []).filter(m => m.section_id === targetSec.id)
  const sortOrder = Math.max(0, ...inTarget.map(m => Number(m.sort_order) || 0)) + 1
  const moduleId = `${targetSec.id}.${sortOrder}`
  return {
    update: {
      section_id: targetSec.id,
      section_title: targetSec.title,
      section_color: targetSec.color,
      sort_order: sortOrder,
      module_id: moduleId,
    },
    remap: [{ from: lesson.module_id, to: moduleId }],
  }
}

// Plan dropping `lesson` at display position `targetIndex` inside `targetSec`
// ({id,title,color}). `targetIndex` is the insertion index in the target
// section's DISPLAYED list (sorted by sort_order, including the dragged lesson
// when it already lives there). The whole target section is renumbered 1..n so
// sort_order gaps are compacted, and every renumbered lesson gets a matching
// remap pair for its course_progress rows.
// Returns null when the drop changes nothing (same spot, missing args).
export function planLessonDrop(modules, lesson, targetSec, targetIndex) {
  if (!targetSec || !lesson) return null
  const bySort = (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  const displayed = (modules || []).filter(m => m.section_id === targetSec.id).sort(bySort)
  const without = displayed.filter(m => m.id !== lesson.id)
  // Convert the displayed-list index to an index in the list without the lesson
  let idx = Math.max(0, Math.min(Number(targetIndex) || 0, displayed.length))
  const from = displayed.findIndex(m => m.id === lesson.id)
  if (from !== -1 && idx > from) idx -= 1
  idx = Math.min(idx, without.length)
  const ordered = [...without.slice(0, idx), lesson, ...without.slice(idx)]
  const updates = []
  const remap = []
  ordered.forEach((m, i) => {
    const sortOrder = i + 1
    const moduleId = `${targetSec.id}.${sortOrder}`
    const changed = m.section_id !== targetSec.id ||
      Number(m.sort_order) !== sortOrder || m.module_id !== moduleId
    if (!changed) return
    updates.push({
      id: m.id,
      fields: {
        section_id: targetSec.id,
        section_title: targetSec.title,
        section_color: targetSec.color,
        sort_order: sortOrder,
        module_id: moduleId,
      },
    })
    if (m.module_id !== moduleId) remap.push({ from: m.module_id, to: moduleId })
  })
  // Cross-section move: compact the source section too (1..n, no gaps) so its
  // sort_orders and display module_ids stay consistent after the lesson leaves.
  if (lesson.section_id !== targetSec.id) {
    const source = (modules || [])
      .filter(m => m.section_id === lesson.section_id && m.id !== lesson.id)
      .sort(bySort)
    source.forEach((m, i) => {
      const sortOrder = i + 1
      const moduleId = `${m.section_id}.${sortOrder}`
      if (Number(m.sort_order) === sortOrder && m.module_id === moduleId) return
      updates.push({
        id: m.id,
        fields: {
          section_id: m.section_id,
          section_title: m.section_title,
          section_color: m.section_color,
          sort_order: sortOrder,
          module_id: moduleId,
        },
      })
      if (m.module_id !== moduleId) remap.push({ from: m.module_id, to: moduleId })
    })
  }
  if (!updates.length) return null
  return { updates, remap }
}

// Inverse of a planLessonDrop plan: restore every changed lesson to its
// original section/sort/module_id (as captured in `modules`, the pre-move
// snapshot). Progress rows are NOT restored by id-text remapping — old and new
// module_ids can collide (e.g. source compaction reuses "1.1"), which makes
// text-based reversal ambiguous. Instead the caller snapshots the affected
// course_progress rows (primary key + original module_id) BEFORE the move and
// restores each row by primary key: see restoreProgressSteps below.
export function rollbackLessonDrop(modules, plan) {
  if (!plan) return null
  const byId = Object.fromEntries((modules || []).map(m => [m.id, m]))
  const updates = (plan.updates || []).flatMap(u => {
    const orig = byId[u.id]
    if (!orig) return []
    return [{
      id: u.id,
      fields: {
        section_id: orig.section_id,
        section_title: orig.section_title,
        section_color: orig.section_color,
        sort_order: orig.sort_order,
        module_id: orig.module_id,
      },
    }]
  })
  return { updates }
}

// Primary-key-based restore steps for course_progress rows after a failed
// move. `snapshot` is the pre-move [{id, module_id}] of every row whose
// module_id was about to change. Restoring by row id is unambiguous no matter
// which forward pass failed (rows may sit on old, `tmp.<new>` or new ids).
// Two passes via a per-row temporary id so restores can never transiently
// collide on a (user, module_id) pair mid-flight.
export function restoreProgressSteps(snapshot) {
  const rows = snapshot || []
  return [
    ...rows.map(r => ({ id: r.id, module_id: `tmp.${r.module_id}` })),
    ...rows.map(r => ({ id: r.id, module_id: r.module_id })),
  ]
}

// ── The full drag-and-drop persistence transaction ───────────────────
// Runs a planned lesson drop end-to-end against injected db accessors:
//   db.get(table, params)    → rows array, or null when the read FAILED
//   db.update(table, params, body) → true only when the write verifiably stuck
//
// Progress rows are remapped BY PRIMARY KEY from a pre-move snapshot — never
// by module_id text matching. In-section reorders permute ids cyclically
// (1.1→1.2, 1.2→1.3, 1.3→1.1), so text-based remapping/verification cannot
// distinguish "already migrated" from "not yet migrated" rows; row ids can.
// Verification re-reads the snapshotted rows and checks each landed on its
// exact expected id. Any failure rolls back modules AND progress (again by
// primary key) and verifies the restore.
//
// Returns { status } where status is one of:
//   'moved'       — everything applied and verified
//   'aborted'     — the pre-move snapshot read failed; NOTHING was written
//   'rolled_back' — a write/verify failed; the undo completed and verified
//   'undo_failed' — a write/verify failed AND the undo could not be verified
export async function executeLessonDrop({ plan, undo, courseId, nowISO, db }) {
  const quote = id => `"${String(id).replace(/"/g, '')}"`
  const olds = (plan.remap || []).map(p => quote(p.from)).join(',')
  const snapshot = plan.remap.length
    ? await db.get('course_progress', `course_id=eq.${courseId}&module_id=in.(${encodeURIComponent(olds)})&select=id,module_id`)
    : []
  // A failed snapshot read must abort BEFORE any write — coercing it to "no
  // rows" would silently skip the progress remap and strand learner records.
  if (snapshot === null || snapshot === undefined) return { status: 'aborted' }
  const target = Object.fromEntries((plan.remap || []).map(p => [p.from, p.to]))

  const verifyProgress = async expected => {
    if (!snapshot.length) return true
    const ids = snapshot.map(r => quote(r.id)).join(',')
    const check = await db.get('course_progress', `course_id=eq.${courseId}&id=in.(${encodeURIComponent(ids)})&select=id,module_id`)
    if (!check) return false // failed verification read is a failure, not a pass
    return snapshot.every(s => {
      const row = check.find(c => String(c.id) === String(s.id))
      return row && row.module_id === expected(s)
    })
  }

  let ok = true
  // Modules: two-pass via tmp ids so rows never collide on module_id mid-move
  for (const u of plan.updates)
    ok = await db.update('course_modules', `id=eq.${u.id}`, { ...u.fields, module_id: `tmp.${u.fields.module_id}`, updated_at: nowISO }) && ok
  for (const u of plan.updates)
    ok = await db.update('course_modules', `id=eq.${u.id}`, { module_id: u.fields.module_id }) && ok
  // Progress: by primary key, two-pass, every write result counted
  for (const r of snapshot)
    ok = await db.update('course_progress', `id=eq.${r.id}`, { module_id: `tmp.${target[r.module_id]}` }) && ok
  for (const r of snapshot)
    ok = await db.update('course_progress', `id=eq.${r.id}`, { module_id: target[r.module_id] }) && ok
  if (ok) ok = await verifyProgress(s => target[s.module_id])
  if (ok) return { status: 'moved' }

  // Roll everything back so learner progress can never point at a dead id
  let undoOk = true
  for (const u of undo.updates)
    undoOk = await db.update('course_modules', `id=eq.${u.id}`, { ...u.fields, module_id: `tmp.${u.fields.module_id}`, updated_at: nowISO }) && undoOk
  for (const u of undo.updates)
    undoOk = await db.update('course_modules', `id=eq.${u.id}`, { module_id: u.fields.module_id }) && undoOk
  for (const step of restoreProgressSteps(snapshot))
    undoOk = await db.update('course_progress', `id=eq.${step.id}`, { module_id: step.module_id }) && undoOk
  if (undoOk) undoOk = await verifyProgress(s => s.module_id)
  return { status: undoOk ? 'rolled_back' : 'undo_failed' }
}

// Given remap pairs, the module_ids that must NOT remain in course_progress
// after a successful two-pass remap (the old ids and the temporary ids).
export function staleProgressIds(pairs) {
  const changed = (pairs || []).filter(p => p.from !== p.to)
  return [...changed.map(p => p.from), ...changed.map(p => `tmp.${p.to}`)]
}
