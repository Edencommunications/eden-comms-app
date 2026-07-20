// ═══════════════════════════════════════════════════════════════
// Week7.jsx — Team Chat + Huddle + Calendar + Wearables
// Coach-only features — clients have zero access
// Place at: src/components/Week7.jsx in Replit
//
// In App.jsx:
//   import Week7 from './components/Week7'
//   {tab === 'team' && <Week7 currentUser={currentUser} />}
//   Only show 'team' tab for coach and admin roles
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

// Daily.co domain for huddle rooms
const DAILY_DOMAIN = 'edencommunications'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus', role:'coach',       orgId:'b0000000-0000-0000-0000-000000000001' },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',   role:'super_admin', orgId:'b0000000-0000-0000-0000-000000000001' },
}

const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'

// Demo coaches in the org
const DEMO_COACHES = [
  { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',  role:'coach',       isHeadCoach:true },
  { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',    role:'super_admin', isHeadCoach:false },
]

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}

const H = {
  'apikey':SUPABASE_ANON,
  'Authorization':`Bearer ${SUPABASE_ANON}`,
  'Content-Type':'application/json',
  'Prefer':'return=representation',
}

async function dbGet(table, params='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:H })
  if (!r.ok) return []
  return r.json()
}
async function dbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) { console.error('INSERT', table, await r.text()); return null }
  const t = await r.text(); return t ? JSON.parse(t) : null
}
async function dbUpdate(table, params, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return Math.floor(diff/60) + 'm ago'
  if (diff < 86400)return Math.floor(diff/3600) + 'h ago'
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'})
}

function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}

