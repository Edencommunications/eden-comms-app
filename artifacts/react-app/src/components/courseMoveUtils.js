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

// Given remap pairs, the module_ids that must NOT remain in course_progress
// after a successful two-pass remap (the old ids and the temporary ids).
export function staleProgressIds(pairs) {
  const changed = (pairs || []).filter(p => p.from !== p.to)
  return [...changed.map(p => p.from), ...changed.map(p => `tmp.${p.to}`)]
}
