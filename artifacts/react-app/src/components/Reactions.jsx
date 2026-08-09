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
import { useState, useEffect, useRef } from 'react'
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
    const close = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false) }
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
        {open && <Picker onPick={react} accent={accent} alignRight={alignRight} />}
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
      {open && <Picker onPick={react} accent={accent} alignRight={alignRight} />}
    </div>
  )
}

function Picker({ onPick, accent, alignRight }) {
  const ref = useRef(null)
  const [below, setBelow] = useState(false)
  useEffect(() => {
    // Not enough room above? Flip the picker downward so it stays on screen.
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.top < 8) setBelow(true)
    }
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute',
      ...(below ? { top: 'calc(100% + 6px)' } : { bottom: 'calc(100% + 6px)' }),
      [alignRight ? 'right' : 'left']: 0,
      background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
      padding: 8, zIndex: 1000, boxShadow: '0 8px 28px rgba(0,0,0,.6)',
      display: 'grid', gridTemplateColumns: 'repeat(8, 30px)', gap: 2,
    }}>
      {EMOJIS.map(e => (
        <button key={e} onClick={() => onPick(e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, borderRadius: 8, padding: 2, lineHeight: '24px' }}
          onMouseEnter={ev => { ev.currentTarget.style.background = `${accent}22` }}
          onMouseLeave={ev => { ev.currentTarget.style.background = 'none' }}>
          {e}
        </button>
      ))}
    </div>
  )
}
