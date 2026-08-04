// CanvasPanel.jsx — a shared, Slack-style collaborative "Canvas" document
// attached to a community or a Team Hub DM. Everyone in the conversation can
// read and edit; saves are debounced and go through the api-server (which
// checks membership and writes with the service key).
import { useState, useEffect, useRef } from 'react'
import { sbAccessToken } from '../lib/sbAuth'

const C = {
  black:'#000', card:'#101010', surface:'#161616', border:'#232323',
  gold:'#E0A82E', white:'#F5F5F5', muted:'#8a8a8a', dim:'#5a5a5a',
}

export default function CanvasPanel({ scope, label, onClose, isMobile = false }) {
  const [doc,     setDoc]     = useState(null)     // {content,title,updated_by_name,updated_at}
  const [error,   setError]   = useState(null)
  const [status,  setStatus]  = useState('')       // '', 'Saving…', 'Saved', 'Save failed'
  const saveTimer = useRef(null)
  const latest    = useRef({ content:'', title:'' })

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const tok = sbAccessToken()
        const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}`, { headers:{ Authorization:`Bearer ${tok}` } })
        if (!r.ok) { if (!dead) setError(r.status === 403 ? "You don't have access to this canvas." : 'Could not load the canvas — try again.'); return }
        const d = await r.json()
        if (!dead) { setDoc(d); latest.current = { content:d.content||'', title:d.title||'' } }
      } catch { if (!dead) setError('Could not load the canvas — try again.') }
    })()
    return () => { dead = true; clearTimeout(saveTimer.current) }
  }, [scope])

  function queueSave(next) {
    latest.current = { ...latest.current, ...next }
    setDoc(d => ({ ...(d||{}), ...next }))
    setStatus('Saving…')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const tok = sbAccessToken()
        const r = await fetch(`/api/canvas/${encodeURIComponent(scope)}`, {
          method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${tok}` },
          body: JSON.stringify(latest.current),
        })
        if (!r.ok) { setStatus('Save failed — check your connection'); return }
        const d = await r.json().catch(() => ({}))
        setStatus('Saved')
        setDoc(prev => ({ ...(prev||{}), updated_by_name:d.updated_by_name, updated_at:d.updated_at }))
        setTimeout(() => setStatus(s => s === 'Saved' ? '' : s), 2000)
      } catch { setStatus('Save failed — check your connection') }
    }, 900)
  }

  const lastEdit = doc?.updated_at
    ? `Last edited by ${doc.updated_by_name || 'someone'} · ${(() => { try { return new Date(doc.updated_at).toLocaleString() } catch { return '' } })()}`
    : 'New canvas — start typing, it saves automatically'

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200,padding:isMobile?0:24}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:isMobile?0:14,width:'100%',maxWidth:720,height:isMobile?'100%':'82vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header */}
        <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16}}>📝</span>
          <div style={{flex:1,minWidth:0}}>
            <input
              value={doc?.title ?? ''} disabled={!doc}
              onChange={e => queueSave({ title:e.target.value })}
              placeholder={`Canvas — ${label}`}
              style={{width:'100%',background:'none',border:'none',outline:'none',color:C.white,fontSize:15,fontWeight:700}}/>
            <div style={{fontSize:10,color:C.dim,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lastEdit}</div>
          </div>
          {status && <span style={{fontSize:10,fontWeight:700,color:status==='Saved'?'#41d27d':status==='Saving…'?C.muted:'#e05d5d',flexShrink:0}}>{status}</span>}
          <button onClick={onClose} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',color:C.muted,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>Close</button>
        </div>
        {/* Body */}
        {error && <div style={{padding:24,fontSize:13,color:'#e05d5d'}}>{error}</div>}
        {!error && !doc && <div style={{padding:24,fontSize:12,color:C.muted}}>Loading canvas…</div>}
        {!error && doc && (
          <textarea
            value={doc.content ?? ''}
            onChange={e => queueSave({ content:e.target.value })}
            placeholder={'Write anything here — notes, plans, checklists, links…\nEveryone in this conversation can see and edit this canvas.'}
            style={{flex:1,background:C.surface,border:'none',outline:'none',resize:'none',padding:18,color:C.white,fontSize:13,lineHeight:1.7,fontFamily:'inherit'}}/>
        )}
      </div>
    </div>
  )
}
