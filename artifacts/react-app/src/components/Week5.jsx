// ═══════════════════════════════════════════════════════════════
// Week5.jsx — CEO Course + Recipe Book (Final)
// Admin-only course/video management
// Admin grants access per client, per coach, or all at once
// Coach sees client progress dashboards
// Place at: src/components/Week5.jsx
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { sbBearer } from '../lib/sbAuth'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'
const SHEET_ID      = '1lckx8AWxzxxddhWESgj7R-FVHoE6g2JBC9NG1J72QTA'
const SHEET_NAME    = 'FoodList'
const RECIPE_BUY    = 'https://funnel.lifestyleofeden.com/loe-recipes-5482'

// ── Known users (expand in Week 6 with real auth) ─────────────
const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach',    role:'coach' },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Client', role:'client', coachId:'414b1fb3-f38c-4480-bdb2-fe7b1d844051' },
  'admin@edencomms.io': { uuid:'00000000-0000-0000-0000-000000000001', name:'Eden Admin',      role:'super_admin' },
}

// ── Demo roster (Week 6 pulls this from Supabase dynamically) ─
// Demo roster removed — rosters load live from the database.
const DEMO_COACHES = []
const DEMO_CLIENTS = []

const CEO_COURSE_ID = 'a0000000-0000-0000-0000-000000000001'

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}
const H = {
  'apikey':SUPABASE_ANON,
  get Authorization(){ return sbBearer() },
  'Content-Type':'application/json',
  'Prefer':'return=representation',
}

import { getRecipeDetails, loadLiveRecipeDetails } from './recipeDetails'

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
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method:'PATCH', headers:H, body:JSON.stringify(body)
    })
    if (!r.ok) { console.error('UPDATE', table, await r.text()); return false }
    // With return=representation an empty array means RLS matched no rows — nothing saved
    const t = await r.text()
    if (t) { try { if (Array.isArray(JSON.parse(t)) && JSON.parse(t).length === 0) return false } catch {} }
    return true
  } catch { return false }
}

