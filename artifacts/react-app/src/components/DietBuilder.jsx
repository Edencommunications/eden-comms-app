// ═══════════════════════════════════════════════════════════════
// DietBuilder.jsx — Week 3 v3 (Client Permissions Fixed)
// Coach: full edit access to all protocol sections
// Client: view-only on coach content, editable on their own sections
// Place at: src/components/DietBuilder.jsx in Replit
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const SUPABASE_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU'

const KNOWN_USERS = {
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach Marcus',    role:'coach' },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Jordan Williams', role:'client' },
  'admin@edencomms.io': { uuid:null,                                    name:'Eden Admin',      role:'super_admin' },
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
async function dbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) console.error('INSERT', await r.text())
}
async function dbGet(table, query='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers:{ 'apikey':SUPABASE_ANON, 'Authorization':`Bearer ${SUPABASE_ANON}` }
  })
  return r.ok ? r.json() : []
}
async function dbUpdate(table, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method:'PATCH',
    headers:{ 'apikey':SUPABASE_ANON, 'Authorization':`Bearer ${SUPABASE_ANON}`,
      'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body:JSON.stringify(body)
  })
  if (!r.ok) console.error('UPDATE', await r.text())
}
function scoreColor(v) {
  if (v == null) return C.muted
  if (v >= 8) return C.success
  if (v >= 5) return C.gold
  return C.danger
}

// ── Master habit list ─────────────────────────────────────────
const MASTER_HABITS = [
  {id:'supps',   name:'Take supplements',             defaultTarget:7},
  {id:'lemon',   name:'20oz Lemon Water upon waking', defaultTarget:7},
  {id:'water',   name:'1 Gallon Water Daily',         defaultTarget:7},
  {id:'steps',   name:'Daily Step Goal Hit',          defaultTarget:7},
  {id:'wake5',   name:'Wake up at 5 AM',              defaultTarget:7},
  {id:'wake530', name:'Wake up at 5:30 AM',           defaultTarget:7},
  {id:'wake6',   name:'Wake up at 6 AM',              defaultTarget:7},
  {id:'workout', name:'Workout',                      defaultTarget:5},
  {id:'cold',    name:'Cold Shower / Ice Bath',       defaultTarget:7},
  {id:'sleep8',  name:'8 Hour Sleep Window',          defaultTarget:7},
  {id:'read',    name:'Read 30 Minutes',              defaultTarget:7},
  {id:'meditate',name:'Meditate',                     defaultTarget:7},
  {id:'journal', name:'Journal / Prayer',             defaultTarget:7},
  {id:'cardio',  name:'45-60 Min Walk / Cardio',      defaultTarget:5},
  {id:'fast12',  name:'12 Hour No Eating Window',     defaultTarget:7},
  {id:'fast16',  name:'16 Hour No Eating Window',     defaultTarget:5},
  {id:'prep',    name:'Meal Prep Done',               defaultTarget:1},
  {id:'nophone', name:'No Phone First Hour of Day',   defaultTarget:7},
]

// ── Supplement database ───────────────────────────────────────
const SUPP_DB = {
  'Nervous System Regulator':[
    {name:'Standardized Saffron',  dose:'30mg upon waking',         directions:'Take upon waking',        code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'L-Theanine (AM)',       dose:'400mg upon waking',        directions:'Take upon waking',        code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'5-HTP',                dose:'100mg 1hr before bed',     directions:'1 hour before bed',       code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Magnesium Glycinate',   dose:'350mg 1hr before bed',    directions:'1 hour before bed',       code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'L-Theanine (PM)',       dose:'200mg 1hr before bed',    directions:'1 hour before bed',       code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Ashwagandha',           dose:'2 caps 1hr before bed',   directions:'1 hour before bed',       code:'TOGNIETTI10', link:'https://nuethix.com'},
  ],
  '5R Gut Protocol':[
    {name:'Biofilm Resolve',       dose:'2 caps 45-60min before meals 1,3,5', directions:'7-Day Prep Phase. Empty stomach', code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Saccharomyces Boulardii',dose:'2 caps meal 1, 2 caps last meal',  directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Fungal Pro',            dose:'2 caps 2x daily (meal 1 and last)', directions:'Weeks 1-6. Stop after 6 weeks.', code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Mastic Gum',           dose:'1000mg with meals 2 and 5',          directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Oregano Pro',           dose:'4 tabs 3x daily (meals 1,3,5)',     directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Bloat Eaze',            dose:'1 scoop daily with meal 1',         directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Glutamine',             dose:'20g daily with a meal',             directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Opti-Pure',             dose:'3 caps with meal 1 and meal 4',     directions:'Weeks 1-6 then maintenance',     code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Calcium D-Glucarate',   dose:'1000mg with meal 1 and meal 5',     directions:'Weeks 1-6',                      code:'',            link:'https://amazon.com'},
    {name:'Cort Eaze',             dose:'2 caps waking, meal 3, meal 5, bed',directions:'Weeks 1-6',                      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Biotics Bile Plus',     dose:'2 caps per meal',                   directions:'Week 7 and beyond',              code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Gut Defender',          dose:'2 caps with meal 1',                directions:'Week 7+ maintenance 6 weeks',    code:'TOGNIETTI10', link:'https://nuethix.com'},
  ],
  'PCOS Protocol':[
    {name:'NuBalance',             dose:'6 caps with Meal 1',         directions:'Daily',                  code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Calcium D-Glucarate',   dose:'1000mg with Meal 1 and 5',   directions:'Daily',                  code:'',            link:'https://amazon.com'},
    {name:'L-Carnitine',           dose:'10ml once daily between meals',directions:'Daily',                code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'NAC',                   dose:'1800mg daily',               directions:'Empty stomach 30min before meals', code:'', link:'https://amazon.com'},
    {name:'Saw Palmetto',          dose:'2 caps Meal 1, 2 caps last', directions:'Daily',                  code:'',            link:'https://amazon.com'},
  ],
  'Thyroid Protocol':[
    {name:'Iodine',                dose:'225mcg daily with Meal 1',   directions:'Daily with food',        code:'',            link:'https://amazon.com'},
    {name:'Selenium (Brazil Nuts)',dose:'3 Brazil nuts with Meal 1',  directions:'Daily',                  code:'',            link:''},
    {name:'ThyroBoost Plus',       dose:'2 capsules daily',           directions:'Daily',                  code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'B12 Liposomal',         dose:'0.5ml (1/2 dropper) daily',  directions:'Daily',                  code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Black Seed Oil',        dose:'10g daily',                  directions:'Daily',                  code:'',            link:'https://amazon.com'},
  ],
  'Adrenal Deficient Protocol':[
    {name:'Cort Eaze',             dose:'2 caps waking, meal 3, meal 5, bed', directions:'4x daily',      code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Relax Liposomal',       dose:'2ml before bed',             directions:'Nightly',                code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Ashwagandha',           dose:'2 caps with each Cort Eaze dose', directions:'4x daily',         code:'TOGNIETTI10', link:'https://nuethix.com'},
  ],
  'NuEthix Products':[
    {name:'Cort-Eaze',             dose:'As prescribed',              directions:'See adrenal protocol',   code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Nu-Multi',              dose:'3 caps with meal 1',         directions:'Daily',                  code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Prosorb+ Magnesium',    dose:'1 scoop before bed',         directions:'Nightly',                code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Bloat Eaze',            dose:'1 scoop morning fasted',     directions:'Daily fasted',           code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Nu-Glutamine',          dose:'20g daily',                  directions:'With a meal',            code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'ISO-Perfect Protein',   dose:'1 scoop',                    directions:'As needed',              code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Flora-Protect',         dose:'1 cap upon waking',          directions:'Fasted daily',           code:'TOGNIETTI10', link:'https://nuethix.com'},
  ],
  'Extra Supplements':[
    {name:'CoQ10',                 dose:'1500mg daily',               directions:'Daily',                  code:'',            link:'https://amazon.com'},
    {name:'NAC',                   dose:'600-1200mg 2-3x daily',      directions:'Empty stomach or 30min before meals', code:'', link:'https://amazon.com'},
    {name:'TUDCA',                 dose:'250-500mg 2x daily',         directions:'With meals',             code:'',            link:'https://amazon.com'},
    {name:'L-Carnitine',           dose:'3g daily',                   directions:'Between meals',          code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'DIM',                   dose:'As prescribed',              directions:'',                       code:'',            link:'https://amazon.com'},
    {name:'Vitamin D3 + K2',       dose:'5000 IU',                    directions:'With meal',              code:'TOGNIETTI10', link:'https://nuethix.com'},
    {name:'Zinc + Copper',         dose:'2 caps with meal 1',         directions:'Daily',                  code:'',            link:'https://amazon.com'},
    {name:'Collagen',              dose:'As prescribed',              directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com'},
  ],
}

// ── Food database ─────────────────────────────────────────────
const FOODS = [
  {name:'Organic Chicken Breast',serving:'4oz',cal:120,pro:21,fat:4,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Salmon',serving:'4oz',cal:237,pro:28.7,fat:13.6,carb:0,fib:0,cat:'Proteins'},
  {name:'Top Sirloin',serving:'4oz',cal:187,pro:34.7,fat:6,carb:0,fib:0,cat:'Proteins'},
  {name:'99% Lean Ground Turkey',serving:'4oz',cal:120,pro:28,fat:1,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Shrimp',serving:'4oz',cal:112,pro:26.7,fat:0.7,carb:0,fib:0,cat:'Proteins'},
  {name:'Mahi Mahi',serving:'4oz',cal:124,pro:26.7,fat:1.3,carb:0,fib:0,cat:'Proteins'},
  {name:'Organic Egg Whites',serving:'184g',cal:80,pro:18,fat:0,carb:0,fib:0,cat:'Proteins'},
  {name:'Whole Omega-3 Egg',serving:'1 egg',cal:90,pro:8.6,fat:6.1,carb:0,fib:0,cat:'Proteins'},
  {name:'Filet Mignon',serving:'4oz',cal:227,pro:34.7,fat:9.3,carb:0,fib:0,cat:'Proteins'},
  {name:'Grass-Fed Ground Beef 96/4',serving:'4oz',cal:170,pro:24,fat:8,carb:0,fib:0,cat:'Proteins'},
  {name:'Medipure Protein',serving:'1 scoop',cal:120,pro:22,fat:2,carb:5,fib:1,cat:'Proteins'},
  {name:'Wild Caught Tuna (drained)',serving:'4oz',cal:124,pro:28.2,fat:1.1,carb:0,fib:0,cat:'Proteins'},
  {name:'Brown Rice (cooked)',serving:'195g',cal:218,pro:4.5,fat:1.6,carb:45,fib:3.5,cat:'Carbohydrates'},
  {name:'White Rice (cooked)',serving:'186g',cal:242,pro:4.4,fat:0.4,carb:53,fib:0.6,cat:'Carbohydrates'},
  {name:'Oatmeal (dry)',serving:'40g',cal:150,pro:5,fat:3,carb:27,fib:4,cat:'Carbohydrates'},
  {name:'Red Potato',serving:'148g',cal:150,pro:3,fat:0,carb:26,fib:3,cat:'Carbohydrates'},
  {name:'Sweet Potato',serving:'130g',cal:112,pro:2,fat:0,carb:26,fib:4,cat:'Carbohydrates'},
  {name:'Quinoa (cooked)',serving:'185g',cal:222,pro:8,fat:3.6,carb:39,fib:5.2,cat:'Carbohydrates'},
  {name:'Ezekiel Bread',serving:'1 slice',cal:80,pro:5,fat:0.5,carb:15,fib:3,cat:'Carbohydrates'},
  {name:'Cream of Rice (dry)',serving:'45g',cal:150,pro:2,fat:0,carb:35,fib:0.3,cat:'Carbohydrates'},
  {name:'Lentil Pasta (dry)',serving:'56g',cal:200,pro:15,fat:1.5,carb:34,fib:3,cat:'Carbohydrates'},
  {name:'Extra Virgin Olive Oil',serving:'14g',cal:120,pro:0,fat:14,carb:0,fib:0,cat:'Fats'},
  {name:'Coconut Oil (unrefined)',serving:'14g',cal:120,pro:0,fat:14,carb:0,fib:0,cat:'Fats'},
  {name:'Avocado',serving:'50g',cal:80,pro:1,fat:7.3,carb:4.3,fib:3.4,cat:'Fats'},
  {name:'Almond Butter',serving:'32g',cal:192,pro:6.8,fat:17.4,carb:6.1,fib:3.4,cat:'Fats'},
  {name:'Almonds',serving:'28g',cal:164,pro:6,fat:14.2,carb:6.1,fib:3.5,cat:'Fats'},
  {name:'Chia Seeds',serving:'12g',cal:58,pro:2,fat:3.7,carb:5,fib:4.1,cat:'Fats'},
  {name:'Raw Honey',serving:'7g',cal:20,pro:0,fat:0,carb:6,fib:0,cat:'Fats'},
  {name:'Blueberries',serving:'100g',cal:68,pro:0.7,fat:0.3,carb:14.5,fib:2.4,cat:'Fruits/Vegetables'},
  {name:'Mixed Berries (frozen)',serving:'100g',cal:55,pro:0.8,fat:0.3,carb:12,fib:2.5,cat:'Fruits/Vegetables'},
  {name:'Strawberries',serving:'100g',cal:30,pro:0.8,fat:0.1,carb:6,fib:2,cat:'Fruits/Vegetables'},
  {name:'Banana',serving:'100g',cal:103,pro:1.2,fat:0.3,carb:23.2,fib:2.6,cat:'Fruits/Vegetables'},
  {name:'Broccoli',serving:'100g',cal:38,pro:4.4,fat:0.9,carb:1.8,fib:2.6,cat:'Fruits/Vegetables'},
  {name:'Green Beans (canned)',serving:'100g',cal:21,pro:1,fat:0.4,carb:4.1,fib:1.5,cat:'Fruits/Vegetables'},
  {name:'Baby Spinach',serving:'100g',cal:29,pro:2.8,fat:0.8,carb:1.6,fib:1.5,cat:'Fruits/Vegetables'},
  {name:'Asparagus',serving:'100g',cal:29,pro:2.9,fat:0.6,carb:2,fib:2.1,cat:'Fruits/Vegetables'},
  {name:'Cucumber',serving:'80g',cal:12,pro:0.5,fat:0.1,carb:2.2,fib:0.6,cat:'Fruits/Vegetables'},
  {name:'Fish Oil 2000mg',serving:'2 caps',cal:20,pro:0,fat:2,carb:0,fib:0,cat:'Supplements'},
  {name:'Glutamine 20g',serving:'20g',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Supplements'},
  {name:'Bloat Eaze',serving:'1 scoop',cal:10,pro:0,fat:0,carb:2,fib:0,cat:'Supplements'},
  {name:'Magnesium',serving:'1 scoop',cal:5,pro:0,fat:0,carb:1,fib:0,cat:'Supplements'},
  {name:'Water (16oz)',serving:'16oz',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Black Coffee',serving:'240ml',cal:5,pro:0.3,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Organic Apple Juice',serving:'250ml',cal:115,pro:0.2,fat:0.3,carb:28,fib:0.5,cat:'Drinks/Condiments'},
  {name:'Aloe Vera Juice',serving:'59ml',cal:4,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Beef Bone Broth',serving:'150ml',cal:25,pro:5,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Yellow Mustard',serving:'5g',cal:3,pro:0.2,fat:0.1,carb:0.3,fib:0.1,cat:'Drinks/Condiments'},
  {name:'Hot Sauce',serving:'5g',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Salsa',serving:'30g',cal:10,pro:0.4,fat:0,carb:2,fib:0.5,cat:'Drinks/Condiments'},
]

const PROTOCOLS = [
  '2 High 2 Low Female','2 High 2 Low Male',
  'Base Diet Protocol Female','Base Diet Protocol Male',
  'Female Leaky Gut Base Diet','Female Low Protein Flush Diet',
  'Female Vegan Diet','Male Leaky Gut Base Diet',
  'Male Low Protein Flush Diet','Male Vegan Diet',
]

const ACTIVITY_LEVELS = [
  {label:'Minimal (<5000 Steps/Day)',mult:1.2},
  {label:'Light (5000-7500 Steps/Day)',mult:1.375},
  {label:'Moderate (7500-10000 Steps/Day)',mult:1.55},
  {label:'Fair (10000-12500 Steps/Day)',mult:1.725},
  {label:'Very Active (>12500 Steps/Day)',mult:1.9},
]

const DEFICIT_SURPLUS = [
  {label:'25% Surplus',val:1.25},{label:'20% Surplus',val:1.20},
  {label:'15% Surplus',val:1.15},{label:'10% Surplus',val:1.10},
  {label:'5% Surplus',val:1.05},{label:'Maintenance',val:1.00},
  {label:'5% Deficit',val:0.95},{label:'10% Deficit',val:0.90},
  {label:'15% Deficit',val:0.85},{label:'20% Deficit',val:0.80},
  {label:'25% Deficit',val:0.75},
]

function mealMacros(meal) {
  return meal.foods.reduce((acc,item)=>({
    cal:Math.round(acc.cal+item.food.cal*item.servings),
    pro:Math.round(acc.pro+item.food.pro*item.servings),
    fat:Math.round(acc.fat+item.food.fat*item.servings),
    carb:Math.round(acc.carb+item.food.carb*item.servings),
    fib:Math.round(acc.fib+item.food.fib*item.servings),
  }), {cal:0,pro:0,fat:0,carb:0,fib:0})
}

function calcBMR(weight,height,age,gender) {
  const w=parseFloat(weight)*0.453592, h=parseFloat(height)*2.54, a=parseFloat(age)
  if(!w||!h||!a) return 0
  return gender==='Male'?Math.round(10*w+6.25*h-5*a+5):Math.round(10*w+6.25*h-5*a-161)
}

const MCOLS={cal:'#ffa600',pro:'#4FD89A',carb:'#6FB8E8',fat:'#f06060',fib:'#D4A8F0'}

function MacroBar({label,val,target,unit=''}) {
  const col=MCOLS[label]||C.gold
  const pct=target?Math.min(100,Math.round(val/target*100)):0
  return (
    <div style={{textAlign:'center',minWidth:52}}>
      <div style={{fontSize:15,fontWeight:700,color:col}}>{val}{unit}</div>
      {target&&<div style={{fontSize:9,color:C.muted,margin:'1px 0 4px'}}>/{target}{unit}</div>}
      <div style={{height:3,borderRadius:2,background:C.border}}>
        <div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:col,transition:'width .4s'}}/>
      </div>
      <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:'capitalize'}}>{label}</div>
    </div>
  )
}

function Lbl({t}) {
  return <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',margin:'13px 0 7px'}}>{t}</div>
}

function ReadOnlyBadge() {
  return (
    <span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'2px 7px',borderRadius:10,fontWeight:700,letterSpacing:.5,marginLeft:8}}>
      VIEW ONLY
    </span>
  )
}

function Inp({label,value,onChange,type='text',placeholder,disabled=false}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <input type={type} value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder}
        disabled={disabled}
        style={{width:'100%',background:disabled?C.dim:C.surface,border:`1px solid ${disabled?C.dim:C.border}`,borderRadius:8,padding:'9px 12px',color:disabled?C.muted:C.white,fontSize:13,outline:'none',boxSizing:'border-box',cursor:disabled?'not-allowed':'text'}}/>
    </div>
  )
}

