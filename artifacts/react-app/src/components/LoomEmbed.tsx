// Collapsible Loom video — shows a compact "Watch" button until clicked,
// so recordings never dominate the page for people who aren't watching them.
import { useState } from 'react'

const C = { gold:'#ffa600', black:'#000', white:'#fff', border:'#2a2a2a', muted:'#888' }

// Accepts a share URL, an embed URL, or a bare video id.
function loomEmbedUrl(raw: any): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)
  if (m) return `https://www.loom.com/embed/${m[1]}`
  if (/^[a-zA-Z0-9]{16,}$/.test(s)) return `https://www.loom.com/embed/${s}`
  return null
}

export default function LoomEmbed({ url, label = '🎥 Watch Loom Video', title = 'Loom video', sx = {} }: any) {
  const [open, setOpen] = useState(false)
  const embed = loomEmbedUrl(url)
  if (!embed) {
    // Not a recognizable Loom link — fall back to a plain external link
    return url ? (
      <a href={url} target="_blank" rel="noreferrer"
        style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:12,fontWeight:700,textDecoration:'none',...sx}}>
        {label}
      </a>
    ) : null
  }
  if (!open) {
    return (
      <button onClick={()=>setOpen(true)}
        style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'7px 14px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer',...sx}}>
        {label} <span style={{fontSize:10}}>▶</span>
      </button>
    )
  }
  return (
    <div style={{...sx}}>
      <button onClick={()=>setOpen(false)}
        style={{background:'none',border:'none',color:C.muted,fontSize:11,fontWeight:700,cursor:'pointer',padding:'0 0 6px',display:'block'}}>
        ✕ Hide video
      </button>
      <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:10,overflow:'hidden',border:`1px solid ${C.border}`}}>
        <iframe src={embed} allowFullScreen title={title}
          style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
      </div>
    </div>
  )
}
