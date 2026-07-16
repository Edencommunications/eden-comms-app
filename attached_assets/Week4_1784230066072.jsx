// ═══════════════════════════════════════════════════════════════
// Week4.jsx — Labs, Calendar, Workout Builder, Cardio
// Place at: src/components/Week4.jsx in Replit
//
// In App.jsx add:
// import Week4 from './components/Week4'
// {tab === 'workout' && <Week4 currentUser={currentUser} />}
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',    role:'coach' },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Jordan Williams', role:'client' },
  'admin@edencomms.io': { uuid:null,                                    name:'Eden Admin',      role:'super_admin' },
}

// GHL calendar URL for Lifestyle of Eden
// White-label coaches replace this with their own GHL or Calendly link
const DEFAULT_CALENDAR_URL = 'https://links.lifestyleofeden.com/widget/booking/2kKUGzYZqAaNBVpd5uzA'

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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:H })
  if (!res.ok) return []
  return res.json()
}
async function dbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!res.ok) { console.error('INSERT', await res.text()); return null }
  const t = await res.text(); return t ? JSON.parse(t) : null
}
async function dbUpdate(table, params, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method:'PATCH', headers:H, body:JSON.stringify(body)
  })
}

// ── Exercise library from your Google Sheets ─────────────────
const EXERCISE_LIBRARY = {
  'Full Body': [
    'BB Back Squat','BB Front Squat','Safety Bar Squat','Hack Squat',
    'Leg Press','DB Split Squat','BB Split Squat','DB Walking Lunge',
    'BB Walking Lunge','BB Hip Thrust','DB Hip Thrust','BB Glute Bridge',
  ],
  'Upper': [
    'Flat DB Bench Press','Flat BB Bench Press','Incline DB Bench Press',
    'Incline BB Bench Press','Decline DB Bench Press','Seated DB Shoulder Press',
    'Seated BB Shoulder Press','Military Press','Standing DB Lateral Raise',
    'Seated DB Lateral Raise','Cable Face Pull','DB Upright Row','BB Upright Row',
    'BB Shrug','Trap Bar Shrug','Smith Machine Shrug',
  ],
  'Push': [
    'Flat DB Bench Press','Flat BB Bench Press','Incline DB Bench Press',
    'Incline BB Bench Press','Decline DB Bench Press','Neutral Grip DB Bench Press',
    'Narrow Grip BB Bench Press','DB Floor Press','BB Floor Press','DB Hex Press',
    'Seated DB Shoulder Press','Seated BB Shoulder Press','Military Press',
    'Standing DB Shoulder Press','Seated Machine Shoulder Press','BB Z-Press',
    'DB Z-Press','Standing DB Lateral Raise','Seated DB Lateral Raise',
    'Single Arm Cable Lateral Raise','Dual Cable Lateral Raise','DB Front Raise',
    'Plate Front Raise','Chest Dips','Machine Dips','Rope Tricep Pushdown',
    'Dual Rope Tricep Pushdown','DB Overhead Tricep Extension',
    'Cable Overhead Tricep Extension','EZ Bar Skullcrusher','DB Skullcrusher',
    'EZ Bar Deadstop Skullcrusher','Banded Tricep Pushdown',
  ],
  'Pull': [
    'Wide Grip Lat Pulldown','Narrow Grip Lat Pulldown','Neutral Grip Lat Pulldown',
    'Underhand Grip Lat Pulldown','Single Arm Lat Pulldown','Chest Supported Lat Pulldown',
    'Upper Back Pulldown','Wide Grip Pull-ups','Narrow Grip Pull-ups',
    'Neutral Grip Pull-ups','Underhand Grip Pull-ups','Band Assisted Pull-ups',
    'Machine Assisted Pull-ups','BB Bent Over Row','BB Chest Supported Row',
    'BB Pendlay Row','DB Chest Supported Row','Machine Chest Supported Row',
    'T-Bar Row','Single Arm Bent Over DB Row','Dual Arm Bent Over DB Row',
    'Seated Cable Row','Seated Machine Row','DB Pullover','Cable Pullover',
    'Machine Pullover','Rack Pull','Stiff Leg Deadlift','Trap Bar Deadlift',
    'Conventional Deadlift','BB RDL','DB RDL','DB Hammer Curl',
    'Standing DB Alternate Bicep Curl','Seated DB Alternate Bicep Curl',
    'Incline DB Bicep Curl','Single Arm DB Preacher Curl','EZ Bar Preacher Curl',
    'Rope Hammer Curl','Cable Bicep Curl','BB Bicep Curl',
  ],
  'Lower': [
    'BB Back Squat','BB Front Squat','Safety Bar Squat','Hack Squat',
    'V-Squat Machine','DB Split Squat','BB Split Squat',
    'Rear Foot Elevated DB Split Squat','Rear Foot Elevated BB Split Squat',
    'DB Walking Lunge','BB Walking Lunge','DB Reverse Lunge','BB Reverse Lunge',
    'Leg Press','Single Leg Press','Machine Hip Adduction','Machine Hip Abduction',
    'Glute Drive','BB Hip Thrust','DB Hip Thrust','BB Glute Bridge','DB Glute Bridge',
    'Single Leg DB Hip Thrust','Seated Leg Extension','Seated Single Leg Extension',
    'Lying Machine Leg Curl','Standing Machine Leg Curl','Seated Machine Leg Curl',
    'BB Good Morning','Smith Machine Squat','Standing Machine Calf Raise',
    'Standing DB Calf Raise','Standing BB Calf Raise','Seated DB Calf Raise',
    'Seated Machine Calf Raise','Belt Squat','Goblet Squat','Sumo Deadlift',
  ],
  'Abs': [
    'Hanging Knee Raise','Hanging Leg Raise','Garhammer Raise','Rope Crunch',
    'Weighted Crunch','Russian Twist','Plank',
  ],
}

