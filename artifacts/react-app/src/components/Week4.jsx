// ═══════════════════════════════════════════════════════════════
// Week4.jsx — Labs, Calendar, Workout Builder, Cardio
// Place at: src/components/Week4.jsx in Replit
//
// In App.jsx add:
// import Week4 from './components/Week4'
// {tab === 'workout' && <Week4 currentUser={currentUser} />}
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer } from '../lib/sbAuth'

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
  get Authorization(){ return sbBearer() },
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

import { CARDIO_TYPES } from './libraryDefaults'

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

// ── Demo / seed data shown before real DB data is saved ─────────
const DEMO_WORKOUTS = [
  {
    name:'Push Day A', notes:'Focus on mind-muscle connection. Rest 90 sec between working sets.',
    exercises:[
      {id:'dpa_bench',    name:'Flat BB Bench Press',            sets:4, reps:'10-12', rest:'90 sec', cues:'Retract scapula, arch naturally, drive chest through the bar', videoLink:''},
      {id:'dpa_incline',  name:'Incline DB Bench Press',         sets:4, reps:'10-12', rest:'90 sec', cues:'30° incline, squeeze at top, full stretch at bottom',           videoLink:''},
      {id:'dpa_shoulder', name:'Seated DB Shoulder Press',       sets:4, reps:'10-12', rest:'90 sec', cues:'Stop at 90° on the way down, explosive press up',               videoLink:''},
      {id:'dpa_lateral',  name:'Single Arm Cable Lateral Raise', sets:3, reps:'12',    rest:'60 sec', cues:'Lead with elbow, slight forward lean, squeeze at top',          videoLink:''},
      {id:'dpa_tri',      name:'Rope Tricep Pushdown',           sets:4, reps:'12',    rest:'60 sec', cues:'Spread rope at bottom, lock elbows at sides, squeeze triceps',  videoLink:''},
    ],
  },
  {
    name:'Pull Day A', notes:'Initiate every pull with the lats, not the arms.',
    exercises:[
      {id:'pla_pulldown', name:'Wide Grip Lat Pulldown',         sets:4, reps:'10-12', rest:'90 sec', cues:'Pull to upper chest, full stretch at top, lead with elbows', videoLink:''},
      {id:'pla_cable',    name:'Seated Cable Row',               sets:4, reps:'10-12', rest:'90 sec', cues:'Squeeze shoulder blades together at the end of each rep',    videoLink:''},
      {id:'pla_row',      name:'BB Bent Over Row',               sets:4, reps:'10-12', rest:'90 sec', cues:'Hinge at hip 45°, pull to lower chest, full ROM each rep',   videoLink:''},
      {id:'pla_hammer',   name:'DB Hammer Curl',                 sets:3, reps:'12',    rest:'60 sec', cues:'Neutral grip, controlled negative, no swinging',              videoLink:''},
      {id:'pla_preacher', name:'EZ Bar Preacher Curl',           sets:3, reps:'12',    rest:'60 sec', cues:'Full stretch at bottom, squeeze at top, slow negative',       videoLink:''},
    ],
  },
  {
    name:'Leg Day A', notes:'Warm up knees thoroughly. Depth is non-negotiable.',
    exercises:[
      {id:'lda_squat',  name:'BB Back Squat',          sets:5, reps:'10-12', rest:'2 min',  cues:'Hip crease below knee, knees track over toes, chest up',    videoLink:''},
      {id:'lda_press',  name:'Leg Press',              sets:4, reps:'10-12', rest:'90 sec', cues:"Full ROM, don't lock knees at top, controlled descent",      videoLink:''},
      {id:'lda_split',  name:'DB Split Squat',         sets:3, reps:'12',    rest:'90 sec', cues:'Back knee touches lightly, keep torso upright',              videoLink:''},
      {id:'lda_ext',    name:'Seated Leg Extension',   sets:4, reps:'12',    rest:'60 sec', cues:'Squeeze quad at top, 2-second negative',                    videoLink:''},
      {id:'lda_thrust', name:'BB Hip Thrust',          sets:4, reps:'10-12', rest:'90 sec', cues:'Drive hips through full extension, pause at top',            videoLink:''},
    ],
  },
  {
    name:'Push Day B', notes:'Shoulder-dominant day. Volume is key.',
    exercises:[
      {id:'pdb_press',   name:'Seated DB Shoulder Press', sets:4, reps:'10-12', rest:'90 sec', cues:'Full ROM, no partial reps, control the descent',        videoLink:''},
      {id:'pdb_lateral', name:'Standing DB Lateral Raise', sets:4, reps:'12',   rest:'60 sec', cues:'Slight bend at elbow, lead with pinky, pause at top',   videoLink:''},
      {id:'pdb_incline', name:'Incline BB Bench Press',    sets:4, reps:'10-12', rest:'90 sec', cues:'45° incline, bar to upper chest, explosive press',      videoLink:''},
      {id:'pdb_skull',   name:'EZ Bar Skullcrusher',       sets:4, reps:'10-12', rest:'60 sec', cues:'Keep elbows tucked, lower to forehead, full extension', videoLink:''},
    ],
  },
  {
    name:'Pull Day B', notes:'Focus on width and thickness. Control every negative.',
    exercises:[
      {id:'plb_narrow',  name:'Narrow Grip Lat Pulldown',      sets:4, reps:'10-12', rest:'90 sec', cues:'Drive elbows to hips, lean back slightly, full stretch', videoLink:''},
      {id:'plb_tbar',    name:'T-Bar Row',                     sets:4, reps:'10-12', rest:'90 sec', cues:'Chest on pad, elbows wide, row to lower chest',          videoLink:''},
      {id:'plb_single',  name:'Single Arm Bent Over DB Row',   sets:4, reps:'10-12', rest:'90 sec', cues:'Brace on bench, full stretch, pull to hip',              videoLink:''},
      {id:'plb_cable',   name:'Cable Bicep Curl',              sets:3, reps:'12',    rest:'60 sec', cues:'Elbows stationary, squeeze peak, controlled negative',    videoLink:''},
      {id:'plb_incurl',  name:'Incline DB Bicep Curl',         sets:3, reps:'12',    rest:'60 sec', cues:'Full stretch at bottom, supinate at top',                 videoLink:''},
    ],
  },
  {
    name:'Leg Day B', notes:'Hamstring & posterior chain focus. Never skip calf work.',
    exercises:[
      {id:'ldb_hack', name:'Hack Squat',                sets:4, reps:'10-12', rest:'90 sec', cues:'High foot placement for glutes, full depth',              videoLink:''},
      {id:'ldb_sldl', name:'Stiff Leg Deadlift',        sets:4, reps:'10-12', rest:'90 sec', cues:'Feel the hamstring stretch, hinge not squat, flat back',  videoLink:''},
      {id:'ldb_curl', name:'Lying Machine Leg Curl',    sets:4, reps:'12',    rest:'60 sec', cues:'Full ROM, squeeze glutes, slow 3-count negative',         videoLink:''},
      {id:'ldb_calf', name:'Seated Machine Calf Raise', sets:4, reps:'15',    rest:'60 sec', cues:'Full stretch at bottom, pause at top, slow movement',     videoLink:''},
    ],
  },
]

