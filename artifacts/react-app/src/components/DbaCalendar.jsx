// ════════════════════════════════════════════════════════════════
// DbaCalendar.jsx — shared events calendar + 1v1 booking embeds,
// scoped to ONE DBA (Phase 6).
//
// • Every member sees the same events calendar (month grid + upcoming
//   list). Events can carry a clickable link (e.g. a meeting link).
// • The coach — and any leaders the coach authorizes — can create,
//   edit and delete events, and publish their own Calendly/GHL
//   booking calendar, shown here as an embed so members can book
//   1v1 calls without leaving the app.
// • Everything loads from /api/dba/calendar and is stored server-side
//   per DBA — other DBAs and the wider org never see any of it.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { sbBearer } from '../lib/sbAuth'

const C = {
  black:'#000', white:'#fff', surface:'#111', card:'#1a1a1a',
  border:'#2a2a2a', muted:'#888', success:'#4FD89A', danger:'#ff4444',
}

const API = (p) => `${(import.meta.env.BASE_URL || '/')}api/dba/${p}`

async function apiGet(path) {
  try {
    const r = await fetch(API(path), { headers: { Authorization: sbBearer() } })
    return await r.json().catch(() => null)
  } catch { return null }
}
async function apiPost(path, body) {
  try {
    const r = await fetch(API(path), {
      method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
      body: JSON.stringify(body),
    })
    const b = await r.json().catch(() => ({}))
    return { ok: r.ok && b?.ok !== false, ...b }
  } catch { return { ok:false, error:'Could not reach the server' } }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOWS = ['Su','Mo','Tu','We','Th','Fr','Sa']

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const evDayKey = (iso) => dayKey(new Date(iso))
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })

// Local datetime-input value ⇄ ISO
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const EMPTY_FORM = { id:null, title:'', start:'', end:'', description:'', link:'' }

