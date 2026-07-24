// ═══════════════════════════════════════════════════════════════
// Week6.jsx — Admin Panel + Consultation + Check-In Counter
//             + White-Label Org Management
// Place at: src/components/Week6.jsx in Replit
//
// In App.jsx:
//   import Week6 from './components/Week6'
//   {tab === 'admin' && <Week6 currentUser={currentUser} />}
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',    role:'coach',       coachId:null },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Jordan Williams', role:'client',      coachId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051' },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',      role:'super_admin', coachId:null },
}

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
async function dbDelete(table, params) {
  try { await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{method:'DELETE',headers:SB_H}) } catch {}
}
async function dbUpdate(table, params, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) console.error('UPDATE', await r.text())
}

// ── Demo data (Week 6 — replace with real DB calls once auth live) ──
const DEMO_COACHES = [
  { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',  email:'coach@eden.io',   role:'coach',  checkInDay:'Wednesday', clientCount:1, active:true },
]
const DEMO_CLIENTS = [
  { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Jordan Williams', email:'client@eden.io',  role:'client', coachId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', coachName:'Coach Marcus', checkInDay:'Wednesday', hasUpdate:true, lastSeen:'Jul 19 2026', active:true },
  { uuid:'bbbbbbbb-0000-0000-0000-000000000002', name:'Alex Carter',      email:'alex@eden.io',    role:'client', coachId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', coachName:'Coach Marcus', checkInDay:'Wednesday', hasUpdate:true, lastSeen:'Jul 19 2026', active:true },
]
const DEMO_ORGS = [
  { id:'b0000000-0000-0000-0000-000000000001', name:'Lifestyle of Eden', slug:'eden', isWhiteLabel:false, plan:'Platform Owner', coachCount:1, clientCount:1, active:true, brandColor:'#ffa600' },
]

const CHECK_IN_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const CALL_TYPES = ['Monthly Check-In','Intake / Onboarding','Lab Review','Therapy / Support','Strategy Call','Emergency Call','Other']

// ── Mini UI ───────────────────────────────────────────────────
function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}
function Lbl({t}) {
  return <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',margin:'13px 0 7px'}}>{t}</div>
}
function Inp({label,value,onChange,type='text',placeholder,disabled=false}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <input type={type} value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{width:'100%',background:disabled?C.dim:C.surface,border:`1px solid ${disabled?C.dim:C.border}`,borderRadius:8,padding:'9px 12px',color:disabled?C.muted:C.white,fontSize:13,outline:'none',boxSizing:'border-box',cursor:disabled?'not-allowed':'text'}}/>
    </div>
  )
}
function Sel({label,value,onChange,options}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none'}}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
function Stat({label,value,color=C.gold,sub}) {
  return (
    <div style={{background:C.surface,borderRadius:10,padding:'14px 16px',flex:1,minWidth:120}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
      <div style={{fontSize:26,fontWeight:800,color}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function Week6({currentUser, onNavigate, initialClient}) {
  const email    = currentUser?.email||''
  const info     = KNOWN_USERS[email]||{role:'client',name:'User',uuid:null}
  const myUUID   = info.uuid
  const isAdmin  = info.role==='super_admin'
  const isCoach  = info.role==='coach'
  const isClient = info.role==='client'

  const [tab, setTab] = useState(isAdmin?'dashboard':isCoach?'clients':'consultation')

  // ── Client list state ─────────────────────────────────────
  const [clients,        setClients]        = useState(DEMO_CLIENTS)
  const [selectedClient, setSelectedClient] = useState(initialClient||null)
  const [clientSearch,   setClientSearch]   = useState('')
  const [filterCoach,    setFilterCoach]    = useState('All Coaches')

  // ── Check-in counter ──────────────────────────────────────
  const todayDay = new Date().toLocaleDateString('en-US',{weekday:'long'})
  const isCheckInDay = clients.some(c=>c.checkInDay===todayDay)
  const pendingUpdates = clients.filter(c=>c.hasUpdate).length
  const totalClients   = clients.length

  // ── Consultation state ────────────────────────────────────
  const [intake, setIntake] = useState({
    notes:'', startDate:'', startWeight:'',
  })
  const setI = k=>v=>setIntake(p=>({...p,[k]:v}))

  const [callNotes, setCallNotes] = useState([
    {id:1, callDate:'2026-07-14', callType:'Monthly Check-In', summary:'Jordan is progressing well. Sleep improved significantly. Step goal being hit 6/7 days. Energy up, bloating down from 7 to 4.', focusPoints:'Increase protein in Meal 3. Add cold shower habit. Continue current supplement protocol.', actionItems:'Adjust Meal 3 protein to 5.5oz. Submit labs by July 18.', nextCallDate:'2026-08-11'},
  ])
  const [showNewCall,   setShowNewCall]   = useState(false)
  const [newCall, setNewCall] = useState({
    callDate: new Date().toISOString().slice(0,10),
    callType:'Monthly Check-In', summary:'', focusPoints:'', actionItems:'', nextCallDate:'', loomUrl:'',
  })
  const setNC = k=>v=>setNewCall(p=>({...p,[k]:v}))

  // ── Add new user ──────────────────────────────────────────
  const [showNewUser,  setShowNewUser]  = useState(false)
  const [newUser, setNewUser] = useState({
    name:'', email:'', role:'client', coachId:'', checkInDay:'Wednesday',
  })
  const setNU = k=>v=>setNewUser(p=>({...p,[k]:v}))

  // ── White-label org ───────────────────────────────────────
  const [orgs,       setOrgs]       = useState(DEMO_ORGS)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [newOrg, setNewOrg] = useState({
    name:'', slug:'', brandColor:'#ffa600', calendarUrl:'',
    billingEmail:'', plan:'standard',
  })
  const setNO = k=>v=>setNewOrg(p=>({...p,[k]:v}))

  // ── Admin org context (loaded from Supabase) ─────────────
  const [adminCompanyId,  setAdminCompanyId]  = useState(null)
  const [adminProfileId,  setAdminProfileId]  = useState(null)
  const [lastAdded,       setLastAdded]       = useState(null) // shows setup card after addUser

  // ── Admin Documents ───────────────────────────────────────
  const [adminDocs,   setAdminDocs]   = useState([])
  const [showAddDoc,  setShowAddDoc]  = useState(false)
  const [newDoc,      setNewDoc]      = useState({doc_type:'note',title:'',content:'',file_url:''})

  useEffect(()=>{
    if (!isAdmin) return
    dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=id,company_id`)
      .then(rows=>{
        if (Array.isArray(rows)&&rows[0]) {
          setAdminCompanyId(rows[0].company_id||null)
          setAdminProfileId(rows[0].id||null)
        }
      }).catch(()=>{})
  },[email])

  // Load admin docs when selected client changes
  useEffect(()=>{
    if (!selectedClient?.uuid){ setAdminDocs([]); return }
    dbGet('client_documents',`client_id=eq.${selectedClient.uuid}&order=created_at.desc`)
      .then(rows=>setAdminDocs(Array.isArray(rows)?rows:[]))
      .catch(()=>{})
  },[selectedClient?.uuid])

  const docTypeIcon = t=>({lab:'🧪',form:'📋',note:'📝',document:'📄'}[t]||'📄')

  async function addAdminDoc() {
    if (!newDoc.title.trim()||!selectedClient?.uuid) return
    const result = await dbInsert('client_documents',{
      client_id:     selectedClient.uuid,
      company_id:    adminCompanyId||null,
      added_by_id:   adminProfileId||null,
      added_by_name: info.name,
      doc_type:      newDoc.doc_type,
      title:         newDoc.title.trim(),
      content:       newDoc.content.trim()||null,
      file_url:      newDoc.file_url.trim()||null,
    })
    const inserted = Array.isArray(result)?result[0]:result
    if (inserted) setAdminDocs(prev=>[inserted,...prev])
    setNewDoc({doc_type:'note',title:'',content:'',file_url:''})
    setShowAddDoc(false)
  }

  async function deleteAdminDoc(id) {
    await dbDelete('client_documents',`id=eq.${id}`)
    setAdminDocs(prev=>prev.filter(d=>d.id!==id))
  }

  // ── Audit log ─────────────────────────────────────────────
  const [auditLog, setAuditLog] = useState([
    {id:1,actor:'Eden Admin',action:'Granted course access',target:'Jordan Williams',detail:'The Mind Of A CEO',time:'Jul 14 2026 9:02 AM'},
    {id:2,actor:'Coach Marcus',action:'Saved diet plan',target:'Jordan Williams',detail:'Base Diet Protocol Male',time:'Jul 13 2026 3:44 PM'},
    {id:3,actor:'Jordan Williams',action:'Submitted check-in',target:'Self',detail:'Week of Jul 13',time:'Jul 13 2026 7:58 AM'},
  ])

  function markViewed(clientId) {
    setClients(prev=>prev.map(c=>c.uuid===clientId?{...c,hasUpdate:false}:c))
    setSelectedClient(prev=>prev?.uuid===clientId?{...prev,hasUpdate:false}:prev)
  }

  function openClient(client) {
    setSelectedClient(client)
    if (client.hasUpdate) markViewed(client.uuid)
    // Load saved update_day from DB and sync into local state
    dbGet('user_profiles', `id=eq.${client.uuid}&select=update_day`)
      .then(rows => {
        if (Array.isArray(rows) && rows.length > 0 && rows[0].update_day) {
          const day = rows[0].update_day
          setClients(prev => prev.map(c => c.uuid === client.uuid ? {...c, checkInDay: day} : c))
          setSelectedClient(prev => prev?.uuid === client.uuid ? {...prev, checkInDay: day} : prev)
        }
      })
  }

  async function saveIntake() {
    if (!selectedClient) return
    await dbInsert('client_intakes',{
      client_id:    selectedClient.uuid,
      coach_id:     myUUID,
      call_notes:   intake.notes,
      start_date:   intake.startDate || null,
      start_weight: intake.startWeight,
      updated_at:   new Date().toISOString(),
    })
    await dbInsert('notifications',{
      recipient_id: selectedClient.uuid,
      sender_id:    myUUID,
      type:         'consultation',
      message:      '📋 Your coach updated your Intake / Onboarding notes — check the Consultations tab',
      read:         false,
      created_at:   new Date().toISOString()
    })
    alert('Intake saved successfully.')
  }

  async function saveCallNote() {
    if (!newCall.summary.trim()) return
    const note = {
      id: Date.now(),
      callDate:     newCall.callDate,
      callType:     newCall.callType,
      summary:      newCall.summary,
      focusPoints:  newCall.focusPoints,
      actionItems:  newCall.actionItems,
      nextCallDate: newCall.nextCallDate,
    }
    setCallNotes(prev=>[note,...prev])

    const _clientId = selectedClient?.uuid || KNOWN_USERS['client@eden.io']?.uuid
    await dbInsert('consultation_notes',{
      client_id:      _clientId,
      coach_id:       myUUID,
      call_date:      newCall.callDate,
      call_type:      newCall.callType,
      summary:        newCall.summary,
      focus_points:   newCall.focusPoints,
      action_items:   newCall.actionItems,
      next_call_date: newCall.nextCallDate||null,
      loom_url:       newCall.loomUrl||null,
    })
    if(_clientId) await dbInsert('notifications',{
      recipient_id: _clientId,
      sender_id:    myUUID,
      type:         'consultation',
      message:      `📞 Your coach added ${newCall.callType} notes — check the Consultations tab`,
      read:         false,
      created_at:   new Date().toISOString()
    })

    setNewCall({callDate:new Date().toISOString().slice(0,10),callType:'Monthly Check-In',summary:'',focusPoints:'',actionItems:'',nextCallDate:'',loomUrl:''})
    setShowNewCall(false)
    alert('Call note saved.')
  }

  async function addUser() {
    if (!newUser.name.trim()||!newUser.email.trim()) return
    const initials = newUser.name.trim().split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2)
    const tempPass = `Eden${Math.random().toString(36).slice(2,6).toUpperCase()}${Math.floor(10+Math.random()*90)}!`

    // Write to Supabase user_profiles so the record is ready for real auth
    let profileId = null
    try {
      const payload = {
        name:       newUser.name.trim(),
        email:      newUser.email.trim().toLowerCase(),
        role:       newUser.role,
        initials,
        company_id: adminCompanyId||null,
        update_day: newUser.role==='client'?newUser.checkInDay:null,
      }
      const result = await dbInsert('user_profiles', payload)
      profileId = Array.isArray(result)?result[0]?.id:result?.id
    } catch(e) { /* DB write failed — user still added to local state */ }

    // If client, create a client_access record linking to their coach
    if (newUser.role==='client' && newUser.coachId && profileId && adminCompanyId) {
      try {
        await dbInsert('client_access',{
          company_id:  adminCompanyId,
          staff_id:    newUser.coachId,
          client_id:   profileId,
          permissions: {messages:true,diet:true,labs:true,workout:true,checkins:true,habits:true},
          assigned_by: adminProfileId||null,
        })
      } catch(e) {}
    }

    // Add to local demo list
    const localUser = {
      uuid:       profileId||'local_'+Date.now(),
      name:       newUser.name.trim(),
      email:      newUser.email.trim().toLowerCase(),
      role:       newUser.role,
      coachId:    newUser.coachId,
      coachName:  DEMO_COACHES.find(c=>c.uuid===newUser.coachId)?.name||'',
      checkInDay: newUser.checkInDay,
      hasUpdate:  false,
      lastSeen:   'Never',
      active:     true,
    }
    if (newUser.role==='client') setClients(prev=>[...prev,localUser])

    // Show setup instructions card
    setLastAdded({ name:newUser.name.trim(), email:newUser.email.trim().toLowerCase(), role:newUser.role, tempPass })
    setAuditLog(prev=>[{id:Date.now(),actor:info.name,action:`Added ${newUser.role}`,target:newUser.name,detail:newUser.email,time:new Date().toLocaleString()},...prev])
    setNewUser({name:'',email:'',role:'client',coachId:'',checkInDay:'Wednesday'})
    setShowNewUser(false)
  }

  async function createOrg() {
    if (!newOrg.name.trim()) return
    const org = {
      id:           'org_'+Date.now(),
      name:         newOrg.name,
      slug:         newOrg.slug||newOrg.name.toLowerCase().replace(/\s+/g,'-'),
      isWhiteLabel: true,
      plan:         newOrg.plan,
      coachCount:   0,
      clientCount:  0,
      active:       true,
      brandColor:   newOrg.brandColor,
    }
    await dbInsert('organizations',{
      name:           newOrg.name,
      slug:           org.slug,
      brand_color:    newOrg.brandColor,
      calendar_url:   newOrg.calendarUrl,
      billing_email:  newOrg.billingEmail,
      is_white_label: true,
      plan:           newOrg.plan,
    })
    setOrgs(prev=>[...prev,org])
    setNewOrg({name:'',slug:'',brandColor:'#ffa600',calendarUrl:'',billingEmail:'',plan:'standard'})
    setShowNewOrg(false)
    alert(`${newOrg.name} organization created. Now add their admin user using the + Add User button.`)
  }

  // ── Filtered client list ──────────────────────────────────
  const filteredClients = clients.filter(c=>{
    const ms = !clientSearch||c.name.toLowerCase().includes(clientSearch.toLowerCase())||c.email.toLowerCase().includes(clientSearch.toLowerCase())
    const mc = filterCoach==='All Coaches'||c.coachName===filterCoach
    return ms&&mc
  }).sort((a,b)=>{
    // Unviewed updates first, then most recent
    if (a.hasUpdate && !b.hasUpdate) return -1
    if (!a.hasUpdate && b.hasUpdate) return 1
    return 0
  })

  const TABS_ADMIN = [
    ['dashboard', '📊 Dashboard'],
    ['clients',   '👥 Clients'],
    ['coaches',   '🏋 Coaches'],
    ['orgs',      '🏢 Orgs'],
    ['audit',     '🔐 Audit Log'],
  ]
  const TABS_COACH = [
    ['clients',      '👥 My Clients'],
    ['consultation', '📋 Consultation'],
  ]
  const TABS_CLIENT = [
    ['consultation', '📋 My Consultation'],
  ]
  const TABS = isAdmin?TABS_ADMIN:isCoach?TABS_COACH:TABS_CLIENT

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden'}}>

      {/* Tab bar */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>
            {isAdmin?'Admin Panel':isCoach?'Coach Panel':'My Records'}
          </div>
          {isAdmin&&<div style={{fontSize:10,color:C.gold,marginTop:1}}>🛡 Super Admin — Full Access</div>}
        </div>

        {/* Check-in counter badge */}
        {(isAdmin||isCoach)&&pendingUpdates>0&&(
          <div style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'5px 12px',marginRight:12,display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:4,background:C.gold}}/>
            <span style={{fontSize:11,color:C.gold,fontWeight:700}}>{pendingUpdates} update{pendingUpdates>1?'s':''} pending</span>
          </div>
        )}

        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'13px 12px',background:'none',border:'none',borderBottom:`2px solid ${tab===k?C.gold:'transparent'}`,color:tab===k?C.gold:C.muted,fontSize:11,fontWeight:tab===k?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          DASHBOARD (Admin only)
      ══════════════════════════════════════════════════════ */}
      {tab==='dashboard'&&isAdmin&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {/* Stats row */}
          <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <Stat label="Total Clients"  value={DEMO_CLIENTS.length}  color={C.gold}    sub="Across all coaches"/>
            <Stat label="Total Coaches"  value={DEMO_COACHES.length}  color={C.success} sub="Active coaches"/>
            <Stat label="Pending Updates" value={pendingUpdates}       color={pendingUpdates>0?C.danger:C.success} sub={`Due ${todayDay}`}/>
            <Stat label="Orgs"           value={DEMO_ORGS.length}      color='#D4A8F0'   sub="White-label companies"/>
          </div>

          {/* Check-in summary */}
          <Card sx={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="Check-In Status — All Coaches"/>
              <span style={{fontSize:11,color:C.muted}}>{todayDay}</span>
            </div>
            {DEMO_COACHES.map(coach=>{
              const coachClients = DEMO_CLIENTS.filter(c=>c.coachId===coach.uuid)
              const submitted    = coachClients.filter(c=>!c.hasUpdate).length
              return (
                <div key={coach.uuid} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div style={{fontSize:13,color:C.white,fontWeight:600}}>{coach.name}</div>
                    <span style={{fontSize:12,color:submitted===coachClients.length?C.success:C.gold,fontWeight:700}}>
                      {submitted}/{coachClients.length} submitted
                    </span>
                  </div>
                  <div style={{height:6,borderRadius:3,background:C.border}}>
                    <div style={{width:`${coachClients.length?submitted/coachClients.length*100:0}%`,height:'100%',borderRadius:3,background:submitted===coachClients.length?C.success:C.gold,transition:'width .4s'}}/>
                  </div>
                </div>
              )
            })}
          </Card>

          {/* Recent audit activity */}
          <Card sx={{marginBottom:14}}>
            <Lbl t="Recent Activity"/>
            {auditLog.slice(0,5).map(a=>(
              <div key={a.id} style={{padding:'9px 0',borderTop:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${C.gold}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>
                  {a.action.includes('course')?'🎓':a.action.includes('diet')?'🥗':a.action.includes('check')?'📋':'⚡'}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:C.white,fontWeight:500}}><span style={{color:C.gold}}>{a.actor}</span> {a.action} — {a.target}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{a.detail} · {a.time}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Quick actions */}
          <Card>
            <Lbl t="Quick Actions"/>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {[
                ['+ Add Coach',   ()=>{ setShowNewUser(true); setNewUser(p=>({...p,role:'coach'})) }],
                ['+ Add Client',  ()=>{ setShowNewUser(true); setNewUser(p=>({...p,role:'client'})) }],
                ['+ Add Org',     ()=>setShowNewOrg(true)],
                ['View Clients',  ()=>setTab('clients')],
                ['View Audit Log',()=>setTab('audit')],
              ].map(([l,fn])=>(
                <button key={l} onClick={fn}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'9px 16px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  {l}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CLIENTS TAB (Admin + Coach)
      ══════════════════════════════════════════════════════ */}
      {tab==='clients'&&(isAdmin||isCoach)&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Client list */}
          <div style={{width:selectedClient?280:undefined,flex:selectedClient?undefined:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:selectedClient?`1px solid ${C.border}`:undefined}}>
            <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)}
                  placeholder="Search clients…"
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                {isAdmin&&(
                  <button onClick={()=>setShowNewUser(true)}
                    style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 12px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                    + Add
                  </button>
                )}
              </div>
              {isAdmin&&(
                <select value={filterCoach} onChange={e=>setFilterCoach(e.target.value)}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',color:C.white,fontSize:12,outline:'none'}}>
                  <option>All Coaches</option>
                  {DEMO_COACHES.map(c=><option key={c.uuid}>{c.name}</option>)}
                </select>
              )}
            </div>

            {/* Check-in day counter */}
            {pendingUpdates>0&&(
              <div style={{margin:'10px 12px 0',background:`${C.gold}15`,border:`1px solid ${C.gold}33`,borderRadius:8,padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.gold}}>🔔 {pendingUpdates} Update{pendingUpdates>1?'s':''} Pending</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>Clients with unread check-ins are highlighted</div>
                </div>
              </div>
            )}

            <div style={{flex:1,overflowY:'auto',paddingTop:8}}>
              {filteredClients.length===0&&(
                <div style={{padding:24,textAlign:'center',color:C.muted,fontSize:13}}>No clients found</div>
              )}
              {filteredClients.map(client=>(
                <button key={client.uuid} onClick={()=>openClient(client)}
                  style={{width:'100%',textAlign:'left',background:selectedClient?.uuid===client.uuid?`${C.gold}15`:client.hasUpdate?`${C.gold}08`:C.surface,border:'none',borderLeft:`3px solid ${selectedClient?.uuid===client.uuid?C.gold:client.hasUpdate?C.gold+'88':'transparent'}`,padding:'11px 13px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:18,background:client.hasUpdate?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:client.hasUpdate?C.black:C.gold,flexShrink:0,position:'relative'}}>
                    {client.name[0]}
                    {client.hasUpdate&&(
                      <div style={{position:'absolute',top:-3,right:-3,width:10,height:10,borderRadius:5,background:C.danger,border:`2px solid ${C.black}`}}/>
                    )}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:client.hasUpdate?700:500,color:selectedClient?.uuid===client.uuid?C.gold:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{client.name}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {isAdmin?client.coachName+' · ':''}{client.checkInDay}s
                    </div>
                    {client.hasUpdate
                      ? <div style={{fontSize:9,color:C.gold,fontWeight:700,marginTop:2}}>● CHECK-IN PENDING REVIEW</div>
                      : <div style={{fontSize:9,color:C.success,fontWeight:700,marginTop:2}}>● ACTIVE</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Client detail panel */}
          {selectedClient&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>setSelectedClient(null)}
                  style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:0}}>←</button>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.white}}>{selectedClient.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>
                    {selectedClient.email} · {isAdmin?`${selectedClient.coachName} · `:''}Check-in: {selectedClient.checkInDay}s
                  </div>
                </div>
                {/* Coach / Admin: assign or re-assign update day */}
                {(isAdmin||isCoach)&&(
                  <select
                    value={selectedClient.checkInDay||'Wednesday'}
                    onChange={async e=>{
                      const day = e.target.value
                      setClients(prev=>prev.map(c=>c.uuid===selectedClient.uuid?{...c,checkInDay:day}:c))
                      setSelectedClient(prev=>({...prev,checkInDay:day}))
                      await dbUpdate('user_profiles',`id=eq.${selectedClient.uuid}`,{update_day:day})
                    }}
                    style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 8px',color:C.gold,fontSize:11,outline:'none',cursor:'pointer'}}>
                    {CHECK_IN_DAYS.map(d=><option key={d}>{d}</option>)}
                  </select>
                )}
              </div>

              <div style={{flex:1,overflowY:'auto',padding:16}}>
                {/* Quick stats */}
                <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                  <div style={{background:C.surface,borderRadius:8,padding:'10px 14px',flex:1,minWidth:100}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Last Check-In</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.white}}>{selectedClient.lastSeen||'—'}</div>
                  </div>
                  <div style={{background:C.surface,borderRadius:8,padding:'10px 14px',flex:1,minWidth:100}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Update Day</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.gold}}>{selectedClient.checkInDay||'Not set'}</div>
                    <div style={{fontSize:9,color:C.muted,marginTop:2}}>Due before 9 AM CST</div>
                  </div>
                  <div style={{background:C.surface,borderRadius:8,padding:'10px 14px',flex:1,minWidth:100}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Status</div>
                    <div style={{fontSize:13,fontWeight:700,color:selectedClient.hasUpdate?C.danger:C.success}}>
                      {selectedClient.hasUpdate?'Update Pending':'Up to Date'}
                    </div>
                  </div>
                </div>

                {/* Quick navigation to client tools */}
                <Card sx={{marginBottom:14}}>
                  <Lbl t="Client Tools"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {[
                      ['🥗 Diet Plan',    'diet'],
                      ['📋 Check-In',     'checkin'],
                      ['💊 Supplements',  'supplements'],
                      ['💪 Workout',      'workout'],
                      ['🧪 Labs',         'labs'],
                      ['⌚ Wearables',    'wearables'],
                      ['📝 Consultation', 'consultation'],
                    ].map(([label,dest])=>(
                      <button key={dest}
                        onClick={()=>{
                          if (dest==='consultation') {
                            // Stay in Week6, just switch to the consultation sub-tab
                            setTab('consultation')
                            setSelectedClient(null)
                          } else {
                            onNavigate&&onNavigate(dest,{email:selectedClient.email,name:selectedClient.name,role:selectedClient.role})
                          }
                        }}
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:12,fontWeight:500,cursor:'pointer',textAlign:'left'}}>
                        {label}
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Admin Documents — admin can push, coach reads */}
                {(isAdmin||isCoach)&&(
                  <Card sx={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <Lbl t="📎 Documents & Forms"/>
                      {isAdmin&&(
                        <button onClick={()=>setShowAddDoc(true)}
                          style={{background:C.gold,border:'none',borderRadius:6,padding:'4px 12px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>
                          + Add
                        </button>
                      )}
                    </div>
                    {adminDocs.length===0?(
                      <div style={{textAlign:'center',padding:'12px 0',color:C.muted,fontSize:12}}>
                        {isAdmin?'No documents yet — click + Add to push a lab, form, or note':'No documents from admin yet'}
                      </div>
                    ):adminDocs.map(doc=>(
                      <div key={doc.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 0',borderBottom:`1px solid ${C.border}`}}>
                        <span style={{fontSize:18,flexShrink:0}}>{docTypeIcon(doc.doc_type)}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.white}}>{doc.title}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2,textTransform:'capitalize'}}>
                            {doc.doc_type} · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}
                          </div>
                          {doc.content&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.5}}>{doc.content}</div>}
                          {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:4,display:'block'}}>View File →</a>}
                        </div>
                        {isAdmin&&(
                          <button onClick={()=>deleteAdminDoc(doc.id)}
                            style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:20,padding:0,lineHeight:1,flexShrink:0}}>×</button>
                        )}
                      </div>
                    ))}
                  </Card>
                )}

                {/* Recent check-in summary */}
                {selectedClient.hasUpdate&&(
                  <div style={{background:`${C.gold}12`,border:`1px solid ${C.gold}44`,borderLeft:`3px solid ${C.gold}`,borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}}>📋 CHECK-IN RECEIVED — PENDING REVIEW</div>
                    <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
                      {selectedClient.name} submitted their weekly check-in. View the full Check-In tab to review and respond.
                    </div>
                    <button
                      onClick={()=>onNavigate&&onNavigate('checkin',{email:selectedClient.email,name:selectedClient.name,role:selectedClient.role})}
                      style={{marginTop:10,background:C.gold,border:'none',borderRadius:6,padding:'6px 14px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>
                      Review Check-In →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          COACHES TAB (Admin only)
      ══════════════════════════════════════════════════════ */}
      {tab==='coaches'&&isAdmin&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:C.white}}>All Coaches</div>
            <button onClick={()=>{setShowNewUser(true);setNewUser(p=>({...p,role:'coach'}))}}
              style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
              + Add Coach
            </button>
          </div>
          {DEMO_COACHES.map(coach=>{
            const coachClients = DEMO_CLIENTS.filter(c=>c.coachId===coach.uuid)
            const pending      = coachClients.filter(c=>c.hasUpdate).length
            return (
              <Card key={coach.uuid} sx={{marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:44,height:44,borderRadius:22,background:`${C.gold}22`,border:`2px solid ${C.gold}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:C.gold,flexShrink:0}}>
                    {coach.name[0]}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.white}}>{coach.name}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{coach.email}</div>
                    <div style={{display:'flex',gap:12,marginTop:5}}>
                      <span style={{fontSize:10,color:C.gold,fontWeight:600}}>{coachClients.length} client{coachClients.length!==1?'s':''}</span>
                      {pending>0&&<span style={{fontSize:10,color:C.danger,fontWeight:600}}>{pending} pending update{pending!==1?'s':''}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <span style={{fontSize:10,background:`${C.success}22`,color:C.success,padding:'3px 8px',borderRadius:10,fontWeight:700}}>ACTIVE</span>
                  </div>
                </div>
                {/* Coach's clients */}
                {coachClients.length>0&&(
                  <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Clients — click to open</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {coachClients.map(c=>(
                        <button key={c.uuid}
                          onClick={()=>{ openClient(c); setTab('clients') }}
                          style={{fontSize:11,background:c.hasUpdate?`${C.gold}22`:C.surface,border:`1px solid ${c.hasUpdate?C.gold+'44':C.border}`,borderRadius:6,padding:'4px 10px',color:c.hasUpdate?C.gold:C.white,cursor:'pointer'}}>
                          {c.name}{c.hasUpdate?' 🔔':''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ORGS TAB (Admin only — white-label management)
      ══════════════════════════════════════════════════════ */}
      {tab==='orgs'&&isAdmin&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.white}}>Organizations</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Manage white-label companies and their access</div>
            </div>
            <button onClick={()=>setShowNewOrg(true)}
              style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
              + New Org
            </button>
          </div>

          {orgs.map(org=>(
            <Card key={org.id} sx={{marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:10,background:org.brandColor+'22',border:`2px solid ${org.brandColor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:org.brandColor,flexShrink:0}}>
                  {org.name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.white}}>{org.name}</div>
                    {!org.isWhiteLabel&&<span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'2px 7px',borderRadius:10,fontWeight:700}}>PLATFORM OWNER</span>}
                    {org.isWhiteLabel&&<span style={{fontSize:9,background:`#D4A8F022`,color:'#D4A8F0',padding:'2px 7px',borderRadius:10,fontWeight:700}}>WHITE LABEL</span>}
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>/{org.slug} · {org.plan}</div>
                </div>
                <span style={{fontSize:10,background:org.active?`${C.success}22`:`${C.danger}22`,color:org.active?C.success:C.danger,padding:'3px 8px',borderRadius:10,fontWeight:700,flexShrink:0}}>
                  {org.active?'ACTIVE':'INACTIVE'}
                </span>
              </div>
              <div style={{display:'flex',gap:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <div style={{flex:1,background:C.surface,borderRadius:7,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Coaches</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.gold}}>{org.coachCount}</div>
                </div>
                <div style={{flex:1,background:C.surface,borderRadius:7,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Clients</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.gold}}>{org.clientCount}</div>
                </div>
                <div style={{flex:2,display:'flex',gap:6,alignItems:'center'}}>
                  <button style={{flex:1,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'8px',color:C.gold,fontSize:10,fontWeight:700,cursor:'pointer'}}>
                    Manage
                  </button>
                  <button style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px',color:C.muted,fontSize:10,cursor:'pointer'}}>
                    Settings
                  </button>
                </div>
              </div>

              {/* White-label content toggles */}
              {org.isWhiteLabel&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Content Sections</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {['Courses','Recipe Book','Podcast','Social Links','Calendar'].map(section=>(
                      <span key={section} style={{fontSize:10,background:`${C.success}22`,border:`1px solid ${C.success}33`,borderRadius:6,padding:'3px 8px',color:C.success,cursor:'pointer',userSelect:'none'}}>
                        ✓ {section}
                      </span>
                    ))}
                  </div>
                  <div style={{fontSize:9,color:C.muted,marginTop:6}}>Click any section to toggle on/off for this org</div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          AUDIT LOG (Admin only)
      ══════════════════════════════════════════════════════ */}
      {tab==='audit'&&isAdmin&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:14}}>Audit Log</div>
          {auditLog.map(a=>(
            <div key={a.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px',marginBottom:8,display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:34,height:34,borderRadius:8,background:`${C.gold}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                {a.action.includes('course')?'🎓':a.action.includes('diet')?'🥗':a.action.includes('check')?'📋':a.action.includes('Add')?'➕':'⚡'}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:C.white,fontWeight:500,lineHeight:1.4}}>
                  <span style={{color:C.gold,fontWeight:700}}>{a.actor}</span> {a.action}
                  {a.target&&a.target!=='Self'&&<> → <span style={{color:C.white}}>{a.target}</span></>}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{a.detail}</div>
                <div style={{fontSize:10,color:C.dim,marginTop:3}}>{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CONSULTATION (Coach + Client)
      ══════════════════════════════════════════════════════ */}
      {tab==='consultation'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>

          {/* Part 1: Intake */}
          <Card sx={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <Lbl t="Initial Intake — Onboarding Consultation"/>
              {isClient&&<span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'2px 7px',borderRadius:10,fontWeight:700,letterSpacing:.5}}>VIEW ONLY</span>}
            </div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.5}}>
              {isCoach||isAdmin
                ?'Paste your full onboarding consultation notes from your Google Doc here. Saved once per client.'
                :'Your intake notes from your initial onboarding consultation.'}
            </div>

            {/* Single paste area */}
            <textarea
              value={intake.notes}
              onChange={e=>isCoach||isAdmin?setI('notes')(e.target.value):null}
              readOnly={isClient}
              placeholder={isCoach||isAdmin?'Paste your full onboarding consultation notes here — health history, current medications, conditions, goals, lifestyle, what brought them in, call notes, etc.':''}
              rows={16}
              style={{width:'100%',background:isClient?C.dim:C.surface,border:`1px solid ${isClient?C.dim:C.border}`,borderRadius:8,padding:'12px',color:isClient?C.muted:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',lineHeight:1.7,cursor:isClient?'not-allowed':'text'}}
            />

            {/* Start date + weight row */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
              <Inp label="Start Date" value={intake.startDate} onChange={isCoach||isAdmin?setI('startDate'):undefined} type="date" disabled={isClient}/>
              <Inp label="Starting Weight (lbs)" value={intake.startWeight} onChange={isCoach||isAdmin?setI('startWeight'):undefined} placeholder="e.g. 185" disabled={isClient}/>
            </div>

            {(isCoach||isAdmin)&&(
              <button onClick={saveIntake}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginTop:4}}>
                Save Intake Record
              </button>
            )}
          </Card>

          {/* Part 2: Ongoing call notes */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.white}}>Call Notes History</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>Monthly calls, therapy sessions, strategy calls</div>
            </div>
            {(isCoach||isAdmin)&&(
              <button onClick={()=>setShowNewCall(true)}
                style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
                + Add Call Note
              </button>
            )}
          </div>

          {callNotes.length===0&&(
            <Card>
              <div style={{textAlign:'center',padding:20,color:C.muted,fontSize:13}}>No call notes yet. Add the first one above.</div>
            </Card>
          )}

          {callNotes.map(note=>(
            <Card key={note.id} sx={{marginBottom:10,borderLeft:`3px solid ${C.gold}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.8,marginBottom:3}}>{note.callType.toUpperCase()}</div>
                  <div style={{fontSize:11,color:C.muted}}>{new Date(note.callDate).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
                </div>
                {note.nextCallDate&&(
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:9,color:C.muted,marginBottom:2}}>NEXT CALL</div>
                    <div style={{fontSize:11,color:C.success,fontWeight:600}}>{new Date(note.nextCallDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                  </div>
                )}
              </div>

              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Summary</div>
                <div style={{fontSize:13,color:C.white,lineHeight:1.6}}>{note.summary}</div>
              </div>

              {note.focusPoints&&(
                <div style={{marginBottom:10,background:C.surface,borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Focus Points</div>
                  <div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.focusPoints}</div>
                </div>
              )}

              {note.actionItems&&(
                <div style={{background:`${C.success}11`,border:`1px solid ${C.success}33`,borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.success,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Action Items</div>
                  <div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.actionItems}</div>
                </div>
              )}

              {/* Loom recording embed */}
              {(note.loomUrl||note.loom_url)&&(()=>{
                const raw = note.loomUrl||note.loom_url||''
                const embed = raw.replace('loom.com/share/','loom.com/embed/')
                return embed ? (
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🎥 Loom Recording</div>
                    <div style={{position:'relative',paddingBottom:'56.25%',overflow:'hidden',borderRadius:10,border:`1px solid ${C.border}`}}>
                      <iframe src={embed} allowFullScreen title="Loom recording"
                        style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                    </div>
                  </div>
                ) : null
              })()}
            </Card>
          ))}
        </div>
      )}

      {/* ── Last Added — Setup Instructions Card ─────────── */}
      {lastAdded&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setLastAdded(null)}}>
          <div style={{background:C.card,border:`1px solid ${C.gold}55`,borderRadius:16,width:'100%',maxWidth:440,padding:24}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>✅ User Added Successfully</div>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>{lastAdded.name}</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16,textTransform:'capitalize'}}>{lastAdded.role.replace(/_/g,' ')} · {lastAdded.email}</div>

            <div style={{background:C.surface,borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Send These Credentials</div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:12,color:C.muted}}>Email</span>
                <span style={{fontSize:12,color:C.white,fontWeight:600}}>{lastAdded.email}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:12,color:C.muted}}>Temp Password</span>
                <span style={{fontSize:12,color:C.gold,fontWeight:700,fontFamily:'monospace'}}>{lastAdded.tempPass}</span>
              </div>
            </div>

            <div style={{background:`${C.success}11`,border:`1px solid ${C.success}33`,borderRadius:10,padding:'12px 14px',marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.success,marginBottom:6}}>📋 What To Do</div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
                1. Their profile is saved in Supabase — ready for real auth when you enable it.<br/>
                2. To give them access <em>now</em>: send them these credentials and have a developer add them to <code style={{color:C.gold}}>DEMO_USERS</code> in App.tsx.<br/>
                3. Once Supabase Auth is live, they'll get a proper invite link instead.
              </div>
            </div>

            <button onClick={()=>setLastAdded(null)}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer'}}>
              Got It
            </button>
          </div>
        </div>
      )}

      {/* ── Add Document Modal ───────────────────────────── */}
      {showAddDoc&&isAdmin&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowAddDoc(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:420,padding:24}}>
            <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:4}}>Add Document</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>For {selectedClient?.name} — visible to their coach and to them in the app</div>
            <Sel label="Type" value={newDoc.doc_type} onChange={v=>setNewDoc(p=>({...p,doc_type:v}))}
              options={['note','form','lab','document']}/>
            <Inp label="Title *" value={newDoc.title} onChange={v=>setNewDoc(p=>({...p,title:v}))}
              placeholder="e.g. GI Map Results · July 2026"/>
            <Inp label="Content / Notes" value={newDoc.content} onChange={v=>setNewDoc(p=>({...p,content:v}))}
              placeholder="Summary, instructions, or any relevant notes…" multiline/>
            <Inp label="File URL (optional)" value={newDoc.file_url} onChange={v=>setNewDoc(p=>({...p,file_url:v}))}
              placeholder="https://drive.google.com/…"/>
            <div style={{display:'flex',gap:10,marginTop:6}}>
              <button onClick={()=>setShowAddDoc(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.muted,fontWeight:700,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={addAdminDoc}
                style={{flex:2,background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer'}}>
                Save & Push to Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ────────────────────────────────── */}
      {showNewUser&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowNewUser(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,padding:24}}>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>Add New User</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>They will receive login credentials manually until auto-auth is configured in production.</div>
            <Inp label="Full Name" value={newUser.name} onChange={setNU('name')} placeholder="e.g. Sarah Johnson"/>
            <Inp label="Email Address" value={newUser.email} onChange={setNU('email')} placeholder="e.g. sarah@email.com" type="email"/>
            <Sel label="Role" value={newUser.role} onChange={setNU('role')} options={['client','coach','head_coach','va']}/>
            {newUser.role==='client'&&(
              <>
                <Sel label="Assign to Coach" value={newUser.coachId||''} onChange={setNU('coachId')}
                  options={['', ...DEMO_COACHES.map(c=>c.uuid)]}/>
                <Sel label="Check-In Day" value={newUser.checkInDay} onChange={setNU('checkInDay')} options={CHECK_IN_DAYS}/>
              </>
            )}
            <div style={{display:'flex',gap:10,marginTop:6}}>
              <button onClick={()=>setShowNewUser(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={addUser} disabled={!newUser.name.trim()||!newUser.email.trim()}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newUser.name.trim()&&newUser.email.trim()?1:.5}}>
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Call Note Modal ───────────────────────────── */}
      {showNewCall&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowNewCall(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.white}}>Add Call Note</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Log notes from a consultation call with this client</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:10}}>
                <Inp label="Call Date" value={newCall.callDate} onChange={setNC('callDate')} type="date"/>
                <Sel label="Call Type" value={newCall.callType} onChange={setNC('callType')} options={CALL_TYPES}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Call Summary *</div>
                <textarea value={newCall.summary} onChange={e=>setNC('summary')(e.target.value)}
                  placeholder="Overall summary of the call — what was discussed, how the client is doing, key observations…"
                  rows={4}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Focus Points</div>
                <textarea value={newCall.focusPoints} onChange={e=>setNC('focusPoints')(e.target.value)}
                  placeholder="Key focus areas for this client going into the next period…"
                  rows={3}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Action Items</div>
                <textarea value={newCall.actionItems} onChange={e=>setNC('actionItems')(e.target.value)}
                  placeholder="Specific tasks or changes for the client or coach to execute before the next call…"
                  rows={3}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
              <Inp label="Next Call Date (optional)" value={newCall.nextCallDate} onChange={setNC('nextCallDate')} type="date"/>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Loom Recording URL (optional)</div>
                <input value={newCall.loomUrl} onChange={e=>setNC('loomUrl')(e.target.value)}
                  placeholder="https://www.loom.com/share/…"
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
                <div style={{fontSize:10,color:C.muted,marginTop:4}}>Paste the Loom share link — the client will see the video embedded in their Coach Updates feed.</div>
              </div>
            </div>
            <div style={{padding:'12px 20px',borderTop:`1px solid ${C.border}`,display:'flex',gap:10,flexShrink:0}}>
              <button onClick={()=>setShowNewCall(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={saveCallNote} disabled={!newCall.summary.trim()}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newCall.summary.trim()?1:.5}}>
                Save Call Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Org Modal ─────────────────────────────────── */}
      {showNewOrg&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowNewOrg(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,padding:24}}>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>Create White-Label Org</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Each org gets their own coaches, clients, branding, and admin access. They manage their company — you manage the platform.</div>
            <Inp label="Company Name" value={newOrg.name} onChange={setNO('name')} placeholder="e.g. Peak Performance Coaching"/>
            <Inp label="URL Slug" value={newOrg.slug} onChange={setNO('slug')} placeholder="e.g. peak-performance (auto-generated if blank)"/>
            <Inp label="Billing Email" value={newOrg.billingEmail} onChange={setNO('billingEmail')} placeholder="billing@company.com" type="email"/>
            <Sel label="Plan" value={newOrg.plan} onChange={setNO('plan')} options={['standard','professional','enterprise']}/>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Brand Color</div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={newOrg.brandColor} onChange={e=>setNO('brandColor')(e.target.value)}
                  style={{width:44,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',padding:2}}/>
                <span style={{fontSize:12,color:C.muted}}>{newOrg.brandColor}</span>
              </div>
            </div>
            <Inp label="Calendar / Booking URL" value={newOrg.calendarUrl} onChange={setNO('calendarUrl')} placeholder="GHL or Calendly booking link"/>
            <div style={{display:'flex',gap:10,marginTop:6}}>
              <button onClick={()=>setShowNewOrg(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={createOrg} disabled={!newOrg.name.trim()}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newOrg.name.trim()?1:.5}}>
                Create Organization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
