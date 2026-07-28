// ═══════════════════════════════════════════════════════════════
// Week6.jsx — Admin Panel + Consultation + Check-In Counter
//             + White-Label Org Management
// Place at: src/components/Week6.jsx in Replit
//
// In App.jsx:
//   import Week6 from './components/Week6'
//   {tab === 'admin' && <Week6 currentUser={currentUser} />}
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { MASTER_HABITS, FOODS, CARDIO_TYPES, DEFAULT_RESOURCE_LINKS } from './libraryDefaults'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => window.innerWidth < bp)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',    role:'coach',       coachId:null },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Jordan Williams', role:'client',      coachId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051' },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',      role:'super_admin', coachId:null },
}

const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'

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
  try { await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`,{method:'DELETE',headers:H}) } catch {}
}
async function dbUpdate(table, params, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method:'PATCH', headers:H, body:JSON.stringify(body)
    })
    if (!r.ok) { console.error('UPDATE', await r.text()); return false }
    return true
  } catch (e) { console.error('UPDATE', e); return false }
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
const DOC_TYPES = [
  {v:'lab',        l:'Lab Results',                                icon:'🧪', dest:'Appears in the client\u2019s Labs section'},
  {v:'onboarding', l:'Onboarding Consultation (Initial Intake)',   icon:'🌱', dest:'Appears in the Onboarding Consultation section'},
  {v:'monthly',    l:'Monthly Check-In',                           icon:'📆', dest:'Appears with Call Notes History'},
  {v:'emergency',  l:'Emergency Call',                             icon:'🚨', dest:'Appears with Call Notes History'},
  {v:'form',       l:'Form',                                       icon:'📋', dest:'Appears in the client\u2019s Documents list'},
  {v:'note',       l:'Note',                                       icon:'📝', dest:'Appears in the client\u2019s Documents list'},
  {v:'document',   l:'Other Document',                             icon:'📄', dest:'Appears in the client\u2019s Documents list'},
]
const docTypeLabel = t=>DOC_TYPES.find(d=>d.v===t)?.l||t

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
function ColorRow({primary, colors=[], onPrimary, onColors}) {
  const [hexP,   setHexP]   = useState(primary||'#ffa600')
  const [hexNew, setHexNew] = useState('#')
  useEffect(()=>{ setHexP(primary||'#ffa600') },[primary])
  const norm = v=>{ v=(v||'').trim(); if(v&&!v.startsWith('#')) v='#'+v; return /^#[0-9a-fA-F]{6}$/.test(v)?v.toLowerCase():null }
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Brand Colors</div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8}}>
        <input type="color" value={primary||'#ffa600'} onChange={e=>onPrimary(e.target.value)}
          style={{width:44,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',padding:2}}/>
        <input value={hexP} maxLength={7} placeholder="#ffa600"
          onChange={e=>{ setHexP(e.target.value); const n=norm(e.target.value); if(n) onPrimary(n) }}
          style={{width:90,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',color:C.white,fontSize:12,outline:'none'}}/>
        <span style={{fontSize:10,color:C.muted}}>Primary — type a hex code or use the picker</span>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        {(colors||[]).map((c,i)=>(
          <span key={i} style={{display:'flex',alignItems:'center',gap:5,background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:'3px 8px 3px 4px'}}>
            <span style={{width:16,height:16,borderRadius:8,background:c,display:'inline-block',border:'1px solid #333'}}/>
            <span style={{fontSize:11,color:C.muted}}>{c}</span>
            <span onClick={()=>onColors((colors||[]).filter((_,j)=>j!==i))} style={{cursor:'pointer',color:C.muted,fontSize:12,fontWeight:700}}>×</span>
          </span>
        ))}
        <input value={hexNew} maxLength={7} placeholder="#hex"
          onChange={e=>setHexNew(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'){ const n=norm(hexNew); if(n&&!(colors||[]).includes(n)){ onColors([...(colors||[]),n]); setHexNew('#') } } }}
          style={{width:74,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 8px',color:C.white,fontSize:11,outline:'none'}}/>
        <button onClick={()=>{ const n=norm(hexNew); if(!n) return; if(!(colors||[]).includes(n)) onColors([...(colors||[]),n]); setHexNew('#') }}
          style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 10px',color:C.gold,fontSize:11,cursor:'pointer',fontWeight:700}}>+ Add</button>
      </div>
      <div style={{fontSize:9,color:C.muted,marginTop:4}}>Add as many extra palette colors as they use (secondary, accent, etc.).</div>
    </div>
  )
}
function Sel({label,value,onChange,options}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none'}}>
        {options.map(o=>{const v=typeof o==='object'?o.value:o, l=typeof o==='object'?o.label:o; return <option key={v} value={v}>{l}</option>})}
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
export default function Week6({currentUser, onNavigate, initialClient, loomMode = false, loomFeatured = new Set(), setLoomFeatured = () => {}}) {
  const isMobile = useIsMobile()
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
    name:'', slug:'', brandColor:'#ffa600', brandColors:[], calendarUrl:'',
    billingEmail:'', plan:'standard',
  })
  const [colorsColSupported, setColorsColSupported] = useState(false) // organizations.brand_colors exists?
  const setNO = k=>v=>setNewOrg(p=>({...p,[k]:v}))

  // ── Packages / pricing tiers (drive org plans + MRR) ─────
  const [packages,    setPackages]    = useState([])   // [{id,name,price,active}]
  const [pkgsLoaded,  setPkgsLoaded]  = useState(false)
  const [newPkg,      setNewPkg]      = useState({name:'',price:'',includes_recipes:false})
  const [editPkg,     setEditPkg]     = useState(null)  // {id,name,price,includes_recipes} being edited
  const [edenCourses, setEdenCourses] = useState([])    // Eden courses w/ per-course tier distribution (courses.tiers)
  const [pkgCoursesOpen, setPkgCoursesOpen] = useState(null) // package id whose Eden course list is expanded
  const [orgCoursesOpen, setOrgCoursesOpen] = useState(null) // org id whose Eden course list is expanded
  const [manageOrg,   setManageOrg]   = useState(null)  // org being edited in the Manage modal

  // Reload the active package tiers from the DB — used on mount and by realtime pushes
  function refreshPackages() {
    return dbGet('packages','active=eq.true&order=price.asc')
      .then(rows=>{ if(Array.isArray(rows)) setPackages(rows); setPkgsLoaded(true) })
      .catch(()=>setPkgsLoaded(true))
  }
  // Reload org list (+ counts + brand palettes) from the DB — used on mount and by realtime pushes
  function refreshOrgs() {
    return dbGet('organizations','select=id,name,slug,plan,is_white_label,brand_color,calendar_url,billing_email,is_active&order=created_at.asc')
      .then(rows=>{
        if (Array.isArray(rows)&&rows.length)
          setOrgs(prev=>rows.map(o=>{
            const old = prev.find(p=>p.id===o.id)
            return { id:o.id, name:o.name, slug:o.slug, isWhiteLabel:o.is_white_label,
              plan:o.plan, coachCount:old?.coachCount||0, clientCount:old?.clientCount||0,
              active:o.is_active!==false, brandColor:o.brand_color||'#ffa600',
              calendarUrl:o.calendar_url||'', billingEmail:o.billing_email||'',
              brandColors:old?.brandColors }
          }))
      })
      // Real coach/client counts per org — chained after the org list lands so it
      // can't be overwritten by the stale-count initial mapping above.
      .then(refreshOrgCounts)
      // Probe for the brand_colors palette column (added later — needs its SQL run once)
      .then(()=>dbGet('organizations','select=id,brand_colors'))
      .then(rows=>{
        if (Array.isArray(rows)&&rows.length) {
          setColorsColSupported(true)
          setOrgs(prev=>prev.map(o=>{ const m=rows.find(r=>r.id===o.id); return m?{...o,brandColors:m.brand_colors||[]}:o }))
        }
      }).catch(()=>{})
  }
  useEffect(()=>{
    if (!isAdmin) return
    refreshPackages()
    // Eden courses + their per-course tier distribution (courses.tiers = array of package ids)
    dbGet('courses','select=id,title,tiers,company_id&is_active=eq.true&order=sort_order.asc')
      .then(rows=>{
        if (Array.isArray(rows))
          setEdenCourses(rows.filter(c=>!c.company_id||c.company_id===EDEN_ORG_ID))
      }).catch(()=>{})
    refreshOrgs()
  },[isAdmin])

  // Recompute each org card's coach/client counts from the database — the same
  // query the page-load effect uses, so live updates always match a reload.
  function refreshOrgCounts() {
    return dbGet('user_profiles','role=in.(coach,head_coach,client)&select=company_id,role,is_active')
      .then(rows=>{
        if (!Array.isArray(rows)) return
        const counts = {}
        rows.forEach(r=>{
          if (!r.company_id || r.is_active===false) return
          const c = counts[r.company_id] ||= { coaches:0, clients:0 }
          if (r.role==='client') c.clients++; else c.coaches++
        })
        setOrgs(prev=>prev.map(o=>{
          const c = counts[o.id]
          return c ? { ...o, coachCount:c.coaches, clientCount:c.clients } : { ...o, coachCount:0, clientCount:0 }
        }))
      }).catch(()=>{})
  }

  const planOptions = packages.length ? packages.map(p=>p.name) : ['standard','professional','enterprise']

  async function addPackage() {
    const name = newPkg.name.trim(); const price = parseFloat(newPkg.price)
    if (!name || isNaN(price)) return
    const res = await dbInsert('packages',{ name, price, includes_recipes:newPkg.includes_recipes })
    const row = Array.isArray(res)?res[0]:res
    if (row?.id) { setPackages(p=>[...p,row].sort((a,b)=>a.price-b.price)); setNewPkg({name:'',price:'',includes_recipes:false}) }
    else alert('Could not save the tier. Make sure the packages table exists (run the SQL I gave you), then try again.')
  }
  async function savePackage() {
    if (!editPkg) return
    const name = editPkg.name.trim(); const price = parseFloat(editPkg.price)
    if (!name || isNaN(price)) return
    await dbUpdate('packages',`id=eq.${editPkg.id}`,{ name, price, includes_recipes:!!editPkg.includes_recipes })
    setPackages(p=>p.map(x=>x.id===editPkg.id?{...x,name,price,includes_recipes:!!editPkg.includes_recipes}:x).sort((a,b)=>a.price-b.price))
    setEditPkg(null)
  }
  async function saveManagedOrg() {
    if (!manageOrg?.id) return
    await dbUpdate('organizations',`id=eq.${manageOrg.id}`,{
      name: manageOrg.name.trim(), plan: manageOrg.plan,
      brand_color: manageOrg.brandColor, calendar_url: manageOrg.calendarUrl||null,
      billing_email: manageOrg.billingEmail||null, is_active: !!manageOrg.active,
      ...(colorsColSupported ? { brand_colors: manageOrg.brandColors||[] } : {}),
    })
    setOrgs(prev=>prev.map(o=>o.id===manageOrg.id?{...o,...manageOrg,name:manageOrg.name.trim()}:o))
    setManageOrg(null)
  }
  const tierOf = planName => packages.find(p=>(p.name||'').toLowerCase()===(planName||'').toLowerCase())
  async function deletePackage(pkg) {
    if (!confirm(`Remove the "${pkg.name}" tier? Existing orgs on this tier will stop counting toward MRR until you move them to another tier.`)) return
    await dbUpdate('packages',`id=eq.${pkg.id}`,{ active:false })
    setPackages(p=>p.filter(x=>x.id!==pkg.id))
  }

  // ── Admin org context (loaded from Supabase) ─────────────
  const [adminCompanyId,  setAdminCompanyId]  = useState(null)
  const [adminProfileId,  setAdminProfileId]  = useState(null)

  // Real coaches from the database (merged with the demo coach so transfers/pickers show everyone)
  const [dbCoaches, setDbCoaches] = useState([])
  useEffect(()=>{
    // Wait for the admin's company to resolve, then always scope — never expose other companies' coaches
    if (!adminCompanyId) return
    dbGet('user_profiles',`role=in.(coach,head_coach)&select=id,name,email,role&company_id=eq.${adminCompanyId}&is_active=not.is.false`)
      .then(rows=>{ if (Array.isArray(rows))
        setDbCoaches(rows.filter(r=>!DEMO_COACHES.some(d=>d.uuid===r.id))
          .map(r=>({uuid:r.id,name:r.name,email:r.email,role:'coach',checkInDay:'',clientCount:0,active:true}))) })
      .catch(()=>{})
  },[adminCompanyId])
  // Removed coach UUIDs — seeded from localStorage, kept in sync with the DB
  // (is_active=false) by syncLifecycleFromDb. Declared here so allCoaches can
  // honor the DB flag: removed coaches (demo or real) never appear anywhere.
  const [removedCoaches, setRemovedCoaches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eden_removed_coaches') || '[]') } catch { return [] }
  })
  const allCoaches = [...DEMO_COACHES, ...dbCoaches].filter(c=>!removedCoaches.includes(c.uuid))
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

  // Load admin docs for the currently selected client — a ref keeps the id
  // reachable from the long-lived realtime subscription without re-subscribing.
  const selectedClientUuidRef = useRef(null)
  selectedClientUuidRef.current = selectedClient?.uuid||null
  function refreshAdminDocs() {
    const uuid = selectedClientUuidRef.current
    if (!uuid){ setAdminDocs([]); return Promise.resolve() }
    return dbGet('client_documents',`client_id=eq.${uuid}&order=created_at.desc`)
      .then(rows=>setAdminDocs(Array.isArray(rows)?rows:[]))
      .catch(()=>{})
  }
  useEffect(()=>{ refreshAdminDocs() },[selectedClient?.uuid])

  const docTypeIcon = t=>DOC_TYPES.find(d=>d.v===t)?.icon||'📄'

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

  // Compact renderer for documents routed into the Consultation tab sections
  const renderDocRow = doc=>(
    <div key={doc.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
      <span style={{fontSize:16,flexShrink:0}}>{docTypeIcon(doc.doc_type)}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:C.white}}>{doc.title}</div>
        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{docTypeLabel(doc.doc_type)} · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}</div>
        {doc.content&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.5}}>{doc.content}</div>}
        {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:4,display:'block'}}>View File →</a>}
      </div>
      {isAdmin&&<button onClick={()=>deleteAdminDoc(doc.id)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:0,lineHeight:1,flexShrink:0}}>×</button>}
    </div>
  )

  // ── Audit log ─────────────────────────────────────────────
  const [auditLog, setAuditLog] = useState([
    {id:1,actor:'Eden Admin',action:'Granted course access',target:'Jordan Williams',detail:'The Mind Of A CEO',time:'Jul 14 2026 9:02 AM'},
    {id:2,actor:'Coach Marcus',action:'Saved diet plan',target:'Jordan Williams',detail:'Base Diet Protocol Male',time:'Jul 13 2026 3:44 PM'},
    {id:3,actor:'Jordan Williams',action:'Submitted check-in',target:'Self',detail:'Week of Jul 13',time:'Jul 13 2026 7:58 AM'},
  ])

  // ── Client lifecycle management (all persisted to localStorage) ──
  // Keyed by client email so the LoginScreen can read the same store.
  const [deactivatedMap, setDeactivatedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eden_deactivated_clients') || '{}') } catch { return {} }
  })
  // Maps clientEmail → newCoachUuid after a transfer
  const [clientCoachMap, setClientCoachMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eden_client_coach_map') || '{}') } catch { return {} }
  })
  // Support staff (VAs, head coaches, etc.) loaded from the database
  const [supportStaff, setSupportStaff] = useState([])
  useEffect(()=>{
    dbGet('user_profiles','role=in.(va,head_coach)&select=id,name,full_name,email,role&order=created_at.asc')
      .then(rows=>{ if(Array.isArray(rows)) setSupportStaff(rows) }).catch(()=>{})
  },[])
  // Head coach designations — array of coach UUIDs promoted to head coach
  const [headCoaches, setHeadCoaches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eden_head_coaches') || '[]') } catch { return [] }
  })
  function promoteToHeadCoach(coach) {
    const next = [...new Set([...headCoaches, coach.uuid])]
    setHeadCoaches(next)
    localStorage.setItem('eden_head_coaches', JSON.stringify(next))
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(coach.email)}`,{role:'head_coach'}).catch(()=>{})
    addAudit('Eden Admin','Promoted to Head Coach',coach.name,'')
  }
  function demoteFromHeadCoach(coach) {
    const next = headCoaches.filter(id=>id!==coach.uuid)
    setHeadCoaches(next)
    localStorage.setItem('eden_head_coaches', JSON.stringify(next))
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(coach.email)}`,{role:'coach'}).catch(()=>{})
    addAudit('Eden Admin','Removed Head Coach designation',coach.name,'')
  }
  // Sync deactivations + coach transfers + coach removals FROM the database so
  // every device (coach, admin, anywhere) sees the same state. Runs on mount
  // and then polls, so a second open admin session picks up changes made
  // elsewhere without a page reload.
  const allCoachesRef = useRef([])
  allCoachesRef.current = allCoaches
  function syncLifecycleFromDb() {
    // Head coach designations from DB (source of truth)
    dbGet('user_profiles','role=eq.head_coach&select=email')
      .then(rows=>{
        if (!Array.isArray(rows)) return
        const hcEmails = new Set(rows.map(r=>r.email))
        const next = allCoachesRef.current.filter(c=>hcEmails.has(c.email)).map(c=>c.uuid)
        setHeadCoaches(()=>{
          const merged = [...new Set([...next])]
          localStorage.setItem('eden_head_coaches', JSON.stringify(merged))
          return merged
        })
      }).catch(()=>{})
    dbGet('user_profiles','role=eq.client&select=email,is_active,coach_id')
      .then(rows=>{
        if (!Array.isArray(rows)) return
        setDeactivatedMap(prev=>{
          const next = { ...prev }
          rows.forEach(r=>{
            if (r.is_active===false && !next[r.email]) next[r.email] = { at:'', name:'', fromDb:true }
            // DB is the source of truth: if it says active, clear any stale local entry
            if (r.is_active!==false && next[r.email]) delete next[r.email]
          })
          localStorage.setItem('eden_deactivated_clients', JSON.stringify(next))
          return next
        })
        setClientCoachMap(prev=>{
          const next = { ...prev }
          rows.forEach(r=>{ if (r.coach_id) next[r.email] = r.coach_id })
          localStorage.setItem('eden_client_coach_map', JSON.stringify(next))
          return next
        })
      }).catch(()=>{})
    // Coach removals — a removed coach is marked is_active=false in the DB
    dbGet('user_profiles','role=in.(coach,head_coach)&select=id,is_active')
      .then(rows=>{
        if (!Array.isArray(rows)) return
        const inactive = new Set(rows.filter(r=>r.is_active===false).map(r=>r.id))
        const active   = new Set(rows.filter(r=>r.is_active!==false).map(r=>r.id))
        setRemovedCoaches(prev=>{
          // DB is the source of truth: add coaches removed elsewhere, drop restored ones
          const next = [...new Set([...prev.filter(id=>!active.has(id)), ...inactive])]
          if (next.length===prev.length && next.every(id=>prev.includes(id))) return prev
          localStorage.setItem('eden_removed_coaches', JSON.stringify(next))
          return next
        })
      }).catch(()=>{})
    // Keep org card coach/client counts live too (admin dashboard only)
    if (isAdmin) refreshOrgCounts()
  }
  useEffect(()=>{
    syncLifecycleFromDb()
    // Realtime: push changes to user_profiles instantly over websocket.
    // Polling below is only a FALLBACK while the channel is not connected.
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 5 } } })
    let realtimeUp = false
    let debounce = null
    const scheduleSync = ()=>{
      // Coalesce bursts of row events into a single refresh
      clearTimeout(debounce)
      debounce = setTimeout(()=>syncLifecycleFromDb(), 250)
    }
    // Same debounce pattern for the other admin-visible tables — each table gets
    // its own timer so a burst on one doesn't delay a refresh of another.
    const timers = {}
    const debounced = fn => ()=>{ clearTimeout(timers[fn.name]); timers[fn.name] = setTimeout(fn, 250) }
    let channel = sb
      .channel('admin-lifecycle')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, scheduleSync)
    if (isAdmin) channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' },    debounced(refreshOrgs))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' },         debounced(refreshPackages))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_documents' }, debounced(refreshAdminDocs))
    const catchUp = ()=>{
      syncLifecycleFromDb()
      if (isAdmin) { refreshOrgs(); refreshPackages(); refreshAdminDocs() }
    }
    channel = channel.subscribe(status=>{
        const wasUp = realtimeUp
        realtimeUp = status === 'SUBSCRIBED'
        // Catch up on anything missed while the channel was down
        if (realtimeUp && !wasUp) catchUp()
      })
    // Fallback poll: only fires when the realtime channel is disconnected
    const id = setInterval(()=>{ if (!document.hidden && !realtimeUp) catchUp() }, 10000)
    const onVis = ()=>{ if (!document.hidden && !realtimeUp) catchUp() }
    document.addEventListener('visibilitychange', onVis)
    return ()=>{
      clearTimeout(debounce)
      Object.values(timers).forEach(clearTimeout)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      sb.removeChannel(channel)
    }
  },[])

  const [archiveOpen,       setArchiveOpen]       = useState(false)
  const [showTransferModal, setShowTransferModal]  = useState(false)  // coach removal modal
  const [pendingRemoval,    setPendingRemoval]     = useState(null)   // coach being removed
  const [transferTargetId,  setTransferTargetId]   = useState('')

  // ── Lifecycle helpers ─────────────────────────────────────────
  function isDeactivated(client) { return !!deactivatedMap[client.email] }

  function effectiveCoachId(client) {
    return clientCoachMap[client.email] || client.coachId
  }
  function effectiveCoachName(client) {
    const cid = effectiveCoachId(client)
    return allCoaches.find(c=>c.uuid===cid)?.name || client.coachName || 'Unassigned'
  }

  function addAudit(actor, action, target, detail) {
    setAuditLog(prev=>[{
      id: Date.now(), actor, action, target, detail,
      time: new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}),
    }, ...prev])
  }

  function deactivateClient(client) {
    const next = { ...deactivatedMap, [client.email]: { at: new Date().toISOString(), name: client.name, coachName: effectiveCoachName(client) } }
    setDeactivatedMap(next)
    localStorage.setItem('eden_deactivated_clients', JSON.stringify(next))
    // Enforce in the database — blocks login from ANY device
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(client.email)}`,{is_active:false}).then(refreshOrgCounts).catch(()=>{})
    addAudit('Eden Admin','Deactivated client',client.name,'Account deactivated — data preserved, coach still has full access')
    if (selectedClient?.uuid === client.uuid) setSelectedClient({ ...client, _deactivated: true })
  }

  function reactivateClient(client) {
    const next = { ...deactivatedMap }
    delete next[client.email]
    setDeactivatedMap(next)
    localStorage.setItem('eden_deactivated_clients', JSON.stringify(next))
    // Restore login access in the database
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(client.email)}`,{is_active:true}).then(refreshOrgCounts).catch(()=>{})
    addAudit('Eden Admin','Reactivated client',client.name,'Account restored — client can now log in again')
    setSelectedClient({ ...client, _deactivated: false })
  }

  function transferClient(clientEmail, newCoachUuid) {
    const next = { ...clientCoachMap, [clientEmail]: newCoachUuid }
    setClientCoachMap(next)
    localStorage.setItem('eden_client_coach_map', JSON.stringify(next))
    // Persist new coach assignment in the database
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(clientEmail)}`,{coach_id:newCoachUuid}).catch(()=>{})
  }

  function confirmRemoveCoach(coach) {
    const available = allCoaches.filter(c=>c.uuid!==coach.uuid&&!removedCoaches.includes(c.uuid))
    setPendingRemoval(coach)
    setTransferTargetId(available[0]?.uuid||'')
    setShowTransferModal(true)
  }

  function executeRemoveCoach() {
    if (!pendingRemoval) return
    const activeCoachClients = clients.filter(c=>effectiveCoachId(c)===pendingRemoval.uuid&&!isDeactivated(c))
    // Guard: never remove a coach while active clients have nowhere to go
    if (activeCoachClients.length>0 && !transferTargetId) {
      alert('This coach still has active clients. Select a coach to transfer them to first.')
      return
    }
    const targetCoach = allCoaches.find(c=>c.uuid===transferTargetId)
    let transferred = 0
    activeCoachClients.forEach(c=>{
      transferClient(c.email, transferTargetId)
      addAudit('Eden Admin','Transferred client',c.name,`→ ${targetCoach?.name||'New Coach'}`)
      transferred++
    })
    const next = [...removedCoaches, pendingRemoval.uuid]
    setRemovedCoaches(next)
    localStorage.setItem('eden_removed_coaches', JSON.stringify(next))
    // Persist the removal so DB-driven org counts (and every other device) reflect it
    dbUpdate('user_profiles',`email=eq.${encodeURIComponent(pendingRemoval.email)}`,{is_active:false}).then(refreshOrgCounts).catch(()=>{})
    addAudit('Eden Admin','Removed coach',pendingRemoval.name,
      transferred>0?`${transferred} client${transferred!==1?'s':''} transferred to ${targetCoach?.name||'new coach'}`:'No active clients to transfer')
    setShowTransferModal(false)
    setPendingRemoval(null)
  }

  function markViewed(clientId) {
    setClients(prev=>prev.map(c=>c.uuid===clientId?{...c,hasUpdate:false}:c))
    setSelectedClient(prev=>prev?.uuid===clientId?{...prev,hasUpdate:false}:prev)
  }

  const openClientRef = useRef(null) // which client's consultation data is currently loading
  function openClient(client) {
    setSelectedClient(client)
    if (client.hasUpdate) markViewed(client.uuid)
    // Load this client's saved consultation data so admin/coach always see what's in the DB.
    // Track which client is open so late responses from a previous client never overwrite the current one.
    openClientRef.current = client.uuid
    setIntake({notes:'',startDate:'',startWeight:''})
    dbGet('client_intakes',`client_id=eq.${client.uuid}&order=updated_at.desc&limit=1`)
      .then(rows=>{ if (openClientRef.current!==client.uuid) return; const r=rows?.[0]; if (r) setIntake({notes:r.call_notes||'', startDate:r.start_date||'', startWeight:r.start_weight||''}) })
      .catch(()=>{})
    setCallNotes([])
    dbGet('consultation_notes',`client_id=eq.${client.uuid}&order=call_date.desc`)
      .then(rows=>{ if (openClientRef.current!==client.uuid) return; if (Array.isArray(rows)) setCallNotes(rows.map(n=>({ id:n.id, callDate:n.call_date, callType:n.call_type, summary:n.summary, focusPoints:n.focus_points, actionItems:n.action_items, nextCallDate:n.next_call_date, loomUrl:n.loom_url }))) })
      .catch(()=>{})
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
      // org_admin = a white-label company's admin: stored as super_admin scoped to their org
      const targetOrg = newUser.role==='org_admin' ? orgs.find(o=>o.name===newUser.orgName&&o.isWhiteLabel) : null
      if (newUser.role==='org_admin' && !targetOrg) { alert('Pick which organization this admin belongs to.'); return }
      const payload = {
        id:         crypto.randomUUID(),
        name:       newUser.name.trim(),
        email:      newUser.email.trim().toLowerCase(),
        role:       newUser.role==='org_admin' ? 'super_admin' : newUser.role,
        initials,
        company_id: targetOrg ? targetOrg.id : (adminCompanyId||null),
        update_day: newUser.role==='client'?newUser.checkInDay:null,
        temp_password: tempPass,
      }
      const result = await dbInsert('user_profiles', payload)
      profileId = Array.isArray(result)?result[0]?.id:result?.id
    } catch(e) { /* handled below */ }
    if (!profileId) {
      alert('Could not save this user to the database — their login will NOT work. Please check the details and try again.')
      return
    }

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
      coachName:  allCoaches.find(c=>c.uuid===newUser.coachId)?.name||'',
      checkInDay: newUser.checkInDay,
      hasUpdate:  false,
      lastSeen:   'Never',
      active:     true,
    }
    if (newUser.role==='client') setClients(prev=>[...prev,localUser])
    if (newUser.role==='va'||newUser.role==='head_coach')
      setSupportStaff(prev=>[...prev,{ id:localUser.uuid, name:localUser.name, email:localUser.email, role:newUser.role }])

    // New profile row is in the DB — refresh the org cards' coach/client counts
    refreshOrgCounts()

    // Show setup instructions card
    setLastAdded({ name:newUser.name.trim(), email:newUser.email.trim().toLowerCase(), role:newUser.role, tempPass })
    setAuditLog(prev=>[{id:Date.now(),actor:info.name,action:`Added ${newUser.role}`,target:newUser.name,detail:newUser.email,time:new Date().toLocaleString()},...prev])
    setNewUser({name:'',email:'',role:'client',coachId:'',checkInDay:'Wednesday'})
    setShowNewUser(false)
  }

  async function createOrg() {
    if (!newOrg.name.trim()) return
    const slug = newOrg.slug||newOrg.name.toLowerCase().replace(/\s+/g,'-')
    const inserted = await dbInsert('organizations',{
      name:           newOrg.name,
      slug,
      brand_color:    newOrg.brandColor,
      calendar_url:   newOrg.calendarUrl,
      billing_email:  newOrg.billingEmail,
      is_white_label: true,
      plan:           newOrg.plan,
      ...(colorsColSupported ? { brand_colors: newOrg.brandColors||[] } : {}),
    })
    const dbId = Array.isArray(inserted)?inserted[0]?.id:inserted?.id
    if (!dbId) { alert('Could not create the organization — please try again.'); return }
    // user_profiles.company_id references the companies table — mirror the org there with the same id
    const mirrored = await dbInsert('companies',{ id:dbId, name:newOrg.name, slug })
    if (!mirrored) {
      // Without the mirror row, admins for this org can't be created — roll back and surface the error
      await dbDelete('organizations', `id=eq.${dbId}`)
      alert('Could not finish creating the organization — please try again.')
      return
    }
    // Seed the new org with a copy of Eden's current habit & cardio libraries as their starting point.
    // Copies are independent — the org edits theirs freely without affecting Eden's.
    try {
      const [edenHabits, edenCardio, edenSupps, edenFoods, edenLinks] = await Promise.all([
        dbGet('company_habits',`company_id=eq.${EDEN_ORG_ID}&select=name,default_target`),
        dbGet('company_cardio_types',`company_id=eq.${EDEN_ORG_ID}&select=name`),
        dbGet('company_supplements',`company_id=eq.${EDEN_ORG_ID}&select=category,name,dose,directions,code,link,sort_order`),
        dbGet('company_foods',`company_id=eq.${EDEN_ORG_ID}&select=name,serving,cat,cal,pro,carb,fat,fib`),
        dbGet('company_resource_links',`company_id=eq.${EDEN_ORG_ID}&select=label,url,note,sort_order`).catch(()=>[]),
      ])
      let seedOk = true
      if (edenHabits?.length) {
        const r = await dbInsert('company_habits', edenHabits.map(h=>({name:h.name, default_target:h.default_target, company_id:dbId})))
        if (!r) seedOk = false
      }
      if (edenCardio?.length) {
        const r = await dbInsert('company_cardio_types', edenCardio.map(t=>({name:t.name, company_id:dbId})))
        if (!r) seedOk = false
      }
      if (edenSupps?.length) {
        const r = await dbInsert('company_supplements', edenSupps.map(s=>({...s, company_id:dbId})))
        if (!r) seedOk = false
      }
      if (edenFoods?.length) {
        const r = await dbInsert('company_foods', edenFoods.map(f=>({...f, company_id:dbId})))
        if (!r) seedOk = false
      }
      // Resource links: copy Eden's list if Eden has customized one; otherwise seed the built-in defaults
      const linkSeed = (Array.isArray(edenLinks)&&edenLinks.length)
        ? edenLinks.map(l=>({...l, company_id:dbId}))
        : DEFAULT_RESOURCE_LINKS.map(([label,url,note],i)=>({label,url,note:note||'',sort_order:i,company_id:dbId}))
      const rl = await dbInsert('company_resource_links', linkSeed)
      if (!rl) seedOk = false
      if (!seedOk) alert('The organization was created, but copying your starter habit/cardio/supplement lists into it failed. You can re-add them manually, or delete and recreate the organization.')
    } catch {
      alert('The organization was created, but copying your starter habit/cardio/supplement lists into it failed. You can re-add them manually, or delete and recreate the organization.')
    }
    const org = {
      id:           dbId,
      name:         newOrg.name,
      slug,
      isWhiteLabel: true,
      plan:         newOrg.plan,
      coachCount:   0,
      clientCount:  0,
      active:       true,
      brandColor:   newOrg.brandColor,
    }
    setOrgs(prev=>[...prev,org])
    setNewOrg({name:'',slug:'',brandColor:'#ffa600',brandColors:[],calendarUrl:'',billingEmail:'',plan:'standard'})
    setShowNewOrg(false)
    alert(`${newOrg.name} organization created. Now add their admin user using the + Add User button.`)
  }

  // ── Filtered client lists (active vs archived) ───────────
  const filteredClients = clients.filter(c=>{
    if (isDeactivated(c)) return false  // active only
    const ms = !clientSearch||c.name.toLowerCase().includes(clientSearch.toLowerCase())||c.email.toLowerCase().includes(clientSearch.toLowerCase())
    const mc = filterCoach==='All Coaches'||effectiveCoachName(c)===filterCoach
    return ms&&mc
  }).sort((a,b)=>{
    if (a.hasUpdate && !b.hasUpdate) return -1
    if (!a.hasUpdate && b.hasUpdate) return 1
    return 0
  })

  const archivedClients = clients.filter(c=>{
    if (!isDeactivated(c)) return false
    const ms = !clientSearch||c.name.toLowerCase().includes(clientSearch.toLowerCase())||c.email.toLowerCase().includes(clientSearch.toLowerCase())
    const mc = filterCoach==='All Coaches'||effectiveCoachName(c)===filterCoach
    return ms&&mc
  })

  const TABS_ADMIN = [
    ['dashboard', '📊 Dashboard'],
    ['clients',   '👥 Clients'],
    ['coaches',   '🏋 Staff'],
    ['orgs',      '🏢 Orgs'],
    ['library',   '📚 Library'],
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
            <Stat label="Total Coaches"  value={allCoaches.length}  color={C.success} sub="Active coaches"/>
            <Stat label="Pending Updates" value={pendingUpdates}       color={pendingUpdates>0?C.danger:C.success} sub={`Due ${todayDay}`}/>
            <Stat label="Orgs"           value={DEMO_ORGS.length}      color='#D4A8F0'   sub="White-label companies"/>
          </div>

          {/* Check-in summary */}
          <Card sx={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="Check-In Status — All Coaches"/>
              <span style={{fontSize:11,color:C.muted}}>{todayDay}</span>
            </div>
            {allCoaches.map(coach=>{
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

        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CLIENTS TAB (Admin + Coach)
      ══════════════════════════════════════════════════════ */}
      {tab==='clients'&&(isAdmin||isCoach)&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Client list */}
          <div style={{
            width: isMobile ? '100%' : (selectedClient ? 280 : undefined),
            flex: isMobile ? (selectedClient ? 0 : 1) : (selectedClient ? undefined : 1),
            display: isMobile && selectedClient ? 'none' : 'flex',
            flexDirection:'column',
            overflow:'hidden',
            borderRight: selectedClient && !isMobile ? `1px solid ${C.border}` : undefined
          }}>
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
                  {allCoaches.map(c=><option key={c.uuid}>{c.name}</option>)}
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
              {filteredClients.map((client, idx)=>{
                const featured = loomFeatured.has(client.name)
                const hidden   = loomMode && !featured
                const dispName = hidden ? `Client ${String.fromCharCode(65 + idx)}` : client.name
                const dispInitial = hidden ? '?' : client.name[0]
                function toggleFeatured(e) {
                  e.stopPropagation()
                  setLoomFeatured(prev => {
                    const next = new Set(prev)
                    if (next.has(client.name)) next.delete(client.name)
                    else next.add(client.name)
                    return next
                  })
                }
                return (
                  <div key={client.uuid} style={{position:'relative',borderBottom:`1px solid ${C.border}`}}>
                    <button onClick={()=>openClient(client)}
                      style={{width:'100%',textAlign:'left',background:selectedClient?.uuid===client.uuid?`${C.gold}15`:client.hasUpdate?`${C.gold}08`:C.surface,border:'none',borderLeft:`3px solid ${selectedClient?.uuid===client.uuid?C.gold:client.hasUpdate?C.gold+'88':'transparent'}`,padding:'11px 13px 11px 42px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:36,height:36,borderRadius:18,background:client.hasUpdate?C.gold:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:client.hasUpdate?C.black:C.gold,flexShrink:0,position:'relative'}}>
                        {dispInitial}
                        {!hidden && client.hasUpdate&&(
                          <div style={{position:'absolute',top:-3,right:-3,width:10,height:10,borderRadius:5,background:C.danger,border:`2px solid ${C.black}`}}/>
                        )}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:client.hasUpdate?700:500,color:selectedClient?.uuid===client.uuid?C.gold:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dispName}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {!hidden && isAdmin ? client.coachName+' · ' : ''}{hidden ? '—' : client.checkInDay+'s'}
                        </div>
                        {!hidden && (client.hasUpdate
                          ? <div style={{fontSize:9,color:C.gold,fontWeight:700,marginTop:2}}>● CHECK-IN PENDING REVIEW</div>
                          : <div style={{fontSize:9,color:C.success,fontWeight:700,marginTop:2}}>● ACTIVE</div>)}
                      </div>
                    </button>
                    {/* Loom visibility checkbox */}
                    <button
                      onClick={toggleFeatured}
                      title={featured ? 'Hide in Loom Mode' : 'Show name in Loom Mode'}
                      style={{
                        position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
                        width:20, height:20, borderRadius:5, flexShrink:0,
                        background: featured ? C.gold : 'transparent',
                        border:`2px solid ${featured ? C.gold : C.border}`,
                        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                        padding:0, transition:'all .15s',
                      }}>
                      {featured && (
                        <svg width="11" height="11" viewBox="0 0 12 12">
                          <polyline points="2,6 5,9 10,3" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* ── Archived / Deactivated clients ─────────────────── */}
            {archivedClients.length>0&&(
              <div style={{borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                <button onClick={()=>setArchiveOpen(v=>!v)}
                  style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',background:C.surface,border:'none',padding:'10px 14px',cursor:'pointer'}}>
                  <span style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>
                    🗄 Archived Clients ({archivedClients.length})
                  </span>
                  <span style={{fontSize:14,color:C.muted,transform:archiveOpen?'rotate(0)':'rotate(-90deg)',transition:'transform .2s'}}>▾</span>
                </button>
                {archiveOpen&&archivedClients.map(client=>(
                  <div key={client.uuid} style={{borderTop:`1px solid ${C.border}`,position:'relative'}}>
                    <button onClick={()=>openClient(client)}
                      style={{width:'100%',textAlign:'left',background:selectedClient?.uuid===client.uuid?`${C.dim}33`:C.surface,border:'none',padding:'10px 14px 10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,opacity:0.7}}>
                      <div style={{width:32,height:32,borderRadius:16,background:C.dim,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.muted,flexShrink:0}}>
                        {client.name[0]}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:500,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{client.name}</div>
                        <div style={{fontSize:9,color:C.danger,fontWeight:700,marginTop:2}}>● DEACTIVATED · {effectiveCoachName(client)}</div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client detail panel */}
          {selectedClient&&(
            <div style={{
              flex: 1,
              display: isMobile && !selectedClient ? 'none' : 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              width: isMobile ? '100%' : undefined
            }}>
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>setSelectedClient(null)}
                  style={{
                    background:'none',border:'none',color:C.muted,cursor:'pointer',
                    fontSize:18,padding:0, display: isMobile ? 'block' : 'block'
                  }}>←</button>
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

                {/* Account Status — admin can deactivate / reactivate */}
                {isAdmin&&(
                  <Card sx={{marginBottom:14,border:`1px solid ${isDeactivated(selectedClient)?C.danger+'55':C.border}`}}>
                    <div style={{display:'flex',flexDirection: isMobile ? 'column' : 'row', justifyContent:'space-between',alignItems: isMobile ? 'flex-start' : 'center', gap: 12}}>
                      <div>
                        <Lbl t="Account Status"/>
                        {isDeactivated(selectedClient)?(
                          <div>
                            <span style={{fontSize:11,background:`${C.danger}22`,color:C.danger,padding:'3px 9px',borderRadius:10,fontWeight:700}}>● DEACTIVATED</span>
                            <div style={{fontSize:10,color:C.muted,marginTop:4}}>
                              Client cannot log in. All data is preserved and still visible here.
                            </div>
                          </div>
                        ):(
                          <div>
                            <span style={{fontSize:11,background:`${C.success}22`,color:C.success,padding:'3px 9px',borderRadius:10,fontWeight:700}}>● ACTIVE</span>
                            <div style={{fontSize:10,color:C.muted,marginTop:4}}>
                              Client has full login access and can submit check-ins.
                            </div>
                          </div>
                        )}
                      </div>
                      {isDeactivated(selectedClient)?(
                        <div style={{display:'flex',flexDirection:'column',gap:6,alignItems: isMobile ? 'flex-start' : 'flex-end'}}>
                          <button onClick={()=>reactivateClient(selectedClient)}
                            style={{background:C.success,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
                            ✓ Reactivate
                          </button>
                          {isAdmin&&(
                            <div style={{fontSize:9,color:C.muted,textAlign: isMobile ? 'left' : 'right',maxWidth:140}}>
                              Restores login access. All past data remains intact.
                            </div>
                          )}
                        </div>
                      ):(
                        <button onClick={()=>{if(window.confirm(`Deactivate ${selectedClient.name}? They won't be able to log in, but all their data stays here.`)) deactivateClient(selectedClient)}}
                          style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.danger,fontSize:11,cursor:'pointer',whiteSpace:'nowrap', marginTop: isMobile ? 8 : 0}}>
                          Deactivate
                        </button>
                      )}
                    </div>
                    {isAdmin&&(
                      <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:'uppercase',fontWeight:700,marginBottom:6}}>Transfer to Coach</div>
                        <div style={{display:'flex',gap:8}}>
                          <select
                            defaultValue=""
                            onChange={e=>{ if(e.target.value){ transferClient(selectedClient.email,e.target.value); setSelectedClient(prev=>({...prev,coachName:allCoaches.find(c=>c.uuid===e.target.value)?.name||prev.coachName})) }}}
                            style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',color:C.white,fontSize:12,outline:'none'}}>
                            <option value="">Current: {effectiveCoachName(selectedClient)}</option>
                            {allCoaches.filter(c=>!removedCoaches.includes(c.uuid)).map(c=>(
                              <option key={c.uuid} value={c.uuid}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {/* Quick navigation to client tools */}
                <Card sx={{marginBottom:14}}>
                  <Lbl t="Client Tools"/>
                  <div style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:8}}>
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
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                            {docTypeLabel(doc.doc_type)} · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}
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
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setShowNewUser(true);setNewUser(p=>({...p,role:'va'}))}}
                style={{background:'none',border:`1px solid ${C.gold}66`,borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.gold,fontSize:12,cursor:'pointer'}}>
                + Add VA
              </button>
              <button onClick={()=>{setShowNewUser(true);setNewUser(p=>({...p,role:'coach'}))}}
                style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
                + Add Coach
              </button>
            </div>
          </div>
          {allCoaches.map(coach=>{
            const isRemoved    = removedCoaches.includes(coach.uuid)
            const isHC         = headCoaches.includes(coach.uuid)
            const coachClients = clients.filter(c=>effectiveCoachId(c)===coach.uuid)
            const activeClients   = coachClients.filter(c=>!isDeactivated(c))
            const archivedByCoach = coachClients.filter(c=>isDeactivated(c))
            const pending      = activeClients.filter(c=>c.hasUpdate).length
            return (
              <Card key={coach.uuid} sx={{marginBottom:10,opacity:isRemoved?0.55:1,border:`1px solid ${isRemoved?C.danger+'33':C.border}`}}>
                <div style={{display:'flex',flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center',gap:12}}>
                  <div style={{display:'flex', alignItems:'center', gap:12, width:'100%'}}>
                    <div style={{width:44,height:44,borderRadius:22,background:isRemoved?`${C.danger}15`:`${C.gold}22`,border:`2px solid ${isRemoved?C.danger+'33':C.gold+'44'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:isRemoved?C.danger:C.gold,flexShrink:0}}>
                      {coach.name[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:isRemoved?C.muted:C.white,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                        {coach.name}
                        {isHC&&!isRemoved&&(
                          <span style={{fontSize:9,fontWeight:800,letterSpacing:0.8,background:`${C.gold}22`,border:`1px solid ${C.gold}66`,color:C.gold,padding:'2px 7px',borderRadius:8}}>★ HEAD COACH</span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{coach.email}</div>
                      <div style={{display:'flex',gap:12,marginTop:5,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,color:C.gold,fontWeight:600}}>{activeClients.length} active client{activeClients.length!==1?'s':''}</span>
                        {archivedByCoach.length>0&&<span style={{fontSize:10,color:C.muted,fontWeight:600}}>{archivedByCoach.length} archived</span>}
                        {pending>0&&<span style={{fontSize:10,color:C.danger,fontWeight:600}}>{pending} pending</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection: isMobile ? 'row' : 'column',gap:5,alignItems: isMobile ? 'center' : 'flex-end', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end'}}>
                    <span style={{fontSize:10,background:isRemoved?`${C.danger}22`:`${C.success}22`,color:isRemoved?C.danger:C.success,padding:'3px 8px',borderRadius:10,fontWeight:700}}>
                      {isRemoved?'REMOVED':'ACTIVE'}
                    </span>
                    {!isRemoved&&(
                      <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:isMobile?'flex-end':'flex-end'}}>
                        {isHC?(
                          <button onClick={()=>demoteFromHeadCoach(coach)}
                            style={{fontSize:10,background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 8px',color:C.muted,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
                            Remove HC Role
                          </button>
                        ):(
                          <button onClick={()=>promoteToHeadCoach(coach)}
                            style={{fontSize:10,background:`${C.gold}15`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'3px 8px',color:C.gold,cursor:'pointer',fontWeight:700,whiteSpace:'nowrap'}}>
                            ★ Promote to Head Coach
                          </button>
                        )}
                        <button onClick={()=>confirmRemoveCoach(coach)}
                          style={{fontSize:10,background:'none',border:`1px solid ${C.danger}44`,borderRadius:6,padding:'3px 8px',color:C.danger,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
                          Remove Coach
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {/* Coach's active clients */}
                {activeClients.length>0&&(
                  <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Active Clients — click to open</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {activeClients.map(c=>(
                        <button key={c.uuid}
                          onClick={()=>{ openClient(c); setTab('clients') }}
                          style={{fontSize:11,background:c.hasUpdate?`${C.gold}22`:C.surface,border:`1px solid ${c.hasUpdate?C.gold+'44':C.border}`,borderRadius:6,padding:'4px 10px',color:c.hasUpdate?C.gold:C.white,cursor:'pointer'}}>
                          {c.name}{c.hasUpdate?' 🔔':''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Archived clients under this coach */}
                {archivedByCoach.length>0&&(
                  <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🗄 Archived / Deactivated</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {archivedByCoach.map(c=>(
                        <button key={c.uuid}
                          onClick={()=>{ openClient(c); setTab('clients') }}
                          style={{fontSize:11,background:`${C.danger}11`,border:`1px solid ${C.danger}33`,borderRadius:6,padding:'4px 10px',color:C.muted,cursor:'pointer'}}>
                          {c.name} ✕
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}

          {/* ── Support staff (VAs, head coaches) from the database ── */}
          <div style={{fontSize:14,fontWeight:700,color:C.white,margin:'20px 0 10px'}}>Support Staff</div>
          {supportStaff.length===0&&(
            <Card><div style={{fontSize:12,color:C.muted,textAlign:'center',padding:'8px 0'}}>No VAs or additional staff yet — use "+ Add VA" above.</div></Card>
          )}
          {supportStaff.map(s=>(
            <Card key={s.id} sx={{marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:20,background:`${C.gold}15`,border:`1px solid ${C.gold}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:C.gold,flexShrink:0}}>
                  {(s.name||s.full_name||'?')[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.white}}>{s.name||s.full_name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{s.email}</div>
                </div>
                <span style={{fontSize:10,background:`${C.gold}18`,color:C.gold,padding:'3px 9px',borderRadius:10,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>
                  {(s.role||'').replace(/_/g,' ')}
                </span>
              </div>
            </Card>
          ))}
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
            <button onClick={()=>{ if(!planOptions.includes(newOrg.plan)) setNO('plan')(planOptions[0]); setShowNewOrg(true) }}
              style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
              + New Org
            </button>
          </div>

          {/* ── Packages & Pricing ── */}
          <Card sx={{marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:2}}>💰 Packages & Pricing</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
              These tiers drive the plan choices for white-label orgs and the MRR total on your Overview. Edit prices anytime — MRR recalculates automatically.
            </div>
            {!pkgsLoaded && <div style={{fontSize:11,color:C.muted}}>Loading tiers…</div>}
            {pkgsLoaded && packages.length===0 && (
              <div style={{fontSize:11,color:C.warning||'#e8b74f',marginBottom:10}}>
                No tiers yet — add your first one below. (If adding fails, the packages table hasn't been created in the database yet.)
              </div>
            )}
            {packages.map(pkg=>(
              <div key={pkg.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.surface,borderRadius:8,marginBottom:6}}>
                {editPkg?.id===pkg.id ? (
                  <>
                    <input value={editPkg.name} onChange={e=>setEditPkg(p=>({...p,name:e.target.value}))}
                      style={{flex:2,background:C.card,border:`1px solid ${C.gold}66`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none'}}/>
                    <div style={{display:'flex',alignItems:'center',gap:4,flex:1}}>
                      <span style={{fontSize:12,color:C.muted}}>$</span>
                      <input value={editPkg.price} onChange={e=>setEditPkg(p=>({...p,price:e.target.value}))} inputMode="decimal"
                        style={{width:'100%',background:C.card,border:`1px solid ${C.gold}66`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none'}}/>
                      <span style={{fontSize:11,color:C.muted}}>/mo</span>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:C.muted,cursor:'pointer',whiteSpace:'nowrap'}}>
                      <input type="checkbox" checked={!!editPkg.includes_recipes} onChange={e=>setEditPkg(p=>({...p,includes_recipes:e.target.checked}))}/>🍽 Recipe Book
                    </label>
                    <button onClick={savePackage}
                      style={{background:C.gold,border:'none',borderRadius:6,padding:'6px 12px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>Save</button>
                    <button onClick={()=>setEditPkg(null)}
                      style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 10px',color:C.muted,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div style={{flex:2}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.white,textTransform:'capitalize'}}>{pkg.name}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:2}}>
                        Includes: {pkg.includes_recipes?'🍽 Recipe Book':'their own content only'} · 🎓 Eden Courses set per course below
                      </div>
                      {(()=>{ const list = edenCourses.filter(c=>Array.isArray(c.tiers)&&c.tiers.includes(pkg.id)); return (
                        <div style={{marginTop:4}}>
                          <button onClick={()=>setPkgCoursesOpen(o=>o===pkg.id?null:pkg.id)} disabled={!list.length}
                            style={{background:'none',border:'none',padding:0,fontSize:9,color:list.length?C.gold:C.muted,cursor:list.length?'pointer':'default',fontWeight:700}}>
                            🎓 {list.length} Eden course{list.length===1?'':'s'} distributed to this tier{list.length?(pkgCoursesOpen===pkg.id?' ▾':' ▸'):''}
                          </button>
                          {pkgCoursesOpen===pkg.id&&list.length>0&&(
                            <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:2}}>
                              {list.map(c=>(
                                <div key={c.id} style={{fontSize:9,color:C.white,background:C.card,border:`1px solid ${C.border}`,borderRadius:5,padding:'3px 7px'}}>
                                  {c.title}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )})()}
                    </div>
                    <div style={{flex:1,fontSize:13,fontWeight:700,color:C.gold}}>${Number(pkg.price)}/mo</div>
                    <button onClick={()=>setEditPkg({id:pkg.id,name:pkg.name,price:String(pkg.price),includes_recipes:!!pkg.includes_recipes})}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>Edit</button>
                    <button onClick={()=>deletePackage(pkg)}
                      style={{background:`${C.danger}18`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'6px 10px',color:C.danger,fontSize:11,cursor:'pointer'}}>✕</button>
                  </>
                )}
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <input value={newPkg.name} onChange={e=>setNewPkg(p=>({...p,name:e.target.value}))} placeholder="Tier name (e.g. Standard)"
                style={{flex:2,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
              <input value={newPkg.price} onChange={e=>setNewPkg(p=>({...p,price:e.target.value}))} placeholder="Price / mo" inputMode="decimal"
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
              <button onClick={addPackage} disabled={!newPkg.name.trim()||isNaN(parseFloat(newPkg.price))}
                style={{background:C.gold,border:'none',borderRadius:6,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',
                  opacity:(!newPkg.name.trim()||isNaN(parseFloat(newPkg.price)))?.5:1}}>+ Add Tier</button>
            </div>
            <div style={{display:'flex',gap:14,marginTop:8}}>
              <label style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.muted,cursor:'pointer'}}>
                <input type="checkbox" checked={newPkg.includes_recipes} onChange={e=>setNewPkg(p=>({...p,includes_recipes:e.target.checked}))}/>Includes 🍽 Recipe Book
              </label>
            </div>
          </Card>

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
                  <div style={{display:'flex',gap:4,alignItems:'center',marginTop:5,flexWrap:'wrap'}}>
                    {[org.brandColor,...(org.brandColors||[])].filter(Boolean).map((c,i)=>(
                      <span key={i} title={i===0?`${c} (primary)`:c}
                        style={{width:14,height:14,borderRadius:7,background:c,display:'inline-block',
                          border:i===0?`2px solid ${C.white}55`:'1px solid #333',boxSizing:'border-box',flexShrink:0}}/>
                    ))}
                    <span style={{fontSize:9,color:C.muted,marginLeft:2}}>
                      {(org.brandColors||[]).length?`Palette (${1+(org.brandColors||[]).length})`:'Primary only'}
                    </span>
                  </div>
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
                  <button onClick={()=>setManageOrg({...org})}
                    style={{flex:1,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:7,padding:'8px',color:C.gold,fontSize:10,fontWeight:700,cursor:'pointer'}}>
                    ⚙ Manage
                  </button>
                </div>
              </div>

              {/* What this org's clients get */}
              {org.isWhiteLabel&&(()=>{ const t=tierOf(org.plan); return (
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Included by their tier{t?` (${t.name})`:''}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {[['🍽 Recipe Book',!!t?.includes_recipes]].map(([label,on])=>(
                      <span key={label} style={{fontSize:10,background:on?`${C.success}22`:`${C.danger}15`,border:`1px solid ${on?C.success:C.danger}33`,borderRadius:6,padding:'3px 8px',color:on?C.success:C.danger}}>
                        {on?'✓':'✕'} {label}
                      </span>
                    ))}
                    {['🔗 Connect Links','📅 Calendar','📚 Own Courses'].map(label=>(
                      <span key={label} style={{fontSize:10,background:`${C.gold}15`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:'3px 8px',color:C.gold}}>
                        {label} — their admin
                      </span>
                    ))}
                  </div>
                  {t&&(()=>{ const list = edenCourses.filter(c=>Array.isArray(c.tiers)&&c.tiers.includes(t.id)); return (
                    <div style={{marginTop:8}}>
                      <button onClick={()=>setOrgCoursesOpen(o=>o===org.id?null:org.id)} disabled={!list.length}
                        style={{background:'none',border:'none',padding:0,fontSize:9,color:list.length?C.gold:C.muted,cursor:list.length?'pointer':'default',fontWeight:700}}>
                        🎓 {list.length} Eden course{list.length===1?'':'s'} their clients can access{list.length?(orgCoursesOpen===org.id?' ▾':' ▸'):''}
                      </button>
                      {orgCoursesOpen===org.id&&list.length>0&&(
                        <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:2}}>
                          {list.map(c=>(
                            <div key={c.id} style={{fontSize:9,color:C.white,background:C.card,border:`1px solid ${C.border}`,borderRadius:5,padding:'3px 7px'}}>
                              {c.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )})()}
                  <div style={{fontSize:9,color:C.muted,marginTop:6}}>
                    {!t&&'⚠ Their plan doesn\u2019t match any current tier — open Manage to assign one, then their Eden course list will appear here. '}
                    Recipe Book follows the tier; Eden Courses are distributed per course from the course library. Connect links, calendar, and their own courses are managed by their admin.
                  </div>
                </div>
              )})()}
            </Card>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          AUDIT LOG (Admin only)
      ══════════════════════════════════════════════════════ */}
      {tab==='library'&&isAdmin&&(
        <LibraryTab companyId={adminCompanyId||EDEN_ORG_ID}/>
      )}

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
            <div style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:12,marginTop:14}}>
              <Inp label="Start Date" value={intake.startDate} onChange={isCoach||isAdmin?setI('startDate'):undefined} type="date" disabled={isClient}/>
              <Inp label="Starting Weight (lbs)" value={intake.startWeight} onChange={isCoach||isAdmin?setI('startWeight'):undefined} placeholder="e.g. 185" disabled={isClient}/>
            </div>

            {(isCoach||isAdmin)&&(
              <button onClick={saveIntake}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginTop:4}}>
                Save Intake Record
              </button>
            )}

            {/* Onboarding documents pushed from the admin Documents panel */}
            {adminDocs.filter(d=>d.doc_type==='onboarding').length>0&&(
              <div style={{marginTop:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:2}}>Onboarding Documents</div>
                {adminDocs.filter(d=>d.doc_type==='onboarding').map(renderDocRow)}
              </div>
            )}
          </Card>

          {/* Part 2: Ongoing call notes */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.white}}>Call Notes History</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>Monthly calls, emergency calls, therapy sessions, strategy calls</div>
            </div>
            {(isCoach||isAdmin)&&(
              <button onClick={()=>setShowNewCall(true)}
                style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>
                + Add Call Note
              </button>
            )}
          </div>

          {/* Monthly check-in / emergency call documents pushed from the admin Documents panel */}
          {adminDocs.filter(d=>d.doc_type==='monthly'||d.doc_type==='emergency').length>0&&(
            <Card sx={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:2}}>Call Documents</div>
              {adminDocs.filter(d=>d.doc_type==='monthly'||d.doc_type==='emergency').map(renderDocRow)}
            </Card>
          )}

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
                1. Send them these credentials — they can log in right away with this temporary password.<br/>
                2. Their profile is saved in Supabase, ready for real auth when you enable it.<br/>
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
              options={DOC_TYPES.map(d=>({value:d.v,label:d.l}))}/>
            <div style={{fontSize:10,color:C.gold,margin:'-4px 0 10px'}}>
              {DOC_TYPES.find(d=>d.v===newDoc.doc_type)?.dest}
            </div>
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
            <Sel label="Role" value={newUser.role} onChange={setNU('role')} options={['client','coach','head_coach','va','org_admin']}/>
            {newUser.role==='org_admin'&&(
              orgs.filter(o=>o.isWhiteLabel).length
                ? <Sel label="Their Organization" value={newUser.orgName||''} onChange={setNU('orgName')}
                    options={['— select org —',...orgs.filter(o=>o.isWhiteLabel).map(o=>o.name)]}/>
                : <div style={{fontSize:11,color:C.danger,marginBottom:10}}>No white-label orgs yet — create the org first in the Orgs tab.</div>
            )}
            {newUser.role==='client'&&(
              <>
                <Sel label="Assign to Coach" value={newUser.coachId||''} onChange={setNU('coachId')}
                  options={['', ...allCoaches.map(c=>c.uuid)]}/>
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
              <div style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:12,marginBottom:10}}>
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
      {manageOrg&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setManageOrg(null)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,padding:24,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>Manage — {manageOrg.name}</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Change their tier, branding, or status. MRR updates automatically when the tier changes.</div>
            <Inp label="Company Name" value={manageOrg.name} onChange={v=>setManageOrg(p=>({...p,name:v}))}/>
            {manageOrg.isWhiteLabel
              ? <Sel label="Tier / Package" value={manageOrg.plan} onChange={v=>setManageOrg(p=>({...p,plan:v}))}
                  options={planOptions.includes(manageOrg.plan)?planOptions:[manageOrg.plan,...planOptions]}/>
              : <div style={{fontSize:11,color:C.muted,margin:'6px 0 10px'}}>Platform owner — no tier applies.</div>}
            <Inp label="Billing Email" value={manageOrg.billingEmail||''} onChange={v=>setManageOrg(p=>({...p,billingEmail:v}))} type="email"/>
            <Inp label="Calendar / Booking URL" value={manageOrg.calendarUrl||''} onChange={v=>setManageOrg(p=>({...p,calendarUrl:v}))} placeholder="Their booking link (they can also manage this)"/>
            <ColorRow primary={manageOrg.brandColor} colors={manageOrg.brandColors||[]}
              onPrimary={v=>setManageOrg(p=>({...p,brandColor:v}))}
              onColors={v=>setManageOrg(p=>({...p,brandColors:v}))}/>
            {manageOrg.isWhiteLabel&&(
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:C.white,cursor:'pointer',marginBottom:14}}>
                <input type="checkbox" checked={!!manageOrg.active} onChange={e=>setManageOrg(p=>({...p,active:e.target.checked}))}/>
                Organization active {!manageOrg.active&&<span style={{fontSize:10,color:C.danger}}>(inactive orgs don't count toward MRR)</span>}
              </label>
            )}
            <div style={{display:'flex',gap:10,marginTop:6}}>
              <button onClick={()=>setManageOrg(null)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={saveManagedOrg} disabled={!manageOrg.name.trim()}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:manageOrg.name.trim()?1:.5}}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewOrg&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowNewOrg(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,padding:24}}>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>Create White-Label Org</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Each org gets their own coaches, clients, branding, and admin access. They manage their company — you manage the platform.</div>
            <Inp label="Company Name" value={newOrg.name} onChange={setNO('name')} placeholder="e.g. Peak Performance Coaching"/>
            <Inp label="URL Slug" value={newOrg.slug} onChange={setNO('slug')} placeholder="e.g. peak-performance (auto-generated if blank)"/>
            <Inp label="Billing Email" value={newOrg.billingEmail} onChange={setNO('billingEmail')} placeholder="billing@company.com" type="email"/>
            <Sel label="Plan" value={newOrg.plan} onChange={setNO('plan')} options={planOptions}/>
            <ColorRow primary={newOrg.brandColor} colors={newOrg.brandColors||[]}
              onPrimary={setNO('brandColor')}
              onColors={setNO('brandColors')}/>
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

      {/* ══════════════════════════════════════════════════════
          COACH REMOVAL + CLIENT TRANSFER MODAL
      ══════════════════════════════════════════════════════ */}
      {showTransferModal&&pendingRemoval&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:24,width:'100%',maxWidth:440}}>
            <div style={{fontSize:16,fontWeight:800,color:C.white,marginBottom:4}}>Remove Coach: {pendingRemoval.name}</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20,lineHeight:1.5}}>
              This coach will be marked as removed. Choose what happens to their active clients below.
            </div>

            {(()=>{
              const activeC    = clients.filter(c=>effectiveCoachId(c)===pendingRemoval.uuid&&!isDeactivated(c))
              const archivedC  = clients.filter(c=>effectiveCoachId(c)===pendingRemoval.uuid&&isDeactivated(c))
              const available  = allCoaches.filter(c=>c.uuid!==pendingRemoval.uuid&&!removedCoaches.includes(c.uuid))
              return (
                <>
                  {activeC.length>0?(
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>
                        Active Clients ({activeC.length}) — Transfer To
                      </div>
                      <select value={transferTargetId} onChange={e=>setTransferTargetId(e.target.value)}
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:13,outline:'none',marginBottom:8}}>
                        {available.length===0&&<option value="">No other coaches available</option>}
                        {available.map(c=><option key={c.uuid} value={c.uuid}>{c.name}</option>)}
                      </select>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {activeC.map(c=>(
                          <span key={c.uuid} style={{fontSize:10,background:`${C.gold}15`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:'3px 9px',color:C.gold}}>
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ):(
                    <div style={{marginBottom:16,background:C.surface,borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontSize:12,color:C.muted}}>No active clients to transfer.</div>
                    </div>
                  )}

                  {archivedC.length>0&&(
                    <div style={{marginBottom:16,background:`${C.dim}44`,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>
                        🗄 Deactivated Clients ({archivedC.length}) — Stored in Admin Archive
                      </div>
                      <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                        All data preserved. You can view, transfer, or reactivate these clients at any time from the Clients tab.
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            <div style={{display:'flex',gap:10,marginTop:6}}>
              <button onClick={()=>{setShowTransferModal(false);setPendingRemoval(null)}}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={executeRemoveCoach}
                style={{flex:2,background:C.danger,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.white,fontSize:13,cursor:'pointer'}}>
                Confirm Remove Coach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// LIBRARY TAB — company-wide foods, supplements, habits & cardio
// Every org's admin (Eden or white-label) edits their OWN library;
// changes go live for all coaches in that org immediately.
// ════════════════════════════════════════════════════════════
const FOOD_CATS = ['Proteins','Carbohydrates','Fats','Fruits/Vegetables','Supplements','Drinks/Condiments']

function LibInput({value,onChange,placeholder,flex=1,type='text'}) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{flex,minWidth:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
}
function LibBtn({onClick,children,kind='gold'}) {
  const bg = kind==='gold'?C.gold:kind==='danger'?`${C.danger}22`:C.surface
  const col= kind==='gold'?C.black:kind==='danger'?C.danger:C.muted
  const bd = kind==='gold'?'none':`1px solid ${kind==='danger'?C.danger+'44':C.border}`
  return <button onClick={onClick} style={{background:bg,border:bd,borderRadius:8,padding:'8px 14px',fontWeight:700,color:col,fontSize:12,cursor:'pointer',flexShrink:0}}>{children}</button>
}

function LibraryTab({companyId}) {
  const [sub,     setSub]     = useState('foods')
  const [loading, setLoading] = useState(true)
  const [foods,   setFoods]   = useState([])
  const [supps,   setSupps]   = useState([])
  const [habits,  setHabits]  = useState([])
  const [cardio,  setCardio]  = useState([])
  const [links,   setLinks]   = useState([])           // company_resource_links rows
  const [hidden,  setHidden]  = useState(new Set())    // hidden built-ins, keys "kind:name"
  const [editRow, setEditRow] = useState(null)  // {kind, ...fields}
  const [addRow,  setAddRow]  = useState(null)  // {kind, ...fields}

  useEffect(()=>{ let stale=false; (async()=>{
    setLoading(true)
    const [f,s,h,c,l,hd] = await Promise.all([
      dbGet('company_foods',`company_id=eq.${companyId}&order=created_at.asc`),
      dbGet('company_supplements',`company_id=eq.${companyId}&order=sort_order.asc,name.asc`),
      dbGet('company_habits',`company_id=eq.${companyId}&order=created_at.asc`),
      dbGet('company_cardio_types',`company_id=eq.${companyId}&order=created_at.asc`),
      dbGet('company_resource_links',`company_id=eq.${companyId}&order=sort_order.asc,created_at.asc`).catch(()=>[]),
      dbGet('company_hidden_items',`company_id=eq.${companyId}&select=kind,name`).catch(()=>[]),
    ])
    if (stale) return
    setFoods(f||[]); setSupps(s||[]); setHabits(h||[]); setCardio(c||[])
    setLinks(Array.isArray(l)?l:[])
    setHidden(new Set((Array.isArray(hd)?hd:[]).map(r=>`${r.kind}:${r.name}`)))
    setLoading(false)
  })(); return ()=>{ stale=true } },[companyId])

  // ── Hide / restore built-in items (foods, habits, cardio) ──
  async function hideBuiltIn(kind, name) {
    if (!window.confirm(`Hide the built-in "${name}" for all coaches in this company? You can restore it any time.`)) return
    const ins = await dbInsert('company_hidden_items',{company_id:companyId,kind,name})
    const r = Array.isArray(ins)?ins[0]:ins
    if (!r?.id) { alert('Could not hide it — please try again. (The company_hidden_items table may not exist yet.)'); return }
    setHidden(p=>new Set([...p,`${kind}:${name}`]))
  }
  async function restoreBuiltIn(kind, name) {
    await dbDelete('company_hidden_items',`company_id=eq.${companyId}&kind=eq.${kind}&name=eq.${encodeURIComponent(name)}`)
    setHidden(p=>{const n=new Set(p); n.delete(`${kind}:${name}`); return n})
  }

  // ── Resource links ──
  async function saveLink(row) {
    const body = { label:row.label?.trim(), url:row.url?.trim(), note:row.note?.trim()||'' }
    if (!body.label||!body.url) { alert('Name and link are required.'); return }
    if (row.id) {
      const ok = await dbUpdate('company_resource_links',`id=eq.${row.id}&company_id=eq.${companyId}`,body)
      if (!ok) { alert('Could not save the change — please try again.'); return }
      setLinks(p=>p.map(x=>x.id===row.id?{...x,...body}:x)); setEditRow(null)
    } else {
      const ins = await dbInsert('company_resource_links',{...body,company_id:companyId,sort_order:links.length})
      const r = Array.isArray(ins)?ins[0]:ins
      if (!r?.id) { alert('Could not save the link — please try again.'); return }
      setLinks(p=>[...p,r]); setAddRow(null)
    }
  }
  async function deleteLink(row) {
    if (!window.confirm(`Remove "${row.label}" from your resources list?`)) return
    await dbDelete('company_resource_links',`id=eq.${row.id}&company_id=eq.${companyId}`)
    setLinks(p=>p.filter(x=>x.id!==row.id))
  }

  // ── Foods ──
  async function saveFood(row) {
    const body = { name:row.name?.trim(), serving:row.serving?.trim(), cat:row.cat||FOOD_CATS[0],
      cal:parseFloat(row.cal)||0, pro:parseFloat(row.pro)||0, carb:parseFloat(row.carb)||0,
      fat:parseFloat(row.fat)||0, fib:parseFloat(row.fib)||0 }
    if (!body.name||!body.serving) { alert('Name and serving are required.'); return }
    if (row.id) {
      const ok = await dbUpdate('company_foods',`id=eq.${row.id}&company_id=eq.${companyId}`,body)
      if (!ok) { alert('Could not save the change — please try again.'); return }
      setFoods(p=>p.map(x=>x.id===row.id?{...x,...body}:x)); setEditRow(null)
    } else {
      const ins = await dbInsert('company_foods',{...body,company_id:companyId})
      const r = Array.isArray(ins)?ins[0]:ins
      if (!r?.id) { alert('Could not save the food — please try again.'); return }
      setFoods(p=>[...p,r]); setAddRow(null)
    }
  }
  async function deleteFood(row) {
    if (!window.confirm(`Remove "${row.name}" for all coaches?`)) return
    await dbDelete('company_foods',`id=eq.${row.id}&company_id=eq.${companyId}`)
    setFoods(p=>p.filter(x=>x.id!==row.id))
  }

  // ── Supplements ──
  async function saveSupp(row) {
    const body = { category:row.category?.trim()||'Other', name:row.name?.trim(), dose:row.dose?.trim()||'',
      directions:row.directions?.trim()||'', code:row.code?.trim()||'', link:row.link?.trim()||'' }
    if (!body.name) { alert('Name is required.'); return }
    if (row.id) {
      const ok = await dbUpdate('company_supplements',`id=eq.${row.id}&company_id=eq.${companyId}`,body)
      if (!ok) { alert('Could not save the change — please try again.'); return }
      setSupps(p=>p.map(x=>x.id===row.id?{...x,...body}:x)); setEditRow(null)
    } else {
      const ins = await dbInsert('company_supplements',{...body,company_id:companyId,sort_order:supps.length})
      const r = Array.isArray(ins)?ins[0]:ins
      if (!r?.id) { alert('Could not save the supplement — please try again.'); return }
      setSupps(p=>[...p,r]); setAddRow(null)
    }
  }
  async function deleteSupp(row) {
    if (!window.confirm(`Remove "${row.name}" for all coaches?`)) return
    await dbDelete('company_supplements',`id=eq.${row.id}&company_id=eq.${companyId}`)
    setSupps(p=>p.filter(x=>x.id!==row.id))
  }

  // ── Habits ──
  async function saveHabit(row) {
    const body = { name:row.name?.trim(), default_target:parseInt(row.default_target)||7 }
    if (!body.name) { alert('Name is required.'); return }
    if (row.id) {
      const ok = await dbUpdate('company_habits',`id=eq.${row.id}&company_id=eq.${companyId}`,body)
      if (!ok) { alert('Could not save the change — please try again.'); return }
      setHabits(p=>p.map(x=>x.id===row.id?{...x,...body}:x)); setEditRow(null)
    } else {
      const ins = await dbInsert('company_habits',{...body,company_id:companyId})
      const r = Array.isArray(ins)?ins[0]:ins
      if (!r?.id) { alert('Could not save the habit — please try again.'); return }
      setHabits(p=>[...p,r]); setAddRow(null)
    }
  }
  async function deleteHabit(row) {
    if (!window.confirm(`Remove habit "${row.name}" for all coaches?`)) return
    await dbDelete('company_habits',`id=eq.${row.id}&company_id=eq.${companyId}`)
    setHabits(p=>p.filter(x=>x.id!==row.id))
  }

  // ── Cardio types ──
  async function saveCardio(row) {
    const name = row.name?.trim()
    if (!name) { alert('Name is required.'); return }
    if (row.id) {
      const ok = await dbUpdate('company_cardio_types',`id=eq.${row.id}&company_id=eq.${companyId}`,{name})
      if (!ok) { alert('Could not save the change — please try again.'); return }
      setCardio(p=>p.map(x=>x.id===row.id?{...x,name}:x)); setEditRow(null)
    } else {
      const ins = await dbInsert('company_cardio_types',{name,company_id:companyId})
      const r = Array.isArray(ins)?ins[0]:ins
      if (!r?.id) { alert('Could not save the cardio type — please try again.'); return }
      setCardio(p=>[...p,r]); setAddRow(null)
    }
  }
  async function deleteCardio(row) {
    if (!window.confirm(`Remove cardio type "${row.name}" for all coaches?`)) return
    await dbDelete('company_cardio_types',`id=eq.${row.id}&company_id=eq.${companyId}`)
    setCardio(p=>p.filter(x=>x.id!==row.id))
  }

  const SUBS = [['foods','🥗 Foods'],['supps','💊 Supplements'],['habits','✅ Habits'],['cardio','🏃 Cardio Types'],['links','🔗 Resources']]
  // Built-in chip with hide/restore — used by foods, habits and cardio sections
  const builtInRow = (kind, name, sub2) => {
    const isHidden = hidden.has(`${kind}:${name}`)
    return (
      <div key={`bi_${name}`} style={{...rowStyle,opacity:isHidden?0.45:1}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:13,color:C.white,fontWeight:600,textDecoration:isHidden?'line-through':'none'}}>{name}</span>
          <span style={{fontSize:8,fontWeight:700,color:C.muted,marginLeft:8,letterSpacing:0.5,border:`1px solid ${C.border}`,borderRadius:4,padding:'1px 5px',verticalAlign:'middle'}}>BUILT-IN</span>
          {sub2&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{sub2}</div>}
        </div>
        {isHidden
          ? <LibBtn kind="plain" onClick={()=>restoreBuiltIn(kind,name)}>Restore</LibBtn>
          : <LibBtn kind="danger" onClick={()=>hideBuiltIn(kind,name)}>Hide</LibBtn>}
      </div>
    )
  }
  const suppCats = [...new Set(supps.map(s=>s.category||'Other'))]

  const foodForm = (row,setRow,onSave,onCancel)=>(
    <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:10,padding:12,marginBottom:8}}>
      <div style={{display:'flex',gap:6,marginBottom:6}}>
        <LibInput flex={2} value={row.name||''}    onChange={v=>setRow(p=>({...p,name:v}))}    placeholder="Food name"/>
        <LibInput value={row.serving||''} onChange={v=>setRow(p=>({...p,serving:v}))} placeholder="Serving (e.g. 4oz)"/>
        <select value={row.cat||FOOD_CATS[0]} onChange={e=>setRow(p=>({...p,cat:e.target.value}))}
          style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:8,color:C.white,fontSize:12,outline:'none',cursor:'pointer'}}>
          {FOOD_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        {[['cal','Cal'],['pro','Protein g'],['carb','Carbs g'],['fat','Fat g'],['fib','Fiber g']].map(([k,ph])=>(
          <LibInput key={k} value={row[k]??''} onChange={v=>setRow(p=>({...p,[k]:v}))} placeholder={ph}/>
        ))}
      </div>
      <div style={{display:'flex',gap:6}}><LibBtn onClick={onSave}>Save</LibBtn><LibBtn kind="plain" onClick={onCancel}>Cancel</LibBtn></div>
    </div>
  )
  const suppForm = (row,setRow,onSave,onCancel)=>(
    <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:10,padding:12,marginBottom:8}}>
      <div style={{display:'flex',gap:6,marginBottom:6}}>
        <LibInput value={row.category||''} onChange={v=>setRow(p=>({...p,category:v}))} placeholder="Protocol / category"/>
        <LibInput flex={2} value={row.name||''} onChange={v=>setRow(p=>({...p,name:v}))} placeholder="Supplement name"/>
        <LibInput value={row.dose||''} onChange={v=>setRow(p=>({...p,dose:v}))} placeholder="Dose"/>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <LibInput flex={2} value={row.directions||''} onChange={v=>setRow(p=>({...p,directions:v}))} placeholder="Directions"/>
        <LibInput value={row.code||''} onChange={v=>setRow(p=>({...p,code:v}))} placeholder="Discount code (optional)"/>
        <LibInput flex={2} value={row.link||''} onChange={v=>setRow(p=>({...p,link:v}))} placeholder="Purchase link (optional)"/>
      </div>
      <div style={{display:'flex',gap:6}}><LibBtn onClick={onSave}>Save</LibBtn><LibBtn kind="plain" onClick={onCancel}>Cancel</LibBtn></div>
    </div>
  )

  const rowStyle={background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px',marginBottom:6,display:'flex',alignItems:'center',gap:10}
  const editBtn=(row,kind)=><button onClick={()=>{setAddRow(null);setEditRow({kind,...row})}} title="Edit"
    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 8px',color:C.muted,fontSize:11,cursor:'pointer',flexShrink:0}}>✎</button>

  return (
    <div style={{flex:1,overflowY:'auto',padding:16}}>
      <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:4}}>📚 Company Library</div>
      <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Everything here is shared company-wide — all your coaches see these lists when building client programs.</div>

      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {SUBS.map(([k,l])=>(
          <button key={k} onClick={()=>{setSub(k);setEditRow(null);setAddRow(null)}}
            style={{background:sub===k?`${C.gold}22`:C.surface,border:`1px solid ${sub===k?C.gold+'66':C.border}`,borderRadius:20,padding:'7px 16px',color:sub===k?C.gold:C.muted,fontSize:12,fontWeight:sub===k?700:400,cursor:'pointer'}}>
            {l}
          </button>
        ))}
      </div>

      {loading?<div style={{color:C.muted,fontSize:12,padding:20}}>Loading…</div>:(<>

      {sub==='foods'&&(<>
        {!addRow&&<div style={{marginBottom:10}}><LibBtn onClick={()=>{setEditRow(null);setAddRow({kind:'food'})}}>＋ Add Food</LibBtn></div>}
        {addRow?.kind==='food'&&foodForm(addRow,setAddRow,()=>saveFood(addRow),()=>setAddRow(null))}
        {FOOD_CATS.filter(cat=>foods.some(f=>f.cat===cat)||FOODS.some(f=>f.cat===cat)).map(cat=>(
          <div key={cat} style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>{cat}</div>
            {FOODS.filter(f=>f.cat===cat).map(f=>builtInRow('food',f.name,`${f.serving} · ${f.cal} cal · P:${f.pro}g C:${f.carb}g F:${f.fat}g`))}
            {foods.filter(f=>f.cat===cat).map(f=> editRow?.kind==='food'&&editRow.id===f.id
              ? <div key={f.id}>{foodForm(editRow,setEditRow,()=>saveFood(editRow),()=>setEditRow(null))}</div>
              : (
              <div key={f.id} style={rowStyle}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:C.white,fontWeight:600}}>{f.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{f.serving} · {f.cal} cal · P:{f.pro}g C:{f.carb}g F:{f.fat}g</div>
                </div>
                {editBtn(f,'food')}
                <LibBtn kind="danger" onClick={()=>deleteFood(f)}>✕</LibBtn>
              </div>
            ))}
          </div>
        ))}
        <div style={{color:C.muted,fontSize:11,padding:'8px 2px'}}>Built-in foods are shared standards — hide any you don't want your coaches to use, and add your own above.</div>
      </>)}

      {sub==='supps'&&(<>
        {!addRow&&<div style={{marginBottom:10}}><LibBtn onClick={()=>{setEditRow(null);setAddRow({kind:'supp'})}}>＋ Add Supplement</LibBtn></div>}
        {addRow?.kind==='supp'&&suppForm(addRow,setAddRow,()=>saveSupp(addRow),()=>setAddRow(null))}
        {suppCats.map(cat=>(
          <div key={cat} style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>{cat}</div>
            {supps.filter(s=>(s.category||'Other')===cat).map(s=> editRow?.kind==='supp'&&editRow.id===s.id
              ? <div key={s.id}>{suppForm(editRow,setEditRow,()=>saveSupp(editRow),()=>setEditRow(null))}</div>
              : (
              <div key={s.id} style={rowStyle}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:C.white,fontWeight:600}}>{s.name} {s.dose&&<span style={{color:C.gold,fontWeight:400,fontSize:11}}>· {s.dose}</span>}</div>
                  {(s.directions||s.code)&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.directions}{s.code?` · Code: ${s.code}`:''}</div>}
                </div>
                {editBtn(s,'supp')}
                <LibBtn kind="danger" onClick={()=>deleteSupp(s)}>✕</LibBtn>
              </div>
            ))}
          </div>
        ))}
        {supps.length===0&&!addRow&&<div style={{color:C.muted,fontSize:12,padding:12}}>No supplements yet — add one above and every coach in your company will see it in their supplement picker.</div>}
      </>)}

      {sub==='habits'&&(<>
        {!addRow&&<div style={{marginBottom:10}}><LibBtn onClick={()=>{setEditRow(null);setAddRow({kind:'habit',default_target:7})}}>＋ Add Habit</LibBtn></div>}
        {(addRow?.kind==='habit'||editRow?.kind==='habit')&&(()=>{ const row=addRow?.kind==='habit'?addRow:editRow, setRow=addRow?.kind==='habit'?setAddRow:setEditRow
          return (
          <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:10,padding:12,marginBottom:8,display:'flex',gap:6}}>
            <LibInput flex={3} value={row.name||''} onChange={v=>setRow(p=>({...p,name:v}))} placeholder="Habit name"/>
            <LibInput value={row.default_target??7} onChange={v=>setRow(p=>({...p,default_target:v}))} placeholder="Target / week"/>
            <LibBtn onClick={()=>saveHabit(row)}>Save</LibBtn>
            <LibBtn kind="plain" onClick={()=>{setAddRow(null);setEditRow(null)}}>Cancel</LibBtn>
          </div>)})()}
        {MASTER_HABITS.map(h=>builtInRow('habit',h.name,`target ${h.defaultTarget}×/week`))}
        {habits.filter(h=>!(editRow?.kind==='habit'&&editRow.id===h.id)).map(h=>(
          <div key={h.id} style={rowStyle}>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:C.white,fontWeight:600}}>{h.name}</span>
              <span style={{fontSize:10,color:C.muted,marginLeft:8}}>target {h.default_target}×/week</span>
            </div>
            {editBtn(h,'habit')}
            <LibBtn kind="danger" onClick={()=>deleteHabit(h)}>✕</LibBtn>
          </div>
        ))}
        <div style={{color:C.muted,fontSize:11,padding:'8px 2px'}}>Hide any built-in habit you don't want your coaches to assign, and add your own above.</div>
      </>)}

      {sub==='cardio'&&(<>
        {!addRow&&<div style={{marginBottom:10}}><LibBtn onClick={()=>{setEditRow(null);setAddRow({kind:'cardio'})}}>＋ Add Cardio Type</LibBtn></div>}
        {(addRow?.kind==='cardio'||editRow?.kind==='cardio')&&(()=>{ const row=addRow?.kind==='cardio'?addRow:editRow, setRow=addRow?.kind==='cardio'?setAddRow:setEditRow
          return (
          <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:10,padding:12,marginBottom:8,display:'flex',gap:6}}>
            <LibInput flex={3} value={row.name||''} onChange={v=>setRow(p=>({...p,name:v}))} placeholder="Cardio type (e.g. Incline Walk)"/>
            <LibBtn onClick={()=>saveCardio(row)}>Save</LibBtn>
            <LibBtn kind="plain" onClick={()=>{setAddRow(null);setEditRow(null)}}>Cancel</LibBtn>
          </div>)})()}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
          {CARDIO_TYPES.map(name=>{
            const isHidden = hidden.has(`cardio:${name}`)
            return (
              <div key={`bi_${name}`} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:'7px 8px 7px 16px',display:'flex',alignItems:'center',gap:6,opacity:isHidden?0.45:1}}>
                <span style={{fontSize:12,color:C.white,fontWeight:600,textDecoration:isHidden?'line-through':'none'}}>{name}</span>
                {isHidden
                  ? <LibBtn kind="plain" onClick={()=>restoreBuiltIn('cardio',name)}>Restore</LibBtn>
                  : <LibBtn kind="danger" onClick={()=>hideBuiltIn('cardio',name)}>Hide</LibBtn>}
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {cardio.filter(t=>!(editRow?.kind==='cardio'&&editRow.id===t.id)).map(t=>(
            <div key={t.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:'7px 8px 7px 16px',display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:12,color:C.white,fontWeight:600}}>{t.name}</span>
              {editBtn(t,'cardio')}
              <LibBtn kind="danger" onClick={()=>deleteCardio(t)}>✕</LibBtn>
            </div>
          ))}
        </div>
        <div style={{color:C.muted,fontSize:11,padding:'8px 2px'}}>Hide any built-in cardio type you don't want your coaches to use, and add your own above.</div>
      </>)}

      {sub==='links'&&(<>
        {!addRow&&<div style={{marginBottom:10}}><LibBtn onClick={()=>{setEditRow(null);setAddRow({kind:'link'})}}>＋ Add Resource Link</LibBtn></div>}
        {(addRow?.kind==='link'||editRow?.kind==='link')&&(()=>{ const row=addRow?.kind==='link'?addRow:editRow, setRow=addRow?.kind==='link'?setAddRow:setEditRow
          return (
          <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              <LibInput flex={2} value={row.label||''} onChange={v=>setRow(p=>({...p,label:v}))} placeholder="Name (e.g. Blood Work Panel)"/>
              <LibInput flex={3} value={row.url||''}   onChange={v=>setRow(p=>({...p,url:v}))}   placeholder="Link (https://…)"/>
              <LibInput flex={2} value={row.note||''}  onChange={v=>setRow(p=>({...p,note:v}))}  placeholder="Note (e.g. Code: YOURCODE10)"/>
            </div>
            <div style={{display:'flex',gap:6}}><LibBtn onClick={()=>saveLink(row)}>Save</LibBtn><LibBtn kind="plain" onClick={()=>{setAddRow(null);setEditRow(null)}}>Cancel</LibBtn></div>
          </div>)})()}
        {links.filter(l=>!(editRow?.kind==='link'&&editRow.id===l.id)).map(l=>(
          <div key={l.id} style={rowStyle}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:C.white,fontWeight:600}}>{l.label}{l.note&&<span style={{color:C.gold,fontWeight:400,fontSize:11,marginLeft:8}}>{l.note}</span>}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.url}</div>
            </div>
            {editBtn(l,'link')}
            <LibBtn kind="danger" onClick={()=>deleteLink(l)}>✕</LibBtn>
          </div>
        ))}
        {links.length===0&&!addRow&&(<>
          <div style={{color:C.muted,fontSize:12,padding:'12px 12px 4px'}}>Your coaches and clients currently see the default resource list below (in Diet Builder → Supps). Add your own links above to replace it.</div>
          {DEFAULT_RESOURCE_LINKS.map(([label,url,note])=>(
            <div key={label} style={{...rowStyle,opacity:0.55}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.white,fontWeight:600}}>{label}{note&&<span style={{color:C.gold,fontWeight:400,fontSize:11,marginLeft:8}}>{note}</span>}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</div>
              </div>
              <span style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5,border:`1px solid ${C.border}`,borderRadius:4,padding:'1px 5px'}}>DEFAULT</span>
            </div>
          ))}
        </>)}
      </>)}

      </>)}
    </div>
  )
}
