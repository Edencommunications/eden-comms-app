import { useRef, useState } from 'react'
import { T as _ThemeT } from '../lib/theme'

// ── Text input with @mention autocomplete ─────────────────────
// Type "@" → a dropdown lists everyone in the group; keep typing to
// narrow the list; ↑/↓ to move, Enter/Tab or click to insert the name.
// Props:
//   value, onChange(text), onSubmit()   — controlled input + Enter-to-send
//   candidates: string[]                — full names available to tag
//   placeholder, inputStyle, autoFocus  — passthrough styling
//   colors: { card, border, gold, white, muted, black } — theme
export default function MentionInput({
  value, onChange, onSubmit, candidates = [],
  placeholder = '', inputStyle = {}, autoFocus = false,
  colors = {},
}) {
  const C = { ..._ThemeT, ...colors }
  const inputRef = useRef(null)
  const [mention, setMention] = useState(null) // { start, query } | null
  const [sel, setSel] = useState(0)

  // Find an "@token" being typed immediately before the caret.
  // Only active when there is no text selection (caret is collapsed).
  function detectMention(text, caret, caretEnd = caret) {
    if (caret !== caretEnd) return null
    const upto = text.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1) return null
    // '@' must start the text or follow whitespace
    if (at > 0 && !/\s/.test(upto[at - 1])) return null
    const query = upto.slice(at + 1)
    if (query.length > 40 || /[@\n]/.test(query)) return null
    return { start: at, query }
  }

  const matches = mention
    ? candidates
        .filter(Boolean)
        .filter((n, i, arr) => arr.indexOf(n) === i) // dedupe
        .filter(n => n.toLowerCase().startsWith(mention.query.toLowerCase()) ||
                     n.toLowerCase().includes(' ' + mention.query.toLowerCase()) ||
                     (mention.query === '' ? true : n.toLowerCase().includes(mention.query.toLowerCase())))
        .slice(0, 8)
    : []
  const open = mention !== null && matches.length > 0

  function handleChange(e) {
    const text = e.target.value
    onChange(text)
    const m = detectMention(text, e.target.selectionStart ?? text.length, e.target.selectionEnd ?? text.length)
    setMention(m)
    setSel(0)
  }
  // Keep the mention token in sync with every caret/selection move
  // (arrow keys, Home/End, mouse drags) so Enter/Tab always acts on the current token.
  function handleSelect(e) {
    const m = detectMention(e.target.value, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)
    setMention(prev => {
      if (m === null) return null
      if (prev && prev.start === m.start && prev.query === m.query) return prev
      return m
    })
  }

  function pick(name) {
    if (!mention) return
    const caret = inputRef.current?.selectionStart ?? value.length
    const next = value.slice(0, mention.start) + '@' + name + ' ' + value.slice(caret)
    onChange(next)
    setMention(null)
    const pos = mention.start + name.length + 2
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e) {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % matches.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => (s - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[Math.min(sel, matches.length - 1)]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit?.() }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, minWidth: 200, maxWidth: 300,
          background: C.card, border: `1px solid ${C.gold}55`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden', zIndex: 200,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 10px 2px' }}>
            Tag someone
          </div>
          {matches.map((n, i) => (
            <div key={n}
              onMouseDown={e => { e.preventDefault(); pick(n) }}
              onMouseEnter={() => setSel(i)}
              style={{
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                background: i === sel ? `${C.gold}22` : 'transparent',
                color: i === sel ? C.gold : C.white, fontWeight: i === sel ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <span style={{
                width: 20, height: 20, borderRadius: 10, background: `${C.gold}22`, color: C.gold,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0,
              }}>{n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}</span>
              @{n}
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onSelect={handleSelect}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', ...inputStyle }}
      />
    </div>
  )
}