// Day ordering helpers
const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function orderedDays(startDay) {
  const i = ALL_DAYS.indexOf(startDay)
  if (i < 0) return ALL_DAYS
  return [...ALL_DAYS.slice(i), ...ALL_DAYS.slice(0, i)]
}

// 6 weeks of progressive demo logs (keys: `${week}_${exId}_${setIdx}` and cardio)
function makeLogs(w, bench, inc, sho, lat, tri, cardio) {
  const k = (id,i) => `${w}_${id}_${i}`
  return {
    // Push Day A — Bench
    [k('dpa_bench',0)]:{weight:bench[0],reps:'12'}, [k('dpa_bench',1)]:{weight:bench[1],reps:'12'},
    [k('dpa_bench',2)]:{weight:bench[2],reps:'11'}, [k('dpa_bench',3)]:{weight:bench[3],reps:bench[3]>=200?'10':'11'},
    // Incline DB
    [k('dpa_incline',0)]:{weight:inc[0],reps:'12'}, [k('dpa_incline',1)]:{weight:inc[1],reps:'12'},
    [k('dpa_incline',2)]:{weight:inc[2],reps:'11'}, [k('dpa_incline',3)]:{weight:inc[3],reps:'9'},
    // Shoulder Press
    [k('dpa_shoulder',0)]:{weight:sho[0],reps:'12'}, [k('dpa_shoulder',1)]:{weight:sho[1],reps:'12'},
    [k('dpa_shoulder',2)]:{weight:sho[2],reps:'11'}, [k('dpa_shoulder',3)]:{weight:sho[3],reps:'9'},
    // Lateral Raise (3 sets)
    [k('dpa_lateral',0)]:{weight:lat[0],reps:'12'}, [k('dpa_lateral',1)]:{weight:lat[1],reps:'12'},
    [k('dpa_lateral',2)]:{weight:lat[2],reps:'10'},
    // Tricep Pushdown
    [k('dpa_tri',0)]:{weight:tri[0],reps:'12'}, [k('dpa_tri',1)]:{weight:tri[1],reps:'12'},
    [k('dpa_tri',2)]:{weight:tri[2],reps:'11'}, [k('dpa_tri',3)]:{weight:tri[3],reps:'10'},
    // Pull Day A — Pulldown
    [k('pla_pulldown',0)]:{weight:String(+bench[0]-15),reps:'12'}, [k('pla_pulldown',1)]:{weight:String(+bench[1]-15),reps:'12'},
    [k('pla_pulldown',2)]:{weight:String(+bench[2]-15),reps:'10'}, [k('pla_pulldown',3)]:{weight:String(+bench[3]-15),reps:'9'},
    // Pull Day A — Cable Row
    [k('pla_cable',0)]:{weight:String(+bench[0]-20),reps:'12'}, [k('pla_cable',1)]:{weight:String(+bench[1]-20),reps:'12'},
    [k('pla_cable',2)]:{weight:String(+bench[2]-20),reps:'11'}, [k('pla_cable',3)]:{weight:String(+bench[3]-20),reps:'10'},
    // Pull Day A — Bent Over Row
    [k('pla_row',0)]:{weight:String(+bench[0]+10),reps:'12'}, [k('pla_row',1)]:{weight:String(+bench[1]+10),reps:'12'},
    [k('pla_row',2)]:{weight:String(+bench[2]+10),reps:'10'}, [k('pla_row',3)]:{weight:String(+bench[3]+10),reps:'9'},
    // Pull Day A — Hammer Curl
    [k('pla_hammer',0)]:{weight:'35',reps:'12'}, [k('pla_hammer',1)]:{weight:'40',reps:'12'},
    [k('pla_hammer',2)]:{weight:'45',reps:'10'},
    // Pull Day A — Preacher Curl
    [k('pla_preacher',0)]:{weight:tri[0],reps:'12'}, [k('pla_preacher',1)]:{weight:tri[1],reps:'12'},
    [k('pla_preacher',2)]:{weight:tri[2],reps:'10'},
    // Leg Day A — Squat
    [k('lda_squat',0)]:{weight:'135',reps:'12'}, [k('lda_squat',1)]:{weight:String(+bench[1]+10),reps:'12'},
    [k('lda_squat',2)]:{weight:String(+bench[2]+10),reps:'11'}, [k('lda_squat',3)]:{weight:String(+bench[3]+20),reps:'10'},
    [k('lda_squat',4)]:{weight:String(+bench[3]+30),reps:'9'},
    // Leg Press
    [k('lda_press',0)]:{weight:'270',reps:'12'}, [k('lda_press',1)]:{weight:String(270+w*10),reps:'12'},
    [k('lda_press',2)]:{weight:String(310+w*10),reps:'11'}, [k('lda_press',3)]:{weight:String(330+w*10),reps:'10'},
    // Split Squat
    [k('lda_split',0)]:{weight:inc[0],reps:'12'}, [k('lda_split',1)]:{weight:inc[1],reps:'12'},
    [k('lda_split',2)]:{weight:inc[2],reps:'10'},
    // Leg Ext
    [k('lda_ext',0)]:{weight:'90',reps:'12'}, [k('lda_ext',1)]:{weight:String(90+w*5),reps:'12'},
    [k('lda_ext',2)]:{weight:String(100+w*5),reps:'11'}, [k('lda_ext',3)]:{weight:String(110+w*5),reps:'10'},
    // Hip Thrust
    [k('lda_thrust',0)]:{weight:String(+bench[1]+30),reps:'12'}, [k('lda_thrust',1)]:{weight:String(+bench[2]+30),reps:'12'},
    [k('lda_thrust',2)]:{weight:String(+bench[3]+30),reps:'11'}, [k('lda_thrust',3)]:{weight:String(+bench[3]+40),reps:'10'},
    // Cardio
    [`${w}_cardio_Mon_activity`]:cardio.mon, [`${w}_cardio_Mon_steps`]:cardio.monS,
    [`${w}_cardio_Tue_activity`]:cardio.tue, [`${w}_cardio_Tue_steps`]:cardio.tueS,
    [`${w}_cardio_Wed_activity`]:cardio.wed, [`${w}_cardio_Wed_steps`]:cardio.wedS,
    [`${w}_cardio_Thu_activity`]:cardio.thu, [`${w}_cardio_Thu_steps`]:cardio.thuS,
    [`${w}_cardio_Fri_activity`]:cardio.fri, [`${w}_cardio_Fri_steps`]:cardio.friS,
    ...(cardio.sat ? {[`${w}_cardio_Sat_activity`]:cardio.sat,[`${w}_cardio_Sat_steps`]:cardio.satS} : {}),
  }
}

