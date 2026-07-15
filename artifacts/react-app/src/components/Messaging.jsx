// ═══════════════════════════════════════════════════════════════
// Messaging.jsx — Week 2 FIXED
// Works with your exact Supabase data and demo login system
// Drag into src/components/Messaging.jsx in Replit
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react'

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => window.innerWidth < bp)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

// ── Your exact Supabase credentials ──────────────────────────
const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

// ── Your exact UUIDs from Supabase ───────────────────────────
const KNOWN_USERS = {
  'coach@eden.io':       { uuid: '414b1fb3-f38c-4480-bdb2-fe7b1d844051', name: 'Coach Marcus',    role: 'coach' },
  'client@eden.io':      { uuid: 'ece58b33-3f2a-4ce7-bed9-a157c914056c', name: 'Jordan Williams', role: 'client' },
  'admin@edencomms.io':  { uuid: null,                                    name: 'Eden Admin',      role: 'super_admin' },
}

const CONVERSATION_ID = 'e8499d22-acde-4528-8403-39ffece7b9c5'

// ── Brand colors ──────────────────────────────────────────────
const C = {
  gold:    '#ffa600',
  black:   '#000000',
  white:   '#ffffff',
  surface: '#111111',
  card:    '#1a1a1a',
  border:  '#2a2a2a',
  muted:   '#888888',
  success: '#4FD89A',
  danger:  '#ff4444',
}

