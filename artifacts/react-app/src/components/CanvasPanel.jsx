// CanvasPanel.jsx — shared, Slack-style collaborative "Canvas" documents
// attached to a community, the Team Hub #general channel, or a Team Hub DM.
// Each conversation can have MANY canvases: opening the panel shows the list,
// clicking one (or "+ New canvas") opens the editor. Content autosaves while
// typing AND there's an explicit "Save changes" button; closing flushes any
// unsaved edits. Deleting is limited to the canvas creator (admins can delete
// any). All membership checks happen on the api-server.
import { useState, useEffect, useRef } from 'react'
import { sbAccessToken } from '../lib/sbAuth'
import { T as _ThemeT } from '../lib/theme'

const C = _ThemeT

const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export default function CanvasPanel({ scope, label, onClose, isMobile = false, myId = null, isAdmin = false, readOnly = false }) {
  const [view,     setView]     = useState('list')   // 'list' | 'edit'
  const [canvases, setCanvases] = useState(null)     // null = loading
  const [error,    setError]    = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [doc,      setDoc]      = useState(null)
  const [status,   setStatus]   = useState('')       // '', 'Saving…', 'Saved', 'Unsaved changes', 'Save failed…'
  const saveTimer = useRef(null)
  const latest    = useRef({ content:'', title:'' })
  const dirty     = useRef(false)
  const isNew     = useRef(false)

  const hdrs = () => ({ Authorization:`Bearer ${sbAccessToken()}` })

  async function loadList() {
    setError(null); setCanvases(null)
    try {
      const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}`, { headers:hdrs() })
      if (!r.ok) { setError(r.status === 403 ? "You don't have access to these canvases." : 'Could not load canvases — try again.'); return }
      const d = await r.json()
      setCanvases(Array.isArray(d.canvases) ? d.canvases : [])
    } catch { setError('Could not load canvases — try again.') }
  }
  useEffect(() => { loadList() }, [scope])

  async function openCanvas(id, fresh = false) {
    clearTimeout(saveTimer.current)
    dirty.current = false; isNew.current = fresh
    setActiveId(id); setDoc(null); setStatus(''); setView('edit')
    if (fresh) { setDoc({ content:'', title:'' }); latest.current = { content:'', title:'' }; return }
    try {
      const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}/${id}`, { headers:hdrs() })
      if (!r.ok) { setError('Could not open this canvas — try again.'); setView('list'); return }
      const d = await r.json()
      setDoc(d); latest.current = { content:d.content||'', title:d.title||'' }
    } catch { setError('Could not open this canvas — try again.'); setView('list') }
  }

  async function saveNow(id = activeId) {
    if (!id) return true
    clearTimeout(saveTimer.current)
    setStatus('Saving…')
    try {
      const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}/${id}`, {
        method:'POST', headers:{ 'Content-Type':'application/json', ...hdrs() },
        body: JSON.stringify(latest.current),
      })
      if (!r.ok) { setStatus('Save failed — check your connection'); return false }
      const d = await r.json().catch(() => ({}))
      dirty.current = false; isNew.current = false
      setStatus('Saved')
      setDoc(prev => ({ ...(prev||{}), updated_by_name:d.updated_by_name, updated_at:d.updated_at }))
      setTimeout(() => setStatus(s => s === 'Saved' ? '' : s), 2000)
      return true
    } catch { setStatus('Save failed — check your connection'); return false }
  }

  function queueSave(next) {
    latest.current = { ...latest.current, ...next }
    dirty.current = true
    setDoc(d => ({ ...(d||{}), ...next }))
    setStatus('Saving…')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNow(), 900)
  }

  // Flush any pending edits, then run fn (back to list or close entirely).
  async function flushThen(fn) {
    if (dirty.current && (latest.current.content || latest.current.title)) await saveNow()
    fn()
  }
  const backToList = () => flushThen(() => { setView('list'); setActiveId(null); setDoc(null); setStatus(''); loadList() })
  const closeAll   = () => flushThen(onClose)

  async function deleteCanvas(cv) {
    if (!window.confirm(`Delete the canvas "${cv.title || 'Untitled'}"? This can't be undone.`)) return
    try {
      const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}/${cv.id}`, { method:'DELETE', headers:hdrs() })
      if (!r.ok) { alert("Couldn't delete — only whoever created a canvas (or an admin) can delete it."); return }
      loadList()
    } catch { alert("Couldn't delete — try again.") }
  }

  const canDelete = cv => isAdmin || (cv.created_by && cv.created_by === myId)
  const fmt = ts => { try { return new Date(ts).toLocaleString() } catch { return '' } }
  const lastEdit = doc?.updated_at
    ? `Last edited by ${doc.updated_by_name || 'someone'} · ${fmt(doc.updated_at)}`
    : 'New canvas — it saves as you type, or use Save changes'

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200,padding:isMobile?0:24}}
      onClick={e => { if (e.target === e.currentTarget) closeAll() }}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:isMobile?0:14,width:'100%',maxWidth:720,height:isMobile?'100%':'82vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {view === 'list' ? (<>
          {/* ── List header ── */}
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16}}>📝</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.white,fontSize:15,fontWeight:700}}>Canvases — {label}</div>
              <div style={{fontSize:10,color:C.dim,marginTop:2}}>{readOnly ? 'View only — your coach can grant canvas editing' : 'Shared docs everyone in this conversation can open and edit'}</div>
            </div>
            {!readOnly && (
              <button onClick={() => openCanvas(newId(), true)}
                style={{background:C.gold,border:'none',borderRadius:8,padding:'7px 14px',color:C.black,fontSize:12,fontWeight:800,cursor:'pointer',flexShrink:0}}>+ New canvas</button>
            )}
            <button onClick={onClose} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',color:C.muted,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>Close</button>
          </div>
          {/* ── List body ── */}
          <div style={{flex:1,overflowY:'auto',padding:'12px 18px'}}>
            {error && <div style={{padding:12,fontSize:13,color:'#e05d5d'}}>{error}</div>}
            {!error && canvases === null && <div style={{padding:12,fontSize:12,color:C.muted}}>Loading canvases…</div>}
            {!error && canvases && canvases.length === 0 && (
              <div style={{textAlign:'center',padding:'50px 20px',color:C.muted,fontSize:13,lineHeight:1.8}}>
                {readOnly ? 'No canvases here yet.' : (<>No canvases here yet.<br/>Click <b style={{color:C.gold}}>+ New canvas</b> to start the first one — notes, plans, checklists, anything.</>)}
              </div>
            )}
            {!error && canvases && canvases.map(cv => (
              <div key={cv.id} style={{display:'flex',alignItems:'center',gap:10,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                <button onClick={() => openCanvas(cv.id)} style={{flex:1,minWidth:0,textAlign:'left',background:'none',border:'none',cursor:'pointer',padding:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📄 {cv.title || 'Untitled canvas'}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                    {cv.updated_at ? `Edited by ${cv.updated_by_name || 'someone'} · ${fmt(cv.updated_at)}` : 'Empty'}
                    {cv.created_by_name ? ` · created by ${cv.created_by_name}` : ''}
                  </div>
                </button>
                {canDelete(cv) && (
                  <button onClick={() => deleteCanvas(cv)} title="Delete this canvas"
                    style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer',padding:4,flexShrink:0}}>🗑</button>
                )}
              </div>
            ))}
          </div>
        </>) : (<>
          {/* ── Editor header ── */}
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
            <button onClick={backToList} title="Back to all canvases"
              style={{background:'none',border:'none',color:C.muted,fontSize:16,cursor:'pointer',padding:0,flexShrink:0}}>←</button>
            <div style={{flex:1,minWidth:0}}>
              <input
                value={doc?.title ?? ''} disabled={!doc} readOnly={readOnly}
                onChange={e => { if (!readOnly) queueSave({ title:e.target.value }) }}
                placeholder="Untitled canvas — give it a name"
                style={{width:'100%',background:'none',border:'none',outline:'none',color:C.white,fontSize:15,fontWeight:700}}/>
              <div style={{fontSize:10,color:C.dim,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lastEdit}</div>
            </div>
            {status && <span style={{fontSize:10,fontWeight:700,color:status==='Saved'?'#41d27d':status==='Saving…'?C.muted:'#e05d5d',flexShrink:0}}>{status}</span>}
            <button onClick={closeAll} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',color:C.muted,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>Close</button>
          </div>
          {/* ── Editor body ── */}
          {!doc && <div style={{padding:24,fontSize:12,color:C.muted}}>Loading canvas…</div>}
          {doc && (
            <textarea
              value={doc.content ?? ''} readOnly={readOnly}
              onChange={e => { if (!readOnly) queueSave({ content:e.target.value }) }}
              placeholder={readOnly ? 'Nothing written here yet.' : 'Write anything here — notes, plans, checklists, links…\nEveryone in this conversation can see and edit this canvas. No length limit.'}
              style={{flex:1,background:C.surface,border:'none',outline:'none',resize:'none',padding:18,color:C.white,fontSize:13,lineHeight:1.7,fontFamily:'inherit'}}/>
          )}
          {/* ── Footer note ── */}
          {doc && (
            <div style={{padding:'8px 18px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end',flexShrink:0}}>
              <span style={{fontSize:10,color:C.dim}}>{readOnly ? 'View only' : 'Autosaves as you type — closing also saves'}</span>
            </div>
          )}
        </>)}
      </div>
    </div>
  )
}
