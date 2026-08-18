// ── Loom Mode privacy: blur names app-wide, with a pre-record checklist ──
// LN wraps any name. When Loom Mode is on, it blurs unless that name has been
// checked in the LoomPicker (or clicked directly). No hover-peek: nothing is
// ever revealed by accident on camera.
import React, { useState, useEffect } from 'react'
import { T } from '../lib/theme'

const w = window as any
const keys  = () => w.__edenLoomKeys  || (w.__edenLoomKeys  = new Set())
const shown = () => w.__edenLoomShown || (w.__edenLoomShown = new Set())

export function loomSet(on: any) {
  w.__edenLoom = on
  if (on) shown().clear()           // every Loom session starts fully blurred
  window.dispatchEvent(new Event('eden-loom'))
}
// Mark a name visible app-wide (e.g. when a coach/admin clicks into a client)
export function loomShow(k: any) {
  if (!k) return
  shown().add(k)
  window.dispatchEvent(new Event('eden-loom'))
}
export function loomIsShown(k: any) { return !!k && shown().has(k) }
export function loomToggleShown(k: any) {
  const s = shown()
  s.has(k) ? s.delete(k) : s.add(k)
  window.dispatchEvent(new Event('eden-loom'))
}

export function useLoomOn() {
  const [, tick] = useState(0)
  useEffect(() => {
    const h = () => tick(t => t + 1)
    window.addEventListener('eden-loom', h)
    return () => window.removeEventListener('eden-loom', h)
  }, [])
  return !!w.__edenLoom
}

export const LN = ({ children, k, style }: any) => {
  const loom = useLoomOn()
  const key = k || (typeof children === 'string' ? children : '')
  useEffect(() => {
    if (!key) return
    keys().add(key)
    window.dispatchEvent(new Event('eden-loom-keys'))
  }, [key])
  if (!loom) return <>{children}</>
  const vis = !!key && shown().has(key)
  return (
    <span onClick={e => { e.stopPropagation(); if (key) loomToggleShown(key) }}
      title={vis ? 'Click to blur again' : 'Click to reveal (or use the 👁 checklist)'}
      style={{ filter: vis ? 'none' : 'blur(6px)', cursor: 'pointer',
        userSelect: vis ? 'auto' : 'none', borderRadius: 4,
        outline: vis ? `1px dashed ${T.gold}66` : 'none', ...style }}>
      {children}
    </span>
  )
}

// Checklist button — sits next to the Loom toggle. Open it BEFORE recording,
// tick the names that should stay readable, close it, then record.
export function LoomPicker({ isMobile }: any) {
  const loom = useLoomOn()
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const h = () => tick(t => t + 1)
    window.addEventListener('eden-loom-keys', h)
    return () => window.removeEventListener('eden-loom-keys', h)
  }, [])
  if (!loom) return null
  const list = [...keys()].sort((a: any, b: any) => a.localeCompare(b))
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        title="Choose which names stay visible during your Loom"
        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
          background: open ? T.goldDim : 'transparent',
          border:`1.5px solid ${open ? T.gold : T.border}`,
          borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>
        <span style={{ fontSize:15 }}>👁</span>
        {!isMobile && (
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:'uppercase',
            color: open ? T.gold : T.muted }}>Visible</span>
        )}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:250, maxHeight:320,
          overflowY:'auto', background:T.card, border:`1px solid ${T.border}`, borderRadius:12,
          boxShadow:'0 8px 32px rgba(0,0,0,.6)', zIndex:6500, padding:8 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:1,
            textTransform:'uppercase', padding:'4px 6px 2px' }}>👁 Visible during Loom</div>
          <div style={{ fontSize:10, color:T.muted, padding:'0 6px 8px', lineHeight:1.5 }}>
            Check the names to keep readable, then close this menu before recording.
          </div>
          {list.length === 0 && (
            <div style={{ fontSize:11, color:T.muted, padding:'6px 6px 8px', lineHeight:1.5 }}>
              Open the screen you'll record first — its names will appear here.
            </div>
          )}
          {list.map(k => (
            <label key={k} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 6px',
              borderRadius:8, cursor:'pointer', fontSize:12, color:T.text, fontWeight:600 }}>
              <input type="checkbox" checked={shown().has(k)} onChange={() => loomToggleShown(k)}
                style={{ accentColor:T.gold, cursor:'pointer' }}/>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
