// ═══════════════════════════════════════════════════════════════
// DietBuilder.jsx — Week 3 v3 (Client Permissions Fixed)
// Coach: full edit access to all protocol sections
// Client: view-only on coach content, editable on their own sections
// Place at: src/components/DietBuilder.jsx in Replit
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { sbBearer, sbAccessToken } from '../lib/sbAuth'
import { sendNotification } from './Notifications'
import { useDeadline } from '../lib/tz'
import { useCheckinForm } from '../lib/checkinForm'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { getRecipeDetails, loadLiveRecipeDetails } from './recipeDetails'

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
  'coach@eden.io':      { uuid:'414b1fb3-f38c-4480-bdb2-fe7b1d844051', name:'Coach',    role:'coach' },
  'client@eden.io':     { uuid:'ece58b33-3f2a-4ce7-bed9-a157c914056c', name:'Client', role:'client' },
  'admin@edencomms.io': { uuid:null,                                    name:'Eden Admin',      role:'super_admin' },
}

const C = {
  gold:'#ffa600', black:'#000', white:'#fff',
  surface:'#111', card:'#1a1a1a', border:'#2a2a2a',
  muted:'#888', success:'#4FD89A', danger:'#ff4444', dim:'#333',
}

// Side-by-side photo compare: two panes, tap a pane to select it, tap a
// thumbnail below to fill ONLY that pane (never the whole page).
function PhotoCompare({ photos, isMobile }) {
  const [panes, setPanes]   = useState({ left:null, right:null })
  const [active, setActive] = useState('left')
  const pane = (side) => {
    const p = panes[side]
    const isActive = active === side
    return (
      <div key={side} onClick={()=>setActive(side)}
        style={{ flex:1, minWidth:0, aspectRatio:'3/4', background:C.surface, borderRadius:12, cursor:'pointer',
          border:`2px solid ${isActive ? C.gold : C.border}`, overflow:'hidden', position:'relative',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
        {p ? (<>
          <img src={p.photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }}/>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.65)', padding:'5px 8px',
            fontSize:11, fontWeight:700, color:C.gold, textAlign:'center' }}>
            {p.week_label||''}{p.notes?` · ${p.notes}`:''}
          </div>
        </>) : (
          <div style={{ color:C.muted, fontSize:11, textAlign:'center', padding:12 }}>
            {isActive ? 'Tap a photo below to fill this side' : 'Tap to select this side'}
          </div>
        )}
        {isActive && <div style={{ position:'absolute', top:6, left:6, fontSize:9, fontWeight:800, letterSpacing:1,
          background:C.gold, color:'#000', borderRadius:6, padding:'2px 7px' }}>SELECTED</div>}
        {p && <button title="Remove this photo from the comparison"
          onClick={(e)=>{ e.stopPropagation(); setPanes(prev=>({ ...prev, [side]:null })); setActive(side) }}
          style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%', cursor:'pointer',
            background:'rgba(0,0,0,0.7)', border:`1px solid ${C.border}`, color:C.white, fontSize:12, lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>}
      </div>
    )
  }
  const byWeek = {}
  for (const p of photos || []) {
    if (!p.photo_url) continue
    const k = p.week_label || 'Uncategorized'
    if (!byWeek[k]) byWeek[k] = []
    byWeek[k].push(p)
  }
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:6 }}>{pane('left')}{pane('right')}</div>
      <div style={{ fontSize:10, color:C.muted, textAlign:'center', marginBottom:12 }}>
        Tap a side to select it, then tap any photo below — it fills only that side.
      </div>
      {Object.entries(byWeek).map(([week, wPhotos]) => (
        <div key={week} style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.white, marginBottom:6 }}>{week}</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {wPhotos.map((p, i) => {
              const inLeft = panes.left?.id === p.id, inRight = panes.right?.id === p.id
              return (
                <div key={i}
                  onClick={()=>{ setPanes(prev=>({ ...prev, [active]:p })); setActive(a=>a==='left'?'right':'left') }}
                  style={{ width:isMobile?58:72, cursor:'pointer' }}>
                  <img src={p.photo_url} alt="" style={{ width:'100%', height:isMobile?76:94, objectFit:'cover', borderRadius:8,
                    display:'block', border:`2px solid ${(inLeft||inRight) ? C.gold : C.border}` }}/>
                  <div style={{ fontSize:9, color:(inLeft||inRight)?C.gold:C.muted, textAlign:'center', marginTop:2,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {inLeft?'◀ ':''}{p.notes||`Photo ${i+1}`}{inRight?' ▶':''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const H = {
  'apikey':SUPABASE_ANON,
  get Authorization(){ return sbBearer() },
  'Content-Type':'application/json',
  'Prefer':'return=representation',
}
async function dbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:'POST', headers:H, body:JSON.stringify(body)
  })
  if (!r.ok) { console.error('INSERT', await r.text()); return null }
  // H asks for return=representation, so successful inserts yield the new row(s)
  return r.json().catch(()=>true)
}
async function dbGet(table, query='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers:{ 'apikey':SUPABASE_ANON, get Authorization(){ return sbBearer() } }
  })
  return r.ok ? r.json() : []
}
async function dbUpdate(table, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method:'PATCH',
    headers:{ 'apikey':SUPABASE_ANON, get Authorization(){ return sbBearer() },
      'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body:JSON.stringify(body)
  })
  if (!r.ok) { console.error('UPDATE', await r.text()); return null }
  return true
}
async function dbUpsert(table, body, onConflict) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method:'POST',
    headers:{ 'apikey':SUPABASE_ANON, get Authorization(){ return sbBearer() },
      'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify(body)
  })
  if (!r.ok) console.error('UPSERT', await r.text())
  return r.ok
}
async function dbDelete(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method:'DELETE',
    headers:{ 'apikey':SUPABASE_ANON, get Authorization(){ return sbBearer() } }
  })
  if (!r.ok) console.error('DELETE', await r.text())
}
function scoreColor(v) {
  if (v == null) return C.muted
  if (v >= 8) return C.success
  if (v >= 5) return C.gold
  return C.danger
}

// ── Master habit list ─────────────────────────────────────────
import { MASTER_HABITS, FOODS, DEFAULT_RESOURCE_LINKS } from './libraryDefaults'

// ── Recipe Book ──────────────────────────────────────────────
const RECIPE_BUY = 'https://funnel.lifestyleofeden.com/loe-recipes-5482'
const RECIPE_CAT_EMOJI = {Breakfast:'🥞',Lunch:'🥗',Dinner:'🍽',Snacks:'🫙',Drinks:'🥤',Desserts:'🍰',Soups:'🍲',Sides:'🥦',Sauces:'🧴'}
const STATIC_RECIPES = [
  {name:'Whole Food Protein Pancakes',    cal:270, pro:27,  fat:7,  carb:28, fib:5,  category:'Breakfast'},
  {name:'Breakfast Tacos',               cal:670, pro:45,  fat:32, carb:49, fib:9,  category:'Breakfast'},
  {name:"Homemade Superfood Acai Bowl",  cal:230, pro:25,  fat:6,  carb:19, fib:7,  category:'Breakfast'},
  {name:'Mineral Oat Bowl',              cal:520, pro:18,  fat:23, carb:63, fib:10, category:'Breakfast'},
  {name:'Ezekiel Burrito Wrap',          cal:490, pro:50,  fat:12, carb:44, fib:12, category:'Lunch'},
  {name:'Black Bean Quinoa Burger',      cal:170, pro:9,   fat:5,  carb:24, fib:9,  category:'Lunch'},
  {name:'Recovery Power Bowl',           cal:778, pro:26,  fat:33, carb:106,fib:16, category:'Lunch'},
  {name:'Quinoa Lentil Power Bowl',      cal:990, pro:41,  fat:35, carb:135,fib:22, category:'Lunch'},
  {name:'Pesto Chickpea Salad',          cal:400, pro:18,  fat:20, carb:40, fib:12, category:'Lunch'},
  {name:'Stuffed Peppers',               cal:240, pro:25,  fat:11, carb:12, fib:5,  category:'Dinner'},
  {name:'Whole Food Taco Soup (Beef)',   cal:395, pro:35,  fat:15, carb:30, fib:10, category:'Soups'},
  {name:'Whole Food Taco Soup (Chicken)',cal:352, pro:40,  fat:8,  carb:30, fib:9,  category:'Soups'},
  {name:'Tafu Stir Fry',                cal:450, pro:25,  fat:18, carb:45, fib:7,  category:'Dinner'},
  {name:'Beef Carpaccio',               cal:400, pro:36,  fat:20, carb:28, fib:2,  category:'Dinner'},
  {name:'Miso Soup',                     cal:200, pro:15,  fat:8,  carb:12, fib:4,  category:'Soups'},
  {name:'Avocado Cucumber Lime Salad',   cal:280, pro:3,   fat:26, carb:13, fib:7,  category:'Sides'},
  {name:'Honey & Thyme Roasted Carrots', cal:205, pro:2,   fat:14, carb:20, fib:5,  category:'Sides'},
  {name:'Mediterranean Tomato Salad',    cal:150, pro:2,   fat:14, carb:9,  fib:3,  category:'Sides'},
  {name:'Apple Walnut Slaw',             cal:330, pro:5,   fat:26, carb:22, fib:6,  category:'Sides'},
  {name:'Banana Date Smoothie',          cal:420, pro:30,  fat:12, carb:55, fib:7,  category:'Drinks'},
  {name:'Gut Health Hot Chocolate',      cal:145, pro:21,  fat:3,  carb:18, fib:5,  category:'Drinks'},
  {name:'Whole Food Banana Bread',       cal:250, pro:10,  fat:8,  carb:40, fib:5,  category:'Snacks'},
  {name:'Date Energy Balls',             cal:88,  pro:1.7, fat:0.8,carb:18, fib:2,  category:'Snacks'},
  {name:'PB Protein Balls',             cal:89,  pro:3.6, fat:5.5,carb:7,  fib:2,  category:'Snacks'},
  {name:'Plant-Based Nutella Spread',   cal:152, pro:3,   fat:13, carb:8.5,fib:3,  category:'Snacks'},
  {name:'PB Cinnamon Muffin',           cal:180, pro:15,  fat:6,  carb:18, fib:5,  category:'Snacks'},
  {name:'Pumpkin Custard Pie',           cal:233, pro:5.5, fat:2.7,carb:46, fib:5,  category:'Desserts'},
  {name:'Banana Ice Cream',             cal:315, pro:3.9, fat:1,  carb:81, fib:7,  category:'Desserts'},
  {name:'Cookie Dough Dip',             cal:166, pro:4.5, fat:5,  carb:27, fib:6,  category:'Desserts'},
  {name:'Date Caramel Frosting',        cal:136, pro:2,   fat:4.5,carb:24, fib:3,  category:'Desserts'},
  {name:"Gregor's Pesto Sauce",         cal:320, pro:11,  fat:24, carb:16, fib:5,  category:'Sauces'},
  {name:'Tahini Lemon Sauce',           cal:92,  pro:2,   fat:6,  carb:9,  fib:3,  category:'Sauces'},
  {name:'Sweet Potato Chickpea Burger', cal:210, pro:8,   fat:6,  carb:32, fib:9,  category:'Dinner'},
]
const RECIPE_CATS = ['All',...[...new Set(STATIC_RECIPES.map(r=>r.category))]]