const DEMO_WEEK_LOGS = {
  1: makeLogs(1,
    ['135','155','175','185'], ['50','55','60','65'],
    ['35','40','45','45'],     ['10','12','15'],
    ['50','55','60','65'],
    {mon:'Brisk Walk 45min',monS:'8500', tue:'Treadmill 30min',tueS:'6200',
     wed:'Brisk Walk 45min',wedS:'9100', thu:'HIIT 20min',thuS:'4500',
     fri:'Brisk Walk 45min',friS:'8800'}),
  2: makeLogs(2,
    ['135','160','180','190'], ['50','55','65','65'],
    ['35','40','45','50'],     ['12','12','15'],
    ['55','60','60','70'],
    {mon:'Brisk Walk 50min',monS:'9200', tue:'Treadmill 35min',tueS:'6800',
     wed:'Brisk Walk 45min',wedS:'9400', thu:'HIIT 25min',thuS:'5100',
     fri:'Brisk Walk 50min',friS:'9000'}),
  3: makeLogs(3,
    ['145','165','185','190'], ['55','60','65','70'],
    ['40','40','50','50'],     ['12','15','15'],
    ['55','60','65','70'],
    {mon:'Brisk Walk 50min',monS:'9500', tue:'Treadmill 35min',tueS:'7000',
     wed:'Brisk Walk 50min',wedS:'9800', thu:'HIIT 25min',thuS:'5300',
     fri:'Brisk Walk 50min',friS:'9200',
     sat:'Light Walk 30min', satS:'4200'}),
  4: makeLogs(4,
    ['145','165','185','195'], ['55','60','65','70'],
    ['40','45','50','50'],     ['12','15','15'],
    ['60','65','65','70'],
    {mon:'Brisk Walk 55min',monS:'10100', tue:'Treadmill 40min',tueS:'7400',
     wed:'Brisk Walk 55min',wedS:'10400', thu:'HIIT 30min',thuS:'5800',
     fri:'Brisk Walk 55min',friS:'10000',
     sat:'Light Walk 30min', satS:'4500'}),
  5: makeLogs(5,
    ['155','170','190','200'], ['55','60','70','70'],
    ['40','45','50','55'],     ['12','15','15'],
    ['60','65','70','75'],
    {mon:'Brisk Walk 60min',monS:'10800', tue:'Treadmill 40min',tueS:'7800',
     wed:'Brisk Walk 60min',wedS:'11200', thu:'HIIT 30min',thuS:'6200',
     fri:'Brisk Walk 60min',friS:'10600',
     sat:'Light Walk 35min', satS:'5000'}),
  6: makeLogs(6,
    ['155','175','195','205'], ['60','65','70','75'],
    ['45','45','50','55'],     ['15','15','20'],
    ['60','65','70','75'],
    {mon:'Brisk Walk 60min',monS:'11500', tue:'Treadmill 45min',tueS:'8200',
     wed:'Brisk Walk 60min',wedS:'11800', thu:'HIIT 35min',thuS:'6600',
     fri:'Brisk Walk 60min',friS:'11200',
     sat:'Light Walk 40min', satS:'5500'}),
}

