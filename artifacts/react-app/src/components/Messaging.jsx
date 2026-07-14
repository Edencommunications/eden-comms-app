// ═══════════════════════════════════════════════════════════════
// Messaging.jsx  —  Week 2: Full Messaging System
// Place at: src/components/Messaging.jsx
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, logAdminAction } from '../supabaseClient'

// ── Brand tokens ─────────────────────────────────────────────────
const C = {
  gold:    '#ffa600',
  black:   '#000000',
  white:   '#ffffff',
  surface: '#111111',
  card:    '#1a1a1a',
  border:  '#2a2a2a',
  muted:   '#888888',
  danger:  '#ff4444',
  success: '#4FD89A',
}

const S = {
  flex: { display:'flex' },
  col:  { display:'flex', flexDirection:'column' },
  row:  { display:'flex', flexDirection:'row', alignItems:'center' },
}

// ── File type icon ────────────────────────────────────────────────
function fileIcon(type) {
  if (!type) return '📎'
  if (type.startsWith('image/')) return '🖼'
  if (type.includes('pdf')) return '📄'
  if (type.includes('spreadsheet') || type.includes('excel')) return '📊'
  return '📎'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  if (diffDays === 1) return 'Yesterday ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  return d.toLocaleDateString([], { month:'short', day:'numeric' }) + ' ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ════════════════════════════════════════════════════════════════
// MAIN MESSAGING COMPONENT
// Props:
//   currentUser  — { id, full_name, role, org_id }
//   selectedConv — conversation object (optional, pre-select)
// ════════════════════════════════════════════════════════════════
export default function Messaging({ currentUser }) {
  const [conversations, setConversations] = useState([])
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [files,         setFiles]         = useState([])
  const [newMsg,        setNewMsg]        = useState('')
  const [tab,           setTab]           = useState('chat')   // 'chat' | 'files' | 'history'
  const [fileTab,       setFileTab]       = useState('all')    // 'all' | 'images' | 'documents' | 'labs'
  const [uploading,     setUploading]     = useState(false)
  const [loginHistory,  setLoginHistory]  = useState([])
  const [activeSessions,setActiveSessions]= useState([])
  const [searchQuery,   setSearchQuery]   = useState('')
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const realtimeRef  = useRef(null)

  // ── Load conversations ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return
    loadConversations()
  }, [currentUser])

  async function loadConversations() {
    let query = supabase
      .from('conversations')
      .select(`
        *,
        coach:coach_id(id, full_name, avatar_url, role),
        client:client_id(id, full_name, avatar_url, role)
      `)
      .order('last_message_at', { ascending: false })

    if (currentUser.role === 'coach') {
      query = query.eq('coach_id', currentUser.id)
    } else if (currentUser.role === 'client') {
      query = query.eq('client_id', currentUser.id)
    }
    // super_admin: no filter = sees all

    const { data, error } = await query
    if (error) { console.error('loadConversations:', error); return }
    setConversations(data || [])
    if (data?.length && !activeConv) openConversation(data[0])
  }

  // ── Open a conversation ────────────────────────────────────────
  async function openConversation(conv) {
    setActiveConv(conv)
    setTab('chat')

    // Log admin audit if super_admin
    if (currentUser.role === 'super_admin') {
      await logAdminAction(
        currentUser.id,
        'viewed_conversation',
        null,
        'conversations',
        conv.id
      )
    }

    loadMessages(conv.id)
    loadFiles(conv.id)
    subscribeToMessages(conv.id)

    // Mark messages as read
    await supabase.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conv.id)
      .neq('sender_id', currentUser.id)
  }

  // ── Load messages ──────────────────────────────────────────────
  async function loadMessages(convId) {
    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:sender_id(id, full_name, role)`)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (error) { console.error('loadMessages:', error); return }
    setMessages(data || [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }

  // ── Realtime subscription ──────────────────────────────────────
  function subscribeToMessages(convId) {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)

    const channel = supabase
      .channel(`conv-${convId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
        // Mark as read if not the sender
        if (payload.new.sender_id !== currentUser.id) {
          supabase.from('messages').update({ is_read:true, read_at:new Date().toISOString() }).eq('id', payload.new.id)
        }
      })
      .subscribe()

    realtimeRef.current = channel
  }

  // ── Send text message ──────────────────────────────────────────
  async function sendMessage() {
    const text = newMsg.trim()
    if (!text || !activeConv) return
    setNewMsg('')

    const { error } = await supabase.from('messages').insert({
      conversation_id: activeConv.id,
      sender_id: currentUser.id,
      content: text,
      message_type: 'text',
    })
    if (error) { console.error('sendMessage:', error); return }

    // Update conversation last_message
    await supabase.from('conversations').update({
      last_message: text.slice(0, 80),
      last_message_at: new Date().toISOString(),
    }).eq('id', activeConv.id)
  }

  // ── Upload file / photo ────────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !activeConv) return
    setUploading(true)

    try {
      const ext  = file.name.split('.').pop()
      const path = `${activeConv.id}/${Date.now()}-${file.name}`
      const bucket = file.type.startsWith('image/') ? 'chat-media' : 'lab-files'

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl:'3600', upsert:false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)

      const isImage = file.type.startsWith('image/')
      const fileType = isImage ? 'image' : file.type.includes('pdf') ? 'document' : 'other'

      // Insert message
      await supabase.from('messages').insert({
        conversation_id: activeConv.id,
        sender_id: currentUser.id,
        content: isImage ? null : file.name,
        message_type: isImage ? 'image' : 'file',
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })

      // Insert into files tab
      await supabase.from('conversation_files').insert({
        conversation_id: activeConv.id,
        uploaded_by: currentUser.id,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: fileType,
      })

      // Update conversation
      await supabase.from('conversations').update({
        last_message: isImage ? '📷 Photo' : `📎 ${file.name}`,
        last_message_at: new Date().toISOString(),
      }).eq('id', activeConv.id)

      loadFiles(activeConv.id)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Upload failed. Make sure storage buckets are created in Supabase.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Load files tab ─────────────────────────────────────────────
  async function loadFiles(convId) {
    const { data, error } = await supabase
      .from('conversation_files')
      .select(`*, uploader:uploaded_by(full_name, role)`)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })

    if (error) { console.error('loadFiles:', error); return }
    setFiles(data || [])
  }

  // ── Load login history ─────────────────────────────────────────
  async function loadLoginHistory(userId) {
    const { data } = await supabase
      .from('login_sessions')
      .select(`*, user:user_id(full_name, role)`)
      .eq('user_id', userId)
      .order('logged_in_at', { ascending: false })
      .limit(20)
    setLoginHistory(data || [])
  }

  async function loadActiveSessions() {
    const { data } = await supabase
      .from('login_sessions')
      .select(`*, user:user_id(full_name, role)`)
      .eq('is_active', true)
      .order('logged_in_at', { ascending: false })
    setActiveSessions(data || [])
  }

  // ── Filtered conversations ─────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    const other = currentUser.role === 'client' ? c.coach : c.client
    return !searchQuery || other?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // ── Other person in conversation ───────────────────────────────
  function otherPerson(conv) {
    if (!conv) return null
    return currentUser.role === 'client' ? conv.coach : conv.client
  }

  // ── Filtered files ─────────────────────────────────────────────
  const filteredFiles = files.filter(f => {
    if (fileTab === 'all')       return true
    if (fileTab === 'images')    return f.file_type === 'image'
    if (fileTab === 'documents') return f.file_type === 'document'
    if (fileTab === 'labs')      return f.file_type === 'lab'
    return true
  })

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ ...S.flex, height:'100%', background:C.black, overflow:'hidden' }}>

      {/* ── LEFT PANEL: Conversation List ──────────────────────── */}
      <div style={{ width:280, ...S.col, background:C.surface, borderRight:`1px solid ${C.border}`, flexShrink:0 }}>
        {/* Header */}
        <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.white, marginBottom:10 }}>Messages</div>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.white, fontSize:12, outline:'none', boxSizing:'border-box' }}
          />
        </div>

        {/* Admin: login history button */}
        {currentUser?.role === 'super_admin' && (
          <button
            onClick={() => { setTab('history'); loadActiveSessions(); loadLoginHistory(currentUser.id) }}
            style={{ margin:'10px 12px 0', background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.gold, fontSize:12, fontWeight:700, cursor:'pointer', textAlign:'left' }}>
            👁 Session Monitor
          </button>
        )}

        {/* Conversation list */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {filteredConvs.length === 0 ? (
            <div style={{ padding:20, fontSize:12, color:C.muted, textAlign:'center' }}>No conversations yet</div>
          ) : filteredConvs.map(conv => {
            const other = otherPerson(conv)
            const isActive = activeConv?.id === conv.id
            return (
              <button key={conv.id} onClick={() => openConversation(conv)}
                style={{ width:'100%', textAlign:'left', background:isActive?`${C.gold}15`:C.surface, border:'none', borderLeft:`3px solid ${isActive?C.gold:'transparent'}`, padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .15s' }}>
                {/* Avatar */}
                <div style={{ width:38, height:38, borderRadius:19, background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:C.black, flexShrink:0 }}>
                  {other?.full_name?.[0] || '?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:isActive?700:500, color:isActive?C.gold:C.white, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {other?.full_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                    {conv.last_message || 'No messages yet'}
                  </div>
                </div>
                <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                  {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat / Files / History ────────────────── */}
      <div style={{ flex:1, ...S.col, overflow:'hidden' }}>

        {/* Tab bar */}
        {activeConv && (
          <>
            <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'0 16px', display:'flex', alignItems:'center', gap:0, flexShrink:0 }}>
              {/* Other person info */}
              <div style={{ ...S.row, gap:10, flex:1 }}>
                <div style={{ width:32, height:32, borderRadius:16, background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:C.black }}>
                  {otherPerson(activeConv)?.full_name?.[0] || '?'}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.white }}>{otherPerson(activeConv)?.full_name}</div>
                  <div style={{ fontSize:10, color:C.success }}>● Active</div>
                </div>
              </div>
              {/* Tabs */}
              {['chat','files','history'].map(t => (
                <button key={t} onClick={() => { setTab(t); if(t==='history') loadLoginHistory(currentUser.id) }}
                  style={{ padding:'12px 16px', background:'none', border:'none', borderBottom:`2px solid ${tab===t?C.gold:'transparent'}`, color:tab===t?C.gold:C.muted, fontSize:12, fontWeight:tab===t?700:400, cursor:'pointer', textTransform:'capitalize', transition:'all .15s' }}>
                  {t === 'chat' ? '💬 Chat' : t === 'files' ? '📁 Files' : '🔐 Login History'}
                </button>
              ))}
            </div>

            {/* ── CHAT TAB ─────────────────────────────────────── */}
            {tab === 'chat' && (
              <div style={{ flex:1, ...S.col, overflow:'hidden' }}>
                {/* Super admin notice */}
                {currentUser?.role === 'super_admin' && (
                  <div style={{ padding:'6px 16px', background:'#ffa60011', borderBottom:`1px solid ${C.gold}33`, fontSize:11, color:C.gold }}>
                    🛡 Admin view — this conversation is read-only for audit purposes. Logged.
                  </div>
                )}
                {/* Messages */}
                <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                  {messages.map((msg, i) => {
                    const isMine = msg.sender_id === currentUser.id
                    return (
                      <div key={msg.id || i} style={{ display:'flex', justifyContent:isMine?'flex-end':'flex-start', marginBottom:10 }}>
                        <div style={{ maxWidth:'72%' }}>
                          {/* Sender name for admins */}
                          {currentUser?.role === 'super_admin' && (
                            <div style={{ fontSize:10, color:C.muted, marginBottom:3, textAlign:isMine?'right':'left' }}>
                              {msg.sender?.full_name}
                            </div>
                          )}
                          <div style={{
                            background: isMine ? C.gold : C.card,
                            border: isMine ? 'none' : `1px solid ${C.border}`,
                            borderRadius: 12,
                            padding: '10px 13px',
                          }}>
                            {/* Text message */}
                            {msg.message_type === 'text' && (
                              <div style={{ fontSize:13, color:isMine?C.black:C.white, lineHeight:1.5 }}>{msg.content}</div>
                            )}
                            {/* Image message */}
                            {msg.message_type === 'image' && (
                              <div>
                                <img src={msg.file_url} alt={msg.file_name}
                                  style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', cursor:'pointer' }}
                                  onClick={() => window.open(msg.file_url, '_blank')}/>
                              </div>
                            )}
                            {/* File message */}
                            {msg.message_type === 'file' && (
                              <a href={msg.file_url} target="_blank" rel="noreferrer"
                                style={{ ...S.row, gap:8, textDecoration:'none' }}>
                                <span style={{ fontSize:22 }}>{fileIcon(msg.file_type)}</span>
                                <div>
                                  <div style={{ fontSize:12, color:isMine?C.black:C.gold, fontWeight:600 }}>{msg.file_name}</div>
                                  <div style={{ fontSize:10, color:isMine?'rgba(0,0,0,.5)':C.muted }}>{formatBytes(msg.file_size)}</div>
                                </div>
                              </a>
                            )}
                          </div>
                          {/* Timestamp + read receipt */}
                          <div style={{ fontSize:10, color:C.muted, marginTop:3, textAlign:isMine?'right':'left' }}>
                            {formatTime(msg.created_at)}
                            {isMine && <span style={{ marginLeft:4, color:msg.is_read?C.success:C.muted }}>{msg.is_read?'✓✓':'✓'}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef}/>
                </div>

                {/* Input bar — hidden for super admin */}
                {currentUser?.role !== 'super_admin' && (
                  <div style={{ padding:'10px 14px 12px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexShrink:0 }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display:'none' }}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, width:38, height:38, cursor:'pointer', fontSize:18, flexShrink:0 }}>
                      {uploading ? '⏳' : '📎'}
                    </button>
                    <input
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                      placeholder="Message…"
                      style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', color:C.white, fontSize:13, outline:'none' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMsg.trim()}
                      style={{ background:C.gold, border:'none', borderRadius:8, padding:'9px 16px', fontWeight:800, color:C.black, fontSize:13, cursor:'pointer', opacity:newMsg.trim()?1:0.4 }}>
                      Send
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── FILES TAB ────────────────────────────────────── */}
            {tab === 'files' && (
              <div style={{ flex:1, ...S.col, overflow:'hidden' }}>
                {/* Upload button */}
                <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display:'none' }} accept="image/*,.pdf,.doc,.docx"/>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background:C.gold, border:'none', borderRadius:8, padding:'8px 16px', fontWeight:700, color:C.black, fontSize:12, cursor:'pointer' }}>
                    ⬆ Upload File
                  </button>
                  <span style={{ fontSize:11, color:C.muted }}>Photos, PDFs, lab documents</span>
                </div>
                {/* File type filter */}
                <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:6, flexShrink:0 }}>
                  {[['all','All'],['images','📷 Photos'],['documents','📄 Docs'],['labs','🧪 Labs']].map(([k,l]) => (
                    <button key={k} onClick={() => setFileTab(k)}
                      style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${fileTab===k?C.gold:C.border}`, background:fileTab===k?`${C.gold}20`:C.card, color:fileTab===k?C.gold:C.muted, fontSize:11, fontWeight:fileTab===k?700:400, cursor:'pointer' }}>
                      {l}
                    </button>
                  ))}
                </div>
                {/* File grid */}
                <div style={{ flex:1, overflowY:'auto', padding:16 }}>
                  {filteredFiles.length === 0 ? (
                    <div style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13 }}>
                      No files yet. Upload photos or documents using the button above.
                    </div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
                      {filteredFiles.map(f => (
                        <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                          style={{ display:'block', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', textDecoration:'none', transition:'border-color .15s' }}>
                          {f.file_type === 'image' ? (
                            <img src={f.file_url} alt={f.file_name} style={{ width:'100%', height:120, objectFit:'cover', display:'block' }}/>
                          ) : (
                            <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, background:C.surface }}>
                              {fileIcon(f.file_name?.split('.').pop())}
                            </div>
                          )}
                          <div style={{ padding:'8px 10px' }}>
                            <div style={{ fontSize:11, color:C.white, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.file_name}</div>
                            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{formatBytes(f.file_size)}</div>
                            <div style={{ fontSize:10, color:C.muted }}>{formatTime(f.created_at)}</div>
                            <div style={{ fontSize:10, color:C.gold, marginTop:2 }}>{f.uploader?.full_name}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── LOGIN HISTORY / SESSION MONITOR TAB ──────────────── */}
        {tab === 'history' && (
          <div style={{ flex:1, ...S.col, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.white, marginBottom:4 }}>Session Monitor</div>
              <div style={{ fontSize:11, color:C.muted }}>Login history, active sessions, and device tracking</div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {/* Active sessions */}
              {currentUser?.role === 'super_admin' && activeSessions.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>
                    🟢 Currently Active ({activeSessions.length})
                  </div>
                  {activeSessions.map(s => (
                    <div key={s.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${C.success}`, borderRadius:10, padding:'10px 13px', marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:C.white }}>{s.user?.full_name}</div>
                          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.browser} · {s.device_type}</div>
                        </div>
                        <span style={{ fontSize:10, background:`${C.success}22`, color:C.success, padding:'2px 8px', borderRadius:20, fontWeight:700 }}>LIVE</span>
                      </div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>
                        Logged in: {formatTime(s.logged_in_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Login history */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Login History</div>
                {loginHistory.length === 0 ? (
                  <div style={{ textAlign:'center', padding:30, color:C.muted, fontSize:13 }}>No login history yet</div>
                ) : loginHistory.map(s => (
                  <div key={s.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 13px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:12, color:C.white, fontWeight:500 }}>{formatTime(s.logged_in_at)}</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.browser} · {s.device_type}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:10, color:s.is_active?C.success:C.muted, fontWeight:700 }}>
                          {s.is_active ? '🟢 Active' : s.duration_mins ? `${s.duration_mins} min` : 'Logged out'}
                        </div>
                        {s.logged_out_at && (
                          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Out: {formatTime(s.logged_out_at)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!activeConv && tab !== 'history' && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:40 }}>💬</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.white }}>Select a conversation</div>
            <div style={{ fontSize:12, color:C.muted }}>Choose from the list on the left</div>
          </div>
        )}
      </div>
    </div>
  )
}
