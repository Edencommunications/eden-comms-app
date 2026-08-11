// ════════════════════════════════════════════════════════════════
// DbaHuddles.jsx — live video huddles scoped to ONE DBA (Phase 5).
//
// Fully separate from org/Team Hub huddles: rooms are created by the
// api-server (POST /api/dba/huddle-start) via the org's Daily.co key
// (Eden fallback), and the room list lives in a per-DBA server-side
// config — nothing touches the org-wide huddle_rooms table.
//
// Who can start: the DBA's coach/org admin or any delegated leader
// (Phase-4 authority). Each huddle picks its audience — leaders only,
// everyone, or a hand-picked member list — and members only ever see
// huddles they're allowed into. Several huddles can run at once.
// Rooms self-expire after 4 hours (same as org huddles).
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer } from '../lib/sbAuth'

const C = {
  black:'#000', white:'#fff', surface:'#111', card:'#1a1a1a',
  border:'#2a2a2a', muted:'#888', success:'#4FD89A', danger:'#ff4444',
}

const API = (p: any) => `${(import.meta.env.BASE_URL || '/')}api/dba/${p}`

async function apiGet(path: any) {
  try {
    const r = await fetch(API(path), { headers: { Authorization: sbBearer() } })
    return await r.json().catch(() => null)
  } catch { return null }
}
async function apiPost(path: any, body: any) {
  try {
    const r = await fetch(API(path), {
      method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
      body: JSON.stringify(body),
    })
    const b = await r.json().catch(() => ({}))
    return { ok: r.ok && b?.ok !== false, ...b }
  } catch { return { ok:false, error:'Could not reach the server' } }
}