// Sidebar week history — shown when DB table does not yet exist
const DEMO_WEEK_HISTORY = [
  {week:6, saved_at:'2025-02-10T09:00:00Z'},
  {week:5, saved_at:'2025-02-03T09:00:00Z'},
  {week:4, saved_at:'2025-01-27T09:00:00Z'},
  {week:3, saved_at:'2025-01-20T09:00:00Z'},
  {week:2, saved_at:'2025-01-13T09:00:00Z'},
  {week:1, saved_at:'2025-01-06T09:00:00Z'},
]

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function Week4({currentUser, initialTab='labs', onBack}) {
  const isMobile = useIsMobile()
  const [adminLabDocs, setAdminLabDocs] = useState([])
  useEffect(()=>{
    const em = currentUser?.email||''
    if (!em) return
    dbGet('user_profiles',`email=eq.${encodeURIComponent(em)}&select=id`)
      .then(rows=>{ const uuid=rows?.[0]?.id; if (!uuid) return null; return dbGet('client_documents',`client_id=eq.${uuid}&doc_type=eq.lab&order=created_at.desc`) })
      .then(rows=>{ if (rows) setAdminLabDocs(Array.isArray(rows)?rows:[]) })
      .catch(()=>{})
  },[currentUser?.email])
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'client',name:'User',uuid:null}
  // Prefer the role passed in currentUser (App.tsx sets role:user.role on toolUser so a coach
  // viewing a client still sees coach controls), fall back to KNOWN_USERS lookup.
  const role    = currentUser?.role || info.role
  const myUUID  = info.uuid
  const isCoach  = role==='coach'||role==='super_admin'
  const isClient = role==='client'
  const isAdmin  = role==='super_admin'

  // Real identity: demo accounts keep the demo client/coach; real users resolve
  // their own profile (and assigned coach) from the DB so labs/workouts save to
  // the right person instead of the demo account.
  const [dbProfile, setDbProfile] = useState(null)
  useEffect(()=>{
    if (!email || KNOWN_USERS[email]) { setDbProfile(null); return }
    dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=id,coach_id`)
      .then(rows=>setDbProfile(rows?.[0]||null))
      .catch(()=>setDbProfile(null))
  },[email])
  const CLIENT_UUID = KNOWN_USERS[email] ? KNOWN_USERS['client@eden.io'].uuid : (dbProfile?.id || null)
  const COACH_UUID  = KNOWN_USERS[email] ? KNOWN_USERS['coach@eden.io'].uuid  : (dbProfile?.coach_id || null)

  // ── Main tab ──────────────────────────────────────────────
  const [tab, setTab] = useState(initialTab)

  // ── Labs state ────────────────────────────────────────────
  const [labs,        setLabs]        = useState([])
  const [labComments, setLabComments] = useState({})
  const [activeLab,   setActiveLab]   = useState(null)
  const [newComment,  setNewComment]  = useState('')
  const [labFilter,   setLabFilter]   = useState('All')
  const [uploading,   setUploading]   = useState(false)
  const [newLabNote,    setNewLabNote]    = useState('')
  const [newLabType,    setNewLabType]    = useState('Blood Work')
  const [newLabLoomUrl, setNewLabLoomUrl] = useState('')
  const labFileRef = useRef(null)

  // ── Workout state ─────────────────────────────────────────
  const DEFAULT_PRINCIPLES = `I firmly believe in high-intensity training. Here's how we do it:

Training Principles:

1. Aim for 3, 4, or 5 sets of 10 to 12 reps for each exercise. Train heavy and with intensity.
2. The goal is to stimulate your muscles sufficiently to maximize nutrient absorption from your diet.
3. Each set should start with warm-ups leading to the working sets. The last set should push you to absolute failure at 10 to 12 reps.
4. Increase weight progressively so that if you achieve 12 reps on your last set, increase the weight next session to maintain the challenge.`

  const [workouts,           setWorkouts]           = useState(DEMO_WORKOUTS)
  const [trainingPrinciples, setTrainingPrinciples] = useState(DEFAULT_PRINCIPLES)
  const [activeWorkout,      setActiveWorkout]      = useState(0)
  const [showExPicker,       setShowExPicker]        = useState(false)
  const [exSearch,           setExSearch]            = useState('')
  const [exCategory,         setExCategory]          = useState('Push')
  const [activeWeek,         setActiveWeek]          = useState(1)
  const [workoutLogs,        setWorkoutLogs]         = useState(DEMO_WEEK_LOGS[6]||{})
  const [logSaving,          setLogSaving]           = useState(false)
  const [principlesEditing,  setPrinciplesEditing]   = useState(false)
  // weekHistory: [{week, saved_at}] sorted most-recent first
  const [weekHistory,        setWeekHistory]         = useState([])

  // ── Cardio state ──────────────────────────────────────────
  const [cardio, setCardio] = useState([
    {type:'Brisk Walk', duration:'45-60 min', frequency:'Daily', notes:'Fasted morning walk preferred'},
  ])
  // Coach-configurable day the tracking week starts on (default Wed)
  const [cardioWeekStart, setCardioWeekStart] = useState('Wed')
  // Per-client daily step goal set by the coach (stored in the workouts JSON blob)
  const [stepGoal, setStepGoal] = useState('')
  // Company-wide cardio types managed by admin only
  const [companyCardioTypes, setCompanyCardioTypes] = useState([])
  const [hiddenCardio,       setHiddenCardio]       = useState(new Set()) // built-ins hidden by the org's admin
  const [newCardioType,      setNewCardioType]      = useState('')

  // ── Calendar state ────────────────────────────────────────
  const [calendarUrl, setCalendarUrl] = useState(DEFAULT_CALENDAR_URL)

  // Which organization this user belongs to — scopes the cardio-type library per org
  const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'
  const [myCompanyId, setMyCompanyId] = useState(null)
  useEffect(()=>{ (async()=>{
    if (!email) { setMyCompanyId(EDEN_ORG_ID); return }
    try {
      const rows = await dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=company_id`)
      setMyCompanyId(rows?.[0]?.company_id || EDEN_ORG_ID)
    } catch { setMyCompanyId(EDEN_ORG_ID) }
  })() },[email])

  // ── Company cardio types (each org's admin manages their own library) ──
  async function loadCompanyCardioTypes(cid) {
    const [data, hid] = await Promise.all([
      dbGet('company_cardio_types',`company_id=eq.${cid}&order=created_at.asc`),
      dbGet('company_hidden_items',`company_id=eq.${cid}&kind=eq.cardio&select=name`).catch(()=>[]),
    ])
    setCompanyCardioTypes((data||[]).map(r=>r.name))
    setHiddenCardio(new Set((Array.isArray(hid)?hid:[]).map(r=>r.name)))
  }
  async function addCompanyCardioType() {
    if (!newCardioType.trim()||!myCompanyId) return
    await fetch(`${SUPABASE_URL}/rest/v1/company_cardio_types`,{
      method:'POST',
      headers:{...H,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({name:newCardioType.trim(), created_by:myUUID, company_id:myCompanyId}),
    })
    setCompanyCardioTypes(p=>[...p, newCardioType.trim()])
    setNewCardioType('')
  }
  // Eden admin: push a cardio type to every white-label org's library (skipping name duplicates)
  async function pushCardioTypeToAllOrgs(name) {
    if (!window.confirm(`Push "${name}" to every white-label org's cardio type library?\nOrgs that already have a type with this name are skipped.`)) return
    const orgs = await dbGet('organizations','is_white_label=eq.true&select=id,name')
    if (!Array.isArray(orgs)||!orgs.length) { alert('No white-label orgs found.'); return }
    const existing = await dbGet('company_cardio_types',`name=eq.${encodeURIComponent(name)}&select=company_id`)
    const have = new Set((existing||[]).map(r=>r.company_id))
    const targets = orgs.filter(o=>!have.has(o.id))
    if (!targets.length) { alert(`All ${orgs.length} white-label orgs already have "${name}".`); return }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_cardio_types`,{
      method:'POST',
      headers:{...H,'Prefer':'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(targets.map(o=>({name, created_by:myUUID, company_id:o.id}))),
    })
    if (res.ok) alert(`"${name}" pushed to ${targets.length} of ${orgs.length} white-label orgs${orgs.length-targets.length?` (${orgs.length-targets.length} already had it)`:''}.`)
    else { console.error('PUSH CARDIO TYPE', await res.text()); alert('Push failed — please try again.') }
  }
  async function removeCompanyCardioType(name) {
    if (!myCompanyId) return
    if (!window.confirm(`Remove "${name}" from your company's cardio types?`)) return
    // Scope by org so one org's removal never touches another org's identically-named type
    await fetch(`${SUPABASE_URL}/rest/v1/company_cardio_types?name=eq.${encodeURIComponent(name)}&company_id=eq.${myCompanyId}`,{method:'DELETE',headers:H})
    setCompanyCardioTypes(p=>p.filter(t=>t!==name))
  }
  async function renameCompanyCardioType(oldName) {
    if (!myCompanyId) return
    const newName = window.prompt(`Rename cardio type "${oldName}" to:`, oldName)
    if (!newName || !newName.trim() || newName.trim()===oldName) return
    const r = await fetch(`${SUPABASE_URL}/rest/v1/company_cardio_types?name=eq.${encodeURIComponent(oldName)}&company_id=eq.${myCompanyId}`,{
      method:'PATCH', headers:H, body:JSON.stringify({name:newName.trim()})
    })
    if (!r.ok) { alert('Could not rename — an identically-named type may already exist.'); return }
    setCompanyCardioTypes(p=>p.map(t=>t===oldName?newName.trim():t))
  }

  // ── Load on mount ─────────────────────────────────────────
  useEffect(()=>{ if (CLIENT_UUID) { loadLabs(); loadWorkoutPlan(); loadWeekHistory() } },[CLIENT_UUID])
  useEffect(()=>{ if (myCompanyId) loadCompanyCardioTypes(myCompanyId) },[myCompanyId])

  // Reload logs whenever week changes
  useEffect(()=>{ if (CLIENT_UUID) loadWorkoutLog(activeWeek) },[activeWeek, CLIENT_UUID])

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
    if (!CLIENT_UUID) { alert('Still loading this client\'s profile — try again in a second.'); return }
    setUploading(true)
    try {
      const path   = `labs/${CLIENT_UUID}/${Date.now()}-${file.name}`
      const upRes  = await fetch(`${SUPABASE_URL}/storage/v1/object/lab-files/${path}`, {
        method:'POST',
        headers:{'apikey':SUPABASE_ANON,get Authorization(){ return sbBearer() },'Content-Type':file.type},
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
        loom_url:     newLabLoomUrl||null,
      })
      if (inserted) {
        const arr = Array.isArray(inserted)?inserted:[inserted]
        setLabs(p=>[arr[0],...p])
        setNewLabNote('')
        setNewLabLoomUrl('')
      }
    } catch(err) {
      console.error('Lab upload error',err)
      // Still save the record even if storage fails
      await dbInsert('lab_results',{
        client_id:CLIENT_UUID, coach_id:COACH_UUID,
        uploaded_by:myUUID, uploader_name:info.name,
        lab_type:newLabType, notes:newLabNote,
        file_name:file.name, file_size:file.size,
        loom_url:newLabLoomUrl||null,
      })
      loadLabs()
      setNewLabNote('')
      setNewLabLoomUrl('')
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

  // ── Load workout plan from DB ─────────────────────────────
  async function loadWorkoutPlan() {
    const data = await dbGet('workout_plans',
      `client_id=eq.${CLIENT_UUID}&order=created_at.desc&limit=1`
    )
    if (data?.[0]) {
      try {
        const raw = JSON.parse(data[0].workouts)
        // Support both old (array) and new ({exercises,principles,cardioWeekStart}) format
        if (Array.isArray(raw)) {
          setWorkouts(raw)
        } else {
          if (raw.exercises) setWorkouts(raw.exercises)
          if (raw.principles) setTrainingPrinciples(raw.principles)
          if (raw.cardioWeekStart) setCardioWeekStart(raw.cardioWeekStart)
          if (raw.stepGoal!==undefined&&raw.stepGoal!==null) setStepGoal(String(raw.stepGoal))
        }
      } catch(e) {}
      try {
        if (data[0].cardio) setCardio(JSON.parse(data[0].cardio))
      } catch(e) {}
    }
  }

  // ── Load saved week history (for dated sidebar) ───────────
  async function loadWeekHistory() {
    try {
      const data = await dbGet('client_workout_logs',
        `client_id=eq.${CLIENT_UUID}&order=week.desc&select=week,saved_at`
      )
      // Always show all 6 demo weeks; swap in real DB dates where they exist
      const dbMap = new Map((data||[]).map(r=>[r.week, r.saved_at]))
      const merged = DEMO_WEEK_HISTORY.map(({week,saved_at})=>({
        week, saved_at: dbMap.has(week) ? dbMap.get(week) : saved_at
      }))
      // Append any DB weeks beyond the demo range (week > 6)
      for (const r of (data||[])) {
        if (!merged.find(m=>m.week===r.week)) merged.push(r)
      }
      merged.sort((a,b)=>b.week-a.week)
      setWeekHistory(merged)
      setActiveWeek(merged[0].week)
    } catch(e) {
      // table may not exist yet — fall back to demo history
      setWeekHistory(DEMO_WEEK_HISTORY)
      setActiveWeek(6)
    }
  }

  // ── Load workout logs for a given week ────────────────────
  async function loadWorkoutLog(week) {
    const demo = DEMO_WEEK_LOGS[week] || {}
    try {
      const data = await dbGet('client_workout_logs',
        `client_id=eq.${CLIENT_UUID}&week=eq.${week}&limit=1`
      )
      const saved = data?.[0]?.logs
      if (saved && Object.keys(saved).length > 0) {
        // If saved log has no cardio keys, supplement with demo cardio so the
        // Cardio tab always shows data for all 6 weeks
        const hasCardio = Object.keys(saved).some(k=>k.includes('_cardio_'))
        setWorkoutLogs(hasCardio ? saved : {...demo, ...saved})
      } else {
        setWorkoutLogs(demo)
      }
    } catch(e) {
      setWorkoutLogs(demo)
    }
  }

  // ── Save workout log to DB (upsert by client+week) ────────
  async function saveWorkoutLog() {
    if (!CLIENT_UUID) { alert('Still loading this client\'s profile — try again in a second.'); return }
    setLogSaving(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/client_workout_logs`, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON,
          get Authorization(){ return sbBearer() },
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          client_id: CLIENT_UUID,
          week:      activeWeek,
          logs:      workoutLogs,
          saved_at:  new Date().toISOString(),
        }),
      })
      if (res.ok) {
        loadWeekHistory()  // refresh dated sidebar
        alert(`✅ Week ${activeWeek} log saved!`)
      } else {
        const err = await res.text()
        if (err.includes('does not exist')) {
          alert(`Week ${activeWeek} log saved locally.\n\n⚠️ To enable cross-device sync, ask your admin to run the client_workout_logs SQL.`)
        } else {
          alert(`Week ${activeWeek} log saved locally.`)
        }
      }
    } catch(e) {
      alert(`Week ${activeWeek} log saved locally.`)
    } finally {
      setLogSaving(false)
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
    if (!CLIENT_UUID) { alert('Still loading this client\'s profile — try again in a second.'); return }
    // Embed principles + cardioWeekStart inside the workouts JSON blob so no schema change is needed
    const payload = { exercises: workouts, principles: trainingPrinciples, cardioWeekStart, stepGoal: stepGoal.trim() }
    await fetch(`${SUPABASE_URL}/rest/v1/workout_plans`, {
      method: 'POST',
      headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        client_id: CLIENT_UUID,
        coach_id:  COACH_UUID,
        workouts:  JSON.stringify(payload),
        cardio:    JSON.stringify(cardio),
        updated_at: new Date().toISOString(),
      }),
    })
    alert('Workout plan saved!')
  }

  // ── Cardio ────────────────────────────────────────────────
  function addCardio() {
    // Default to the first cardio type still visible for this org (built-ins minus hidden, then company types)
    const visible = [...CARDIO_TYPES.filter(t=>!hiddenCardio.has(t)),...companyCardioTypes]
    setCardio(p=>[...p,{type:visible[0]||'Brisk Walk',duration:'30 min',frequency:'3x/week',notes:''}])
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

  const TABS = initialTab === 'labs'
    ? [['labs',    '🧪 Labs']]
    : [['workout', '💪 Workout'], ['cardio', '🏃 Cardio']]

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden'}}>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {/* ── top row: title ────────────────────────────────── */}
        <div style={{padding:'8px 16px 4px'}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>
            {isCoach?'Client Tools — Jordan Williams':'My Tools'}
          </div>
          {onBack&&(
            <button onClick={onBack} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:3,marginTop:2}}>
              <span style={{fontSize:11,color:C.gold}}>← Back</span>
            </button>
          )}
        </div>
        {/* ── scrollable tab row ────────────────────────────── */}
        <div style={{display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none',touchAction:'pan-x',padding:'0 8px'}}>
          {TABS.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{
                flexShrink:0, padding:'8px 14px', border:'none',
                borderBottom:`3px solid ${tab===k?C.gold:'transparent'}`,
                color:tab===k?C.white:C.muted,
                fontSize:12, fontWeight:tab===k?700:500,
                cursor:'pointer', whiteSpace:'nowrap',
                background:tab===k?`${C.gold}18`:'none',
                transition:'all 0.15s',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LABS TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='labs'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Lab list */}
          <div style={{
            width: isMobile ? '100%' : (activeLab ? 280 : undefined),
            flex: isMobile ? (activeLab ? 0 : 1) : (activeLab ? undefined : 1),
            display: isMobile && activeLab ? 'none' : 'flex',
            borderRight: activeLab && !isMobile ? `1px solid ${C.border}` : undefined,
            flexDirection:'column',
            overflow:'hidden'
          }}>

            {/* Upload area */}
            <div style={{padding:14,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <Sel label="Lab Type" value={newLabType} onChange={setNewLabType} options={LAB_TYPES}/>
              <Inp label="Notes (optional)" value={newLabNote} onChange={setNewLabNote} placeholder="e.g. Fasted 12hr before draw"/>
              <Inp label="Loom Recording URL (optional)" value={newLabLoomUrl} onChange={setNewLabLoomUrl} placeholder="https://www.loom.com/share/…"/>
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
              {filteredLabs.length===0&&adminLabDocs.length===0&&(
                <div style={{padding:24,textAlign:'center',color:C.muted,fontSize:13}}>
                  No lab results yet. Upload your first one above.
                </div>
              )}
              {adminLabDocs.length>0&&(
                <div style={{borderBottom:`1px solid ${C.border}`}}>
                  <div style={{padding:'8px 14px 4px',fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase'}}>📎 From Admin</div>
                  {adminLabDocs.map(doc=>(
                    <div key={doc.id} style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,background:C.surface}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.white}}>🧪 {doc.title}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}</div>
                      {doc.content&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.5}}>{doc.content}</div>}
                      {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:4,display:'block',fontWeight:700}}>View File →</a>}
                    </div>
                  ))}
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
          {/* Lab details */}
          {activeLab&&(
            <div style={{
              flex: 1,
              display: isMobile && !activeLab ? 'none' : 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              width: isMobile ? '100%' : undefined
            }}>
              {/* Header */}
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setActiveLab(null)}
                  style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:0,lineHeight:1, display: isMobile ? 'block' : 'block'}}>←</button>
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

              {/* Loom recording embed */}
              {activeLab.loom_url&&(()=>{
                const embed = activeLab.loom_url.replace('loom.com/share/','loom.com/embed/')
                return embed ? (
                  <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:8}}>🎥 COACH LAB REVIEW</div>
                    <div style={{position:'relative',paddingBottom:'56.25%',overflow:'hidden',borderRadius:10,border:`1px solid ${C.border}`}}>
                      <iframe src={embed} allowFullScreen title="Coach lab review"
                        style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                    </div>
                  </div>
                ) : null
              })()}

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
        <div style={{flex:1,display:'flex',flexDirection: isMobile ? 'column' : 'row',overflow: isMobile ? 'auto' : 'hidden'}}>

          {/* Workout selector sidebar */}
          <div style={{width: isMobile ? '100%' : 160, maxHeight: isMobile ? 200 : 'none', background:C.surface, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', display:'flex', flexDirection: 'column', flexShrink:0}}>
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

            {/* Week selector — dated list, most recent first */}
            {(()=>{
              // Build display list: DB history + current week if not already included
              const histNums = new Set(weekHistory.map(w=>w.week))
              const list = [...weekHistory]
              if (!histNums.has(activeWeek)) list.push({week:activeWeek,saved_at:null})
              if (list.length===0) list.push({week:1,saved_at:null})
              list.sort((a,b)=>b.week-a.week)
              return (
                <div style={{borderTop:`1px solid ${C.border}`,flexShrink:0,display:'flex',flexDirection:'column',maxHeight:200}}>
                  <div style={{padding:'8px 12px 4px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,flexShrink:0}}>
                    {isCoach ? 'VIEW CLIENT WEEK' : 'TRACKING WEEK'}
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                    {list.map(({week,saved_at})=>{
                      const active = week===activeWeek
                      const dateStr = saved_at
                        ? new Date(saved_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                        : null
                      return (
                        <button key={week} onClick={()=>setActiveWeek(week)}
                          style={{width:'100%',textAlign:'left',background:active?`${C.gold}18`:C.surface,border:'none',borderLeft:`3px solid ${active?C.gold:'transparent'}`,padding:'7px 12px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}>
                          <div style={{fontSize:12,fontWeight:active?700:400,color:active?C.gold:C.white}}>Week {week}</div>
                          {dateStr
                            ? <div style={{fontSize:9,color:C.muted,marginTop:1}}>{dateStr}</div>
                            : <div style={{fontSize:9,color:C.muted,fontStyle:'italic',marginTop:1}}>not saved yet</div>
                          }
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Workout content */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow: isMobile ? 'visible' : 'hidden', minHeight: isMobile ? '80vh' : 'auto'}}>
            {/* Workout header */}
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              <input value={workouts[activeWorkout].name}
                readOnly={!isCoach}
                onChange={e=>isCoach&&setWorkouts(p=>p.map((w,i)=>i===activeWorkout?{...w,name:e.target.value}:w))}
                style={{flex:1,background:isCoach?C.surface:C.dim,border:`1px solid ${isCoach?C.border:C.dim}`,borderRadius:8,padding:'8px 12px',color:isCoach?C.white:C.muted,fontSize:14,fontWeight:700,outline:'none',cursor:isCoach?'text':'not-allowed'}}/>
              {isCoach&&(
                <button onClick={()=>setShowExPicker(true)}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                  + Add Exercise
                </button>
              )}
            </div>

            {/* Exercise list — Training Principles scrolls with content */}
            <div style={{flex:1,overflowY:'auto',padding:16}}>

              {/* Training principles card — scrolls with exercises */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,borderRadius:10,overflow:'hidden',marginBottom:16}}>
                <div style={{padding:'10px 14px 8px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1}}>LOE TRAINING PRINCIPLES</div>
                  {isCoach&&(
                    principlesEditing
                      ? <button onClick={()=>setPrinciplesEditing(false)}
                          style={{fontSize:9,padding:'2px 8px',background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:5,color:C.gold,cursor:'pointer',fontWeight:700}}>
                          ✓ Done
                        </button>
                      : <button onClick={()=>setPrinciplesEditing(true)}
                          style={{fontSize:9,padding:'2px 8px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:'pointer'}}>
                          ✏️ Edit
                        </button>
                  )}
                </div>
                {(isCoach && principlesEditing) ? (
                  <textarea
                    value={trainingPrinciples}
                    onChange={e=>setTrainingPrinciples(e.target.value)}
                    rows={8}
                    style={{width:'100%',background:'transparent',border:'none',borderTop:`1px solid ${C.border}`,padding:'10px 14px',color:C.white,fontSize:11,lineHeight:1.7,outline:'none',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                  />
                ) : (
                  <div style={{padding:'0 14px 12px',fontSize:11,color:C.muted,lineHeight:1.8,whiteSpace:'pre-wrap'}}>
                    {trainingPrinciples}
                  </div>
                )}
              </div>

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
                    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr 1fr',gap:8,marginBottom:10}}>
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
                    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
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
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                    {ex.sets} sets · {ex.reps} reps · Rest: {ex.rest}
                  </div>

                  {/* Coach: read-only view of client's logged sets for selected week */}
                  {isCoach&&(()=>{
                    const numSets = parseInt(ex.sets)||4
                    const hasData = Array(numSets).fill(0).some((_,si)=>{
                      const l = workoutLogs[`${activeWeek}_${ex.id}_${si}`]
                      return l?.weight||l?.reps
                    })
                    return (
                      <div style={{marginTop:4,padding:'8px 10px',background:C.surface,borderRadius:8}}>
                        <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,marginBottom:6}}>
                          WEEK {activeWeek} CLIENT LOG {hasData?'':'— No data yet'}
                        </div>
                        {hasData&&(
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {Array(numSets).fill(0).map((_,si)=>{
                              const l = workoutLogs[`${activeWeek}_${ex.id}_${si}`]||{weight:'',reps:''}
                              return (
                                <div key={si} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 8px',minWidth:72,textAlign:'center'}}>
                                  <div style={{fontSize:8,color:C.muted,fontWeight:700,marginBottom:3}}>SET {si+1}</div>
                                  <div style={{fontSize:11,fontWeight:700,color:C.gold}}>{l.weight||'—'} lb</div>
                                  <div style={{fontSize:10,color:C.white}}>{l.reps||'—'} reps</div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}

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
                {/* Coach workout notes — read only for client */}
                {isCoach&&<textarea value={workouts[activeWorkout].notes}
                  onChange={e=>setWorkouts(p=>p.map((w,i)=>i===activeWorkout?{...w,notes:e.target.value}:w))}
                  placeholder="Notes or instructions for this workout…"
                  rows={3}
                  style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',marginBottom:10}}/>}
                {isCoach&&workouts[activeWorkout].notes&&(
                  <div style={{background:C.surface,borderRadius:8,padding:'10px 12px',marginBottom:10,borderLeft:`3px solid ${C.gold}`}}>
                    <div style={{fontSize:9,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:4}}>COACH NOTES</div>
                    <div style={{fontSize:12,color:C.white,lineHeight:1.6}}>{workouts[activeWorkout].notes}</div>
                  </div>
                )}
                {isClient&&(
                  <textarea
                    placeholder="How did this workout feel? Any PRs, struggles, or notes for your coach?"
                    rows={3}
                    style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                )}
              </div>

              {isCoach&&(
                <button onClick={saveWorkoutPlan}
                  style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
                  Save Workout Plan
                </button>
              )}

              {!isCoach&&(
                <button onClick={saveWorkoutLog} disabled={logSaving}
                  style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20,opacity:logSaving?.6:1}}>
                  {logSaving?'Saving…':`Save Week ${activeWeek} Log`}
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
        <div style={{flex:1,display:'flex',flexDirection: isMobile ? 'column' : 'row',overflow: isMobile ? 'auto' : 'hidden'}}>

          {/* Cardio week selector sidebar */}
          {(()=>{
            const histNums = new Set(weekHistory.map(w=>w.week))
            const list = [...weekHistory]
            if (!histNums.has(activeWeek)) list.push({week:activeWeek,saved_at:null})
            if (list.length===0) list.push({week:1,saved_at:null})
            list.sort((a,b)=>b.week-a.week)
            return (
              <div style={{width: isMobile ? '100%' : 160, maxHeight: isMobile ? 120 : 'none', background:C.surface, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', display:'flex', flexDirection: 'column', flexShrink:0}}>
                <div style={{padding:'12px 12px 8px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>
                    {isCoach ? 'View Week' : 'My Log'}
                  </div>
                </div>
                <div style={{flex:1,overflowY:'auto'}}>
                  {list.map(({week,saved_at})=>{
                    const active = week===activeWeek
                    const dateStr = saved_at
                      ? new Date(saved_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                      : null
                    return (
                      <button key={week} onClick={()=>setActiveWeek(week)}
                        style={{width:'100%',textAlign:'left',background:active?`${C.gold}18`:C.surface,border:'none',borderLeft:`3px solid ${active?C.gold:'transparent'}`,padding:'10px 12px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}>
                        <div style={{fontSize:12,fontWeight:active?700:400,color:active?C.gold:C.white}}>Week {week}</div>
                        {dateStr
                          ? <div style={{fontSize:9,color:C.muted,marginTop:1}}>{dateStr}</div>
                          : <div style={{fontSize:9,color:C.muted,fontStyle:'italic',marginTop:1}}>not saved yet</div>
                        }
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Cardio main content */}
          <div style={{flex:1,overflowY:'auto',padding:16, minHeight: isMobile ? '80vh' : 'auto'}}>

          {/* Admin-only: manage company-wide cardio types */}
          {isAdmin&&(
            <Card sx={{marginBottom:12,borderColor:`${C.gold}44`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase'}}>⚙️ Company-Wide Cardio Types</span>
                <span style={{fontSize:9,color:C.muted}}>Visible to all coaches</span>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <input value={newCardioType} onChange={e=>setNewCardioType(e.target.value)}
                  placeholder="e.g. Sled Push"
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                <button onClick={addCompanyCardioType}
                  style={{background:C.gold,border:'none',borderRadius:6,padding:'7px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Add</button>
              </div>
              {companyCardioTypes.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {companyCardioTypes.map(t=>(
                    <div key={t} style={{display:'flex',alignItems:'center',gap:4,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 8px'}}>
                      <span style={{fontSize:11,color:C.white}}>{t}</span>
                      {myCompanyId===EDEN_ORG_ID&&(
                        <button onClick={()=>pushCardioTypeToAllOrgs(t)} title="Push to all orgs"
                          style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:10,fontWeight:700,padding:0,lineHeight:1}}>→ orgs</button>
                      )}
                      <button onClick={()=>renameCompanyCardioType(t)} title="Rename"
                        style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:11,padding:0,lineHeight:1}}>✎</button>
                      <button onClick={()=>removeCompanyCardioType(t)}
                        style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {companyCardioTypes.length===0&&(
                <div style={{fontSize:11,color:C.muted,fontStyle:'italic'}}>No custom types added yet</div>
              )}
            </Card>
          )}

          {/* ── Daily Step Goal (per client, set by coach) ── */}
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div>
                <Lbl t="Daily Step Goal"/>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {isCoach?'Set a daily step target for this client — saved with the workout plan.':'Your coach\u2019s daily step target for you.'}
                </div>
              </div>
              {isCoach?(
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <input type="number" min="0" step="500" value={stepGoal}
                    onChange={e=>setStepGoal(e.target.value)}
                    placeholder="e.g. 10000"
                    style={{width:120,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none'}}/>
                  <span style={{fontSize:12,color:C.muted,fontWeight:600}}>steps/day</span>
                </div>
              ):(
                <div style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:10,padding:'10px 16px',fontSize:16,fontWeight:800,color:C.gold}}>
                  {stepGoal?`👟 ${Number(stepGoal).toLocaleString()} steps/day`:'No step goal set yet'}
                </div>
              )}
            </div>
          </Card>

          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="Cardio Protocol"/>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {isCoach&&(
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:10,color:C.muted,fontWeight:600,whiteSpace:'nowrap'}}>Week starts</span>
                    <select
                      value={cardioWeekStart}
                      onChange={e=>setCardioWeekStart(e.target.value)}
                      style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 8px',color:C.white,fontSize:11,cursor:'pointer',outline:'none'}}>
                      {ALL_DAYS.map(d=>(
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
                {isCoach&&(
                  <button onClick={addCardio}
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    + Add Cardio
                  </button>
                )}
              </div>
            </div>

            {cardio.map((c,i)=>(
              <div key={i} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`}}>
                {isCoach?(
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10}}>
                    <Sel label="Type" value={c.type} onChange={v=>updateCardio(i,'type',v)} options={(v=>[...(v.includes(c.type)?[]:[c.type]),...v])([...CARDIO_TYPES.filter(t=>!hiddenCardio.has(t)),...companyCardioTypes])}/>
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

          {/* Cardio log — client edits, coach views read-only */}
          <Card sx={{marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <Lbl t={isCoach?`Client's Week ${activeWeek} Cardio Log`:'This Week\'s Cardio Log'}/>
              <span style={{fontSize:10,color:C.muted,fontWeight:600,background:C.surface,borderRadius:6,padding:'2px 8px'}}>
                Week {activeWeek}
              </span>
            </div>
            {!isCoach&&(
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Log each cardio session you completed this week</div>
            )}
            {isCoach&&(
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
                Read-only view of Jordan's submitted log. Use the week selector in the sidebar to browse other weeks.
              </div>
            )}
            {orderedDays(cardioWeekStart).map(day=>{
              const actKey   = `${activeWeek}_cardio_${day}_activity`
              const stepsKey = `${activeWeek}_cardio_${day}_steps`
              const activity = workoutLogs[actKey] || ''
              const steps    = workoutLogs[stepsKey] || ''
              const hasEntry = activity || steps
              return (
                <div key={day} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:`1px solid ${C.border}`}}>
                  <div style={{width:38,fontSize:11,color:C.muted,fontWeight:600,flexShrink:0}}>{day}</div>
                  {isCoach ? (
                    hasEntry ? (
                      <>
                        <div style={{flex:1,fontSize:12,color:C.white}}>{activity||<span style={{color:C.muted,fontStyle:'italic'}}>—</span>}</div>
                        <div style={{width:80,textAlign:'center',fontSize:12,color:C.gold,fontWeight:700,flexShrink:0}}>{steps?`${Number(steps).toLocaleString()} steps`:'—'}</div>
                      </>
                    ) : (
                      <div style={{flex:1,fontSize:11,color:C.muted,fontStyle:'italic'}}>No entry</div>
                    )
                  ) : (
                    <>
                      <input
                        value={activity}
                        onChange={e=>setWorkoutLogs(p=>({...p,[actKey]:e.target.value}))}
                        placeholder="Type + duration (e.g. Walk 45min)"
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                      <input
                        value={steps}
                        onChange={e=>setWorkoutLogs(p=>({...p,[stepsKey]:e.target.value}))}
                        placeholder="Steps" type="number"
                        style={{width:80,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.gold,fontSize:12,outline:'none',textAlign:'center',flexShrink:0}}/>
                    </>
                  )}
                </div>
              )
            })}
            {!isCoach&&(
              <button onClick={saveWorkoutLog} disabled={logSaving}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginTop:12,opacity:logSaving?.6:1}}>
                {logSaving?'Saving…':'Save Cardio Log'}
              </button>
            )}
          </Card>

          {isCoach&&(
            <button onClick={saveWorkoutPlan}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
              Save Cardio Protocol
            </button>
          )}
          </div>
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
