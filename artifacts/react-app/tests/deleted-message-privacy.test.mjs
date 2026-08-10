// Deleted-message privacy tests.
// Run with: node --test tests/deleted-message-privacy.test.mjs
//
// Guards two invariants:
// 1. The shared DeletedBubble component never renders the original content
//    for non-admins, and renders the "(admins only)" content for admins.
// 2. Every Team Hub surface in Week7.jsx (general roots, general thread
//    replies, DM roots, DM thread roots, DM thread replies) renders deleted
//    messages through DeletedBubble — no inline re-implementations that could
//    silently re-expose deleted content.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import DeletedBubble from '../src/components/DeletedBubble.js'

const C = { muted: '#888', border: '#333' }
const SECRET = 'super secret original message text'
const msg = { content: SECRET, deletedAt: '2026-08-10T00:00:00Z', deletedByName: 'Alice' }

test('non-admin never sees deleted message content', () => {
  const html = renderToStaticMarkup(h(DeletedBubble, { m: msg, isAdminRole: false, C }))
  assert.ok(!html.includes(SECRET), 'deleted content leaked to non-admin')
  assert.ok(html.includes('Message deleted by Alice'))
  assert.ok(!html.includes('admins only'))
})

test('non-admin sees generic placeholder when deleter name missing', () => {
  const html = renderToStaticMarkup(h(DeletedBubble, { m: { ...msg, deletedByName: null }, isAdminRole: false, C }))
  assert.ok(!html.includes(SECRET))
  assert.ok(html.includes('Message deleted'))
})

test('admin sees the (admins only) original content', () => {
  const html = renderToStaticMarkup(h(DeletedBubble, { m: msg, isAdminRole: true, C }))
  assert.ok(html.includes(SECRET), 'admin should see original content')
  assert.ok(html.includes('admins only'))
  assert.ok(html.includes('Deleted by Alice'))
})

test('every Team Hub surface renders deleted messages via DeletedBubble', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/components/Week7.jsx', import.meta.url)), 'utf8')
  for (const surface of ['general-root', 'general-reply', 'dm-root', 'dm-thread-root', 'dm-thread-reply']) {
    assert.ok(src.includes(`<DeletedBubble surface="${surface}"`), `surface ${surface} must use DeletedBubble`)
  }
  // No inline deleted-message rendering left that could leak content:
  assert.ok(!src.includes('(admins only)'), 'inline admins-only renderer found in Week7.jsx — use DeletedBubble')
  assert.ok(!/isAdminRole\s*\?\s*[`<]/.test(src.replace(/\n/g, ' ')), 'inline isAdminRole deleted-content ternary found — use DeletedBubble')
})