export default function DbaCalendar({ dba, primary, palette = null, isMobile }) {
  // Event dots use the single primary brand color (no palette cycling)
  const eventColor = (_i) => primary
  const [data, setData]   = useState(null)  // {can_manage, can_set_booking, my_booking, events, bookings, roster?}
  const [busy, setBusy]   = useState(false)
  const [view, setView]   = useState(() => { const n = new Date(); return { y:n.getFullYear(), m:n.getMonth() } })
  const [selDay, setSelDay] = useState(null)     // 'YYYY-MM-DD' or null
  const [form, setForm]   = useState(null)       // null = closed, else EMPTY_FORM shape
  const [bookOpen, setBookOpen] = useState(null) // booking entry id whose embed is open
  const [myUrl, setMyUrl] = useState('')
  const [showGrants, setShowGrants] = useState(false)

  async function load() {
    if (!dba?.id) return
    const b = await apiGet(`calendar?id=${encodeURIComponent(dba.id)}`)
    if (b?.ok) { setData(b); setMyUrl(b.my_booking || '') }
  }
  useEffect(() => {
    setData(null); setForm(null); setSelDay(null); setBookOpen(null); setShowGrants(false)
    load()
  }, [dba?.id]) // eslint-disable-line

  const events = data?.events || []
  const byDay = {}
  for (const e of events) { const k = evDayKey(e.start); (byDay[k] = byDay[k] || []).push(e) }

  const now = new Date()
  const upcoming = events.filter(e => new Date(e.end || e.start) >= new Date(now.getTime() - 3600000))

  async function saveEvent() {
    if (!form.title.trim()) { alert('Give the event a title.'); return }
    if (!form.start) { alert('Pick a date and time.'); return }
    setBusy(true)
    const b = await apiPost('event-save', { dbaId: dba.id, event: {
      id: form.id || undefined,
      title: form.title,
      start: new Date(form.start).toISOString(),
      end: form.end ? new Date(form.end).toISOString() : '',
      description: form.description,
      link: form.link.trim(),
    }})
    setBusy(false)
    if (!b.ok) { alert(b.error || 'Could not save the event.'); return }
    setForm(null)
    load()
  }
  async function deleteEvent(e) {
    if (!confirm(`Delete "${e.title}"?`)) return
    const b = await apiPost('event-delete', { dbaId: dba.id, eventId: e.id })
    if (!b.ok) { alert(b.error || 'Could not delete the event.'); return }
    if (form?.id === e.id) setForm(null)
    load()
  }
  async function saveMyBooking() {
    setBusy(true)
    const b = await apiPost('booking-set', { dbaId: dba.id, url: myUrl.trim() })
    setBusy(false)
    if (!b.ok) { alert(b.error || 'Could not save your booking link.'); return }
    load()
  }
  async function toggleGrant(m) {
    const b = await apiPost('cal-authority-set', { dbaId: dba.id, userId: m.id, allowed: !m.allowed })
    if (!b.ok) { alert(b.error || 'Could not update calendar access.'); return }
    load()
  }

  // ── Month grid data ──
  const first = new Date(view.y, view.m, 1)
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d))
  const todayK = dayKey(new Date())

  const inp = { width:'100%', boxSizing:'border-box', background:C.surface, color:C.white, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 11px', fontSize:13, outline:'none' }
  const btn = (bg, fg = C.black) => ({ background:bg, color:fg, border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:800, cursor:'pointer' })
  const lbl = { fontSize:11, fontWeight:700, color:C.muted, margin:'10px 0 4px', letterSpacing:.4, textTransform:'uppercase' }

  const EventRow = ({ e, showDate }) => (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'11px 13px', display:'flex', gap:10, alignItems:'flex-start', flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:150 }}>
        <p style={{ fontSize:13.5, fontWeight:800, color:C.white, margin:0 }}>{e.title}</p>
        <p style={{ fontSize:11, color:primary, margin:'2px 0 0', fontWeight:700 }}>
          {showDate ? `${fmtDate(e.start)} · ` : ''}{fmtTime(e.start)}{e.end ? ` – ${fmtTime(e.end)}` : ''}
        </p>
        {e.description && <p style={{ fontSize:12, color:C.muted, margin:'4px 0 0', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{e.description}</p>}
      </div>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {e.link && (
          <a href={e.link} target="_blank" rel="noopener noreferrer"
            style={{ ...btn(C.success), textDecoration:'none', padding:'7px 12px' }}>Join ↗</a>
        )}
        {e.can_edit && (
          <>
            <button onClick={() => setForm({ id:e.id, title:e.title, start:toLocalInput(e.start), end:toLocalInput(e.end), description:e.description||'', link:e.link||'' })}
              style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:11, padding:'6px 10px', cursor:'pointer' }}>Edit</button>
            <button onClick={() => deleteEvent(e)}
              style={{ background:'none', border:'none', color:C.danger, fontSize:11, fontWeight:700, cursor:'pointer' }}>Delete</button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 860, margin:'0 auto', padding: isMobile ? '14px 10px 30px' : '24px 16px 40px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:C.white, margin:0 }}>Calendar</h2>
          <p style={{ fontSize:11.5, color:C.muted, margin:'3px 0 0' }}>Events and 1v1 bookings for {dba?.name}.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {data?.roster && (
            <button onClick={() => setShowGrants(s => !s)}
              style={{ background:'none', color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              {showGrants ? 'Done' : '⚙ Calendar access'}
            </button>
          )}
          {data?.can_manage && (
            <button onClick={() => setForm(f => f ? null : { ...EMPTY_FORM })} style={btn(primary)}>
              {form && !form.id ? 'Cancel' : '+ Add event'}
            </button>
          )}
        </div>
      </div>

      {/* Manager: who may manage this calendar (and show a booking embed) */}
      {showGrants && data?.roster && (
        <div style={{ background:C.card, border:`1px solid ${primary}44`, borderRadius:12, padding:16, marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:800, color:C.white, margin:'0 0 4px' }}>Who can manage this calendar</p>
          <p style={{ fontSize:11.5, color:C.muted, margin:'0 0 10px', lineHeight:1.5 }}>
            People you check can add, edit and delete events — and publish their own booking calendar below so members can book calls with them.
          </p>
          {data.roster.length === 0 && <p style={{ fontSize:12, color:C.muted, margin:0 }}>No members yet.</p>}
          {data.roster.map(m => (
            <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', fontSize:13, color:C.white, cursor:'pointer' }}>
              <input type="checkbox" checked={!!m.allowed} onChange={() => toggleGrant(m)} />
              {m.name}
            </label>
          ))}
        </div>
      )}

      {/* Event form (add or edit) */}
      {form && (
        <div style={{ background:C.card, border:`1px solid ${primary}44`, borderRadius:12, padding:16, marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:800, color:C.white, margin:'0 0 8px' }}>{form.id ? 'Edit event' : 'New event'}</p>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} placeholder="Event title" maxLength={120} style={inp} />
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:170 }}>
              <p style={lbl}>Starts</p>
              <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start:e.target.value }))} style={inp} />
            </div>
            <div style={{ flex:1, minWidth:170 }}>
              <p style={lbl}>Ends (optional)</p>
              <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end:e.target.value }))} style={inp} />
            </div>
          </div>
          <p style={lbl}>Link members can click to join (optional)</p>
          <input value={form.link} onChange={e => setForm(f => ({ ...f, link:e.target.value }))} placeholder="https:// meeting or resource link" style={inp} />
          <p style={lbl}>Details (optional)</p>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description:e.target.value }))} rows={3} maxLength={2000}
            placeholder="What's this event about?" style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={saveEvent} disabled={busy} style={{ ...btn(primary), opacity: busy ? .6 : 1 }}>
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Add event'}
            </button>
            <button onClick={() => setForm(null)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:12, fontWeight:700, padding:'9px 14px', cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {data === null ? (
        <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:'30px 0' }}>Loading…</p>
      ) : (
        <>
          {/* ── Month grid ── */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:isMobile ? 10 : 16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <button onClick={() => setView(v => v.m === 0 ? { y:v.y-1, m:11 } : { y:v.y, m:v.m-1 })}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:13, padding:'5px 11px', cursor:'pointer' }}>‹</button>
              <p style={{ fontSize:14, fontWeight:800, color:C.white, margin:0 }}>{MONTHS[view.m]} {view.y}</p>
              <button onClick={() => setView(v => v.m === 11 ? { y:v.y+1, m:0 } : { y:v.y, m:v.m+1 })}
                style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontSize:13, padding:'5px 11px', cursor:'pointer' }}>›</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:3 }}>
              {DOWS.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:800, color:C.muted, padding:'2px 0 6px', letterSpacing:.5 }}>{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />
                const k = dayKey(d)
                const evs = byDay[k] || []
                const isSel = selDay === k
                return (
                  <div key={k} onClick={() => setSelDay(isSel ? null : k)}
                    style={{ minHeight: isMobile ? 40 : 52, borderRadius:8, padding:'4px 5px', cursor:'pointer', boxSizing:'border-box',
                      background: isSel ? `${primary}22` : k === todayK ? C.surface : 'none',
                      border:`1px solid ${isSel ? primary+'66' : k === todayK ? C.border : 'transparent'}` }}>
                    <span style={{ fontSize:11, fontWeight: k === todayK ? 800 : 600, color: k === todayK ? primary : C.white }}>{d.getDate()}</span>
                    <div style={{ display:'flex', gap:2, flexWrap:'wrap', marginTop:3 }}>
                      {evs.slice(0,4).map((e, ei) => <span key={e.id} style={{ width:6, height:6, borderRadius:3, background:eventColor(ei) }} />)}
                      {evs.length > 4 && <span style={{ fontSize:8, color:C.muted }}>+{evs.length-4}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Selected day / upcoming list ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
            {selDay ? (
              <>
                <p style={{ fontSize:12, fontWeight:800, color:C.muted, margin:'0 0 2px', letterSpacing:.4, textTransform:'uppercase' }}>
                  {new Date(selDay + 'T12:00').toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}
                </p>
                {(byDay[selDay] || []).length === 0
                  ? <p style={{ fontSize:12.5, color:C.muted, margin:0 }}>Nothing scheduled this day.</p>
                  : (byDay[selDay] || []).map(e => <EventRow key={e.id} e={e} />)}
              </>
            ) : (
              <>
                <p style={{ fontSize:12, fontWeight:800, color:C.muted, margin:'0 0 2px', letterSpacing:.4, textTransform:'uppercase' }}>Upcoming events</p>
                {upcoming.length === 0
                  ? <p style={{ fontSize:12.5, color:C.muted, margin:0 }}>
                      {data.can_manage ? 'No upcoming events — add the first one.' : 'No upcoming events yet.'}
                    </p>
                  : upcoming.slice(0, 12).map(e => <EventRow key={e.id} e={e} showDate />)}
              </>
            )}
          </div>

          {/* ── Booking calendars (coach + authorized leaders) ── */}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:18 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:C.white, margin:'0 0 3px' }}>Book a 1v1 call</h3>
            <p style={{ fontSize:11.5, color:C.muted, margin:'0 0 12px' }}>Pick a person to see their live booking calendar.</p>

            {(data.bookings || []).length === 0 && (
              <p style={{ fontSize:12.5, color:C.muted, margin:'0 0 12px' }}>No booking calendars have been added yet.</p>
            )}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {(data.bookings || []).map(b => (
                <button key={b.id} onClick={() => setBookOpen(o => o === b.id ? null : b.id)}
                  style={{ background: bookOpen === b.id ? `${primary}22` : 'none', color: bookOpen === b.id ? primary : C.white,
                    border:`1px solid ${bookOpen === b.id ? primary+'66' : C.border}`, borderRadius:10, padding:'9px 14px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                  📅 {b.name}{b.is_coach ? ' · Coach' : ''}
                </button>
              ))}
            </div>
            {bookOpen && (() => {
              const b = (data.bookings || []).find(x => x.id === bookOpen)
              if (!b) return null
              return (
                <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:12, fontWeight:800, color:C.white }}>Book with {b.name}</span>
                    <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:primary, fontWeight:700, textDecoration:'none' }}>Open in a new tab ↗</a>
                  </div>
                  <iframe src={b.url} title={`Book with ${b.name}`}
                    style={{ width:'100%', height: isMobile ? 560 : 640, border:'none', display:'block', background:'#fff' }} />
                </div>
              )
            })()}

            {/* My own booking link (coach + authorized leaders) */}
            {data.can_set_booking && (
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginTop:14 }}>
                <p style={{ fontSize:12.5, fontWeight:800, color:C.white, margin:'0 0 4px' }}>Your booking calendar</p>
                <p style={{ fontSize:11.5, color:C.muted, margin:'0 0 8px', lineHeight:1.5 }}>
                  Paste your Calendly or GHL booking link — members of this DBA will see it above and can book calls with you. Leave it empty to remove it.
                </p>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <input value={myUrl} onChange={e => setMyUrl(e.target.value)} placeholder="https://calendly.com/you/intro-call"
                    style={{ ...inp, flex:1, minWidth:220, width:'auto' }} />
                  <button onClick={saveMyBooking} disabled={busy || myUrl.trim() === (data.my_booking || '')} style={{ ...btn(primary), opacity: (busy || myUrl.trim() === (data.my_booking || '')) ? .6 : 1 }}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