// ── Supabase REST helper ──────────────────────────────────────
const H = {
  'apikey': SUPABASE_ANON,
  'Authorization': `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

async function dbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H })
  if (!res.ok) { console.error('GET error', await res.text()); return [] }
  return res.json()
}

async function dbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: H, body: JSON.stringify(body)
  })
  if (!res.ok) { console.error('INSERT error', await res.text()); return null }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function dbUpdate(table, params, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body)
  })
  if (!res.ok) console.error('UPDATE error', await res.text())
}

// ── Helpers ───────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diffDays = Math.floor((new Date() - d) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString([], { month:'short', day:'numeric' })
}

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return Math.round(b/1024) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}

function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼'
  if (ext === 'pdf') return '📄'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  return '📎'
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Props: currentUser = { email, name, role }
//        (from your existing demo login system)
// ════════════════════════════════════════════════════════════════
export default function Messaging({ currentUser }) {
  const isMobile = useIsMobile()
  const [messages,     setMessages]     = useState([])
  const [files,        setFiles]        = useState([])
  const [sessions,     setSessions]     = useState([])
  const [newMsg,       setNewMsg]       = useState('')
  const [tab,          setTab]          = useState('chat')
  const [fileTab,      setFileTab]      = useState('all')
  const [uploading,    setUploading]    = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  // ── Resolve who is logged in ──────────────────────────────
  const email    = currentUser?.email || ''
  const userInfo = KNOWN_USERS[email] || { uuid: null, name: currentUser?.name || 'User', role: currentUser?.role || 'client' }
  const myUUID   = userInfo.uuid
  const myRole   = userInfo.role
  const myName   = userInfo.name

  // ── Other person info ─────────────────────────────────────
  const otherEmail = myRole === 'coach' ? 'client@eden.io' : 'coach@eden.io'
  const otherInfo  = KNOWN_USERS[otherEmail]

  // ── Load on mount + poll every 4 seconds ─────────────────
  useEffect(() => {
    loadMessages()
    loadFiles()
    const interval = setInterval(loadMessages, 4000)
    return () => clearInterval(interval)
  }, [])

  async function loadMessages() {
    const data = await dbGet('messages',
      `conversation_id=eq.${CONVERSATION_ID}&order=created_at.asc`
    )
    if (data) {
      setMessages(data)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
    }
  }

  async function loadFiles() {
    const data = await dbGet('conversation_files',
      `conversation_id=eq.${CONVERSATION_ID}&order=created_at.desc`
    )
    if (data) setFiles(data)
  }

  async function loadSessions() {
    const data = await dbGet('login_sessions', 'order=logged_in_at.desc&limit=20')
    if (data) setSessions(data)
  }

  // ── Send message ──────────────────────────────────────────
  async function sendMessage() {
    const text = newMsg.trim()
    if (!text || !myUUID) return
    setNewMsg('')
    await dbInsert('messages', {
      conversation_id: CONVERSATION_ID,
      sender_id: myUUID,
      content: text,
      message_type: 'text',
    })
    await dbUpdate('conversations', `id=eq.${CONVERSATION_ID}`, {
      last_message: text.slice(0, 80),
      last_message_at: new Date().toISOString(),
    })
    loadMessages()
  }

  // ── Upload file ───────────────────────────────────────────
  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !myUUID) return
    setUploading(true)
    try {
      const path   = `${CONVERSATION_ID}/${Date.now()}-${file.name}`
      const bucket = file.type.startsWith('image/') ? 'chat-media' : 'lab-files'
      const upRes  = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': file.type },
        body: file,
      })
      if (!upRes.ok) throw new Error('Upload failed')
      const fileUrl  = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
      const isImage  = file.type.startsWith('image/')
      const fileType = isImage ? 'image' : file.name.toLowerCase().includes('lab') ? 'lab' : 'document'

      await dbInsert('messages', {
        conversation_id: CONVERSATION_ID,
        sender_id: myUUID,
        content: isImage ? null : file.name,
        message_type: isImage ? 'image' : 'file',
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
      await dbInsert('conversation_files', {
        conversation_id: CONVERSATION_ID,
        uploaded_by: myUUID,
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: fileType,
      })
      await dbUpdate('conversations', `id=eq.${CONVERSATION_ID}`, {
        last_message: isImage ? '📷 Photo' : `📎 ${file.name}`,
        last_message_at: new Date().toISOString(),
      })
      loadMessages()
      loadFiles()
    } catch (err) {
      alert('Upload failed. Check storage buckets exist in Supabase (chat-media and lab-files).')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const shownFiles = files.filter(f => {
    if (fileTab === 'all')       return true
    if (fileTab === 'images')    return f.file_type === 'image'
    if (fileTab === 'documents') return f.file_type === 'document'
    if (fileTab === 'labs')      return f.file_type === 'lab'
    return true
  })

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', height:'100%', background:C.black, overflow:'hidden', position:'relative' }}>

      {/* ── MOBILE: sidebar overlay backdrop ─────────────────── */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:30 }}/>
      )}

      {/* ── LEFT sidebar ────────────────────────────────────── */}
      <div style={{
        width: isMobile ? 260 : 240,
        display:'flex', flexDirection:'column',
        background:C.surface, borderRight:`1px solid ${C.border}`, flexShrink:0,
        // On mobile: slide in from left as an overlay
        ...(isMobile ? {
          position:'fixed', top:0, bottom:0, left:0, zIndex:40,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition:'transform 0.25s ease',
        } : {}),
      }}>
        <div style={{ padding:'16px 14px 12px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.white, marginBottom:4 }}>Messages</div>
            <div style={{ fontSize:11, color:C.muted }}>Signed in as <span style={{ color:C.gold }}>{myName}</span></div>
          </div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)}
              style={{ background:'none', border:'none', color:C.muted, fontSize:22, cursor:'pointer', padding:0 }}>×</button>
          )}
        </div>

        {/* Conversation row */}
        <div style={{ background:`${C.gold}15`, borderLeft:`3px solid ${C.gold}`, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
          onClick={() => { setTab('chat'); if(isMobile) setSidebarOpen(false) }}>
          <div style={{ width:36, height:36, borderRadius:18, background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:C.black, flexShrink:0 }}>
            {otherInfo?.name?.[0] || '?'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.gold, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {myRole === 'super_admin' ? 'All Conversations' : otherInfo?.name}
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
              {messages.length > 0 ? messages[messages.length-1]?.content?.slice(0,40)+'…' : 'No messages yet'}
            </div>
          </div>
        </div>

        {/* Session monitor for admin */}
        {myRole === 'super_admin' && (
          <button onClick={() => { setTab('history'); loadSessions(); if(isMobile) setSidebarOpen(false) }}
            style={{ margin:'10px 12px', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.gold, fontSize:12, fontWeight:700, cursor:'pointer', textAlign:'left' }}>
            👁 Session Monitor
          </button>
        )}

        {/* HIPAA note */}
        <div style={{ marginTop:'auto', padding:'12px 14px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.muted, lineHeight:1.6 }}>
            🔒 All messages encrypted<br/>HIPAA compliant · edencommunications.io
          </div>
        </div>
      </div>

      {/* ── RIGHT content ───────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Top bar */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'0 12px', display:'flex', alignItems:'center', flexShrink:0, gap:8 }}>
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)}
              style={{ background:'none', border:'none', color:C.muted, fontSize:20, cursor:'pointer', padding:'12px 4px', flexShrink:0, lineHeight:1 }}>
              ☰
            </button>
          )}
          {/* Who you're talking to */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            <div style={{ width:28, height:28, borderRadius:14, background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:C.black, flexShrink:0 }}>
              {myRole === 'super_admin' ? '🛡' : otherInfo?.name?.[0]}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {myRole === 'super_admin' ? 'Admin View' : otherInfo?.name}
              </div>
              <div style={{ fontSize:10, color:C.success }}>● Connected</div>
            </div>
          </div>
          {/* Tab buttons */}
          {['chat','files','history'].map(t => (
            <button key={t} onClick={() => { setTab(t); if(t==='history') loadSessions() }}
              style={{ padding: isMobile ? '12px 8px' : '12px 14px', background:'none', border:'none', borderBottom:`2px solid ${tab===t?C.gold:'transparent'}`, color:tab===t?C.gold:C.muted, fontSize: isMobile ? 11 : 12, fontWeight:tab===t?700:400, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
              {t === 'chat' ? (isMobile ? '💬' : '💬 Chat') : t === 'files' ? (isMobile ? '📁' : '📁 Files') : (isMobile ? '🔐' : '🔐 Sessions')}
            </button>
          ))}
        </div>

        {/* ── CHAT ───────────────────────────────────────────── */}
        {tab === 'chat' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {myRole === 'super_admin' && (
              <div style={{ padding:'6px 16px', background:'#ffa60011', borderBottom:`1px solid ${C.gold}33`, fontSize:11, color:C.gold }}>
                🛡 Admin read-only view — access logged for HIPAA compliance
              </div>
            )}
            {/* Messages list */}
            <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '12px 10px' : 16 }}>
              {messages.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                  No messages yet. Send the first one below.
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = msg.sender_id === myUUID
                return (
                  <div key={msg.id || i} style={{ display:'flex', justifyContent:isMine?'flex-end':'flex-start', marginBottom:10, alignItems:'flex-end' }}>
                    {/* Avatar — other person */}
                    {!isMine && (
                      <div style={{ width:26, height:26, borderRadius:13, background:C.card, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:C.gold, flexShrink:0, marginRight:6 }}>
                        {otherInfo?.name?.[0]}
                      </div>
                    )}
                    <div style={{ maxWidth: isMobile ? '82%' : '70%', minWidth:0 }}>
                      <div style={{ background:isMine?C.gold:C.card, border:isMine?'none':`1px solid ${C.border}`, borderRadius:isMine?'14px 14px 4px 14px':'14px 14px 14px 4px', padding:'9px 12px' }}>
                        {msg.message_type === 'text' && (
                          <div style={{ fontSize:13, color:isMine?C.black:C.white, lineHeight:1.5, wordBreak:'break-word' }}>{msg.content}</div>
                        )}
                        {msg.message_type === 'image' && (
                          <img src={msg.file_url} alt={msg.file_name}
                            style={{ maxWidth: isMobile ? 200 : 220, maxHeight:220, borderRadius:8, display:'block', cursor:'pointer' }}
                            onClick={() => window.open(msg.file_url,'_blank')}/>
                        )}
                        {msg.message_type === 'file' && (
                          <a href={msg.file_url} target="_blank" rel="noreferrer"
                            style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
                            <span style={{ fontSize:22 }}>{fileIcon(msg.file_name)}</span>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, color:isMine?C.black:C.gold, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.file_name}</div>
                              <div style={{ fontSize:10, color:isMine?'rgba(0,0,0,.5)':C.muted }}>{formatBytes(msg.file_size)}</div>
                            </div>
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:3, textAlign:isMine?'right':'left', display:'flex', gap:4, justifyContent:isMine?'flex-end':'flex-start' }}>
                        <span>{formatTime(msg.created_at)}</span>
                        {isMine && <span style={{ color:msg.is_read?C.success:C.muted }}>{msg.is_read?'✓✓':'✓'}</span>}
                      </div>
                    </div>
                    {/* Avatar — me */}
                    {isMine && (
                      <div style={{ width:26, height:26, borderRadius:13, background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:C.black, flexShrink:0, marginLeft:6 }}>
                        {myName?.[0]}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef}/>
            </div>

            {/* Input bar — hidden for admin */}
            {myRole !== 'super_admin' && (
              <div style={{ padding: isMobile ? '8px 10px 12px' : '10px 14px 14px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                <input type="file" ref={fileRef} onChange={handleUpload} style={{ display:'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"/>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, width:38, height:38, cursor:'pointer', fontSize:17, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {uploading ? '⏳' : '📎'}
                </button>
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                  placeholder={isMobile ? 'Message…' : 'Type a message… Enter to send'}
                  style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:'10px 14px', color:C.white, fontSize:13, outline:'none', minWidth:0 }}/>
                <button onClick={sendMessage} disabled={!newMsg.trim()}
                  style={{ background:C.gold, border:'none', borderRadius:20, padding: isMobile ? '10px 14px' : '10px 20px', fontWeight:800, color:C.black, fontSize:13, cursor:'pointer', opacity:newMsg.trim()?1:0.4, flexShrink:0 }}>
                  {isMobile ? '↑' : 'Send'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── FILES ──────────────────────────────────────────── */}
        {tab === 'files' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:8, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
              <input type="file" ref={fileRef} onChange={handleUpload} style={{ display:'none' }} accept="image/*,.pdf,.doc,.docx"/>
              <button onClick={() => fileRef.current?.click()}
                style={{ background:C.gold, border:'none', borderRadius:8, padding:'8px 16px', fontWeight:700, color:C.black, fontSize:12, cursor:'pointer' }}>
                ⬆ Upload
              </button>
              <span style={{ fontSize:11, color:C.muted }}>Photos, PDFs, lab results</span>
            </div>
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
              {[['all','All'],['images','📷 Photos'],['documents','📄 Docs'],['labs','🧪 Labs']].map(([k,l]) => (
                <button key={k} onClick={() => setFileTab(k)}
                  style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${fileTab===k?C.gold:C.border}`, background:fileTab===k?`${C.gold}20`:C.card, color:fileTab===k?C.gold:C.muted, fontSize:11, fontWeight:fileTab===k?700:400, cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {shownFiles.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                  No files yet. Upload photos or documents above, or send them in the chat.
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fill,minmax(${isMobile?130:150}px,1fr))`, gap:10 }}>
                  {shownFiles.map(f => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                      style={{ display:'block', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', textDecoration:'none' }}>
                      {f.file_type === 'image' ? (
                        <img src={f.file_url} alt={f.file_name} style={{ width:'100%', height:100, objectFit:'cover', display:'block' }}/>
                      ) : (
                        <div style={{ height:70, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, background:C.surface }}>
                          {fileIcon(f.file_name)}
                        </div>
                      )}
                      <div style={{ padding:'7px 9px' }}>
                        <div style={{ fontSize:11, color:C.white, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.file_name}</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{formatBytes(f.file_size)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SESSION HISTORY ─────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.white }}>Session Monitor</div>
              <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Login history · active sessions · device tracking</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {sessions.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>No session data yet</div>
              ) : sessions.map(s => (
                <div key={s.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${s.is_active?C.success:C.border}`, borderRadius:10, padding:'10px 13px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontSize:12, color:C.white, fontWeight:600 }}>{s.user_id}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.browser} · {s.device_type}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>In: {formatTime(s.logged_in_at)}</div>
                    </div>
                    <span style={{ fontSize:10, background:s.is_active?`${C.success}22`:`${C.muted}22`, color:s.is_active?C.success:C.muted, padding:'2px 8px', borderRadius:20, fontWeight:700 }}>
                      {s.is_active ? '🟢 LIVE' : s.duration_mins ? `${s.duration_mins}m` : 'Ended'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