// ── Supplement database ───────────────────────────────────────
const SUPP_DB = {
  '1 Hour Before Bed (METHYLATION Protocol)':[
    {name:'TMG (Trimethylglycine)', dose:'4g', directions:'', code:'', link:'https://www.amazon.com/dp/B01BCQ3RLE?tag=bestprices-20'},
    {name:'Glycine', dose:'4g', directions:'', code:'', link:'https://www.amazon.com/dp/B09F83CPX8?tag=bestprices-20'},
    {name:'L-Methionine', dose:'2.4g (2400mg)', directions:'', code:'', link:'https://www.amazon.com/dp/B09JJMQRY3?tag=bestprices-20'},
    {name:'Methyl Folate/methyl B12', dose:'1000mcg (1 full dropper)', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385'},
    {name:'Inositol', dose:'6g', directions:'', code:'', link:'https://www.amazon.com/dp/B08QC4V25L?tag=bestprices-20'},
    {name:'Magnesium', dose:'200mg', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/prosorb-magnesium-new?variant=47369076703465'},
    {name:'Vitamin D3 + K2', dose:'5000 IU 1 hr before bed', directions:'- 1 hour before bed', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/nu-d3-k2?variant=46760997322985'},
  ],
  '5R Base Gut Protocol':[
    {name:'Artemisia Wormwood', dose:'Take 1 capsule with meals 1, 3, and 4 for only 2 weeks, then stop.', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Wormwood-Capsules-450mg-120/dp/B07WDTGK8S/ref=sr_1_3_sspa?crid=DWE9MIBK2YGK&dib=eyJ2IjoiMSJ9.SmAT7k714EAkJ_wgWMtK9tYU45q-TS4bktUQ-DxTW4DspN3_0IlxJhmm29TkfYud9PTWiKlUUBeY_hX5EjGfAvqAT0NJCnJH5mD8B-Vyx7FLzZRJKiBOF9BZP4yWqXZdtGvGgMeAdSKmO_urER3XQlMG2gbV8Bekb4s8dUfc0Q8I8Ehjk2cBky5E_i_dMwWJaTmrvuKSFBzstudJW1qJTuHTcqzYbDLJSjw9xWvZbz2sglNjzxxjrAxUVGhMIU7BLNaWa8FRxsZY5QpM3xkPBODm0xc1Hsy6rptuQJGBf2M.1CeeJAl7EKnMhIGdK-Vhc2hYtxCZ5SFsAMYMlV6aNYM&dib_tag=se&keywords=artemisia+wormwood&qid=1738596625&s=hpc&sprefix=artemesia+wormwoo%2Chpc%2C176&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Biofilm Resolve', dose:'2 capsules 45-60 minutes before meals 1, 3, and 5 on an emtpy stomach.', directions:'7-Day Prepareation Phase for 5R protocol', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/biofilm-resolve?variant=37274128482466'},
    {name:'Saccharomyces Boulardii', dose:'take 2 capsules of Saccharomyces Boulardii with meal 1 and 2 capsules with your last meal', directions:'7-Day Preparation Phase for 5R protocol & use weeks 1-6.', code:'', link:'https://www.amazon.com/Saccharomyces-Boulardii-Billion-Probiotics-Serving/dp/B09BDJ87L6/ref=sr_1_1_sspa?crid=33O35GY9HH6GY&dib=eyJ2IjoiMSJ9.QhrRrsBe_zLC2Tdd1CK75-swAaA6CLujvcfObACNAGG2f0PQEjLcdq4H4FtcO5pNXTg811hGoIOaE0jpe2We5CAGTxIsF4CcmpV-NRsvyrW8vFS0POnoUGY-AZKi4AvGv777d0b354XQ0OsmvuZ_pnGFDwhI6VunJPoUL1Sq6HKNVLt4MSWWjybOmDg7QANiutx1Z6ISXF6Y5mf9lW-NJWCAo6I5y46su9lq59GJa36Sh55sN60nHKybTzeD05WvV6-QHNohmtxr0WL3jP_LlxVHkpePuH6ygResCKlTQsM.DKYBsEzmH7teylrJeXsHL6i7bNjq8mN0QS78eU8lhV0&dib_tag=se&keywords=saccharomyces%2Bboulardii&qid=1738529263&s=hpc&sprefix=sac%2Chpc%2C158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Water Intake', dose:'Consume 1-1.5 gallons of water daily for the first 2 weeks', directions:'', code:'', link:''},
    {name:'Fungal Pro', dose:'2 capsules, 2 times a day (with the first and last meal)', directions:'Discontinue after 6 weeks. at checkout.', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/fungal-pro?_pos=1&_sid=59bd9f30e&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=46157593739481'},
    {name:'Biofilm Resolve', dose:'Week 1: 3 capsules 30 minutes before meals 1/3/5 / Weeks 2-5: 4 capsules 30 minutes before meals 1/3/5 / Weeks 6-7: 3 capsules before meals 1/3/5 / Weeks 8-9: 2 capsules before meals 1/3/5 / Then off', directions:'7-Day Prepareation Phase for 5R protocol', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/biofilm-resolve?variant=37274128482466'},
    {name:'Saccharomyces Boulardii', dose:'2 capsules with meal 1 / 2 capsules with last meal', directions:'', code:'', link:'https://www.amazon.com/Saccharomyces-Boulardii-Billion-Probiotics-Serving/dp/B09BDJ87L6/ref=sr_1_1_sspa?crid=33O35GY9HH6GY&dib=eyJ2IjoiMSJ9.QhrRrsBe_zLC2Tdd1CK75-swAaA6CLujvcfObACNAGG2f0PQEjLcdq4H4FtcO5pNXTg811hGoIOaE0jpe2We5CAGTxIsF4CcmpV-NRsvyrW8vFS0POnoUGY-AZKi4AvGv777d0b354XQ0OsmvuZ_pnGFDwhI6VunJPoUL1Sq6HKNVLt4MSWWjybOmDg7QANiutx1Z6ISXF6Y5mf9lW-NJWCAo6I5y46su9lq59GJa36Sh55sN60nHKybTzeD05WvV6-QHNohmtxr0WL3jP_LlxVHkpePuH6ygResCKlTQsM.DKYBsEzmH7teylrJeXsHL6i7bNjq8mN0QS78eU8lhV0&dib_tag=se&keywords=saccharomyces%2Bboulardii&qid=1738529263&s=hpc&sprefix=sac%2Chpc%2C158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Mastic Gum', dose:'1000 mg (2 capsules) with meals 2 and 5 daily for 6 weeks', directions:'Use weeks 1-6.', code:'', link:'https://www.amazon.com/Jarrow-Formulas-Supports-Stomach-Duodenal/dp/B0013OVVAK/ref=sr_1_2_sspa?crid=6PBQ5S45ED1J&dib=eyJ2IjoiMSJ9.ys8VIutZ0_kq7AVKdtKEA0hNrsI27jBNLK9q6xCILODT26LNNAtZCXRVthqWdCeI4xrQ4Fp7m0IlghnDcyzeqzcNlZK9Ujx61KaOyLKuSU-bu2HVa-rAKpvvsLAqpphxlO8ZFegj-WdyYheYUupj3YCRVxqz2UTnszCW6y4s_aMlauiZ5H_s_A8Qj3IYV8iBB-4GCHyZd2SY4peiZPV3jZ3W7JRQ_eJkKc6PqeTe8rtIdQfY42MBzS5NqjqZET8_8ugN-dAtLx7nrFZGACdxO9_YdPBG9kKQif3zk5ciuuY.94XgaJiwxTrA9G87O27f7bQNJN2xIKH_MhIQzfKrPBk&dib_tag=se&keywords=mastic%2Bgum&qid=1738529201&rdc=1&s=hpc&sprefix=mastic%2Bgum%2Chpc%2C167&sr=1-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'FC Extinguish', dose:'2 capsules, 2 times a day (first and last meal) for weeks 1-6', directions:'Use weeks 1-6. discount code TOGNIETTI10 at checkout.', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/fc-cidal-copy?_pos=1&_sid=41bf7f166&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=46157618282713'},
    {name:'Grapefruit Seed Extract (GSE) (Nutridyn)', dose:'3 capsules with meals 1, 3, and 5 for 6 weeks.', directions:'Use weeks 1-6. discount code TOGNIETTI10 at checkout.', code:'TOGNIETTI10', link:''},
    {name:'Oregano Pro', dose:'For first 6 weeks, take 4 tablets (200 mg) 3 times a day (meals 1, 3, and 5)', directions:'Use weeks 1-6. at checkout', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/oregano-pro?_pos=1&_sid=7ff5fc5bb&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=46157539147993'},
    {name:'Berberine', dose:'Take 2000 mg with meals 1 and 3. / Take 1000 mg with meal 5', directions:'Use weeks 4-6.', code:'', link:'https://www.amazon.com/Nutricost-Berberine-HCl-600mg-Capsules/dp/B079GH6V2Z/ref=sr_1_2_sspa?crid=21A8H4C6TL938&dib=eyJ2IjoiMSJ9.Xj7yfZpw3fI3k0XSZzGq5sn2p-E_MN4nZrx1AUl-wayw87IkQIYZTGzQoaEgDtOtOITBSgVlDDxYJtXtm5a3aXlSi0tqtlhD5th1PzMciOq6uiJopa4l3kyOS1ul_qOJ0-0REnSFwApp-EYAuYqWjvJrAZv90fLYUKnb8uvQbhXqpwNZfVAsZzLEmFH_bQq2g010H4clWFcTFaAvWV6-yodTgxdO_pk-1iabDFpG-81XPngNPURf7dkBi8u7sB9Cma8-9Jnkomf6B9Y_zsqN9paXC8586bpIqwRePHmQUsI.4pd8tiLe9fUPjvLNpuC2JsBFhQHLngHpJfDIqq5wQNw&dib_tag=se&keywords=berberine&qid=1738529146&s=hpc&sprefix=berberine+%2Chpc%2C214&sr=1-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Allicin (Allimed)', dose:'2 capsules with meals 1, 3, and 5 for weeks 4-6', directions:'Use weeks 4-6.', code:'', link:'https://westcoastmint.com/products/allimax-allimed-garlic-extract-450-mg?variant=39932048441453&gad_source=1&gclid=CjwKCAiAzPy8BhBoEiwAbnM9Ow3FVnyf_DuoPIBHukznfW8UuhbWPxLvNMQWVF5nVJMUDaOlU1g4PRoCOjcQAvD_BwE'},
    {name:'Bloat Eaze', dose:'1 scoop daily, with meal 1', directions:'Use weeks 1-6.', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/bloat-eaze-pro?variant=42854686753001'},
    {name:'Glutamine', dose:'20 grams daily with a meal', directions:'Use weeks 1-6.', code:'', link:'https://nuethix.com/products/nu-glutamine'},
    {name:'Opti-Pure', dose:'Initial Phase: 3 capsules with meal 1 and meal 4 until the bottle is finished / / Maintenance Phase: 3 capsules with meal 1 for the remainder of the second bottle', directions:'Use weeks 1-6.', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/opti-pure?variant=42315272585449'},
    {name:'Calcium D-Glucarate (Nutricost)', dose:'2 tablets (1000 mg) with meal 1 and meal 5 for 8 weeks', directions:'Use weeks 1-6.', code:'', link:'https://www.amazon.com/Nutricost-Calcium-D-Glucarate-500mg-Capsules/dp/B09NPFFSVC/ref=sr_1_1_sspa?crid=1PGBKFTLXC4NL&dib=eyJ2IjoiMSJ9.p-cVncY67UN0tGzLsa2nkE1PQXjSANm9GFYzzCtXWNFnJILuIJoRG45ZNCOR3atllaO9gX6PVjvBpIDaOsPL-Pae9uV5ddgYlXZiHQBdW1ShayyuEeh2b63NwipBmZpgFnXueSESxn63hGchsaBhz53iGt-l5xQdwiQG13Avh5j93f_OPBm95_6335-mDn1tsDJS3zS6ol81L4HnofKjnxe9ncKf5_kFAf9cnshFRQxXxx_S171KS9cBoEUY026Qdk2N_d9LREcBSBoHZZuRL3HpU5jB1_n59d3m5rBIX3o.83xBP882LwFMEb41yctUaug7r-oHz_3KLiBERhQx5KY&dib_tag=se&keywords=calcium+d+glucarate+nutricost&qid=1738528629&sprefix=calcium+d+glucarate+nutricost%2Caps%2C172&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Zinc Carnosine', dose:'1 tablet twice daily with meals 1 and 4 for 6 weeks', directions:'Use weeks 1-6.', code:'', link:'https://www.amazon.com/Nutricost-Zinc-Carnosine-86mg-Capsules/dp/B0BRNX1LLH/ref=sr_1_3_sspa?crid=2A65XGEEGZMJ3&dib=eyJ2IjoiMSJ9.GlT-FhpHreK9CRk7x1CfGCU75UgKFPc6ofKSscBrknWz3XvBOs27iUwC0B0iiF_FsedM4ZQ3vQqfJ_kMO-wq6oNSx5cs5AyFhsnDbG-CWy5Lm2beMIlY4XE7I5G_q9QtCL8Ilq56hKKOBZrJj5xjbhRgCF3nMn32E8EdieYEFo7UoZEIM3Lrjo4fwqpZP6-YPl0owqqvlpbuvx79y0cHIycFN-bz3UnptA7FfyvHUF8K6YpEofvqBANGRqsj_cpUZ07oJipl81Mpe23Yp2ndBP3ozfxj9bz3drRPMMKDhao.bN18ZkncAMdQIcZrMYJkqbS-fvK5cJYPD0Mfnwdh2r4&dib_tag=se&keywords=zinc+carnosine&qid=1739821163&s=hpc&sprefix=zinc+carnosine%2Chpc%2C131&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Cort Eaze', dose:'Take 2 capsules upon waking, 2 capsules with meal 3, and 2 capsules before bed throughout the program.', directions:'Use weeks 1-6.', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/cort-eaze?variant=32244757364781'},
    {name:'Relax Liposomal', dose:'Take 2 ml before bed each night.', directions:'Use weeks 1-6.', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/relax-liposomal?variant=32244904689709'},
    {name:'Ashwagandha', dose:'', directions:'Use weeks 1-6.', code:'', link:'https://www.amazon.com/Ashwagandha-Ayurvedic-Standardized-Clinically-Cardiovascular/dp/B01CZ2EGQY/ref=sr_1_4?crid=23Z7U2Z6NNGOJ&dib=eyJ2IjoiMSJ9.gKtzvW6y_Wapiqq_lYNfck4T2A0UzXalSBfv9Ed_BvOHmV_SpBMmOkrHnS4jr9Em_lWOXzAtiqJvpZzMHu8mjZGOfDJsUi3QNvDBiZ6NABoO7BouHGkUeIRlVmPAKMO4UcnfnW0W0jUYZF1pd_OF-bgwsqkXyuq93nd2GdkyxHx7wp5gzew7GUvGNK6USTjuziqU2Hv-_aqOZQZgWFiaw9xcRDDmuS_jjqp9fObiLZU5Rd55MTg5CXKZff2pmYZm7X_h_UKXo8BVGM1XTuANyJp70oWmFkbeni7iENtgMwQz6BPmlH315WGS0tNnj1hMAPqp03w_ejtqURU603jmAJuwG3HG0OSHLLiCqnFPk6c.XJIv3jHqYS56mWC6n0vDq8tbvg0T82E7EH45W6NusoU&dib_tag=se&keywords=ashwagandha%2Bsensoril%2Bnootropics&qid=1738528575&s=hpc&sprefix=ashwaganda%2Bsensoril%2Bnoootropic%2Chpc%2C153&sr=1-4&th=1'},
    {name:'FODMAP', dose:'Gradually introduce 1 FODMAP per week', directions:'Week 7 and beyond', code:'', link:''},
    {name:'Biotics Research Bile Plus', dose:'2 capsules per meal', directions:'Use week 7 and beyond.', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/bile-plus?_pos=1&_sid=ea0cc37ed&_ss=r&variant=46157575061721'},
    {name:'Saccharomyces Boulardii', dose:'2 capsules with meal 1 for 6 more weeks', directions:'', code:'', link:'https://www.amazon.com/dp/B00JK30A1M?ref=nb_sb_ss_w_as-reorder_k0_1_13&crid=CJR4WD29RFKY&sprefix=sachromyces%2Bb&th=1'},
    {name:'Probiotic', dose:'Take 1 capsule with meal 1 / Take 1 capsule each morning', directions:'Garden of Life brand. Use week 7 and beyond', code:'', link:'https://www.amazon.com/Garden-Life-Probiotics-Ultimate-Stable/dp/B07CZFZTCW/ref=sr_1_4?crid=29TEO7WPKLN35&dib=eyJ2IjoiMSJ9.5CZ5m1Slqne8kUPSrkF7zL7UILrZVqFRB_UhNPUAtq2flVdxVbm8bSGWFz0vrA8dgqT2XtYQ7_-NldV1DoYbd5-Tqm4IcmA2-CLa8d6K-2LmoWC1c01GIXhrLWnAbvHdg__muS0e0CPNzWibOhe6o5lljfhbp1lwa1cN5GZJsoHAi53jMWOpJVCVmu2AjdKvBnZnNZQSx6uX2UptPVn9rF4Pqr3gnwKBS_MBksrVswqdhmUYftNZiDF3FLrMvvXl35IDz_c3mhqt7CDDZWHnheRj5_wLLvnCcxIJW0t1A4diekXv52VnZCWmmGpRqlBE6yhgVWg9dimtD0fhpRBB-sf3p_1VDEFTQ35LOnoT4Nc.MnvmiSnvH51Uwu5UnVbDgcLolDVO2_QhMuQE_O-ZgNc&dib_tag=se&keywords=garden+of+life+probiotic&qid=1738957056&s=hpc&sprefix=garden+of+life+probioti%2Chpc%2C185&sr=1-4'},
    {name:'Gut Defender', dose:'Take 2 capsules with meal 1 for maintenance for 6 weeks.', directions:'Use week 7 and beyond.', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/gut-defender-new?variant=37158070845602'},
  ],
  'Adrenal Deficient Protocol':[
    {name:'Cort Eaze', dose:'2 capsules upon waking / 2 capsules with Meal 3 / 2 capsules with Meal 5 / 2 capsules before bed', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/cort-eaze?variant=32244757364781'},
    {name:'Relax Liposomal', dose:'2 ml before bed', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/relax-liposomal?variant=32244904689709'},
    {name:'Ashwagandha', dose:'2 capsules with each dose of Cort Eaze', directions:'', code:'', link:'https://www.amazon.com/Ashwagandha-Ayurvedic-Standardized-Clinically-Cardiovascular/dp/B01CZ2EGQY/ref=sr_1_4?crid=23Z7U2Z6NNGOJ&dib=eyJ2IjoiMSJ9.gKtzvW6y_Wapiqq_lYNfck4T2A0UzXalSBfv9Ed_BvOHmV_SpBMmOkrHnS4jr9Em_lWOXzAtiqJvpZzMHu8mjZGOfDJsUi3QNvDBiZ6NABoO7BouHGkUeIRlVmPAKMO4UcnfnW0W0jUYZF1pd_OF-bgwsqkXyuq93nd2GdkyxHx7wp5gzew7GUvGNK6USTjuziqU2Hv-_aqOZQZgWFiaw9xcRDDmuS_jjqp9fObiLZU5Rd55MTg5CXKZff2pmYZm7X_h_UKXo8BVGM1XTuANyJp70oWmFkbeni7iENtgMwQz6BPmlH315WGS0tNnj1hMAPqp03w_ejtqURU603jmAJuwG3HG0OSHLLiCqnFPk6c.XJIv3jHqYS56mWC6n0vDq8tbvg0T82E7EH45W6NusoU&dib_tag=se&keywords=ashwagandha%2Bsensoril%2Bnootropics&qid=1738528575&s=hpc&sprefix=ashwaganda%2Bsensoril%2Bnoootropic%2Chpc%2C153&sr=1-4&th=1'},
    {name:'Re-Testing Labs', dose:'', directions:'After 8 weeks on the protocol, re-test labs to monitor progress and adjust treatment as necessary.', code:'', link:''},
  ],
  'Adrenal Insufficient Protocol':[
    {name:'Adrena Health (Practitioner Depot)', dose:'3 capsules with meal 1 / 3 capsules with meal 3 / 3 capsules with meal 5', directions:'', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/adrena-health?_pos=1&_sid=0908709f9&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=27751403978845'},
    {name:'Adrena Licorice (Practitioner Depot)', dose:'1 capsule with each Adrena Health dosage', directions:'', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/adrena-licorice-pro?_pos=1&_sid=098a379bd&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=36829682434205'},
    {name:'Vitamin C', dose:'Follow the dosage in your regimen to boost adrenal health.', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Capsules-Vegetarian-Non-GMO/dp/B0B5FY7DKP/ref=sr_1_3_sspa?crid=2OVUSAYHRGI3H&dib=eyJ2IjoiMSJ9.szS6mdgo4HVtdAuzGjpYFZvzIIzCrpqfvPIjYKDbiR2BCL12OTexwTI547a25zHOsSIw3Hqi9bie6B3DTE3LF-v5Etjxz0TYhK6KVAgzWZWMLqbXMhhHa2SVWCUoljNp3t11WJpOJJBU4ksGtXKJBn8Q_qKNICKsFRvdfBDNcuHP512WSXuObOGjMJOSWGRI36tmH8H0SbDQ7lqPTZcZ1TZhdlbfrfteYW-up7RoFI9uV4x_pIB432dW12P70nbEFv2FDyqooHcfnVeXFZ08-ualdSjk9-Q6TBesPeuLflQ.I1-atY0QGotRXYNxrqsmvGXJjwSbAScRIRKH9EGH7Og&dib_tag=se&keywords=vitamin+c+nutricost&qid=1778011785&s=hpc&sprefix=vitamin+c+nutricos,hpc,126&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Ashwagandha', dose:'2 capsules with each Adrena Health dosage', directions:'', code:'', link:'https://www.amazon.com/Ashwagandha-Ayurvedic-Standardized-Clinically-Cardiovascular/dp/B01CZ2EGQY/ref=sr_1_4?crid=23Z7U2Z6NNGOJ&dib=eyJ2IjoiMSJ9.gKtzvW6y_Wapiqq_lYNfck4T2A0UzXalSBfv9Ed_BvOHmV_SpBMmOkrHnS4jr9Em_lWOXzAtiqJvpZzMHu8mjZGOfDJsUi3QNvDBiZ6NABoO7BouHGkUeIRlVmPAKMO4UcnfnW0W0jUYZF1pd_OF-bgwsqkXyuq93nd2GdkyxHx7wp5gzew7GUvGNK6USTjuziqU2Hv-_aqOZQZgWFiaw9xcRDDmuS_jjqp9fObiLZU5Rd55MTg5CXKZff2pmYZm7X_h_UKXo8BVGM1XTuANyJp70oWmFkbeni7iENtgMwQz6BPmlH315WGS0tNnj1hMAPqp03w_ejtqURU603jmAJuwG3HG0OSHLLiCqnFPk6c.XJIv3jHqYS56mWC6n0vDq8tbvg0T82E7EH45W6NusoU&dib_tag=se&keywords=ashwagandha%2Bsensoril%2Bnootropics&qid=1738528575&s=hpc&sprefix=ashwaganda%2Bsensoril%2Bnoootropic%2Chpc%2C153&sr=1-4&th=1'},
    {name:'Dr. Wilson\'s Adrena Rebuilder', dose:'1 capsule with every Adrena Health dosage', directions:'', code:'', link:'https://www.amazon.com/Dr-Wilsons-Original-Formulations-Rebuilder/dp/B00PG8EXQS/ref=sr_1_2?crid=30TXNPP54V9NS&dib=eyJ2IjoiMSJ9.Gdwbi_JJQsAwRR3ajZQQ5xVw1D_ffmCM3Lc8ap0jQDqvykT3uuhR3zRPZ62qxZnFmzJzX01iYdFb6Mza4Oxiqy_x6pEnk5irQTC249_tvbU4PZV0wk6gmfWbXofcKUlGM4xlNSaDE0fcuzOT73AWnsre7NJbLLMyKm3X8GhVIfYYeHbHgzqTOypHAQFdt2caSWdRYlikX3JCbRn12da8krQWT_dZySynPKDExieskOOlXm4CHXJw2aBuKy92vRMRoT5CGDcm7MNvgAKva7rdoQGVY3CM-zcD96FMV_7yCyQ.qmUjfOpEab0LJ0cxENw9UmmHgZNepeZ4hlcJ3-UyI8Q&dib_tag=se&keywords=dr+wilsons+adrenal+rebuilder&qid=1721676974&sprefix=dr+wilsons+adrena,aps,120&sr=8-2'},
    {name:'Monitoring and Retesting', dose:'', directions:'After 6 months on the protocol, retest labs to evaluate progress and adjust treatment as needed.', code:'', link:''},
  ],
  'Autophagy Push Protocol':[
    {name:'Black Seed Oil', dose:'10g/day', directions:'', code:'', link:'https://www.amazon.com/Organic-Black-Seed-Oil-Liquid/dp/B0B2R57WWC/ref=sr_1_1_sspa?crid=1ICV4SHCF5M9W&dib=eyJ2IjoiMSJ9._uigJadUJvbrr51cmjvoH7QA07rDs9nA6rnj-w_-Zj23mZSs4gHcK0rT3uzYFBHhBhvSrIgsv7iCl6ih4yhAPiDGAPtwi3BbVMNF5GkceQae94zkmqdLjQQBpvbUfe9vpCBedLqhXmqUIcGpNYhaFbnxBy1JBX72A2IcYqVXWO6__yttBvhNjo5mhbjI3UY3f3OfTicINBu7EB8_h0h7dBftei7XFfDoUQak40JTbuOd1w1v537UBpZw44SSRP6NLrOY1YTpJR9dDnTYstlIa0g8XkfIIq35tmffNQQvfqc.4gvY6tSjmHZ1mc5_2WWpCHLe1m6TuukX-6oMGowjphM&dib_tag=se&keywords=black%2Bcumin%2Boil&qid=1763316428&sprefix=black%2Bcumin%2Boil%2Caps%2C165&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Vitamin B2', dose:'500 mg/day', directions:'', code:'', link:''},
    {name:'Vitamin B3', dose:'300 mg/day', directions:'', code:'', link:''},
    {name:'Methyl Folate/methyl B12', dose:'1200mcg/day', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385'},
    {name:'Magnesium', dose:'1 scoop/day', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/prosorb-magnesium-new?variant=47369076703465'},
    {name:'Iodine', dose:'500 mg/day', directions:'', code:'', link:'https://www.amazon.com/dp/B00V9Q6IZQ'},
    {name:'Vitamin C', dose:'2000mgs a day', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Capsules-Vegetarian-Non-GMO/dp/B0B5FY7DKP/ref=sr_1_3_sspa?crid=2OVUSAYHRGI3H&dib=eyJ2IjoiMSJ9.szS6mdgo4HVtdAuzGjpYFZvzIIzCrpqfvPIjYKDbiR2BCL12OTexwTI547a25zHOsSIw3Hqi9bie6B3DTE3LF-v5Etjxz0TYhK6KVAgzWZWMLqbXMhhHa2SVWCUoljNp3t11WJpOJJBU4ksGtXKJBn8Q_qKNICKsFRvdfBDNcuHP512WSXuObOGjMJOSWGRI36tmH8H0SbDQ7lqPTZcZ1TZhdlbfrfteYW-up7RoFI9uV4x_pIB432dW12P70nbEFv2FDyqooHcfnVeXFZ08-ualdSjk9-Q6TBesPeuLflQ.I1-atY0QGotRXYNxrqsmvGXJjwSbAScRIRKH9EGH7Og&dib_tag=se&keywords=vitamin+c+nutricost&qid=1778011785&s=hpc&sprefix=vitamin+c+nutricos,hpc,126&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'CoQ10 (Nutrabio)', dose:'1500 mg/day', directions:'', code:'', link:'https://www.amazon.com/Nutricost-CoQ10-Veggie-Capsules-Servings/dp/B015TK6KVI?th=1'},
    {name:'Quercetin (Nutrabio)', dose:'500 mg/day', directions:'', code:'', link:'https://www.amazon.com/dp/B01MU30S6Z?ref=nb_sb_ss_w_as-reorder_k0_1_5&amp=&crid=2TL13WGN7AU16&sprefix=querc&th=1'},
    {name:'Alpha Lipoic Acid (Nutrabio)', dose:'300 mg/day', directions:'', code:'', link:'https://www.amazon.com/Nutricost-R-Alpha-Lipoic-100mg-Capsules/dp/B09NS4HZZB/ref=sr_1_1_sspa?crid=SF8UH0NF2V7Y&dib=eyJ2IjoiMSJ9.RUd1OEwwOhhHApsedR4myv-8ispeDRtWHPJx9UOpmvAAvgo6NjgSc7KQ8klEOf8U6sCU9tg3vpYGHFq_eIpjPBSOvj85AiLZ4f2wwqBhxlJ2EuQcHUgcwXOwPNvFlflnWB5xt3PKerBZDwyHtTuFiih0uS4utIjpJTsuHHmWd0pkZ4WRkOU_3dWQCAa3flV6bHX0DCcklQh7J-3W1aiL2xj8YB1fzMLor_Te7Y9INYxOV1aGsxL1ciHTOVpsh4HgqvW9qNIVZn74dEpMtrSfkT98zBYmQngcvVk-32JaDC8.-qanmBvJz6mptWnT2ERrgaZssi4esK3jgr5w7RuCkHM&dib_tag=se&keywords=Alpha-Lipoic+Acid+%28ALA%29+-+use+100mg+one&qid=1779825849&sprefix=alpha-lipoic+acid+ala+-+use+100mg+one%2Caps%2C172&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Cat\'s Claw', dose:'750 mg/day', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Cats-Claw-1000mg-Capsules/dp/B082BGQR6X?th=1'},
    {name:'L-Carnitine', dose:'3g / day', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/liposomal-l-carnitine?variant=40741984305314'},
  ],
  'Extra Supplements':[
    {name:'Potassium Iodide', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Potassium-Capsules-Serving-Vegetarian/dp/B0B2XB4V43?th=1'},
    {name:'Iodoral', dose:'', directions:'', code:'', link:'https://www.amazon.com/Optimox-Iodoral-Potency-Potassium-Supplement/dp/B005MKP9OK?th=1'},
    {name:'Horny Goat Weed', dose:'', directions:'', code:'', link:'https://www.amazon.com/Capsules-Minimum-Icariin-Epimedium-brevicornum/dp/B09XG7GQGZ?th=1'},
    {name:'Tongkat Ali', dose:'', directions:'', code:'', link:'https://www.amazon.com/Tongkat-Capsules-Eurycomanone-Eurycoma-longifolia/dp/B088GQDV76?th=1'},
    {name:'5 HTP', dose:'', directions:'', code:'', link:'https://www.amazon.com/dp/B01A1DL4DW?ref=nb_sb_ss_w_as-reorder_k0_1_4&amp=&crid=14991TH1VKVGR&sprefix=5htp&th=1'},
    {name:'L Dopa', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Mucuna-Pruriens-400mg-Capsules/dp/B07JHN2JK6/ref=sr_1_1?crid=2KWJ1PCUPKMIU&dib=eyJ2IjoiMSJ9.XKj2Xtfuu6HEvsl8RJVvuENE2AKtkPtY6vI-OaADp0tzmiWLyOdfiXLSgcw9BuxD4oHwCr0xQhSO2P-GKaRSCKOXOZm6kxwfHUIOUVva9OOpwfQFP5e12oH4GK9yI4uafPXKQNTaCP3KdDuCjieBG-ZnutFhBs0pEp0sMj5WwVpuih-jTqpL36mB59eeDEYohVmMc1edHhdy4eTMROWYv5pC_CidtZCrhK-2hchXAd0._fsjJbRoiK6GyWprGhHmZrXNCsYm6XhxcMXp7z2C4Z4&dib_tag=se&keywords=l+dopa+nutricost&qid=1771947726&s=hpc&sprefix=l+dopa+nutricos,hpc,143&sr=1-1&th=1'},
    {name:'Magnesium Glycinate', dose:'', directions:'', code:'', link:'https://www.amazon.com/dp/B0CV2RSRFX?ref=nb_sb_ss_w_as-reorder_k0_1_6&amp=&crid=3OCD6EINEJ2PX&sprefix=magnes&th=1'},
    {name:'Chasteberry', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/chasteberry?_pos=1&_sid=d223be0f7&_ss=r'},
    {name:'Collagen', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-youth-collagen-protein?_pos=1&_sid=1f6538469&_ss=r'},
    {name:'Nulytes', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-lytes-electrolytes?_pos=1&_sid=1b3a3a743&_ss=r'},
    {name:'Passion Flower Extract', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Passion-Extract-Equivalent-Capsules/dp/B09P49D4HC/r%5B%E2%80%A6%5D2Caps%2C171&sr=8-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Vitamin B1', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Thiamine-100mg-Capsules/dp/B07L1C5JHZ/ref=sr_1_2_sspa?crid=QFQYPYOI54ZW&dib=eyJ2IjoiMSJ9.9t7DxeVi9l74q1QJjBI2PhpKS_WHGZKL35RLaKINA6tqgS9tZoRfGrBA8wcvQzOwP5fom6f1OSOMXFEYg5vro5519ViMgiLm-4ZqSeGN0LF5Vr5OD5kVWBpYkX5Kp6vMA7n0L9W0wpWnFtfX5YeB33Z_T9Naax3bpgX0pd0xmIl3QCgWTHSHNpMQ-a5AdF660bM_WvYWJxMrG9-xtjUvxuCz3F63UnZocdD07wdEFN8i3EUfU5GT4PB-_Xsik1coUSPCqgRY2_9Nzr_EYmU2YNo_VOwof0ocSPrbEbHjjvI.Xe16wwc4eY02-FT62OAog3l8MT7ENDxipJLxrtxfRS4&dib_tag=se&keywords=b1&qid=1779978593&s=hpc&sprefix=b,hpc,203&sr=1-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Vitamin B12', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Methylcobalamin-1000mcg-Capsules/dp/B0B6DG339Q/ref=sr_1_2_sspa?crid=2R66YQ7LK8KTM&dib=eyJ2IjoiMSJ9.AoyIDJJYdiAb95RiIWz4lZ-IcuSgy6MtA5kcpeN0P3Ju0_4Ud0N9E3PmhBiH5Uks2o4OKV0xdY1JgFn-2FP6L_l7psuT6USphU0x6oaKf3v7HmPODqZ5WtR6X5yi15na8IEhP-yCvTRQ2-2h7ZTcv78qfYhvQAivEw9N4lgP0mOIXz9Y-PCPdcf44wglPDYQ0dRn7ZBYG3J-hioONtCFvRsSraVe2_vh8wUO4TSz_8jWl0zW9Bxt3SolFJMDYa6EL7e-qzNnP8WGO80aezPyooK9ZcbdpZqq_tuobeLwg6g.CKAitYlZhqL1jb1ye--A4ZsBLXWJS5u7oPDS4BhBRm4&dib_tag=se&keywords=b12&qid=1779978245&sprefix=b1,aps,172&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Soy Isoflavones', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Isoflavones-150mg-Veggie-Capsules/dp/B09NS3PKCH/ref=sr_1_2_sspa?crid=3BFTTGE7K35DY&dib=eyJ2IjoiMSJ9.iMCWmNrXeUlZSbiUpcKT-bxYQngX7mz7F1rF-M3-g5mHtkQrYmkvhRCdfIgwil0_SuNlhuERKdic3TlXrLZGPa0Q7pjabkV3xzW_9EWNhloa9x-kLACqIZ1USxSFTE7dziBmsDbj-qEs2107_-I_iH3ZsxIW2CazAQpTTssgQNNZRmdOmFB2dSEPCoF08vVF5-Z8bT_tvZNE7VyPunqJfjM9FI6p7WobzyO1KuUGYrZDhtjaiKrCiB6SA5xK7pVo7r-y3GeMaA2XzCgm2gqNvhJWr5FOUGZvUhjZ-yFerjU.og4J1ubdULiZbCix08QonrDupjW4XycAxRXqCp0IeR8&dib_tag=se&keywords=soy+isoflavones&qid=1779386105&sprefix=soy+isoflavone%2Caps%2C161&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Seeking Health Electrolytes', dose:'', directions:'', code:'', link:'http://amazon.com/Electrolyte-Servings-Seeking-Health-Replacement/dp/B00O2JQWCA/ref=sr_1_1?crid=37SNZU617RIXR&dib=eyJ2IjoiMSJ9.6saf6JaY1zFpq8h37qdaHFhp0m5_5VLEI7L6OnpuwCiNR7nV1uxEKST_OHZnRHLWkGUsDAdxy1exN1I9LSGrt5oOShUCFl-Sq6C257NVGbx8FgJCm0FXFiDXtiPKdNAx3YVoMnV0DDZzC7gPesFlXH3YTgi3OajZA_KV5YuJMB5Y5BcZ56oAV2XmGUUPI_piMW2acBQmXdl00cssa1B_gCRgDDUCcUP73jKspUr_JeC8oNkVDozEf2DK9xRwrc7KP9j5Db_hNjwsXoYOgy-Cme5h-_Z7xuRqipkAEgTeWcE.A92HtZRf4RODt7MHViAteIOoYptw98j--mXe4sHLyL4&dib_tag=se&keywords=seeking+health+electrolytes&qid=1771947931&s=hpc&sprefix=seeking+health+electrolyte,hpc,154&sr=1-1&th=1'},
    {name:'Equelle Menopause Symptom Relief', dose:'', directions:'', code:'', link:'https://www.amazon.com/Multi-Symptom-Supplement-Plant-Based-Non-Hormonal-Non-Prescription/dp/B0DB6P8KHX/ref=sr_1_5?crid=N3QYTXZUPDX0&dib=eyJ2IjoiMSJ9.2FxC_GlEfYd52rYdeptP_vKxg7GpTGv_BdcBpe1b3UGGNP0Q-I5vBQgybuCspVzvFgZudoIxjWnTTHH3t18PYLdd7CPTBx-YRE76NTY0AZVknKLpvuNXYA7VCOmZdySDNle-WcHFN5xhfM1ngKfaSHHMliS3Ufif3gvHPrI3zHUF_oMKKSZDSp-wx_zIh-58W8AQ7LWh8I_MY4u5sGuLTrGi2LWWK_o4KIKghglqjyrrCa-eq4uUxk4q-s_Jh0eUQBiG4YmESYzXUngaYAJEfxSw-AjCwhVCkSx9e1xvF2k.j5voyz-V9hWe32MpA8YJG953ND1akb2VwvD4LQlQj68&dib_tag=se&keywords=equol&qid=1781107442&sprefix=equol%2Caps%2C166&sr=8-5&th=1'},
    {name:'Bromelain', dose:'', directions:'', code:'', link:'http://amazon.com/Nutricost-Bromelain-500mg-Veggie-Capsules/dp/B07TK4ZTLP/ref=sr_1_1_sspa?crid=20VPSKLJLEQL1&dib=eyJ2IjoiMSJ9.n5cGcqEETqmpi8KP3Bu4UnNjKO5cfU3wjl8j_unG_w0aU7ck4NkW_f79sown35p-SKa2HYRVX3Sw0o1Um3RqiNQnE3cqBIOOEIxdz9Cu2k2MJpb21lkbYTpdwBgFx1P6GbjAcsmYprelcsjLxqz8WlHmreWGv9mzBy904RsYpWGYonrqTCDZ5S0VZPFURk4kkS6a-0dA82OtKiXTwEFo5Hkrukb0TxRfrKQlVYeJJXu6_-VbMeJjYDGgKyLvr2yt0eAONrr-8-Ty0HFCbdsTGgjCrRckIXHsA6alGWxV3gA.m_SvVIFyZqVsYfqiVxGszWykHpUem2Zt4JvyYEH9Mws&dib_tag=se&keywords=bromelain&qid=1771947963&s=hpc&sprefix=bromelain,hpc,167&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'L Theanine', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/ref=sr_1_1_sspa?crid=2LXWRPW3UPKQH&dib=eyJ2IjoiMSJ9.jY4_F52w24g7Y0oOG52ITCgyzyoYM1ZJrfMnQIqskcpNj1z8Sk4febn6oE4Dw3XOqLSPtrvQ4nbwmy50R0qsiFuh5PNM_Dl340pO_V4YgRm4E-fnCs1i3Lt9GrecDyoPUXJXGGaSebuYBWUwvUlhtOpRc0jAtwbw3OjZY61N7dPUBW1s_WpKnc0Co5it6DE3wHyIwZWC6G2g0qOJzHZbImJYExO4KqyWm5tNaqohZF1C6n6HI3Ng4ajJs0WT6rycdUaOynFWU8s01Xo46lYBeYNYp-eUHi3Ey71oj1vEUoE.neTU74753GRhNBJ1cniAdaEUWX5ZX1K3--b4QrQOcSI&dib_tag=se&keywords=l+theanine&qid=1771948074&s=hpc&sprefix=l+theanine,hpc,158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Niacin Flush', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Niacin-Vitamin-500mg-Capsules/dp/B01IIDB6JE/ref=sr_1_1_sspa?crid=1SZ1IIQRVKRKR&dib=eyJ2IjoiMSJ9.E5AcMm6qWDpADa6uQBubAGpCFXpqSYyQ2l0JTouRhToPL8D2nQnGflGquqQ4KP51EPo4wVzeHOonzeNM0_J_hFSJ9k_2wXSy371UNmzY5_wLip-GMw14SimazLYLd6Flb_P-kYRf0XKKkHNy0Ck09r2aOYm5LDsIgFPKe3y9RhmPg5XOgNqGHncNLXalLWsZmIL2u1jvv1xNcVfkRY9JlT8SXjC76TiY4X7CXmBTcInN4Zy40wJRItzL3myyVu_Pryhs4T4c8kwkPm3D_V0f2782Vg_GJpsrQmt5z68JHXg.TCWRLuwnajrP9PBIln8wwLiy-w5btroT-t-EE4aYQtY&dib_tag=se&keywords=niacin+flush&qid=1779978714&s=hpc&sprefix=niacin+flush,hpc,147&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'B2 (R5P)', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-R-5-P-Riboflavin-5-Phosphate-Vitamin-Capsules/dp/B0DV8FQH4W/ref=sr_1_3_sspa?crid=2I91ZLFPODO1F&dib=eyJ2IjoiMSJ9.gHX0lADcO0TyTxd_7JJB_ME9ac-y3IXbjJqlw44EdY5nxKVLqHg5hWOVKrnsHsbMfyvbs1CZ-o299EPeGZmmsAduzZSlHveS7HDZ4cdwC2zno7i52yi4vOQz4sCtCmGUTGqxv_cjiCKXzIUbzGlxfUcM9moal7HLRAC5N5Mnr5umsqusLdsvnsn6RTvlc5t9q6zH8yVTTTYHqhvBUyR60QAYTXqBUuyBZyIJ-qYTHzs_F6sdz7qeFmUP8vve32Mxtzz-OGDeZIQLR3MQXFTMNuYqVTwWjcosfb7chhaaPzM.ffsnKIkU298HuHogxnLXl1Grm3hbPkq2-_ziewre8ng&dib_tag=se&keywords=b2&qid=1779978622&s=hpc&sprefix=b,hpc,159&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Equelle', dose:'', directions:'', code:'', link:'https://www.amazon.com/Multi-Symptom-Supplement-Plant-Based-Non-Hormonal-Non-Prescription/dp/B0DB6P8KHX/ref=sr_1_5?crid=1370FM2XYLHEP&dib=eyJ2IjoiMSJ9.rYIEf_mT0nY_7Iea0gXW8fpnkL5rjbiwU-agKInn4BlcSkzaZi72rMOuHEW1uf-bWzWDFvNeBMggfSZfbhB8mJqt8EUn2GwVq4t1PnxsulHYt2bZxS3xDmBrRmB1Q-rnzJhaIG23aMy0lExyXVEHUTqGCfFz3rio09QkHev9Yn-5PGTYeyc0i6ExgeGGhv2gLyglBCmhsJfl19UuduEz-1IW7EyU4pyyE0_TsGxmLAdljehCxRxkCsraCCVlAV5flq5QWwonZOWM7_umCCm5zF49wzZMgp-dbDLppXGMNvw.zsCpTjdVRaxuyZegwRXydNfUZ46fqWsPNZx2na_XhHU&dib_tag=se&keywords=equol&qid=1779385932&sprefix=equol%2Caps%2C170&sr=8-5&th=1'},
    {name:'Naturdao Plus DAO Enzyme', dose:'', directions:'', code:'', link:'https://www.amazon.com/dp/B0CBPKN6F2?ref=nb_sb_ss_w_as-reorder_k0_1_3&amp=&crid=TDNC54AR6SJQ&amp=&sprefix=dao'},
    {name:'Blue Light Glasses', dose:'', directions:'', code:'', link:'https://www.amazon.com/dp/B086WQ1CL8?ref=nb_sb_ss_w_as-reorder_k4_1_4&amp=&crid=33N0YVHUB3WSL&sprefix=blue&th=1'},
    {name:'Phosphatidylserine', dose:'', directions:'', code:'', link:'https://www.amazon.com/dp/B08XYDDXDC?ref=nb_sb_ss_w_as-reorder_k0_1_18&amp=&crid=28BOB4M36LSXJ&sprefix=phosphatidylserine&th=1'},
    {name:'Methylfolate', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Methyl-Folate-1000mcg-Capsules/dp/B07T8C9N97/ref=sr_1_1_sspa?crid=3RZ2DE9ES2S47&dib=eyJ2IjoiMSJ9.vyA3RowjitYuBU9aybi8-dOvSb5tHNE02Toihcv7q7xQk1x-pJjwf7hHt54SRxrMj6ej23LexFldTQvU2VEwefCehCKao8XiszZv7tSU7TI59-j6PpccyqD3m6excHDWKqcHZzl6SKvp2U4sYFJyjrZU0r94Rs72ZlXx8RfQ6LgYTQQOuamX9EHZ4beHLkYGUTIjdckUIfkugiYU74lgwmMAUUUJ3O0rX4q1dy4dq5UeAka0j4gJkEAWTZXoPMx62AYGTrFtmC8DIH_pFsU2uS8x0Pc3gp3TBtZDjMThIzg.uTfjV76IH_nIpo_V7GCI3FqyROz3yVpJQYqEeiax63Y&dib_tag=se&keywords=methyl+folate&qid=1779978286&sprefix=methyl+folat,aps,165&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'HCL with Pepsin', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Betaine-Pepsin-750mg-Capsules/dp/B077NS1KDK/ref=sr_1_1_sspa?crid=LO4JLV80OOZD&dib=eyJ2IjoiMSJ9.M2TDkYDbWfgTuIL1Nq9wTI3d9FV2XrstGZQVTlKzU4LIUibLhyMqRWSGUZAUZ7Jp8n7pDXFLCaCMYcrbp5AqBwPq6oxzjz4-UG6suD1TaT2hqqZvaX4-o0R7xyAo_s_NBP6J8yakosM52hLcyL-1RM5MkEuN4GDSn1bs-d3WIubxPyqu-NeF-3qATqzGLRQ6LPujIL1JDbOLWMTPkpJTkgnex8RJBgHFqxPVRvX3VNms_fZUwJHy87_EDTAoZXqNl7eADdA2w1NNjQfolmVdBJ5Z3EIZYSA09AKBcpDtyKg.LLw_0Pq6xSVkR-66h4w_0MwLRqq7p4o7NNmqrvodTw8&dib_tag=se&keywords=hcl+with+pepsin&qid=1779978476&sprefix=methyl+folatehcl+with+pepsin,aps,510&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Soy Isoflavones', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Isoflavones-150mg-Veggie-Capsules/dp/B09NS3PKCH/ref=sr_1_1_sspa?crid=3PKL06Z8ISY50&dib=eyJ2IjoiMSJ9.7VuvOe36YCiErQI0ElG69uCbM8FcdjIIJ1iSMfxiT4lFRD2SqjWqbL4ITGwPXBRU0twqHtB2Uo0gRVmdThzmNghiC-Ci47k9smd8JbyzHr2IIYqxo9N-ifTFzO6bKdDw_mmT53zupWv1YwlDhem0jaO9q5BuhAXf52VuI2pRzNI6E-YVsFb5mnF_2obbl9HvcrnYCIa938RYDr_mwo1R-_esr2fKJuMkoQTwa-O-Fw8yXm2prz34KpcJqKFLKz0TRdNAr-inTz8QFN9sB4xNdCuCxHN23WV25a51CE6Q82M.Mcx0cdRNEsywLxI8UFv9oAI7gcQPm1sMskNG9f7pCpc&dib_tag=se&keywords=isoflavones&qid=1781107479&sprefix=isoflavone%2Caps%2C173&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Methyl B12 / folate with Calcium', dose:'', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Methylated-Vitamin-Supplement-Capsules/dp/B0FNFR1MPT/ref=sr_1_2_sspa?crid=1LCZR7KVTVHBS&dib=eyJ2IjoiMSJ9.PUAouw-Wsls96gXYnN2TWx1a2bSXBvwU-CwHZCM6Flr3bdMjO1PV1DlnVat3PVMMrUy36yqa2rj-XJM56lMENqLLampbxRs4Tn1qA-5FsNAvb2GaBz3CM5Sco14V4GCXomGmE-385eIaFiMd7cLxqOQGbJvK_RcrWmc_VZ5cnPfBpZ1sMfRN25fgVAjVHD03H8Jjjayopa40hHLrOe1jEiAoTbq-s5Ix1s6WNvXG2mTZ2UvZOJEU6z7gwHjvtbn35R1qnoB2m7GlyK2-saO0nf_xKS3fn_viA-3oRk7t6-E.BqNU5BgP8MDywyBWHVNM8c925zBeOh_9RKbiewQlQZQ&dib_tag=se&keywords=methyl+folatehcl+with+pepsin&qid=1779978414&sprefix=methyl+folatehcl+with+pepsin,aps,175&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'DIM', dose:'', directions:'', code:'', link:'http://amazon.com/Nutricost-Diindolylmethane-BioPerine-Veggie-Capsules/dp/B01HQR0RZW/ref=sr_1_1_sspa?crid=11OF5WAOKR9O7&dib=eyJ2IjoiMSJ9.L6Nd8gjZT3hjhcrxiVYjy19shskSJQgOm7gGfCp2K7fytawBc4ERvYGhBfC0IiK6R8SBX98Pt2vvmR7WeV7J5tLCH_ugkmVREZAvrazbLRzzRbef9GBkCP4zABGeNuRg-dY7S8DbMPFHm1qtMyFzajmAasXEPIkTMXKxFCsxIjLvgcLxGAWfF1ZO4sktHNc6VWlSlJPJX8rwDiC9jVPf1YG3kFBE8DAi5v3-jMRwO3CdTTHmhnNXY-KKyvsw6f7-NDA9_MiYVwuHcqlbnkm3UUByr0jvoqLsvEI8-E633Lg.-aEJjuWyPYjUCw5-H7hqJyJUz_E0yVJ4uGkVxNGOnPo&dib_tag=se&keywords=dim&qid=1771948124&s=hpc&sprefix=dim,hpc,165&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Utilyze', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/utilyze'},
    {name:'Gourmet Greens', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/gourmet-greens?_pos=1&_psq=gourmet&_ss=e&_v=1.0'},
    {name:'GDA Max Pro', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/gda-max-pro?_pos=1&_psq=GDA+Max+Pro&_ss=e&_v=1.0'},
    {name:'Flora-Protect', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/flora-protect?_pos=1&_psq=Flora+Protect&_ss=e&_v=1.0'},
    {name:'Thyro-Boost', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/thyro-boost?_pos=3&_sid=576ab4a3c&_ss=r'},
    {name:'Ashwaganda KSM-66', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/ashwagandha-ksm-66?_pos=1&_psq=Ashwaganda&_ss=e&_v=1.0'},
  ],
  'Liver & Cholestasis Support Protocol':[
    {name:'L-Methionine', dose:'400mg per every 54lbs of body weight', directions:'Combine with B6, B12, and folate for optimal methylation.', code:'', link:'https://www.amazon.com/dp/B09JJMQRY3?tag=bestprices-20'},
    {name:'Alpha-Lipoic Acid (ALA)', dose:'300–600 mg, 1–2 times daily (preferably away from food)', directions:'R-ALA (the active isomer) may be used at 100–200 mg twice daily.', code:'', link:'https://www.amazon.com/Nutricost-R-Alpha-Lipoic-100mg-Capsules/dp/B09NS4HZZB/ref=sr_1_1_sspa?crid=SF8UH0NF2V7Y&dib=eyJ2IjoiMSJ9.RUd1OEwwOhhHApsedR4myv-8ispeDRtWHPJx9UOpmvAAvgo6NjgSc7KQ8klEOf8U6sCU9tg3vpYGHFq_eIpjPBSOvj85AiLZ4f2wwqBhxlJ2EuQcHUgcwXOwPNvFlflnWB5xt3PKerBZDwyHtTuFiih0uS4utIjpJTsuHHmWd0pkZ4WRkOU_3dWQCAa3flV6bHX0DCcklQh7J-3W1aiL2xj8YB1fzMLor_Te7Y9INYxOV1aGsxL1ciHTOVpsh4HgqvW9qNIVZn74dEpMtrSfkT98zBYmQngcvVk-32JaDC8.-qanmBvJz6mptWnT2ERrgaZssi4esK3jgr5w7RuCkHM&dib_tag=se&keywords=Alpha-Lipoic+Acid+%28ALA%29+-+use+100mg+one&qid=1779825849&sprefix=alpha-lipoic+acid+ala+-+use+100mg+one%2Caps%2C172&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'N-Acetyl-Cysteine (NAC)', dose:'600–1,200 mg, 2–3 times daily', directions:'Take on an empty stomach or 30 min before meals for better absorption.', code:'', link:'https://www.amazon.com/Nutricost-N-Acetyl-L-Cysteine-600mg-Capsules/dp/B01CUQFKW4/ref=sr_1_1_sspa?crid=P91ZVYEHTN2U&dib=eyJ2IjoiMSJ9.WZ4cTIwUUe_cuKs8l0bOKQRGolKOJimjiLnnpVNL-tsVboEaP7q5-bPw31-_YcdXrVYzTkFJ7I-OLPfQWxAl5GIizfZMWKY3JJCFEsfSwZicNoQrV_FW99fVeK3PUH47UkOjQNo8iKf_cLNGFOZVG7yx2JmKkvP1j86QATeJ7j1WegT2JPvqEvzi38q4TG9iOqzXbVHtPkOMuUlaE5dbx3tlMma-PMsCZBR314P8YU1Z-2VnE5moNhhQvgKkH5kSUuvIk8Kqq7QEs5QiM2rqEUJzO_ssvS2LC6P0qCTYdUM.TZ5-EpWgkoSz3pgogNtRJX5v9YRICAyXo6RT708oicw&dib_tag=se&keywords=N-Acetyl-Cysteine+%28NAC%29&qid=1779825954&sprefix=n-acetyl-cysteine+nac+%2Caps%2C309&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Glutathione (Liposomal or IV form)', dose:'Liposomal oral: 250–500 mg, 1–2 times daily / / / IV (clinical use): 600–1,200 mg, 1–2 times weekly under supervision', directions:'', code:'', link:''},
    {name:'TUDCA (Tauroursodeoxycholic Acid)', dose:'250–500 mg, 2 times per day with meals', directions:'Often combined with NAC or ALA for synergistic liver support.', code:'', link:'https://www.amazon.com/Nutricost-Tudca-500mg-Capsules-Tauroursodeoxycholic/dp/B07WFRD1ST/ref=sr_1_2_sspa?crid=3C8S5RFH9PUVE&dib=eyJ2IjoiMSJ9.dbOYkJfkKrCmDjPD4HFBRmtiCsLfjjIVDyP7HcGJleBUeztGDj1mzZ40CaF71iSbXQxFscvCQHVpKILTExMNq24FAzHfaziWZT9z9US3FIugOSQjWYEWuEhxEVEzAOdd1iQRBRu4WzAX_2Us9_i-c8QLzIUKLIpWhDMX2SI2GK0k3WhSTxSJ3iX9gopNP0BajiCnJulk63anUlydqF97LWtF0rn9gUKXuAW8-1k2Uh-GbTbBWiolcOE6pcdkaz6bo2nPMzEqSFtPCY4VjO1WADVyBnU_U6JXETpAycrGTGI.Uc2Qt2HuzxQHEIuRwQcFkJ36HB1RXSkRTxGxoMEKA9g&dib_tag=se&keywords=TUDCA+%28Tauroursodeoxycholic+Acid%29&qid=1779825981&sprefix=tudca+tauroursodeoxycholic+acid+%2Caps%2C218&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
  ],
  'Nervous System Regulator':[
    {name:'Standardized Saffron', dose:'30mgs upon waking', directions:'', code:'', link:'https://www.amazon.com/Potency-Saffron-Extract-Capsules-Safranals/dp/B0B69LLMRH/ref=sr_1_7?crid=F2IGUDY31TTJ&dib=eyJ2IjoiMSJ9.BDc2rPc8Cy9nDdOFr6d6NTxyC_qboL3shawpvjQBANLBABiAalU5crKmkdO3ToUBuOl2yQzkgDCzImgeqiK14UQjYJYl2DlORNjt_8isylmnImKJKzKAqvtAT9mRwzLN-FQ1kWJPSx6FIZ3NPQb8PGlArkIvTZz0CGhRV9VkrQMlh3dWMPYbcNT0ZTb32WEXlzY-pqeBb15JUt1gLmxoeK-6MhHuWrTJWKcFTCk7E9WTCz5FE7djW4YwCN7kw2psmf2TGLSKQ7sLpKPNRLuHshSSsh2P8PrOpaFFFFi1Du4.436qcsa3cpqmkZ6M6Z3Va0b-VO-thpDSlm40GzE640I&dib_tag=se&keywords=saffron&qid=1774446210&sprefix=saffron,aps,170&sr=8-7&th=1'},
    {name:'L Theanine', dose:'400mgs upon waking', directions:'', code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/ref=sr_1_1_sspa?crid=2LXWRPW3UPKQH&dib=eyJ2IjoiMSJ9.jY4_F52w24g7Y0oOG52ITCgyzyoYM1ZJrfMnQIqskcpNj1z8Sk4febn6oE4Dw3XOqLSPtrvQ4nbwmy50R0qsiFuh5PNM_Dl340pO_V4YgRm4E-fnCs1i3Lt9GrecDyoPUXJXGGaSebuYBWUwvUlhtOpRc0jAtwbw3OjZY61N7dPUBW1s_WpKnc0Co5it6DE3wHyIwZWC6G2g0qOJzHZbImJYExO4KqyWm5tNaqohZF1C6n6HI3Ng4ajJs0WT6rycdUaOynFWU8s01Xo46lYBeYNYp-eUHi3Ey71oj1vEUoE.neTU74753GRhNBJ1cniAdaEUWX5ZX1K3--b4QrQOcSI&dib_tag=se&keywords=l+theanine&qid=1771948074&s=hpc&sprefix=l+theanine,hpc,158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'5-HTP', dose:'100mgs', directions:'Take one hour before bed', code:'', link:'https://www.amazon.com/Nutricost-5-HTP-100mg-Capsules-5-Hydroxytryptophan/dp/B01A1DL4DW/ref=sr_1_2_sspa?crid=3SDCWCXXX2CBS&dib=eyJ2IjoiMSJ9.SUZoyOVEI5IemjoXF7OSct4TEg7WyFFz2ATI9S2U6tXM0CNjVDM0aV13swdIQ6FjTDdwDZacb-O84CXUJVyiaLacZGRLqxQsrhcxlO1bUcIxy-dGGFUuegtskSNjPxX11Cb1QcblbM7ls8lLgbF3kAiQj2GwqASvf8fuPdidHd79FkOk59Sgden4BsRnYd3fukMA2BfaIJhB_mJrDmNWttQ36Ymu64AMfnP-Nhya69Ac3Oz50Zix3YYsCsxxH5GFGL12b3IkzvqWdIhgwiAyRmZRIHZeFxBu8AmzLny6eWc.3GPlORMvH654uVEj4MgBgOCGcbxQUsU5wMpb6ckwoLM&dib_tag=se&keywords=5htp&qid=1774446321&sprefix=5htp,aps,180&sr=8-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Magnesium Glycinate', dose:'350mgs', directions:'Take one hour before bed', code:'', link:'https://www.amazon.com/dp/B0CV2RSRFX?ref=nb_sb_ss_w_as-reorder_k0_1_6&amp=&crid=3OCD6EINEJ2PX&sprefix=magnes&th=1'},
    {name:'L Theanine', dose:'200mgs', directions:'Take one hour before bed', code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/ref=sr_1_1_sspa?crid=2LXWRPW3UPKQH&dib=eyJ2IjoiMSJ9.jY4_F52w24g7Y0oOG52ITCgyzyoYM1ZJrfMnQIqskcpNj1z8Sk4febn6oE4Dw3XOqLSPtrvQ4nbwmy50R0qsiFuh5PNM_Dl340pO_V4YgRm4E-fnCs1i3Lt9GrecDyoPUXJXGGaSebuYBWUwvUlhtOpRc0jAtwbw3OjZY61N7dPUBW1s_WpKnc0Co5it6DE3wHyIwZWC6G2g0qOJzHZbImJYExO4KqyWm5tNaqohZF1C6n6HI3Ng4ajJs0WT6rycdUaOynFWU8s01Xo46lYBeYNYp-eUHi3Ey71oj1vEUoE.neTU74753GRhNBJ1cniAdaEUWX5ZX1K3--b4QrQOcSI&dib_tag=se&keywords=l+theanine&qid=1771948074&s=hpc&sprefix=l+theanine,hpc,158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Ashwagandha', dose:'2 capsules', directions:'Take one hour before bed', code:'', link:'https://www.amazon.com/Ashwagandha-Ayurvedic-Standardized-Clinically-Cardiovascular/dp/B01CZ2EGQY/ref=sr_1_4?crid=23Z7U2Z6NNGOJ&dib=eyJ2IjoiMSJ9.gKtzvW6y_Wapiqq_lYNfck4T2A0UzXalSBfv9Ed_BvOHmV_SpBMmOkrHnS4jr9Em_lWOXzAtiqJvpZzMHu8mjZGOfDJsUi3QNvDBiZ6NABoO7BouHGkUeIRlVmPAKMO4UcnfnW0W0jUYZF1pd_OF-bgwsqkXyuq93nd2GdkyxHx7wp5gzew7GUvGNK6USTjuziqU2Hv-_aqOZQZgWFiaw9xcRDDmuS_jjqp9fObiLZU5Rd55MTg5CXKZff2pmYZm7X_h_UKXo8BVGM1XTuANyJp70oWmFkbeni7iENtgMwQz6BPmlH315WGS0tNnj1hMAPqp03w_ejtqURU603jmAJuwG3HG0OSHLLiCqnFPk6c.XJIv3jHqYS56mWC6n0vDq8tbvg0T82E7EH45W6NusoU&dib_tag=se&keywords=ashwagandha%2Bsensoril%2Bnootropics&qid=1738528575&s=hpc&sprefix=ashwaganda%2Bsensoril%2Bnoootropic%2Chpc%2C153&sr=1-4&th=1'},
  ],
  'PCOS Protocol':[
    {name:'NuBalance', dose:'6 capsules with Meal 1', directions:'', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/nubalance-plus?_pos=1&_sid=15063ee53&_ss=r&rfsn=7938393.037ac74&utm_source=refersion&utm_medium=affiliate&utm_campaign=7938393.037ac74&variant=36829784703133'},
    {name:'Calcium D-Glucarate (Nutricost)', dose:'', directions:'2 tablets (1000 mg) with Meal 1 and Meal 5', code:'', link:'https://www.amazon.com/dp/B09NPFFSVC?ref=nb_sb_ss_w_as-reorder_k3_1_7&amp=&crid=A0QYAD3GAPJ0&amp=&sprefix=calcium'},
    {name:'L-Carnitine', dose:'10 ml once a day, between meals', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/liposomal-l-carnitine?variant=40741984305314'},
    {name:'N-Acetyl-Cysteine (NAC)', dose:'1800 mg/day', directions:'Take on an empty stomach or 30 min before meals for better absorption.', code:'', link:'https://www.amazon.com/Nutricost-N-Acetyl-L-Cysteine-600mg-Capsules/dp/B01CUQFKW4/ref=sr_1_1_sspa?crid=P91ZVYEHTN2U&dib=eyJ2IjoiMSJ9.WZ4cTIwUUe_cuKs8l0bOKQRGolKOJimjiLnnpVNL-tsVboEaP7q5-bPw31-_YcdXrVYzTkFJ7I-OLPfQWxAl5GIizfZMWKY3JJCFEsfSwZicNoQrV_FW99fVeK3PUH47UkOjQNo8iKf_cLNGFOZVG7yx2JmKkvP1j86QATeJ7j1WegT2JPvqEvzi38q4TG9iOqzXbVHtPkOMuUlaE5dbx3tlMma-PMsCZBR314P8YU1Z-2VnE5moNhhQvgKkH5kSUuvIk8Kqq7QEs5QiM2rqEUJzO_ssvS2LC6P0qCTYdUM.TZ5-EpWgkoSz3pgogNtRJX5v9YRICAyXo6RT708oicw&dib_tag=se&keywords=N-Acetyl-Cysteine+%28NAC%29&qid=1779825954&sprefix=n-acetyl-cysteine+nac+%2Caps%2C309&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&psc=1'},
    {name:'Saw Palmetto (Pure Encapsulations)', dose:'2 capsules with Meal 1 and 2 capsules with the last meal', directions:'', code:'', link:'https://www.amazon.com/Pure-Encapsulations-Hypoallergenic-Supplement-Concentrated/dp/B000H23PLW/ref=sr_1_1_sspa?dib=eyJ2IjoiMSJ9.FuePeJaL_8wOW7ETaAB9rOa0SGRmBcsUa3AuQeVPCxSE7mtb4a-y4clguHYEm1w38Ue5ah8ZOp24i6Y6HTAdDDLgvKuT_p4Rq75Ls4p65AengWbyCt84wdICMFriMPahMfbZ1fqHnUzROSAL7_kKRr5n_oTW3fswfRZ1CvOKomT-TY19Dhfws_aIaaZaUujKUeNQST9qArNy1G85LaOMu7RX14qawfdXwf_-Zxl13q-tlMHV7QlHkHKEl2wnIk8rz5yLrC3mavi73-Eedb0E1OHROE5UsEWLdX-nV5wKOa4.EK4k71jPrqHmwtksjKgjjWk4fQLl_HwVcJvP4sYTzAo&dib_tag=se&keywords=saw%2Bpalmetto&qid=1738530247&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
  ],
  'Thyroid Protocol':[
    {name:'Iodine', dose:'225 mcg daily with Meal 1', directions:'', code:'', link:'https://www.amazon.com/dp/B00V9Q6IZQ'},
    {name:'Selenium', dose:'3 Brazil nuts with Meal 1', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Selenium-Capsules-Non-GMO-L-Selenomethionine/dp/B079B2PDW1?th=1'},
    {name:'ThyroBoost Plus (Nuethix)', dose:'2 capsules daily', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/thyro-boost-plus?variant=42832227467497'},
    {name:'B12 Liposomal', dose:'0.5 ml daily', directions:'1 full dropper discount code is TOGNIETTI10 for savings', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385'},
    {name:'Black Seed Oil', dose:'10g/day', directions:'', code:'', link:'https://www.amazon.com/Organic-Black-Seed-Oil-Liquid/dp/B0B2R57WWC/ref=sr_1_1_sspa?crid=1ICV4SHCF5M9W&dib=eyJ2IjoiMSJ9._uigJadUJvbrr51cmjvoH7QA07rDs9nA6rnj-w_-Zj23mZSs4gHcK0rT3uzYFBHhBhvSrIgsv7iCl6ih4yhAPiDGAPtwi3BbVMNF5GkceQae94zkmqdLjQQBpvbUfe9vpCBedLqhXmqUIcGpNYhaFbnxBy1JBX72A2IcYqVXWO6__yttBvhNjo5mhbjI3UY3f3OfTicINBu7EB8_h0h7dBftei7XFfDoUQak40JTbuOd1w1v537UBpZw44SSRP6NLrOY1YTpJR9dDnTYstlIa0g8XkfIIq35tmffNQQvfqc.4gvY6tSjmHZ1mc5_2WWpCHLe1m6TuukX-6oMGowjphM&dib_tag=se&keywords=black%2Bcumin%2Boil&qid=1763316428&sprefix=black%2Bcumin%2Boil%2Caps%2C165&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
  ],
  'Juice Plus+ Products':[
    {name:'Super-Biome Probiotic + Prebiotic', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/super-biome-probiotic-prebiotic?partner=10628434&variant=46732973605122'},
    {name:'Super-Biome Probiotic', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/super-biome-probiotic?partner=10628434&variant=46732973572354'},
    {name:'Super-Biome Prebiotic', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/super-biome-prebiotic?partner=10628434&variant=46732973539586'},
    {name:'Superfood Powder', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/superfood-powder?partner=10628434&variant=45881054298370'},
    {name:'Fruit, Vegetable, Berry & Omega Blend Capsules', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/essentials-capsules?partner=10628434&variant=45438349541634'},
    {name:'Fruit, Vegetable & Berry Blend Capsules', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/fruit-vegetable-and-berry-capsules?partner=10628434&variant=45438349803778'},
    {name:'Fruit & Vegetable Blend Capsules', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/fruit-and-vegetable-capsules?partner=10628434&variant=45438349607170'},
    {name:'Juice Plus+ Luminate', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/juice-plus-luminate?partner=10628434&variant=46029317669122'},
    {name:'Berry Blend Capsules', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/berry-capsules?partner=10628434&variant=45438349476098'},
    {name:'Omega Blend Capsules', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/collections/capsules/products/omega-capsules?partner=10628434'},
    {name:'Fruit, Vegetable & Berry Blend Chewables', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/fruit-vegetable-and-berry-chewables?partner=10628434&variant=45438406787330'},
    {name:'Fruit & Vegetable Blend Chewables', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/fruit-and-vegetable-chewables?partner=10628434&variant=45438407016706'},
    {name:'Berry Blend Chewables', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/berry-chewables?partner=10628434&variant=45438406656258'},
    {name:'Variety Shakes', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/variety-shakes?partner=10628434&variant=45438292427010'},
    {name:'Chocolate Shakes', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/chocolate-shakes?partner=10628434&variant=45438292525314'},
    {name:'Vanilla Shakes', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/vanilla-shakes?partner=10628434&variant=45438292492546'},
    {name:'Mind + Body Wellness Duo', dose:'', directions:'', code:'', link:'https://us.juiceplus.com/products/mind-body-wellness-duo?partner=10628434&variant=46614385426690'},
  ],
  'NDRI':[
    {name:'Mucuna Pruriens', dose:'', directions:'1 cap upon waking', code:'', link:'https://www.amazon.com/Nutricost-Mucuna-Pruriens-400mg-Capsules/dp/B07JHN2JK6/ref=sr_1_4_pp?crid=1WBZSUP2W6D0U&dib=eyJ2IjoiMSJ9.Zrhdbk38mtc0lNKVsyxkgboZdUanCnSJhw3TE97T7asSNj7EozCo5-T4jHEJbcRknGDoTAbxogw7v5kWCc_suz0K5ffaGz3XCRA_16YK3r2hnZ2ewhz9VWEQPWYxMfnlQ9Y2NPKhsTrRDIsfG72nHbPSJlqN83b3e3RoW4td-PtFkka1_iy9K5FhUGZSJpi0BuusQi_nJqQmX_XBnlzU8KUJq4j4776sthltYippoYJzCDSGzKyFtcpNfsDPQpTAqbMuP6k78jdK-ZlgezE7GEHqEF9VDSJY5j01sNnBoyU.NsmI45m976MjMDz5YPcGlVyJo3_ECs7g3MPn0wfPjv8&dib_tag=se&keywords=mucuna&qid=1774446476&s=hpc&sprefix=mucuna,hpc,175&sr=1-4&th=1'},
    {name:'L Theanine', dose:'200mgs', directions:'Take one hour before bed', code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/ref=sr_1_1_sspa?crid=2LXWRPW3UPKQH&dib=eyJ2IjoiMSJ9.jY4_F52w24g7Y0oOG52ITCgyzyoYM1ZJrfMnQIqskcpNj1z8Sk4febn6oE4Dw3XOqLSPtrvQ4nbwmy50R0qsiFuh5PNM_Dl340pO_V4YgRm4E-fnCs1i3Lt9GrecDyoPUXJXGGaSebuYBWUwvUlhtOpRc0jAtwbw3OjZY61N7dPUBW1s_WpKnc0Co5it6DE3wHyIwZWC6G2g0qOJzHZbImJYExO4KqyWm5tNaqohZF1C6n6HI3Ng4ajJs0WT6rycdUaOynFWU8s01Xo46lYBeYNYp-eUHi3Ey71oj1vEUoE.neTU74753GRhNBJ1cniAdaEUWX5ZX1K3--b4QrQOcSI&dib_tag=se&keywords=l+theanine&qid=1771948074&s=hpc&sprefix=l+theanine,hpc,158&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Rhodiola (optional)', dose:'', directions:'500mgs upon waking', code:'', link:'https://www.amazon.com/Nutricost-Rhodiola-Rosea-500mg-Capsules/dp/B079C2J9FP/ref=sr_1_1_sspa?crid=3HSIDJ6YVO79I&dib=eyJ2IjoiMSJ9.sbsPtYINRJtrVDtczkHcoy-H0POdgP9islGO5yiSSL7t2rxKnq8ogi4WdFFfrugYvTEdqPkivW7sjsunSHO0lLbQbPTQqiO2U5eNJ_rHPoULDEmUjb4cs8kHfKf-gkvKMCneGJMapnihPKXu_ctTGF-TZ1BuO6t0K6KEshjZ7niagvlJcq111n1sQhl2J-jucRete5ajCPbFmzeeyfRQo7sI5EwuZXwecrL_HNxBVO2whR1RTEDTVEYXXN8T3apYcBCZAYr8XgtkPYZsFjCaj_MaOnlwbAzYAOJM24_15LI.ADyFRQnc14mG0XHi3IxeZIYnZFZtZwVUYYM6EJdgkds&dib_tag=se&keywords=rhodiola&qid=1774446683&s=hpc&sprefix=rhodiol,hpc,145&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
  ],
  'Histamine/MCAS Protocol':[
    {name:'Quercetin (Nutrabio)', dose:'1 capsule with meal 1, 1 capsule with meal 2, 1 capsule with meal 4', directions:'', code:'', link:'https://www.amazon.com/gp/product/B01MU30S6Z/ref=ox_sc_act_image_2?smid=A2YD2H3KGK1F4L&th=1'},
    {name:'Bromelain', dose:'2 with meal 1, 2 with meal 3, 2 with meal 4', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Bromelain-500mg-Veggie-Capsules/dp/B07TK4ZTLP/ref=sr_1_1_sspa?crid=20NYBGT84GBMN&dib=eyJ2IjoiMSJ9.n5cGcqEETqmpi8KP3Bu4UqMdrp0G-L3Hehn1jS8GgRQaU7ck4NkW_f79sown35p-b1yy0WPzznygplfolm5E8yXgje6lFDytHum_kGR9xLg_QGSXo0btHKL4c53zZBhafGAqPJIE3_Cpd6_i3lf28IJiv7XJl9rIXV6xlysEyLweNixHGSJCG_gPjutbM3oyivnu9okHqtyHeqPpHxm6GLq0glZZ5aV9uMbYzhx-zwsPZkL2U0FtRMoH1oki-v9u4hcvNnORQG7NSCEijoQGkOevqzzCNFd8fg06dbzEpac.Y-0swoqb90Bk0UYYtyUUm1pits3nWb6f5t0O3Oc0abc&dib_tag=se&keywords=bromelain&qid=1778011719&s=hpc&sprefix=bromelain,hpc,146&sr=1-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'Vitamin C (DAO cofactor and histamine degrader)', dose:'2 with meal 1, 2 with meal 3, 2 with meal 4', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Capsules-Vegetarian-Non-GMO/dp/B0B5FY7DKP/ref=sr_1_3_sspa?crid=2OVUSAYHRGI3H&dib=eyJ2IjoiMSJ9.szS6mdgo4HVtdAuzGjpYFZvzIIzCrpqfvPIjYKDbiR2BCL12OTexwTI547a25zHOsSIw3Hqi9bie6B3DTE3LF-v5Etjxz0TYhK6KVAgzWZWMLqbXMhhHa2SVWCUoljNp3t11WJpOJJBU4ksGtXKJBn8Q_qKNICKsFRvdfBDNcuHP512WSXuObOGjMJOSWGRI36tmH8H0SbDQ7lqPTZcZ1TZhdlbfrfteYW-up7RoFI9uV4x_pIB432dW12P70nbEFv2FDyqooHcfnVeXFZ08-ualdSjk9-Q6TBesPeuLflQ.I1-atY0QGotRXYNxrqsmvGXJjwSbAScRIRKH9EGH7Og&dib_tag=se&keywords=vitamin+c+nutricost&qid=1778011785&s=hpc&sprefix=vitamin+c+nutricos,hpc,126&sr=1-3-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'GABA', dose:'1 cap with meal 1, 1 cap 1 hour before bed', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Gamma-Aminobutyric-750mg-Capsules/dp/B09CXT8S6S/ref=sr_1_1_sspa?crid=9Z5GPG82UQJH&dib=eyJ2IjoiMSJ9.-UUZ-YqufIQ6mSPX6cW7x8FhA8dEmSk9SgRYv0c84NrZHdieKSes99A77ldLkI7OC-1OrXUr8gKtnURP1AK2Lw4QlPFRFie2znKK8l72YvfnOjdogUdmuuFOyBT-NcCNW66MCvlHh53EyQ1zHgNPE-akSCkEC5zjytJNtGQsJI3fKyRJGrulLXQeik-O-08LWxcRL8QPlljRZB7d0UvUL4aAe_tEXblapfSYX3O9rcCtE6gT6bLM3RzvxZG32z9crxzLMrCRKeP1EgHB_1nDdXKGOUp72IEb8BYfHMj0_Ls.4-tT5G9RX9_WQuBq_yU5TxlkQwlPzjJOOMx-1rnxdLg&dib_tag=se&keywords=gaba&qid=1779123412&sprefix=gaba,aps,204&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'DAO', dose:'1 capsule 15 mins before meal 1, 1 capsule 15 minutes before meal 3 and 1 capsule 15 minutes before meal 4', directions:'', code:'', link:'https://www.amazon.com/gp/product/B0F39X6ZPL/ref=ox_sc_act_image_3?smid=A2EJCTH67GJMT3&psc=1'},
    {name:'Probiotics HistaminX', dose:'1 capsule upon waking', directions:'', code:'', link:'https://www.amazon.com/gp/product/B0773SY1X2/ref=ox_sc_act_image_4?smid=AQ9D9YX2TEHKA&psc=1'},
    {name:'Zinc + Copper', dose:'2 caps with meal 1', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Copper-Capsules-Servings-Serving/dp/B0FR7MC4MF/ref=sr_1_4?crid=2T66BZ2KK2RNK&dib=eyJ2IjoiMSJ9.bJj2JF2yUY2uxZCG6ik4KTjt89hhxDs7rrv_z46yth6NPNqVlmc1pMyVUvK_bgKlxFp4JlPw3iyD115bmwD5ZVdd2mKJzqYAtWYL3AVk3PZCLtbM0B7FZOdb4j-t5Juk6tbVdOrZlq9JIKcSL03zOv6NXbw0tW-81TUHCl_hu5FgDMK1pyBI_fQ5CMnmctV5Z4AYCZCJBswZzxfMe62-KWp6fxtj2-FzvizGls--o2wWRukW6AP23Wp08tFxEdCjJo3FS9khYDlXoCYMYcrfo5dKRVcrDrEWWQ8kt1VVeWk.OlHxZkJEukkXz5oCK-W90IoTTyFeTrA5yb937eMyPzQ&dib_tag=se&keywords=zinc+and+copper&qid=1778012220&s=hpc&sprefix=zinc+and+coppe,hpc,145&sr=1-4&th=1'},
    {name:'SAMe', dose:'3 caps 1 hour before bed', directions:'', code:'', link:'https://www.amazon.com/Nutricost-S-Adenosyl-L-Methionine-Serving-Servings-Capsules/dp/B09JJMQRY3/ref=sr_1_2_sspa?crid=3URB6Y21Q84YE&dib=eyJ2IjoiMSJ9.A4BShXjgFbp2OtxRqLh2rB6Q-gE1hx1pSlN22RUTgi2y-VNLLTltpRB2tXfkbBDIJb8NQdrchl9rzrZzlT7lHwQRvvJuia3cdgPKNF50pGbgWK2UeZzF7tKfFJdSMm4Bwuml6ooWdl2xXDOTeE7cV0buEF7HB9VJ4Rv0gO-H_wxk-kpfqcjTERrPMXEHMMm4JtOLFFnumhYgXTmNYmevi5oR7NGyq3GJVJdWg_ag4I6JU6QAmNmVhgYHxD50E-d5tR5LwgoeaCAej_9Sabna1qL1i2AhtlufGaHMjRa4oGc.yt4-kxbP3RQOYnD7alcCTJDPiV-7te1z1ISdhA_VlWg&dib_tag=se&keywords=SAMe&qid=1779385745&s=hpc&sprefix=same,hpc,185&sr=1-2-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1'},
    {name:'B6', dose:'1 cap with meal 1', directions:'', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Supplement-Capsules-Pyridoxal-5-Phosphate/dp/B08YS9T41V?th=1'},
    {name:'Zyrtec', dose:'10 mg 1 hour before bed', directions:'', code:'', link:''},
  ],
  'NuEthix Supplement':[
    {name:'Cort-Eaze', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements'},
    {name:'Estro-Cort', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/estro-cort'},
    {name:'Thyro-Boost +', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/thyro-boost-plus'},
    {name:'Adrena-Health', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/adrena-health'},
    {name:'Liposomal L-Carnitine', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/liposomal-l-carnitine'},
    {name:'Nu-Multi', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-multi'},
    {name:'GDA-MAX Pro', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/gda-max-pro'},
    {name:'Jumpstart EC', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/jumpstart-ec-new'},
    {name:'Nu-Lytes Electrolytes', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-lytes-electrolytes'},
    {name:'Nu-D3 + K2', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-d3-k2'},
    {name:'Fatty Acids Pro', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/fatty-acids-pro'},
    {name:'Nu-Youth+ Collagen Protein', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-youth-collagen-protein'},
    {name:'Prosorb+ Magnesium', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/prosorb-magnesium-new'},
    {name:'Essential Energy BCAA + EAA + Keto Salts', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/essential-energy-bcaa-eaa-keto-salts'},
    {name:'Ashwagandha KSM-66®', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/ashwagandha-ksm-66'},
    {name:'Nu-Creatine', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-creatine'},
    {name:'Slin-Trol', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/slin-trol'},
    {name:'Herbal Adrena+', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/herbal-adrena'},
    {name:'Cellular Restore Kit: Phase 1', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/cellular-restore-bundle'},
    {name:'Nu-Glutamine', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-glutamine'},
    {name:'ISO-Perfect With Digestive Support', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/iso-perfect-with-digestive-support'},
    {name:'DHEA Capsules', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/dhea-capsules'},
    {name:'Restful Sleep', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/restful-sleep'},
    {name:'Nu-Woman', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-woman'},
    {name:'Stress Support', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/stress-support'},
    {name:'Nu-Protien Blend', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/nu-protein-blend'},
    {name:'Medipure Ultra', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/medipure-ultra'},
    {name:'Gut Health Bundle', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/flora-protect-gut-defender-bundle'},
    {name:'Ultimate Calm & Sleep Stack', dose:'', directions:'', code:'TOGNIETTI10', link:'https://nuethix.com/products/ultimate-calm-sleep-stack'},
  ],
}

// ── Food database ─────────────────────────────────────────────
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

// Return the next calendar date for a given weekday name, e.g. "Wednesday" → "Wednesday, Jul 30"
function nextUpdateDate(dayName) {
  if (!dayName) return null
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const target = days.indexOf(dayName)
  if (target < 0) return null
  const today = new Date()
  let diff = target - today.getDay()
  if (diff <= 0) diff += 7
  const next = new Date(today)
  next.setDate(today.getDate() + diff)
  return next.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})
}

// Parse "4oz"→{amount:4,unit:'oz'}, "184g"→{amount:184,unit:'g'}, "240ml"→{amount:240,unit:'ml'}
function parseServing(serving='') {
  const m = serving.match(/^([\d.]+)\s*(oz|g|ml|mg)/)
  if (m) return { amount: parseFloat(m[1]), unit: m[2] }
  const m2 = serving.match(/^([\d.]+)\s*(.+)/)
  if (m2) return { amount: parseFloat(m2[1]), unit: m2[2].trim() }
  return { amount: 1, unit: serving }
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
  const ps = parseServing(item.food.serving)
  const actualAmt = Math.round(item.servings * ps.amount * 10) / 10
  return (
    <div style={{padding:'7px 0',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:C.white,fontWeight:500}}>{item.food.name}</div>
        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
          {actualAmt}{ps.unit} · {Math.round(item.food.cal*item.servings)}cal · P:{Math.round(item.food.pro*item.servings)}g C:{Math.round(item.food.carb*item.servings)}g F:{Math.round(item.food.fat*item.servings)}g Fib:{Math.round(item.food.fib*item.servings)}g
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

  // Empty/disabled metrics stay null → charts show a gap instead of a fake 0
  const num = (v, parse=parseFloat) => {
    if (v == null || String(v).trim() === '') return null
    const n = parse(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const chartData = [...checkins].reverse().map(e => ({
    date:      e.date.replace(' 2026',''),
    weight:    num(e.weight),
    compliance:e.compliance,
    habitPct:  typeof e.habitPct === 'number' ? e.habitPct : null,
    energy:    e.energy,
    sleep:     e.sleep,
    bloating:  e.bloating,
    brainFog:  e.brainFog,
    sexDrive:  e.sexDrive,
    hunger:    e.hunger,
    stress:    e.stress,
    steps:     num(e.steps, parseInt),
    heartRate: num(e.heartRate, parseInt),
    hrv:       num(e.hrv, parseInt),
    temp:      num(e.temp),
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
export default function DietBuilder({currentUser, initialTab='plan', demoCheckins=[], onBack}) {
  const isMobile = useIsMobile()
  const [adminFormDocs, setAdminFormDocs] = useState([])
  const [,setLiveDetailsReady] = useState(false) // re-render once sheet-linked doc details arrive
  useEffect(()=>{ loadLiveRecipeDetails().then(()=>setLiveDetailsReady(true)) },[])
  useEffect(()=>{
    const em = currentUser?.email||''
    if (!em) return
    dbGet('user_profiles',`email=eq.${encodeURIComponent(em)}&select=id`)
      .then(rows=>{ const uuid=rows?.[0]?.id; if (!uuid) return null; return dbGet('client_documents',`client_id=eq.${uuid}&doc_type=in.(note,form,document)&order=created_at.desc`) })
      .then(rows=>{ if (rows) setAdminFormDocs(Array.isArray(rows)?rows:[]) })
      .catch(()=>{})
  },[currentUser?.email])
  const email   = currentUser?.email||''
  const info    = KNOWN_USERS[email]||{role:'client',name:'User'}
  // Real identity: resolve the profile from the DB so real (non-demo) users work everywhere.
  // Demo accounts keep working via KNOWN_USERS; real accounts get their DB row.
  const [dbProfile, setDbProfile] = useState(null)
  useEffect(()=>{
    if (!email) { setDbProfile(null); return }
    dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=id,name,role,coach_id,company_id`)
      .then(rows=>setDbProfile(rows?.[0]||null))
      .catch(()=>setDbProfile(null))
  },[email])
  // The client's assigned coach: demo accounts map to the demo coach; real clients use their DB coach_id
  const myCoachId = KNOWN_USERS[email] ? KNOWN_USERS['coach@eden.io'].uuid : (dbProfile?.coach_id || null)
  // Prefer the role passed in currentUser (coach viewing a client's tools)
  // over the KNOWN_USERS lookup, which would always return 'client' for client emails
  const role    = currentUser?.role || info.role
  const isCoach = role==='coach'||role==='super_admin'
  const isClient= role==='client'
  const isAdmin = role==='super_admin'

  // Which organization this user belongs to — scopes company habits/foods/cardio libraries.
  // null until resolved; Eden org id for Eden staff and any user without a profile row.
  const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001'
  const [myCompanyId, setMyCompanyId] = useState(null)
  const [myUUID, setMyUUID] = useState(()=>KNOWN_USERS[email]?.uuid||null)
  // Does this org's tier include the Recipe Book? Eden always true; WL orgs resolved
  // from organizations.plan → packages.includes_recipes (Eden admin controls both).
  // null = still resolving — hide recipe UI until known.
  const [tierRecipes, setTierRecipes] = useState(null)
  const isWLOrg = !!myCompanyId && myCompanyId!==EDEN_ORG_ID
  useEffect(()=>{ let stale=false; (async()=>{
    if (!email) return
    setTierRecipes(null) // reset while resolving — recipe UI stays hidden until the new user's tier is known
    try {
      const rows = await dbGet('user_profiles',`email=eq.${encodeURIComponent(email)}&select=id,company_id`)
      const cid = rows?.[0]?.company_id || EDEN_ORG_ID
      if (stale) return
      setMyCompanyId(cid)
      setMyUUID(rows?.[0]?.id || KNOWN_USERS[email]?.uuid || null)
      if (cid===EDEN_ORG_ID) { setTierRecipes(true) }
      else {
        const org = await dbGet('organizations',`id=eq.${cid}&select=plan`)
        let inc = false
        if (org?.[0]?.plan) {
          const plan = String(org[0].plan).trim()
          const pkg = await dbGet('packages',`name=ilike.${encodeURIComponent(plan)}&active=eq.true&limit=1`)
          inc = !!pkg?.[0]?.includes_recipes
        }
        if (!stale) setTierRecipes(inc)
      }
    } catch { if(!stale){ setMyCompanyId(EDEN_ORG_ID) } /* tierRecipes stays null on failure — fail closed (recipe UI hidden) */ }
  })(); return ()=>{ stale=true } },[email])

  const [tab,        setTab]        = useState(initialTab)
  const [dayType,    setDayType]    = useState('high')
  const [protocol,   setProtocol]   = useState('Base Diet Protocol Male')
  const [showPicker, setShowPicker] = useState(false)
  const [activeMeal, setActiveMeal] = useState(null)
  const [foodSearch, setFoodSearch] = useState('')
  const [viewRecipe, setViewRecipe] = useState(null)   // full recipe detail modal (client + coach)
  const [previewRecipe, setPreviewRecipe] = useState(null) // inline preview in coach picker
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
  // Customizable check-in form: the client's coach's form → org form → standard.
  const ciForm = useCheckinForm(myCompanyId, myCoachId)
  const on = k => !ciForm.off.includes(k)              // is a standard metric enabled?
  // Vitals row for a submitted check-in — shows every metric on the coach's
  // form: filled values normally, skipped ones as a dimmed "not provided"
  // marker so it's obvious what the client left blank.
  const VitalsRow = ({ci}) => {
    const defs = [
      ['weight','weight','⚖️','Weight',v=>`${v} lbs`],
      ['temp','temp','🌡️','Temp',v=>`${v}°F`],
      ['heartRate','heartRate','❤️','Heart rate',v=>`${v} BPM`],
      ['hrv','hrv','📡','HRV',v=>`HRV ${v}`],
      ['steps','steps','👟','Steps',v=>`${v} steps`],
      ['bp','bloodPressure','🩺','Blood pressure',v=>v],
    ].filter(([k])=>on(k))
    if(!defs.length) return null
    return defs.map(([k,f,icon,label,fmt])=>{
      const v=ci[f]
      return v
        ? <span key={k} style={{fontSize:12,color:C.muted}}>{icon} {fmt(v)}</span>
        : <span key={k} style={{fontSize:11,color:'#555',fontStyle:'italic'}}>{icon} {label} — not provided</span>
    })
  }
  const [customAnswers, setCustomAnswers] = useState({})  // { customMetricLabel: value }
  const [protocolDurations, setProtocolDurations] = useState({})  // { protocolName: duration string }
  const setProtDur = (name,val) => setProtocolDurations(p=>({...p,[name]:val}))
  const [otherProtocols, setOtherProtocols] = useState([])        // [{id,protocol,duration}] — user-added list
  const [otherProtoDraft, setOtherProtoDraft] = useState({protocol:'',duration:''})
  const [mealNotes, setMealNotes] = useState({})  // per-meal adjustment notes from client, keyed by meal name

  // Check-in hub state
  const [localCheckins,    setLocalCheckins]    = useState([])
  const [expandedCi,       setExpandedCi]       = useState(null)
  const [editingCi,        setEditingCi]        = useState(null)
  const [draftNote,        setDraftNote]        = useState('')
  const [draftLoom,        setDraftLoom]        = useState('')
  const [clientViewTab,    setClientViewTab]    = useState('history')
  const [coachCheckinTab,  setCoachCheckinTab]  = useState('checkins')
  const [clientPhotos,     setClientPhotos]     = useState(null)
  const [photoUploading,   setPhotoUploading]   = useState(false)
  const [photoCompare,     setPhotoCompare]     = useState(false)
  const photoFileRef = useRef(null)
  const [updateDay, setUpdateDay] = useState(null)
  const deadline = useDeadline(currentUser?.email || '')

  const LOE_DEFAULT = [
    '• Organic fruits/veg · Grass-fed/finished beef · Wild caught fish · Raw dairy only',
    '• NO artificial sweeteners — Stevia only · Raw honey only · 6-8g EVOO for cooking',
    '• Black coffee: 1–2 cups/day max · Must be organic · No coffee after 12 noon',
    '  May use 4oz of MALK or unsweetened vanilla almond milk as creamer',
    `• Updates due before ${deadline.text} on your assigned update day — fasted weight + photos`,
  ].join('\n')
  const loeKey = `eden_loe_${myUUID||email}`
  const [loeContent, setLoeContent] = useState(()=>localStorage.getItem(loeKey)||LOE_DEFAULT)
  const [loeEditing, setLoeEditing] = useState(false)
  // Local echo while typing; the database copy is written on Done/Reset.
  const saveLoe = (val) => { setLoeContent(val); localStorage.setItem(loeKey, val) }
  // Org-wide copy lives in admin_settings (key 'loe_guidelines') so every
  // device — and every client in the org — sees the same edited standards.
  useEffect(()=>{
    if (!myCompanyId) return
    dbGet('admin_settings', `company_id=eq.${myCompanyId}&key=eq.loe_guidelines&select=value`)
      .then(rows=>{
        if (Array.isArray(rows) && rows[0] && typeof rows[0].value === 'string' && rows[0].value.trim()) {
          setLoeContent(rows[0].value)
          localStorage.setItem(loeKey, rows[0].value)
        }
      }).catch(()=>{})
  },[myCompanyId])
  const persistLoe = (val) => {
    if (!myCompanyId) return
    dbUpsert('admin_settings',
      { company_id: myCompanyId, key: 'loe_guidelines', value: val, updated_at: new Date().toISOString() },
      'company_id,key')
  }

  // ── Consultation data — client receives from coach (Week6 Consultation tab) ──
  const [clientIntake,  setClientIntake]  = useState({notes:'',startDate:'',startWeight:''})
  const [consultDocs,   setConsultDocs]   = useState([]) // onboarding / monthly / emergency docs from admin
  const [callNotesList, setCallNotesList] = useState([])

  // ── Notifications ──────────────────────────────────────────
  const [notifications,  setNotifications]  = useState([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const unreadCount = notifications.filter(n=>!n.is_read).length

  useEffect(() => {
    // Load company-wide habits and foods once we know which org this user belongs to
    if (myCompanyId) { loadCompanyHabits(); loadCompanyFoods(); loadHiddenAndResources() }
  }, [myCompanyId])

  useEffect(() => {
    // Seed with demo data immediately so the UI isn't blank
    const demo = (demoCheckins||[]).map(ci => ({
      ...ci,
      coachNotes: ci.coachNotes || '',
      coachLoom:  ci.coachLoom  || '',
    }))
    setLocalCheckins(demo)
    setExpandedCi(null)
    setEditingCi(null)

    const uuid = myUUID
    if (!uuid) return

    // Load assigned update day — DB first, localStorage fallback (bridge until SQL/RLS is live)
    dbGet('user_profiles', `id=eq.${uuid}&select=update_day`)
      .then(rows => {
        if (Array.isArray(rows) && rows.length > 0 && rows[0].update_day) {
          setUpdateDay(rows[0].update_day)
        } else {
          const cached = localStorage.getItem(`eden_update_day_${uuid}`)
          if (cached) setUpdateDay(cached)
        }
      })

    // Fetch real submitted check-ins from DB and merge on top of demo data
    dbGet('weekly_checkins', `client_id=eq.${uuid}&order=submitted_at.desc&limit=52`)
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) return
        const dbCheckins = rows.map(r => ({
          date:             new Date(r.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
          time:             new Date(r.submitted_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
          weight:           r.weight||'',       temp:             r.temp||'',
          steps:            r.steps||'',        heartRate:        r.heart_rate||'',
          hrv:              r.hrv||'',          bloodPressure:    r.blood_pressure||'',
          energy:           r.energy,           sleep:            r.sleep,
          bloating:         r.bloating,         brainFog:         r.brain_fog,
          sexDrive:         r.sex_drive,        hunger:           r.hunger,
          // stress/compliance/mood/habits have no real columns — they live in
          // protocol_durations.__extra (older rows may have the legacy columns)
          stress:           r.protocol_durations?.__extra?.stress ?? r.stress,
          compliance:       r.protocol_durations?.__extra?.compliance ?? r.compliance,
          mood:             r.protocol_durations?.__extra?.mood || r.mood || '',
          sleepWindow:      r.sleepWindow || r.sleep_window || '',
          sleepCycles:      r.sleepCycles || r.sleep_cycles || '',
          sleepDisruption:  r.sleepDisruption || r.sleep_disruption || '',
          bowelCount:       r.bowel_count||'',  bowelType:        r.bowelType || r.bowel_type || '',
          clientNotes:      r.other_notes || r.notes || '',
          coachNotes:       '',
          coachLoom:        '',
          habits:           r.protocol_durations?.__extra?.habits ?? r.habits ?? null,
          habitPct:         r.protocol_durations?.__extra?.habit_pct ?? r.habit_pct,
          mealNotes:        r.meal_notes || null,
          custom:           r.protocol_durations?.__custom || null,
          _dbId:            r.id,
        }))
        setLocalCheckins(prev => {
          const dbDates = new Set(dbCheckins.map(c => c.date))
          const demoOnly = prev.filter(dc => !dbDates.has(dc.date))
          return [...dbCheckins, ...demoOnly]
        })

        // Overlay coach responses onto the merged list
        return dbGet('coach_responses', `client_id=eq.${uuid}&order=updated_at.desc`)
      })
      .then(respRows => {
        if (!Array.isArray(respRows) || respRows.length === 0) return
        const byDate = {}
        respRows.forEach(r => { byDate[r.checkin_date] = r })
        setLocalCheckins(prev => prev.map(ci => {
          const resp = byDate[ci.date]
          if (!resp) return ci
          return { ...ci, coachNotes: resp.coach_notes||ci.coachNotes, coachLoom: resp.coach_loom||ci.coachLoom }
        }))
      })
      .catch(() => {})
  }, [demoCheckins, email, myUUID])

  // Load client's progress photos — for both client login and coach viewing a client
  useEffect(() => {
    const uuid = myUUID
    if (!uuid) { setClientPhotos([]); return }
    dbGet('progress_photos', `client_id=eq.${uuid}&order=taken_at.desc&limit=60`)
      .then(rows => setClientPhotos(Array.isArray(rows) && rows.length ? rows : []))
      .catch(() => setClientPhotos([]))
  }, [email, myUUID])

  // Week numbers are automatic and can't be edited: photos taken within 7 days
  // of the current week's first photo join that week; after that a new week starts.
  function currentWeekLabel(photos) {
    let maxWeek = 0
    for (const p of photos || []) {
      const m = /^week\s*(\d+)$/i.exec(String(p.week_label || '').trim())
      if (m) maxWeek = Math.max(maxWeek, parseInt(m[1]))
    }
    if (!maxWeek) return 'Week 1'
    const label = `Week ${maxWeek}`
    const group = (photos || []).filter(p => String(p.week_label || '').trim().toLowerCase() === label.toLowerCase())
    const first = group.map(p => new Date(p.taken_at || p.created_at).getTime()).filter(t => !isNaN(t)).sort()[0]
    if (first && Date.now() - first < 7 * 86400000) return label
    return `Week ${maxWeek + 1}`
  }
  const DEFAULT_PHOTO_NAMES = ['Front', 'Side', 'Back']

  async function uploadProgressPhoto(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const uuid = myUUID
    if (!uuid) { alert('Could not identify your account.'); return }
    const label = currentWeekLabel(clientPhotos)
    const existing = (clientPhotos || []).filter(p => (p.week_label || '') === label).length
    if (existing + files.length > 10) {
      alert(`${label} already has ${existing} photo${existing !== 1 ? 's' : ''} — you can add up to ${10 - existing} more (max 10 per week).`)
      if (photoFileRef.current) photoFileRef.current.value = ''
      return
    }
    setPhotoUploading(true)
    let failed = 0
    try {
      let idx = existing
      for (const file of files) {
        try {
          const path = `${uuid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name}`
          const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/progress-photos/${path}`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON, get Authorization(){ return sbBearer() }, 'Content-Type': file.type },
            body: file,
          })
          if (!upRes.ok) throw new Error('upload failed')
          const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/progress-photos/${path}`
          const ins = await dbInsert('progress_photos', {
            client_id: uuid, week_label: label,
            photo_url: photoUrl, file_name: file.name, file_size: file.size,
            notes: DEFAULT_PHOTO_NAMES[idx] || `Photo ${idx + 1}`,
            taken_at: new Date().toISOString(),
          })
          if (!ins) throw new Error('db insert failed')
          idx++
        } catch { failed++ }
      }
      const rows = await dbGet('progress_photos', `client_id=eq.${uuid}&order=taken_at.desc&limit=60`)
      setClientPhotos(Array.isArray(rows) ? rows : [])
      if (failed) alert(`${failed} of ${files.length} photo${files.length !== 1 ? 's' : ''} failed to upload — please try those again.`)
    }
    finally { setPhotoUploading(false); if (photoFileRef.current) photoFileRef.current.value = '' }
  }

  // Rename an individual photo (e.g. "Front", "Overhead thigh") — week can't change
  async function renamePhoto(p) {
    const next = window.prompt('Name for this photo:', p.notes || '')
    if (next == null) return
    const name = next.trim()
    if (!name || name === p.notes) return
    const ok = await dbUpdate('progress_photos', `id=eq.${p.id}`, { notes: name })
    if (ok === null) { alert('Could not rename — please try again.'); return }
    setClientPhotos(prev => (prev || []).map(x => x.id === p.id ? { ...x, notes: name } : x))
  }

  // Habits — assigned by coach, frequency filled by client
  const [assignedHabits,   setAssignedHabits]   = useState(MASTER_HABITS.slice(0,8).map(h=>({...h,target:h.defaultTarget})))
  const [showHabitPicker,  setShowHabitPicker]  = useState(false)
  const [customHabit,      setCustomHabit]      = useState('')
  const [habitCounts,      setHabitCounts]      = useState({})
  // Company-wide habits managed by admin only
  const [companyHabits,    setCompanyHabits]    = useState([])
  const [newHabitName,     setNewHabitName]     = useState('')
  const [newHabitTarget,   setNewHabitTarget]   = useState(7)
  // Company-wide foods managed by admin only
  const [companyFoods,     setCompanyFoods]     = useState([])
  // Built-ins the org's admin has hidden (company_hidden_items; kind→Set of names)
  const [hiddenItems,      setHiddenItems]      = useState({food:new Set(),habit:new Set(),cardio:new Set()})
  // Per-org "Helpful Resources & Lab Links" (company_resource_links); null = loading, []→fall back to Eden defaults
  const [resourceLinks,    setResourceLinks]    = useState(null)
  const [newFood,          setNewFood]          = useState({name:'',serving:'',cal:'',pro:'',carb:'',fat:'',fib:'',cat:'Proteins'})
  const [showAddFood,      setShowAddFood]      = useState(false)
  const setHabitCount = (id,v) => setHabitCounts(p=>({...p,[id]:Math.min(7,Math.max(0,parseInt(v)||0))}))

  // Coach-only updates — visible to client in their Check-In history
  const [coachOnlyUpdates, setCoachOnlyUpdates] = useState([])
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
  // White-label orgs use their own editable copy of the supplement library (company_supplements);
  // Eden users use the built-in SUPP_DB. null = not loaded yet.
  const [orgSuppDB,  setOrgSuppDB]  = useState(null)
  const [editSupp,   setEditSupp]   = useState(null) // {dbId?, category, name, dose, directions, code, link} — modal open when set
  const [editHabit,  setEditHabit]  = useState(null) // {id, name, target} — company habit editor modal
  const [coachNotes,     setCoachNotes]     = useState('')
  // The coach-built supplement protocol persists per client in admin_settings
  // (key 'supp_plan:<client uuid>') so it survives refreshes and shows for the client.
  useEffect(()=>{
    if (!myUUID || !myCompanyId) return
    let stale=false
    dbGet('admin_settings',`company_id=eq.${myCompanyId}&key=eq.${encodeURIComponent('supp_plan:'+myUUID)}&select=value`)
      .then(rows=>{
        if (stale) return
        try {
          const v = rows?.[0]?.value ? JSON.parse(rows[0].value) : null
          if (v) {
            if (Array.isArray(v.supps))     setClientSupps(v.supps)
            if (typeof v.custom==='string') setCustomSuppText(v.custom)
            if (typeof v.notes==='string')  setCoachNotes(v.notes)
          }
        } catch(e){}
      }).catch(()=>{})
    return ()=>{stale=true}
  },[myUUID,myCompanyId])
  async function saveSuppProtocol() {
    if (!myUUID || !myCompanyId) { alert('Still loading this client\'s profile — try again in a second.'); return }
    const ok = await dbUpsert('admin_settings',{
      company_id: myCompanyId, key: 'supp_plan:'+myUUID,
      value: JSON.stringify({supps:clientSupps, custom:customSuppText, notes:coachNotes}),
      updated_at: new Date().toISOString(),
    },'company_id,key')
    if (!ok) { alert('Could not save the supplement protocol — please try again.'); return }
    await insertNotification(myUUID, myCoachId, 'supp_update', '💊 Your coach updated your supplement protocol — check your Supplements tab', 'supplements')
    alert('Supplement protocol saved!')
  }
  // Client's own notes on their supplement experience
  const [clientSuppNotes, setClientSuppNotes] = useState('')
  // Client's own prescription notes
  const [clientRxNotes, setClientRxNotes] = useState('')

  // Recipes — coach assigns individual recipes; client sees preview + buy
  const [assignedRecipes,  setAssignedRecipes]  = useState([])
  const [showRecipePicker, setShowRecipePicker] = useState(false)
  const [recipeFilter,     setRecipeFilter]     = useState('All')
  const [recipeSearch,     setRecipeSearch]     = useState('')
  const [pendingRecipe,    setPendingRecipe]    = useState(null)  // recipe waiting for meal selection

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
    const mt = mealMacros(m)
    const rs = assignedRecipes.filter(r=>(r.meal_name||'')=== m.name).reduce((ra,r)=>({
      cal: ra.cal+(r.cal||0)*(r.servings||1), pro: ra.pro+(r.pro||0)*(r.servings||1),
      fat: ra.fat+(r.fat||0)*(r.servings||1), carb:ra.carb+(r.carb||0)*(r.servings||1),
      fib: ra.fib+(r.fib||0)*(r.servings||1),
    }),{cal:0,pro:0,fat:0,carb:0,fib:0})
    return {
      cal: a.cal+mt.cal+Math.round(rs.cal), pro: a.pro+mt.pro+Math.round(rs.pro),
      fat: a.fat+mt.fat+Math.round(rs.fat), carb:a.carb+mt.carb+Math.round(rs.carb),
      fib: a.fib+mt.fib+Math.round(rs.fib),
    }
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
    // protocolGroup marks these as a full protocol so the UI renders them under a named header
    suppDB[cat]?.forEach(s=>addSuppFromDB({...s,category:cat,protocolGroup:cat}))
    setShowSuppPicker(false)
  }

  // ── Org supplement library (white-label orgs manage their own copy) ──
  async function loadOrgSupps(forCompanyId) {
    const cid = forCompanyId || myCompanyId
    if (!cid) return
    const rows = await dbGet('company_supplements',`company_id=eq.${cid}&order=category.asc,sort_order.asc,created_at.asc`)
    // Guard against stale responses: only apply if the org context hasn't changed since we asked
    if (cid !== myCompanyIdRef.current) return
    const grouped = {}
    ;(rows||[]).forEach(r=>{
      (grouped[r.category]=grouped[r.category]||[]).push({dbId:r.id,name:r.name,dose:r.dose||'',directions:r.directions||'',code:r.code||'',link:r.link||''})
    })
    setOrgSuppDB(grouped)
  }
  const myCompanyIdRef = useRef(myCompanyId)
  useEffect(()=>{
    myCompanyIdRef.current = myCompanyId
    setOrgSuppDB(null) // reset so a stale org's library never renders for the new org
    if (myCompanyId) loadOrgSupps(myCompanyId)
  },[myCompanyId])
  async function saveOrgSupp() {
    if (!editSupp?.name?.trim() || !editSupp?.category?.trim()) { alert('Please fill in at least a category and name.'); return }
    const body = { category:editSupp.category.trim(), name:editSupp.name.trim(), dose:editSupp.dose||'', directions:editSupp.directions||'', code:editSupp.code||'', link:editSupp.link||'' }
    let ok
    if (editSupp.dbId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/company_supplements?id=eq.${editSupp.dbId}&company_id=eq.${myCompanyId}`,{
        method:'PATCH', headers:{...H,'Content-Type':'application/json'}, body:JSON.stringify(body)
      })
      ok = r.ok
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/company_supplements`,{
        method:'POST', headers:H, body:JSON.stringify({...body, company_id:myCompanyId})
      })
      ok = r.ok
    }
    if (!ok) { alert('Could not save the supplement — please try again.'); return }
    setEditSupp(null)
    loadOrgSupps()
  }
  async function deleteOrgSupp(dbId) {
    if (!confirm('Remove this supplement from your library?')) return
    const r = await fetch(`${SUPABASE_URL}/rest/v1/company_supplements?id=eq.${dbId}&company_id=eq.${myCompanyId}`,{method:'DELETE',headers:H})
    if (!r.ok) { alert('Could not delete — please try again.'); return }
    loadOrgSupps()
  }
  function removeSupp(id) { setClientSupps(p=>p.filter(s=>s.id!==id)) }
  function updateSuppField(id,field,val) {
    setClientSupps(p=>p.map(s=>s.id===id?{...s,[field]:val}:s))
  }

  function addCoachUpdate() {
    if(!newNote.trim()&&!newLoom.trim()) return
    const clientId = myUUID
    const coachId  = myCoachId
    const entry = {id:Date.now(),date:newDate,note:newNote.trim(),loom:newLoom.trim()}
    setCoachOnlyUpdates(p=>[entry,...p])
    setNewNote(''); setNewLoom(''); setShowAddForm(false)
    if (clientId && coachId) {
      dbInsert('coach_updates',{coach_id:coachId,client_id:clientId,date:newDate,note:entry.note,loom:entry.loom,created_at:new Date().toISOString()})
        .then(()=> dbGet('coach_updates',`client_id=eq.${clientId}&order=created_at.desc&limit=50`))
        .then(rows=>{ if(Array.isArray(rows)&&rows.length) setCoachOnlyUpdates(rows.map(r=>({id:r.id,date:r.date,note:r.note||'',loom:r.loom||''}))) })
        .then(()=>insertNotification(clientId, coachId, 'coach_update', '📝 Your coach posted a new update — check your History & Feedback tab'))
        .catch(()=>{})
    }
  }

  // Load coach_updates from DB on mount
  useEffect(()=>{
    const uuid = myUUID
    if(!uuid) return
    dbGet('coach_updates',`client_id=eq.${uuid}&order=created_at.desc&limit=50`)
      .then(rows=>{ if(Array.isArray(rows)&&rows.length) setCoachOnlyUpdates(rows.map(r=>({id:r.id,date:r.date,note:r.note||'',loom:r.loom||''}))) })
      .catch(()=>{})
  },[email, myUUID])

  // Load intake record + call notes (written by coach in Week6 Consultation tab)
  useEffect(()=>{
    const uuid = myUUID
    if(!uuid) return
    dbGet('client_intakes',`client_id=eq.${uuid}&order=updated_at.desc&limit=1`)
      .then(rows=>{
        if(Array.isArray(rows)&&rows.length){
          const r=rows[0]
          setClientIntake({notes:r.call_notes||'',startDate:r.start_date||'',startWeight:r.start_weight||''})
        }
      }).catch(()=>{})
    dbGet('consultation_notes',`client_id=eq.${uuid}&order=call_date.desc&limit=50`)
      .then(rows=>{ if(Array.isArray(rows)&&rows.length) setCallNotesList(rows) })
      .catch(()=>{})
    // Documents routed into the consultation sections (onboarding / monthly / emergency)
    dbGet('client_documents',`client_id=eq.${uuid}&doc_type=in.(onboarding,monthly,emergency)&order=created_at.desc`)
      .then(rows=>{ if(Array.isArray(rows)) setConsultDocs(rows) })
      .catch(()=>{})
  },[email, myUUID])

  // Load + poll notifications every 30 s
  useEffect(()=>{
    const uuid = myUUID
    if(!uuid) return
    const load = ()=>
      dbGet('notifications',`recipient_id=eq.${uuid}&order=created_at.desc&limit=40`)
        .then(rows=>{ if(Array.isArray(rows)&&rows.length) setNotifications(rows) })
        .catch(()=>{})
    load()
    const iv = setInterval(load, 30000)
    return ()=>clearInterval(iv)
  },[email, myUUID])

  // ── Company habits (each org's admin manages their own library) ──
  async function loadCompanyHabits() {
    if (!myCompanyId) return
    const data = await dbGet('company_habits',`company_id=eq.${myCompanyId}&order=created_at.asc`)
    setCompanyHabits((data||[]).map(h=>({id:h.id,name:h.name,defaultTarget:h.default_target,fromDB:true})))
  }
  async function addCompanyHabit() {
    if (!newHabitName.trim()||!myCompanyId) return
    const inserted = await dbInsert('company_habits',{
      name: newHabitName.trim(), default_target: newHabitTarget, created_by: myUUID, company_id: myCompanyId
    })
    if (inserted) {
      const h = Array.isArray(inserted)?inserted[0]:inserted
      setCompanyHabits(p=>[...p,{id:h.id,name:h.name,defaultTarget:h.default_target,fromDB:true}])
      setNewHabitName(''); setNewHabitTarget(7)
    }
  }
  // Eden admin: push a company habit to every white-label org's library (skipping name duplicates)
  async function pushHabitToAllOrgs(habit) {
    if (!window.confirm(`Push "${habit.name}" to every white-label org's habit library?\nOrgs that already have a habit with this name are skipped.`)) return
    const orgs = await dbGet('organizations','is_white_label=eq.true&select=id,name')
    if (!Array.isArray(orgs)||!orgs.length) { alert('No white-label orgs found.'); return }
    const existing = await dbGet('company_habits',`name=eq.${encodeURIComponent(habit.name)}&select=company_id`)
    const have = new Set((existing||[]).map(r=>r.company_id))
    const targets = orgs.filter(o=>!have.has(o.id))
    if (!targets.length) { alert(`All ${orgs.length} white-label orgs already have "${habit.name}".`); return }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/company_habits`,{
      method:'POST',
      headers:{...H,'Prefer':'return=minimal'},
      body:JSON.stringify(targets.map(o=>({name:habit.name, default_target:habit.defaultTarget??7, created_by:myUUID, company_id:o.id}))),
    })
    if (res.ok) alert(`"${habit.name}" pushed to ${targets.length} of ${orgs.length} white-label orgs${orgs.length-targets.length?` (${orgs.length-targets.length} already had it)`:''}.`)
    else { console.error('PUSH HABIT', await res.text()); alert('Push failed — please try again.') }
  }
  async function removeCompanyHabit(id) {
    if (!confirm('Remove this habit from your company library?')) return
    await fetch(`${SUPABASE_URL}/rest/v1/company_habits?id=eq.${id}&company_id=eq.${myCompanyId}`,{method:'DELETE',headers:H})
    setCompanyHabits(p=>p.filter(h=>h.id!==id))
    setAssignedHabits(p=>p.filter(h=>h.id!==id))
  }
  async function saveCompanyHabit() {
    if (!editHabit?.name?.trim()) { alert('Please enter a habit name.'); return }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/company_habits?id=eq.${editHabit.id}&company_id=eq.${myCompanyId}`,{
      method:'PATCH', headers:H, body:JSON.stringify({name:editHabit.name.trim(), default_target:editHabit.target})
    })
    if (!r.ok) { alert('Could not save the habit — please try again.'); return }
    setCompanyHabits(p=>p.map(h=>h.id===editHabit.id?{...h,name:editHabit.name.trim(),defaultTarget:editHabit.target}:h))
    setAssignedHabits(p=>p.map(h=>h.id===editHabit.id?{...h,name:editHabit.name.trim()}:h))
    setEditHabit(null)
  }

  // ── Company foods (per-org: each org's admin manages the food list all their coaches see) ─
  async function loadCompanyFoods() {
    if (!myCompanyId) return
    const data = await dbGet('company_foods',`company_id=eq.${myCompanyId}&order=created_at.asc`)
    setCompanyFoods((data||[]).map(f=>({dbId:f.id,name:f.name,serving:f.serving,cal:f.cal,pro:f.pro,carb:f.carb,fat:f.fat,fib:f.fib||0,cat:f.cat,fromDB:true})))
  }
  async function addCompanyFood() {
    if (!newFood.name.trim()||!newFood.serving.trim()||!myCompanyId) return
    const body = {
      name: newFood.name.trim(), serving: newFood.serving.trim(), cat: newFood.cat,
      cal: parseFloat(newFood.cal)||0, pro: parseFloat(newFood.pro)||0,
      carb: parseFloat(newFood.carb)||0, fat: parseFloat(newFood.fat)||0,
      fib: parseFloat(newFood.fib)||0, created_by: myUUID, company_id: myCompanyId,
    }
    const inserted = await dbInsert('company_foods', body)
    if (inserted) {
      const f = Array.isArray(inserted)?inserted[0]:inserted
      setCompanyFoods(p=>[...p,{dbId:f.id,name:f.name,serving:f.serving,cal:f.cal,pro:f.pro,carb:f.carb,fat:f.fat,fib:f.fib||0,cat:f.cat,fromDB:true}])
      setNewFood({name:'',serving:'',cal:'',pro:'',carb:'',fat:'',fib:'',cat:newFood.cat})
      setShowAddFood(false)
    } else {
      alert('Could not save — the company_foods table may not exist yet in the database.')
    }
  }
  // Hidden built-ins + per-org resource links
  async function loadHiddenAndResources() {
    if (!myCompanyId) return
    const cid = myCompanyId
    const [hid, links] = await Promise.all([
      dbGet('company_hidden_items',`company_id=eq.${cid}&select=kind,name`).catch(()=>[]),
      dbGet('company_resource_links',`company_id=eq.${cid}&order=sort_order.asc,created_at.asc`).catch(()=>[]),
    ])
    if (cid !== myCompanyIdRef.current) return // stale response guard
    const h = {food:new Set(),habit:new Set(),cardio:new Set()}
    ;(Array.isArray(hid)?hid:[]).forEach(r=>h[r.kind]?.add(r.name))
    setHiddenItems(h)
    setResourceLinks(Array.isArray(links)?links:[])
    // Don't leave admin-hidden built-in habits pre-assigned by default
    if (h.habit.size) setAssignedHabits(p=>p.filter(x=>!h.habit.has(x.name)))
  }

  async function removeCompanyFood(dbId) {
    if (!window.confirm('Remove this company-wide food for all coaches?')) return
    await fetch(`${SUPABASE_URL}/rest/v1/company_foods?id=eq.${dbId}&company_id=eq.${myCompanyId}`,{method:'DELETE',headers:H})
    setCompanyFoods(p=>p.filter(f=>f.dbId!==dbId))
  }

  // ── Notification helpers ───────────────────────────────────
  // Delegates to the shared sendNotification helper (logs + retries + audit-trails failures)
  async function insertNotification(recipientId, senderId, type, message, linkTo) {
    await sendNotification({ recipientId, senderId, type, body: message, linkTo })
  }

  function markAllRead() {
    const uuid = myUUID
    setNotifications(p=>p.map(n=>({...n,is_read:true})))
    if(uuid) dbUpdate('notifications',`recipient_id=eq.${uuid}&is_read=eq.false`,{is_read:true,read_at:new Date().toISOString()})
  }


  // Load assigned recipes from DB
  useEffect(()=>{
    const uuid = myUUID
    if(!uuid) return
    dbGet('client_recipes',`client_id=eq.${uuid}&order=assigned_at.desc`)
      .then(rows=>{
        if(!Array.isArray(rows)) return
        setAssignedRecipes(rows.map(r=>{
          const d = typeof r.recipe_data==='string' ? JSON.parse(r.recipe_data) : (r.recipe_data||{})
          return {...d, recipe_name:r.recipe_name, meal_name:r.meal_name||'', db_id:r.id}
        }))
      })
      .catch(()=>{})
  },[email, myUUID])

  async function assignRecipe(recipe, mealName) {
    const uuid    = myUUID
    const coachId = myCoachId
    if(!uuid||!coachId) return
    // Embed full recipe content (ingredients + method) so the client gets the complete recipe, not just macros
    const details    = getRecipeDetails(recipe)
    const fullRecipe = details ? {...recipe, ingredients:details.ingredients, method:details.method} : recipe
    setAssignedRecipes(p=>[...p,{...fullRecipe,meal_name:mealName,db_id:null}])
    await dbInsert('client_recipes',{client_id:uuid,coach_id:coachId,recipe_name:recipe.name,recipe_data:fullRecipe,meal_name:mealName,assigned_at:new Date().toISOString()})
    const rows = await dbGet('client_recipes',`client_id=eq.${uuid}&order=assigned_at.desc`)
    // Only overwrite state if DB returned real rows (dbGet returns [] on error — must guard against wiping optimistic update)
    if(Array.isArray(rows) && rows.length > 0) setAssignedRecipes(rows.map(r=>{
      const d = typeof r.recipe_data==='string' ? JSON.parse(r.recipe_data) : (r.recipe_data||{})
      return {...d, recipe_name:r.recipe_name, meal_name:r.meal_name||'', db_id:r.id}
    }))
  }

  async function removeRecipe(dbId, recipeName) {
    setAssignedRecipes(p=>p.filter(r=>r.db_id!==dbId&&(r.name||r.recipe_name)!==recipeName))
    if(dbId) await dbDelete('client_recipes',`id=eq.${dbId}`)
  }

  const servingsSaveTimers = useRef({}) // debounce per recipe row so rapid +/- clicks save once
  function updateRecipeServings(dbId, recipeName, newServings) {
    const s = Math.max(0.25, Math.round((parseFloat(newServings)||1)*4)/4)  // snap to 0.25
    setAssignedRecipes(p=>p.map(r=>
      (r.db_id===dbId||(r.db_id==null&&(r.name||r.recipe_name)===recipeName))
        ? {...r, servings:s} : r
    ))
    // Persist to client_recipes so servings survive refresh / reassignment views
    if (dbId) {
      clearTimeout(servingsSaveTimers.current[dbId])
      servingsSaveTimers.current[dbId] = setTimeout(()=>{
        setAssignedRecipes(p=>{
          const row = p.find(r=>r.db_id===dbId)
          if (row) {
            const {db_id, recipe_name, meal_name, ...data} = row
            dbUpdate('client_recipes',`id=eq.${dbId}`,{recipe_data:{...data, servings:row.servings}}).catch(()=>{})
          }
          return p
        })
      }, 600)
    }
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

  const filteredFoods = [...FOODS.filter(f=>!hiddenItems.food.has(f.name)),...companyFoods].filter(f=>
    !foodSearch||f.name.toLowerCase().includes(foodSearch.toLowerCase())||f.cat.toLowerCase().includes(foodSearch.toLowerCase())
  )

  // Every org (including Eden) uses its own editable supplement library from the database.
  // Until org context resolves (myCompanyId null), show nothing rather than risking the wrong org's list.
  const suppDBReady = !!myCompanyId && orgSuppDB!==null
  const suppDB = suppDBReady ? orgSuppDB : {}
  const canEditSupps = isAdmin

  const allSuppSearch = Object.entries(suppDB).flatMap(([cat,supps])=>
    supps.filter(s=>s.name.toLowerCase().includes(suppSearch.toLowerCase())).map(s=>({...s,category:cat}))
  )

  const TABS=[
    ['plan','🥗 Meal Plan'],
    ['calculator','🔢 Calculator'],
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
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,flexShrink:0,marginTop:privacyMode?28:0}}>
        {/* ── top row: title + controls ─────────────────────── */}
        <div style={{display:'flex',alignItems:'center',gap:0,padding:'8px 16px 4px'}}>
          <div style={{flex:1,paddingRight:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.white}}>{isCoach?`Diet Builder — ${currentUser?.name||'Client'}`:'My Diet Plan'}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:1}}>{protocol}</div>
            {onBack&&(
              <button onClick={onBack} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:3,marginTop:3}}>
                <span style={{fontSize:11,color:C.gold}}>← Back</span>
              </button>
            )}
          </div>
          {isCoach&&(
            <button onClick={()=>setPrivacyMode(p=>!p)} title="Hide client roster for Loom recording"
              style={{background:privacyMode?`${C.danger}33`:C.card,border:`1px solid ${privacyMode?C.danger:C.border}`,borderRadius:8,padding:'5px 10px',color:privacyMode?C.danger:C.muted,fontSize:11,fontWeight:700,cursor:'pointer',marginRight:10,whiteSpace:'nowrap'}}>
              {privacyMode?'🎥 Recording':'🎥 Loom Mode'}
            </button>
          )}
          {/* Notification bell */}
          <div style={{position:'relative'}}>
            <button onClick={()=>{ setShowNotifPanel(p=>!p); markAllRead() }}
              style={{background:'none',border:'none',cursor:'pointer',padding:'6px 8px',position:'relative',lineHeight:1}}>
              <span style={{fontSize:17}}>🔔</span>
              {unreadCount>0&&(
                <span style={{position:'absolute',top:2,right:2,background:C.danger,color:C.white,
                  fontSize:8,fontWeight:700,minWidth:14,height:14,borderRadius:7,
                  display:'flex',alignItems:'center',justifyContent:'center',padding:'0 2px',lineHeight:1}}>
                  {unreadCount>9?'9+':unreadCount}
                </span>
              )}
            </button>
            {showNotifPanel&&(
              <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:200,
                background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                width:290,maxHeight:340,overflowY:'auto',boxShadow:'0 8px 32px #000000aa'}}>
                <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,
                  display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.white}}>Notifications</span>
                  <button onClick={()=>setShowNotifPanel(false)}
                    style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,lineHeight:1,padding:0}}>×</button>
                </div>
                {notifications.length===0?(
                  <div style={{padding:'24px 14px',textAlign:'center',fontSize:12,color:C.muted}}>No notifications yet</div>
                ):notifications.map(n=>(
                  <div key={n.id} style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}22`,
                    background:n.read?'transparent':`${C.gold}0a`}}>
                    <div style={{fontSize:12,color:n.is_read?C.muted:C.white,lineHeight:1.5}}>{n.body||n.message}</div>
                    <div style={{fontSize:9,color:C.dim,marginTop:3}}>
                      {n.created_at?new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── scrollable tab row — hidden when opened as Check-In only ── */}
        {initialTab !== 'checkin' && (
          <div style={{display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none',touchAction:'pan-x',padding:'0 8px'}}>
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{
                  flexShrink:0, padding:'8px 14px', border:'none',
                  borderBottom:`3px solid ${tab===k?C.gold:'transparent'}`,
                  background:tab===k?`${C.gold}18`:'none',
                  color:tab===k?C.white:C.muted,
                  fontSize:12, fontWeight:tab===k?700:500,
                  cursor:'pointer', whiteSpace:'nowrap',
                  transition:'all 0.15s',
                }}>
                {l}
              </button>
            ))}
          </div>
        )}
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
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:.6}}>LOE FOOD QUALITY STANDARDS</div>
                {isCoach&&(
                  loeEditing
                    ? <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>{setLoeEditing(false);persistLoe(loeContent)}}
                          style={{fontSize:9,padding:'2px 8px',background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:5,color:C.gold,cursor:'pointer',fontWeight:700}}>
                          ✓ Done
                        </button>
                        <button onClick={()=>{setLoeContent(LOE_DEFAULT);localStorage.setItem(loeKey,LOE_DEFAULT);setLoeEditing(false);persistLoe(LOE_DEFAULT)}}
                          style={{fontSize:9,padding:'2px 8px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:'pointer'}}>
                          Reset
                        </button>
                      </div>
                    : <button onClick={()=>setLoeEditing(true)}
                        style={{fontSize:9,padding:'2px 8px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:'pointer'}}>
                        ✏️ Edit
                      </button>
                )}
              </div>
              {isCoach&&loeEditing
                ? <textarea
                    value={loeContent}
                    onChange={e=>saveLoe(e.target.value)}
                    rows={6}
                    style={{width:'100%',background:C.card,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'8px 10px',
                      color:C.white,fontSize:10,lineHeight:1.7,resize:'vertical',outline:'none',
                      fontFamily:'inherit',boxSizing:'border-box'}}
                  />
                : <div style={{fontSize:10,color:C.muted,lineHeight:1.8,whiteSpace:'pre-wrap'}}>
                    {loeContent}
                  </div>
              }
            </div>
          </Card>

          {/* Meals */}
          {meals.map((meal,mi)=>{
            const mt = mealMacros(meal)
            const mealRecs = assignedRecipes.filter(r=>(r.meal_name||'')=== meal.name)
            const recM = mealRecs.reduce((a,r)=>({
              cal: a.cal+(r.cal||0)*(r.servings||1), pro: a.pro+(r.pro||0)*(r.servings||1),
              fat: a.fat+(r.fat||0)*(r.servings||1), carb:a.carb+(r.carb||0)*(r.servings||1),
            }),{cal:0,pro:0,fat:0,carb:0})
            const totalMt = {
              cal: mt.cal+Math.round(recM.cal), pro: mt.pro+Math.round(recM.pro),
              fat: mt.fat+Math.round(recM.fat), carb:mt.carb+Math.round(recM.carb),
            }
            return (
              <Card key={mi} sx={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.white}}>{meal.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,color:C.gold,fontWeight:600}}>{totalMt.cal} cal</span>
                    <span style={{fontSize:10,color:C.muted}}>P:{totalMt.pro}g C:{totalMt.carb}g F:{totalMt.fat}g</span>
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
                    // Coach: full editable row with actual unit input
                    (()=>{
                      const ps = parseServing(item.food.serving)
                      const actualAmt = Math.round(item.servings * ps.amount * 10) / 10
                      const step = ps.unit==='g'||ps.unit==='ml'?5:ps.unit==='oz'?0.5:0.25
                      return (
                        <div key={fi} style={{padding:'7px 0',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,color:C.white,fontWeight:500}}>{item.food.name}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                              {actualAmt}{ps.unit} · {Math.round(item.food.cal*item.servings)}cal · P:{Math.round(item.food.pro*item.servings)}g C:{Math.round(item.food.carb*item.servings)}g F:{Math.round(item.food.fat*item.servings)}g
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                            <input type="number" min={step} step={step} value={actualAmt}
                              onChange={e=>{const v=parseFloat(e.target.value);if(v>0)updateServings(mi,fi,v/ps.amount)}}
                              style={{width:54,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 6px',color:C.white,fontSize:12,outline:'none',textAlign:'center'}}/>
                            <span style={{fontSize:10,color:C.muted,flexShrink:0}}>{ps.unit}</span>
                            <button onClick={()=>removeFood(mi,fi)}
                              style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:16,padding:'0 2px',marginLeft:2}}>×</button>
                          </div>
                        </div>
                      )
                    })()
                  ):(
                    // Client: view only row
                    <ReadOnlyFoodRow key={fi} item={item}/>
                  )
                ))}

                {/* Recipes assigned to this meal */}
                {(()=>{
                  const mealRecipes = assignedRecipes.filter(r=>(r.meal_name||'')=== meal.name)
                  if(mealRecipes.length===0) return null
                  return (
                    <div style={{marginTop:8,paddingTop:8,borderTop:`1px dashed ${C.gold}33`}}>
                      {mealRecipes.map((r,ri)=>{
                        const s = r.servings||1
                        const rName = r.name||r.recipe_name
                        return (
                          <div key={ri} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',
                            borderBottom:ri<mealRecipes.length-1?`1px solid ${C.border}22`:'none'}}>
                            <span style={{fontSize:18,flexShrink:0}}>{RECIPE_CAT_EMOJI[r.category]||'🍽'}</span>
                            <div onClick={()=>setViewRecipe(r)} style={{flex:1,minWidth:0,cursor:'pointer'}} title="View full recipe">
                              <div style={{fontSize:12,fontWeight:700,color:C.gold,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{rName} <span style={{fontSize:9,fontWeight:400,color:C.muted}}>· view ›</span></div>
                              <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                                {s!==1&&<span style={{color:C.gold,marginRight:3}}>×{s}</span>}
                                {Math.round((r.cal||0)*s)} cal · P:{Math.round((r.pro||0)*s)}g · C:{Math.round((r.carb||0)*s)}g · F:{Math.round((r.fat||0)*s)}g
                              </div>
                            </div>
                            {isCoach&&(
                              <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                                <button onClick={()=>updateRecipeServings(r.db_id,rName,s-0.25)} disabled={s<=0.25}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:s<=0.25?0.4:1,padding:0,lineHeight:1}}>−</button>
                                <span style={{fontSize:11,fontWeight:700,color:C.white,width:26,textAlign:'center'}}>{s}</span>
                                <button onClick={()=>updateRecipeServings(r.db_id,rName,s+0.25)}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1}}>+</button>
                                <span style={{fontSize:9,color:C.muted,marginRight:4}}>srv</span>
                                <button onClick={()=>removeRecipe(r.db_id,rName)}
                                  style={{background:'none',border:'none',color:C.muted,fontSize:18,cursor:'pointer',padding:'0 2px',lineHeight:1}}>×</button>
                              </div>
                            )}
                            {isClient&&(
                              <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:20,background:`${C.gold}22`,color:C.gold,flexShrink:0}}>
                                {s!==1?`×${s} `:''}Recipe
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

{/* meal notes now live in the Check-In > Submit tab */}
              </Card>
            )
          })}

          {isCoach&&(
            <button onClick={async()=>{if(!myUUID){alert('Still loading this client\'s profile — try again in a second.');return}const ok=await dbInsert('diet_plans',{client_id:myUUID,coach_id:myCoachId,protocol,high_day_meals:JSON.stringify(highMeals),low_day_meals:JSON.stringify(lowMeals),targets:JSON.stringify(targets),updated_at:new Date().toISOString()});if(!ok){alert('Could not save the diet plan — please try again.');return}await insertNotification(myUUID, myCoachId, 'diet_update', '🥗 Your coach updated your diet plan — check your Diet tab', 'diet');alert('Diet plan saved!')}}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:16}}>
              Save Diet Plan
            </button>
          )}

          {/* ── Coach: assign individual recipes — only when the org's tier includes the Recipe Book ── */}
          {isCoach&&tierRecipes===true&&(
            <div style={{marginBottom:24}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.white}}>🍽 Recipes for This Client</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>Share individual recipes from your full recipe book</div>
                </div>
                <button onClick={()=>setShowRecipePicker(true)}
                  style={{background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:8,padding:'7px 14px',color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                  ＋ Assign Recipe
                </button>
              </div>
              {assignedRecipes.length===0?(
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24,textAlign:'center'}}>
                  <div style={{fontSize:28,marginBottom:8}}>📖</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>No recipes assigned yet.<br/>Click <strong style={{color:C.white}}>＋ Assign Recipe</strong> to share specific recipes with this client.</div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {assignedRecipes.map((r,i)=>(
                    <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',display:'flex',alignItems:'center',gap:12}}>
                      <span style={{fontSize:22,flexShrink:0}}>{RECIPE_CAT_EMOJI[r.category]||'🍽'}</span>
                      <div onClick={()=>setViewRecipe(r)} style={{flex:1,minWidth:0,cursor:'pointer'}} title="View full recipe">
                        <div style={{fontSize:13,fontWeight:700,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name||r.recipe_name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{r.category} · {r.cal} cal · P:{r.pro}g · C:{r.carb}g · F:{r.fat}g · <span style={{color:C.gold}}>view ›</span></div>
                        {r.meal_name&&<div style={{fontSize:10,color:C.gold,marginTop:3,fontWeight:600}}>📍 {r.meal_name}</div>}
                      </div>
                      <button onClick={()=>removeRecipe(r.db_id, r.name||r.recipe_name)}
                        style={{background:'none',border:'none',color:C.muted,fontSize:20,cursor:'pointer',padding:'0 4px',flexShrink:0,lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Client: recipe preview + purchase — hidden entirely for orgs whose tier excludes the Recipe Book ── */}
          {isClient&&tierRecipes===true&&(
            <div style={{marginBottom:24}}>

              {/* Coach-assigned recipes — fully unlocked */}
              {assignedRecipes.length>0&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>📌 Your Recipes from Coach</div>
                  {assignedRecipes.map((r,i)=>(
                    <div key={i} onClick={()=>setViewRecipe(r)} style={{background:'#0d1a00',border:`1px solid ${C.gold}44`,borderRadius:10,padding:'12px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} title="View full recipe">
                      <span style={{fontSize:22,flexShrink:0}}>{RECIPE_CAT_EMOJI[r.category]||'🍽'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name||r.recipe_name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{r.category} · {r.cal} cal · P:{r.pro}g · C:{r.carb}g · F:{r.fat}g · <span style={{color:C.gold}}>view recipe ›</span></div>
                      </div>
                      <span style={{fontSize:9,fontWeight:700,padding:'3px 9px',borderRadius:20,background:`${C.gold}22`,color:C.gold,flexShrink:0}}>✓ Unlocked</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Full recipe book — locked preview */}
              <div style={{background:'linear-gradient(160deg,#0d1200,#1a1500)',border:`1px solid ${C.gold}33`,borderRadius:14,overflow:'hidden'}}>
                {/* Header */}
                <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.gold}22`}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.white}}>📖 Eden Recipe Book</div>
                    <span style={{fontSize:9,fontWeight:700,padding:'3px 10px',borderRadius:20,background:`${C.gold}22`,color:C.gold}}>{STATIC_RECIPES.length} Recipes</span>
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>{RECIPE_CATS.length-1} categories · whole food · aligned with your protocol</div>
                </div>

                {/* Category pills */}
                <div style={{padding:'10px 16px',display:'flex',flexWrap:'wrap',gap:6,borderBottom:`1px solid ${C.gold}22`}}>
                  {RECIPE_CATS.filter(c=>c!=='All').map(cat=>(
                    <span key={cat} style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:C.surface,border:`1px solid ${C.border}`,color:C.muted}}>
                      {RECIPE_CAT_EMOJI[cat]||''} {cat} ({STATIC_RECIPES.filter(r=>r.category===cat).length})
                    </span>
                  ))}
                </div>

                {/* Locked recipe list */}
                <div style={{maxHeight:260,overflowY:'auto'}}>
                  {STATIC_RECIPES.map((r,i)=>{
                    const unlocked = assignedRecipes.some(a=>(a.name||a.recipe_name)===r.name)
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{fontSize:14,flexShrink:0}}>{RECIPE_CAT_EMOJI[r.category]||'🍽'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:unlocked?700:500,color:unlocked?C.gold:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div>
                          <div style={{fontSize:10,color:C.muted}}>{r.category}</div>
                        </div>
                        {unlocked?(
                          <span style={{fontSize:9,fontWeight:700,color:C.gold,flexShrink:0}}>✓ Unlocked</span>
                        ):(
                          <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                            <span style={{fontSize:10,color:C.muted}}>{r.cal} cal</span>
                            <span style={{fontSize:12,color:C.border}}>🔒</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Purchase CTA */}
                <div style={{padding:16,textAlign:'center',borderTop:`1px solid ${C.gold}22`}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.6}}>
                    Full macros, ingredients &amp; step-by-step instructions<br/>for all {STATIC_RECIPES.length} whole food recipes
                  </div>
                  <a href={RECIPE_BUY} target="_blank" rel="noreferrer"
                    style={{display:'block',background:C.gold,borderRadius:10,padding:'12px 0',fontWeight:800,color:C.black,fontSize:14,textDecoration:'none',textAlign:'center'}}>
                    🍽 Get the Full Recipe Book
                  </a>
                </div>
              </div>
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
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10}}>
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
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr 1fr',gap:10}}>
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
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr 1fr',gap:10,marginBottom:12}}>
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
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'140px 1fr',gap:10,marginBottom:10}}>
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

            {/* Sub-tab bar */}
            <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.surface}}>
              {[['checkins','📋 Check-Ins'],['photos','📸 Photos']].map(([k,l])=>(
                <button key={k} onClick={()=>setCoachCheckinTab(k)}
                  style={{flex:1,background:'none',border:'none',borderBottom:`2px solid ${coachCheckinTab===k?C.gold:'transparent'}`,
                    padding:'12px 8px',color:coachCheckinTab===k?C.gold:C.muted,fontSize:12,fontWeight:coachCheckinTab===k?700:400,cursor:'pointer'}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{flex:1,overflowY:'auto',padding:16}}>

              {coachCheckinTab==='checkins'&&<>

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
                        <button onClick={()=>{
                          setCoachOnlyUpdates(p=>p.filter(u=>u.id!==item.id))
                          if(typeof item.id==='string') dbDelete('coach_updates',`id=eq.${item.id}`)
                        }} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:18,lineHeight:1,padding:'0 4px'}}>×</button>
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
                          {ci.time&&<span style={{fontSize:10,color:C.muted,fontWeight:500}}>· {ci.time}</span>}
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

                        {/* Vitals — every metric on the form shows here; skipped ones are marked */}
                        {(['weight','temp','steps','bp','heartRate','hrv'].some(on)||ci.weight||ci.temp||ci.heartRate||ci.hrv||ci.steps||ci.bloodPressure)&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>Vitals</div>
                            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                              <VitalsRow ci={ci}/>
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

                        {/* Custom form metrics (coach's customized check-in form) — skipped ones are marked */}
                        {((ci.custom&&Object.keys(ci.custom).length>0)||ciForm.custom.length>0)&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>📋 Custom Metrics</div>
                            {Object.entries(ci.custom||{}).map(([label,val])=>(
                              <div key={label} style={{display:'flex',gap:10,alignItems:'baseline',padding:'3px 0'}}>
                                <span style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,flexShrink:0}}>{label}</span>
                                <span style={{fontSize:12,color:C.white,whiteSpace:'pre-wrap'}}>{val}</span>
                              </div>
                            ))}
                            {ciForm.custom.filter(cm=>!(ci.custom&&String(ci.custom[cm.label]??'').trim()!=='')).map(cm=>(
                              <div key={cm.label} style={{display:'flex',gap:10,alignItems:'baseline',padding:'3px 0'}}>
                                <span style={{fontSize:10,fontWeight:700,color:'#555',letterSpacing:.5,flexShrink:0}}>{cm.label}</span>
                                <span style={{fontSize:11,color:'#555',fontStyle:'italic'}}>— not provided</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Meal adjustment notes from client */}
                        {ci.mealNotes&&Object.keys(ci.mealNotes).some(k=>ci.mealNotes[k])&&(
                          <div style={{background:C.surface,borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>🍽 Meal Adjustments</div>
                            {Object.entries(ci.mealNotes).filter(([,v])=>v).map(([mealName,note])=>(
                              <div key={mealName} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
                                <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:.5,marginBottom:3}}>{mealName}</div>
                                <div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note}</div>
                              </div>
                            ))}
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
                            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:'6px 12px'}}>
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
                                  const clientId = myUUID
                                  const coachId  = myCoachId
                                  if(clientId && coachId) {
                                    dbUpsert('coach_responses',{
                                      client_id:clientId, coach_id:coachId,
                                      checkin_date:saved.date,
                                      coach_notes:draftNote.trim(), coach_loom:draftLoom.trim(),
                                      updated_at:new Date().toISOString()
                                    },'client_id,checkin_date')
                                    // Mark the check-in reviewed so it drops out of the
                                    // "needs review" highlight on the coach's Clients tab
                                    if(saved._dbId) dbUpdate('weekly_checkins', `id=eq.${saved._dbId}`,
                                      { coach_reviewed_at:new Date().toISOString() }).catch(()=>{})
                                    insertNotification(clientId, coachId, 'coach_response',
                                      `💬 Your coach reviewed your ${saved.date} check-in — new feedback waiting`)
                                  }
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

              </>}

              {/* ── Photos sub-tab ── */}
              {coachCheckinTab==='photos'&&(<>
                {Array.isArray(clientPhotos)&&clientPhotos.filter(p=>p.photo_url).length>1&&(
                  <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
                    <button onClick={()=>setPhotoCompare(v=>!v)}
                      style={{background:photoCompare?C.gold:'none',color:photoCompare?'#000':C.gold,
                        border:`1px solid ${C.gold}66`,borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      {photoCompare?'✕ Exit Compare':'🔀 Compare Side-by-Side'}
                    </button>
                  </div>
                )}
                {photoCompare&&Array.isArray(clientPhotos)&&clientPhotos.length>0?(
                  <PhotoCompare photos={clientPhotos} isMobile={isMobile}/>
                ):clientPhotos===null?(
                  <div style={{textAlign:'center',padding:40,color:C.muted,fontSize:12}}>Loading photos…</div>
                ):clientPhotos.length===0?(
                  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:40,textAlign:'center'}}>
                    <div style={{fontSize:40,marginBottom:12}}>📸</div>
                    <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:6}}>No photos uploaded yet</div>
                    <div style={{fontSize:12,color:C.muted}}>Photos the client uploads will appear here, grouped by week.</div>
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
                      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:8}}>
                        {wPhotos.map((p,i)=>(
                          p.photo_url?(
                            <div key={i}>
                              <a href={p.photo_url} target="_blank" rel="noreferrer" style={{display:'block'}}>
                                <img src={p.photo_url} alt={`${week} — ${p.notes||`photo ${i+1}`}`}
                                  style={{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:10,display:'block',border:`1px solid ${C.border}`}}/>
                              </a>
                              <div style={{fontSize:11,fontWeight:700,color:C.gold,textAlign:'center',marginTop:4}}>{p.notes||`Photo ${i+1}`}</div>
                            </div>
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

              {/* ── Consultations sub-tab (coach) ── */}

            </div>
          </div>

        ) : (

          /* ── CLIENT VIEW ────────────────────────────────────── */
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Tab switcher */}
            <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.surface}}>
              {[['history','📋 History & Feedback'],['consultations','📞 Consultations'],['photos','📸 Photos'],['submit','📝 Submit Check-In']].map(([k,l])=>(
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

                {/* Update schedule banner — always visible */}
                <div style={{background:`${C.gold}12`,border:`1.5px solid ${updateDay?C.gold+'55':C.border}`,borderLeft:`3px solid ${updateDay?C.gold:C.border}`,borderRadius:10,padding:'12px 14px',marginBottom:16}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:.6,textTransform:'uppercase',marginBottom:6}}>📅 Your Update Schedule</div>
                  {updateDay ? (<>
                    <div style={{fontSize:15,fontWeight:800,color:C.white,marginBottom:4}}>Every {updateDay} — before {deadline.text}</div>
                    {nextUpdateDate(updateDay)&&(
                      <div style={{fontSize:11,color:C.muted}}>
                        Next deadline: <span style={{color:C.white,fontWeight:600}}>{nextUpdateDate(updateDay)}</span>
                      </div>
                    )}
                  </>) : (
                    <div style={{fontSize:13,color:C.muted,lineHeight:1.5}}>
                      Your coach hasn't assigned your update day yet. <span style={{color:C.white}}>Check back soon.</span>
                    </div>
                  )}
                </div>

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
                          {ci.time&&<span style={{fontSize:10,color:C.muted,fontWeight:500,marginLeft:6}}>· {ci.time}</span>}
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

                          {/* Vitals row — skipped metrics show as "not provided" */}
                          <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:12}}>
                            <VitalsRow ci={ci}/>
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
                              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:'6px 12px'}}>
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
                              <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>💬 Coach Response</div>
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

              {/* ─── Consultations tab (client, read-only mirror of coach's Week6 Consultation tab) ─── */}
              {clientViewTab==='consultations'&&(<>

                {/* ── Intake record ── */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white}}>Initial Intake — Onboarding Consultation</div>
                    <span style={{fontSize:9,background:`${C.gold}22`,color:C.gold,padding:'2px 7px',borderRadius:10,fontWeight:700,letterSpacing:.5}}>VIEW ONLY</span>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.5}}>
                    Your intake notes from your initial onboarding consultation.
                  </div>
                  {clientIntake.notes?(
                    <div style={{background:C.surface,borderRadius:8,padding:'12px',fontSize:13,color:C.white,lineHeight:1.7,whiteSpace:'pre-wrap'}}>
                      {clientIntake.notes}
                    </div>
                  ):(
                    <div style={{background:C.surface,borderRadius:8,padding:'20px',textAlign:'center',fontSize:12,color:C.muted}}>
                      Your coach hasn't added intake notes yet.
                    </div>
                  )}
                  {(clientIntake.startDate||clientIntake.startWeight)&&(
                    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginTop:12}}>
                      {clientIntake.startDate&&(
                        <div style={{background:C.surface,borderRadius:8,padding:'10px 12px'}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:3}}>Start Date</div>
                          <div style={{fontSize:13,color:C.white,fontWeight:600}}>{clientIntake.startDate}</div>
                        </div>
                      )}
                      {clientIntake.startWeight&&(
                        <div style={{background:C.surface,borderRadius:8,padding:'10px 12px'}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:3}}>Starting Weight</div>
                          <div style={{fontSize:13,color:C.white,fontWeight:600}}>{clientIntake.startWeight} lbs</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Onboarding documents from your coach/admin */}
                  {consultDocs.filter(d=>d.doc_type==='onboarding').length>0&&(
                    <div style={{marginTop:14}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:2}}>Onboarding Documents</div>
                      {consultDocs.filter(d=>d.doc_type==='onboarding').map(doc=>(
                        <div key={doc.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                          <span style={{fontSize:16,flexShrink:0}}>🌱</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:700,color:C.white}}>{doc.title}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:2}}>Onboarding Consultation · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}</div>
                            {doc.content&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.5}}>{doc.content}</div>}
                            {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:4,display:'block'}}>View File →</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Call notes history ── */}
                <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:4}}>Call Notes History</div>
                <div style={{fontSize:10,color:C.muted,marginBottom:12}}>Monthly calls, emergency calls, therapy sessions, strategy calls</div>

                {/* Monthly / emergency call documents from your coach/admin */}
                {consultDocs.filter(d=>d.doc_type==='monthly'||d.doc_type==='emergency').length>0&&(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'6px 16px 10px',marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',margin:'8px 0 2px'}}>Call Documents</div>
                    {consultDocs.filter(d=>d.doc_type==='monthly'||d.doc_type==='emergency').map(doc=>(
                      <div key={doc.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                        <span style={{fontSize:16,flexShrink:0}}>{doc.doc_type==='emergency'?'🚨':'📆'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.white}}>{doc.title}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{doc.doc_type==='emergency'?'Emergency Call':'Monthly Check-In'} · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}</div>
                          {doc.content&&<div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.5}}>{doc.content}</div>}
                          {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:4,display:'block'}}>View File →</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {callNotesList.length===0?(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:32,textAlign:'center'}}>
                    <div style={{fontSize:12,color:C.muted}}>No call notes yet. Your coach will add them after each session.</div>
                  </div>
                ):callNotesList.map(note=>{
                  const raw  = note.loom_url||''
                  const embed = raw.replace('loom.com/share/','loom.com/embed/')
                  return (
                    <div key={note.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,borderRadius:12,padding:16,marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.8,marginBottom:3}}>
                            {(note.call_type||'').toUpperCase()}
                          </div>
                          <div style={{fontSize:11,color:C.muted}}>
                            {note.call_date?new Date(note.call_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):''}
                          </div>
                        </div>
                        {note.next_call_date&&(
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:9,color:C.muted,marginBottom:2}}>NEXT CALL</div>
                            <div style={{fontSize:11,color:C.success,fontWeight:600}}>
                              {new Date(note.next_call_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                            </div>
                          </div>
                        )}
                      </div>

                      {note.summary&&(
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Summary</div>
                          <div style={{fontSize:13,color:C.white,lineHeight:1.6}}>{note.summary}</div>
                        </div>
                      )}

                      {note.focus_points&&(
                        <div style={{marginBottom:10,background:C.surface,borderRadius:8,padding:'10px 12px'}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Focus Points</div>
                          <div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.focus_points}</div>
                        </div>
                      )}

                      {note.action_items&&(
                        <div style={{background:`${C.success}11`,border:`1px solid ${C.success}33`,borderRadius:8,padding:'10px 12px',marginBottom:embed?10:0}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.success,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Action Items</div>
                          <div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.action_items}</div>
                        </div>
                      )}

                      {note.other_links&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🔗 Other Links</div>
                          {note.other_links.split(/\s*\n\s*/).filter(Boolean).map((ln,i)=>(
                            /^https?:\/\//i.test(ln.trim())
                              ? <a key={i} href={ln.trim()} target="_blank" rel="noopener noreferrer"
                                  style={{display:'block',fontSize:12,color:C.gold,marginBottom:4,wordBreak:'break-all'}}>{ln.trim()}</a>
                              : <div key={i} style={{fontSize:12,color:C.white,marginBottom:4}}>{ln.trim()}</div>
                          ))}
                        </div>
                      )}
                      {embed&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🎥 Loom Recording</div>
                          <div style={{position:'relative',paddingBottom:'56.25%',overflow:'hidden',borderRadius:10,border:`1px solid ${C.border}`}}>
                            <iframe src={embed} allowFullScreen title="Loom recording"
                              style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {adminFormDocs.length>0&&(
                  <div style={{marginTop:16}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>📎 Documents from Admin</div>
                    {adminFormDocs.map(doc=>(
                      <div key={doc.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,borderRadius:12,padding:14,marginBottom:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                          <span style={{fontSize:14}}>{{note:'📝',form:'📋',document:'📄'}[doc.doc_type]||'📄'}</span>
                          <div style={{fontSize:12,fontWeight:700,color:C.white}}>{doc.title}</div>
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:'capitalize'}}>{doc.doc_type} · {doc.added_by_name} · {doc.created_at?new Date(doc.created_at).toLocaleDateString():''}</div>
                        {doc.content&&<div style={{fontSize:12,color:C.white,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{doc.content}</div>}
                        {doc.file_url&&<a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.gold,marginTop:6,display:'block',fontWeight:700}}>View File →</a>}
                      </div>
                    ))}
                  </div>
                )}
              </>)}

              {/* ─── Photos tab ─── */}
              {clientViewTab==='photos'&&(<>
                <input type="file" ref={photoFileRef} accept="image/*" multiple style={{display:'none'}} onChange={uploadProgressPhoto}/>
                <button onClick={()=>photoFileRef.current?.click()} disabled={photoUploading}
                  style={{width:'100%',background:'none',border:`2px dashed ${C.gold}66`,borderRadius:12,
                    padding:'18px',color:C.gold,fontSize:13,fontWeight:700,
                    cursor:photoUploading?'not-allowed':'pointer',marginBottom:6,
                    display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                    opacity:photoUploading?0.5:1}}>
                  {photoUploading?'⏳ Uploading…':'📸 Upload Progress Photos'}
                </button>
                <div style={{fontSize:11,color:C.muted,textAlign:'center',marginBottom:20}}>
                  Select up to 10 at once — they go into {currentWeekLabel(clientPhotos)} automatically, named Front / Side / Back (tap ✏️ to rename any photo). Your coach can see these.
                </div>

                {Array.isArray(clientPhotos)&&clientPhotos.filter(p=>p.photo_url).length>1&&(
                  <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
                    <button onClick={()=>setPhotoCompare(v=>!v)}
                      style={{background:photoCompare?C.gold:'none',color:photoCompare?'#000':C.gold,
                        border:`1px solid ${C.gold}66`,borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      {photoCompare?'✕ Exit Compare':'🔀 Compare Side-by-Side'}
                    </button>
                  </div>
                )}
                {photoCompare&&Array.isArray(clientPhotos)&&clientPhotos.length>0?(
                  <PhotoCompare photos={clientPhotos} isMobile={isMobile}/>
                ):clientPhotos===null?(
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
                      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:8}}>
                        {wPhotos.map((p,i)=>(
                          p.photo_url?(
                            <div key={i}>
                              <a href={p.photo_url} target="_blank" rel="noreferrer" style={{display:'block'}}>
                                <img src={p.photo_url} alt={`${week} — ${p.notes||`photo ${i+1}`}`}
                                  style={{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:10,display:'block',border:`1px solid ${C.border}`}}/>
                              </a>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:4}}>
                                <span style={{fontSize:11,fontWeight:700,color:C.gold}}>{p.notes||`Photo ${i+1}`}</span>
                                <button onClick={()=>renamePhoto(p)} title="Rename this photo"
                                  style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:C.muted,padding:0}}>✏️</button>
                              </div>
                            </div>
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
                  ⚠️ All weekly updates MUST be in before {deadline.text}{updateDay
                    ? <> every <strong>{updateDay}</strong>{nextUpdateDate(updateDay) ? ` (next: ${nextUpdateDate(updateDay)})` : ''}</>
                    : ' on your assigned update day'}. Wake up on empty stomach. Include fasted weight + photos.
                </div>
                {['weight','temp','steps','bp','heartRate','hrv'].some(on)&&(
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Vitals"/>
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10}}>
                    {on('weight')&&<Inp label="Body Weight (lbs)" value={ci.weight} onChange={setC('weight')} placeholder="e.g. 172.4" type="number"/>}
                    {on('temp')&&<Inp label="Body Temperature (°F)" value={ci.temp} onChange={setC('temp')} placeholder="e.g. 97.8" type="number"/>}
                    {on('steps')&&<Inp label="Avg Daily Steps" value={ci.steps} onChange={setC('steps')} placeholder="e.g. 9500" type="number"/>}
                    {on('bp')&&<Inp label="Blood Pressure" value={ci.bp} onChange={setC('bp')} placeholder="e.g. 120/80"/>}
                    {on('heartRate')&&<Inp label="Morning Heart Rate (BPM)" value={ci.heartRate} onChange={setC('heartRate')} placeholder="e.g. 58" type="number"/>}
                    {on('hrv')&&<Inp label="HRV" value={ci.hrv} onChange={setC('hrv')} placeholder="e.g. 72" type="number"/>}
                  </div>
                </Card>)}
                {['sleep','bloating','brainFog','sexDrive','energy','hunger'].some(on)&&(
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Wellbeing Scales (1–10)"/>
                  {[
                    ['sleep',   'Sleep Quality', '1=awful · 10=perfect'],
                    ['bloating','Bloating',       '1=none · 10=extreme'],
                    ['brainFog','Brain Fog',      '1=none · 10=extreme'],
                    ['sexDrive','Sex Drive',      '1=low · 10=high'],
                    ['energy',  'Energy',         '1=awful · 10=perfect'],
                    ['hunger',  'Hunger',         '1=not hungry · 10=starving'],
                  ].filter(([k])=>on(k)).map(([k,l,d])=>(
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
                </Card>)}
                {['wakeTime','sleepNotes','bowelCount','bowelType'].some(on)&&(
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Sleep & Digestion"/>
                  {on('wakeTime')&&<Inp label="Sleep window (falling asleep / waking)" value={ci.wakeTime} onChange={setC('wakeTime')} placeholder="e.g. Asleep 10pm, wake 5am"/>}
                  {on('sleepNotes')&&<div style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Sleep Disruption Notes</div>
                    <textarea value={ci.sleepNotes} onChange={e=>setC('sleepNotes')(e.target.value)} placeholder="Describe disruptions, times, duration…"
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:50,fontFamily:'inherit'}}/>
                  </div>}
                  {(on('bowelCount')||on('bowelType'))&&<div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:10}}>
                    {on('bowelCount')&&<Inp label="Avg Daily Bowel Movements" value={ci.bowelCount} onChange={setC('bowelCount')} placeholder="e.g. 2" type="number"/>}
                    {on('bowelType')&&<Sel label="Stool Consistency" value={ci.bowelType||''} onChange={setC('bowelType')} options={['','Well formed','Loose','Diarrhea','Constipated','Mixed']}/>}
                  </div>}
                </Card>)}
                {on('cycle')&&(
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
                </Card>)}

                {/* Custom metrics from the coach's check-in form */}
                {ciForm.custom.length>0&&(
                <Card sx={{marginBottom:12}}>
                  <Lbl t="More From Your Coach"/>
                  {ciForm.custom.map(cm=>(
                    <div key={cm.id} style={{marginBottom:13}}>
                      {cm.type==='scale'?(<>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>{cm.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:C.gold}}>{customAnswers[cm.label]||'5'}/10</span>
                        </div>
                        <input type="range" min="1" max="10" value={customAnswers[cm.label]||'5'}
                          onChange={e=>setCustomAnswers(p=>({...p,[cm.label]:e.target.value}))} style={{width:'100%',accentColor:C.gold}}/>
                      </>):cm.type==='number'?(
                        <Inp label={cm.label} value={customAnswers[cm.label]||''} type="number"
                          onChange={v=>setCustomAnswers(p=>({...p,[cm.label]:v}))} placeholder="Enter a number"/>
                      ):(<>
                        <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>{cm.label}</div>
                        <textarea value={customAnswers[cm.label]||''} onChange={e=>setCustomAnswers(p=>({...p,[cm.label]:e.target.value}))}
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:50,fontFamily:'inherit'}}/>
                      </>)}
                    </div>
                  ))}
                </Card>)}

                {/* Protocol Duration */}
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Protocol Duration"/>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.6}}>
                    For each protocol below, enter how long you have been following it (e.g. "3 weeks", "5 days", "2 months").
                  </div>

                  {/* Assigned supplement protocol rows (auto-populated from coach assignments) */}
                  {(()=>{
                    const assignedProtocols=[...new Set(clientSupps.filter(s=>s.protocolGroup).map(s=>s.protocolGroup))]
                    return assignedProtocols.map(proto=>(
                      <div key={proto} style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,textTransform:'uppercase',marginBottom:4}}>{proto}</div>
                        <input
                          value={protocolDurations[proto]||''}
                          onChange={e=>setProtDur(proto,e.target.value)}
                          placeholder="e.g. 3 weeks, Day 14, Started Jan 6…"
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}
                        />
                      </div>
                    ))
                  })()}

                  {/* Flush Protocol — diet-based, always shown */}
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,textTransform:'uppercase',marginBottom:4}}>
                      If on the Specific Diet &ldquo;Flush Protocol&rdquo;
                    </div>
                    <input
                      value={protocolDurations['Flush Protocol']||''}
                      onChange={e=>setProtDur('Flush Protocol',e.target.value)}
                      placeholder="e.g. 3 weeks, Day 14, Started Jan 6…"
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}
                    />
                  </div>

                  {/* Other protocols — list builder, one line per protocol */}
                  <div style={{marginTop:4}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>
                      Any Other Protocol / Supplement Not Listed?
                    </div>

                    {/* Submitted entries */}
                    {otherProtocols.map(entry=>(
                      <div key={entry.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:6}}>
                        <div style={{flex:1,minWidth:0}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.gold}}>{entry.protocol}</span>
                          <span style={{fontSize:12,color:C.muted}}> — </span>
                          <span style={{fontSize:12,color:C.white}}>{entry.duration}</span>
                        </div>
                        <button
                          onClick={()=>setOtherProtocols(p=>p.filter(e=>e.id!==entry.id))}
                          style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:15,padding:'0 2px',flexShrink:0,lineHeight:1}}>×</button>
                      </div>
                    ))}

                    {/* Draft inputs */}
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      <input
                        value={otherProtoDraft.protocol}
                        onChange={e=>setOtherProtoDraft(p=>({...p,protocol:e.target.value}))}
                        placeholder="Supplement protocol name…"
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}
                      />
                      <div style={{display:'flex',gap:6}}>
                        <input
                          value={otherProtoDraft.duration}
                          onChange={e=>setOtherProtoDraft(p=>({...p,duration:e.target.value}))}
                          onKeyDown={e=>{
                            if(e.key==='Enter'&&otherProtoDraft.protocol.trim()&&otherProtoDraft.duration.trim()){
                              setOtherProtocols(p=>[...p,{id:Date.now(),protocol:otherProtoDraft.protocol.trim(),duration:otherProtoDraft.duration.trim()}])
                              setOtherProtoDraft({protocol:'',duration:''})
                            }
                          }}
                          placeholder="How long (e.g. 3 weeks, Day 14)…"
                          style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}
                        />
                        <button
                          onClick={()=>{
                            if(!otherProtoDraft.protocol.trim()||!otherProtoDraft.duration.trim()) return
                            setOtherProtocols(p=>[...p,{id:Date.now(),protocol:otherProtoDraft.protocol.trim(),duration:otherProtoDraft.duration.trim()}])
                            setOtherProtoDraft({protocol:'',duration:''})
                          }}
                          style={{
                            background:otherProtoDraft.protocol.trim()&&otherProtoDraft.duration.trim()?C.gold:'#333',
                            border:'none',borderRadius:8,padding:'8px 14px',
                            color:otherProtoDraft.protocol.trim()&&otherProtoDraft.duration.trim()?C.black:C.muted,
                            fontWeight:800,fontSize:12,cursor:otherProtoDraft.protocol.trim()&&otherProtoDraft.duration.trim()?'pointer':'default',
                            whiteSpace:'nowrap',flexShrink:0,
                          }}>
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
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

                {/* Meal adjustment notes — one textarea per meal */}
                {meals.length>0&&(
                  <Card sx={{marginBottom:12}}>
                    <Lbl t="🍽 Meal Adjustments This Week"/>
                    <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.6}}>
                      Did you swap anything, skip a meal, or adjust portions? Let your coach know below. Fill this out as close to your check-in as possible.
                    </div>
                    {meals.map((meal,mi)=>(
                      <div key={mi} style={{marginBottom:mi<meals.length-1?14:0}}>
                        <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:.5,textTransform:'uppercase',marginBottom:5}}>{meal.name}</div>
                        <textarea
                          value={mealNotes[meal.name]||''}
                          onChange={e=>setMealNotes(p=>({...p,[meal.name]:e.target.value}))}
                          placeholder={`Any changes to ${meal.name} this week…`}
                          style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:48,fontFamily:'inherit'}}/>
                      </div>
                    ))}
                  </Card>
                )}

                <button onClick={async()=>{
                  if(!myUUID){alert('Still loading your profile — try again in a second.');return}
                  // Only submit metrics that are ON the coach's form (disabled ones save as null)
                  const V=(k,v)=>on(k)?v:null
                  // Custom metric answers (+ cycle data, which has no dedicated columns)
                  const custom={}
                  ciForm.custom.forEach(cm=>{
                    const val=customAnswers[cm.label] ?? (cm.type==='scale'?'5':'')
                    if(String(val).trim()!=='') custom[cm.label]=String(val)
                  })
                  if(on('cycle')&&ci.cycleNotes.trim()){
                    custom['Cycle Notes']=ci.cycleNotes.trim()
                    custom['Period Pain (1–10)']=String(ci.cyclePain)
                  }
                  const hasCustom=Object.keys(custom).length>0
                  // NOTE: the live table has no columns for stress/compliance/mood/habits/
                  // habit_pct — those ride inside protocol_durations.__extra. Notes live in
                  // other_notes, and sleep/bowel details use the camelCase columns.
                  const inserted = await dbInsert('weekly_checkins',{
                    client_id:        myUUID,
                    coach_id:         myCoachId,
                    weight:           V('weight',ci.weight), temp:           V('temp',ci.temp),
                    steps:            V('steps',ci.steps),   heart_rate:     V('heartRate',ci.heartRate),
                    hrv:              V('hrv',ci.hrv),       blood_pressure: V('bp',ci.bp),
                    energy:           V('energy',ci.energy), sleep:          V('sleep',ci.sleep),
                    bloating:         V('bloating',ci.bloating), brain_fog:  V('brainFog',ci.brainFog),
                    sex_drive:        V('sexDrive',ci.sexDrive), hunger:     V('hunger',ci.hunger),
                    sleepWindow:      V('wakeTime',ci.wakeTime),
                    sleepCycles:      ci.sleepCycles,        sleepDisruption: V('sleepNotes',ci.sleepNotes),
                    bowel_count:      V('bowelCount',ci.bowelCount), bowelType: V('bowelType',ci.bowelType),
                    other_notes:      ci.notes,
                    submitted_at:     new Date().toISOString(),
                    meal_notes:       Object.keys(mealNotes).some(k=>mealNotes[k]) ? mealNotes : null,
                    protocol_durations: {...protocolDurations,
                         __others: otherProtocols.length>0 ? otherProtocols : undefined,
                         __custom: hasCustom ? custom : undefined,
                         __extra: { stress:ci.stress, compliance:ci.compliance, mood:ci.mood,
                                    habits:habitCounts, habit_pct:habitScore }},
                  })
                  if(!inserted){
                    alert('Your check-in could not be saved — please try again. If this keeps happening, tell your coach.')
                    return
                  }
                  // Audit trail (server-side — RLS blocks clients from direct inserts)
                  try {
                    const tok = sbAccessToken()
                    if (tok) fetch('/api/audit/event', {
                      method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${tok}` },
                      body: JSON.stringify({ action:'checkin_submitted', target_type:'weekly_checkin',
                        details:{ weight: on('weight')?ci.weight:null, habit_pct: habitScore } }),
                    }).catch(()=>{})
                  } catch {}
                  // Bell notification for the coach (skip self-notifications)
                  const _cId = myCoachId
                  const _clId = myUUID
                  const _clName = dbProfile?.name||info.name||'A client'
                  if(_cId&&_clId&&_cId!==_clId) sendNotification({
                    recipientId:_cId, senderId:_clId, senderName:_clName,
                    type:'checkin_received',
                    body:`📋 ${_clName} submitted their weekly check-in — review it in the Check-In Hub`,
                    linkTo:'checkin',
                  }).catch(()=>{})
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
                {(()=>{
                  const seenGroups=new Set(); const groups=[]; const ungrouped=[]
                  clientSupps.forEach(s=>{
                    if(s.protocolGroup){
                      if(!seenGroups.has(s.protocolGroup)){seenGroups.add(s.protocolGroup);groups.push({name:s.protocolGroup,items:[]})}
                      groups.find(g=>g.name===s.protocolGroup).items.push(s)
                    } else { ungrouped.push(s) }
                  })
                  const renderSuppItem=s=>(
                    <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                        <div>
                          <div style={{fontSize:13,color:C.white,fontWeight:600}}>{s.name}</div>
                          {s.category&&!s.protocolGroup&&<div style={{fontSize:9,color:C.gold,fontWeight:700,letterSpacing:.8,marginTop:2}}>{s.category.toUpperCase()}</div>}
                        </div>
                        <button onClick={()=>removeSupp(s.id)}
                          style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0}}>×</button>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8}}>
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
                  )
                  return(<>
                    {groups.map(g=>(
                      <div key={g.name}>
                        <div style={{margin:'10px 0 2px',padding:'7px 10px',background:`${C.gold}18`,border:`1px solid ${C.gold}40`,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <div style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:.6,textTransform:'uppercase'}}>{g.name}</div>
                          <div style={{fontSize:9,color:C.muted}}>{g.items.length} supplement{g.items.length!==1?'s':''}</div>
                        </div>
                        {g.items.map(renderSuppItem)}
                      </div>
                    ))}
                    {ungrouped.map(renderSuppItem)}
                  </>)
                })()}
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
                    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:10}}>
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
                          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
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
                        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
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

              <button
                onClick={saveSuppProtocol}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:12}}>
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
                    {(()=>{
                      const seenGroups=new Set(); const groups=[]; const ungrouped=[]
                      clientSupps.forEach(s=>{
                        if(s.protocolGroup){
                          if(!seenGroups.has(s.protocolGroup)){seenGroups.add(s.protocolGroup);groups.push({name:s.protocolGroup,items:[]})}
                          groups.find(g=>g.name===s.protocolGroup).items.push(s)
                        } else { ungrouped.push(s) }
                      })
                      const renderItem=s=>(
                        <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                          <div style={{fontSize:13,color:C.white,fontWeight:600,marginBottom:3}}>{s.name}</div>
                          <div style={{fontSize:12,color:C.gold}}>{s.customDose}</div>
                          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.customDir}</div>
                          {s.code&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>Code: <span style={{color:C.gold,fontWeight:700}}>{s.code}</span></div>}
                          {s.link&&<a href={s.link} target="_blank" rel="noreferrer" style={{fontSize:10,color:C.gold,display:'block',marginTop:2}}>Purchase →</a>}
                        </div>
                      )
                      return(<>
                        {groups.map(g=>(
                          <div key={g.name}>
                            <div style={{margin:'10px 0 2px',padding:'7px 12px',background:`${C.gold}15`,border:`1px solid ${C.gold}35`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                              <div style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:.6,textTransform:'uppercase'}}>{g.name}</div>
                              <div style={{fontSize:9,color:C.muted}}>{g.items.length} supps</div>
                            </div>
                            {g.items.map(renderItem)}
                          </div>
                        ))}
                        {ungrouped.map(renderItem)}
                      </>)
                    })()}
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

          {/* Resource links moved to the Labs section (Week4.jsx) */}
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
                      <div key={food.dbId?`db_${food.dbId}`:food.name} style={{display:'flex',alignItems:'center'}}>
                        <button onClick={()=>addFood(food)}
                          style={{flex:1,textAlign:'left',background:'none',border:'none',padding:'8px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}
                          onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
                          onMouseLeave={e=>e.currentTarget.style.background='none'}>
                          <div>
                            <div style={{fontSize:13,color:C.white,fontWeight:500}}>
                              {food.name}
                              {food.fromDB&&<span style={{fontSize:8,fontWeight:700,color:C.gold,marginLeft:6,letterSpacing:0.5,verticalAlign:'middle'}}>COMPANY</span>}
                            </div>
                            <div style={{fontSize:10,color:C.muted,marginTop:1}}>{food.serving}</div>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                            <div style={{fontSize:12,color:C.gold,fontWeight:600}}>{food.cal} cal</div>
                            <div style={{fontSize:10,color:C.muted}}>P:{food.pro}g C:{food.carb}g F:{food.fat}g</div>
                          </div>
                        </button>
                        {isAdmin&&food.fromDB&&(
                          <button onClick={()=>removeCompanyFood(food.dbId)} title="Remove company food"
                            style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'6px 8px',margin:'0 12px 0 4px',color:C.danger,fontSize:11,cursor:'pointer',flexShrink:0}}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            {isAdmin&&(
              <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
                {!showAddFood?(
                  <button onClick={()=>setShowAddFood(true)}
                    style={{width:'100%',background:`${C.gold}15`,border:`1px dashed ${C.gold}66`,borderRadius:8,padding:9,color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    ⚙️ Add Company-Wide Food
                  </button>
                ):(
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>⚙️ Add Company-Wide Food</div>
                    <div style={{display:'flex',gap:6,marginBottom:6}}>
                      <input value={newFood.name} onChange={e=>setNewFood(p=>({...p,name:e.target.value}))} placeholder="Food name"
                        style={{flex:2,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',minWidth:0}}/>
                      <input value={newFood.serving} onChange={e=>setNewFood(p=>({...p,serving:e.target.value}))} placeholder="Serving (e.g. 4oz)"
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none',minWidth:0}}/>
                    </div>
                    <div style={{display:'flex',gap:6,marginBottom:6}}>
                      {[['cal','Cal'],['pro','Protein g'],['carb','Carbs g'],['fat','Fat g'],['fib','Fiber g']].map(([k,ph])=>(
                        <input key={k} value={newFood[k]} onChange={e=>setNewFood(p=>({...p,[k]:e.target.value}))} placeholder={ph} inputMode="decimal"
                          style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 6px',color:C.white,fontSize:11,outline:'none',minWidth:0}}/>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:6,marginBottom:6}}>
                      <select value={newFood.cat} onChange={e=>setNewFood(p=>({...p,cat:e.target.value}))}
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px',color:C.white,fontSize:12,outline:'none',cursor:'pointer'}}>
                        {['Proteins','Carbohydrates','Fats','Fruits/Vegetables','Supplements','Drinks/Condiments'].map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={addCompanyFood}
                        style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 16px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Add</button>
                      <button onClick={()=>setShowAddFood(false)}
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
                    </div>
                    <div style={{fontSize:9,color:C.muted}}>This food will appear in the picker for all coaches across the company.</div>
                  </div>
                )}
              </div>
            )}
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
              {[...MASTER_HABITS.filter(h=>!hiddenItems.habit.has(h.name)),...companyHabits].map(h=>{
                const assigned=assignedHabits.find(x=>x.id===h.id)
                return (
                  <div key={h.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                    <button onClick={()=>toggleHabitAssign(h)}
                      style={{flex:1,textAlign:'left',background:assigned?`${C.gold}15`:C.surface,border:`1px solid ${assigned?C.gold:C.border}`,borderRadius:8,padding:'10px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:16}}>{assigned?'✅':'⬜'}</span>
                      <div>
                        <div style={{fontSize:13,color:C.white,fontWeight:assigned?700:400}}>{h.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>Default: {h.defaultTarget}x/week</div>
                      </div>
                    </button>
                    {isAdmin&&!isWLOrg&&h.fromDB&&(
                      <button onClick={()=>pushHabitToAllOrgs(h)} title="Push to all orgs"
                        style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'6px 8px',color:C.gold,fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>→ All orgs</button>
                    )}
                    {isAdmin&&h.fromDB&&(
                      <button onClick={()=>setEditHabit({id:h.id,name:h.name,target:h.defaultTarget||7})} title="Edit habit"
                        style={{background:`${C.gold}15`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'6px 8px',color:C.gold,fontSize:11,cursor:'pointer',flexShrink:0}}>✎</button>
                    )}
                    {isAdmin&&h.fromDB&&(
                      <button onClick={()=>removeCompanyHabit(h.id)}
                        style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'6px 8px',color:C.danger,fontSize:11,cursor:'pointer',flexShrink:0}}>✕</button>
                    )}
                  </div>
                )
              })}
              {/* Coach: one-off custom habit for THIS client only */}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
                <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>➕ Add Custom Habit (this client only)</div>
                <div style={{display:'flex',gap:8,marginBottom:6}}>
                  <input value={customHabit} onChange={e=>setCustomHabit(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')addCustomHabit()}}
                    placeholder="e.g. 10-min evening walk"
                    style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                  <button onClick={addCustomHabit}
                    style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Add</button>
                </div>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Assigned only to this client — not added to the company library.</div>
              </div>
              {isAdmin&&(
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>⚙️ Add Company-Wide Habit</div>
                  <div style={{display:'flex',gap:8,marginBottom:6}}>
                    <input value={newHabitName} onChange={e=>setNewHabitName(e.target.value)} placeholder="e.g. Infrared Sauna"
                      style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:12,outline:'none'}}/>
                    <select value={newHabitTarget} onChange={e=>setNewHabitTarget(Number(e.target.value))}
                      style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px',color:C.white,fontSize:12,outline:'none',cursor:'pointer'}}>
                      {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}x/wk</option>)}
                    </select>
                    <button onClick={addCompanyHabit}
                      style={{background:C.gold,border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Add</button>
                  </div>
                  <div style={{fontSize:9,color:C.muted}}>This habit will appear for all coaches across the company.</div>
                </div>
              )}
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowHabitPicker(false)}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,color:C.black,fontWeight:800,fontSize:13,cursor:'pointer'}}>
                Done — {assignedHabits.length} habits assigned
              </button>
            </div>
            {/* ── Company habit editor (admins) ── */}
            {editHabit&&(
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
                onClick={e=>{if(e.target===e.currentTarget)setEditHabit(null)}}>
                <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:14,width:'100%',maxWidth:380,padding:18}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.white,marginBottom:12}}>Edit Company Habit</div>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,textTransform:'uppercase',marginBottom:4}}>Habit Name</div>
                  <input value={editHabit.name} onChange={e=>setEditHabit(p=>({...p,name:e.target.value}))}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:10}}/>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,textTransform:'uppercase',marginBottom:4}}>Default Target</div>
                  <select value={editHabit.target} onChange={e=>setEditHabit(p=>({...p,target:Number(e.target.value)}))}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',cursor:'pointer',boxSizing:'border-box'}}>
                    {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}x/week</option>)}
                  </select>
                  <div style={{display:'flex',gap:8,marginTop:14}}>
                    <button onClick={()=>setEditHabit(null)}
                      style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
                    <button onClick={saveCompanyHabit}
                      style={{flex:1,background:C.gold,border:'none',borderRadius:8,padding:10,color:C.black,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Supplement picker modal (coach only) ─────────────── */}
      {/* ── Recipe Picker Modal ────────────────────────────────── */}
      {showRecipePicker&&isCoach&&tierRecipes===true&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:200,display:'flex',flexDirection:'column'}}>
          <div style={{flex:1,background:C.black,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
            {/* Header */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.white}}>🍽 Assign a Recipe</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{assignedRecipes.length} assigned · tap a recipe then choose the meal</div>
              </div>
              <button onClick={()=>{setShowRecipePicker(false);setPendingRecipe(null)}} style={{background:'none',border:'none',color:C.muted,fontSize:24,cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
            </div>
            {/* Search */}
            <div style={{padding:'10px 16px',flexShrink:0}}>
              <input value={recipeSearch} onChange={e=>setRecipeSearch(e.target.value)} placeholder="Search recipes…"
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Category tabs */}
            <div style={{display:'flex',overflowX:'auto',padding:'0 16px 10px',gap:6,flexShrink:0}}>
              {RECIPE_CATS.map(cat=>(
                <button key={cat} onClick={()=>setRecipeFilter(cat)}
                  style={{background:recipeFilter===cat?C.gold:C.surface,border:`1px solid ${recipeFilter===cat?C.gold:C.border}`,borderRadius:20,padding:'5px 14px',
                    color:recipeFilter===cat?C.black:C.muted,fontSize:11,fontWeight:recipeFilter===cat?700:400,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
                  {cat==='All'?`All (${STATIC_RECIPES.length})`:`${RECIPE_CAT_EMOJI[cat]||''} ${cat} (${STATIC_RECIPES.filter(r=>r.category===cat).length})`}
                </button>
              ))}
            </div>
            {/* Recipe list */}
            <div style={{flex:1,overflowY:'auto',padding:'0 16px 8px'}}>
              {STATIC_RECIPES
                .filter(r=>(recipeFilter==='All'||r.category===recipeFilter)&&(!recipeSearch||r.name.toLowerCase().includes(recipeSearch.toLowerCase())))
                .map((r,i)=>{
                  const already = assignedRecipes.some(a=>(a.name||a.recipe_name)===r.name)
                  const isPending = pendingRecipe?.name===r.name
                  const isPreviewing = previewRecipe===r.name
                  const details = getRecipeDetails(r)
                  return (
                    <div key={i} style={{margin:'0 -16px',borderBottom:`1px solid ${C.border}`,background:isPending?`${C.gold}11`:'none'}}>
                      <div onClick={()=>{ if(!already) setPendingRecipe(r) }}
                        style={{display:'flex',alignItems:'center',gap:12,
                          cursor:already?'default':'pointer',padding:'12px 16px'}}>
                        <span style={{fontSize:24,flexShrink:0}}>{RECIPE_CAT_EMOJI[r.category]||'🍽'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:already?C.gold:isPending?C.gold:C.white}}>{r.name}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{r.category} · {r.cal} cal · P:{r.pro}g · C:{r.carb}g · F:{r.fat}g</div>
                        </div>
                        {details&&(
                          <button onClick={e=>{e.stopPropagation();setPreviewRecipe(isPreviewing?null:r.name)}}
                            style={{background:isPreviewing?`${C.gold}22`:'none',border:`1px solid ${isPreviewing?C.gold:C.border}`,borderRadius:6,padding:'4px 9px',color:isPreviewing?C.gold:C.muted,fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                            {isPreviewing?'Hide':'👁 Preview'}
                          </button>
                        )}
                        {already?(
                          <span style={{fontSize:11,fontWeight:700,color:C.gold,flexShrink:0}}>✓ Assigned</span>
                        ):isPending?(
                          <span style={{fontSize:11,fontWeight:700,color:C.gold,flexShrink:0}}>↓ Pick meal</span>
                        ):(
                          <span style={{fontSize:18,color:C.gold,flexShrink:0,lineHeight:1}}>+</span>
                        )}
                      </div>
                      {isPreviewing&&details&&(
                        <div style={{padding:'0 16px 14px 52px'}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Ingredients</div>
                          <ul style={{margin:'0 0 10px',paddingLeft:16}}>
                            {details.ingredients.map((ing,ii)=>(<li key={ii} style={{fontSize:11,color:C.white,lineHeight:1.7}}>{ing}</li>))}
                          </ul>
                          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Method</div>
                          <ol style={{margin:0,paddingLeft:16}}>
                            {details.method.map((st,si)=>(<li key={si} style={{fontSize:11,color:C.muted,lineHeight:1.7,marginBottom:3}}>{st}</li>))}
                          </ol>
                        </div>
                      )}
                    </div>
                  )
                })
              }
            </div>
            {/* Footer */}
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <button onClick={()=>{setShowRecipePicker(false);setPendingRecipe(null)}}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:'11px 0',fontWeight:800,color:C.black,fontSize:14,cursor:'pointer'}}>
                Done — {assignedRecipes.length} recipe{assignedRecipes.length!==1?'s':''} assigned
              </button>
            </div>

            {/* ── Meal chooser sheet — slides up when a recipe is tapped ── */}
            {pendingRecipe&&(
              <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',zIndex:10}}>
                <div style={{background:C.black,width:'100%',borderTop:`2px solid ${C.gold}`,borderRadius:'16px 16px 0 0',padding:'20px 16px 24px',maxHeight:'70vh',overflowY:'auto'}}>
                  <div style={{width:36,height:4,background:C.border,borderRadius:2,margin:'0 auto 16px'}}/>
                  <div style={{fontSize:14,fontWeight:800,color:C.white,marginBottom:4}}>Which meal?</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:18}}>{RECIPE_CAT_EMOJI[pendingRecipe.category]||'🍽'}</span>
                    <span>{pendingRecipe.name} · {pendingRecipe.cal} cal</span>
                  </div>
                  {meals.map((meal,mi)=>(
                    <button key={mi} onClick={()=>{assignRecipe(pendingRecipe,meal.name);setPendingRecipe(null)}}
                      style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,
                        padding:'12px 16px',color:C.white,fontSize:13,fontWeight:600,cursor:'pointer',
                        textAlign:'left',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span>{meal.name}</span>
                      <span style={{fontSize:10,color:C.muted}}>{mealMacros(meal).cal} cal currently</span>
                    </button>
                  ))}
                  <button onClick={()=>setPendingRecipe(null)}
                    style={{width:'100%',background:'none',border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 0',color:C.muted,fontSize:13,cursor:'pointer',marginTop:4}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  {!suppDBReady&&(
                    <div style={{padding:'20px 16px',color:C.muted,fontSize:13}}>Loading your supplement library…</div>
                  )}
                  {suppDBReady&&Object.keys(orgSuppDB).length===0&&(
                    <div style={{padding:'20px 16px',color:C.muted,fontSize:13}}>Your supplement library is empty.{canEditSupps?' Use "+ Add Supplement" below to build it.':''}</div>
                  )}
                  {Object.keys(suppDB).map(cat=>(
                    <div key={cat} style={{borderBottom:`1px solid ${C.border}`}}>
                      <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div>
                          <div style={{fontSize:13,color:C.white,fontWeight:600}}>{cat}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{suppDB[cat].length} supplements</div>
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
                          {suppDB[cat].map((s,i)=>(
                            <div key={s.dbId||i} style={{display:'flex',alignItems:'center',borderBottom:`1px solid ${C.border}`}}>
                              <button onClick={()=>addSuppFromDB({...s,category:cat})}
                                style={{flex:1,minWidth:0,textAlign:'left',background:'none',border:'none',padding:'8px 20px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                                onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}08`}
                                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                <div>
                                  <div style={{fontSize:12,color:C.white,fontWeight:500}}>{s.name}</div>
                                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.dose}</div>
                                  {s.code&&<div style={{fontSize:10,color:C.gold}}>Code: {s.code}</div>}
                                </div>
                                <span style={{color:C.gold,fontSize:16,flexShrink:0,marginLeft:8}}>+</span>
                              </button>
                              {canEditSupps&&s.dbId&&(
                                <div style={{display:'flex',gap:4,padding:'0 10px',flexShrink:0}}>
                                  <button onClick={()=>setEditSupp({dbId:s.dbId,category:cat,name:s.name,dose:s.dose,directions:s.directions,code:s.code,link:s.link})} title="Edit supplement"
                                    style={{background:`${C.gold}15`,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'5px 8px',color:C.gold,fontSize:11,cursor:'pointer'}}>✎</button>
                                  <button onClick={()=>deleteOrgSupp(s.dbId)} title="Remove from library"
                                    style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderRadius:6,padding:'5px 8px',color:C.danger,fontSize:11,cursor:'pointer'}}>✕</button>
                                </div>
                              )}
                            </div>
                          ))}
                          {canEditSupps&&(
                            <button onClick={()=>setEditSupp({category:cat,name:'',dose:'',directions:'',code:'',link:''})}
                              style={{width:'100%',background:'none',border:'none',borderBottom:`1px solid ${C.border}`,padding:'8px 20px',color:C.gold,fontSize:11,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                              + Add supplement to {cat}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {canEditSupps&&(
                    <div style={{padding:'10px 16px'}}>
                      <button onClick={()=>setEditSupp({category:'',name:'',dose:'',directions:'',code:'',link:''})}
                        style={{width:'100%',background:`${C.gold}15`,border:`1px dashed ${C.gold}66`,borderRadius:8,padding:9,color:C.gold,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                        ⚙️ Add Supplement (new or existing category)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* ── Org supplement editor modal (white-label admins) ── */}
            {editSupp&&(
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
                onClick={e=>{if(e.target===e.currentTarget)setEditSupp(null)}}>
                <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:14,width:'100%',maxWidth:440,maxHeight:'85vh',overflowY:'auto',padding:18}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.white,marginBottom:12}}>{editSupp.dbId?'Edit Supplement':'Add Supplement'}</div>
                  {[['category','Protocol / Category','e.g. Extra Supplements'],['name','Supplement Name','e.g. Magnesium Glycinate'],['dose','Dose / Directions For Use','e.g. 350mg 1hr before bed'],['directions','Notes','e.g. Weeks 1-6 only'],['code','Discount Code','e.g. YOURCODE10'],['link','Purchase Link','https://…']].map(([f,label,ph])=>(
                    <div key={f} style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,textTransform:'uppercase',marginBottom:4}}>{label}</div>
                      <input value={editSupp[f]||''} onChange={e=>setEditSupp(p=>({...p,[f]:e.target.value}))} placeholder={ph}
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  ))}
                  <div style={{display:'flex',gap:8,marginTop:14}}>
                    <button onClick={()=>setEditSupp(null)}
                      style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
                    <button onClick={saveOrgSupp}
                      style={{flex:1,background:`linear-gradient(135deg,#ffb733,${C.gold})`,border:'none',borderRadius:8,padding:10,color:'#000',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                      {editSupp.dbId?'Save Changes':'Add Supplement'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowSuppPicker(false)}
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,color:C.muted,fontSize:13,cursor:'pointer'}}>
                Done — {clientSupps.length} supplements added
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full Recipe Detail Modal (client + coach) ─────────── */}
      {viewRecipe&&(()=>{
        const vr = viewRecipe
        const vName = vr.name||vr.recipe_name
        const vDetails = getRecipeDetails(vr)
        const vs = vr.servings||1
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
            onClick={e=>{if(e.target===e.currentTarget)setViewRecipe(null)}}>
            <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'88vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                <span style={{fontSize:26}}>{RECIPE_CAT_EMOJI[vr.category]||'🍽'}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:C.white}}>{vName}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>
                    {vr.category||'Recipe'}{vr.meal_name?` · 📍 ${vr.meal_name}`:''}{vs!==1?` · ×${vs} servings`:''}
                  </div>
                </div>
                <button onClick={()=>setViewRecipe(null)} style={{background:'none',border:'none',color:C.muted,fontSize:24,cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:16}}>
                {/* Macros */}
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 12px',marginBottom:14,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                  {[['cal',Math.round((vr.cal||0)*vs),''],['protein',Math.round((vr.pro||0)*vs),'g'],['carbs',Math.round((vr.carb||0)*vs),'g'],['fat',Math.round((vr.fat||0)*vs),'g'],['fiber',Math.round((vr.fib||0)*vs),'g']].map(([l,v,u])=>(
                    <div key={l} style={{textAlign:'center',minWidth:48}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.gold}}>{v}{u}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:2,textTransform:'capitalize'}}>{l}</div>
                    </div>
                  ))}
                </div>
                {vDetails?(
                  <>
                    <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🛒 Ingredients{vs!==1?' (per 1 serving)':''}</div>
                    <ul style={{margin:'0 0 16px',paddingLeft:18}}>
                      {vDetails.ingredients.map((ing,ii)=>(<li key={ii} style={{fontSize:13,color:C.white,lineHeight:1.8}}>{ing}</li>))}
                    </ul>
                    <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>👨‍🍳 Method</div>
                    <ol style={{margin:0,paddingLeft:18}}>
                      {vDetails.method.map((st,si)=>(<li key={si} style={{fontSize:13,color:C.white,lineHeight:1.7,marginBottom:8}}>{st}</li>))}
                    </ol>
                  </>
                ):(
                  <div style={{fontSize:12,color:C.muted,textAlign:'center',padding:'20px 0'}}>Full ingredients & instructions aren't available for this recipe yet.<br/>Ask your coach for details.</div>
                )}
              </div>
              <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                <button onClick={()=>setViewRecipe(null)}
                  style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:'11px 0',fontWeight:800,color:C.black,fontSize:14,cursor:'pointer'}}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