const CARDIO_TYPES = [
  'Treadmill','Bike','HIIT','Stairmaster','Brisk Walk','Run',
  'Swimming','Rowing Machine','Jump Rope','Elliptical',
]

const LAB_TYPES = [
  'Blood Work','DUTCH Test','GI-MAP','Hormone Panel',
  'Thyroid Panel','Metabolic Panel','Other',
]

// ── Helpers ───────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
}

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return b+' B'
  if (b < 1048576) return Math.round(b/1024)+' KB'
  return (b/1048576).toFixed(1)+' MB'
}

// ── Mini UI ───────────────────────────────────────────────────
function Lbl({t}) {
  return <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',margin:'14px 0 7px'}}>{t}</div>
}
function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}
function Inp({label,value,onChange,type='text',placeholder,sx={}}) {
  return (
    <div style={{marginBottom:10,...sx}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
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

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function Week4({currentUser}) {
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'client',name:'User',uuid:null}
  const role    = info.role
  const myUUID  = info.uuid
  const isCoach = role==='coach'||role==='super_admin'

  const CLIENT_UUID = KNOWN_USERS['client@eden.io'].uuid
  const COACH_UUID  = KNOWN_USERS['coach@eden.io'].uuid

  // ── Main tab ──────────────────────────────────────────────
  const [tab, setTab] = useState('labs')

  // ── Labs state ────────────────────────────────────────────
  const [labs,        setLabs]        = useState([])
  const [labComments, setLabComments] = useState({})
  const [activeLab,   setActiveLab]   = useState(null)
  const [newComment,  setNewComment]  = useState('')
  const [labFilter,   setLabFilter]   = useState('All')
  const [uploading,   setUploading]   = useState(false)
  const [newLabNote,  setNewLabNote]  = useState('')
  const [newLabType,  setNewLabType]  = useState('Blood Work')
  const labFileRef = useRef(null)

  // ── Workout state ─────────────────────────────────────────
  const [workouts,      setWorkouts]      = useState(
    [1,2,3,4,5,6].map(i=>({
      name:`Workout ${i}`, exercises:[], notes:'',
    }))
  )
  const [activeWorkout, setActiveWorkout] = useState(0)
  const [showExPicker,  setShowExPicker]  = useState(false)
  const [exSearch,      setExSearch]      = useState('')
  const [exCategory,    setExCategory]    = useState('Push')
  const [activeWeek,    setActiveWeek]    = useState(1)
  const [workoutLogs,   setWorkoutLogs]   = useState({})

  // ── Cardio state ──────────────────────────────────────────
  const [cardio, setCardio] = useState([
    {type:'Brisk Walk', duration:'45-60 min', frequency:'Daily', notes:'Fasted morning walk preferred'},
  ])

  // ── Calendar state ────────────────────────────────────────
  const [calendarUrl, setCalendarUrl] = useState(DEFAULT_CALENDAR_URL)

  // ── Load labs on mount ────────────────────────────────────
  useEffect(()=>{ loadLabs() },[])

  async function loadLabs() {
    const data = await dbGet('lab_results',
      `client_id=eq.${CLIENT_UUID}&order=created_at.desc`
    )
    setLabs(data||[])
  }

  async function loadComments(labId) {
    const data = await dbGet('lab_comments',
      `lab_id=eq.${labId}&order=created_at.asc`
    )
    setLabComments(p=>({...p,[labId]:data||[]}))
  }

  async function openLab(lab) {
    setActiveLab(lab)
    loadComments(lab.id)
  }

  // ── Upload lab file ───────────────────────────────────────
  async function handleLabUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path   = `labs/${CLIENT_UUID}/${Date.now()}-${file.name}`
      const upRes  = await fetch(`${SUPABASE_URL}/storage/v1/object/lab-files/${path}`, {
        method:'POST',
        headers:{'apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`,'Content-Type':file.type},
        body:file,
      })
      const fileUrl = upRes.ok
        ? `${SUPABASE_URL}/storage/v1/object/public/lab-files/${path}`
        : null

      const inserted = await dbInsert('lab_results',{
        client_id:    CLIENT_UUID,
        coach_id:     COACH_UUID,
        uploaded_by:  myUUID,
        uploader_name:info.name,
        lab_type:     newLabType,
        file_url:     fileUrl,
        file_name:    file.name,
        file_size:    file.size,
        notes:        newLabNote,
      })
      if (inserted) {
        const arr = Array.isArray(inserted)?inserted:[inserted]
        setLabs(p=>[arr[0],...p])
        setNewLabNote('')
      }
    } catch(err) {
      console.error('Lab upload error',err)
      // Still save the record even if storage fails
      await dbInsert('lab_results',{
        client_id:CLIENT_UUID, coach_id:COACH_UUID,
        uploaded_by:myUUID, uploader_name:info.name,
        lab_type:newLabType, notes:newLabNote,
        file_name:file.name, file_size:file.size,
      })
      loadLabs()
      setNewLabNote('')
    } finally {
      setUploading(false)
      if (labFileRef.current) labFileRef.current.value=''
    }
  }

  async function postComment(labId) {
    if (!newComment.trim()) return
    const inserted = await dbInsert('lab_comments',{
      lab_id:      labId,
      author_id:   myUUID,
      author_name: info.name,
      author_role: role,
      content:     newComment.trim(),
    })
    if (inserted) {
      const arr = Array.isArray(inserted)?inserted:[inserted]
      setLabComments(p=>({...p,[labId]:[...(p[labId]||[]),arr[0]]}))
      setNewComment('')
    }
  }

  // ── Workout builder ───────────────────────────────────────
  function addExercise(name) {
    setWorkouts(p=>p.map((w,i)=>i===activeWorkout
      ?{...w,exercises:[...w.exercises,{
          name, sets:4, reps:'10-12', rest:'90 sec',
          cues:'', videoLink:'', id:Date.now()+'_'+name,
        }]}
      :w
    ))
    setShowExPicker(false); setExSearch('')
  }

  function removeExercise(exId) {
    setWorkouts(p=>p.map((w,i)=>i===activeWorkout
      ?{...w,exercises:w.exercises.filter(e=>e.id!==exId)}:w
    ))
  }

  function updateExercise(exId, field, val) {
    setWorkouts(p=>p.map((w,i)=>i===activeWorkout
      ?{...w,exercises:w.exercises.map(e=>e.id===exId?{...e,[field]:val}:e)}:w
    ))
  }

  // Client workout logging
  function getLog(exId, setIdx) {
    return workoutLogs[`${activeWeek}_${exId}_${setIdx}`]||{weight:'',reps:''}
  }
  function setLog(exId, setIdx, field, val) {
    const key = `${activeWeek}_${exId}_${setIdx}`
    setWorkoutLogs(p=>({...p,[key]:{...p[key],[field]:val}}))
  }

  async function saveWorkoutPlan() {
    await dbInsert('workout_plans',{
      client_id:CLIENT_UUID, coach_id:COACH_UUID,
      workouts:JSON.stringify(workouts),
      cardio:JSON.stringify(cardio),
      updated_at:new Date().toISOString(),
    })
    alert('Workout plan saved!')
  }

  // ── Cardio ────────────────────────────────────────────────
  function addCardio() {
    setCardio(p=>[...p,{type:'Brisk Walk',duration:'30 min',frequency:'3x/week',notes:''}])
  }
  function removeCardio(i) { setCardio(p=>p.filter((_,j)=>j!==i)) }
  function updateCardio(i,field,val) {
    setCardio(p=>p.map((c,j)=>j===i?{...c,[field]:val}:c))
  }

  const filteredExercises = Object.entries(EXERCISE_LIBRARY).flatMap(([cat,exs])=>
    exs.filter(e=>!exSearch||e.toLowerCase().includes(exSearch.toLowerCase()))
       .map(e=>({name:e,cat}))
  ).filter(e=>!exSearch?e.cat===exCategory:true)

  const filteredLabs = labFilter==='All'?labs:labs.filter(l=>l.lab_type===labFilter)

  const TABS = [
    ['labs',    '🧪 Labs'],
    ['workout', '💪 Workout'],
    ['cardio',  '🏃 Cardio'],
    ['calendar','📅 Calendar'],
  ]

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden'}}>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>
            {isCoach?'Client Tools — Jordan Williams':'My Tools'}
          </div>
        </div>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'13px 14px',background:'none',border:'none',borderBottom:`2px solid ${tab===k?C.gold:'transparent'}`,color:tab===k?C.gold:C.muted,fontSize:12,fontWeight:tab===k?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          LABS TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='labs'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Lab list */}
          <div style={{width:activeLab?280:undefined,flex:activeLab?undefined:1,borderRight:activeLab?`1px solid ${C.border}`:undefined,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Upload area */}
            <div style={{padding:14,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <Sel label="Lab Type" value={newLabType} onChange={setNewLabType} options={LAB_TYPES}/>
              <Inp label="Notes (optional)" value={newLabNote} onChange={setNewLabNote} placeholder="e.g. Fasted 12hr before draw"/>
              <input type="file" ref={labFileRef} onChange={handleLabUpload} style={{display:'none'}}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"/>
              <button onClick={()=>labFileRef.current?.click()} disabled={uploading}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:'9px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',opacity:uploading?.6:1}}>
                {uploading?'Uploading…':'⬆ Upload Lab Result'}
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{padding:'8px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:6,flexWrap:'wrap',flexShrink:0}}>
              {['All',...LAB_TYPES].map(f=>(
                <button key={f} onClick={()=>setLabFilter(f)}
                  style={{padding:'3px 10px',borderRadius:6,border:`1px solid ${labFilter===f?C.gold:C.border}`,background:labFilter===f?`${C.gold}20`:C.card,color:labFilter===f?C.gold:C.muted,fontSize:10,fontWeight:labFilter===f?700:400,cursor:'pointer'}}>
                  {f}
                </button>
              ))}
            </div>

            {/* Lab list */}
            <div style={{flex:1,overflowY:'auto'}}>
              {filteredLabs.length===0&&(
                <div style={{padding:24,textAlign:'center',color:C.muted,fontSize:13}}>
                  No lab results yet. Upload your first one above.
                </div>
              )}
              {filteredLabs.map(lab=>(
                <button key={lab.id} onClick={()=>openLab(lab)}
                  style={{width:'100%',textAlign:'left',background:activeLab?.id===lab.id?`${C.gold}15`:C.surface,border:'none',borderLeft:`3px solid ${activeLab?.id===lab.id?C.gold:'transparent'}`,padding:'12px 14px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:activeLab?.id===lab.id?C.gold:C.white}}>{lab.lab_type}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{formatTime(lab.created_at)}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>Uploaded by {lab.uploader_name}</div>
                    </div>
                    <span style={{fontSize:10,background:`${C.gold}22`,color:C.gold,padding:'2px 7px',borderRadius:10,fontWeight:700,flexShrink:0,marginLeft:8}}>
                      {lab.lab_type.split(' ')[0]}
                    </span>
                  </div>
                  {lab.notes&&<div style={{fontSize:11,color:C.muted,marginTop:4,fontStyle:'italic'}}>{lab.notes}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Lab detail + comments */}
          {activeLab&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {/* Header */}
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setActiveLab(null)}
                  style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>←</button>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.white}}>{activeLab.lab_type}</div>
                  <div style={{fontSize:11,color:C.muted}}>{formatTime(activeLab.created_at)} · {activeLab.uploader_name}</div>
                </div>
                {activeLab.file_url&&(
                  <a href={activeLab.file_url} target="_blank" rel="noreferrer"
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 12px',color:C.gold,fontSize:11,fontWeight:700,textDecoration:'none'}}>
                    View File →
                  </a>
                )}
              </div>

              {/* File preview */}
              {activeLab.file_url&&activeLab.file_name?.match(/\.(jpg|jpeg|png|webp)$/i)&&(
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <img src={activeLab.file_url} alt={activeLab.file_name}
                    style={{maxWidth:'100%',maxHeight:200,borderRadius:8,objectFit:'contain',display:'block'}}/>
                </div>
              )}

              {activeLab.file_url&&activeLab.file_name?.match(/\.pdf$/i)&&(
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <a href={activeLab.file_url} target="_blank" rel="noreferrer"
                    style={{display:'flex',alignItems:'center',gap:10,background:C.surface,borderRadius:8,padding:'10px 12px',textDecoration:'none',border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:28}}>📄</span>
                    <div>
                      <div style={{fontSize:13,color:C.gold,fontWeight:600}}>{activeLab.file_name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{formatBytes(activeLab.file_size)} · Click to open</div>
                    </div>
                  </a>
                </div>
              )}

              {activeLab.notes&&(
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:4}}>NOTES</div>
                  <div style={{fontSize:13,color:C.white}}>{activeLab.notes}</div>
                </div>
              )}

              {/* Comments */}
              <div style={{flex:1,overflowY:'auto',padding:16}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:12}}>COMMENTS & COACH FEEDBACK</div>
                {(labComments[activeLab.id]||[]).length===0&&(
                  <div style={{color:C.muted,fontSize:13,fontStyle:'italic',marginBottom:16}}>No comments yet. Add the first one below.</div>
                )}
                {(labComments[activeLab.id]||[]).map(c=>(
                  <div key={c.id} style={{marginBottom:12,display:'flex',gap:10}}>
                    <div style={{width:30,height:30,borderRadius:15,background:c.author_role==='coach'?C.gold:C.surface,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:c.author_role==='coach'?C.black:C.white,flexShrink:0}}>
                      {c.author_name?.[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                        <span style={{fontSize:12,fontWeight:700,color:c.author_role==='coach'?C.gold:C.white}}>{c.author_name}</span>
                        <span style={{fontSize:9,color:C.muted,textTransform:'uppercase',fontWeight:700,letterSpacing:.8}}>{c.author_role}</span>
                        <span style={{fontSize:10,color:C.muted,marginLeft:'auto'}}>{formatTime(c.created_at)}</span>
                      </div>
                      <div style={{fontSize:13,color:C.white,lineHeight:1.5,background:C.surface,borderRadius:8,padding:'8px 10px'}}>{c.content}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comment input */}
              <div style={{padding:'10px 16px 14px',background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',gap:8,flexShrink:0}}>
                <input value={newComment} onChange={e=>setNewComment(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),postComment(activeLab.id))}
                  placeholder="Add a comment or coach note…"
                  style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none'}}/>
                <button onClick={()=>postComment(activeLab.id)} disabled={!newComment.trim()}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'9px 16px',fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',opacity:newComment.trim()?1:.4}}>
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          WORKOUT BUILDER TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='workout'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Workout selector sidebar */}
          <div style={{width:160,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
            <div style={{padding:'12px 12px 8px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Workouts</div>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {workouts.map((w,i)=>(
                <button key={i} onClick={()=>setActiveWorkout(i)}
                  style={{width:'100%',textAlign:'left',background:activeWorkout===i?`${C.gold}15`:C.surface,border:'none',borderLeft:`3px solid ${activeWorkout===i?C.gold:'transparent'}`,padding:'10px 12px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:activeWorkout===i?700:400,color:activeWorkout===i?C.gold:C.white}}>{w.name}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>{w.exercises.length} exercises</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Week selector for client logging */}
            {!isCoach&&(
              <div style={{padding:12,borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:6}}>TRACKING WEEK</div>
                <input type="number" min="1" max="52" value={activeWeek} onChange={e=>setActiveWeek(parseInt(e.target.value)||1)}
                  style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.gold,fontSize:14,fontWeight:700,outline:'none',textAlign:'center',boxSizing:'border-box'}}/>
                <div style={{fontSize:9,color:C.muted,marginTop:3,textAlign:'center'}}>Week {activeWeek} of 52</div>
              </div>
            )}
          </div>

          {/* Workout content */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Workout header */}
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              <input value={workouts[activeWorkout].name}
                onChange={e=>setWorkouts(p=>p.map((w,i)=>i===activeWorkout?{...w,name:e.target.value}:w))}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.white,fontSize:14,fontWeight:700,outline:'none'}}/>
              {isCoach&&(
                <button onClick={()=>setShowExPicker(true)}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                  + Add Exercise
                </button>
              )}
            </div>

            {/* Training principles note */}
            {workouts[activeWorkout].exercises.length===0&&(
              <div style={{padding:16,flexShrink:0}}>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,marginBottom:6}}>LOE TRAINING PRINCIPLES</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
                    • Aim for 3, 4, or 5 sets of 10-12 reps. Train heavy with intensity.<br/>
                    • Each set should start with warm-ups leading to working sets.<br/>
                    • Last set should push to absolute failure at 10-12 reps.<br/>
                    • Increase weight progressively — if you hit 12 reps, go heavier next session.
                  </div>
                </div>
              </div>
            )}

            {/* Exercise list */}
            <div style={{flex:1,overflowY:'auto',padding:16}}>
              {workouts[activeWorkout].exercises.map((ex,ei)=>(
                <div key={ex.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
                  {/* Exercise header */}
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                    <div style={{flex:1,fontSize:14,fontWeight:700,color:C.white}}>{ex.name}</div>
                    {isCoach&&(
                      <button onClick={()=>removeExercise(ex.id)}
                        style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:18,padding:'0 4px'}}>×</button>
                    )}
                  </div>

                  {/* Coach: exercise settings */}
                  {isCoach&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
                      {[['sets','Sets','e.g. 4'],['reps','Reps','e.g. 10-12'],['rest','Rest','e.g. 90 sec']].map(([f,l,p])=>(
                        <div key={f}>
                          <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',marginBottom:3}}>{l}</div>
                          <input value={ex[f]} onChange={e=>updateExercise(ex.id,f,e.target.value)} placeholder={p}
                            style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Coach: cues and video */}
                  {isCoach&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                      <div>
                        <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',marginBottom:3}}>Exercise Cues</div>
                        <input value={ex.cues} onChange={e=>updateExercise(ex.id,'cues',e.target.value)} placeholder="e.g. Full ROM, squeeze at top"
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',marginBottom:3}}>Video Walkthrough URL</div>
                        <input value={ex.videoLink} onChange={e=>updateExercise(ex.id,'videoLink',e.target.value)} placeholder="https://youtube.com/..."
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    </div>
                  )}

                  {/* Client: view cues + video */}
                  {!isCoach&&(ex.cues||ex.videoLink)&&(
                    <div style={{marginBottom:10,padding:'8px 10px',background:C.surface,borderRadius:8}}>
                      {ex.cues&&<div style={{fontSize:11,color:C.muted,marginBottom:ex.videoLink?4:0}}>💡 {ex.cues}</div>}
                      {ex.videoLink&&(
                        <a href={ex.videoLink} target="_blank" rel="noreferrer"
                          style={{fontSize:11,color:C.gold,textDecoration:'none'}}>▶ Watch Walkthrough</a>
                      )}
                    </div>
                  )}

                  {/* Set info row */}
                  <div style={{fontSize:11,color:C.muted,marginBottom:isCoach?0:10}}>
                    {ex.sets} sets · {ex.reps} reps · Rest: {ex.rest}
                  </div>

                  {/* Client: log sets */}
                  {!isCoach&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>
                        Week {activeWeek} — Log Your Sets
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {Array(parseInt(ex.sets)||4).fill(0).map((_,si)=>{
                          const log = getLog(ex.id,si)
                          return (
                            <div key={si} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',minWidth:90}}>
                              <div style={{fontSize:9,color:C.muted,fontWeight:700,marginBottom:5}}>SET {si+1}</div>
                              <div style={{display:'flex',gap:5}}>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,marginBottom:2}}>LB</div>
                                  <input value={log.weight} onChange={e=>setLog(ex.id,si,'weight',e.target.value)}
                                    placeholder="0" type="number"
                                    style={{width:38,background:C.card,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 5px',color:C.gold,fontSize:12,fontWeight:700,outline:'none',textAlign:'center'}}/>
                                </div>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,marginBottom:2}}>REPS</div>
                                  <input value={log.reps} onChange={e=>setLog(ex.id,si,'reps',e.target.value)}
                                    placeholder="0" type="number"
                                    style={{width:38,background:C.card,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 5px',color:C.white,fontSize:12,fontWeight:700,outline:'none',textAlign:'center'}}/>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Workout notes */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Workout Notes</div>
                <textarea value={workouts[activeWorkout].notes}
                  onChange={e=>setWorkouts(p=>p.map((w,i)=>i===activeWorkout?{...w,notes:e.target.value}:w))}
                  placeholder={isCoach?"Notes or instructions for this workout…":"How did this workout feel? Any PRs or notes?"}
                  rows={3}
                  style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>

              {isCoach&&(
                <button onClick={saveWorkoutPlan}
                  style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
                  Save Workout Plan
                </button>
              )}

              {!isCoach&&(
                <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
                  Save Week {activeWeek} Log
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CARDIO TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='cardio'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="Cardio Protocol"/>
              {isCoach&&(
                <button onClick={addCardio}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  + Add Cardio
                </button>
              )}
            </div>

            {cardio.map((c,i)=>(
              <div key={i} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`}}>
                {isCoach?(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <Sel label="Type" value={c.type} onChange={v=>updateCardio(i,'type',v)} options={CARDIO_TYPES}/>
                    <Inp label="Duration" value={c.duration} onChange={v=>updateCardio(i,'duration',v)} placeholder="e.g. 45-60 min"/>
                    <Inp label="Frequency" value={c.frequency} onChange={v=>updateCardio(i,'frequency',v)} placeholder="e.g. Daily"/>
                    <div style={{display:'flex',alignItems:'flex-end',paddingBottom:10}}>
                      <button onClick={()=>removeCardio(i)}
                        style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'8px 12px',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer',width:'100%'}}>
                        Remove
                      </button>
                    </div>
                    <div style={{gridColumn:'1 / -1'}}>
                      <Inp label="Notes" value={c.notes} onChange={v=>updateCardio(i,'notes',v)} placeholder="e.g. Fasted morning walk preferred"/>
                    </div>
                  </div>
                ):(
                  <div style={{background:C.surface,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.white}}>{c.type}</div>
                      <div style={{display:'flex',gap:8}}>
                        <span style={{fontSize:11,background:`${C.gold}22`,color:C.gold,padding:'2px 8px',borderRadius:10,fontWeight:600}}>{c.duration}</span>
                        <span style={{fontSize:11,background:`${C.success}22`,color:C.success,padding:'2px 8px',borderRadius:10,fontWeight:600}}>{c.frequency}</span>
                      </div>
                    </div>
                    {c.notes&&<div style={{fontSize:12,color:C.muted}}>{c.notes}</div>}
                  </div>
                )}
              </div>
            ))}

            {cardio.length===0&&(
              <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'8px 0'}}>
                {isCoach?'Click + Add Cardio to assign cardio protocol':'No cardio assigned yet'}
              </div>
            )}
          </Card>

          {/* Cardio log for client */}
          {!isCoach&&(
            <Card sx={{marginBottom:20}}>
              <Lbl t="This Week's Cardio Log"/>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Log each cardio session you completed this week</div>
              {[1,2,3,4,5,6,7].map(day=>(
                <div key={day} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:`1px solid ${C.border}`}}>
                  <div style={{width:70,fontSize:11,color:C.muted,fontWeight:600}}>
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day-1]}
                  </div>
                  <input placeholder="Type + duration (e.g. Walk 45min)"
                    style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                  <input placeholder="Steps" type="number"
                    style={{width:80,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.gold,fontSize:12,outline:'none',textAlign:'center'}}/>
                </div>
              ))}
              <button style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginTop:12}}>
                Save Cardio Log
              </button>
            </Card>
          )}

          {isCoach&&(
            <button onClick={saveWorkoutPlan}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
              Save Cardio Protocol
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CALENDAR TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='calendar'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Calendar header */}
          <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.white}}>Book a Call</div>
              <div style={{fontSize:11,color:C.muted,marginTop:1}}>Schedule your next coaching session</div>
            </div>
            {isCoach&&(
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input value={calendarUrl} onChange={e=>setCalendarUrl(e.target.value)}
                  placeholder="Paste GHL or Calendly URL…"
                  style={{width:280,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',color:C.white,fontSize:11,outline:'none'}}/>
                <span style={{fontSize:10,color:C.muted,whiteSpace:'nowrap'}}>
                  {calendarUrl.includes('calendly')?'Calendly':'GHL'} detected
                </span>
              </div>
            )}
          </div>

          {/* Calendar embed */}
          <div style={{flex:1,overflow:'hidden',position:'relative'}}>
            {calendarUrl?(
              <iframe
                src={calendarUrl}
                style={{width:'100%',height:'100%',border:'none'}}
                title="Booking Calendar"
                allow="camera; microphone; autoplay; encrypted-media"
              />
            ):(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:12}}>
                <div style={{fontSize:40}}>📅</div>
                <div style={{fontSize:15,fontWeight:700,color:C.white}}>No calendar configured</div>
                <div style={{fontSize:12,color:C.muted}}>
                  {isCoach?'Paste your GHL or Calendly booking URL above':'Your coach has not set up booking yet'}
                </div>
              </div>
            )}
          </div>

          {/* Helpful links */}
          <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',gap:8,flexWrap:'wrap'}}>
            {[
              ['Male Blood Work Panel',  'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN'],
              ['Female Blood Work Panel','https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN'],
              ['DUTCH Test',            'https://www.practitionerdepot.com/products/dutch-test'],
              ['GI Map',               'https://www.practitionerdepot.com/products/gi-map'],
            ].map(([l,u])=>(
              <a key={l} href={u} target="_blank" rel="noreferrer"
                style={{fontSize:11,color:C.gold,textDecoration:'none',background:`${C.gold}15`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:'4px 10px'}}>
                {l} →
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Exercise picker modal ──────────────────────────── */}
      {showExPicker&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowExPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:8}}>Exercise Library</div>
              <input value={exSearch} onChange={e=>setExSearch(e.target.value)}
                placeholder="Search any exercise…"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:8}}
                autoFocus/>
              {!exSearch&&(
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {Object.keys(EXERCISE_LIBRARY).map(cat=>(
                    <button key={cat} onClick={()=>setExCategory(cat)}
                      style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${exCategory===cat?C.gold:C.border}`,background:exCategory===cat?`${C.gold}20`:C.card,color:exCategory===cat?C.gold:C.muted,fontSize:11,fontWeight:exCategory===cat?700:400,cursor:'pointer'}}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
              {exSearch&&<div style={{padding:'5px 16px 3px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Search Results</div>}
              {filteredExercises.map((ex,i)=>(
                <button key={i} onClick={()=>addExercise(ex.name)}
                  style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'9px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${C.border}`}}
                  onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <div>
                    <div style={{fontSize:13,color:C.white,fontWeight:500}}>{ex.name}</div>
                    {exSearch&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{ex.cat}</div>}
                  </div>
                  <span style={{color:C.gold,fontSize:18,flexShrink:0}}>+</span>
                </button>
              ))}
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowExPicker(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
