// Shared placeholder bubble for deleted chat messages.
// Written without JSX so plain node --test files can import and render it directly.
//
// SECURITY INVARIANT: the original message content must ONLY ever be rendered
// when `isAdminRole` is true. Non-admins see just "Message deleted[ by X]".
// All Team Hub surfaces (general roots, general thread replies, DM roots,
// DM thread roots, DM thread replies) must render deleted messages through
// this component — tests/deleted-message-privacy.test.mjs enforces both.
import { createElement as h } from 'react'

export default function DeletedBubble({ m, isAdminRole, C, fontSize = 12, radius = 8, padding = '10px 12px' }) {
  const style = {
    fontSize,
    color: C.muted,
    fontStyle: 'italic',
    background: 'none',
    borderRadius: radius,
    padding,
    border: `1px dashed ${C.border}`,
  }
  if (isAdminRole) {
    return h(
      'div', { style },
      `🗑 Deleted by ${m.deletedByName || 'staff'} (admins only): `,
      h('span', { style: { fontStyle: 'normal' } }, m.content || '')
    )
  }
  return h('div', { style }, `Message deleted${m.deletedByName ? ` by ${m.deletedByName}` : ''}`)
}
