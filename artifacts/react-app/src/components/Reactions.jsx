// ═══════════════════════════════════════════════════════════════
// Reactions.jsx — Slack-style emoji reactions, shared by every chat
// surface (client messages, team hub, communities, DBA chat).
//
// Usage:
//   import { ReactionBar, fetchReactions, toggleReaction } from './Reactions'
//   const [rx, setRx] = useState({})                       // { msgId: { '👍': [{id,n}] } }
//   ...after loading messages:  fetchReactions(ids).then(setRx)
//   <ReactionBar table="community_messages" messageId={m.id} myId={myUUID}
//     reactions={rx[m.id]} accent="#ffa600"
//     onChange={map => setRx(p => ({ ...p, [m.id]: map }))} />
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { sbBearer } from '../lib/sbAuth'

const API = (p) => `${(import.meta.env.BASE_URL || '/')}api/${p}`

// ── Data helpers ──────────────────────────────────────────────
export async function fetchReactions(table, messageIds) {
  const ids = (messageIds || []).filter(Boolean)
  if (!ids.length) return {}
  const out = {}
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const r = await fetch(`${API('reactions')}?table=${table}&ids=${ids.slice(i, i + 100).join(',')}`,
        { headers: { Authorization: sbBearer() } })
      const b = r.ok ? await r.json() : null
      Object.assign(out, b?.reactions || {})
    } catch { /* leave what we have */ }
  }
  return out
}

export async function toggleReaction(table, messageId, emoji) {
  try {
    const r = await fetch(API('reactions/toggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: sbBearer() },
      body: JSON.stringify({ table, messageId, emoji }),
    })
    const b = await r.json().catch(() => null)
    return r.ok ? (b?.reactions || {}) : null
  } catch { return null }
}

// ── Picker emoji set (Slack-style quick grid) ─────────────────
const EMOJIS = [
  '👍','❤️','😂','🎉','🙌','🔥','💯','👏',
  '😍','😮','😢','😡','🤔','😅','🙏','💪',
  '✅','⭐','🚀','👀','🤝','🫡','😴','🥳',
  '💀','🤣','😉','😎','🍕','☕','🏆','📈',
]

// ── UI ────────────────────────────────────────────────────────
// Renders existing reaction chips + an "add reaction" button with popup
// picker. Optimistic-free: waits for the server's answer, so counts are
// always true. Hidden entirely for deleted messages (pass show={false}).
export function ReactionBar({ table, messageId, reactions, myId, onChange, accent = '#ffa600', alignRight = false }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      // Ignore clicks inside the anchor OR inside the portal-rendered picker
      if (popRef.current?.contains(e.target)) return
      if (e.target?.closest?.('[data-rx-picker]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const map = reactions || {}
  const entries = Object.entries(map).filter(([, v]) => Array.isArray(v) && v.length)

  const react = async (emoji) => {
    if (busy) return
    setBusy(true); setOpen(false)
    const next = await toggleReaction(table, messageId, emoji)
    if (next !== null && onChange) onChange(next)
    setBusy(false)
  }

  if (!entries.length) {
    // No reactions yet — just the subtle add button
    return (
      <div ref={popRef} style={{ position: 'relative', display: 'flex', justifyContent: alignRight ? 'flex-end' : 'flex-start', marginTop: 2 }}>
        <button onClick={() => setOpen(o => !o)} title="Add reaction"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#666', padding: '1px 4px', borderRadius: 6, opacity: 0.7 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
          onMouseLeave={e => { e.currentTarget.style.opacity = 0.7 }}>
          ☺+
        </button>
        {open && <Picker onPick={react} accent={accent} anchorRef={popRef} />}
      </div>
    )
  }

  return (
    <div ref={popRef} style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: alignRight ? 'flex-end' : 'flex-start' }}>
      {entries.map(([emoji, who]) => {
        const mine = who.some(w => w?.id === myId)
        const names = who.map(w => w?.n || 'Someone').slice(0, 12).join(', ') + (who.length > 12 ? ` +${who.length - 12} more` : '')
        return (
          <button key={emoji} onClick={() => react(emoji)} disabled={busy}
            title={`${names} reacted with ${emoji}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: mine ? `${accent}22` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${mine ? `${accent}88` : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 12, padding: '1px 8px', cursor: 'pointer',
              fontSize: 12, lineHeight: '18px', color: mine ? accent : '#bbb', fontWeight: 700,
            }}>
            <span style={{ fontSize: 13 }}>{emoji}</span>{who.length}
          </button>
        )
      })}
      <button onClick={() => setOpen(o => !o)} title="Add reaction" disabled={busy}
        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '1px 7px', cursor: 'pointer', fontSize: 11, color: '#888', lineHeight: '18px' }}>
        ☺+
      </button>
      {open && <Picker onPick={react} accent={accent} anchorRef={popRef} />}
    </div>
  )
}

// Full searchable picker (every emoji) — loaded on demand so the app bundle stays lean
const FullPicker = lazy(() => import('emoji-picker-react'))

// Rendered in a portal with fixed positioning so it can never be clipped by
// a chat scroll container, and always clamped inside the visible screen.
function Picker({ onPick, accent, anchorRef }) {
  const ref = useRef(null)
  const [full, setFull] = useState(false)
  const [pos, setPos] = useState(null)   // {top, left} — null until measured

  useEffect(() => {
    const place = () => {
      const btn = anchorRef?.current?.getBoundingClientRect()
      const pk = ref.current?.getBoundingClientRect()
      if (!btn || !pk) return
      const vw = window.innerWidth, vh = window.innerHeight
      const w = pk.width || 260, h = pk.height || 180
      // Prefer above the button; go below when there isn't room above
      let top = btn.top - h - 6
      if (top < 8) top = Math.min(btn.bottom + 6, vh - h - 8)
      if (top < 8) top = 8
      let left = Math.min(Math.max(8, btn.left), vw - w - 8)
      if (left < 8) left = 8
      setPos({ top, left })
    }
    place()
    // Re-place once the full picker (much taller) has rendered
    const t = setTimeout(place, 30)
    window.addEventListener('resize', place)
    return () => { clearTimeout(t); window.removeEventListener('resize', place) }
  }, [full, anchorRef])

  return createPortal(
    <div ref={ref} data-rx-picker style={{
      position: 'fixed',
      top: pos ? pos.top : -9999, left: pos ? pos.left : -9999,
      visibility: pos ? 'visible' : 'hidden',
      maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
      background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
      padding: full ? 0 : 8, zIndex: 100000, boxShadow: '0 8px 28px rgba(0,0,0,.6)',
      overflowX: 'hidden',
    }}>
      {full ? (
        <Suspense fallback={<div style={{ width: 300, height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12 }}>Loading emojis…</div>}>
          <FullPicker onEmojiClick={(e) => onPick(e.emoji)} theme="dark" width={Math.min(300, window.innerWidth - 40)} height={380}
            lazyLoadEmojis previewConfig={{ showPreview: false }} skinTonesDisabled={false} />
        </Suspense>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 30px)', gap: 2 }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => onPick(e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, borderRadius: 8, padding: 2, lineHeight: '24px' }}
                onMouseEnter={ev => { ev.currentTarget.style.background = `${accent}22` }}
                onMouseLeave={ev => { ev.currentTarget.style.background = 'none' }}>
                {e}
              </button>
            ))}
          </div>
          <button onClick={() => setFull(true)}
            style={{ width: '100%', marginTop: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: 8, padding: '5px 0', fontSize: 11, fontWeight: 700, color: '#bbb', cursor: 'pointer' }}>
            🔍 All emojis…
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