// Accept a REGULAR link (YouTube watch/short, Vimeo page, Loom share, Google Drive)
// or an embed link — always returns something an <iframe> can play.
export function toEmbedUrl(raw) {
  const url = (raw || '').trim()
  if (!url) return ''
  try {
    const u = new URL(url.match(/^https?:\/\//i) ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\./, '')
    // YouTube
    if (host === 'youtu.be')                       return `https://www.youtube.com/embed/${u.pathname.slice(1).split('/')[0]}`
    if (host.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/'))        return u.href
      if (u.pathname.startsWith('/shorts/'))       return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`
      if (u.pathname.startsWith('/live/'))         return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`
      const v = u.searchParams.get('v');  if (v)   return `https://www.youtube.com/embed/${v}`
    }
    // Vimeo
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)(?:\/(\w+))?/)
      if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`
    }
    if (host === 'player.vimeo.com')               return u.href
    // Loom
    if (host.endsWith('loom.com')) {
      const m = u.pathname.match(/\/(?:share|embed)\/([a-f0-9]+)/i)
      if (m) return `https://www.loom.com/embed/${m[1]}`
    }
    // Google Drive
    if (host === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/)
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`
    }
    return u.href
  } catch { return url }
}
async function dbDelete(table, params) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method:'DELETE', headers:H })
    return r.ok
  } catch { return false }
}

// Palette cycled through for new course sections
const SECTION_COLORS = ['#D4AF37','#4CAF7D','#5B9BD5','#C0504D','#9B59B6','#E67E22']

// ── Static recipe fallback ────────────────────────────────────
const STATIC_RECIPES = [
  {name:'Whole Food Protein Pancakes',    servings:1,cal:270,pro:27, fat:7,  carb:28, fib:5, category:'Breakfast',tags:['high-protein']},
  {name:'Breakfast Tacos',               servings:1,cal:670,pro:45, fat:32, carb:49, fib:9, category:'Breakfast',tags:['high-protein']},
  {name:'Whole Food Banana Bread',       servings:1,cal:250,pro:10, fat:8,  carb:40, fib:5, category:'Snacks',   tags:['snack']},
  {name:"Homemade Superfood Acai Bowl",  servings:1,cal:230,pro:25, fat:6,  carb:19, fib:7, category:'Breakfast',tags:['superfood']},
  {name:'Pumpkin Custard Pie',           servings:1,cal:233,pro:5.5,fat:2.7,carb:46, fib:5, category:'Desserts', tags:['dessert']},
  {name:'Mineral Oat Bowl',              servings:1,cal:520,pro:18, fat:23, carb:63, fib:10,category:'Breakfast',tags:['carbs']},
  {name:'Ezekiel Burrito Wrap',          servings:1,cal:490,pro:50, fat:12, carb:44, fib:12,category:'Lunch',    tags:['high-protein']},
  {name:'Black Bean Quinoa Burger',      servings:1,cal:170,pro:9,  fat:5,  carb:24, fib:9, category:'Lunch',    tags:['plant-based']},
  {name:'Banana Date Smoothie',          servings:1,cal:420,pro:30, fat:12, carb:55, fib:7, category:'Drinks',   tags:['smoothie']},
  {name:'Date Energy Balls',             servings:1,cal:88, pro:1.7,fat:0.8,carb:18, fib:2, category:'Snacks',   tags:['snack']},
  {name:'PB Protein Balls',             servings:1,cal:89, pro:3.6,fat:5.5,carb:7,  fib:2, category:'Snacks',   tags:['high-protein']},
  {name:'Gut Health Hot Chocolate',      servings:1,cal:145,pro:21, fat:3,  carb:18, fib:5, category:'Drinks',   tags:['gut-health']},
  {name:'Sweet Potato Chickpea Burger',  servings:1,cal:210,pro:8,  fat:6,  carb:32, fib:9, category:'Lunch',    tags:['plant-based']},
  {name:'Avocado Cucumber Lime Salad',   servings:1,cal:280,pro:3,  fat:26, carb:13, fib:7, category:'Sides',    tags:['salad']},
  {name:'Honey & Thyme Roasted Carrots', servings:1,cal:205,pro:2,  fat:14, carb:20, fib:5, category:'Sides',    tags:['vegetables']},
  {name:'Mediterranean Tomato Salad',    servings:1,cal:150,pro:2,  fat:14, carb:9,  fib:3, category:'Sides',    tags:['salad']},
  {name:'Apple Walnut Slaw',             servings:1,cal:330,pro:5,  fat:26, carb:22, fib:6, category:'Sides',    tags:['salad']},
  {name:'Miso Soup',                     servings:1,cal:200,pro:15, fat:8,  carb:12, fib:4, category:'Soups',    tags:['gut-health']},
  {name:'Stuffed Peppers',               servings:1,cal:240,pro:25, fat:11, carb:12, fib:5, category:'Dinner',   tags:['high-protein']},
  {name:'Whole Food Taco Soup (Beef)',   servings:1,cal:395,pro:35, fat:15, carb:30, fib:10,category:'Soups',    tags:['high-protein']},
  {name:'Whole Food Taco Soup (Chicken)',servings:1,cal:352,pro:40, fat:8,  carb:30, fib:9, category:'Soups',    tags:['high-protein']},
  {name:'Tafu Stir Fry',                 servings:1,cal:450,pro:25, fat:18, carb:45, fib:7, category:'Dinner',   tags:['plant-based']},
  {name:'Recovery Power Bowl',           servings:1,cal:778,pro:26, fat:33, carb:106,fib:16,category:'Lunch',    tags:['recovery']},
  {name:'Quinoa Lentil Power Bowl',      servings:1,cal:990,pro:41, fat:35, carb:135,fib:22,category:'Lunch',    tags:['plant-based']},
  {name:'Banana Ice Cream',             servings:1,cal:315,pro:3.9,fat:1,  carb:81, fib:7, category:'Desserts', tags:['dessert']},
  {name:'Cookie Dough Dip',             servings:1,cal:166,pro:4.5,fat:5,  carb:27, fib:6, category:'Desserts', tags:['dessert']},
  {name:'Plant-Based Nutella Spread',   servings:1,cal:152,pro:3,  fat:13, carb:8.5,fib:3, category:'Snacks',   tags:['plant-based']},
  {name:'PB Cinnamon Muffin',           servings:1,cal:180,pro:15, fat:6,  carb:18, fib:5, category:'Snacks',   tags:['high-protein']},
  {name:'Pesto Chickpea Salad',         servings:1,cal:400,pro:18, fat:20, carb:40, fib:12,category:'Lunch',    tags:['plant-based']},
  {name:'Beef Carpaccio',               servings:1,cal:400,pro:36, fat:20, carb:28, fib:2, category:'Dinner',   tags:['high-protein']},
  {name:"Gregor's Pesto Sauce",         servings:1,cal:320,pro:11, fat:24, carb:16, fib:5, category:'Sauces',   tags:['sauce']},
  {name:'Tahini Lemon Sauce',           servings:1,cal:92, pro:2,  fat:6,  carb:9,  fib:3, category:'Sauces',   tags:['sauce']},
  {name:'Date Caramel Frosting',        servings:1,cal:136,pro:2,  fat:4.5,carb:24, fib:3, category:'Desserts', tags:['dessert']},
]
const RECIPE_CATS = ['All',...new Set(STATIC_RECIPES.map(r=>r.category))]
const MCOLS = {cal:'#ffa600',pro:'#4FD89A',carb:'#6FB8E8',fat:'#f06060',fib:'#D4A8F0'}

// ── Mini UI ───────────────────────────────────────────────────
function Ring({pct,size=64,stroke=5,color=C.gold}) {
  const r=(size-stroke)/2, circ=2*Math.PI*r, off=circ*(1-pct/100)
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:'stroke-dashoffset .6s'}}/>
    </svg>
  )
}
function MacroChip({label,val,unit=''}) {
  return (
    <div style={{textAlign:'center',minWidth:50}}>
      <div style={{fontSize:14,fontWeight:700,color:MCOLS[label]||C.gold}}>{val}{unit}</div>
      <div style={{fontSize:9,color:C.muted,marginTop:2,textTransform:'capitalize'}}>{label}</div>
    </div>
  )
}
function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}
function Lbl({t}) {
  return <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',margin:'14px 0 7px'}}>{t}</div>
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'

export default function Week5({currentUser, onAddRecipeToDiet}) {
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'client',name:'User',uuid:null}
  const [dbProfile,  setDbProfile]  = useState(null)   // DB-auth users (white-label) resolved from user_profiles
  const [companyCtx, setCompanyCtx] = useState(null)   // {companyId,isWhiteLabel,tierRecipes,packageId} — null = Eden
  const myUUID  = info.uuid || dbProfile?.id || null
  const roleEff = KNOWN_USERS[email] ? info.role : (dbProfile?.role || 'client')
  const isAdmin = roleEff==='super_admin'
  const isCoach = roleEff==='coach'
  const isClient= roleEff==='client'

  const [profileReady, setProfileReady] = useState(false) // don't load content until we know who this is
  useEffect(()=>{ (async()=>{
    if (!email) return
    try {
      const rows = await dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=id,role,company_id`)
      const p = rows?.[0]
      if (p) {
        setDbProfile(p)
        if (p.company_id && p.company_id!==EDEN_ORG_ID) {
          const org = await dbGet('organizations',`id=eq.${p.company_id}&select=id,plan,is_white_label`)
          let tierRecipes=false, packageId=null
          if (org?.[0]?.plan) {
            const pkg = await dbGet('packages',`name=ilike.${encodeURIComponent(org[0].plan)}&active=eq.true&limit=1`)
            tierRecipes=!!pkg?.[0]?.includes_recipes
            packageId=pkg?.[0]?.id||null
          }
          setCompanyCtx({companyId:p.company_id, isWhiteLabel:!!org?.[0]?.is_white_label, tierRecipes, packageId})
        } else {
          setCompanyCtx(null)
        }
      }
    } finally { setProfileReady(true) }
  })() },[email])

  // White-label tier gates (Eden users always get everything)
  const isWL = !!companyCtx?.isWhiteLabel
  // Hide the Recipes tab until the company lookup finishes so white-label users never see a flash of Eden content
  const recipesAllowed = profileReady && (!isWL || companyCtx.tierRecipes)

  const [tab, setTab] = useState('course')

  // ── Course state ──────────────────────────────────────────
  const [courses,      setCourses]      = useState([])
  const [activeCourse, setActiveCourse] = useState(null)
  const [modules,      setModules]      = useState([])
  const [completed,    setCompleted]    = useState(new Set())
  const [courseView,   setCourseView]   = useState('catalog')
  const [activeSection,setActiveSection]= useState(null)
  const [activeModule, setActiveModule] = useState(null)

  // Admin: video URL editing
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [tempUrl,      setTempUrl]      = useState('')
  const [savingUrl,    setSavingUrl]    = useState(false)

  // Admin: access management
  const [showAccess,   setShowAccess]   = useState(false)
  const [accessList,   setAccessList]   = useState([])
  const [accessCourse, setAccessCourse] = useState(null)

  // Admin (Eden only): per-course tier distribution
  const [showTiers,    setShowTiers]    = useState(false)
  const [tiersCourse,  setTiersCourse]  = useState(null)
  const [allPackages,  setAllPackages]  = useState([])
  const [tierSel,      setTierSel]      = useState(new Set())
  const [savingTiers,  setSavingTiers]  = useState(false)

  // Admin: new course
  const [showNewCourse,setShowNewCourse]= useState(false)
  const [newTitle,     setNewTitle]     = useState('')
  const [newDesc,      setNewDesc]      = useState('')
  const [savingCourse, setSavingCourse] = useState(false)

  // Admin: edit course title/description
  const [courseEdit,   setCourseEdit]   = useState(null) // {title,description}
  const [savingCourseEdit, setSavingCourseEdit] = useState(false)

  // Admin: course content builder (sections & lessons)
  const [showBuilder,  setShowBuilder]  = useState(false)
  const [draftSecs,    setDraftSecs]    = useState([])   // [{id,title,color}] incl. not-yet-saved empty sections
  const [secEdit,      setSecEdit]      = useState(null) // {id,title}
  const [modEdit,      setModEdit]      = useState(null) // {id,title,duration}
  const [newModFor,    setNewModFor]    = useState(null) // section id gaining a lesson
  const [newModTitle,  setNewModTitle]  = useState('')
  const [newModDur,    setNewModDur]    = useState('')
  const [newSecTitle,  setNewSecTitle]  = useState('')
  const [builderBusy,  setBuilderBusy]  = useState(false)

  // Coach: client progress view
  const [showProgress, setShowProgress]  = useState(false)
  const [clientProgress,setClientProgress]= useState([])

  // Recipe state
  const [recipes,       setRecipes]       = useState(STATIC_RECIPES)
  const [liveLoading,   setLiveLoading]   = useState(false)
  const [recipeSearch,  setRecipeSearch]  = useState('')
  const [recipeCat,     setRecipeCat]     = useState('All')
  const [selectedRecipe,setSelectedRecipe]= useState(null)
  const [hasRecipeAccess,setHasRecipeAccess]= useState(false)
  const [assignedRecipeNames,setAssignedRecipeNames]= useState(new Set()) // per-recipe unlocks from coach assignments
  const [,setLiveDetailsReady]                = useState(false) // re-render once live doc details arrive

  useEffect(()=>{
    if (!profileReady) return   // wait until company/tier is known so Eden content never flashes for white-label users
    loadCourses()
    loadLiveRecipes()
    loadLiveRecipeDetails().then(()=>setLiveDetailsReady(true)) // sheet-linked doc details for new recipes
    if (myUUID) { checkRecipeAccess(); loadAssignedRecipes() }
  },[profileReady, myUUID, companyCtx?.companyId, companyCtx?.packageId])

  // ── Load courses based on role ────────────────────────────
  // A course belongs to Eden when it has no company_id (or Eden's)
  const isEdenCourse = c => !c.company_id || c.company_id===EDEN_ORG_ID

  async function loadCourses() {
    let data
    if (isAdmin) {
      // White-label admin: scope the query itself to their company — never fetch other tenants' rows
      data = isWL
        ? await dbGet('courses',`company_id=eq.${companyCtx.companyId}&order=sort_order.asc`)
        : await dbGet('courses','order=sort_order.asc')
    } else {
      if (!myUUID) { setCourses([]); return }
      // Coach/client: only courses they have access to
      const access = await dbGet('course_access',`user_id=eq.${myUUID}&revoked=eq.false`)
      if (!access?.length) { setCourses([]); return }
      const ids = access.map(a=>a.course_id).join(',')
      data = await dbGet('courses',`id=in.(${ids})&is_active=eq.true&order=sort_order.asc`)
      // White-label users: own company's courses always; Eden courses only if that
      // course's per-course distribution (courses.tiers) includes their org's package.
      // A course with no tiers set is "Eden only" and never shown to white-label users.
      if (isWL) data = (data||[]).filter(c=>
        c.company_id===companyCtx.companyId ||
        (isEdenCourse(c)&&Array.isArray(c.tiers)&&companyCtx.packageId&&c.tiers.includes(companyCtx.packageId)))
    }
    setCourses(data||[])
    if (data?.length>0) {
      // Keep the open course only if it's still in the visible list
      if (!activeCourse || !data.some(c=>c.id===activeCourse.id)) openCourse(data[0])
    } else {
      setActiveCourse(null); setModules([]); setCourseView('catalog')
    }
  }

  // Order by section first so per-section sort_order works for admin-built courses
  const sortMods = mods => [...(mods||[])].sort((a,b)=>(a.section_id-b.section_id)||(a.sort_order-b.sort_order))

  async function openCourse(course) {
    setActiveCourse(course)
    setCourseView('home')
    const mods = await dbGet('course_modules',`course_id=eq.${course.id}&order=sort_order.asc`)
    setModules(sortMods(mods))
    if (myUUID) {
      const prog = await dbGet('course_progress',`user_id=eq.${myUUID}&course_id=eq.${course.id}`)
      setCompleted(new Set((prog||[]).filter(p=>p.completed).map(p=>p.module_id)))
    }
  }

  // ── Mark module complete ───────────────────────────────────
  async function markComplete(moduleId) {
    if (!myUUID||!activeCourse) return
    setCompleted(prev=>new Set([...prev,moduleId]))
    await fetch(`${SUPABASE_URL}/rest/v1/course_progress`,{
      method:'POST',
      headers:{...H,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({
        user_id:myUUID, course_id:activeCourse.id,
        module_id:moduleId, completed:true,
        completed_at:new Date().toISOString(),
      }),
    })
  }

  // ── ADMIN: Save video URL ─────────────────────────────────
  async function saveVideoUrl() {
    if (!activeModule||!tempUrl.trim()) return
    setSavingUrl(true)
    const url = toEmbedUrl(tempUrl)   // regular links get converted to playable embed links
    const ok = await dbUpdate('course_modules',`id=eq.${activeModule.id}`,{
      video_url:url, updated_at:new Date().toISOString(),
    })
    setSavingUrl(false)
    if (!ok) { alert('Could not save the video link — please check your connection and try again.'); return }
    setModules(prev=>prev.map(m=>m.id===activeModule.id?{...m,video_url:url}:m))
    setActiveModule(prev=>({...prev,video_url:url}))
    setShowUrlInput(false); setTempUrl('')
    alert('Video link saved and live for everyone with course access.')
  }

  // ── ADMIN: Create course ──────────────────────────────────
  async function createCourse() {
    if (!newTitle.trim()) return
    setSavingCourse(true)
    const inserted = await dbInsert('courses',{
      title:newTitle.trim(), description:newDesc.trim(),
      is_active:false, sort_order:courses.length+1,
      created_by:myUUID,
      company_id: companyCtx?.companyId || null,   // null = Eden platform course
    })
    if (inserted) {
      const arr = Array.isArray(inserted)?inserted:[inserted]
      setCourses(prev=>[...prev,arr[0]])
      setNewTitle(''); setNewDesc('')
      setShowNewCourse(false)
      alert(`Course "${newTitle}" created. It is unpublished. Go to Manage Access to grant access and use the publish toggle to make it visible.`)
    }
    setSavingCourse(false)
  }

  // ── ADMIN: Edit course title/description ──────────────────
  async function saveCourseEdit() {
    if (!activeCourse || !courseEdit?.title?.trim() || savingCourseEdit) return
    setSavingCourseEdit(true)
    const title = courseEdit.title.trim()
    const description = courseEdit.description?.trim() || ''
    const ok = await dbUpdate('courses',`id=eq.${activeCourse.id}`,{ title, description })
    setSavingCourseEdit(false)
    if (!ok) { alert('Could not save the course details — please check your connection and try again.'); return }
    setCourses(prev=>prev.map(c=>c.id===activeCourse.id?{...c,title,description}:c))
    setActiveCourse(prev=>prev?{...prev,title,description}:prev)
    setCourseEdit(null)
  }

  // ── ADMIN: Toggle course published ────────────────────────
  async function togglePublish(course) {
    await dbUpdate('courses',`id=eq.${course.id}`,{ is_active:!course.is_active })
    setCourses(prev=>prev.map(c=>c.id===course.id?{...c,is_active:!c.is_active}:c))
    if (activeCourse?.id===course.id) setActiveCourse(prev=>({...prev,is_active:!prev.is_active}))
  }

  // ── ADMIN: Course content builder ─────────────────────────
  // Eden admin edits Eden courses; a white-label admin edits their own org's courses
  const canEditCourse = c => isAdmin && (isWL ? c.company_id===companyCtx.companyId : isEdenCourse(c))

  async function refreshModules(courseId) {
    const mods = await dbGet('course_modules',`course_id=eq.${courseId}&order=sort_order.asc`)
    const sorted = sortMods(mods)
    setModules(sorted)
    return sorted
  }
  // Close the builder, but never silently discard unsaved Edit Details typing
  const courseEditDirty = () =>
    !!courseEdit && !!activeCourse &&
    ((courseEdit.title||'') !== (activeCourse.title||'') ||
     (courseEdit.description||'') !== (activeCourse.description||''))
  function closeBuilder() {
    if (courseEditDirty()) {
      if (!window.confirm('You have unsaved course details. Discard your changes?')) return
      setCourseEdit(null)
    }
    setShowBuilder(false)
  }
  function openBuilder() {
    setDraftSecs(sections.map(s=>({id:s.id,title:s.title,color:s.color})))
    setSecEdit(null); setModEdit(null); setNewModFor(null); setNewModTitle(''); setNewModDur(''); setNewSecTitle('')
    setCourseEdit(null)
    setShowBuilder(true)
  }
  function addSectionDraft() {
    const title = newSecTitle.trim(); if (!title) return
    const nextId = Math.max(0,...draftSecs.map(s=>Number(s.id)||0))+1
    setDraftSecs(prev=>[...prev,{id:nextId,title,color:SECTION_COLORS[(nextId-1)%SECTION_COLORS.length]}])
    setNewSecTitle('')
  }
  async function saveSectionTitle(sec, title) {
    title = title.trim(); if (!title) return
    setDraftSecs(prev=>prev.map(s=>s.id===sec.id?{...s,title}:s))
    setSecEdit(null)
    if (modules.some(m=>m.section_id===sec.id)) {
      await dbUpdate('course_modules',`course_id=eq.${activeCourse.id}&section_id=eq.${sec.id}`,{section_title:title})
      await refreshModules(activeCourse.id)
    }
  }
  async function deleteSection(sec) {
    const count = modules.filter(m=>m.section_id===sec.id).length
    if (count>0 && !window.confirm(`Delete section "${sec.title}" and its ${count} lesson${count>1?'s':''}? This cannot be undone.`)) return
    if (count>0) {
      setBuilderBusy(true)
      await dbDelete('course_modules',`course_id=eq.${activeCourse.id}&section_id=eq.${sec.id}`)
      await refreshModules(activeCourse.id)
      setBuilderBusy(false)
    }
    setDraftSecs(prev=>prev.filter(s=>s.id!==sec.id))
  }
  async function addModule(sec) {
    const title = newModTitle.trim(); if (!title||builderBusy) return
    setBuilderBusy(true)
    try {
      const inSection    = modules.filter(m=>m.section_id===sec.id)
      const nextSort     = Math.max(0,...inSection.map(m=>Number(m.sort_order)||0))+1
      const nextModuleId = `${sec.id}.${nextSort}`   // matches CEO-course convention, e.g. "2.3"
      const inserted = await dbInsert('course_modules',{
        course_id:activeCourse.id, section_id:sec.id, section_title:sec.title, section_color:sec.color,
        module_id:nextModuleId, title, duration:newModDur.trim()||null, sort_order:nextSort,
      })
      if (!inserted) { alert('Could not save the lesson — please try again.'); return }
      await refreshModules(activeCourse.id)
      setNewModTitle(''); setNewModDur(''); setNewModFor(null)
    } catch {
      alert('Could not save the lesson — please check your connection and try again.')
    } finally {
      setBuilderBusy(false)
    }
  }
  async function saveModuleEdit() {
    if (!modEdit?.title?.trim()) return
    const ok = await dbUpdate('course_modules',`id=eq.${modEdit.id}`,{
      title:modEdit.title.trim(),
      duration:modEdit.duration?.trim()||null,
      admin_notes:modEdit.admin_notes?.trim()||null,
      video_url: modEdit.video_url?.trim() ? toEmbedUrl(modEdit.video_url) : null,
      updated_at:new Date().toISOString(),
    })
    if (!ok) { alert('Could not save the lesson changes — please check your connection and try again.'); return }
    await refreshModules(activeCourse.id)
    if (activeModule?.id===modEdit.id) {
      const url = modEdit.video_url?.trim() ? toEmbedUrl(modEdit.video_url) : null
      setActiveModule(prev=>prev?{...prev,title:modEdit.title.trim(),duration:modEdit.duration?.trim()||null,admin_notes:modEdit.admin_notes?.trim()||null,video_url:url}:prev)
    }
    setModEdit(null)
  }
  async function deleteModule(m) {
    if (!window.confirm(`Delete lesson "${m.title}"?`)) return
    await dbDelete('course_modules',`id=eq.${m.id}`)
    await refreshModules(activeCourse.id)
  }

  // ── ADMIN: Reorder sections & lessons ─────────────────────
  // Progress rows are keyed by module_id text (e.g. "2.3"), so whenever we
  // renumber a module we must move its course_progress rows along with it.
  // A two-pass rename (via a "tmp." prefix) makes swaps safe.
  async function remapProgress(pairs) {
    const changed = pairs.filter(p=>p.from!==p.to)
    for (const p of changed)
      await dbUpdate('course_progress',`course_id=eq.${activeCourse.id}&module_id=eq.${encodeURIComponent(p.from)}`,{module_id:`tmp.${p.to}`})
    for (const p of changed)
      await dbUpdate('course_progress',`course_id=eq.${activeCourse.id}&module_id=eq.${encodeURIComponent(`tmp.${p.to}`)}`,{module_id:p.to})
  }
  async function reloadCompleted() {
    if (!myUUID||!activeCourse) return
    const prog = await dbGet('course_progress',`user_id=eq.${myUUID}&course_id=eq.${activeCourse.id}`)
    setCompleted(new Set((prog||[]).filter(p=>p.completed).map(p=>p.module_id)))
  }
  // Move a lesson up/down within its section (dir = -1 or +1)
  async function moveModule(m, dir) {
    if (builderBusy) return
    const inSection = modules.filter(x=>x.section_id===m.section_id).sort((a,b)=>a.sort_order-b.sort_order)
    const i = inSection.findIndex(x=>x.id===m.id)
    const j = i+dir
    if (i<0||j<0||j>=inSection.length) return
    const other = inSection[j]
    setBuilderBusy(true)
    try {
      const mNewId = `${m.section_id}.${other.sort_order}`
      const oNewId = `${m.section_id}.${m.sort_order}`
      // temp id first so the two rows never share a module_id mid-swap
      const ok1 = await dbUpdate('course_modules',`id=eq.${m.id}`,{sort_order:other.sort_order,module_id:`tmp.${mNewId}`,updated_at:new Date().toISOString()})
      const ok2 = ok1 && await dbUpdate('course_modules',`id=eq.${other.id}`,{sort_order:m.sort_order,module_id:oNewId,updated_at:new Date().toISOString()})
      const ok3 = ok2 && await dbUpdate('course_modules',`id=eq.${m.id}`,{module_id:mNewId})
      if (!ok3) { alert('Could not reorder the lessons — please check your connection and try again.'); await refreshModules(activeCourse.id); return }
      await remapProgress([{from:m.module_id,to:mNewId},{from:other.module_id,to:oNewId}])
      await refreshModules(activeCourse.id)
      await reloadCompleted()
    } finally { setBuilderBusy(false) }
  }
  // Move a whole section up/down: the two sections trade numeric ids so the
  // section_id ordering (which drives display everywhere) follows the move.
  async function moveSection(sec, dir) {
    if (builderBusy) return
    const i = draftSecs.findIndex(s=>s.id===sec.id)
    const j = i+dir
    if (i<0||j<0||j>=draftSecs.length) return
    const other = draftSecs[j]
    setBuilderBusy(true)
    try {
      const aMods = modules.filter(m=>m.section_id===sec.id)
      const bMods = modules.filter(m=>m.section_id===other.id)
      let ok = true
      for (const m of aMods)
        ok = ok && await dbUpdate('course_modules',`id=eq.${m.id}`,{section_id:other.id,module_id:`${other.id}.${m.sort_order}`,updated_at:new Date().toISOString()})
      for (const m of bMods)
        ok = ok && await dbUpdate('course_modules',`id=eq.${m.id}`,{section_id:sec.id,module_id:`${sec.id}.${m.sort_order}`,updated_at:new Date().toISOString()})
      if (!ok) { alert('Could not reorder the sections — please check your connection and try again.'); await refreshModules(activeCourse.id); return }
      await remapProgress([
        ...aMods.map(m=>({from:m.module_id,to:`${other.id}.${m.sort_order}`})),
        ...bMods.map(m=>({from:m.module_id,to:`${sec.id}.${m.sort_order}`})),
      ])
      setDraftSecs(prev=>{
        const next=[...prev]
        next[i]={...other, id:sec.id}
        next[j]={...sec,   id:other.id}
        return next
      })
      if (aMods.length||bMods.length) { await refreshModules(activeCourse.id); await reloadCompleted() }
    } finally { setBuilderBusy(false) }
  }

  // ── ADMIN: Delete course ──────────────────────────────────
  async function deleteCourse(course) {
    if (!window.confirm(`Delete the course "${course.title}" for everyone?\n\nThis removes all its sections, lessons, access grants, and progress. This cannot be undone.`)) return
    // Children first so a mid-way failure never leaves an orphaned course invisible in the UI
    const okChildren = (await Promise.all([
      dbDelete('course_modules', `course_id=eq.${course.id}`),
      dbDelete('course_access',  `course_id=eq.${course.id}`),
      dbDelete('course_progress',`course_id=eq.${course.id}`),
    ])).every(Boolean)
    const okCourse = okChildren && await dbDelete('courses',`id=eq.${course.id}`)
    if (!okCourse) { alert('Could not fully delete the course — please check your connection and try again.'); return }
    setShowBuilder(false)
    const remaining = courses.filter(c=>c.id!==course.id)
    setCourses(remaining)
    if (activeCourse?.id===course.id) {
      if (remaining.length>0) openCourse(remaining[0])
      else { setActiveCourse(null); setModules([]); setCourseView('catalog') }
    }
  }

  // ── ADMIN (Eden): Per-course tier distribution ────────────
  // Which white-label tiers include this Eden course. Empty = Eden only.
  async function openTierManager(course) {
    setTiersCourse(course)
    setTierSel(new Set(Array.isArray(course.tiers)?course.tiers:[]))
    const pkgs = await dbGet('packages','active=eq.true&order=price.asc')
    setAllPackages(pkgs||[])
    setShowTiers(true)
  }
  async function saveTiers() {
    if (!tiersCourse) return
    setSavingTiers(true)
    const tiers = [...tierSel]
    await dbUpdate('courses',`id=eq.${tiersCourse.id}`,{ tiers })
    setCourses(prev=>prev.map(c=>c.id===tiersCourse.id?{...c,tiers}:c))
    if (activeCourse?.id===tiersCourse.id) setActiveCourse(prev=>({...prev,tiers}))
    setSavingTiers(false); setShowTiers(false)
  }

  // ── ADMIN: Open access management ─────────────────────────
  // Real coaches & clients from the DB (scoped to the admin's org) — the access
  // manager must grant to real profile IDs, never the old demo placeholder list.
  const [rosterCoaches, setRosterCoaches] = useState([])
  const [rosterClients, setRosterClients] = useState([])
  async function loadRoster() {
    const cid = companyCtx?.companyId || EDEN_ORG_ID
    const rows = await dbGet('user_profiles',
      `company_id=eq.${cid}&role=in.(coach,client)&select=id,name,role,coach_id,is_active&order=name.asc`)
    const coaches = (rows||[]).filter(r=>r.role==='coach')
    const nameById = Object.fromEntries(coaches.map(c=>[c.id,c.name]))
    setRosterCoaches(coaches.map(c=>({uuid:c.id,name:c.name,role:'coach'})))
    setRosterClients((rows||[]).filter(r=>r.role==='client'&&r.is_active!==false)
      .map(c=>({uuid:c.id,name:c.name,role:'client',coachId:c.coach_id,coachName:nameById[c.coach_id]||''})))
  }

  async function openAccessManager(course) {
    setAccessCourse(course)
    const [data] = await Promise.all([
      dbGet('course_access',`course_id=eq.${course.id}&revoked=eq.false`),
      loadRoster(),
    ])
    setAccessList(data||[])
    setShowAccess(true)
  }

  // ── ADMIN: Grant access to specific user ─────────────────
  async function grantAccess(user, course, opts={}) {
    const already = accessList.find(a=>a.user_id===user.uuid)
    if (already) { if(!opts.silent) alert(`${user.name} already has access.`); return }
    await fetch(`${SUPABASE_URL}/rest/v1/course_access`,{
      method:'POST',
      headers:{...H,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({
        course_id:course.id, user_id:user.uuid,
        user_name:user.name, user_role:user.role,
        coach_id:user.coachId||null,
        granted_by:myUUID,
      }),
    })
    setAccessList(prev=>[...prev,{user_id:user.uuid,user_name:user.name,user_role:user.role}])
    dbInsert('audit_logs',{ action:'course_granted', actor_id:myUUID, actor_name:(dbProfile?.name||info.name),
      actor_role:roleEff, target_type:'course_access', target_id:user.uuid,
      details:{ name:course.title, user:user.name } }).catch(()=>{})
  }

  // ── ADMIN: Grant access to ALL clients under a coach ─────
  async function grantToCoachClients(coachId, coachName, course) {
    const clients = rosterClients.filter(c=>c.coachId===coachId)
    // Always grant to the coach, even if they have no clients yet
    const coach = rosterCoaches.find(c=>c.uuid===coachId)
    if (coach) await grantAccess(coach, course, {silent:true})
    for (const client of clients) {
      await grantAccess(client, course, {silent:true})
    }
    alert(`Access granted to ${coachName}${clients.length?` and all ${clients.length} client(s)`:''}.`)
  }

  // ── ADMIN: Grant access to everyone ──────────────────────
  async function grantToEveryone(course) {
    const everyone = [...rosterCoaches, ...rosterClients]
    for (const user of everyone) {
      await grantAccess(user, course)
    }
    alert(`Access granted to all ${everyone.length} coaches and clients.`)
  }

  // ── ADMIN: Revoke access ──────────────────────────────────
  async function revokeAccess(userId, course) {
    await dbUpdate('course_access',`course_id=eq.${course.id}&user_id=eq.${userId}`,{ revoked:true })
    const revoked = accessList.find(a=>a.user_id===userId)
    dbInsert('audit_logs',{ action:'course_revoked', actor_id:myUUID, actor_name:(dbProfile?.name||info.name),
      actor_role:roleEff, target_type:'course_access', target_id:userId,
      details:{ name:course.title, user:revoked?.user_name } }).catch(()=>{})
    setAccessList(prev=>prev.filter(a=>a.user_id!==userId))
  }

  // ── COACH: Load client progress ───────────────────────────
  async function loadClientProgress(course) {
    // Get all clients under this coach who have access
    const access = await dbGet('course_access',`course_id=eq.${course.id}&coach_id=eq.${myUUID}&revoked=eq.false`)
    // Always count against THIS course's real lesson list (the open course may be a different one)
    const courseMods = await dbGet('course_modules',`course_id=eq.${course.id}&select=module_id`)
    const validIds   = new Set((courseMods||[]).map(m=>m.module_id))
    const totalMods  = validIds.size
    const progressData = []
    for (const a of (access||[])) {
      const prog = await dbGet('course_progress',
        `user_id=eq.${a.user_id}&course_id=eq.${course.id}&completed=eq.true`
      )
      // Only count lessons that still exist, once each — deleted lessons or stray duplicate rows can't inflate the %
      const done = new Set((prog||[]).map(p=>p.module_id).filter(id=>validIds.has(id))).size
      const lastDone = (prog||[]).slice().sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at))[0]
      progressData.push({
        name:     a.user_name||'Client',
        userId:   a.user_id,
        done,
        total:    totalMods,
        pct:      totalMods ? Math.min(100, Math.round(done/totalMods*100)) : 0,
        lastActive: lastDone?.completed_at ? new Date(lastDone.completed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Not started',
      })
    }
    setClientProgress(progressData)
    setShowProgress(true)
  }

  // ── Recipe helpers ────────────────────────────────────────
  async function checkRecipeAccess() {
    const data = await dbGet('recipe_access',`user_id=eq.${myUUID}`)
    setHasRecipeAccess(Array.isArray(data)&&data.length>0)
  }
  // Recipes a coach specifically assigned to this client are unlocked individually,
  // without requiring full Recipe Book access
  async function loadAssignedRecipes() {
    const rows = await dbGet('client_recipes',`client_id=eq.${myUUID}&select=recipe_name`)
    if (Array.isArray(rows)) setAssignedRecipeNames(new Set(rows.map(r=>r.recipe_name).filter(Boolean)))
  }
  async function loadLiveRecipes() {
    setLiveLoading(true)
    try {
      const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&range=AT:BA`
      const res=await fetch(url); const text=await res.text()
      const json=JSON.parse(text.replace(/^.*?\(/,'').replace(/\);?\s*$/,''))
      const rows=json?.table?.rows||[]
      if(rows.length>1){
        const parsed=rows.slice(1).map(row=>{
          const c=row.c||[]
          // c[1] (Recipe/Method column) only has a value for actual recipes — grocery/food rows in the same sheet range are skipped
          return{name:c[0]?.v||'',hasMethod:!!c[1]?.v,servings:c[2]?.v||1,cal:parseFloat(c[3]?.v)||0,pro:parseFloat(c[4]?.v)||0,fat:parseFloat(c[5]?.v)||0,carb:parseFloat(c[6]?.v)||0,fib:parseFloat(c[7]?.v)||0,category:'Recipe',tags:[],isLive:true}
        }).filter(r=>r.name&&r.cal>0&&r.hasMethod)
        if(parsed.length>0){
          const names=new Set(parsed.map(r=>r.name))
          setRecipes([...parsed,...STATIC_RECIPES.filter(r=>!names.has(r.name))])
        }
      }
    } catch(e){} finally{setLiveLoading(false)}
  }

  // ── Derived data ──────────────────────────────────────────
  const sections = modules.reduce((acc,m)=>{
    if(!acc.find(s=>s.id===m.section_id)){
      acc.push({id:m.section_id,title:m.section_title,color:m.section_color,modules:modules.filter(x=>x.section_id===m.section_id)})
    }
    return acc
  },[])

  const total      = modules.length
  // Only lessons that still exist count — progress on deleted lessons can't push the % past reality
  const doneCount  = modules.filter(m=>completed.has(m.module_id)).length
  const overallPct = total?Math.min(100,Math.round(doneCount/total*100)):0
  const nextMod    = modules.find(m=>!completed.has(m.module_id))

  const filteredRecipes = recipes.filter(r=>{
    const ms=!recipeSearch||r.name.toLowerCase().includes(recipeSearch.toLowerCase())||r.tags?.some(t=>t.includes(recipeSearch.toLowerCase()))
    const mc=recipeCat==='All'||r.category===recipeCat
    return ms&&mc
  })

  // White-label users only get the Eden Recipe Book if their company's tier includes it
  const TABS = recipesAllowed ? [['course','🎓 Course'],['recipes','🍽 Recipes']] : [['course','🎓 Course']]
  useEffect(()=>{ if (!recipesAllowed && tab==='recipes') setTab('course') },[recipesAllowed])

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden'}}>

      {/* Tab bar */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>Learning & Resources</div>
          {isAdmin&&<div style={{fontSize:10,color:C.gold,marginTop:1}}>🛡 Admin — Full Control</div>}
          {isCoach&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>Coach View — Read only</div>}
        </div>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'13px 14px',background:'none',border:'none',borderBottom:`2px solid ${tab===k?C.gold:'transparent'}`,color:tab===k?C.gold:C.muted,fontSize:12,fontWeight:tab===k?700:400,cursor:'pointer'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          COURSE TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='course'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Course sidebar */}
          <div style={{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'12px 14px 8px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Courses</div>
              {isAdmin&&(
                <button onClick={()=>setShowNewCourse(true)}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'3px 8px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  + New
                </button>
              )}
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {courses.length===0&&(
                <div style={{padding:16,fontSize:11,color:C.muted,textAlign:'center',lineHeight:1.6}}>
                  {isAdmin?'Create your first course using the + New button above':isCoach?'No courses have been assigned to your clients yet':'No courses available yet'}
                </div>
              )}
              {courses.map(c=>(
                <button key={c.id} onClick={()=>openCourse(c)}
                  style={{width:'100%',textAlign:'left',background:activeCourse?.id===c.id?`${C.gold}15`:C.surface,border:'none',borderLeft:`3px solid ${activeCourse?.id===c.id?C.gold:'transparent'}`,padding:'11px 13px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    <div style={{fontSize:12,fontWeight:activeCourse?.id===c.id?700:400,color:activeCourse?.id===c.id?C.gold:C.white,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title}</div>
                    {isAdmin&&(
                      <span style={{fontSize:9,background:c.is_active?`${C.success}22`:`${C.danger}22`,color:c.is_active?C.success:C.danger,padding:'1px 5px',borderRadius:4,fontWeight:700,flexShrink:0}}>
                        {c.is_active?'LIVE':'DRAFT'}
                      </span>
                    )}
                  </div>
                  {/* Admin quick actions */}
                  {isAdmin&&activeCourse?.id===c.id&&(
                    <div style={{display:'flex',gap:5,marginTop:5,flexWrap:'wrap'}}>
                      <button onClick={e=>{e.stopPropagation();togglePublish(c)}}
                        style={{background:c.is_active?`${C.danger}22`:`${C.success}22`,border:`1px solid ${c.is_active?C.danger:C.success}44`,borderRadius:5,padding:'2px 7px',color:c.is_active?C.danger:C.success,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                        {c.is_active?'Unpublish':'Publish'}
                      </button>
                      <button onClick={e=>{e.stopPropagation();openAccessManager(c)}}
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:'2px 7px',color:C.gold,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                        Manage Access
                      </button>
                      {canEditCourse(c)&&(
                        <button onClick={e=>{e.stopPropagation();openBuilder()}}
                          style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:'2px 7px',color:C.gold,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                          Edit Content
                        </button>
                      )}
                      {canEditCourse(c)&&(
                        <button onClick={e=>{e.stopPropagation();deleteCourse(c)}}
                          style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:5,padding:'2px 7px',color:C.danger,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                          Delete
                        </button>
                      )}
                      {!isWL&&isEdenCourse(c)&&(
                        <button onClick={e=>{e.stopPropagation();openTierManager(c)}}
                          style={{background:`${C.success}18`,border:`1px solid ${C.success}44`,borderRadius:5,padding:'2px 7px',color:C.success,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                          {Array.isArray(c.tiers)&&c.tiers.length>0?`Tiers (${c.tiers.length})`:'Eden Only'}
                        </button>
                      )}
                    </div>
                  )}
                  {/* Coach: view client progress */}
                  {isCoach&&activeCourse?.id===c.id&&(
                    <button onClick={e=>{e.stopPropagation();loadClientProgress(c)}}
                      style={{marginTop:5,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:'2px 7px',color:C.gold,fontSize:9,fontWeight:700,cursor:'pointer'}}>
                      Client Progress →
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Course content */}
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>

            {/* Home */}
            {courseView==='home'&&activeCourse&&(
              <div style={{flex:1,overflowY:'auto',padding:16}}>
                <Card sx={{marginBottom:14,display:'flex',alignItems:'center',gap:16}}>
                  <div style={{position:'relative',flexShrink:0}}>
                    <Ring pct={overallPct} size={72} stroke={6}/>
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:16,fontWeight:700,color:C.white}}>{overallPct}%</span>
                    </div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:2}}>{activeCourse.title}</div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{activeCourse.description}</div>
                    <div style={{fontSize:11,color:C.muted}}>{doneCount} of {total} modules complete</div>
                    {isAdmin&&!activeCourse.is_active&&(
                      <div style={{fontSize:10,color:C.danger,marginTop:4,fontWeight:700}}>
                        ⚠ Draft — not visible to coaches or clients yet. Publish when ready.
                      </div>
                    )}
                  </div>
                </Card>

                {nextMod&&(
                  <button onClick={()=>{setActiveModule(nextMod);setActiveSection(sections.find(s=>s.id===nextMod.section_id));setCourseView('module')}}
                    style={{width:'100%',background:C.card,border:`1px solid ${C.gold}44`,borderRadius:12,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',textAlign:'left',marginBottom:14}}>
                    <div style={{width:40,height:40,borderRadius:10,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>▶</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.8,marginBottom:3}}>CONTINUE — MODULE {nextMod.module_id}</div>
                      <div style={{fontSize:13,fontWeight:600,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextMod.title}</div>
                    </div>
                    {nextMod.video_url&&<span style={{fontSize:10,background:`${C.success}22`,color:C.success,padding:'2px 7px',borderRadius:10,fontWeight:700,flexShrink:0}}>▶ Ready</span>}
                  </button>
                )}

                {sections.map(s=>{
                  const done=s.modules.filter(m=>completed.has(m.module_id)).length
                  const pct=Math.round(done/s.modules.length*100)
                  const videosAdded=s.modules.filter(m=>m.video_url).length
                  return (
                    <button key={s.id} onClick={()=>{setActiveSection(s);setCourseView('section')}}
                      style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',textAlign:'left',marginBottom:8}}>
                      <div style={{width:36,height:36,borderRadius:10,background:`${s.color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:s.color,flexShrink:0}}>{s.id}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10,fontWeight:700,color:s.color,letterSpacing:.8,marginBottom:2}}>SECTION {s.id}</div>
                        <div style={{fontSize:12,fontWeight:600,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                        <div style={{height:3,borderRadius:2,background:C.border,marginTop:7}}>
                          <div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:s.color,transition:'width .5s'}}/>
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginTop:3,display:'flex',gap:10}}>
                          <span>{done}/{s.modules.length} complete</span>
                          {isAdmin&&<span style={{color:videosAdded===s.modules.length?C.success:C.danger}}>{videosAdded}/{s.modules.length} videos</span>}
                        </div>
                      </div>
                      {pct===100&&<span style={{color:C.success,fontSize:20}}>✓</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Section */}
            {courseView==='section'&&activeSection&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <button onClick={()=>setCourseView('home')}
                    style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13,padding:0,marginBottom:8}}>
                    ← All Sections
                  </button>
                  <div style={{fontSize:10,fontWeight:700,color:activeSection.color,letterSpacing:.8,marginBottom:3}}>SECTION {activeSection.id}</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.white}}>{activeSection.title}</div>
                </div>
                <div style={{flex:1,overflowY:'auto',padding:12}}>
                  {activeSection.modules.map((m,mi)=>{
                    const isDone=completed.has(m.module_id)
                    const isNext=!isDone&&activeSection.modules.slice(0,mi).every(p=>completed.has(p.module_id))
                    return (
                      <button key={m.id} onClick={()=>{setActiveModule(m);setCourseView('module')}}
                        style={{width:'100%',textAlign:'left',background:isNext?`${C.gold}12`:C.card,border:`1px solid ${isNext?C.gold+'44':C.border}`,borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:6}}>
                        <div style={{width:32,height:32,borderRadius:8,background:isDone?`${C.success}22`:isNext?`${C.gold}22`:C.surface,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:`1px solid ${isDone?C.success+'44':isNext?C.gold+'44':C.border}`}}>
                          {isDone?<span style={{color:C.success}}>✓</span>:isNext?<span style={{color:C.gold}}>▶</span>:<span style={{fontSize:10,color:C.muted}}>{m.module_id}</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:10,fontWeight:700,color:isDone?C.success:isNext?C.gold:C.muted,letterSpacing:.5,marginBottom:2}}>
                            {isDone?'COMPLETE':isNext?'UP NEXT':`MODULE ${m.module_id}`}
                          </div>
                          <div style={{fontSize:13,fontWeight:600,color:isDone?C.muted:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.title}</div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
                          <span style={{fontSize:11,color:C.muted}}>{m.duration}</span>
                          {m.video_url&&<span style={{fontSize:9,background:`${C.success}22`,color:C.success,padding:'1px 5px',borderRadius:4,fontWeight:700}}>▶ VIDEO</span>}
                          {isAdmin&&!m.video_url&&<span style={{fontSize:9,background:`${C.danger}22`,color:C.danger,padding:'1px 5px',borderRadius:4,fontWeight:700}}>NO VIDEO</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Module */}
            {courseView==='module'&&activeModule&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                  <button onClick={()=>setCourseView('section')}
                    style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13,padding:0}}>← Back</button>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:activeModule.section_color||C.gold,letterSpacing:.8}}>MODULE {activeModule.module_id}</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeModule.title}</div>
                  </div>
                  <span style={{fontSize:11,color:C.muted,flexShrink:0}}>{activeModule.duration}</span>
                </div>

                {/* Video area */}
                <div style={{flexShrink:0}}>
                  {activeModule.video_url?(
                    <div style={{position:'relative',paddingTop:'56.25%'}}>
                      <iframe src={toEmbedUrl(activeModule.video_url)}
                        style={{position:'absolute',inset:0,width:'100%',height:'100%',border:'none'}}
                        allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                        title={activeModule.title}/>
                      <a href={toEmbedUrl(activeModule.video_url)} target="_blank" rel="noreferrer"
                        style={{position:'absolute',right:8,bottom:8,background:'rgba(0,0,0,.65)',border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 9px',color:C.muted,fontSize:10,fontWeight:700,textDecoration:'none'}}>
                        Open in new tab ↗
                      </a>
                    </div>
                  ):(
                    <div style={{background:'#050505',padding:'36px 16px',textAlign:'center'}}>
                      <div style={{fontSize:36,marginBottom:10}}>🎬</div>
                      <div style={{fontSize:14,color:C.white,fontWeight:700,marginBottom:6}}>{activeModule.title}</div>
                      <div style={{fontSize:12,color:C.muted,marginBottom:isAdmin?16:0}}>
                        {isAdmin?'Paste your video embed URL below — saves to Supabase and goes live for all users with access':'Video coming soon'}
                      </div>
                      {isAdmin&&!showUrlInput&&(
                        <button onClick={()=>setShowUrlInput(true)}
                          style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'8px 18px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                          + Add Video URL
                        </button>
                      )}
                      {isAdmin&&showUrlInput&&(
                        <div style={{display:'flex',gap:8,maxWidth:440,margin:'0 auto'}}>
                          <input value={tempUrl} onChange={e=>setTempUrl(e.target.value)}
                            placeholder="Paste Vimeo, Loom, or YouTube embed URL…"
                            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none'}}/>
                          <button onClick={saveVideoUrl} disabled={savingUrl}
                            style={{background:C.gold,border:'none',borderRadius:8,padding:'9px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',opacity:savingUrl?.6:1}}>
                            {savingUrl?'Saving…':'Publish'}
                          </button>
                          <button onClick={()=>{setShowUrlInput(false);setTempUrl('')}}
                            style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'9px',color:C.muted,cursor:'pointer'}}>✕</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin update existing video */}
                  {isAdmin&&activeModule.video_url&&(
                    <div style={{padding:'8px 16px',background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:10,color:C.success,fontWeight:700}}>🎬 Video live</span>
                      <span style={{fontSize:10,color:C.muted,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeModule.video_url}</span>
                      {!showUrlInput?(
                        <button onClick={()=>{setTempUrl(activeModule.video_url);setShowUrlInput(true)}}
                          style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 10px',color:C.muted,fontSize:10,cursor:'pointer',flexShrink:0}}>
                          Update
                        </button>
                      ):(
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <input value={tempUrl} onChange={e=>setTempUrl(e.target.value)}
                            style={{width:200,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 8px',color:C.white,fontSize:11,outline:'none'}}/>
                          <button onClick={saveVideoUrl}
                            style={{background:C.gold,border:'none',borderRadius:6,padding:'4px 10px',fontWeight:700,color:C.black,fontSize:11,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>{setShowUrlInput(false);setTempUrl('')}}
                            style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 8px',color:C.muted,fontSize:11,cursor:'pointer'}}>✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{flex:1,overflowY:'auto',padding:16}}>
                  {/* Admin-written notes for this module — visible to anyone viewing it */}
                  {activeModule.admin_notes&&(
                    <div style={{background:C.surface,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                      <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>📝 Module Notes</div>
                      <div style={{fontSize:13,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{activeModule.admin_notes}</div>
                    </div>
                  )}
                  {/* Only coaches and clients can mark complete, not admins managing */}
                  {!isAdmin&&(
                    !completed.has(activeModule.module_id)?(
                      <button onClick={()=>markComplete(activeModule.module_id)}
                        style={{width:'100%',background:activeModule.section_color||C.gold,border:'none',borderRadius:10,padding:13,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:12}}>
                        ✓ Mark as Complete
                      </button>
                    ):(
                      <div style={{width:'100%',background:`${C.success}22`,border:`1px solid ${C.success}44`,borderRadius:10,padding:13,textAlign:'center',color:C.success,fontWeight:700,fontSize:14,marginBottom:12}}>
                        ✓ Module Complete
                      </div>
                    )
                  )}
                  {/* Next module */}
                  {(()=>{
                    const idx=modules.findIndex(m=>m.id===activeModule.id)
                    const next=modules[idx+1]
                    if(!next) return null
                    return (
                      <button onClick={()=>{setActiveModule(next);setActiveSection(sections.find(s=>s.id===next.section_id))}}
                        style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',textAlign:'left'}}>
                        <div style={{width:36,height:36,borderRadius:8,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.gold,flexShrink:0}}>▶</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,marginBottom:2}}>UP NEXT — MODULE {next.module_id}</div>
                          <div style={{fontSize:13,fontWeight:600,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{next.title}</div>
                        </div>
                        <span style={{fontSize:11,color:C.muted,flexShrink:0}}>{next.duration}</span>
                      </button>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          RECIPE TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='recipes'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>
          <div style={{width:selectedRecipe?300:undefined,flex:selectedRecipe?undefined:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:selectedRecipe?`1px solid ${C.border}`:undefined}}>
            <div style={{padding:'12px 16px 10px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:C.white}}>LOE Recipe Book</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{liveLoading?'Loading from Google Sheets…':`${recipes.length} recipes · auto-updates weekly`}</div>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={loadLiveRecipes} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 9px',color:C.muted,fontSize:10,cursor:'pointer'}}>↻</button>
                </div>
              </div>
              <input value={recipeSearch} onChange={e=>setRecipeSearch(e.target.value)} placeholder="Search recipes…"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',marginBottom:8}}/>
              <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:2}}>
                {RECIPE_CATS.map(cat=>(
                  <button key={cat} onClick={()=>setRecipeCat(cat)}
                    style={{padding:'3px 9px',borderRadius:6,border:`1px solid ${recipeCat===cat?C.gold:C.border}`,background:recipeCat===cat?`${C.gold}20`:C.card,color:recipeCat===cat?C.gold:C.muted,fontSize:10,fontWeight:recipeCat===cat?700:400,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {!hasRecipeAccess&&isClient&&(
              <div style={{margin:'10px 14px 0',background:'linear-gradient(135deg,#1a1200,#2a1800)',border:`1px solid ${C.gold}33`,borderRadius:10,padding:'11px 13px',flexShrink:0}}>
                <div style={{fontSize:12,fontWeight:700,color:C.white,marginBottom:4}}>🔒 Full Recipe Book Access</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:9,lineHeight:1.5}}>Pull any recipe into your diet plan free. Unlock full access for ingredients, instructions, and weekly new recipes.</div>
                <a href={RECIPE_BUY} target="_blank" rel="noreferrer"
                  style={{display:'block',background:C.gold,borderRadius:7,padding:'8px',textAlign:'center',textDecoration:'none',color:C.black,fontWeight:800,fontSize:12}}>
                  Unlock Full Recipe Book →
                </a>
              </div>
            )}

            <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
              {filteredRecipes.map((r,i)=>(
                <button key={i} onClick={()=>setSelectedRecipe(r)}
                  style={{width:'100%',textAlign:'left',background:selectedRecipe?.name===r.name?`${C.gold}12`:C.surface,border:'none',borderLeft:`3px solid ${selectedRecipe?.name===r.name?C.gold:'transparent'}`,padding:'10px 16px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:34,height:34,borderRadius:8,background:`${C.gold}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                    {r.category==='Breakfast'?'🍳':r.category==='Lunch'?'🥗':r.category==='Dinner'?'🍽':r.category==='Desserts'?'🍰':r.category==='Drinks'?'🥤':r.category==='Snacks'?'🥜':r.category==='Soups'?'🍲':r.category==='Sauces'?'🫙':'🍴'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:selectedRecipe?.name===r.name?C.gold:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>{r.cal} cal · P:{r.pro}g C:{r.carb}g F:{r.fat}g</div>
                    {r.isLive&&<span style={{fontSize:8,background:`${C.success}22`,color:C.success,padding:'1px 5px',borderRadius:4,fontWeight:700}}>LIVE</span>}
                    {!hasRecipeAccess&&isClient&&assignedRecipeNames.has(r.name)&&<span style={{fontSize:8,background:`${C.gold}22`,color:C.gold,padding:'1px 5px',borderRadius:4,fontWeight:700}}>✓ UNLOCKED</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedRecipe&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'13px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setSelectedRecipe(null)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:0}}>←</button>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.white}}>{selectedRecipe.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{selectedRecipe.category}</div>
                </div>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:16}}>
                <Card sx={{marginBottom:14}}>
                  <Lbl t="Full Macro Breakdown"/>
                  <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                    <MacroChip label="cal"  val={selectedRecipe.cal}/>
                    <MacroChip label="pro"  val={selectedRecipe.pro}  unit="g"/>
                    <MacroChip label="carb" val={selectedRecipe.carb} unit="g"/>
                    <MacroChip label="fat"  val={selectedRecipe.fat}  unit="g"/>
                    <MacroChip label="fib"  val={selectedRecipe.fib}  unit="g"/>
                  </div>
                </Card>
                <button onClick={()=>{
                  if(onAddRecipeToDiet){
                    onAddRecipeToDiet({name:selectedRecipe.name,serving:'1 serving',cal:selectedRecipe.cal,pro:selectedRecipe.pro,fat:selectedRecipe.fat,carb:selectedRecipe.carb,fib:selectedRecipe.fib,cat:'Recipes',isRecipe:true})
                    alert(`${selectedRecipe.name} added to your diet plan!`)
                  }
                }}
                  style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:13,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:12}}>
                  + Pull Into Diet Plan
                </button>
                {(hasRecipeAccess||isAdmin||isCoach||assignedRecipeNames.has(selectedRecipe.name))?(
                  <Card>
                    {!hasRecipeAccess&&!isAdmin&&!isCoach&&assignedRecipeNames.has(selectedRecipe.name)&&(
                      <div style={{fontSize:10,fontWeight:700,color:C.gold,background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:'5px 10px',marginBottom:12,display:'inline-block'}}>
                        ✓ Unlocked — assigned by your coach
                      </div>
                    )}
                    {(()=>{
                      const det = getRecipeDetails(selectedRecipe)
                      if(!det) return <><Lbl t="Recipe Details"/><div style={{fontSize:13,color:C.white,lineHeight:1.7}}>{selectedRecipe.method||'Full instructions in the LOE Recipe Book.'}</div></>
                      return (
                        <>
                          <Lbl t="🛒 Ingredients"/>
                          <ul style={{margin:'0 0 14px',paddingLeft:18}}>
                            {det.ingredients.map((ing,ii)=>(<li key={ii} style={{fontSize:13,color:C.white,lineHeight:1.8}}>{ing}</li>))}
                          </ul>
                          <Lbl t="👨‍🍳 Method"/>
                          <ol style={{margin:0,paddingLeft:18}}>
                            {det.method.map((st,si)=>(<li key={si} style={{fontSize:13,color:C.white,lineHeight:1.7,marginBottom:8}}>{st}</li>))}
                          </ol>
                        </>
                      )
                    })()}
                    <a href={RECIPE_BUY} target="_blank" rel="noreferrer"
                      style={{display:'block',textAlign:'center',fontSize:12,color:C.gold,textDecoration:'none',padding:'10px',border:`1px solid ${C.gold}33`,borderRadius:8,marginTop:12}}>
                      View Full Recipe Book →
                    </a>
                  </Card>
                ):(
                  <div style={{background:'linear-gradient(135deg,#1a1200,#2a1800)',border:`1px solid ${C.gold}33`,borderRadius:12,padding:16}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:6}}>🔒 Full Recipe Locked</div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.5}}>Macros pulled into your plan above for free. Unlock for full ingredients and instructions.</div>
                    <a href={RECIPE_BUY} target="_blank" rel="noreferrer"
                      style={{display:'block',background:C.gold,borderRadius:8,padding:'11px',textAlign:'center',textDecoration:'none',color:C.black,fontWeight:800,fontSize:13}}>
                      Unlock Full Recipe Book →
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACCESS MANAGEMENT MODAL (Admin only) ──────────── */}
      {showAccess&&accessCourse&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowAccess(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:540,maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:3}}>Manage Access — {accessCourse.title}</div>
              <div style={{fontSize:11,color:C.muted}}>{accessList.length} users currently have access</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:16}}>

              {/* Bulk grant buttons */}
              <div style={{background:C.surface,borderRadius:10,padding:'13px 14px',marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Bulk Grant Access</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                  <button onClick={()=>grantToEveryone(accessCourse)}
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'8px 14px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    🌐 All Coaches + All Clients
                  </button>
                </div>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>By Coach</div>
                {rosterCoaches.map(coach=>{
                  const coachClients = rosterClients.filter(c=>c.coachId===coach.uuid)
                  return (
                    <div key={coach.uuid} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontSize:12,color:C.white,fontWeight:600}}>{coach.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>{coachClients.length} client(s)</div>
                      </div>
                      <button onClick={()=>grantToCoachClients(coach.uuid, coach.name, accessCourse)}
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'5px 12px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        Grant to {coach.name} + Clients
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Individual grant */}
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Individual Access</div>
              {[...rosterCoaches,...rosterClients].map(user=>{
                const hasIt = accessList.find(a=>a.user_id===user.uuid)
                return (
                  <div key={user.uuid} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderTop:`1px solid ${C.border}`}}>
                    <div style={{width:32,height:32,borderRadius:16,background:hasIt?`${C.success}22`:C.surface,border:`1px solid ${hasIt?C.success+'44':C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:hasIt?C.success:C.muted,flexShrink:0}}>
                      {user.name[0]}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,color:C.white,fontWeight:500}}>{user.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1,textTransform:'capitalize'}}>
                        {user.role}{user.coachName?` · ${user.coachName}`:''}
                      </div>
                    </div>
                    {hasIt?(
                      <button onClick={()=>revokeAccess(user.uuid, accessCourse)}
                        style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'5px 10px',color:C.danger,fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                        Revoke
                      </button>
                    ):(
                      <button onClick={()=>grantAccess(user, accessCourse)}
                        style={{background:`${C.success}22`,border:`1px solid ${C.success}44`,borderRadius:6,padding:'5px 10px',color:C.success,fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                        Grant
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <button onClick={()=>setShowAccess(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TIER DISTRIBUTION MODAL (Eden admin only) ─────── */}
      {showTiers&&tiersCourse&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowTiers(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,maxHeight:'82vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:3}}>Distribution — {tiersCourse.title}</div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                Choose which white-label tiers include this course. Leave all unchecked to keep it internal to Lifestyle of Eden.
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:16}}>
              <div style={{background:tierSel.size===0?`${C.gold}12`:C.surface,border:`1px solid ${tierSel.size===0?C.gold+'44':C.border}`,borderRadius:10,padding:'11px 13px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>🔒</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:tierSel.size===0?C.gold:C.white}}>Eden Only</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>Not shared with any white-label tier</div>
                </div>
                {tierSel.size>0&&(
                  <button onClick={()=>setTierSel(new Set())}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',color:C.muted,fontSize:10,fontWeight:700,cursor:'pointer'}}>
                    Clear All
                  </button>
                )}
              </div>
              <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Included In Tiers</div>
              {allPackages.length===0&&(
                <div style={{fontSize:11,color:C.muted,textAlign:'center',padding:16}}>No active tiers found. Create tiers in the Tiers &amp; Packages manager first.</div>
              )}
              {allPackages.map(pkg=>{
                const on = tierSel.has(pkg.id)
                return (
                  <label key={pkg.id} style={{display:'flex',alignItems:'center',gap:11,padding:'10px 12px',borderRadius:10,border:`1px solid ${on?C.success+'44':C.border}`,background:on?`${C.success}10`:C.surface,marginBottom:6,cursor:'pointer'}}>
                    <input type="checkbox" checked={on} style={{accentColor:C.gold}}
                      onChange={()=>setTierSel(prev=>{const n=new Set(prev); on?n.delete(pkg.id):n.add(pkg.id); return n})}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.white,textTransform:'capitalize'}}>{pkg.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                        ${pkg.price}/mo
                      </div>
                    </div>
                    {on&&<span style={{fontSize:12,color:C.success,fontWeight:700}}>✓</span>}
                  </label>
                )
              })}
            </div>
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',gap:10}}>
              <button onClick={()=>setShowTiers(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveTiers} disabled={savingTiers}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:10,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:savingTiers?.6:1}}>
                {savingTiers?'Saving…':tierSel.size===0?'Save — Eden Only':`Save — ${tierSel.size} Tier${tierSel.size>1?'s':''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COURSE CONTENT BUILDER MODAL (Admin only) ─────── */}
      {showBuilder&&activeCourse&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)closeBuilder()}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'86vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              {courseEdit?(
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:7}}>Edit Course Details</div>
                  <input autoFocus value={courseEdit.title} onChange={e=>setCourseEdit({...courseEdit,title:e.target.value})}
                    placeholder="Course title…"
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'8px 11px',color:C.white,fontSize:13,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
                  <textarea value={courseEdit.description||''} onChange={e=>setCourseEdit({...courseEdit,description:e.target.value})}
                    placeholder="Course description…" rows={2}
                    style={{width:'100%',marginTop:7,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 11px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                  <div style={{display:'flex',gap:8,marginTop:8}}>
                    <button onClick={saveCourseEdit} disabled={savingCourseEdit||!courseEdit.title.trim()}
                      style={{background:C.gold,border:'none',borderRadius:7,padding:'7px 14px',color:C.black,fontSize:11,fontWeight:800,cursor:'pointer',opacity:savingCourseEdit||!courseEdit.title.trim()?.5:1}}>
                      {savingCourseEdit?'Saving…':'Save Details'}
                    </button>
                    <button onClick={()=>setCourseEdit(null)}
                      style={{background:'none',border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 12px',color:C.muted,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              ):(
                <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:3}}>Course Content — {activeCourse.title}</div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                      Build the course like the CEO course: sections, each with its own lessons. Changes save instantly. Add videos by opening a lesson from the course view.
                    </div>
                  </div>
                  <button onClick={()=>setCourseEdit({title:activeCourse.title||'',description:activeCourse.description||''})}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 10px',color:C.muted,fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                    Edit Details
                  </button>
                </div>
              )}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:16}}>
              {draftSecs.length===0&&(
                <div style={{fontSize:12,color:C.muted,textAlign:'center',padding:'20px 10px',lineHeight:1.6}}>
                  No sections yet. Add your first section below to start building.
                </div>
              )}
              {draftSecs.map((sec,secIdx)=>{
                const secMods = modules.filter(m=>m.section_id===sec.id)
                const secModsSorted = [...secMods].sort((a,b)=>a.sort_order-b.sort_order)
                const arrowBtn = (disabled,onClick,label,title) => (
                  <button onClick={onClick} disabled={disabled} title={title} aria-label={title}
                    style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 7px',color:disabled?C.dim:C.muted,fontSize:10,cursor:disabled?'default':'pointer',flexShrink:0}}>
                    {label}
                  </button>
                )
                return (
                  <div key={sec.id} style={{border:`1px solid ${C.border}`,borderRadius:12,marginBottom:12,overflow:'hidden'}}>
                    {/* Section header */}
                    <div style={{background:C.surface,padding:'10px 12px',display:'flex',alignItems:'center',gap:9}}>
                      <div style={{width:26,height:26,borderRadius:7,background:`${sec.color}22`,color:sec.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{sec.id}</div>
                      {secEdit?.id===sec.id?(
                        <>
                          <input autoFocus value={secEdit.title} onChange={e=>setSecEdit({...secEdit,title:e.target.value})}
                            onKeyDown={e=>{if(e.key==='Enter')saveSectionTitle(sec,secEdit.title)}}
                            style={{flex:1,background:C.card,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'5px 9px',color:C.white,fontSize:12,outline:'none'}}/>
                          <button onClick={()=>saveSectionTitle(sec,secEdit.title)}
                            style={{background:C.gold,border:'none',borderRadius:6,padding:'5px 10px',color:C.black,fontSize:10,fontWeight:700,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>setSecEdit(null)}
                            style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 8px',color:C.muted,fontSize:10,cursor:'pointer'}}>✕</button>
                        </>
                      ):(
                        <>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:700,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sec.title}</div>
                            <div style={{fontSize:9,color:C.muted}}>{secMods.length} lesson{secMods.length===1?'':'s'}{secMods.length===0?' — add one to keep this section':''}</div>
                          </div>
                          {arrowBtn(builderBusy||secIdx===0, ()=>moveSection(sec,-1), '↑', 'Move section up')}
                          {arrowBtn(builderBusy||secIdx===draftSecs.length-1, ()=>moveSection(sec,1), '↓', 'Move section down')}
                          <button onClick={()=>setSecEdit({id:sec.id,title:sec.title})}
                            style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 9px',color:C.muted,fontSize:10,cursor:'pointer'}}>Rename</button>
                          <button onClick={()=>deleteSection(sec)}
                            style={{background:`${C.danger}18`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'4px 9px',color:C.danger,fontSize:10,fontWeight:700,cursor:'pointer'}}>Delete</button>
                        </>
                      )}
                    </div>
                    {/* Lessons */}
                    <div style={{padding:'6px 10px'}}>
                      {secModsSorted.map((m,mIdx)=>(
                        modEdit?.id===m.id?(
                          <div key={m.id} style={{padding:'6px 0'}}>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <input autoFocus value={modEdit.title} onChange={e=>setModEdit({...modEdit,title:e.target.value})}
                                style={{flex:1,background:C.surface,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'6px 9px',color:C.white,fontSize:11,outline:'none'}}/>
                              <input value={modEdit.duration||''} onChange={e=>setModEdit({...modEdit,duration:e.target.value})} placeholder="e.g. 12 min"
                                style={{width:70,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:11,outline:'none'}}/>
                              <button onClick={saveModuleEdit}
                                style={{background:C.gold,border:'none',borderRadius:6,padding:'6px 10px',color:C.black,fontSize:10,fontWeight:700,cursor:'pointer'}}>Save</button>
                              <button onClick={()=>setModEdit(null)}
                                style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.muted,fontSize:10,cursor:'pointer'}}>✕</button>
                            </div>
                            <input value={modEdit.video_url||''} onChange={e=>setModEdit({...modEdit,video_url:e.target.value})}
                              placeholder="Video link — paste a regular OR embed link (YouTube, Vimeo, Loom, Google Drive)…"
                              style={{width:'100%',marginTop:6,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 9px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box'}}/>
                            <textarea value={modEdit.admin_notes||''} onChange={e=>setModEdit({...modEdit,admin_notes:e.target.value})}
                              placeholder="Module notes (visible to anyone viewing this module)…" rows={2}
                              style={{width:'100%',marginTop:6,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 9px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                          </div>
                        ):(
                          <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 2px',borderBottom:`1px solid ${C.border}`}}>
                            <span style={{fontSize:10,color:C.muted,width:18,textAlign:'right',flexShrink:0}}>{m.module_id}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,color:C.white,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.title}</div>
                              <div style={{fontSize:9,color:C.muted,display:'flex',gap:8}}>
                                {m.duration&&<span>{m.duration}</span>}
                                <span style={{color:m.video_url?C.success:C.danger}}>{m.video_url?'▶ video added':'no video yet'}</span>
                              </div>
                            </div>
                            {arrowBtn(builderBusy||mIdx===0, ()=>moveModule(m,-1), '↑', 'Move lesson up')}
                            {arrowBtn(builderBusy||mIdx===secModsSorted.length-1, ()=>moveModule(m,1), '↓', 'Move lesson down')}
                            <button onClick={()=>setModEdit({id:m.id,title:m.title,duration:m.duration||'',admin_notes:m.admin_notes||'',video_url:m.video_url||''})}
                              style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 8px',color:C.muted,fontSize:9,cursor:'pointer',flexShrink:0}}>Edit</button>
                            <button onClick={()=>deleteModule(m)}
                              style={{background:'none',border:`1px solid ${C.danger}44`,borderRadius:6,padding:'3px 8px',color:C.danger,fontSize:9,fontWeight:700,cursor:'pointer',flexShrink:0}}>✕</button>
                          </div>
                        )
                      ))}
                      {/* Add lesson */}
                      {newModFor===sec.id?(
                        <div style={{display:'flex',gap:6,alignItems:'center',padding:'8px 0'}}>
                          <input autoFocus value={newModTitle} onChange={e=>setNewModTitle(e.target.value)} placeholder="Lesson title…"
                            onKeyDown={e=>{if(e.key==='Enter')addModule(sec)}}
                            style={{flex:1,background:C.surface,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'6px 9px',color:C.white,fontSize:11,outline:'none'}}/>
                          <input value={newModDur} onChange={e=>setNewModDur(e.target.value)} placeholder="e.g. 12 min"
                            style={{width:70,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:11,outline:'none'}}/>
                          <button onClick={()=>addModule(sec)} disabled={builderBusy||!newModTitle.trim()}
                            style={{background:C.gold,border:'none',borderRadius:6,padding:'6px 10px',color:C.black,fontSize:10,fontWeight:700,cursor:'pointer',opacity:builderBusy||!newModTitle.trim()?.5:1}}>
                            {builderBusy?'Adding…':'Add'}
                          </button>
                          <button onClick={()=>{setNewModFor(null);setNewModTitle('');setNewModDur('')}}
                            style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.muted,fontSize:10,cursor:'pointer'}}>✕</button>
                        </div>
                      ):(
                        <button onClick={()=>{setNewModFor(sec.id);setNewModTitle('');setNewModDur('')}}
                          style={{width:'100%',background:'none',border:`1px dashed ${C.border}`,borderRadius:8,padding:'7px',color:C.muted,fontSize:11,cursor:'pointer',margin:'7px 0 4px'}}>
                          + Add Lesson
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* Add section */}
              <div style={{display:'flex',gap:8,marginTop:4}}>
                <input value={newSecTitle} onChange={e=>setNewSecTitle(e.target.value)} placeholder="New section title…"
                  onKeyDown={e=>{if(e.key==='Enter')addSectionDraft()}}
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none'}}/>
                <button onClick={addSectionDraft} disabled={!newSecTitle.trim()}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'9px 14px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer',opacity:newSecTitle.trim()?1:.5}}>
                  + Add Section
                </button>
              </div>
            </div>
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <button onClick={closeBuilder}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,color:C.black,fontSize:13,fontWeight:800,cursor:'pointer'}}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW COURSE MODAL (Admin only) ─────────────────── */}
      {showNewCourse&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowNewCourse(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:420,padding:24}}>
            <div style={{fontSize:16,fontWeight:700,color:C.white,marginBottom:4}}>Create New Course</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Course will be saved as a draft. Publish when ready and grant access to coaches and clients.</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Course Title</div>
              <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="e.g. Gut Health Mastery"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Description</div>
              <textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Brief description…" rows={3}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowNewCourse(false)}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={createCourse} disabled={savingCourse||!newTitle.trim()}
                style={{flex:2,background:C.gold,border:'none',borderRadius:8,padding:11,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newTitle.trim()&&!savingCourse?1:.5}}>
                {savingCourse?'Creating…':'Create Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENT PROGRESS MODAL (Coach only) ───────────── */}
      {showProgress&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowProgress(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:480,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:2}}>Client Progress</div>
              <div style={{fontSize:11,color:C.muted}}>{activeCourse?.title}</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:16}}>
              {clientProgress.length===0?(
                <div style={{textAlign:'center',padding:30,color:C.muted,fontSize:13}}>
                  No clients have been granted access to this course yet. Ask admin to grant access.
                </div>
              ):clientProgress.map((cp,i)=>(
                <div key={i} style={{background:C.surface,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                    <div style={{width:36,height:36,borderRadius:18,background:`${C.gold}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>
                      {cp.name[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.white}}>{cp.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>Last active: {cp.lastActive}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:18,fontWeight:800,color:cp.pct>=80?C.success:cp.pct>=40?C.gold:C.muted}}>{cp.pct}%</div>
                      <div style={{fontSize:10,color:C.muted}}>{cp.done}/{cp.total} modules</div>
                    </div>
                  </div>
                  <div style={{height:6,borderRadius:3,background:C.border}}>
                    <div style={{width:`${cp.pct}%`,height:'100%',borderRadius:3,background:cp.pct>=80?C.success:cp.pct>=40?C.gold:C.muted,transition:'width .5s'}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <button onClick={()=>setShowProgress(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── RecipePicker for DietBuilder ──────────────────────────────
export function RecipePicker({onSelect, onClose}) {
  const [search,  setSearch]  = useState('')
  const [recipes, setRecipes] = useState(STATIC_RECIPES)
  const [loading, setLoading] = useState(false)
  useEffect(()=>{
    setLoading(true)
    fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&range=AT:BA`)
      .then(r=>r.text()).then(t=>{
        const json=JSON.parse(t.replace(/^.*?\(/,'').replace(/\);?\s*$/,''))
        const rows=json?.table?.rows||[]
        if(rows.length>1){
          const parsed=rows.slice(1).map(row=>{
            const c=row.c||[]
            // c[1] (Recipe/Method column) only has a value for actual recipes — grocery/food rows in the same sheet range are skipped
            return{name:c[0]?.v||'',hasMethod:!!c[1]?.v,serving:'1 serving',cal:parseFloat(c[3]?.v)||0,pro:parseFloat(c[4]?.v)||0,fat:parseFloat(c[5]?.v)||0,carb:parseFloat(c[6]?.v)||0,fib:parseFloat(c[7]?.v)||0,cat:'Recipes',isRecipe:true}
          }).filter(r=>r.name&&r.cal>0&&r.hasMethod)
          if(parsed.length>0){const names=new Set(parsed.map(r=>r.name));setRecipes([...parsed,...STATIC_RECIPES.filter(r=>!names.has(r.name)).map(r=>({...r,serving:'1 serving',cat:'Recipes',isRecipe:true}))])}
        }
      }).catch(()=>{}).finally(()=>setLoading(false))
  },[])
  const filtered=recipes.filter(r=>!search||r.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:16,width:'100%',maxWidth:480,maxHeight:'82vh',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 16px 10px',borderBottom:'1px solid #2a2a2a'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:6}}>🍽 Pull Recipe into Meal</div>
          <div style={{fontSize:11,color:'#888',marginBottom:8}}>{loading?'Loading from Google Sheets…':`${recipes.length} recipes available`}</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes…" autoFocus
            style={{width:'100%',background:'#111',border:'1px solid #2a2a2a',borderRadius:8,padding:'9px 12px',color:'#fff',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
          {filtered.map((r,i)=>(
            <button key={i} onClick={()=>onSelect(r)}
              style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'10px 16px',cursor:'pointer',borderBottom:'1px solid #2a2a2a',display:'flex',justifyContent:'space-between',alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='#ffa60010'}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              <div>
                <div style={{fontSize:13,color:'#fff',fontWeight:500}}>{r.name}</div>
                <div style={{fontSize:10,color:'#888',marginTop:1}}>1 serving · {r.cal} cal · P:{r.pro}g C:{r.carb}g F:{r.fat}g</div>
              </div>
              <span style={{color:'#ffa600',fontSize:18,flexShrink:0}}>+</span>
            </button>
          ))}
        </div>
        <div style={{padding:'10px 16px',borderTop:'1px solid #2a2a2a'}}>
          <button onClick={onClose} style={{width:'100%',background:'#111',border:'1px solid #2a2a2a',borderRadius:8,padding:10,color:'#888',fontSize:13,cursor:'pointer'}}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