// ── Wearable data mock (real APIs connect via OAuth in production) ──
const OURA_SAMPLE = {
  hrv:48, restingHr:58, sleepScore:82, sleepHours:7.4,
  recoveryScore:null, steps:9840, bodyTemp:97.9,
  date:'2026-07-14', source:'oura',
}
const WHOOP_SAMPLE = {
  hrv:52, restingHr:56, sleepScore:78, sleepHours:7.1,
  recoveryScore:71, steps:null, bodyTemp:null,
  date:'2026-07-14', source:'whoop',
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Only renders for coach and admin — blocked for clients in App.jsx
// ════════════════════════════════════════════════════════════════
export default function Week7({currentUser}) {
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'coach',name:'User',uuid:null,orgId:EDEN_ORG_ID}
  const myUUID  = info.uuid
  const myName  = info.name
  const myRole  = info.role
  const isAdmin = myRole==='super_admin'
  const orgId   = info.orgId||EDEN_ORG_ID

  // Safety block — clients should never reach this component
  if (myRole==='client') {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:C.black}}>
        <div style={{textAlign:'center',color:C.muted,fontSize:13}}>This area is not available.</div>
      </div>
    )
  }

  const [tab, setTab] = useState('chat')

  // ── Team Chat state ────────────────────────────────────────
  const [messages,      setMessages]      = useState([
    {id:'m1', senderId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', senderName:'Coach Marcus', senderRole:'coach', content:'Good morning team! New client Jordan just submitted her first check-in. Results looking great.', threadId:null, replyCount:2, createdAt: new Date(Date.now()-7200000).toISOString(), isDm:false},
    {id:'m2', senderId:'00000000-0000-0000-0000-000000000001', senderName:'Eden Admin', senderRole:'super_admin', content:'Reminder: Team call Thursday at 10 AM CST. Link in the calendar.', threadId:null, replyCount:0, createdAt: new Date(Date.now()-3600000).toISOString(), isDm:false},
  ])
  const [threadReplies, setThreadReplies] = useState({
    'm1':[
      {id:'r1', senderId:'00000000-0000-0000-0000-000000000001', senderName:'Eden Admin', senderRole:'super_admin', content:'That is great to hear! What protocol did you put her on?', threadId:'m1', createdAt: new Date(Date.now()-3000000).toISOString()},
      {id:'r2', senderId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', senderName:'Coach Marcus', senderRole:'coach', content:'Base Diet Protocol Male, starting with 5R gut protocol for supplements.', threadId:'m1', createdAt: new Date(Date.now()-1800000).toISOString()},
    ]
  })
  const [newMessage,    setNewMessage]    = useState('')
  const [activeThread,  setActiveThread]  = useState(null) // message object
  const [newReply,      setNewReply]      = useState('')
  const [dmTarget,      setDmTarget]      = useState(null) // coach object
  const [dmMessages,    setDmMessages]    = useState({})
  const [newDm,         setNewDm]         = useState('')
  const [chatView,      setChatView]      = useState('main') // main | thread | dm
  const [showDmPicker,  setShowDmPicker]  = useState(false)
  const bottomRef = useRef(null)
  const dmBottomRef = useRef(null)

  // ── Calendar state ─────────────────────────────────────────
  const [calendarUrl,  setCalendarUrl]  = useState('https://calendar.google.com/calendar/embed?src=lifestyleofeden%40gmail.com&ctz=America%2FChicago')
  const [editingCal,   setEditingCal]   = useState(false)
  const [tempCalUrl,   setTempCalUrl]   = useState('')
  const [calSaved,     setCalSaved]     = useState(false)

  // ── Huddle state ───────────────────────────────────────────
  const [huddleActive,   setHuddleActive]   = useState(false)
  const [huddleRoomUrl,  setHuddleRoomUrl]  = useState('')
  const [huddleInviting, setHuddleInviting] = useState(false)
  const [huddlePinging,  setHuddlePinging]  = useState(null)

  // ── Wearables state ────────────────────────────────────────
  const [wearableView, setWearableView] = useState('overview')
  const [ouConnected,  setOuConnected]  = useState(false)
  const [whConnected,  setWhConnected]  = useState(false)
  const [ouData,       setOuData]       = useState(null)
  const [whData,       setWhData]       = useState(null)
  const [connecting,   setConnecting]   = useState(null)

  // Load calendar URL from Supabase on mount
  useEffect(()=>{
    if (myUUID) loadCalendarUrl()
  },[myUUID])

  useEffect(()=>{
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),80)
  },[messages])

  async function loadCalendarUrl() {
    const data = await dbGet('coach_settings',`user_id=eq.${myUUID}`)
    if (data?.[0]?.calendar_url) setCalendarUrl(data[0].calendar_url)
  }

  async function saveCalendarUrl() {
    if (!tempCalUrl.trim()) return
    await fetch(`${SUPABASE_URL}/rest/v1/coach_settings`,{
      method:'POST',
      headers:{...H,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({user_id:myUUID, org_id:orgId, calendar_url:tempCalUrl.trim(), updated_at:new Date().toISOString()}),
    })
    setCalendarUrl(tempCalUrl.trim())
    setTempCalUrl('')
    setEditingCal(false)
    setCalSaved(true)
    setTimeout(()=>setCalSaved(false),3000)
  }

  // ── Send message to main channel ──────────────────────────
  function sendMessage() {
    if (!newMessage.trim()) return
    const msg = {
      id:          'm'+Date.now(),
      senderId:    myUUID,
      senderName:  myName,
      senderRole:  myRole,
      content:     newMessage.trim(),
      threadId:    null,
      replyCount:  0,
      createdAt:   new Date().toISOString(),
      isDm:        false,
    }
    setMessages(prev=>[...prev,msg])
    setNewMessage('')
    // Save to Supabase
    dbInsert('team_messages',{
      channel_id:  null, // set channel_id from actual channel in production
      org_id:      orgId,
      sender_id:   myUUID,
      sender_name: myName,
      sender_role: myRole,
      content:     msg.content,
      thread_id:   null,
      is_dm:       false,
    })
  }

  // ── Reply inside a thread ─────────────────────────────────
  function sendReply() {
    if (!newReply.trim()||!activeThread) return
    const reply = {
      id:         'r'+Date.now(),
      senderId:   myUUID,
      senderName: myName,
      senderRole: myRole,
      content:    newReply.trim(),
      threadId:   activeThread.id,
      createdAt:  new Date().toISOString(),
    }
    setThreadReplies(prev=>({
      ...prev,
      [activeThread.id]:[...(prev[activeThread.id]||[]),reply]
    }))
    setMessages(prev=>prev.map(m=>m.id===activeThread.id?{...m,replyCount:(m.replyCount||0)+1}:m))
    setNewReply('')
    dbInsert('team_messages',{
      org_id:      orgId,
      sender_id:   myUUID,
      sender_name: myName,
      sender_role: myRole,
      content:     reply.content,
      thread_id:   activeThread.id,
      is_dm:       false,
    })
  }

  // ── Send DM ───────────────────────────────────────────────
  function sendDm() {
    if (!newDm.trim()||!dmTarget) return
    const key = [myUUID,dmTarget.uuid].sort().join('_')
    const msg = {
      id:         'dm'+Date.now(),
      senderId:   myUUID,
      senderName: myName,
      content:    newDm.trim(),
      createdAt:  new Date().toISOString(),
    }
    setDmMessages(prev=>({...prev,[key]:[...(prev[key]||[]),msg]}))
    setNewDm('')
    dbInsert('team_messages',{
      org_id:      orgId,
      sender_id:   myUUID,
      sender_name: myName,
      content:     msg.content,
      is_dm:       true,
      dm_to_id:    dmTarget.uuid,
      dm_to_name:  dmTarget.name,
    })
  }

  // ── Start huddle ──────────────────────────────────────────
  async function startHuddle() {
    // In production this calls Daily.co API to create a room
    // For now we use a deterministic room URL per org
    const roomName = `eden-${orgId.slice(0,8)}-${Date.now()}`
    const roomUrl  = `https://${DAILY_DOMAIN}.daily.co/${roomName}`
    setHuddleRoomUrl(roomUrl)
    setHuddleActive(true)
    await dbInsert('huddle_rooms',{
      org_id:       orgId,
      room_url:     roomUrl,
      created_by:   myUUID,
      creator_name: myName,
      is_active:    true,
    })
  }

  function endHuddle() {
    setHuddleActive(false)
    setHuddleRoomUrl('')
    setHuddlePinging(null)
  }

  function pingCoach(coach) {
    setHuddlePinging(coach.name)
    // In production this fires a notification to that coach
    setTimeout(()=>setHuddlePinging(null),3000)
  }

  // ── Connect wearable (OAuth flow stub) ────────────────────
  async function connectWearable(device) {
    setConnecting(device)
    // In production: redirect to OAuth flow for Oura/Whoop
    // For demo: simulate connection after 1.5s
    await new Promise(r=>setTimeout(r,1500))
    if (device==='oura') {
      setOuConnected(true)
      setOuData(OURA_SAMPLE)
      await dbInsert('wearable_connections',{
        client_id:      myUUID,
        oura_connected: true,
        last_synced:    new Date().toISOString(),
      })
    }
    if (device==='whoop') {
      setWhConnected(true)
      setWhData(WHOOP_SAMPLE)
    }
    setConnecting(null)
  }

  const dmKey = dmTarget ? [myUUID,dmTarget.uuid].sort().join('_') : null
  const dmConvo = dmKey ? (dmMessages[dmKey]||[]) : []
  const otherCoaches = DEMO_COACHES.filter(c=>c.uuid!==myUUID)

  const TABS = [
    ['chat',     '💬 Team Chat'],
    ['calendar', '📅 Calendar'],
    ['huddle',   '🎙 Huddle'],
    ['wearables','⌚ Wearables'],
  ]

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden'}}>

      {/* Tab bar */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>Team Hub</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>Coaches only — clients cannot see this area</div>
        </div>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'13px 12px',background:'none',border:'none',borderBottom:`2px solid ${tab===k?C.gold:'transparent'}`,color:tab===k?C.gold:C.muted,fontSize:11,fontWeight:tab===k?700:400,cursor:'pointer',whiteSpace:'nowrap',position:'relative'}}>
            {l}
            {k==='huddle'&&huddleActive&&(
              <span style={{position:'absolute',top:8,right:6,width:8,height:8,borderRadius:4,background:C.success,border:`2px solid ${C.black}`}}/>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TEAM CHAT
      ══════════════════════════════════════════════════════ */}
      {tab==='chat'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Left: sidebar */}
          <div style={{width:200,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            {/* Channels */}
            <div style={{padding:'12px 14px 6px'}}>
              <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Channels</div>
              <button onClick={()=>setChatView('main')}
                style={{width:'100%',textAlign:'left',background:chatView==='main'?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:chatView==='main'?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <span style={{color:C.muted}}>#</span> general
              </button>
            </div>

            {/* Direct messages */}
            <div style={{padding:'10px 14px 6px'}}>
              <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                Direct Messages
                <button onClick={()=>setShowDmPicker(true)}
                  style={{background:'none',border:'none',color:C.gold,fontSize:14,cursor:'pointer',padding:0,lineHeight:1}}>+</button>
              </div>
              {otherCoaches.map(coach=>{
                const key=[myUUID,coach.uuid].sort().join('_')
                const hasMessages=(dmMessages[key]||[]).length>0
                const isDmActive=chatView==='dm'&&dmTarget?.uuid===coach.uuid
                return (
                  <button key={coach.uuid}
                    onClick={()=>{setDmTarget(coach);setChatView('dm')}}
                    style={{width:'100%',textAlign:'left',background:isDmActive?`${C.gold}15`:C.surface,border:'none',borderRadius:6,padding:'6px 8px',color:isDmActive?C.gold:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                    <div style={{width:20,height:20,borderRadius:10,background:`${C.gold}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.gold,flexShrink:0}}>
                      {coach.name[0]}
                    </div>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{coach.name.split(' ')[0]}</span>
                    {coach.isHeadCoach&&<span style={{fontSize:8,color:C.gold,fontWeight:700,flexShrink:0}}>HC</span>}
                  </button>
                )
              })}
            </div>

            {/* Huddle quick start */}
            <div style={{marginTop:'auto',padding:'12px 14px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setTab('huddle')}
                style={{width:'100%',background:huddleActive?`${C.success}22`:`${C.gold}22`,border:`1px solid ${huddleActive?C.success:C.gold}44`,borderRadius:8,padding:'8px 10px',color:huddleActive?C.success:C.gold,fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                {huddleActive?<><span style={{width:8,height:8,borderRadius:4,background:C.success,display:'inline-block'}}/> In Huddle</>:'🎙 Start Huddle'}
              </button>
            </div>
          </div>

          {/* Right: main channel */}
          {chatView==='main'&&(
            <div style={{flex:1,display:'flex',overflow:'hidden'}}>
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.white}}># general</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>Main channel for all Lifestyle of Eden coaches · {DEMO_COACHES.length} members</div>
                </div>

                {/* Messages */}
                <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                  {messages.filter(m=>!m.isDm).map(msg=>{
                    const isMine = msg.senderId===myUUID
                    const replies = threadReplies[msg.id]||[]
                    return (
                      <div key={msg.id} style={{marginBottom:16,display:'flex',gap:10,alignItems:'flex-start'}}>
                        {/* Avatar */}
                        <div style={{width:34,height:34,borderRadius:8,background:isMine?C.gold:`${C.gold}22`,border:`1px solid ${C.gold}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:isMine?C.black:C.gold,flexShrink:0,marginTop:2}}>
                          {msg.senderName[0]}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          {/* Header */}
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:13,fontWeight:700,color:isMine?C.gold:C.white}}>{msg.senderName}</span>
                            {msg.senderRole==='super_admin'&&<span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'1px 5px',borderRadius:4,fontWeight:700}}>ADMIN</span>}
                            <span style={{fontSize:10,color:C.muted}}>{timeAgo(msg.createdAt)}</span>
                          </div>
                          {/* Content */}
                          <div style={{fontSize:13,color:C.white,lineHeight:1.5,background:C.card,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                            {msg.content}
                          </div>
                          {/* Thread button */}
                          <div style={{display:'flex',gap:8,marginTop:5,alignItems:'center'}}>
                            <button onClick={()=>{setActiveThread(msg);setChatView('thread')}}
                              style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4,fontWeight:msg.replyCount>0?600:400}}>
                              {msg.replyCount>0?(
                                <>
                                  <div style={{display:'flex',gap:-4}}>
                                    {(threadReplies[msg.id]||[]).slice(0,3).map((r,i)=>(
                                      <div key={i} style={{width:18,height:18,borderRadius:9,background:`${C.gold}33`,border:`1px solid ${C.black}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:C.gold,marginLeft:i>0?-6:0}}>
                                        {r.senderName[0]}
                                      </div>
                                    ))}
                                  </div>
                                  <span style={{color:C.gold}}>{msg.replyCount} {msg.replyCount===1?'reply':'replies'}</span>
                                </>
                              ):(
                                <span style={{color:C.muted}}>💬 Reply in thread</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef}/>
                </div>

                {/* Input */}
                <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input value={newMessage} onChange={e=>setNewMessage(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage())}
                      placeholder="Message #general… (Enter to send)"
                      style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                    <button onClick={sendMessage} disabled={!newMessage.trim()}
                      style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newMessage.trim()?1:.4}}>
                      Send
                    </button>
                  </div>
                </div>
              </div>

              {/* Thread panel — shows when thread is open */}
              {activeThread&&chatView==='thread'&&(
                <div style={{width:340,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={()=>setChatView('main')}
                      style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.white}}>Thread</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>{(threadReplies[activeThread.id]||[]).length} replies</div>
                    </div>
                  </div>

                  {/* Original message */}
                  <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                      <div style={{width:30,height:30,borderRadius:6,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.gold,flexShrink:0}}>
                        {activeThread.senderName[0]}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.white}}>{activeThread.senderName}</span>
                          <span style={{fontSize:10,color:C.muted}}>{timeAgo(activeThread.createdAt)}</span>
                        </div>
                        <div style={{fontSize:12,color:C.white,lineHeight:1.5}}>{activeThread.content}</div>
                      </div>
                    </div>
                  </div>

                  {/* Replies */}
                  <div style={{flex:1,overflowY:'auto',padding:'8px 14px'}}>
                    {(threadReplies[activeThread.id]||[]).map(r=>{
                      const isMine=r.senderId===myUUID
                      return (
                        <div key={r.id} style={{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start'}}>
                          <div style={{width:28,height:28,borderRadius:6,background:isMine?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:isMine?C.black:C.gold,flexShrink:0}}>
                            {r.senderName[0]}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}>
                              <span style={{fontSize:11,fontWeight:700,color:isMine?C.gold:C.white}}>{r.senderName}</span>
                              <span style={{fontSize:9,color:C.muted}}>{timeAgo(r.createdAt)}</span>
                            </div>
                            <div style={{fontSize:12,color:C.white,lineHeight:1.5,background:C.card,borderRadius:7,padding:'8px 10px',border:`1px solid ${C.border}`}}>{r.content}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Reply input */}
                  <div style={{padding:'10px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{display:'flex',gap:8}}>
                      <input value={newReply} onChange={e=>setNewReply(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendReply())}
                        placeholder="Reply in thread…"
                        style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                      <button onClick={sendReply} disabled={!newReply.trim()}
                        style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 12px',fontWeight:800,color:C.black,fontSize:12,cursor:'pointer',opacity:newReply.trim()?1:.4}}>
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DM view */}
          {chatView==='dm'&&dmTarget&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setChatView('main')}
                  style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:0}}>←</button>
                <div style={{width:30,height:30,borderRadius:15,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.gold,flexShrink:0}}>
                  {dmTarget.name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.white}}>{dmTarget.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                    {dmTarget.role}{dmTarget.isHeadCoach?' · Head Coach':''}
                  </div>
                </div>
                <button onClick={()=>{setHuddleActive(true);startHuddle()}}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  🎙 Huddle
                </button>
              </div>

              <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                {dmConvo.length===0&&(
                  <div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>
                    Start your conversation with {dmTarget.name}
                  </div>
                )}
                {dmConvo.map(msg=>{
                  const isMine=msg.senderId===myUUID
                  return (
                    <div key={msg.id} style={{display:'flex',justifyContent:isMine?'flex-end':'flex-start',marginBottom:10}}>
                      <div style={{maxWidth:'72%'}}>
                        <div style={{background:isMine?C.gold:C.card,border:isMine?'none':`1px solid ${C.border}`,borderRadius:12,padding:'10px 13px'}}>
                          <div style={{fontSize:13,color:isMine?C.black:C.white,lineHeight:1.5}}>{msg.content}</div>
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginTop:3,textAlign:isMine?'right':'left'}}>{timeAgo(msg.createdAt)}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={dmBottomRef}/>
              </div>

              <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',gap:8}}>
                <input value={newDm} onChange={e=>setNewDm(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendDm())}
                  placeholder={`Message ${dmTarget.name.split(' ')[0]}…`}
                  style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 13px',color:C.white,fontSize:13,outline:'none'}}/>
                <button onClick={sendDm} disabled={!newDm.trim()}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'10px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newDm.trim()?1:.4}}>
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CALENDAR
      ══════════════════════════════════════════════════════ */}
      {tab==='calendar'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white}}>My Calendar</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                Your Google Calendar — team meetings, client calls, personal events
              </div>
            </div>

            {/* Calendar URL management */}
            {!editingCal?(
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {calSaved&&<span style={{fontSize:10,color:C.success,fontWeight:700}}>✓ Saved</span>}
                <button onClick={()=>{setEditingCal(true);setTempCalUrl(calendarUrl)}}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 12px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                  ✏️ Update Calendar URL
                </button>
              </div>
            ):(
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input value={tempCalUrl} onChange={e=>setTempCalUrl(e.target.value)}
                  placeholder="Paste Google Calendar embed URL…"
                  style={{width:280,background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',color:C.white,fontSize:11,outline:'none'}}/>
                <button onClick={saveCalendarUrl}
                  style={{background:C.gold,border:'none',borderRadius:7,padding:'6px 12px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>
                  Save
                </button>
                <button onClick={()=>{setEditingCal(false);setTempCalUrl('')}}
                  style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* How to get embed URL instructions */}
          {!calendarUrl&&(
            <div style={{margin:16,background:`${C.gold}12`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>How to add your Google Calendar</div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
                1. Go to calendar.google.com<br/>
                2. Click the ⚙️ Settings gear → Settings<br/>
                3. Click your calendar name on the left<br/>
                4. Scroll down to "Integrate calendar"<br/>
                5. Copy the "Public URL to this calendar" link<br/>
                6. Paste it above and click Save
              </div>
            </div>
          )}

          {/* Calendar embed */}
          {calendarUrl&&(
            <div style={{flex:1,overflow:'hidden',position:'relative'}}>
              <iframe
                src={calendarUrl}
                style={{width:'100%',height:'100%',border:'none'}}
                title="My Google Calendar"
                allow="camera; microphone; autoplay; encrypted-media"
              />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          HUDDLE
      ══════════════════════════════════════════════════════ */}
      {tab==='huddle'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {!huddleActive?(
            <>
              <div style={{textAlign:'center',padding:'40px 20px'}}>
                <div style={{fontSize:48,marginBottom:16}}>🎙</div>
                <div style={{fontSize:18,fontWeight:700,color:C.white,marginBottom:8}}>Start a Huddle</div>
                <div style={{fontSize:13,color:C.muted,maxWidth:320,margin:'0 auto 24px',lineHeight:1.6}}>
                  Instant face-to-face call with your team. One click to start, one click to join. No scheduling needed.
                </div>
                <button onClick={startHuddle}
                  style={{background:C.gold,border:'none',borderRadius:12,padding:'14px 32px',fontWeight:800,color:C.black,fontSize:16,cursor:'pointer'}}>
                  🎙 Start Huddle Now
                </button>
              </div>

              {/* Who you can huddle with */}
              <Card sx={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:12}}>Your Team</div>
                {otherCoaches.map(coach=>(
                  <div key={coach.uuid} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                    <div style={{width:36,height:36,borderRadius:18,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>
                      {coach.name[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:C.white,fontWeight:500}}>{coach.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                        {coach.role}{coach.isHeadCoach?' · Head Coach':''}
                      </div>
                    </div>
                    <button onClick={()=>{startHuddle();setHuddlePinging(coach.name)}}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      Invite
                    </button>
                  </div>
                ))}
              </Card>
            </>
          ):(
            <>
              {/* Active huddle */}
              <div style={{background:`${C.success}15`,border:`1px solid ${C.success}44`,borderRadius:12,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:12,height:12,borderRadius:6,background:C.success,animation:'pulse 1.5s infinite'}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.success}}>Huddle Active</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>You are in a live huddle room</div>
                </div>
                <button onClick={endHuddle}
                  style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:8,padding:'6px 14px',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  End Huddle
                </button>
              </div>

              {/* Invite others */}
              <Card sx={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:12}}>Invite to Huddle</div>
                {otherCoaches.map(coach=>(
                  <div key={coach.uuid} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderTop:`1px solid ${C.border}`}}>
                    <div style={{width:32,height:32,borderRadius:16,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.gold,flexShrink:0}}>
                      {coach.name[0]}
                    </div>
                    <div style={{flex:1,fontSize:12,color:C.white}}>{coach.name}</div>
                    <button onClick={()=>pingCoach(coach)}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'5px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      {huddlePinging===coach.name?'Pinging…':'Ping to Join'}
                    </button>
                  </div>
                ))}
              </Card>

              {/* Embedded video call */}
              <Card sx={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Video Call Room</div>
                <div style={{background:C.surface,borderRadius:10,overflow:'hidden',position:'relative',paddingTop:'56.25%'}}>
                  <iframe
                    src={huddleRoomUrl}
                    style={{position:'absolute',inset:0,width:'100%',height:'100%',border:'none'}}
                    allow="camera; microphone; autoplay; fullscreen"
                    title="Huddle Room"
                  />
                </div>
                <div style={{marginTop:10,fontSize:10,color:C.muted,textAlign:'center'}}>
                  Room link: <span style={{color:C.gold}}>{huddleRoomUrl}</span>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          WEARABLES
      ══════════════════════════════════════════════════════ */}
      {tab==='wearables'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.5}}>
            Connect your wearable devices to pull health data automatically into client check-ins. Coaches see this data in the client profile.
          </div>

          {/* Oura Ring */}
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:ouConnected?14:0}}>
              <div style={{width:44,height:44,borderRadius:22,background:'#1a1a2e',border:`2px solid ${ouConnected?C.success:'#444'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                💍
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.white}}>Oura Ring</div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>HRV · Sleep Score · Resting Heart Rate · Body Temp · Steps</div>
              </div>
              {ouConnected?(
                <span style={{fontSize:10,background:`${C.success}22`,color:C.success,padding:'3px 9px',borderRadius:10,fontWeight:700,flexShrink:0}}>✓ Connected</span>
              ):(
                <button onClick={()=>connectWearable('oura')} disabled={connecting==='oura'}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',opacity:connecting==='oura'?.6:1,flexShrink:0}}>
                  {connecting==='oura'?'Connecting…':'Connect'}
                </button>
              )}
            </div>

            {ouConnected&&ouData&&(
              <>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Latest Data — {ouData.date}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8}}>
                  {[
                    ['HRV',        ouData.hrv,           'ms',   '#4FD89A'],
                    ['Resting HR', ouData.restingHr,     'bpm',  '#f06060'],
                    ['Sleep Score',ouData.sleepScore,    '/100', '#6FB8E8'],
                    ['Sleep',      ouData.sleepHours,    'hrs',  '#D4A8F0'],
                    ['Steps',      ouData.steps?.toLocaleString(),'','#ffa600'],
                    ['Body Temp',  ouData.bodyTemp,      '°F',   '#E8B86D'],
                  ].map(([l,v,u,col])=>(
                    <div key={l} style={{background:C.surface,borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:800,color:col}}>{v}{u}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:3}}>{l}</div>
                    </div>
                  ))}
                </div>
                <button style={{width:'100%',marginTop:12,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'8px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  ↻ Sync Latest Data
                </button>
                <div style={{marginTop:10,padding:'8px 10px',background:`${C.success}11`,border:`1px solid ${C.success}33`,borderRadius:8,fontSize:10,color:C.success}}>
                  ✓ Data will auto-fill your weekly check-in fields on check-in day
                </div>
              </>
            )}
          </Card>

          {/* Whoop */}
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:whConnected?14:0}}>
              <div style={{width:44,height:44,borderRadius:10,background:'#0d0d0d',border:`2px solid ${whConnected?C.success:'#444'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                ⌚
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.white}}>Whoop</div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>HRV · Recovery Score · Sleep · Resting Heart Rate</div>
              </div>
              {whConnected?(
                <span style={{fontSize:10,background:`${C.success}22`,color:C.success,padding:'3px 9px',borderRadius:10,fontWeight:700,flexShrink:0}}>✓ Connected</span>
              ):(
                <button onClick={()=>connectWearable('whoop')} disabled={connecting==='whoop'}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',opacity:connecting==='whoop'?.6:1,flexShrink:0}}>
                  {connecting==='whoop'?'Connecting…':'Connect'}
                </button>
              )}
            </div>

            {whConnected&&whData&&(
              <>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Latest Data — {whData.date}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8}}>
                  {[
                    ['HRV',          whData.hrv,           'ms',   '#4FD89A'],
                    ['Recovery',     whData.recoveryScore, '%',    whData.recoveryScore>=67?'#4FD89A':whData.recoveryScore>=34?'#ffa600':'#f06060'],
                    ['Resting HR',   whData.restingHr,     'bpm',  '#f06060'],
                    ['Sleep Score',  whData.sleepScore,    '/100', '#6FB8E8'],
                    ['Sleep',        whData.sleepHours,    'hrs',  '#D4A8F0'],
                  ].map(([l,v,u,col])=>(
                    <div key={l} style={{background:C.surface,borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:800,color:col}}>{v}{u}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:3}}>{l}</div>
                    </div>
                  ))}
                </div>
                <button style={{width:'100%',marginTop:12,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'8px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  ↻ Sync Latest Data
                </button>
                <div style={{marginTop:10,padding:'8px 10px',background:`${C.success}11`,border:`1px solid ${C.success}33`,borderRadius:8,fontSize:10,color:C.success}}>
                  ✓ Data will auto-fill your weekly check-in fields on check-in day
                </div>
              </>
            )}
          </Card>

          {/* Apple Watch — coming soon */}
          <Card sx={{marginBottom:20,opacity:.6}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:10,background:'#1a1a1a',border:`2px solid #333`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                🍎
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.muted}}>Apple Watch / Apple Health</div>
                <div style={{fontSize:11,color:C.dim,marginTop:1}}>Requires the Eden Communications mobile app · Coming in a future update</div>
              </div>
              <span style={{fontSize:10,background:`${C.dim}44`,color:C.muted,padding:'3px 9px',borderRadius:10,fontWeight:700,flexShrink:0}}>Soon</span>
            </div>
          </Card>
        </div>
      )}

      {/* ── DM Picker Modal ───────────────────────────────── */}
      {showDmPicker&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowDmPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,width:'100%',maxWidth:360,padding:20}}>
            <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:14}}>Start a Direct Message</div>
            {otherCoaches.map(coach=>(
              <button key={coach.uuid}
                onClick={()=>{setDmTarget(coach);setChatView('dm');setShowDmPicker(false)}}
                style={{width:'100%',textAlign:'left',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:18,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>
                  {coach.name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:C.white,fontWeight:500}}>{coach.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                    {coach.role}{coach.isHeadCoach?' · Head Coach':''}
                  </div>
                </div>
                <span style={{fontSize:12,color:C.gold}}>→</span>
              </button>
            ))}
            <button onClick={()=>setShowDmPicker(false)}
              style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer',marginTop:4}}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