function timeAgo(ts: any) {
  const diff = Math.floor((Date.now() - (new Date(ts) as any)) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}

const AUD_LABEL: any = { leaders:'Leaders only', all:'Everyone', pick:'Invited members' }

// `visible` — whether the Huddles tab itself is showing. The component stays
// mounted across all DBA tabs so an active call keeps running; when the user
// is on another tab we render ONLY the floating call window.
export default function DbaHuddles({ dba, primary, isMobile, visible = true }: any) {
  const [data, setData] = useState<any>(null)     // {can_start, huddles, roster}
  const [joined, setJoined] = useState<any>(null) // huddle currently in the call window
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  // Start form
  const [showStart, setShowStart] = useState(false)
  const [title, setTitle] = useState('')
  const [audience, setAudience] = useState('all')
  const [picked, setPicked] = useState<any>({})
  const joinedRef = useRef<any>(null)
  joinedRef.current = joined
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // ── Draggable shrunk call window (same behavior as org huddles) ──
  // winPos = null → default pinned position. Once dragged, we keep x/y.
  const [winPos, setWinPos] = useState<any>(null)
  const winRef  = useRef<any>(null)
  const dragRef = useRef<any>(null) // { startX, startY, origX, origY, moved }

  const clampPos = (x: any, y: any) => {
    const el = winRef.current
    const w = el ? el.offsetWidth  : 320
    const h = el ? el.offsetHeight : 280
    const maxX = Math.max(0, window.innerWidth  - w)
    const maxY = Math.max(0, window.innerHeight - h)
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }
  const onHeaderPointerDown = (e: any) => {
    if (expanded) return                    // only the shrunk window drags
    if (e.target.closest('button')) return  // don't hijack Expand/End/Leave
    const el = winRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  const onHeaderPointerMove = (e: any) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    d.moved = true
    setWinPos(clampPos(d.origX + dx, d.origY + dy))
  }
  const onHeaderPointerUp = () => { dragRef.current = null }
  // Keep the window on-screen when the viewport shrinks / rotates
  useEffect(() => {
    if (!winPos) return
    const onResize = () => setWinPos((p: any) => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [winPos !== null]) // eslint-disable-line
  // Reset custom position when leaving a call
  useEffect(() => { if (!joined) setWinPos(null) }, [joined])

  async function load() {
    if (!dba?.id) return
    const b = await apiGet(`huddles?id=${encodeURIComponent(dba.id)}`)
    if (b?.ok) {
      setData(b)
      // If the room we're in was ended elsewhere, close the window
      const cur = joinedRef.current
      if (cur && !b.huddles.some((h: any) => h.id === cur.id)) setJoined(null)
    }
  }
  useEffect(() => {
    setData(null); setJoined(null); setShowStart(false)
    load()
    const iv = setInterval(() => {
      // Only poll while the list is on screen or we're in a call (to catch a
      // room being ended elsewhere) — no permanent background polling.
      if (visibleRef.current || joinedRef.current) load()
    }, 10000)
    return () => clearInterval(iv)
  }, [dba?.id]) // eslint-disable-line
  // Refresh the list when the user returns to the Huddles tab
  useEffect(() => { if (visible) load() }, [visible]) // eslint-disable-line

  async function startHuddle() {
    const memberIds = Object.keys(picked).filter(k => picked[k])
    if (audience === 'pick' && !memberIds.length) { alert('Pick at least one member to invite.'); return }
    setBusy(true)
    const b = await apiPost('huddle-start', { dbaId: dba.id, title, audience, memberIds })
    setBusy(false)
    if (!b.ok) { alert(b.error || 'Could not start the huddle.'); return }
    setShowStart(false); setTitle(''); setAudience('all'); setPicked({})
    setJoined(b.huddle); setExpanded(true)
    load()
  }
  async function endHuddle(h: any) {
    if (!confirm(`End "${h.title}" for everyone?`)) return
    const b = await apiPost('huddle-end', { dbaId: dba.id, huddleId: h.id })
    if (!b.ok) { alert(b.error || 'Could not end the huddle.'); return }
    if (joined?.id === h.id) setJoined(null)
    load()
  }

  const huddles = data?.huddles || []
  const roster = data?.roster || []
  const inp: any = { width:'100%', boxSizing:'border-box', background:C.surface, color:C.white, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 11px', fontSize:13, outline:'none' }
  const btn = (bg: any, fg: any = C.black): any => ({ background:bg, color:fg, border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:800, cursor:'pointer' })

  return (
    <>
    {visible && (
    <div style={{ maxWidth: 760, margin:'0 auto', padding: isMobile ? '14px 10px 30px' : '24px 16px 40px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14 }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:C.white, margin:0 }}>Huddles</h2>
          <p style={{ fontSize:11.5, color:C.muted, margin:'3px 0 0' }}>Live video rooms for {dba?.name}. Rooms close on their own after 4 hours.</p>
        </div>
        {data?.can_start && (
          <button onClick={() => setShowStart(s => !s)} style={btn(primary)}>
            {showStart ? 'Cancel' : '+ Start a huddle'}
          </button>
        )}
      </div>

      {showStart && (
        <div style={{ background:C.card, border:`1px solid ${primary}44`, borderRadius:12, padding:16, marginBottom:16 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What's this huddle about? (optional)" maxLength={80} style={{ ...inp, marginBottom:10 }} />
          <p style={{ fontSize:11, fontWeight:700, color:C.muted, margin:'0 0 6px', letterSpacing:.4, textTransform:'uppercase' }}>Who can join</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
            {['all','leaders','pick'].map(a => (
              <button key={a} onClick={() => setAudience(a)}
                style={{ background: audience===a ? `${primary}22` : 'none', color: audience===a ? primary : C.muted,
                  border:`1px solid ${audience===a ? primary+'66' : C.border}`, borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                {a==='all' ? 'Everyone in this DBA' : a==='leaders' ? 'Leaders only' : 'Pick members'}
              </button>
            ))}
          </div>
          {audience === 'pick' && (
            <div style={{ maxHeight:180, overflowY:'auto', border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 10px', marginBottom:10 }}>
              {roster.length === 0 && <p style={{ fontSize:12, color:C.muted }}>No members to invite yet.</p>}
              {roster.map((m: any) => (
                <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', fontSize:13, color:C.white, cursor:'pointer' }}>
                  <input type="checkbox" checked={!!picked[m.id]} onChange={e => setPicked((p: any) => ({ ...p, [m.id]: e.target.checked }))} />
                  {m.name} {m.leader && <span style={{ fontSize:9, fontWeight:800, color:primary, border:`1px solid ${primary}55`, borderRadius:10, padding:'1px 6px' }}>LEADER</span>}
                </label>
              ))}
            </div>
          )}
          <button onClick={startHuddle} disabled={busy} style={{ ...btn(primary), opacity: busy ? .6 : 1 }}>
            {busy ? 'Starting…' : '🎥 Start huddle'}
          </button>
        </div>
      )}

      {data === null ? (
        <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:'30px 0' }}>Loading…</p>
      ) : huddles.length === 0 ? (
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'34px 20px', textAlign:'center' }}>
          <p style={{ fontSize:26, margin:'0 0 8px' }}>🎥</p>
          <p style={{ fontSize:14, fontWeight:700, color:C.white, margin:'0 0 4px' }}>No live huddles right now</p>
          <p style={{ fontSize:12, color:C.muted, margin:0 }}>
            {data.can_start ? 'Start one and your people can hop in.' : "When a huddle you're invited to goes live, it'll show up here."}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {huddles.map((h: any) => (
            <div key={h.id} style={{ background:C.card, border:`1px solid ${joined?.id===h.id ? primary : C.border}`, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ width:9, height:9, borderRadius:5, background:C.success, boxShadow:`0 0 8px ${C.success}`, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:150 }}>
                <p style={{ fontSize:14, fontWeight:800, color:C.white, margin:0 }}>{h.title}</p>
                <p style={{ fontSize:11, color:C.muted, margin:'2px 0 0' }}>
                  {h.created_by_name} · started {timeAgo(h.created_at)} · {AUD_LABEL[h.audience] || 'Everyone'}
                </p>
              </div>
              {joined?.id === h.id ? (
                <button onClick={() => setJoined(null)} style={btn(C.border, C.white)}>Leave</button>
              ) : (
                <button onClick={() => { setJoined(h); setExpanded(true) }} style={btn(C.success)}>Join</button>
              )}
              {h.can_end && <button onClick={() => endHuddle(h)} style={btn('none', C.danger)}>End</button>}
            </div>
          ))}
        </div>
      )}

    </div>
    )}

      {/* ── Call window (floating, survives across ALL DBA tabs) ── */}
      {joined && (
        <div ref={winRef} style={expanded ? {
          position:'fixed', inset: isMobile ? 0 : '4vh 4vw', zIndex:2000, background:C.black,
          border:`1px solid ${primary}66`, borderRadius: isMobile ? 0 : 14, overflow:'hidden', display:'flex', flexDirection:'column',
          boxShadow:'0 20px 60px rgba(0,0,0,.7)',
        } : {
          // On mobile, sit above the bottom tab bar (~64px + safe area) so tab
          // taps still land while a call is minimized. Once dragged, use x/y.
          position:'fixed', zIndex:2000,
          ...(winPos ? { left:winPos.x, top:winPos.y } : { right:14, bottom: isMobile ? 'calc(78px + env(safe-area-inset-bottom))' : 14 }),
          width: isMobile ? 'calc(100vw - 28px)' : 380, height:280,
          background:C.black, border:`1px solid ${primary}66`, borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column',
          boxShadow:'0 12px 40px rgba(0,0,0,.6)',
        }}>
          <div onPointerDown={onHeaderPointerDown} onPointerMove={onHeaderPointerMove} onPointerUp={onHeaderPointerUp}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:C.surface, borderBottom:`1px solid ${C.border}`,
              cursor: expanded ? 'default' : 'grab', touchAction: expanded ? 'auto' : 'none' }}>
            <span style={{ width:8, height:8, borderRadius:4, background:C.success }} />
            <span style={{ fontSize:12, fontWeight:800, color:C.white, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{joined.title}</span>
            <button onClick={() => setExpanded(e => !e)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, fontSize:11, padding:'3px 8px', cursor:'pointer' }}>
              {expanded ? '⊡ Shrink' : '⛶ Expand'}
            </button>
            {joined.can_end && (
              <button onClick={() => endHuddle(joined)} style={{ background:C.danger, border:'none', borderRadius:6, color:C.white, fontSize:11, fontWeight:800, padding:'3px 10px', cursor:'pointer' }}>End</button>
            )}
            <button onClick={() => setJoined(null)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, color:C.white, fontSize:11, fontWeight:700, padding:'3px 10px', cursor:'pointer' }}>Leave</button>
          </div>
          <iframe title="DBA huddle" src={joined.room_url} allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
            style={{ flex:1, width:'100%', border:'none', background:C.black }} />
        </div>
      )}
    </>
  )
}