function Sel({label,value,onChange,options,disabled=false}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{label}</div>}
      <select value={value} onChange={e=>onChange&&onChange(e.target.value)} disabled={disabled}
        style={{width:'100%',background:disabled?C.dim:C.surface,border:`1px solid ${disabled?C.dim:C.border}`,borderRadius:8,padding:'9px 12px',color:disabled?C.muted:C.white,fontSize:13,outline:'none',cursor:disabled?'not-allowed':'pointer'}}>
        {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
    </div>
  )
}

function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}

// ── View-only food row (client sees this instead of editable row) ──
function ReadOnlyFoodRow({item}) {
  return (
    <div style={{padding:'7px 0',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:C.white,fontWeight:500}}>{item.food.name}</div>
        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
          {item.food.serving} × {item.servings} · {Math.round(item.food.cal*item.servings)}cal · P:{Math.round(item.food.pro*item.servings)}g C:{Math.round(item.food.carb*item.servings)}g F:{Math.round(item.food.fat*item.servings)}g Fib:{Math.round(item.food.fib*item.servings)}g
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// CHECK-IN CHARTS — full suite matching the home modal
// ════════════════════════════════════════════════════════════════
function CheckInCharts({ checkins }) {
  if (!checkins || checkins.length < 2) return null

  const chartData = [...checkins].reverse().map(e => ({
    date:      e.date.replace(' 2026',''),
    weight:    parseFloat(e.weight) || 0,
    compliance:e.compliance,
    habitPct:  typeof e.habitPct === 'number' ? e.habitPct : null,
    energy:    e.energy,
    sleep:     e.sleep,
    bloating:  e.bloating,
    brainFog:  e.brainFog,
    sexDrive:  e.sexDrive,
    hunger:    e.hunger,
    stress:    e.stress,
    steps:     parseInt(String(e.steps||'0').replace(/,/g,'')) || 0,
    heartRate: parseInt(e.heartRate) || 0,
    hrv:       parseInt(e.hrv) || 0,
    temp:      parseFloat(e.temp) || 0,
  }))

  const CT = {
    grid: '#2a2a2a', tick: '#666',
    tooltip: {
      contentStyle:{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, fontSize:11 },
      labelStyle:{ color:C.white, fontWeight:700 },
      itemStyle:{ color:'#ccc' },
    },
  }

  const Panel = ({ title, children }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>{title}</div>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'12px 4px 8px 0' }}>
        {children}
      </div>
    </div>
  )

  return (
    <div>
      {/* 1. Weight */}
      <Panel title="Weight (lbs)">
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <defs>
              <linearGradient id="ciWGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.gold} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={C.gold} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
            <Tooltip {...CT.tooltip}/>
            <Area type="monotone" dataKey="weight" stroke={C.gold} strokeWidth={2} fill="url(#ciWGrad)" dot={{fill:C.gold,r:3}} activeDot={{r:5}}/>
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {/* 2. Compliance */}
      <Panel title="Weekly Compliance (%)">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid} vertical={false}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={[60,100]}/>
            <Tooltip {...CT.tooltip} formatter={v=>[v+'%','Compliance']}/>
            <Bar dataKey="compliance" fill={C.gold} radius={[4,4,0,0]}
              label={{position:'top',fontSize:9,fill:C.gold,formatter:v=>v+'%'}}/>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* 2b. Habit Compliance — only if data exists */}
      {chartData.some(d=>d.habitPct!=null)&&(
        <Panel title="Habit Compliance (%)">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={CT.grid} vertical={false}/>
              <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={[0,100]}/>
              <Tooltip {...CT.tooltip} formatter={v=>[v+'%','Habits']}/>
              <Bar dataKey="habitPct" radius={[4,4,0,0]}
                label={{position:'top',fontSize:9,fill:'#4FD89A',formatter:v=>v!=null?v+'%':''}}
                fill="#4FD89A"/>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* 3. Energy · Sleep · Sex Drive */}
      <Panel title="Energy · Sleep · Sex Drive (1–10, higher = better)">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={[1,10]}/>
            <Tooltip {...CT.tooltip}/>
            <Legend wrapperStyle={{fontSize:10,color:C.muted,paddingTop:4}}/>
            <Line type="monotone" dataKey="energy"   stroke={C.gold}   strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Energy"/>
            <Line type="monotone" dataKey="sleep"    stroke="#6FB8E8"  strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Sleep"/>
            <Line type="monotone" dataKey="sexDrive" stroke="#FF7EB3"  strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Sex Drive"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* 4. Brain Fog · Bloating */}
      <Panel title="Brain Fog · Bloating (1–10, higher = better)">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={[1,10]}/>
            <Tooltip {...CT.tooltip}/>
            <Legend wrapperStyle={{fontSize:10,color:C.muted,paddingTop:4}}/>
            <Line type="monotone" dataKey="brainFog" stroke="#D4A8F0" strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Brain Fog"/>
            <Line type="monotone" dataKey="bloating" stroke={C.success} strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Bloating"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* 5. Stress & Hunger */}
      <Panel title="Stress & Hunger (1–10, lower = better)">
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={[1,10]}/>
            <Tooltip {...CT.tooltip}/>
            <Legend wrapperStyle={{fontSize:10,color:C.muted,paddingTop:4}}/>
            <Line type="monotone" dataKey="stress" stroke="#ff5252" strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Stress"/>
            <Line type="monotone" dataKey="hunger" stroke="#FF9E6C" strokeWidth={2} dot={{r:3}} activeDot={{r:5}} name="Hunger"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* 6. Daily Steps */}
      <Panel title="Daily Steps">
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={chartData} margin={{top:4,right:16,left:-8,bottom:0}}>
            <defs>
              <linearGradient id="ciStepsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6FB8E8" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6FB8E8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}
              tickFormatter={v=>v>=1000?Math.round(v/1000)+'k':String(v)} domain={['auto','auto']}/>
            <Tooltip {...CT.tooltip} formatter={v=>[Number(v).toLocaleString()+' steps','Steps']}/>
            <Area type="monotone" dataKey="steps" stroke="#6FB8E8" strokeWidth={2} fill="url(#ciStepsGrad)" dot={{fill:'#6FB8E8',r:3}} activeDot={{r:5}}/>
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {/* 7. Resting Heart Rate */}
      <Panel title="Resting Heart Rate (bpm) — lower trend = better">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
            <Tooltip {...CT.tooltip} formatter={v=>[v+' bpm','Heart Rate']}/>
            <Line type="monotone" dataKey="heartRate" stroke="#ff5252" strokeWidth={2} dot={{fill:'#ff5252',r:3}} activeDot={{r:5}} name="HR (bpm)"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* 8. HRV */}
      <Panel title="HRV — higher trend = better recovery">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
            <Tooltip {...CT.tooltip} formatter={v=>[v,'HRV']}/>
            <Line type="monotone" dataKey="hrv" stroke={C.success} strokeWidth={2} dot={{fill:C.success,r:3}} activeDot={{r:5}} name="HRV"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* 9. Body Temperature */}
      <Panel title="Body Temperature (°F)">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{top:4,right:16,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
            <XAxis dataKey="date" tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:CT.tick,fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
            <Tooltip {...CT.tooltip} formatter={v=>[v+'°F','Temp']}/>
            <Line type="monotone" dataKey="temp" stroke="#D4A8F0" strokeWidth={2} dot={{fill:'#D4A8F0',r:3}} activeDot={{r:5}}/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function DietBuilder({currentUser, initialTab='plan', demoCheckins=[]}) {
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'client',name:'User'}
  // Prefer the role passed in currentUser (coach viewing a client's tools)
  // over the KNOWN_USERS lookup, which would always return 'client' for client emails
  const role    = currentUser?.role || info.role
  const isCoach = role==='coach'||role==='super_admin'
  const isClient= role==='client'

  const [tab,        setTab]        = useState(initialTab)
  const [dayType,    setDayType]    = useState('high')
  const [protocol,   setProtocol]   = useState('Base Diet Protocol Male')
  const [showPicker, setShowPicker] = useState(false)
  const [activeMeal, setActiveMeal] = useState(null)
  const [foodSearch, setFoodSearch] = useState('')
  const [privacyMode,setPrivacyMode]= useState(false)

  const [highMeals, setHighMeals] = useState(
    ['Meal 1','Meal 2','Meal 3','Meal 4','Meal 5','Meal 6'].map(n=>({name:n,foods:[]}))
  )
  const [lowMeals, setLowMeals] = useState(
    ['Meal 1','Meal 2','Meal 3','Meal 4','Meal 5'].map(n=>({name:n,foods:[]}))
  )
  const meals    = dayType==='high'?highMeals:lowMeals
  const setMeals = dayType==='high'?setHighMeals:setLowMeals

  // Calculator
  const [calc, setCalc] = useState({
    gender:'Male',weight:'',height:'',age:'',bodyfat:'',
    activity:ACTIVITY_LEVELS[1].label,ds:'Maintenance',
    protPct:40,fatPct:30,carbPct:30,
  })
  const [results, setResults] = useState(null)
  const targets = results||{cal:2100,pro:175,fat:70,carb:200,fib:30}

  // Check-in — client owned
  const [ci, setCi] = useState({
    weight:'',temp:'',steps:'',bp:'',
    sleep:'5',sleepNotes:'',wakeTime:'',
    bloating:'5',brainFog:'5',sexDrive:'5',energy:'5',hunger:'5',
    bowelCount:'',bowelType:'',heartRate:'',hrv:'',
    cycleNotes:'',cyclePain:'5',notes:'',
  })
  const setC = k=>v=>setCi(p=>({...p,[k]:v}))

  // Check-in hub state
  const [localCheckins,    setLocalCheckins]    = useState([])
  const [expandedCi,       setExpandedCi]       = useState(null)
  const [editingCi,        setEditingCi]        = useState(null)
  const [draftNote,        setDraftNote]        = useState('')
  const [draftLoom,        setDraftLoom]        = useState('')
  const [clientViewTab,    setClientViewTab]    = useState('history')
  const [clientPhotos,     setClientPhotos]     = useState(null)
  const [photoUploading,   setPhotoUploading]   = useState(false)
  const photoFileRef = useRef(null)

  useEffect(() => {
    setLocalCheckins((demoCheckins||[]).map(ci => ({
      ...ci,
      coachNotes: ci.coachNotes || '',
      coachLoom:  ci.coachLoom  || '',
    })))
    setExpandedCi(null)
    setEditingCi(null)
  }, [demoCheckins])

  // Load client's progress photos
  useEffect(() => {
    if (role !== 'client') return
    const uuid = KNOWN_USERS[email]?.uuid
    if (!uuid) { setClientPhotos([]); return }
    dbGet('progress_photos', `client_id=eq.${uuid}&order=taken_at.desc&limit=60`)
      .then(rows => setClientPhotos(Array.isArray(rows) && rows.length ? rows : []))
      .catch(() => setClientPhotos([]))
  }, [email, role])

  async function uploadProgressPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const uuid = KNOWN_USERS[email]?.uuid
    if (!uuid) { alert('Could not identify your account.'); return }
    setPhotoUploading(true)
    try {
      const path = `${uuid}/${Date.now()}-${file.name}`
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/progress-photos/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': file.type },
        body: file,
      })
      if (!upRes.ok) throw new Error('upload failed')
      const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/progress-photos/${path}`
      const weekNum  = (clientPhotos?.length || 0) + 1
      await dbInsert('progress_photos', {
        client_id: uuid, week_label: `Week ${weekNum}`,
        photo_url: photoUrl, file_name: file.name, file_size: file.size,
        taken_at: new Date().toISOString(),
      })
      const rows = await dbGet('progress_photos', `client_id=eq.${uuid}&order=taken_at.desc&limit=60`)
      setClientPhotos(Array.isArray(rows) ? rows : [])
    } catch { alert('Upload failed. Make sure the progress-photos storage bucket exists in Supabase.') }
    finally { setPhotoUploading(false); if (photoFileRef.current) photoFileRef.current.value = '' }
  }

  // Habits — assigned by coach, frequency filled by client
  const [assignedHabits,   setAssignedHabits]   = useState(MASTER_HABITS.slice(0,8).map(h=>({...h,target:h.defaultTarget})))
  const [showHabitPicker,  setShowHabitPicker]  = useState(false)
  const [customHabit,      setCustomHabit]      = useState('')
  const [habitCounts,      setHabitCounts]      = useState({})
  const setHabitCount = (id,v) => setHabitCounts(p=>({...p,[id]:Math.min(7,Math.max(0,parseInt(v)||0))}))

  // Coach-only updates — visible to client in their Check-In history
  const [coachOnlyUpdates, setCoachOnlyUpdates] = useState([
    {id:1,date:'Jul 14 2026',note:'Adjusted Meal 3 protein up to 5.5oz. Keep hitting step goal — great progress this week!',loom:''},
    {id:2,date:'Jul 7 2026',note:'Weekly check-in review + diet update walkthrough',loom:'https://loom.com/share/example'},
  ])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newNote,     setNewNote]     = useState('')
  const [newLoom,     setNewLoom]     = useState('')
  const [newDate,     setNewDate]     = useState('2026-07-21')

  // Supplements — coach builds, client views + adds own notes
  const [clientSupps,    setClientSupps]    = useState([])
  const [showSuppPicker, setShowSuppPicker] = useState(false)
  const [suppSearch,     setSuppSearch]     = useState('')
  const [suppCategory,   setSuppCategory]   = useState(Object.keys(SUPP_DB)[0])
  const [customSuppText, setCustomSuppText] = useState('')
  const [coachNotes,     setCoachNotes]     = useState('')
  // Client's own notes on their supplement experience
  const [clientSuppNotes, setClientSuppNotes] = useState('')
  // Client's own prescription notes
  const [clientRxNotes, setClientRxNotes] = useState('')

  // ── Rx / Prescription tracker ─────────────────────────────
  const [rxList,        setRxList]        = useState([])
  const [showRxForm,    setShowRxForm]    = useState(false)
  // Fields for the Rx being drafted
  const [rxName,        setRxName]        = useState('')
  const [rxDose,        setRxDose]        = useState('')
  const [rxDirections,  setRxDirections]  = useState('')
  const [rxStartDate,   setRxStartDate]   = useState('')
  // Taper steps being drafted inside the add form
  const [draftTapers,   setDraftTapers]   = useState([])
  const [showTaperRow,  setShowTaperRow]  = useState(false)
  const [tapDate,       setTapDate]       = useState('')
  const [tapDose,       setTapDose]       = useState('')
  const [tapNote,       setTapNote]       = useState('')
  // Adding a taper to an already-saved entry
  const [editTaperFor,  setEditTaperFor]  = useState(null)
  const [editTapDate,   setEditTapDate]   = useState('')
  const [editTapDose,   setEditTapDose]   = useState('')
  const [editTapNote,   setEditTapNote]   = useState('')

  function resetRxForm() {
    setRxName(''); setRxDose(''); setRxDirections(''); setRxStartDate('')
    setDraftTapers([]); setShowTaperRow(false)
    setTapDate(''); setTapDose(''); setTapNote('')
  }
  function openRxForm()  { resetRxForm(); setShowRxForm(true)  }
  function closeRxForm() { resetRxForm(); setShowRxForm(false) }

  function addDraftTaperStep() {
    if (!tapDate.trim() || !tapDose.trim()) return
    setDraftTapers(prev => [...prev, { id: Date.now(), date: tapDate, dose: tapDose, note: tapNote }]
      .sort((a,b) => a.date.localeCompare(b.date)))
    setTapDate(''); setTapDose(''); setTapNote(''); setShowTaperRow(false)
  }
  function removeDraftTaper(id) { setDraftTapers(prev => prev.filter(t => t.id !== id)) }

  function saveRx() {
    if (!rxName.trim() || !rxDose.trim()) return
    setRxList(prev => [...prev, {
      id: Date.now(),
      name: rxName.trim(), dose: rxDose.trim(),
      directions: rxDirections.trim(), startDate: rxStartDate,
      tapers: draftTapers,
    }])
    closeRxForm()
  }
  function removeRx(id) { setRxList(prev => prev.filter(r => r.id !== id)) }

  function saveEditTaper(rxId) {
    if (!editTapDate.trim() || !editTapDose.trim()) return
    setRxList(prev => prev.map(r => r.id === rxId ? {
      ...r,
      tapers: [...r.tapers, { id: Date.now(), date: editTapDate, dose: editTapDose, note: editTapNote }]
        .sort((a,b) => a.date.localeCompare(b.date))
    } : r))
    setEditTapDate(''); setEditTapDose(''); setEditTapNote(''); setEditTaperFor(null)
  }
  function removeTaper(rxId, tapId) {
    setRxList(prev => prev.map(r => r.id === rxId ? { ...r, tapers: r.tapers.filter(t => t.id !== tapId) } : r))
  }

  const totals = meals.reduce((a,m)=>{
    const mt=mealMacros(m)
    return {cal:a.cal+mt.cal,pro:a.pro+mt.pro,fat:a.fat+mt.fat,carb:a.carb+mt.carb,fib:a.fib+mt.fib}
  },{cal:0,pro:0,fat:0,carb:0,fib:0})

  function addFood(food) {
    if(activeMeal===null) return
    setMeals(p=>p.map((m,i)=>i===activeMeal?{...m,foods:[...m.foods,{food,servings:1}]}:m))
    setShowPicker(false); setFoodSearch('')
  }
  function removeFood(mi,fi) {
    setMeals(p=>p.map((m,i)=>i===mi?{...m,foods:m.foods.filter((_,j)=>j!==fi)}:m))
  }
  function updateServings(mi,fi,v) {
    setMeals(p=>p.map((m,i)=>i===mi?{...m,foods:m.foods.map((f,j)=>j===fi?{...f,servings:parseFloat(v)||1}:f)}:m))
  }

  function runCalc() {
    const bmr=calcBMR(calc.weight,calc.height,calc.age,calc.gender)
    if(!bmr) return
    const mult=ACTIVITY_LEVELS.find(a=>a.label===calc.activity)?.mult||1.375
    const maint=Math.round(bmr*mult)
    const ds=DEFICIT_SURPLUS.find(d=>d.label===calc.ds)?.val||1
    const calT=Math.round(maint*ds)
    setResults({bmr,maintenance:maint,cal:calT,
      pro:Math.round(calT*(calc.protPct/100)/4),
      fat:Math.round(calT*(calc.fatPct/100)/9),
      carb:Math.round(calT*(calc.carbPct/100)/4),fib:30})
  }

  function addSuppFromDB(supp) {
    setClientSupps(p=>[...p,{...supp,id:Date.now()+'_'+supp.name,customDose:supp.dose,customDir:supp.directions}])
  }
  function addSuppProtocol(cat) {
    SUPP_DB[cat]?.forEach(s=>addSuppFromDB({...s,category:cat}))
    setShowSuppPicker(false)
  }
  function removeSupp(id) { setClientSupps(p=>p.filter(s=>s.id!==id)) }
  function updateSuppField(id,field,val) {
    setClientSupps(p=>p.map(s=>s.id===id?{...s,[field]:val}:s))
  }

  function addCoachUpdate() {
    if(!newNote.trim()&&!newLoom.trim()) return
    setCoachOnlyUpdates(p=>[{id:Date.now(),date:newDate,note:newNote.trim(),loom:newLoom.trim()},...p])
    setNewNote(''); setNewLoom(''); setShowAddForm(false)
  }

  function toggleHabitAssign(habit) {
    const exists=assignedHabits.find(h=>h.id===habit.id)
    if(exists) setAssignedHabits(p=>p.filter(h=>h.id!==habit.id))
    else setAssignedHabits(p=>[...p,{...habit,target:habit.defaultTarget}])
  }
  function addCustomHabit() {
    if(!customHabit.trim()) return
    setAssignedHabits(p=>[...p,{id:'custom_'+Date.now(),name:customHabit.trim(),defaultTarget:7,target:7}])
    setCustomHabit('')
  }

  const habitScore = assignedHabits.length>0
    ? Math.round(assignedHabits.reduce((a,h)=>a+(habitCounts[h.id]||0),0)/assignedHabits.reduce((a,h)=>a+h.target,0)*100)
    : 0

  const filteredFoods = FOODS.filter(f=>
    !foodSearch||f.name.toLowerCase().includes(foodSearch.toLowerCase())||f.cat.toLowerCase().includes(foodSearch.toLowerCase())
  )

  const allSuppSearch = Object.entries(SUPP_DB).flatMap(([cat,supps])=>
    supps.filter(s=>s.name.toLowerCase().includes(suppSearch.toLowerCase())).map(s=>({...s,category:cat}))
  )

  const TABS=[
    ['plan','🥗 Meal Plan'],
    ['calculator','🔢 Calculator'],
    ['checkin','📋 Check-In'],
    ['habits','✅ Habits'],
    ['supplements','💊 Supps'],
  ]

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.black,overflow:'hidden',position:'relative'}}>

      {/* Privacy mode banner */}
      {privacyMode&&(
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:50,background:'#ff444488',padding:'6px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:12,color:C.white,fontWeight:700}}>🎥 Privacy Mode ON — Client roster hidden</span>
          <button onClick={()=>setPrivacyMode(false)} style={{background:'none',border:`1px solid ${C.white}`,borderRadius:6,padding:'3px 10px',color:C.white,fontSize:11,cursor:'pointer'}}>Restore</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:`0 16px`,display:'flex',alignItems:'center',gap:0,flexShrink:0,marginTop:privacyMode?28:0}}>
        <div style={{flex:1,paddingRight:8}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>{isCoach?`Diet Builder — Jordan Williams`:'My Diet Plan'}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{protocol}</div>
        </div>
        {isCoach&&(
          <button onClick={()=>setPrivacyMode(p=>!p)} title="Hide client roster for Loom recording"
            style={{background:privacyMode?`${C.danger}33`:C.card,border:`1px solid ${privacyMode?C.danger:C.border}`,borderRadius:8,padding:'5px 10px',color:privacyMode?C.danger:C.muted,fontSize:11,fontWeight:700,cursor:'pointer',marginRight:10,whiteSpace:'nowrap'}}>
            {privacyMode?'🎥 Recording':'🎥 Loom Mode'}
          </button>
        )}
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'12px 11px',background:'none',border:'none',borderBottom:`2px solid ${tab===k?C.gold:'transparent'}`,color:tab===k?C.gold:C.muted,fontSize:11,fontWeight:tab===k?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ══ MEAL PLAN ════════════════════════════════════════ */}
      {tab==='plan'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>

          {/* Protocol selector — coach only */}
          {isCoach&&(
            <Card sx={{marginBottom:12}}>
              <Sel label="Diet Protocol" value={protocol} onChange={setProtocol} options={PROTOCOLS}/>
            </Card>
          )}

          {/* Day toggle */}
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            {['high','low'].map(d=>(
              <button key={d} onClick={()=>setDayType(d)}
                style={{flex:1,padding:10,borderRadius:10,border:`1px solid ${dayType===d?C.gold:C.border}`,background:dayType===d?`${C.gold}20`:C.card,color:dayType===d?C.gold:C.muted,fontWeight:dayType===d?700:400,fontSize:13,cursor:'pointer'}}>
                {d==='high'?'⬆ High Calorie Day':'⬇ Low Calorie Day'}
              </button>
            ))}
          </div>

          {/* Macro summary */}
          <Card sx={{marginBottom:12}}>
            <Lbl t="Daily Totals"/>
            <div style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap'}}>
              <MacroBar label="cal"  val={totals.cal}  target={targets.cal}/>
              <MacroBar label="pro"  val={totals.pro}  target={targets.pro}  unit="g"/>
              <MacroBar label="carb" val={totals.carb} target={targets.carb} unit="g"/>
              <MacroBar label="fat"  val={totals.fat}  target={targets.fat}  unit="g"/>
              <MacroBar label="fib"  val={totals.fib}  target={targets.fib}  unit="g"/>
            </div>
            <div style={{marginTop:12,padding:'9px 12px',background:C.surface,borderRadius:8,borderLeft:`3px solid ${C.gold}`}}>
              <div style={{fontSize:9,fontWeight:700,color:C.gold,marginBottom:3}}>LOE FOOD QUALITY STANDARDS</div>
              <div style={{fontSize:10,color:C.muted,lineHeight:1.7}}>
                • Organic fruits/veg · Grass-fed/finished beef · Wild caught fish · Raw dairy only<br/>
                • NO artificial sweeteners — Stevia only · Raw honey only · 6-8g EVOO for cooking<br/>
                • Updates due before 9 AM CST on your check-in day — fasted weight + photos
              </div>
            </div>
          </Card>

          {/* Meals */}
          {meals.map((meal,mi)=>{
            const mt=mealMacros(meal)
            return (
              <Card key={mi} sx={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.white}}>{meal.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,color:C.gold,fontWeight:600}}>{mt.cal} cal</span>
                    <span style={{fontSize:10,color:C.muted}}>P:{mt.pro}g C:{mt.carb}g F:{mt.fat}g</span>
                    {/* + Food button — coach only */}
                    {isCoach&&(
                      <button onClick={()=>{setActiveMeal(mi);setShowPicker(true)}}
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        + Food
                      </button>
                    )}
                  </div>
                </div>

                {meal.foods.length===0?(
                  <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'6px 0'}}>
                    {isCoach?'Click + Food to build this meal':'No foods added yet'}
                  </div>
                ):meal.foods.map((item,fi)=>(
                  isCoach?(
                    // Coach: full editable row
                    <div key={fi} style={{padding:'7px 0',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:C.white,fontWeight:500}}>{item.food.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                          {item.food.serving} · {Math.round(item.food.cal*item.servings)}cal · P:{Math.round(item.food.pro*item.servings)}g C:{Math.round(item.food.carb*item.servings)}g F:{Math.round(item.food.fat*item.servings)}g
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                        <span style={{fontSize:10,color:C.muted}}>×</span>
                        <input type="number" min="0.25" step="0.25" value={item.servings}
                          onChange={e=>updateServings(mi,fi,e.target.value)}
                          style={{width:46,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 6px',color:C.white,fontSize:12,outline:'none',textAlign:'center'}}/>
                        <button onClick={()=>removeFood(mi,fi)}
                          style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:16,padding:'0 2px'}}>×</button>
                      </div>
                    </div>
                  ):(
                    // Client: view only row
                    <ReadOnlyFoodRow key={fi} item={item}/>
                  )
                ))}

                {/* Client: adjustment note per meal */}
                {isClient&&(
                  <div style={{marginTop:8}}>
                    <textarea placeholder="Note any adjustments you made to this meal this week…"
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:44,fontFamily:'inherit'}}/>
                  </div>
                )}
              </Card>
            )
          })}

          {isCoach&&(
            <button onClick={async()=>{await dbInsert('diet_plans',{client_id:KNOWN_USERS['client@eden.io']?.uuid,coach_id:KNOWN_USERS['coach@eden.io']?.uuid,protocol,high_day_meals:JSON.stringify(highMeals),low_day_meals:JSON.stringify(lowMeals),targets:JSON.stringify(targets),updated_at:new Date().toISOString()});alert('Diet plan saved!')}}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
              Save Diet Plan
            </button>
          )}

          {/* Recipe upsell for clients */}
          {isClient&&(
            <div style={{background:'linear-gradient(135deg,#1a1200,#2a1800)',border:`1px solid ${C.gold}33`,borderRadius:12,padding:16,marginBottom:24}}>
              <div style={{fontWeight:700,fontSize:13,color:C.white,marginBottom:5}}>🍽 Eden Recipe Book</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Unlock 100+ clean eating recipes aligned with your protocol.</div>
              <button style={{background:C.gold,border:'none',borderRadius:8,padding:'9px 18px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Unlock Recipe Book</button>
            </div>
          )}
        </div>
      )}

      {/* ══ CALCULATOR — coach only ═══════════════════════════ */}
      {tab==='calculator'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {isClient&&(
            <div style={{padding:40,textAlign:'center'}}>
              <div style={{fontSize:32,marginBottom:12}}>🔢</div>
              <div style={{fontSize:15,fontWeight:700,color:C.white,marginBottom:6}}>Macro Calculator</div>
              <div style={{fontSize:13,color:C.muted}}>Your targets are calculated by your coach and applied to your meal plan automatically.</div>
            </div>
          )}
          {isCoach&&(
            <>
              <Card sx={{marginBottom:12}}>
                <Lbl t="Client Data"/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <Sel label="Gender" value={calc.gender} onChange={v=>setCalc(c=>({...c,gender:v}))} options={['Male','Female']}/>
                  <Inp label="Bodyweight (lbs)" value={calc.weight} onChange={v=>setCalc(c=>({...c,weight:v}))} placeholder="e.g. 185" type="number"/>
                  <Inp label="Height (inches)" value={calc.height} onChange={v=>setCalc(c=>({...c,height:v}))} placeholder="e.g. 70" type="number"/>
                  <Inp label="Age" value={calc.age} onChange={v=>setCalc(c=>({...c,age:v}))} placeholder="e.g. 32" type="number"/>
                  <Inp label="Body Fat %" value={calc.bodyfat} onChange={v=>setCalc(c=>({...c,bodyfat:v}))} placeholder="e.g. 18" type="number"/>
                </div>
              </Card>
              <Card sx={{marginBottom:12}}>
                <Lbl t="Activity & Goal"/>
                <Sel label="Activity Level" value={calc.activity} onChange={v=>setCalc(c=>({...c,activity:v}))} options={ACTIVITY_LEVELS.map(a=>a.label)}/>
                <Sel label="Deficit / Surplus" value={calc.ds} onChange={v=>setCalc(c=>({...c,ds:v}))} options={DEFICIT_SURPLUS.map(d=>d.label)}/>
              </Card>
              <Card sx={{marginBottom:12}}>
                <Lbl t="Macro Split"/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  {[['protPct','Protein %','#4FD89A'],['fatPct','Fat %','#f06060'],['carbPct','Carb %','#6FB8E8']].map(([k,l,col])=>(
                    <div key={k}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{l}</div>
                      <input type="number" min="0" max="100" value={calc[k]} onChange={e=>setCalc(c=>({...c,[k]:parseInt(e.target.value)||0}))}
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:col,fontSize:16,fontWeight:700,outline:'none',textAlign:'center',boxSizing:'border-box'}}/>
                    </div>
                  ))}
                </div>
                <div style={{textAlign:'center',marginTop:8,fontSize:11,color:(calc.protPct+calc.fatPct+calc.carbPct)===100?C.success:C.danger}}>
                  Total: {calc.protPct+calc.fatPct+calc.carbPct}% {(calc.protPct+calc.fatPct+calc.carbPct)===100?'✓ Perfect':'← must equal 100%'}
                </div>
              </Card>
              <button onClick={runCalc}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:12}}>
                Calculate Macros
              </button>
              {results&&(
                <Card sx={{marginBottom:20}}>
                  <Lbl t="Results"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                    {[['BMR',results.bmr+' cal'],['Maintenance',results.maintenance+' cal'],['Calorie Target',results.cal+' cal'],['Protein',results.pro+'g'],['Fats',results.fat+'g'],['Carbs',results.carb+'g']].map(([l,v])=>(
                      <div key={l} style={{background:C.surface,borderRadius:8,padding:'10px 12px'}}>
                        <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:16,fontWeight:700,color:C.gold}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setTab('plan')}
                    style={{width:'100%',background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:10,color:C.gold,fontWeight:700,fontSize:12,cursor:'pointer'}}>
                    Apply to Meal Plan →
                  </button>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ CHECK-IN HUB ═══════════════════════════════════════ */}
      {tab==='checkin'&&(
        isCoach ? (

          /* ── COACH VIEW: full check-in hub ─────────────────── */
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Toolbar */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.surface}}>
              <div>
                <span style={{fontSize:14,fontWeight:800,color:C.white}}>Check-In Hub</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:10}}>{localCheckins.length} submissions · {coachOnlyUpdates.length} coach updates</span>
              </div>
              <button onClick={()=>setShowAddForm(v=>!v)}
                style={{background:showAddForm?`${C.gold}33`:`${C.gold}18`,border:`1px solid ${C.gold}55`,borderRadius:8,padding:'7px 14px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {showAddForm?'✕ Cancel':'＋ Coach Update'}
              </button>
            </div>


            {/* Add standalone coach update form */}
            {showAddForm&&(
              <div style={{background:'#111a00',borderBottom:`1px solid ${C.gold}33`,padding:16,flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:.8,textTransform:'uppercase',marginBottom:12}}>New Coach Update — visible to client in their Check-In tab</div>
                <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Date</div>
                    <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Loom URL (optional)</div>
                    <input value={newLoom} onChange={e=>setNewLoom(e.target.value)} placeholder="https://loom.com/share/..."
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Notes / Update</div>
                  <textarea value={newNote} onChange={e=>setNewNote(e.target.value)} rows={3}
                    placeholder="Protocol adjustment, midweek observation, general coaching note…"
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                </div>
                <button onClick={addCoachUpdate}
                  style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,color:C.black,fontSize:13,cursor:'pointer'}}>
                  Post Update
                </button>
              </div>
            )}

            {/* Body */}
            <div style={{flex:1,overflowY:'auto',padding:16}}>

              {/* All 9 charts */}
              <CheckInCharts checkins={localCheckins}/>

              {/* Combined sorted list: client check-ins + coach-only updates */}
              {[
                ...localCheckins.map((ci,i)=>({...ci,_type:'checkin',_idx:i})),
                ...coachOnlyUpdates.map(u=>({...u,_type:'coach'}))
              ].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(item=>{

                /* ── Coach-only standalone update ── */
                if(item._type==='coach'){
                  const loomId=item.loom?.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)?.[1]
                  return (
                    <div key={`cu-${item.id}`} style={{background:'#111a00',border:`1.5px solid ${C.gold}44`,borderRadius:12,padding:16,marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:9,fontWeight:700,background:`${C.gold}22`,color:C.gold,padding:'2px 8px',borderRadius:20,letterSpacing:.5,textTransform:'uppercase'}}>Coach Update</span>
                          <span style={{fontSize:12,fontWeight:700,color:C.white}}>{item.date}</span>
                        </div>
                        <button onClick={()=>setCoachOnlyUpdates(p=>p.filter(u=>u.id!==item.id))}
                          style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:18,lineHeight:1,padding:'0 4px'}}>×</button>
                      </div>
                      {item.note&&<p style={{fontSize:13,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap',margin:'0 0 10px'}}>{item.note}</p>}
                      {loomId?(
                        <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:8,overflow:'hidden'}}>
                          <iframe src={`https://www.loom.com/embed/${loomId}`} allowFullScreen title="Loom"
                            style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                        </div>
                      ):item.loom?(
                        <a href={item.loom} target="_blank" rel="noreferrer"
                          style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:12,fontWeight:700,textDecoration:'none'}}>
                          🎥 Watch Loom
                        </a>
                      ):null}
                    </div>
                  )
                }

                /* ── Client check-in card ── */
                const ci=item; const idx=item._idx
                const isExpanded=expandedCi===idx
                const isEditing=editingCi===idx
                const saved=localCheckins[idx]
                return (
                  <div key={`ci-${idx}`} style={{background:C.card,border:`1px solid ${isExpanded?C.gold+'55':C.border}`,borderRadius:12,marginBottom:12,overflow:'hidden',transition:'border-color .2s'}}>

                    {/* Collapsed header */}
                    <button onClick={()=>{setExpandedCi(isExpanded?null:idx);setEditingCi(null)}}
                      style={{width:'100%',background:'none',border:'none',padding:'12px 16px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontSize:13,fontWeight:700,color:isExpanded?C.gold:C.white}}>{ci.date}</span>
                          {ci.compliance!=null&&(
                            <span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,
                              background:ci.compliance>=90?`${C.success}22`:ci.compliance>=75?`${C.gold}22`:'#ff444422',
                              color:ci.compliance>=90?C.success:ci.compliance>=75?C.gold:'#ff6b6b'}}>
                              {ci.compliance}% compliance
                            </span>
                          )}
                          {ci.mood&&<span style={{fontSize:11,color:C.muted}}>{ci.mood}</span>}
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                          ⚖ {ci.weight} lbs&nbsp;·&nbsp;
                          {[['E',ci.energy],['Sl',ci.sleep],['Bl',ci.bloating]].filter(([,v])=>v!=null).map(([l,v])=>(
                            <span key={l} style={{color:scoreColor(v),fontWeight:700,marginRight:8}}>{l}:{v}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                        {saved?.coachNotes&&<span style={{fontSize:9,color:C.success,fontWeight:700}}>✓ Reviewed</span>}
                        <span style={{color:C.muted,fontSize:12}}>{isExpanded?'▲':'▼'}</span>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded&&(
                      <div style={{borderTop:`1px solid ${C.border}`,padding:16}}>

                        {/* Score grid */}
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(76px,1fr))',gap:7,marginBottom:14}}>
                          {[['Energy',ci.energy],['Sleep',ci.sleep],['Bloating',ci.bloating],
                            ['Brain Fog',ci.brainFog],['Sex Drive',ci.sexDrive],
                            ['Hunger',ci.hunger?10-ci.hunger:null],
                            ['Stress',ci.stress?10-ci.stress:null],
                          ].map(([l,v])=>(
                            <div key={l} style={{background:C.surface,border:`1px solid ${v!=null?scoreColor(v)+'44':C.border}`,borderRadius:10,padding:'9px 6px',textAlign:'center'}}>
                              <div style={{fontSize:7,color:C.muted,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',marginBottom:4,lineHeight:1.3}}>{l}</div>
                              {v!=null
                                ?<><div style={{fontSize:19,fontWeight:800,color:scoreColor(v),lineHeight:1}}>{v}</div><div style={{fontSize:7,color:C.muted}}>/10</div></>
                                :<div style={{fontSize:14,color:C.border}}>—</div>
                              }
                            </div>
                          ))}
                        </div>

                        {/* Vitals */}
                        {(ci.weight||ci.temp||ci.heartRate||ci.hrv||ci.steps||ci.bloodPressure)&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>Vitals</div>
                            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                              {ci.weight&&<span style={{fontSize:12,color:C.muted}}>⚖️ {ci.weight} lbs</span>}
                              {ci.temp&&<span style={{fontSize:12,color:C.muted}}>🌡️ {ci.temp}°F</span>}
                              {ci.heartRate&&<span style={{fontSize:12,color:C.muted}}>❤️ {ci.heartRate} BPM</span>}
                              {ci.hrv&&<span style={{fontSize:12,color:C.muted}}>📡 HRV {ci.hrv}</span>}
                              {ci.steps&&<span style={{fontSize:12,color:C.muted}}>👟 {ci.steps} steps</span>}
                              {ci.bloodPressure&&<span style={{fontSize:12,color:C.muted}}>🩺 {ci.bloodPressure}</span>}
                            </div>
                          </div>
                        )}

                        {/* Sleep */}
                        {(ci.sleepWindow||ci.sleepCycles||ci.sleepDisruption)&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🌙 Sleep</div>
                            <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:ci.sleepDisruption?8:0}}>
                              {ci.sleepWindow&&<span style={{fontSize:12,color:C.white}}>🕙 {ci.sleepWindow}</span>}
                              {ci.sleepCycles&&<span style={{fontSize:12,color:C.white}}>🔄 {ci.sleepCycles}</span>}
                            </div>
                            {ci.sleepDisruption&&(
                              <div style={{fontSize:11,color:C.muted,fontStyle:'italic',background:C.black,borderRadius:7,padding:'7px 10px'}}>{ci.sleepDisruption}</div>
                            )}
                          </div>
                        )}

                        {/* Digestion */}
                        {(ci.bowelCount||ci.bowelType)&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🫁 Digestion</div>
                            <div style={{display:'flex',gap:14}}>
                              {ci.bowelCount&&<span style={{fontSize:12,color:C.white}}>{ci.bowelCount}x daily</span>}
                              {ci.bowelType&&<span style={{fontSize:12,color:C.white}}>{ci.bowelType}</span>}
                            </div>
                          </div>
                        )}

                        {/* Client notes */}
                        {ci.clientNotes&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Client Notes</div>
                            <div style={{fontSize:12,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{ci.clientNotes}</div>
                          </div>
                        )}

                        {/* Habit compliance */}
                        {ci.habits&&Object.keys(ci.habits).length>0&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                              <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>✅ Habits This Week</div>
                              {ci.habitPct!=null&&(
                                <span style={{fontSize:11,fontWeight:700,color:ci.habitPct>=85?C.success:ci.habitPct>=60?C.gold:C.danger}}>{ci.habitPct}%</span>
                              )}
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px'}}>
                              {Object.entries(ci.habits).map(([id,count])=>{
                                const h=MASTER_HABITS.find(x=>x.id===id)
                                if(!h) return null
                                const pct=Math.min(100,Math.round(count/h.defaultTarget*100))
                                const col=pct>=85?C.success:pct>=60?C.gold:C.danger
                                return (
                                  <div key={id}>
                                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                                      <span style={{fontSize:9,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'80%'}}>{h.name}</span>
                                      <span style={{fontSize:9,fontWeight:700,color:col,flexShrink:0}}>{count}/{h.defaultTarget}</span>
                                    </div>
                                    <div style={{height:3,borderRadius:2,background:C.border}}>
                                      <div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:col}}/>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── Coach Response ─────────────────────── */}
                        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                            <span style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase'}}>💬 Coach Response</span>
                            {!isEditing&&(
                              <button onClick={()=>{setEditingCi(idx);setDraftNote(saved?.coachNotes||'');setDraftLoom(saved?.coachLoom||'')}}
                                style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                                ✏ {saved?.coachNotes?'Edit':'Add feedback'}
                              </button>
                            )}
                          </div>

                          {isEditing?(
                            <div>
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Notes for Client</div>
                                <textarea value={draftNote} onChange={e=>setDraftNote(e.target.value)} rows={4}
                                  placeholder="Great progress this week! Let's adjust the sleep window…"
                                  style={{width:'100%',background:C.black,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                              </div>
                              <div style={{marginBottom:12}}>
                                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Loom URL <span style={{fontWeight:400,textTransform:'none',fontSize:9,color:C.dim}}>(optional)</span></div>
                                <input value={draftLoom} onChange={e=>setDraftLoom(e.target.value)} placeholder="https://loom.com/share/..."
                                  style={{width:'100%',background:C.black,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                              </div>
                              {(()=>{const id=draftLoom.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)?.[1];return id?(
                                <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:8,overflow:'hidden',marginBottom:12}}>
                                  <iframe src={`https://www.loom.com/embed/${id}`} allowFullScreen title="Loom preview"
                                    style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                                </div>
                              ):null})()}
                              <div style={{display:'flex',gap:8}}>
                                <button onClick={()=>{
                                  setLocalCheckins(p=>p.map((r,i)=>i===idx?{...r,coachNotes:draftNote.trim(),coachLoom:draftLoom.trim()}:r))
                                  setEditingCi(null)
                                }} style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,color:C.black,fontSize:13,cursor:'pointer'}}>
                                  Save
                                </button>
                                <button onClick={()=>setEditingCi(null)}
                                  style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 16px',color:C.muted,fontSize:13,cursor:'pointer'}}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ):(
                            saved?.coachNotes?(
                              <div>
                                <p style={{fontSize:13,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap',margin:'0 0 10px'}}>{saved.coachNotes}</p>
                                {(()=>{const id=saved?.coachLoom?.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)?.[1];return id?(
                                  <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:8,overflow:'hidden'}}>
                                    <iframe src={`https://www.loom.com/embed/${id}`} allowFullScreen title="Loom"
                                      style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                                  </div>
                                ):saved?.coachLoom?(
                                  <a href={saved.coachLoom} target="_blank" rel="noreferrer"
                                    style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:12,fontWeight:700,textDecoration:'none'}}>
                                    🎥 Watch Loom Review
                                  </a>
                                ):null})()}
                              </div>
                            ):(
                              <p style={{fontSize:12,color:C.muted,fontStyle:'italic',margin:0}}>No response yet — click "Add feedback" above.</p>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {localCheckins.length===0&&coachOnlyUpdates.length===0&&(
                <div style={{textAlign:'center',padding:48,color:C.muted}}>
                  <div style={{fontSize:36,marginBottom:12}}>📋</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:6}}>No check-ins yet</div>
                  <div style={{fontSize:11}}>Client check-ins will appear here once submitted. Use "+ Coach Update" to add a standalone note anytime.</div>
                </div>
              )}
            </div>
          </div>

        ) : (

          /* ── CLIENT VIEW ────────────────────────────────────── */
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Tab switcher */}
            <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.surface}}>
              {[['history','📋 History & Feedback'],['photos','📸 Photos'],['submit','📝 Submit Check-In']].map(([k,l])=>(
                <button key={k} onClick={()=>setClientViewTab(k)}
                  style={{flex:1,background:'none',border:'none',borderBottom:`2px solid ${clientViewTab===k?C.gold:'transparent'}`,
                    padding:'12px 8px',color:clientViewTab===k?C.gold:C.muted,fontSize:12,fontWeight:clientViewTab===k?700:400,cursor:'pointer'}}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{flex:1,overflowY:'auto',padding:16}}>

              {/* ─── History tab ─── */}
              {clientViewTab==='history'&&(<>

                {/* All 9 charts */}
                <CheckInCharts checkins={localCheckins}/>

                {/* Check-in history cards + coach updates (client view) */}
                {[
                  ...localCheckins.map((ci,idx)=>({...ci,_type:'checkin',_idx:idx})),
                  ...coachOnlyUpdates.map(u=>({...u,_type:'coach'}))
                ].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(item=>{

                  /* Coach-only update card */
                  if(item._type==='coach'){
                    const loomId=item.loom?.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)?.[1]
                    return (
                      <div key={`cu-${item.id}`} style={{background:'#111a00',border:`1.5px solid ${C.gold}44`,borderRadius:12,padding:16,marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                          <span style={{fontSize:9,fontWeight:700,background:`${C.gold}22`,color:C.gold,padding:'2px 8px',borderRadius:20,letterSpacing:.5,textTransform:'uppercase'}}>📝 Coach Update</span>
                          <span style={{fontSize:12,fontWeight:700,color:C.white}}>{item.date}</span>
                        </div>
                        {item.note&&<p style={{fontSize:13,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap',margin:'0 0 10px'}}>{item.note}</p>}
                        {loomId?(
                          <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:8,overflow:'hidden'}}>
                            <iframe src={`https://www.loom.com/embed/${loomId}`} allowFullScreen title="Coach Loom"
                              style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                          </div>
                        ):item.loom?(
                          <a href={item.loom} target="_blank" rel="noreferrer"
                            style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:12,fontWeight:700,textDecoration:'none'}}>
                            🎥 Watch Loom
                          </a>
                        ):null}
                      </div>
                    )
                  }

                  /* Client check-in card */
                  const ci=item; const idx=item._idx
                  const isExpanded=expandedCi===idx
                  const loomId=ci.coachLoom?.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)?.[1]
                  return (
                    <div key={idx} style={{background:C.card,border:`1px solid ${isExpanded?C.gold+'55':C.border}`,borderRadius:12,marginBottom:12,overflow:'hidden'}}>
                      <button onClick={()=>setExpandedCi(isExpanded?null:idx)}
                        style={{width:'100%',background:'none',border:'none',padding:'12px 16px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <span style={{fontSize:13,fontWeight:700,color:isExpanded?C.gold:C.white}}>{ci.date}</span>
                          <span style={{fontSize:11,color:C.muted,marginLeft:10}}>⚖ {ci.weight} lbs</span>
                          {ci.compliance!=null&&<span style={{fontSize:10,color:C.muted,marginLeft:8}}>{ci.compliance}% compliance</span>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                          {ci.coachNotes&&<span style={{fontSize:9,color:C.gold,fontWeight:700}}>💬 Coach feedback</span>}
                          <span style={{color:C.muted,fontSize:12}}>{isExpanded?'▲':'▼'}</span>
                        </div>
                      </button>

                      {isExpanded&&(
                        <div style={{borderTop:`1px solid ${C.border}`,padding:16}}>
                          {/* Score grid */}
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(76px,1fr))',gap:7,marginBottom:14}}>
                            {[['Energy',ci.energy],['Sleep',ci.sleep],['Bloating',ci.bloating],
                              ['Brain Fog',ci.brainFog],['Sex Drive',ci.sexDrive],
                              ['Hunger',ci.hunger?10-ci.hunger:null],
                              ['Stress',ci.stress?10-ci.stress:null],
                            ].map(([l,v])=>(
                              <div key={l} style={{background:C.surface,border:`1px solid ${v!=null?scoreColor(v)+'44':C.border}`,borderRadius:10,padding:'9px 6px',textAlign:'center'}}>
                                <div style={{fontSize:7,color:C.muted,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',marginBottom:4,lineHeight:1.3}}>{l}</div>
                                {v!=null?<><div style={{fontSize:19,fontWeight:800,color:scoreColor(v),lineHeight:1}}>{v}</div><div style={{fontSize:7,color:C.muted}}>/10</div></>:<div style={{fontSize:14,color:C.border}}>—</div>}
                              </div>
                            ))}
                          </div>

                          {/* Vitals row */}
                          <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:12}}>
                            {ci.weight&&<span style={{fontSize:12,color:C.muted}}>⚖️ {ci.weight} lbs</span>}
                            {ci.temp&&<span style={{fontSize:12,color:C.muted}}>🌡️ {ci.temp}°F</span>}
                            {ci.heartRate&&<span style={{fontSize:12,color:C.muted}}>❤️ {ci.heartRate} BPM</span>}
                            {ci.hrv&&<span style={{fontSize:12,color:C.muted}}>📡 HRV {ci.hrv}</span>}
                            {ci.steps&&<span style={{fontSize:12,color:C.muted}}>👟 {ci.steps} steps</span>}
                          </div>

                          {/* Client notes */}
                          {ci.clientNotes&&(
                            <div style={{background:C.surface,borderRadius:8,padding:'10px 12px',marginBottom:10}}>
                              <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Your Notes</div>
                              <div style={{fontSize:12,color:C.white,lineHeight:1.7}}>{ci.clientNotes}</div>
                            </div>
                          )}

                          {/* Habit compliance */}
                          {ci.habits&&Object.keys(ci.habits).length>0&&(
                            <div style={{background:C.surface,borderRadius:8,padding:'10px 12px',marginBottom:10}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                                <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>✅ Habits This Week</div>
                                {ci.habitPct!=null&&(
                                  <span style={{fontSize:11,fontWeight:700,color:ci.habitPct>=85?C.success:ci.habitPct>=60?C.gold:C.danger}}>{ci.habitPct}%</span>
                                )}
                              </div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px'}}>
                                {Object.entries(ci.habits).map(([id,count])=>{
                                  const h=MASTER_HABITS.find(x=>x.id===id)
                                  if(!h) return null
                                  const pct=Math.min(100,Math.round(count/h.defaultTarget*100))
                                  const col=pct>=85?C.success:pct>=60?C.gold:C.danger
                                  return (
                                    <div key={id}>
                                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                                        <span style={{fontSize:9,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'80%'}}>{h.name}</span>
                                        <span style={{fontSize:9,fontWeight:700,color:col,flexShrink:0}}>{count}/{h.defaultTarget}</span>
                                      </div>
                                      <div style={{height:3,borderRadius:2,background:C.border}}>
                                        <div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:col}}/>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Coach response — read-only */}
                          {ci.coachNotes?(
                            <div style={{background:`${C.gold}0d`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:'12px 14px'}}>
                              <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>💬 Coach Marcus</div>
                              <p style={{fontSize:13,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap',margin:'0 0 10px'}}>{ci.coachNotes}</p>
                              {loomId?(
                                <div style={{position:'relative',paddingBottom:'56.25%',borderRadius:8,overflow:'hidden'}}>
                                  <iframe src={`https://www.loom.com/embed/${loomId}`} allowFullScreen title="Coach Loom"
                                    style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                                </div>
                              ):ci.coachLoom?(
                                <a href={ci.coachLoom} target="_blank" rel="noreferrer"
                                  style={{display:'inline-flex',alignItems:'center',gap:6,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:8,padding:'6px 14px',color:C.gold,fontSize:12,fontWeight:700,textDecoration:'none'}}>
                                  🎥 Watch Coach Review
                                </a>
                              ):null}
                            </div>
                          ):(
                            <div style={{background:C.surface,borderRadius:10,padding:'10px 12px',fontSize:12,color:C.muted,fontStyle:'italic'}}>
                              Awaiting coach feedback…
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {localCheckins.length===0&&(
                  <div style={{textAlign:'center',padding:48,color:C.muted}}>
                    <div style={{fontSize:36,marginBottom:12}}>📋</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:6}}>No check-ins yet</div>
                    <div style={{fontSize:11}}>Submit your first check-in and your coach will respond within 48 hours.</div>
                  </div>
                )}
              </>)}

              {/* ─── Photos tab ─── */}
              {clientViewTab==='photos'&&(<>
                <input type="file" ref={photoFileRef} accept="image/*" style={{display:'none'}} onChange={uploadProgressPhoto}/>
                <button onClick={()=>photoFileRef.current?.click()} disabled={photoUploading}
                  style={{width:'100%',background:'none',border:`2px dashed ${C.gold}66`,borderRadius:12,
                    padding:'18px',color:C.gold,fontSize:13,fontWeight:700,
                    cursor:photoUploading?'not-allowed':'pointer',marginBottom:6,
                    display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                    opacity:photoUploading?0.5:1}}>
                  {photoUploading?'⏳ Uploading…':'📸 Upload Progress Photo'}
                </button>
                <div style={{fontSize:11,color:C.muted,textAlign:'center',marginBottom:20}}>
                  Upload front, side, and back — your coach can see these
                </div>

                {clientPhotos===null?(
                  <div style={{textAlign:'center',padding:40,color:C.muted}}>Loading…</div>
                ):clientPhotos.length===0?(
                  <div style={{textAlign:'center',padding:40}}>
                    <div style={{fontSize:40,marginBottom:12}}>📸</div>
                    <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:6}}>No photos yet</div>
                    <div style={{fontSize:12,color:C.muted}}>Tap the button above to upload your first progress photos.</div>
                  </div>
                ):(()=>{
                  const byWeek={}
                  for(const p of clientPhotos){
                    const k=p.week_label||'Uncategorized'
                    if(!byWeek[k]) byWeek[k]=[]
                    byWeek[k].push(p)
                  }
                  return Object.entries(byWeek).map(([week,wPhotos])=>(
                    <div key={week} style={{marginBottom:22}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:C.white}}>{week}</div>
                          <div style={{fontSize:11,color:C.muted}}>
                            {wPhotos[0]?.taken_at?new Date(wPhotos[0].taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
                          </div>
                        </div>
                        <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,background:`${C.gold}22`,color:C.gold}}>
                          {wPhotos.length} photo{wPhotos.length!==1?'s':''}
                        </span>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                        {wPhotos.map((p,i)=>(
                          p.photo_url?(
                            <a key={i} href={p.photo_url} target="_blank" rel="noreferrer" style={{display:'block'}}>
                              <img src={p.photo_url} alt={`${week} photo ${i+1}`}
                                style={{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:10,display:'block',border:`1px solid ${C.border}`}}/>
                            </a>
                          ):(
                            <div key={i} style={{aspectRatio:'3/4',background:C.surface,border:`1px solid ${C.border}`,
                              borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4}}>
                              <span style={{fontSize:22}}>📸</span>
                              <span style={{fontSize:9,color:C.muted}}>{p.notes||'Photo'}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </>)}

              {/* ─── Submit tab ─── */}
              {clientViewTab==='submit'&&(<>
                <div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderLeft:`3px solid ${C.danger}`,borderRadius:9,padding:'10px 13px',marginBottom:12,fontSize:12,color:C.danger}}>
                  ⚠️ All weekly updates MUST be in before 9 AM CST on your check-in day. Wake up on empty stomach. Include fasted weight + photos.
                </div>
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Vitals"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <Inp label="Body Weight (lbs)" value={ci.weight} onChange={setC('weight')} placeholder="e.g. 172.4" type="number"/>
                    <Inp label="Body Temperature (°F)" value={ci.temp} onChange={setC('temp')} placeholder="e.g. 97.8" type="number"/>
                    <Inp label="Avg Daily Steps" value={ci.steps} onChange={setC('steps')} placeholder="e.g. 9500" type="number"/>
                    <Inp label="Blood Pressure" value={ci.bp} onChange={setC('bp')} placeholder="e.g. 120/80"/>
                    <Inp label="Morning Heart Rate (BPM)" value={ci.heartRate} onChange={setC('heartRate')} placeholder="e.g. 58" type="number"/>
                    <Inp label="HRV" value={ci.hrv} onChange={setC('hrv')} placeholder="e.g. 72" type="number"/>
                  </div>
                </Card>
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Wellbeing Scales (1–10)"/>
                  {[
                    ['sleep',   'Sleep Quality', '1=awful · 10=perfect'],
                    ['bloating','Bloating',       '1=none · 10=extreme'],
                    ['brainFog','Brain Fog',      '1=none · 10=extreme'],
                    ['sexDrive','Sex Drive',      '1=low · 10=high'],
                    ['energy',  'Energy',         '1=awful · 10=perfect'],
                    ['hunger',  'Hunger',         '1=not hungry · 10=starving'],
                  ].map(([k,l,d])=>(
                    <div key={k} style={{marginBottom:13}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <div>
                          <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>{l}</span>
                          <span style={{fontSize:9,color:C.dim,marginLeft:8}}>{d}</span>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:C.gold}}>{ci[k]}/10</span>
                      </div>
                      <input type="range" min="1" max="10" value={ci[k]} onChange={e=>setC(k)(e.target.value)} style={{width:'100%',accentColor:C.gold}}/>
                    </div>
                  ))}
                </Card>
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Sleep & Digestion"/>
                  <Inp label="Sleep window (falling asleep / waking)" value={ci.wakeTime} onChange={setC('wakeTime')} placeholder="e.g. Asleep 10pm, wake 5am"/>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Sleep Disruption Notes</div>
                    <textarea value={ci.sleepNotes} onChange={e=>setC('sleepNotes')(e.target.value)} placeholder="Describe disruptions, times, duration…"
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:50,fontFamily:'inherit'}}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <Inp label="Avg Daily Bowel Movements" value={ci.bowelCount} onChange={setC('bowelCount')} placeholder="e.g. 2" type="number"/>
                    <Sel label="Stool Consistency" value={ci.bowelType||''} onChange={setC('bowelType')} options={['','Well formed','Loose','Diarrhea','Constipated','Mixed']}/>
                  </div>
                </Card>
                <Card sx={{marginBottom:12}}>
                  <Lbl t="For Women Only"/>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Cycle Notes</div>
                    <textarea value={ci.cycleNotes} onChange={e=>setC('cycleNotes')(e.target.value)}
                      placeholder="Cycle length, mental symptoms, bloating, PMS, flow (heavy/light)…"
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:50,fontFamily:'inherit'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>Period Pain Level</span>
                    <span style={{fontSize:13,fontWeight:700,color:C.gold}}>{ci.cyclePain}/10</span>
                  </div>
                  <input type="range" min="1" max="10" value={ci.cyclePain} onChange={e=>setC('cyclePain')(e.target.value)} style={{width:'100%',accentColor:C.gold}}/>
                </Card>
                {/* Habits this week */}
                {assignedHabits.length>0&&(
                  <Card sx={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <Lbl t="Habits This Week"/>
                      <span style={{fontSize:13,fontWeight:700,color:habitScore>=80?C.success:habitScore>=50?C.gold:C.danger}}>{habitScore}%</span>
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginBottom:10}}>How many times did you complete each habit since your last check-in?</div>
                    {assignedHabits.map(h=>{
                      const count=habitCounts[h.id]||0
                      const pct=Math.round(count/h.target*100)
                      const col=pct>=85?C.success:pct>=60?C.gold:C.danger
                      return (
                        <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:`1px solid ${C.border}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,color:C.white,fontWeight:500,marginBottom:4}}>{h.name}</div>
                            <div style={{height:3,borderRadius:2,background:C.border}}>
                              <div style={{width:`${Math.min(100,pct)}%`,height:'100%',borderRadius:2,background:col,transition:'width .2s'}}/>
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                            <button onClick={()=>setHabitCount(h.id,count-1)} disabled={count<=0}
                              style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count<=0?.4:1}}>−</button>
                            <div style={{width:32,textAlign:'center',fontSize:14,fontWeight:700,color:count>=h.target?C.success:C.white}}>{count}</div>
                            <button onClick={()=>setHabitCount(h.id,count+1)} disabled={count>=7}
                              style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count>=7?.4:1}}>+</button>
                            <span style={{fontSize:10,color:C.muted,width:20}}>/{h.target}</span>
                          </div>
                        </div>
                      )
                    })}
                  </Card>
                )}

                <Card sx={{marginBottom:12}}>
                  <Lbl t="Additional Notes"/>
                  <textarea value={ci.notes} onChange={e=>setC('notes')(e.target.value)}
                    placeholder="Deviations from plan, how long on current protocol, anything your coach should know…"
                    rows={4}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                  <div style={{marginTop:10,padding:'8px 10px',background:`${C.gold}11`,border:`1px solid ${C.gold}33`,borderRadius:8,fontSize:11,color:C.muted}}>
                    📸 Upload progress photos (front, side, back) in the Photos tab above
                  </div>
                </Card>
                <button onClick={async()=>{
                  await dbInsert('weekly_checkins',{client_id:KNOWN_USERS['client@eden.io']?.uuid,coach_id:KNOWN_USERS['coach@eden.io']?.uuid,...ci,habits:JSON.stringify(habitCounts),habitPct:habitScore,submitted_at:new Date().toISOString()})
                  alert('Check-in submitted! Your coach will review within 48 hours.')
                }} style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:24}}>
                  Submit Weekly Check-In
                </button>
              </>)}
            </div>
          </div>
        )
      )}

      {/* ══ HABITS — assigned by coach, logged by client ═════ */}
      {tab==='habits'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {/* Coach: assign habits */}
          {isCoach&&(
            <Card sx={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <Lbl t="Assigned Habits for This Client"/>
                <button onClick={()=>setShowHabitPicker(true)}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  + Assign Habits
                </button>
              </div>
              {assignedHabits.map(h=>(
                <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderTop:`1px solid ${C.border}`}}>
                  <div style={{flex:1,fontSize:12,color:C.white}}>{h.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                    <span style={{fontSize:10,color:C.muted}}>Target:</span>
                    <input type="number" min="1" max="7" value={h.target}
                      onChange={e=>setAssignedHabits(p=>p.map(x=>x.id===h.id?{...x,target:parseInt(e.target.value)||1}:x))}
                      style={{width:40,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 6px',color:C.gold,fontSize:12,outline:'none',textAlign:'center'}}/>
                    <span style={{fontSize:10,color:C.muted}}>x/wk</span>
                    <button onClick={()=>setAssignedHabits(p=>p.filter(x=>x.id!==h.id))}
                      style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:15,padding:'0 2px'}}>×</button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Habit frequency tracker — both coach and client see, client fills in */}
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="This Week — Times Completed"/>
              <span style={{fontSize:16,fontWeight:700,color:habitScore>=80?C.success:habitScore>=50?C.gold:C.danger}}>{habitScore}%</span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:12,lineHeight:1.5}}>
              {isClient?'Enter how many times you completed each habit since your last check-in (0–7)':'Client habit completion this week'}
            </div>
            {assignedHabits.map(h=>{
              const count=habitCounts[h.id]||0
              const pct=Math.round(count/h.target*100)
              return (
                <div key={h.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderTop:`1px solid ${C.border}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:C.white,fontWeight:500}}>{h.name}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Target: {h.target}x/week</div>
                    <div style={{height:3,borderRadius:2,background:C.border,marginTop:5}}>
                      <div style={{width:`${Math.min(100,pct)}%`,height:'100%',borderRadius:2,background:pct>=100?C.success:pct>=60?C.gold:C.danger,transition:'width .3s'}}/>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                    {/* Client can adjust, coach sees read-only count */}
                    {isClient?(
                      <>
                        <button onClick={()=>setHabitCount(h.id,count-1)} disabled={count<=0}
                          style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count<=0?.4:1}}>−</button>
                        <div style={{width:36,height:36,borderRadius:8,border:`1px solid ${count>=h.target?C.success:C.border}`,background:count>=h.target?`${C.success}22`:C.surface,display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <span style={{fontSize:16,fontWeight:700,color:count>=h.target?C.success:C.white}}>{count}</span>
                        </div>
                        <button onClick={()=>setHabitCount(h.id,count+1)} disabled={count>=7}
                          style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count>=7?.4:1}}>+</button>
                      </>
                    ):(
                      <div style={{width:56,height:36,borderRadius:8,border:`1px solid ${count>=h.target?C.success:C.border}`,background:count>=h.target?`${C.success}22`:C.surface,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span style={{fontSize:16,fontWeight:700,color:count>=h.target?C.success:C.muted}}>{count}/{h.target}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
          {isClient&&(
            <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:20}}>
              Save Habit Tracker
            </button>
          )}
        </div>
      )}

      {/* ══ SUPPLEMENTS ══════════════════════════════════════ */}
      {tab==='supplements'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>

          {/* Coach: full supplement builder */}
          {isCoach&&(
            <>
              <Card sx={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <Lbl t="Client Supplement Protocol"/>
                  <button onClick={()=>setShowSuppPicker(true)}
                    style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    + Add Supplements
                  </button>
                </div>
                {clientSupps.length===0&&(
                  <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'8px 0'}}>Click + Add Supplements to build this client's protocol</div>
                )}
                {clientSupps.map(s=>(
                  <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      <div>
                        <div style={{fontSize:13,color:C.white,fontWeight:600}}>{s.name}</div>
                        {s.category&&<div style={{fontSize:9,color:C.gold,fontWeight:700,letterSpacing:.8,marginTop:2}}>{s.category.toUpperCase()}</div>}
                      </div>
                      <button onClick={()=>removeSupp(s.id)}
                        style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0}}>×</button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div>
                        <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Dosage</div>
                        <input value={s.customDose||''} onChange={e=>updateSuppField(s.id,'customDose',e.target.value)}
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Directions</div>
                        <input value={s.customDir||''} onChange={e=>updateSuppField(s.id,'customDir',e.target.value)}
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    </div>
                    {s.code&&<div style={{marginTop:6,fontSize:10,color:C.muted}}>Code: <span style={{color:C.gold,fontWeight:700}}>{s.code}</span>{s.link&&<> · <a href={s.link} target="_blank" rel="noreferrer" style={{color:C.gold}}>Purchase →</a></>}</div>}
                  </div>
                ))}
                <div style={{marginTop:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Or Paste Custom Protocol</div>
                  <textarea value={customSuppText} onChange={e=>setCustomSuppText(e.target.value)}
                    placeholder="Paste or type any custom supplement instructions…"
                    rows={4}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                </div>
              </Card>

              {/* ── Rx Tracker ── */}
              <Card sx={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <Lbl t="Prescriptions / Medications"/>
                  {!showRxForm&&(
                    <button type="button" onClick={openRxForm}
                      style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      + Add Rx
                    </button>
                  )}
                </div>

                {/* ── Add Rx form ── */}
                {showRxForm&&(
                  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:12}}>New Prescription / Medication</div>

                    {/* Medication name */}
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:4}}>Medication Name *</div>
                      <input
                        value={rxName}
                        onChange={e => setRxName(e.target.value)}
                        placeholder="e.g. Testosterone Cypionate, Progesterone, T3…"
                        style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                      />
                    </div>

                    {/* Dose + start date */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:4}}>Starting Dose *</div>
                        <input
                          value={rxDose}
                          onChange={e => setRxDose(e.target.value)}
                          placeholder="e.g. 200mg/ml · 0.5ml"
                          style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                        />
                      </div>
                      <div>
                        <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:4}}>Start Date</div>
                        <input
                          type="date"
                          value={rxStartDate}
                          onChange={e => setRxStartDate(e.target.value)}
                          style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                        />
                      </div>
                    </div>

                    {/* Frequency / directions */}
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:4}}>Frequency / Directions</div>
                      <input
                        value={rxDirections}
                        onChange={e => setRxDirections(e.target.value)}
                        placeholder="e.g. 2x per week — Monday and Thursday"
                        style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                      />
                    </div>

                    {/* ── Taper schedule (inline, before saving) ── */}
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>Taper / Adjustment Schedule</div>
                        {!showTaperRow&&(
                          <button type="button" onClick={()=>setShowTaperRow(true)}
                            style={{background:'none',border:`1px dashed ${C.border}`,borderRadius:6,padding:'3px 9px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                            + Add Step
                          </button>
                        )}
                      </div>

                      {/* Draft tapers already added */}
                      {draftTapers.length===0&&!showTaperRow&&(
                        <div style={{fontSize:11,color:C.dim,fontStyle:'italic'}}>Optional — add dose changes, holds, or stops before saving.</div>
                      )}
                      {draftTapers.map(t=>(
                        <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
                          <div style={{width:7,height:7,borderRadius:4,background:C.gold,marginTop:5,flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:C.white,fontWeight:600}}>
                              {t.date} — <span style={{color:C.gold}}>{t.dose}</span>
                            </div>
                            {t.note&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{t.note}</div>}
                          </div>
                          <button type="button" onClick={()=>removeDraftTaper(t.id)}
                            style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:13,padding:'0 2px',flexShrink:0}}>×</button>
                        </div>
                      ))}

                      {/* Mini form for a new taper step */}
                      {showTaperRow&&(
                        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:6}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                            <div>
                              <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>Effective Date *</div>
                              <input type="date" value={tapDate} onChange={e=>setTapDate(e.target.value)}
                                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                            </div>
                            <div>
                              <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>New Dose *</div>
                              <input value={tapDose} onChange={e=>setTapDose(e.target.value)}
                                placeholder="e.g. 0.35ml, hold, stop"
                                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                            </div>
                          </div>
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>Note (optional)</div>
                            <input value={tapNote} onChange={e=>setTapNote(e.target.value)}
                              placeholder="e.g. Reducing due to elevated E2, recheck labs Aug 1"
                              style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                          </div>
                          <div style={{display:'flex',gap:8}}>
                            <button type="button" onClick={()=>{ setShowTaperRow(false); setTapDate(''); setTapDose(''); setTapNote('') }}
                              style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                              Cancel
                            </button>
                            <button type="button" onClick={addDraftTaperStep}
                              disabled={!tapDate.trim()||!tapDose.trim()}
                              style={{flex:2,background:tapDate.trim()&&tapDose.trim()?C.gold:'#555',border:'none',borderRadius:6,padding:'6px',fontWeight:700,color:C.black,fontSize:11,cursor:tapDate.trim()&&tapDose.trim()?'pointer':'default'}}>
                              Add Step
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Save / Cancel */}
                    <div style={{display:'flex',gap:8}}>
                      <button type="button" onClick={closeRxForm}
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:'10px',color:C.muted,fontSize:12,cursor:'pointer'}}>
                        Cancel
                      </button>
                      <button type="button" onClick={saveRx}
                        style={{flex:2,background:rxName.trim()&&rxDose.trim()?C.gold:'#444',border:'none',borderRadius:7,padding:'10px',fontWeight:800,color:C.black,fontSize:12,cursor:rxName.trim()&&rxDose.trim()?'pointer':'default'}}>
                        Save Rx
                      </button>
                    </div>
                  </div>
                )}

                {rxList.length===0&&!showRxForm&&(
                  <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'8px 0'}}>
                    Click + Add Rx to enter a prescription or medication with optional taper schedule.
                  </div>
                )}

                {/* ── Saved Rx entries ── */}
                {rxList.map(rx=>(
                  <div key={rx.id} style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:C.white}}>{rx.name}</div>
                        <div style={{fontSize:12,color:C.gold,marginTop:2}}>{rx.dose}</div>
                        {rx.directions&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{rx.directions}</div>}
                        {rx.startDate&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>
                          Started: {new Date(rx.startDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                        </div>}
                      </div>
                      <button type="button" onClick={()=>removeRx(rx.id)}
                        style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:16,padding:'0 4px',flexShrink:0}}>×</button>
                    </div>

                    {/* Taper timeline */}
                    {rx.tapers.length>0&&(
                      <div style={{marginLeft:10,marginBottom:8,borderLeft:`2px solid ${C.border}`,paddingLeft:10}}>
                        <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:6}}>Taper Schedule</div>
                        {rx.tapers.map(t=>(
                          <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:7}}>
                            <div style={{width:7,height:7,borderRadius:4,background:C.gold,marginTop:4,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,color:C.white,fontWeight:600}}>
                                {new Date(t.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} — <span style={{color:C.gold}}>{t.dose}</span>
                              </div>
                              {t.note&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{t.note}</div>}
                            </div>
                            <button type="button" onClick={()=>removeTaper(rx.id,t.id)}
                              style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:13,padding:'0 2px',flexShrink:0}}>×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add taper to existing entry */}
                    {editTaperFor===rx.id?(
                      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:6}}>
                        <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:8,textTransform:'uppercase',letterSpacing:.8}}>Add Taper / Adjustment Step</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>Effective Date *</div>
                            <input type="date" value={editTapDate} onChange={e=>setEditTapDate(e.target.value)}
                              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>New Dose *</div>
                            <input value={editTapDose} onChange={e=>setEditTapDose(e.target.value)}
                              placeholder="e.g. 0.35ml, hold, stop"
                              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                          </div>
                        </div>
                        <div style={{marginBottom:8}}>
                          <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>Note (optional)</div>
                          <input value={editTapNote} onChange={e=>setEditTapNote(e.target.value)}
                            placeholder="e.g. Reducing due to elevated E2, recheck labs Aug 1"
                            style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <button type="button" onClick={()=>setEditTaperFor(null)}
                            style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px',color:C.muted,fontSize:11,cursor:'pointer'}}>Cancel</button>
                          <button type="button" onClick={()=>saveEditTaper(rx.id)}
                            disabled={!editTapDate.trim()||!editTapDose.trim()}
                            style={{flex:2,background:editTapDate.trim()&&editTapDose.trim()?C.gold:'#555',border:'none',borderRadius:6,padding:'7px',fontWeight:700,color:C.black,fontSize:11,cursor:editTapDate.trim()&&editTapDose.trim()?'pointer':'default'}}>
                            Save Step
                          </button>
                        </div>
                      </div>
                    ):(
                      <button type="button" onClick={()=>{ setEditTaperFor(rx.id); setEditTapDate(''); setEditTapDose(''); setEditTapNote('') }}
                        style={{fontSize:11,color:C.muted,background:'none',border:`1px dashed ${C.border}`,borderRadius:6,padding:'5px 10px',cursor:'pointer',marginTop:4}}>
                        + Add Taper / Adjustment Step
                      </button>
                    )}
                  </div>
                ))}
              </Card>

              <Card sx={{marginBottom:12}}>
                <Lbl t="Coach Notes to Client"/>
                <textarea value={coachNotes} onChange={e=>setCoachNotes(e.target.value)}
                  placeholder="Notes, reminders, instructions for this client…"
                  rows={3}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </Card>

              <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:12}}>
                Save Protocol
              </button>
            </>
          )}

          {/* Client view — read only for coach content, editable for own sections */}
          {isClient&&(
            <>
              {/* Supplement protocol — view only */}
              <Card sx={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
                  <Lbl t="Your Supplement Protocol"/>
                  <ReadOnlyBadge/>
                </div>
                {clientSupps.length===0&&customSuppText===''?(
                  <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'8px 0'}}>Your supplement protocol will appear here once your coach assigns it.</div>
                ):(
                  <>
                    {clientSupps.map(s=>(
                      <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:13,color:C.white,fontWeight:600,marginBottom:3}}>{s.name}</div>
                        <div style={{fontSize:12,color:C.gold}}>{s.customDose}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.customDir}</div>
                        {s.code&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>Code: <span style={{color:C.gold,fontWeight:700}}>{s.code}</span></div>}
                        {s.link&&<a href={s.link} target="_blank" rel="noreferrer" style={{fontSize:10,color:C.gold,display:'block',marginTop:2}}>Purchase →</a>}
                      </div>
                    ))}
                    {customSuppText&&<div style={{fontSize:13,color:C.white,lineHeight:1.7,borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:10,whiteSpace:'pre-wrap'}}>{customSuppText}</div>}
                  </>
                )}
              </Card>

              {/* Client's own supplement notes — editable */}
              <Card sx={{marginBottom:12}}>
                <Lbl t="My Supplement Notes"/>
                <div style={{fontSize:10,color:C.muted,marginBottom:8}}>Add notes on how you are tolerating each supplement, timing questions, or anything for your coach.</div>
                <textarea value={clientSuppNotes} onChange={e=>setClientSuppNotes(e.target.value)}
                  placeholder="e.g. Bloat Eaze is working well. Magnesium making me drowsy earlier than expected…"
                  rows={4}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </Card>

              {/* Prescription section — read-only view of coach's Rx tracker */}
              {rxList.length>0&&(
                <Card sx={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
                    <Lbl t="Prescriptions / Medications"/>
                    <ReadOnlyBadge/>
                  </div>

                  {rxList.map((rx,i)=>(
                    <div key={rx.id} style={{borderTop:i>0?`1px solid ${C.border}`:undefined,paddingTop:i>0?12:0,marginTop:i>0?12:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:2}}>{rx.name}</div>
                      <div style={{fontSize:12,color:C.gold,marginBottom:2}}>{rx.dose}</div>
                      {rx.directions&&<div style={{fontSize:11,color:C.muted,marginBottom:2}}>{rx.directions}</div>}
                      {rx.startDate&&<div style={{fontSize:10,color:C.muted,marginBottom:6}}>Started: {new Date(rx.startDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>}

                      {rx.tapers.length>0&&(
                        <div style={{marginLeft:12,borderLeft:`2px solid ${C.border}`,paddingLeft:12}}>
                          <div style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:6}}>Taper Schedule</div>
                          {rx.tapers.map(t=>(
                            <div key={t.id} style={{display:'flex',gap:8,marginBottom:7,alignItems:'flex-start'}}>
                              <div style={{width:8,height:8,borderRadius:4,background:C.gold,marginTop:4,flexShrink:0}}/>
                              <div>
                                <div style={{fontSize:11,color:C.white,fontWeight:600}}>{new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} — <span style={{color:C.gold}}>{t.dose}</span></div>
                                {t.note&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{t.note}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{marginTop:14,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>My Prescription Notes</div>
                    <textarea value={clientRxNotes} onChange={e=>setClientRxNotes(e.target.value)}
                      placeholder="Add any questions or notes about your prescriptions for your coach…"
                      rows={3}
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                  </div>
                </Card>
              )}

              {/* Coach notes — view only */}
              {coachNotes&&(
                <Card sx={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',marginBottom:8}}>
                    <Lbl t="Note from Coach"/>
                    <ReadOnlyBadge/>
                  </div>
                  <div style={{fontSize:13,color:C.white,lineHeight:1.7}}>{coachNotes}</div>
                </Card>
              )}

              <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:12}}>
                Save My Notes
              </button>
            </>
          )}

          {/* Resource links — both roles */}
          <Card sx={{marginBottom:24}}>
            <Lbl t="Helpful Resources & Lab Links"/>
            {[
              ['Male Blood Work Panel',  'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN',''],
              ['Female Blood Work Panel','https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN',''],
              ['DUTCH Test',             'https://www.practitionerdepot.com/products/dutch-test','Code: TOGNIETTI10'],
              ['GI Map',                 'https://www.practitionerdepot.com/products/gi-map','Code: TOGNIETTI10'],
              ['Book a Call',            'https://links.lifestyleofeden.com/widget/booking/2kKUGzYZqAaNBVpd5uzA',''],
              ['NuEthix Supplements',    'https://nuethix.com','Code: TOGNIETTI10'],
            ].map(([l,u,note])=>(
              <a key={l} href={u} target="_blank" rel="noreferrer"
                style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:`1px solid ${C.border}`,textDecoration:'none'}}>
                <div>
                  <span style={{fontSize:13,color:C.white}}>{l}</span>
                  {note&&<div style={{fontSize:10,color:C.gold,marginTop:1}}>{note}</div>}
                </div>
                <span style={{fontSize:12,color:C.gold,flexShrink:0,marginLeft:8}}>→</span>
              </a>
            ))}
          </Card>
        </div>
      )}

      {/* ── Food picker modal (coach only) ─────────────────── */}
      {showPicker&&isCoach&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:500,maxHeight:'82vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:8}}>Add Food to {meals[activeMeal]?.name}</div>
              <input value={foodSearch} onChange={e=>setFoodSearch(e.target.value)}
                placeholder="Search foods or category…"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                autoFocus/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
              {['Proteins','Carbohydrates','Fats','Fruits/Vegetables','Supplements','Drinks/Condiments'].map(cat=>{
                const foods=filteredFoods.filter(f=>f.cat===cat)
                if(!foods.length) return null
                return (
                  <div key={cat}>
                    <div style={{padding:'5px 16px 2px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>{cat}</div>
                    {foods.map(food=>(
                      <button key={food.name} onClick={()=>addFood(food)}
                        style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'8px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}
                        onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <div>
                          <div style={{fontSize:13,color:C.white,fontWeight:500}}>{food.name}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{food.serving}</div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                          <div style={{fontSize:12,color:C.gold,fontWeight:600}}>{food.cal} cal</div>
                          <div style={{fontSize:10,color:C.muted}}>P:{food.pro}g C:{food.carb}g F:{food.fat}g</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowPicker(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Habit picker modal (coach only) ─────────────────── */}
      {showHabitPicker&&isCoach&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowHabitPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,maxHeight:'82vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:4}}>Assign Habits to Client</div>
              <div style={{fontSize:11,color:C.muted}}>Select which habits this client should track this week</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 16px'}}>
              {MASTER_HABITS.map(h=>{
                const assigned=assignedHabits.find(x=>x.id===h.id)
                return (
                  <button key={h.id} onClick={()=>toggleHabitAssign(h)}
                    style={{width:'100%',textAlign:'left',background:assigned?`${C.gold}15`:C.surface,border:`1px solid ${assigned?C.gold:C.border}`,borderRadius:8,padding:'10px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                    <span style={{fontSize:16}}>{assigned?'✅':'⬜'}</span>
                    <div>
                      <div style={{fontSize:13,color:C.white,fontWeight:assigned?700:400}}>{h.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>Default: {h.defaultTarget}x/week</div>
                    </div>
                  </button>
                )
              })}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Add Custom Habit</div>
                <div style={{display:'flex',gap:8}}>
                  <input value={customHabit} onChange={e=>setCustomHabit(e.target.value)} placeholder="e.g. Infrared sauna 3x/week"
                    style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                  <button onClick={addCustomHabit}
                    style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Add</button>
                </div>
              </div>
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowHabitPicker(false)}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,color:C.black,fontWeight:800,fontSize:13,cursor:'pointer'}}>
                Done — {assignedHabits.length} habits assigned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplement picker modal (coach only) ─────────────── */}
      {showSuppPicker&&isCoach&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowSuppPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:540,maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:8}}>Supplement Database</div>
              <input value={suppSearch} onChange={e=>setSuppSearch(e.target.value)}
                placeholder="Search any supplement by name…"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}
                autoFocus/>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {suppSearch?(
                <div style={{padding:'8px 0'}}>
                  <div style={{padding:'5px 16px 3px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Search Results</div>
                  {allSuppSearch.length===0&&<div style={{padding:'20px 16px',color:C.muted,fontSize:13}}>No supplements found</div>}
                  {allSuppSearch.map((s,i)=>(
                    <button key={i} onClick={()=>addSuppFromDB(s)}
                      style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'9px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${C.border}`}}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <div>
                        <div style={{fontSize:13,color:C.white,fontWeight:600}}>{s.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.dose}</div>
                        {s.code&&<div style={{fontSize:10,color:C.gold,marginTop:1}}>Code: {s.code}</div>}
                        <div style={{fontSize:9,color:C.dim,marginTop:1}}>{s.category}</div>
                      </div>
                      <span style={{color:C.gold,fontSize:18,flexShrink:0,marginLeft:10}}>+</span>
                    </button>
                  ))}
                </div>
              ):(
                <div style={{padding:'8px 0'}}>
                  <div style={{padding:'5px 16px 8px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Apply Full Protocol</div>
                  {Object.keys(SUPP_DB).map(cat=>(
                    <div key={cat} style={{borderBottom:`1px solid ${C.border}`}}>
                      <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div>
                          <div style={{fontSize:13,color:C.white,fontWeight:600}}>{cat}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{SUPP_DB[cat].length} supplements</div>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <button onClick={()=>setSuppCategory(suppCategory===cat?null:cat)}
                            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',color:C.muted,fontSize:11,cursor:'pointer'}}>
                            {suppCategory===cat?'▲ Hide':'▼ View'}
                          </button>
                          <button onClick={()=>addSuppProtocol(cat)}
                            style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'4px 10px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                            + All
                          </button>
                        </div>
                      </div>
                      {suppCategory===cat&&(
                        <div style={{background:C.surface,borderTop:`1px solid ${C.border}`}}>
                          {SUPP_DB[cat].map((s,i)=>(
                            <button key={i} onClick={()=>addSuppFromDB({...s,category:cat})}
                              style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'8px 20px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}
                              onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}08`}
                              onMouseLeave={e=>e.currentTarget.style.background='none'}>
                              <div>
                                <div style={{fontSize:12,color:C.white,fontWeight:500}}>{s.name}</div>
                                <div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.dose}</div>
                                {s.code&&<div style={{fontSize:10,color:C.gold}}>Code: {s.code}</div>}
                              </div>
                              <span style={{color:C.gold,fontSize:16,flexShrink:0,marginLeft:8}}>+</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowSuppPicker(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Done — {clientSupps.length} supplements added
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
