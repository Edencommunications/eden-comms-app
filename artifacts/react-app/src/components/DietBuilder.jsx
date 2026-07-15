// ═══════════════════════════════════════════════════════════════
// DietBuilder.jsx — Week 3 v2 (Upgraded)
// Place at: src/components/DietBuilder.jsx in Replit
// ═══════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'

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
async function dbInsert(table,body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{method:'POST',headers:H,body:JSON.stringify(body)})
  if(!r.ok) console.error('INSERT',await r.text())
}

// ── MASTER HABIT LIST ─────────────────────────────────────────
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

// ── URL helpers (NuEthix only — all others use direct spreadsheet links) ──
const NEX = h => `https://nuethix.com/products/${h}`

// ── SUPPLEMENT DATABASE (links sourced directly from LOE Coaching Sheets) ──
const SUPP_DB = {
  'Nervous System Regulator':[
    {name:'L-Theanine (AM)',      dose:'400mg upon waking',         directions:'Take upon waking',            code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/',  reason:'Promotes calm, focused energy without sedation. Raises alpha brain waves and blunts cortisol response in the morning.'},
    {name:'5-HTP',               dose:'100mg 1hr before bed',      directions:'Take 1 hour before bed',      code:'', link:'https://www.amazon.com/dp/B01A1DL4DW',                                          reason:'Serotonin precursor. Improves mood, sleep onset, and reduces carbohydrate cravings.'},
    {name:'Magnesium Glycinate',  dose:'350mg 1hr before bed',      directions:'Take 1 hour before bed',      code:'', link:'https://www.amazon.com/dp/B0CV2RSRFX',                                          reason:'Calms the nervous system, relaxes muscles, and deepens sleep quality. Highly bioavailable form.'},
    {name:'L-Theanine (PM)',      dose:'200mg 1hr before bed',      directions:'Take 1 hour before bed',      code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/',  reason:'Wind-down support. Lowers cortisol response, reduces mental chatter before sleep.'},
    {name:'Ashwagandha',          dose:'2 capsules 1hr before bed', directions:'Take 1 hour before bed',      code:'TOGNIETTI10', link:NEX('ashwagandha-ksm-66'),                                           reason:'Adaptogen. Lowers cortisol, supports thyroid and HPA axis, reduces anxiety and improves sleep quality.'},
    {name:'Rhodiola',             dose:'500mg upon waking',         directions:'Optional',                    code:'', link:'https://www.amazon.com/Nutricost-Rhodiola-Rosea-500mg-Capsules/dp/B079C2J9FP/',  reason:'Adaptogen. Combats fatigue, sharpens mental clarity, and builds stress resilience.'},
  ],
  '5R Gut Protocol':[
    {name:'Biofilm Resolve',        dose:'2 caps 45-60 min before meals 1,3,5', directions:'7-Day Prep Phase. Take on empty stomach', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/biofilm-resolve?variant=37274128482466',         reason:'Enzyme complex that breaks down the protective biofilm bacteria use to hide. Must be done before antimicrobials for maximum effectiveness.'},
    {name:'Saccharomyces Boulardii',dose:'2 caps with meal 1, 2 caps with last meal', directions:'Weeks 1-6', code:'', link:'https://www.amazon.com/Saccharomyces-Boulardii-Billion-Probiotics-Serving/dp/B09BDJ87L6/', reason:'Beneficial yeast strain. Crowds out pathogens, reduces intestinal permeability, and prevents antibiotic-associated diarrhea.'},
    {name:'Fungal Pro',             dose:'2 caps 2x daily (meal 1 and last meal)', directions:'Weeks 1-6. Discontinue after 6 weeks.', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/product/fungal-pro-dysbiocide-120ct?variant=Default%20Title',  reason:'Antifungal herbal blend. Targets Candida overgrowth and fungal dysbiosis in the gut.'},
    {name:'Artemisia Wormwood',     dose:'1 cap with meals 1, 3, 4 (2 weeks only)', directions:'First 2 weeks only, then stop', code:'', link:'https://www.amazon.com/Nutricost-Wormwood-Capsules-450mg-120/dp/B07WDTGK8S/', reason:'Broad-spectrum antimicrobial. Targets parasites, bacteria, and yeast. Short-term use only.'},
    {name:'Mastic Gum',            dose:'1000mg (2 caps) with meals 2 and 5', directions:'Weeks 1-6',         code:'', link:'https://www.amazon.com/Jarrow-Formulas-Supports-Stomach-Duodenal/dp/B0013OVVAK/',              reason:'H. pylori eradication and upper GI lining repair. Reduces bloating and gastric discomfort.'},
    {name:'FC Extinguish',         dose:'2 caps 2x daily',                    directions:'Weeks 1-6',         code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/product/fc-extinguish-fc-cidal-120ct?variant=Default%20Title', reason:'Broad-spectrum herbal antimicrobial blend for gut pathogen elimination (bacteria, parasites, yeast).'},
    {name:'Oregano Pro',           dose:'4 tabs 3x daily (meals 1,3,5)',       directions:'Weeks 1-6',         code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/product/oregano-pro?variant=Default%20Title',             reason:'Potent antimicrobial. Carvacrol content targets bacteria, yeast, and parasites without disrupting all beneficial flora.'},
    {name:'Berberine',             dose:'2000mg meals 1 & 3, 1000mg meal 5',   directions:'Weeks 4-6',         code:'', link:'https://www.amazon.com/Nutricost-Berberine-HCl-600mg-Capsules/dp/B079GH6V2Z/',              reason:'Antimicrobial and insulin sensitizer. Regulates blood sugar, kills gut pathogens, and improves microbiome composition.'},
    {name:'Allicin (Allimed)',     dose:'2 caps with meals 1, 3, and 5',       directions:'Weeks 4-6',         code:'', link:'https://westcoastmint.com/products/allimax-allimed-garlic-extract-450-mg?variant=39932048441453', reason:'Stabilized allicin (garlic). Broad-spectrum antimicrobial effective against bacteria, yeast, and parasites.'},
    {name:'Bloat Eaze',            dose:'1 scoop daily with meal 1',           directions:'Weeks 1-6',         code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/bloat-eaze-pro?variant=42854686753001', reason:'Digestive enzyme and herbal blend to reduce gas, bloating, and abdominal discomfort during gut protocol.'},
    {name:'Glutamine',             dose:'20g daily with a meal',               directions:'Weeks 1-6',         code:'TOGNIETTI10', link:NEX('nu-glutamine'),                                                                    reason:'Primary fuel for intestinal cells. Repairs the gut lining and reduces intestinal permeability (leaky gut).'},
    {name:'Opti-Pure',             dose:'3 caps with meal 1 and meal 4',       directions:'Weeks 1-6 then maintenance', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/opti-pure?variant=42315272585449', reason:'Multi-strain probiotic. Repopulates beneficial gut bacteria displaced during the antimicrobial phase.'},
    {name:'Calcium D-Glucarate',   dose:'1000mg with meal 1 and meal 5',       directions:'Weeks 1-6',         code:'', link:'https://www.amazon.com/Nutricost-Calcium-D-Glucarate-500mg-Capsules/dp/B09NPFFSVC/',             reason:'Supports liver Phase II detox and estrogen clearance. Inhibits beta-glucuronidase, preventing estrogen recirculation.'},
    {name:'Zinc Carnosine',        dose:'1 tablet 2x daily meals 1 and 4',     directions:'Weeks 1-6',         code:'', link:'https://www.amazon.com/Nutricost-Zinc-Carnosine-86mg-Capsules/dp/B0BRNX1LLH/',                  reason:'Heals and protects the stomach lining. Reduces inflammation and supports H. pylori clearance.'},
    {name:'Cort Eaze',             dose:'2 caps waking, 2 caps meal 3, 2 caps bed', directions:'Weeks 1-6',   code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/cort-eaze?variant=32244757364781', reason:'Adaptogenic cortisol-lowering formula. High stress impairs gut healing; this supports HPA axis recovery throughout the protocol.'},
    {name:'Biotics Bile Plus',     dose:'2 caps per meal',                     directions:'Week 7 and beyond', code:'TOGNIETTI10', link:'https://www.practitionerdepot.com/products/bile-plus?variant=46157575061721',           reason:'Bile salt support. Aids fat digestion and liver/gallbladder function after gut protocol is complete.'},
    {name:'Gut Defender',          dose:'2 caps with meal 1',                  directions:'Week 7+ maintenance 6 weeks', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/gut-defender-new?variant=37158070845602', reason:'Long-term gut maintenance. Anti-inflammatory and antimicrobial protection to prevent relapse after the active protocol.'},
  ],
  'PCOS Protocol':[
    {name:'NuBalance',              dose:'6 caps with Meal 1',              directions:'Daily',                code:'TOGNIETTI10', link:NEX('nubalance'),                                                                           reason:'Comprehensive PCOS formula. Addresses insulin resistance, hormonal imbalance, and androgen excess at the root cause level.'},
    {name:'Calcium D-Glucarate',    dose:'1000mg with Meal 1 and Meal 5',   directions:'Daily',                code:'', link:'https://www.amazon.com/Nutricost-Calcium-D-Glucarate-500mg-Capsules/dp/B09NPFFSVC/',              reason:'Clears excess estrogen via liver detox. Reduces estrogen dominance common in PCOS.'},
    {name:'L-Carnitine',            dose:'10ml once daily between meals',   directions:'Daily',                code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/liposomal-l-carnitine?variant=40741984305314', reason:'Improves insulin sensitivity, mitochondrial energy production, and supports weight loss and ovulation in PCOS.'},
    {name:'N-Acetyl-Cysteine (NAC)',dose:'1800mg daily',                    directions:'Take on empty stomach 30 min before meals', code:'', link:'https://www.amazon.com/Nutricost-N-Acetyl-L-Cysteine-600mg-Capsules/dp/B01CUQFKW4/', reason:'Antioxidant and insulin sensitizer. Supports ovulation, reduces androgens, and is as effective as Metformin in some PCOS studies.'},
    {name:'Chasteberry',            dose:'As prescribed',                   directions:'Daily',                code:'TOGNIETTI10', link:'https://nuethix.com/products/chasteberry',                                                reason:'Balances LH/FSH ratio and supports progesterone production. Reduces PMS and cycle irregularity.'},
    {name:'DIM',                    dose:'As prescribed',                   directions:'Daily',                code:'', link:'https://www.amazon.com/Nutricost-Diindolylmethane-BioPerine-Veggie-Capsules/dp/B01HQR0RZW/',      reason:'Promotes healthy estrogen metabolism via the 2-hydroxy pathway. Reduces estrogen dominance and supports liver detox.'},
    {name:'Soy Isoflavones',        dose:'As prescribed',                   directions:'Daily',                code:'', link:'https://www.amazon.com/Nutricost-Isoflavones-150mg-Veggie-Capsules/dp/B09NS3PKCH/',               reason:'Phytoestrogens that bind estrogen receptors with weak effect. Used to gently modulate estrogen balance.'},
  ],
  'Thyroid Protocol':[
    {name:'Iodine',                dose:'225mcg daily with Meal 1',         directions:'Daily with food',       code:'', link:'https://www.amazon.com/dp/B00V9Q6IZQ',                                              reason:'Essential mineral for T3 and T4 thyroid hormone synthesis. Deficiency is a primary driver of hypothyroidism.'},
    {name:'Selenium (Brazil Nuts)', dose:'3 Brazil nuts with Meal 1',       directions:'Daily',                 code:'', link:'',                                                                                    reason:'Converts inactive T4 to active T3. Protects the thyroid gland from oxidative damage and supports antibody reduction in Hashimoto\'s.'},
    {name:'ThyroBoost Plus',        dose:'2 capsules daily',                 directions:'Daily',                 code:'TOGNIETTI10', link:NEX('thyro-boost-plus'),                                                  reason:'Comprehensive thyroid support blend with iodine, selenium, ashwagandha, and tyrosine. Supports T3/T4 production and conversion.'},
    {name:'B12 Liposomal',          dose:'0.5ml (1/2 dropper) daily',        directions:'Daily',                 code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385', reason:'Neurological function, energy production, and red blood cell formation. Hypothyroid clients are commonly B12 deficient.'},
    {name:'Black Seed Oil',         dose:'10g daily',                        directions:'Daily',                 code:'', link:'https://www.amazon.com/Organic-Black-Seed-Oil-Liquid/dp/B0B2R57WWC/',                reason:'Anti-inflammatory and immune modulating. Supports thyroid function and has shown benefit in reducing thyroid antibodies.'},
  ],
  'Adrenal Deficient Protocol':[
    {name:'Cort Eaze',       dose:'2 caps waking, meal 3, meal 5, before bed', directions:'4x daily',           code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/cort-eaze?variant=32244757364781', reason:'Adaptogenic formula to lower elevated cortisol and support HPA axis recovery. Core of the adrenal protocol.'},
    {name:'Relax Liposomal', dose:'2ml before bed',                            directions:'Nightly',             code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/relax-liposomal?variant=32244904689709', reason:'GABA precursor and calming herb blend in liposomal form. Promotes deep nervous system calm and restores sleep architecture.'},
    {name:'Ashwagandha',     dose:'2 caps with each Cort Eaze dose',           directions:'4x daily',            code:'TOGNIETTI10', link:NEX('ashwagandha-ksm-66'),                                                reason:'Potentiates the cortisol-lowering effect of Cort Eaze. Supports testosterone, anxiety reduction, and adrenal recovery.'},
  ],
  'Methylation Protocol (1hr Before Bed)':[
    {name:'TMG (Trimethylglycine)',dose:'4g',                directions:'1 hour before bed', code:'', link:'https://www.amazon.com/dp/B01BCQ3RLE',          reason:'Donates methyl groups to the methylation cycle. Supports homocysteine clearance, liver detox, and mood regulation.'},
    {name:'Glycine',               dose:'4g',                directions:'1 hour before bed', code:'', link:'https://www.amazon.com/dp/B09F83CPX8',          reason:'Neurotransmitter precursor. Supports liver Phase II detox, collagen synthesis, and promotes deep sleep via NMDA receptor modulation.'},
    {name:'L-Methionine',          dose:'2.4g (2400mg)',      directions:'1 hour before bed', code:'', link:'https://www.amazon.com/dp/B09JJMQRY3',          reason:'Essential amino acid and methyl donor. Required for SAMe production and downstream methylation reactions.'},
    {name:'Methyl Folate/B12',     dose:'1000mcg (1 full dropper)', directions:'1 hour before bed', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385', reason:'Active (methylated) B vitamins. Bypass MTHFR gene mutations that prevent standard folic acid from being converted.'},
    {name:'Inositol',              dose:'6g',                directions:'1 hour before bed', code:'', link:'https://www.amazon.com/dp/B08QC4V25L',          reason:'Second messenger in cells. Supports insulin signaling, mood (as effective as SSRIs in some OCD/anxiety studies), and PCOS hormone balance.'},
    {name:'Magnesium',             dose:'200mg',             directions:'1 hour before bed', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/prosorb-magnesium-new?variant=47369076703465', reason:'Cofactor in 300+ enzymatic reactions including methylation. Deficiency blocks the entire methylation cycle.'},
    {name:'Vitamin D3 + K2',       dose:'5000 IU',           directions:'1 hour before bed', code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/nu-d3-k2?variant=46760997322985', reason:'Immune regulation, bone density, hormone synthesis, and inflammation control. K2 directs calcium into bones, not arteries.'},
  ],
  'Histamine/MCAS Protocol':[
    {name:'Quercetin',            dose:'1 cap meals 1,2,4',              directions:'With food',                code:'', link:'https://www.amazon.com/dp/B01MU30S6Z',                                                      reason:'Natural mast cell stabilizer. Blocks histamine release and reduces inflammatory mediator production.'},
    {name:'Bromelain',            dose:'2 caps meals 1,3,4',             directions:'With food',                code:'', link:'https://www.amazon.com/Nutricost-Bromelain-500mg-Veggie-Capsules/dp/B07TK4ZTLP/',             reason:'Proteolytic enzyme. Reduces systemic inflammation and dramatically enhances quercetin absorption.'},
    {name:'Vitamin C',            dose:'2 caps meals 1,3,4',             directions:'With food — DAO cofactor', code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Capsules-Vegetarian-Non-GMO/dp/B0B5FY7DKP/',        reason:'DAO enzyme cofactor. Helps the body break down dietary histamine before it is absorbed. Also an antihistamine in high doses.'},
    {name:'GABA',                 dose:'1 cap meal 1, 1 cap before bed', directions:'Daily',                   code:'', link:'https://www.amazon.com/Nutricost-Gamma-Aminobutyric-750mg-Capsules/dp/B09CXT8S6S/',           reason:'Calms nervous system hypersensitivity. MCAS commonly involves an overactivated autonomic nervous system.'},
    {name:'DAO Enzyme',           dose:'1 cap 15min before meals 1,3,4', directions:'Before meals',            code:'', link:'https://www.amazon.com/gp/product/B0F39X6ZPL/',                                              reason:'Diamine oxidase — the enzyme that breaks down ingested histamine in the gut. Low DAO = high histamine reactivity.'},
    {name:'Probiotics HistaminX', dose:'1 cap upon waking',              directions:'Daily fasted',            code:'', link:'https://www.amazon.com/gp/product/B0773SY1X2/',                                              reason:'Carefully selected histamine-degrading probiotic strains. Avoids high-histamine producers that worsen MCAS symptoms.'},
    {name:'Zinc + Copper',        dose:'2 caps with meal 1',             directions:'Daily',                   code:'', link:'https://www.amazon.com/Nutricost-Copper-Capsules-Servings-Serving/dp/B0FR7MC4MF/',           reason:'Immune modulation and DAO enzyme cofactor. Zinc supports mast cell regulation.'},
    {name:'SAMe',                 dose:'3 caps 1hr before bed',          directions:'Before bed',              code:'', link:'https://www.amazon.com/Nutricost-S-Adenosyl-L-Methionine-Serving-Servings-Capsules/dp/B09JJMQRY3/', reason:'Methyl donor that powers histamine N-methyltransferase (HNMT), the enzyme that degrades histamine inside cells.'},
    {name:'Vitamin B6 (P5P)',     dose:'1 cap with meal 1',              directions:'Daily',                   code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Supplement-Capsules-Pyridoxal-5-Phosphate/dp/B08YS9T41V/', reason:'Active form of B6. Critical DAO enzyme cofactor and nervous system support.'},
  ],
  'NuEthix Products':[
    {name:'Cort-Eaze',              dose:'As prescribed', directions:'See adrenal protocol',  code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/cort-eaze?variant=32244757364781', reason:'Adaptogen complex formulated to lower cortisol and support adrenal recovery.'},
    {name:'Estro-Cort',             dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('estro-cort'),               reason:'Combined estrogen and cortisol modulation. Used for estrogen dominance paired with high stress/cortisol.'},
    {name:'Thyro-Boost+',           dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('thyro-boost-plus'),         reason:'Comprehensive thyroid support including iodine, selenium, ashwagandha, and L-tyrosine for T3/T4 production.'},
    {name:'Adrena-Health',          dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('adrena-health'),            reason:'Adrenal gland nourishment and HPA axis support. Addresses adrenal fatigue and cortisol dysregulation.'},
    {name:'Liposomal L-Carnitine',  dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('liposomal-l-carnitine'),   reason:'Fat transport into mitochondria for energy production. Supports fat loss, insulin sensitivity, and brain function.'},
    {name:'Nu-Multi',               dose:'3 caps with meal 1', directions:'Daily',             code:'TOGNIETTI10', link:NEX('nu-multi'),                 reason:'Comprehensive multivitamin and mineral baseline. Fills micronutrient gaps that block hormone and metabolic function.'},
    {name:'GDA-MAX Pro',            dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('gda-max-pro'),              reason:'Glucose disposal agent. Shuttles carbohydrates into muscle glycogen rather than fat. Used on high-carb days.'},
    {name:'Jumpstart EC',           dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('jumpstart-ec-new'),         reason:'Metabolic support for energy, thermogenesis, and fat mobilization. Used as a protocol jumpstart tool.'},
    {name:'Nu-Lytes Electrolytes',  dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('nu-lytes-electrolytes'),   reason:'Electrolyte replenishment for hydration, cellular fluid balance, and muscle function — especially important on low-carb days.'},
    {name:'Nu-D3+K2',               dose:'1 tab daily',   directions:'With meal',              code:'TOGNIETTI10', link:NEX('nu-d3-k2'),                 reason:'Vitamin D3 for immune, hormone, and bone health. K2 ensures calcium is deposited in bones, not arteries.'},
    {name:'Fatty Acids Pro',        dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('fatty-acids-pro'),          reason:'High-potency omega-3s. Reduces systemic inflammation, supports brain function, and improves cardiovascular markers.'},
    {name:'Nu-Youth+ Collagen',     dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('nu-youth-collagen-protein'), reason:'Collagen peptides for skin elasticity, joint repair, gut lining integrity, and connective tissue support.'},
    {name:'Prosorb+ Magnesium',     dose:'1 scoop before bed', directions:'Nightly',           code:'TOGNIETTI10', link:NEX('prosorb-magnesium-new'),   reason:'Highly bioavailable magnesium for muscle relaxation, sleep depth, and nervous system recovery.'},
    {name:'Essential Energy BCAA',  dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('essential-energy-bcaa-eaa-keto-salts'), reason:'Branched-chain and essential amino acids. Preserves muscle mass during fat loss and supports workout recovery.'},
    {name:'Ashwagandha KSM-66',     dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('ashwagandha-ksm-66'),      reason:'Premium standardized ashwagandha. Lowers cortisol, supports testosterone, reduces anxiety, and improves sleep.'},
    {name:'Nu-Creatine',            dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('nu-creatine'),              reason:'Increases phosphocreatine stores for ATP production. Improves strength, power output, and muscle volumization.'},
    {name:'Slin-Trol',              dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('slin-trol'),                reason:'Insulin mimetic blend. Improves nutrient partitioning — drives glucose and amino acids into muscle, not fat cells.'},
    {name:'Herbal Adrena+',         dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('herbal-adrena'),            reason:'Herbal adaptogen complex for adrenal support, energy stability, and stress resilience.'},
    {name:'Cellular Restore Kit',   dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('cellular-restore-bundle'),  reason:'Gut healing and cellular repair bundle combining multiple 5R protocol elements.'},
    {name:'Nu-Glutamine',           dose:'20g daily',     directions:'With a meal',            code:'TOGNIETTI10', link:NEX('nu-glutamine'),             reason:'Repairs intestinal lining and reduces leaky gut. Also supports immune function and muscle recovery.'},
    {name:'ISO-Perfect Protein',    dose:'1 scoop',       directions:'As needed',              code:'TOGNIETTI10', link:NEX('iso-perfect-with-digestive-support'), reason:'Clean whey isolate with built-in digestive enzymes. High bioavailability with minimal bloating or gut distress.'},
    {name:'DHEA Capsules',          dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('dhea-capsules'),            reason:'Precursor hormone that converts to testosterone and estrogen as needed. Supports adrenal function and libido.'},
    {name:'Restful Sleep',          dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('restful-sleep'),            reason:'Sleep support stack. Combines melatonin, L-theanine, and magnesium for sleep onset and depth.'},
    {name:'Nu-Woman',               dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('nu-woman'),                 reason:'Women\'s hormone and vitality formula. Supports estrogen balance, PMS, energy, and female metabolic health.'},
    {name:'Stress Support',         dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('stress-support'),           reason:'Adaptogen and calming herb complex. Used to blunt acute stress response and support nervous system recovery.'},
    {name:'Nu-Protein Blend',       dose:'1 scoop',       directions:'As needed',              code:'TOGNIETTI10', link:NEX('nu-protein-blend'),         reason:'Blended whey and casein protein. Provides both fast and slow protein release for sustained muscle protein synthesis.'},
    {name:'Medipure Ultra',         dose:'1 scoop',       directions:'As needed',              code:'TOGNIETTI10', link:NEX('medipure-ultra'),           reason:'Comprehensive meal replacement with clean macros. Used as a bridge meal or elimination diet meal option.'},
    {name:'Gut Health Bundle',      dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('flora-protect-gut-defender-bundle'), reason:'Full gut healing and maintenance bundle combining Flora-Protect and Gut Defender.'},
    {name:'Ultimate Calm & Sleep',  dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('ultimate-calm-sleep-stack'), reason:'Combined anxiolytic and sleep stack. Addresses both anxiety reduction and sleep quality simultaneously.'},
    {name:'Flora-Protect',          dose:'1 cap upon waking', directions:'Fasted daily',       code:'TOGNIETTI10', link:NEX('flora-protect'),            reason:'Probiotic and prebiotic combination. Daily gut flora maintenance and gut barrier integrity support.'},
    {name:'Bloat Eaze',             dose:'1 scoop morning fasted', directions:'Daily fasted',  code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/bloat-eaze-pro?variant=42854686753001', reason:'Digestive enzyme and herbal formula to eliminate bloating, gas, and abdominal distension.'},
    {name:'Biofilm Resolve',        dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/biofilm-resolve?variant=37274128482466', reason:'Enzyme complex that breaks down bacterial biofilm. Required before antimicrobials to allow full penetration.'},
    {name:'Opti-Pure',              dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/opti-pure?variant=42315272585449', reason:'Multi-strain probiotic for gut flora restoration after antibiotic or antimicrobial use.'},
    {name:'Relax Liposomal',        dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/relax-liposomal?variant=32244904689709', reason:'Liposomal GABA and calming nutrients for nervous system repair and deep relaxation before sleep.'},
    {name:'Gut Defender',           dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/gut-defender-new?variant=37158070845602', reason:'Anti-inflammatory and antimicrobial gut protection for long-term maintenance after the 5R protocol.'},
    {name:'Methyl B12 Folate',      dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385', reason:'Bioavailable methylated B12 and folate. Bypasses MTHFR mutations and supports energy and methylation.'},
    {name:'Utilyze',                dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('utilyze'),                  reason:'Metabolic optimizer for improved nutrient utilization, fat oxidation, and body composition.'},
    {name:'Gourmet Greens',         dose:'As prescribed', directions:'',                       code:'TOGNIETTI10', link:NEX('gourmet-greens'),           reason:'Phytonutrient-dense greens blend. Supports alkalinity, micronutrient density, and detox pathway function.'},
  ],
  'Extra Supplements':[
    {name:'5-HTP',               dose:'100mg',           directions:'1 hour before bed',       code:'', link:'https://www.amazon.com/dp/B01A1DL4DW',                                                                         reason:'Serotonin precursor. Improves mood, sleep onset, and reduces late-night carbohydrate cravings.'},
    {name:'L-Dopa (Mucuna)',     dose:'As prescribed',   directions:'',                        code:'', link:'https://www.amazon.com/Nutricost-Mucuna-Pruriens-400mg-Capsules/dp/B07JHN2JK6/',                               reason:'Natural dopamine precursor. Supports motivation, mood, and libido. Used in dopamine deficiency patterns.'},
    {name:'Magnesium Glycinate', dose:'350mg',           directions:'1 hour before bed',       code:'', link:'https://www.amazon.com/dp/B0CV2RSRFX',                                                                         reason:'Calms nervous system and muscles, deepens sleep quality. Highly bioavailable and non-laxative form of magnesium.'},
    {name:'Chasteberry',         dose:'As prescribed',   directions:'',                        code:'TOGNIETTI10', link:'https://nuethix.com/products/chasteberry',                                                           reason:'Progesterone support and PMS relief. Reduces excess prolactin and regulates LH/FSH ratio.'},
    {name:'Collagen',               dose:'As prescribed',  directions:'',                             code:'TOGNIETTI10', link:NEX('nu-youth-collagen-protein'),                                                              reason:'Structural protein for skin elasticity, joint cushioning, gut lining repair, and hair/nail strength.'},
    {name:'Passion Flower Extract', dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Passion-Extract-Equivalent-Capsules/dp/B09P49D4HC/',                   reason:'Anxiolytic herb. Reduces anxiety, racing thoughts, and improves sleep quality without morning grogginess.'},
    {name:'Vitamin B12',            dose:'As prescribed',  directions:'',                             code:'TOGNIETTI10', link:'https://nuethix.com/collections/supplements/products/b12-liposomal?selling_plan=4335665385', reason:'Energy production, neurological function, and red blood cell synthesis. Deficiency causes fatigue and brain fog.'},
    {name:'L-Theanine',             dose:'200-400mg',      directions:'Morning or before bed',        code:'', link:'https://www.amazon.com/Nutricost-L-Theanine-200mg-240-Capsules/dp/B0731JC54K/',                          reason:'Promotes calm focus without sedation (AM) or reduces mental chatter before sleep (PM).'},
    {name:'Phosphatidylserine',     dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/dp/B08XYDDXDC',                                                                   reason:'Cortisol buffer for the brain. Improves memory, cognitive function, and blunts HPA axis overactivation.'},
    {name:'Methylfolate',           dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Methyl-Folate-1000mcg-Capsules/dp/B07T8C9N97/',                        reason:'Active folate that bypasses MTHFR gene mutations. Essential for methylation, mood, and DNA repair.'},
    {name:'HCL with Pepsin',        dose:'As prescribed',  directions:'With protein meals',           code:'', link:'https://www.amazon.com/Nutricost-Betaine-Pepsin-750mg-Capsules/dp/B077NS1KDK/',                          reason:'Restores low stomach acid. Improves protein digestion, mineral absorption, and eliminates GERD from hypochlorhydria.'},
    {name:'DIM',                    dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Diindolylmethane-BioPerine-Veggie-Capsules/dp/B01HQR0RZW/',             reason:'Promotes healthy estrogen metabolism via the 2-OH pathway. Reduces estrogen dominance and supports liver clearance.'},
    {name:'Black Seed Oil',         dose:'10g daily',      directions:'Daily',                        code:'', link:'https://www.amazon.com/Organic-Black-Seed-Oil-Liquid/dp/B0B2R57WWC/',                                    reason:'Anti-inflammatory, immune modulating, and metabolic support. Shown to reduce thyroid antibodies and improve insulin sensitivity.'},
    {name:'CoQ10',                  dose:'1500mg daily',   directions:'Daily',                        code:'', link:'https://www.amazon.com/s?k=CoQ10+Ubiquinol+200mg',                                                       reason:'Mitochondrial energy production and antioxidant. Critical for heart health, fatigue, and cellular ATP output.'},
    {name:'Alpha Lipoic Acid',      dose:'300mg daily',    directions:'Away from food',               code:'', link:'https://www.amazon.com/Nutricost-R-Alpha-Lipoic-100mg-Capsules/dp/B09NS4HZZB/',                          reason:'Universal antioxidant (water and fat soluble). Regulates blood sugar, protects nerves, and recycles other antioxidants.'},
    {name:'NAC',                    dose:'600-1200mg 2-3x daily', directions:'Empty stomach or 30min before meals', code:'', link:'https://www.amazon.com/Nutricost-N-Acetyl-L-Cysteine-600mg-Capsules/dp/B01CUQFKW4/',    reason:'Glutathione precursor and antioxidant. Supports liver detox, lung health, and breaks acetaldehyde from mold/yeast.'},
    {name:'TUDCA',                  dose:'250-500mg 2x daily', directions:'With meals — liver support', code:'', link:'https://www.amazon.com/Nutricost-Tudca-500mg-Capsules-Tauroursodeoxycholic/dp/B07WFRD1ST/',          reason:'Potent liver-protective bile acid. Reduces liver enzyme elevation, supports bile flow, and protects mitochondria.'},
    {name:'Niacin Flush',           dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/s?k=Niacin+flush+nicotinic+acid',                                                reason:'Raises HDL, lowers triglycerides and LDL. Also used as a methylation cycle "flusher" to clear excess methyl groups.'},
    {name:'Iodine',                 dose:'225mcg daily',   directions:'With meal',                    code:'', link:'https://www.amazon.com/dp/B00V9Q6IZQ',                                                                   reason:'Essential for thyroid hormone synthesis. Low iodine is a primary driver of low T3/T4 and metabolic slowdown.'},
    {name:'L-Carnitine',            dose:'3g daily',       directions:'Between meals',                code:'TOGNIETTI10', link:NEX('liposomal-l-carnitine'),                                                                  reason:'Transports fatty acids into mitochondria for fuel. Supports fat loss, energy, and cardiovascular health.'},
    {name:'Seeking Health Electrolytes', dose:'As prescribed', directions:'',                         code:'', link:'https://www.amazon.com/Electrolyte-Servings-Seeking-Health-Replacement/dp/B00O2JQWCA/',                reason:'Foundational electrolyte and mineral replacement. Supports hydration, muscle function, and nerve signaling.'},
    {name:'Blue Light Glasses',     dose:'Wear at night',  directions:'Wear 2hrs before bed',         code:'', link:'https://www.amazon.com/dp/B086WQ1CL8',                                                                   reason:'Blocks blue light wavelengths that suppress melatonin production. Restores natural circadian rhythm for better sleep onset.'},
    {name:'Soy Isoflavones',        dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Isoflavones-150mg-Veggie-Capsules/dp/B09NS3PKCH/',                     reason:'Phytoestrogens that gently modulate estrogen receptor activity. Used for perimenopause, low estrogen, or PCOS balance.'},
    {name:'Vitamin B1',             dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Vitamin-Thiamine-100mg-Capsules/dp/B07L1C5JHZ/',                       reason:'Thiamine — essential for carbohydrate metabolism and nervous system function. Deficiency causes fatigue and nerve dysfunction.'},
    {name:'Nu-Lytes',               dose:'As prescribed',  directions:'',                             code:'TOGNIETTI10', link:NEX('nu-lytes-electrolytes'),                                                                  reason:'Electrolyte replenishment and hydration support. Especially important during low-carb phases or high sweat output.'},
    {name:'Bromelain',              dose:'As prescribed',  directions:'',                             code:'', link:'https://www.amazon.com/Nutricost-Bromelain-500mg-Veggie-Capsules/dp/B07TK4ZTLP/',                       reason:'Systemic proteolytic enzyme. Reduces inflammation, improves tissue repair, and enhances quercetin bioavailability.'},
  ],
}

// ── FOOD DATABASE ─────────────────────────────────────────────
const FOODS = [
  {name:'Organic Chicken Breast',serving:'4oz',cal:120,pro:21,fat:4,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Salmon',serving:'4oz',cal:237,pro:28.7,fat:13.6,carb:0,fib:0,cat:'Proteins'},
  {name:'Top Sirloin',serving:'4oz',cal:187,pro:34.7,fat:6,carb:0,fib:0,cat:'Proteins'},
  {name:'99% Lean Ground Turkey',serving:'4oz',cal:120,pro:28,fat:1,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Shrimp',serving:'4oz',cal:112,pro:26.7,fat:0.7,carb:0,fib:0,cat:'Proteins'},
  {name:'Mahi Mahi',serving:'4oz',cal:124,pro:26.7,fat:1.3,carb:0,fib:0,cat:'Proteins'},
  {name:'Organic Egg Whites',serving:'1g',cal:0.43,pro:0.1,fat:0,carb:0,fib:0,cat:'Proteins'},
  {name:'Whole Omega-3 Egg',serving:'1 egg',cal:90,pro:8.6,fat:6.1,carb:0,fib:0,cat:'Proteins'},
  {name:'Filet Mignon',serving:'1oz',cal:56.75,pro:8.68,fat:2.33,carb:0,fib:0,cat:'Proteins'},
  {name:'Grass-Fed Ground Beef 96/4',serving:'1oz',cal:42.5,pro:6,fat:2,carb:0,fib:0,cat:'Proteins'},
  {name:'Medipure Protein',serving:'1 scoop',cal:120,pro:22,fat:2,carb:5,fib:1,cat:'Proteins'},
  {name:'Wild Caught Tuna (drained)',serving:'1oz',cal:31,pro:7.05,fat:0.28,carb:0,fib:0,cat:'Proteins'},
  {name:'Grass-Fed Top Sirloin',serving:'1oz',cal:46.5,pro:8.68,fat:1.5,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ground Bison',serving:'1oz',cal:40,pro:5.5,fat:2,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ground Venison',serving:'1oz',cal:37.5,pro:6,fat:1.5,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ground Elk',serving:'1oz',cal:37.5,pro:6.25,fat:1.25,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ground Wild Boar',serving:'1oz',cal:40,pro:5.25,fat:2,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ground Lamb',serving:'1oz',cal:50,pro:5,fat:3.25,carb:0,fib:0,cat:'Proteins'},
  {name:'Force of Nature Ancestral Blend',serving:'1oz',cal:47.5,pro:5,fat:3,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Halibut',serving:'1oz',cal:31,pro:5.9,fat:0.66,carb:0,fib:0,cat:'Proteins'},
  {name:'Wild Caught Cod',serving:'1oz',cal:23,pro:5.1,fat:0.19,carb:0,fib:0,cat:'Proteins'},
  {name:'Organic Turkey Breast',serving:'1oz',cal:30,pro:7,fat:0.25,carb:0,fib:0,cat:'Proteins'},
  {name:'Bison Ribeye',serving:'1oz',cal:47,pro:5.8,fat:2.5,carb:0,fib:0,cat:'Proteins'},
  {name:'Brown Rice (cooked)',serving:'1g',cal:1.118,pro:0.023,fat:0.008,carb:0.231,fib:0.018,cat:'Carbohydrates'},
  {name:'White Rice (cooked)',serving:'1g',cal:1.3,pro:0.024,fat:0.002,carb:0.285,fib:0.003,cat:'Carbohydrates'},
  {name:'Oatmeal (dry)',serving:'1g',cal:3.75,pro:0.125,fat:0.075,carb:0.675,fib:0.1,cat:'Carbohydrates'},
  {name:'Red Potato',serving:'1g',cal:1.013,pro:0.02,fat:0,carb:0.176,fib:0.02,cat:'Carbohydrates'},
  {name:'Sweet Potato',serving:'1g',cal:0.862,pro:0.015,fat:0,carb:0.2,fib:0.031,cat:'Carbohydrates'},
  {name:'Quinoa (cooked)',serving:'1g',cal:1.2,pro:0.043,fat:0.019,carb:0.211,fib:0.028,cat:'Carbohydrates'},
  {name:'Ezekiel Bread',serving:'1 slice',cal:80,pro:5,fat:0.5,carb:15,fib:3,cat:'Carbohydrates'},
  {name:'Cream of Rice (dry)',serving:'1g',cal:3.33,pro:0.044,fat:0,carb:0.778,fib:0.007,cat:'Carbohydrates'},
  {name:'Lentil Pasta (dry)',serving:'1g',cal:3.57,pro:0.268,fat:0.027,carb:0.607,fib:0.054,cat:'Carbohydrates'},
  {name:'Medjool Dates',serving:'1 date',cal:66,pro:0.4,fat:0.1,carb:18,fib:1.6,cat:'Carbohydrates'},
  {name:'Extra Virgin Olive Oil',serving:'1g',cal:8.57,pro:0,fat:1,carb:0,fib:0,cat:'Fats'},
  {name:'Coconut Oil (unrefined)',serving:'1g',cal:8.57,pro:0,fat:1,carb:0,fib:0,cat:'Fats'},
  {name:'Avocado',serving:'1g',cal:1.6,pro:0.02,fat:0.146,carb:0.086,fib:0.068,cat:'Fats'},
  {name:'Almond Butter',serving:'1g',cal:6,pro:0.213,fat:0.544,carb:0.191,fib:0.106,cat:'Fats'},
  {name:'Almonds',serving:'1g',cal:5.857,pro:0.214,fat:0.507,carb:0.218,fib:0.125,cat:'Fats'},
  {name:'Macadamia Oil',serving:'1g',cal:8.57,pro:0,fat:1,carb:0,fib:0,cat:'Fats'},
  {name:'Chia Seeds',serving:'1g',cal:4.83,pro:0.167,fat:0.308,carb:0.417,fib:0.342,cat:'Fats'},
  {name:'Raw Honey',serving:'1 tsp',cal:20,pro:0,fat:0,carb:6,fib:0,cat:'Fats'},
  {name:'Mango',serving:'1g',cal:0.6,pro:0.008,fat:0.004,carb:0.15,fib:0.016,cat:'Fruits/Vegetables'},
  {name:'Apple',serving:'1g',cal:0.52,pro:0.003,fat:0.002,carb:0.138,fib:0.024,cat:'Fruits/Vegetables'},
  {name:'Orange',serving:'1g',cal:0.47,pro:0.009,fat:0.001,carb:0.118,fib:0.024,cat:'Fruits/Vegetables'},
  {name:'Watermelon',serving:'1g',cal:0.3,pro:0.006,fat:0.002,carb:0.076,fib:0.004,cat:'Fruits/Vegetables'},
  {name:'Peach',serving:'1g',cal:0.39,pro:0.009,fat:0.003,carb:0.1,fib:0.015,cat:'Fruits/Vegetables'},
  {name:'Grapes (red/green)',serving:'1g',cal:0.67,pro:0.006,fat:0.004,carb:0.171,fib:0.009,cat:'Fruits/Vegetables'},
  {name:'Pomegranate Seeds',serving:'1g',cal:0.83,pro:0.017,fat:0.012,carb:0.189,fib:0.04,cat:'Fruits/Vegetables'},
  {name:'Honeydew Melon',serving:'1g',cal:0.36,pro:0.009,fat:0.001,carb:0.091,fib:0.008,cat:'Fruits/Vegetables'},
  {name:'Cantaloupe',serving:'1g',cal:0.34,pro:0.008,fat:0.002,carb:0.082,fib:0.009,cat:'Fruits/Vegetables'},
  {name:'Plum',serving:'1g',cal:0.46,pro:0.007,fat:0.003,carb:0.113,fib:0.014,cat:'Fruits/Vegetables'},
  {name:'Nectarine',serving:'1g',cal:0.44,pro:0.01,fat:0.003,carb:0.105,fib:0.017,cat:'Fruits/Vegetables'},
  {name:'Coconut Meat',serving:'1g',cal:3.54,pro:0.033,fat:0.335,carb:0.153,fib:0.09,cat:'Fruits/Vegetables'},
  {name:'Lemon',serving:'1g',cal:0.29,pro:0.011,fat:0.003,carb:0.092,fib:0.028,cat:'Fruits/Vegetables'},
  {name:'Lime',serving:'1g',cal:0.3,pro:0.007,fat:0.002,carb:0.106,fib:0.029,cat:'Fruits/Vegetables'},
  {name:'Blueberries',serving:'1g',cal:0.68,pro:0.007,fat:0.003,carb:0.145,fib:0.024,cat:'Fruits/Vegetables'},
  {name:'Mixed Berries (frozen)',serving:'1g',cal:0.55,pro:0.008,fat:0.003,carb:0.12,fib:0.025,cat:'Fruits/Vegetables'},
  {name:'Pineapple',serving:'1g',cal:0.46,pro:0.004,fat:0.002,carb:0.101,fib:0.014,cat:'Fruits/Vegetables'},
  {name:'Strawberries',serving:'1g',cal:0.3,pro:0.008,fat:0.001,carb:0.06,fib:0.02,cat:'Fruits/Vegetables'},
  {name:'Banana',serving:'1g',cal:1.03,pro:0.012,fat:0.003,carb:0.232,fib:0.026,cat:'Fruits/Vegetables'},
  {name:'Papaya',serving:'1g',cal:0.39,pro:0.006,fat:0.001,carb:0.098,fib:0.018,cat:'Fruits/Vegetables'},
  {name:'Kiwi (with skin)',serving:'1g',cal:0.55,pro:0.011,fat:0.005,carb:0.106,fib:0.03,cat:'Fruits/Vegetables'},
  {name:'Raspberries',serving:'1g',cal:0.32,pro:0.014,fat:0.003,carb:0.046,fib:0.065,cat:'Fruits/Vegetables'},
  {name:'Wild Blueberries',serving:'1g',cal:0.571,pro:0,fat:0.004,carb:0.136,fib:0.043,cat:'Fruits/Vegetables'},
  {name:'Dark Sweet Cherries',serving:'1g',cal:0.638,pro:0.011,fat:0.001,carb:0.154,fib:0.019,cat:'Fruits/Vegetables'},
  {name:'Broccoli',serving:'1g',cal:0.38,pro:0.044,fat:0.009,carb:0.018,fib:0.026,cat:'Fruits/Vegetables'},
  {name:'Green Beans',serving:'1g',cal:0.21,pro:0.01,fat:0.004,carb:0.041,fib:0.015,cat:'Fruits/Vegetables'},
  {name:'Baby Spinach',serving:'1g',cal:0.29,pro:0.028,fat:0.008,carb:0.016,fib:0.015,cat:'Fruits/Vegetables'},
  {name:'Spaghetti Squash',serving:'1g',cal:0.31,pro:0.006,fat:0.006,carb:0.069,fib:0.015,cat:'Fruits/Vegetables'},
  {name:'Cucumber',serving:'1g',cal:0.15,pro:0.006,fat:0.001,carb:0.028,fib:0.008,cat:'Fruits/Vegetables'},
  {name:'Grapefruit',serving:'1g',cal:0.34,pro:0.008,fat:0.001,carb:0.068,fib:0.011,cat:'Fruits/Vegetables'},
  {name:'Asparagus',serving:'1g',cal:0.2,pro:0.022,fat:0.001,carb:0.038,fib:0.021,cat:'Fruits/Vegetables'},
  {name:'Zucchini',serving:'1g',cal:0.17,pro:0.012,fat:0.003,carb:0.031,fib:0.01,cat:'Fruits/Vegetables'},
  {name:'Kale',serving:'1g',cal:0.5,pro:0.043,fat:0.009,carb:0.099,fib:0.02,cat:'Fruits/Vegetables'},
  {name:'Arugula',serving:'1g',cal:0.25,pro:0.026,fat:0.007,carb:0.037,fib:0.016,cat:'Fruits/Vegetables'},
  {name:'Bell Pepper',serving:'1g',cal:0.31,pro:0.01,fat:0.003,carb:0.06,fib:0.021,cat:'Fruits/Vegetables'},
  {name:'Celery',serving:'1g',cal:0.16,pro:0.007,fat:0.002,carb:0.03,fib:0.016,cat:'Fruits/Vegetables'},
  {name:'Fish Oil 2000mg',serving:'2 caps',cal:20,pro:0,fat:2,carb:0,fib:0,cat:'Supplements'},
  {name:'Glutamine 20g',serving:'20g',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Supplements'},
  {name:'Bloat Eaze',serving:'1 scoop',cal:10,pro:0,fat:0,carb:2,fib:0,cat:'Supplements'},
  {name:'Magnesium',serving:'1 scoop',cal:5,pro:0,fat:0,carb:1,fib:0,cat:'Supplements'},
  {name:'Vitamin D',serving:'1 tab',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Supplements'},
  {name:'Multivitamin',serving:'3 caps',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Supplements'},
  {name:'Water (16oz)',serving:'16oz',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Black Coffee',serving:'240ml',cal:5,pro:0.3,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Organic Apple Juice',serving:'250ml',cal:115,pro:0.2,fat:0.3,carb:28,fib:0.5,cat:'Drinks/Condiments'},
  {name:'Aloe Vera Juice',serving:'59ml',cal:4,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Beef Bone Broth',serving:'150ml',cal:25,pro:5,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Yellow Mustard',serving:'5g',cal:3,pro:0.2,fat:0.1,carb:0.3,fib:0.1,cat:'Drinks/Condiments'},
  {name:'Hot Sauce',serving:'5g',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
  {name:'Salsa',serving:'30g',cal:10,pro:0.4,fat:0,carb:2,fib:0.5,cat:'Drinks/Condiments'},
  {name:'Unrefined Mineral Salt',serving:'1/4 tsp',cal:0,pro:0,fat:0,carb:0,fib:0,cat:'Drinks/Condiments'},
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

// ── Serving helpers ───────────────────────────────────────────
// Extract the numeric base from a serving string like "4oz", "184g", "1 egg"
function parseBaseQty(servingStr) {
  const m = String(servingStr).match(/^([\d.]+)/)
  return m ? parseFloat(m[1]) : 1
}
// Extract the unit label, e.g. "oz", "g", "egg", "scoop", "slice"
function parseServingUnit(servingStr) {
  const s = String(servingStr)
  // strip leading number + optional space, take first word
  const m = s.match(/^[\d.]+\s*([a-zA-Z]+)/)
  return m ? m[1] : 'x'
}
// Default display qty for a food when first added
function defaultQty(food) {
  const unit = parseServingUnit(food.serving)
  const base = parseBaseQty(food.serving)
  // For per-gram foods default to a sensible round amount
  if (unit === 'g') {
    if (food.cat === 'Proteins') return 100  // 100g
    if (food.cat === 'Carbohydrates') return 100
    if (food.cat === 'Fats') return 14 // ~1 tbsp
    if (food.cat === 'Fruits/Vegetables') return 100
    return base
  }
  if (unit === 'oz') return 4
  return base
}

// ── Macro math ────────────────────────────────────────────────
function mealMacros(meal) {
  return meal.foods.reduce((acc,item)=>({
    cal:Math.round(acc.cal+item.food.cal*item.servings),
    pro:Math.round(acc.pro+item.food.pro*item.servings),
    fat:Math.round(acc.fat+item.food.fat*item.servings),
    carb:Math.round(acc.carb+item.food.carb*item.servings),
    fib:Math.round(acc.fib+item.food.fib*item.servings),
  }),{cal:0,pro:0,fat:0,carb:0,fib:0})
}

function calcBMR(weight,height,age,gender) {
  const w=parseFloat(weight)*0.453592
  const h=parseFloat(height)*2.54
  const a=parseFloat(age)
  if(!w||!h||!a) return 0
  return gender==='Male'
    ?Math.round(10*w+6.25*h-5*a+5)
    :Math.round(10*w+6.25*h-5*a-161)
}

// ── Mini UI ───────────────────────────────────────────────────
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

function Inp({label,value,onChange,type='text',placeholder}) {
  return (
    <div style={{marginBottom:10}}>
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
        {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
    </div>
  )
}

function Card({children,sx={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...sx}}>{children}</div>
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function DietBuilder({currentUser}) {
  const email  = currentUser?.email||''
  const info   = KNOWN_USERS[email]||{role:'client',name:'User'}
  const role   = info.role
  const isCoach= role==='coach'||role==='super_admin'

  // ── Privacy mode (hide client roster for Loom) ────────────
  const [privacyMode, setPrivacyMode] = useState(false)

  // ── Tabs ──────────────────────────────────────────────────
  const [tab, setTab] = useState('plan')

  // ── Meal plan ─────────────────────────────────────────────
  const [dayType,   setDayType]   = useState('high')
  const [protocol,  setProtocol]  = useState('Base Diet Protocol Male')
  const [showPicker,setShowPicker]= useState(false)
  const [activeMeal,setActiveMeal]= useState(null)
  const [foodSearch,setFoodSearch]= useState('')
  const [highMeals, setHighMeals] = useState(
    ['Meal 1','Meal 2','Meal 3','Meal 4','Meal 5','Meal 6'].map(n=>({name:n,foods:[]}))
  )
  const [lowMeals, setLowMeals] = useState(
    ['Meal 1','Meal 2','Meal 3','Meal 4','Meal 5'].map(n=>({name:n,foods:[]}))
  )
  const meals    = dayType==='high'?highMeals:lowMeals
  const setMeals = dayType==='high'?setHighMeals:setLowMeals

  // ── Calculator ────────────────────────────────────────────
  const [calc, setCalc] = useState({
    gender:'Male',weight:'',height:'',age:'',bodyfat:'',
    activity:ACTIVITY_LEVELS[1].label,ds:'Maintenance',
    protPct:40,fatPct:30,carbPct:30,
  })
  const [results, setResults] = useState(null)
  const targets = results||{cal:2100,pro:175,fat:70,carb:200,fib:30}

  // ── Check-in ──────────────────────────────────────────────
  const [ci, setCi] = useState({
    weight:'',temp:'',steps:'',bp:'',
    sleep:'5',sleepNotes:'',wakeTime:'',
    bloating:'5',brainFog:'5',sexDrive:'5',energy:'5',hunger:'5',
    bowelCount:'',bowelType:'',heartRate:'',hrv:'',
    cycleNotes:'',cyclePain:'5',notes:'',
  })
  const setC = k=>v=>setCi(p=>({...p,[k]:v}))

  // ── Habits ────────────────────────────────────────────────
  // Coach assigns which habits apply to this client
  const [assignedHabits, setAssignedHabits] = useState(
    MASTER_HABITS.slice(0,8).map(h=>({...h,target:h.defaultTarget,assigned:true}))
  )
  const [showHabitPicker, setShowHabitPicker] = useState(false)
  const [customHabit, setCustomHabit] = useState('')
  // Client fills in frequency 0-7
  const [habitCounts, setHabitCounts] = useState({})
  const setHabitCount = (id,v) => setHabitCounts(p=>({...p,[id]:Math.min(7,Math.max(0,parseInt(v)||0))}))

  // ── Update notes (Loom/text) ──────────────────────────────
  const [updates, setUpdates] = useState([
    {id:1, date:'Jul 14 2026', type:'note',  text:'Adjusted Meal 3 protein up to 5.5oz. Keep hitting step goal — great progress this week!', loom:''},
    {id:2, date:'Jul 7 2026',  type:'loom',  text:'Weekly check-in review + diet update walkthrough', loom:'https://loom.com/share/example'},
  ])
  const [newUpdate, setNewUpdate] = useState({text:'',loom:''})

  // ── Supplements ───────────────────────────────────────────
  const [suppSearch,      setSuppSearch]      = useState('')
  const [suppCategory,    setSuppCategory]    = useState(Object.keys(SUPP_DB)[0])
  const [clientSupps,     setClientSupps]     = useState([]) // assigned to this client
  const [showSuppPicker,  setShowSuppPicker]  = useState(false)
  const [customSuppText,  setCustomSuppText]  = useState('')
  const [rxList,          setRxList]          = useState([])
  const [rxExpanded,      setRxExpanded]      = useState({})
  const [rxDraftLog,      setRxDraftLog]      = useState({}) // keyed by rx id
  const [coachNotes,      setCoachNotes]      = useState('')

  // ── Macro totals ──────────────────────────────────────────
  const totals = meals.reduce((a,m)=>{
    const mt=mealMacros(m)
    return {cal:a.cal+mt.cal,pro:a.pro+mt.pro,fat:a.fat+mt.fat,carb:a.carb+mt.carb,fib:a.fib+mt.fib}
  },{cal:0,pro:0,fat:0,carb:0,fib:0})

  // ── Food picker actions ───────────────────────────────────
  function addFood(food) {
    if(activeMeal===null) return
    const qty = defaultQty(food)
    const base = parseBaseQty(food.serving)
    setMeals(p=>p.map((m,i)=>i===activeMeal?{...m,foods:[...m.foods,{food,qty:String(qty),servings:qty/base}]}:m))
    setShowPicker(false); setFoodSearch('')
  }
  function removeFood(mi,fi) {
    setMeals(p=>p.map((m,i)=>i===mi?{...m,foods:m.foods.filter((_,j)=>j!==fi)}:m))
  }
  function updateQty(mi,fi,rawVal) {
    const newQty = parseFloat(rawVal)
    setMeals(p=>p.map((m,i)=>i===mi?{...m,foods:m.foods.map((f,j)=>j===fi?{
      ...f,
      qty:rawVal,
      servings:isNaN(newQty)||newQty<=0?f.servings:(newQty/parseBaseQty(f.food.serving))
    }:f)}:m))
  }

  // ── Calculator ────────────────────────────────────────────
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

  // ── Add supplement from database ──────────────────────────
  function addSuppFromDB(supp) {
    setClientSupps(p=>[...p,{...supp,id:Date.now(),customDose:supp.dose,customDir:supp.directions,customReason:supp.reason||''}])
  }

  function addSuppProtocol(category) {
    const supps = SUPP_DB[category]||[]
    supps.forEach(s=>addSuppFromDB(s))
    setShowSuppPicker(false)
  }

  function removeSupp(id) {
    setClientSupps(p=>p.filter(s=>s.id!==id))
  }

  function updateSuppField(id,field,val) {
    setClientSupps(p=>p.map(s=>s.id===id?{...s,[field]:val}:s))
  }

  // ── Add update note ───────────────────────────────────────
  function addUpdate() {
    if(!newUpdate.text.trim()) return
    setUpdates(p=>[{id:Date.now(),date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),type:newUpdate.loom?'loom':'note',...newUpdate},...p])
    setNewUpdate({text:'',loom:''})
  }

  // ── Habit management ─────────────────────────────────────
  function toggleHabitAssign(habit) {
    const exists = assignedHabits.find(h=>h.id===habit.id)
    if(exists) setAssignedHabits(p=>p.filter(h=>h.id!==habit.id))
    else setAssignedHabits(p=>[...p,{...habit,target:habit.defaultTarget}])
  }

  function addCustomHabit() {
    if(!customHabit.trim()) return
    const h={id:'custom_'+Date.now(),name:customHabit.trim(),defaultTarget:7,target:7}
    setAssignedHabits(p=>[...p,h])
    setCustomHabit('')
  }

  const habitScore = assignedHabits.length>0
    ? Math.round(assignedHabits.reduce((a,h)=>a+(habitCounts[h.id]||0),0)
      / assignedHabits.reduce((a,h)=>a+h.target,0)*100)
    : 0

  const filteredFoods = FOODS.filter(f=>
    !foodSearch||f.name.toLowerCase().includes(foodSearch.toLowerCase())||
    f.cat.toLowerCase().includes(foodSearch.toLowerCase())
  )

  const allSuppSearchResults = Object.entries(SUPP_DB).flatMap(([cat,supps])=>
    supps.filter(s=>s.name.toLowerCase().includes(suppSearch.toLowerCase())).map(s=>({...s,category:cat}))
  )

  const TABS=[
    ['plan','🥗 Meal Plan'],
    ['updates','📝 Updates'],
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

      {/* ── Privacy mode overlay banner ──────────────────── */}
      {privacyMode&&(
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:50,background:'#ff444488',padding:'6px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:12,color:C.white,fontWeight:700}}>🎥 Privacy Mode ON — Client roster hidden</span>
          <button onClick={()=>setPrivacyMode(false)} style={{background:'none',border:`1px solid ${C.white}`,borderRadius:6,padding:'3px 10px',color:C.white,fontSize:11,cursor:'pointer'}}>
            Restore
          </button>
        </div>
      )}

      {/* ── Top tab bar ──────────────────────────────────── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:`0 16px`,display:'flex',alignItems:'center',gap:0,flexShrink:0,marginTop:privacyMode?28:0}}>
        <div style={{flex:1,paddingRight:8}}>
          <div style={{fontSize:13,fontWeight:700,color:C.white}}>{isCoach?`Diet Builder — Jordan Williams`:'My Diet Plan'}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{protocol}</div>
        </div>

        {/* Privacy / Loom hide button — coach only */}
        {isCoach&&(
          <button onClick={()=>setPrivacyMode(p=>!p)}
            title="Hide client roster for screen recording"
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

      {/* ══════════════════════════════════════════════════════
          MEAL PLAN TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='plan'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {isCoach&&(
            <Card sx={{marginBottom:12}}>
              <Sel label="Diet Protocol" value={protocol} onChange={setProtocol} options={PROTOCOLS}/>
            </Card>
          )}

          <div style={{display:'flex',gap:8,marginBottom:12}}>
            {['high','low'].map(d=>(
              <button key={d} onClick={()=>setDayType(d)}
                style={{flex:1,padding:10,borderRadius:10,border:`1px solid ${dayType===d?C.gold:C.border}`,background:dayType===d?`${C.gold}20`:C.card,color:dayType===d?C.gold:C.muted,fontWeight:dayType===d?700:400,fontSize:13,cursor:'pointer'}}>
                {d==='high'?'⬆ High Calorie Day':'⬇ Low Calorie Day'}
              </button>
            ))}
          </div>

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
                • Organic fruits/veg · Grass-fed/finished beef · Wild caught fish · Pasteurized cage-free eggs · Organic chicken · Raw dairy only<br/>
                • NO artificial sweeteners — Stevia only · Raw honey only · 6-8g EVOO for cooking · Updates due Wed before 9 AM CST
              </div>
            </div>
          </Card>

          {meals.map((meal,mi)=>{
            const mt=mealMacros(meal)
            return (
              <Card key={mi} sx={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.white}}>{meal.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,color:C.gold,fontWeight:600}}>{mt.cal} cal</span>
                    <span style={{fontSize:10,color:C.muted}}>P:{mt.pro}g C:{mt.carb}g F:{mt.fat}g Fib:{mt.fib}g</span>
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
                ):meal.foods.map((item,fi)=>{
                  const unit = parseServingUnit(item.food.serving)
                  const cal  = Math.round(item.food.cal*item.servings)
                  const pro  = Math.round(item.food.pro*item.servings)
                  const carb = Math.round(item.food.carb*item.servings)
                  const fat  = Math.round(item.food.fat*item.servings)
                  const fib  = Math.round(item.food.fib*item.servings)
                  return (
                    <div key={fi} style={{padding:'8px 0',borderTop:`1px solid ${C.border}`}}>
                      {/* Row 1: name + remove */}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
                        <div style={{fontSize:12,color:C.white,fontWeight:600,flex:1,paddingRight:8}}>{item.food.name}</div>
                        {isCoach&&(
                          <button onClick={()=>removeFood(mi,fi)}
                            style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:18,padding:'0',lineHeight:1,flexShrink:0}}>×</button>
                        )}
                      </div>
                      {/* Row 2: qty input + macros */}
                      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                        {isCoach&&(
                          <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                            <input
                              type="number" min="0" step="any"
                              value={item.qty??String(parseBaseQty(item.food.serving))}
                              onChange={e=>updateQty(mi,fi,e.target.value)}
                              style={{width:60,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 7px',color:C.gold,fontSize:12,fontWeight:700,outline:'none',textAlign:'center'}}/>
                            <span style={{fontSize:11,color:C.muted}}>{unit}</span>
                          </div>
                        )}
                        <div style={{fontSize:10,color:C.muted,lineHeight:1.6}}>
                          <span style={{color:C.gold,fontWeight:600}}>{cal} cal</span>
                          {'  ·  P:'}<span style={{color:'#4FD89A'}}>{pro}g</span>
                          {'  C:'}<span style={{color:'#6FB8E8'}}>{carb}g</span>
                          {'  F:'}<span style={{color:'#f06060'}}>{fat}g</span>
                          {'  Fib:'}<span style={{color:'#D4A8F0'}}>{fib}g</span>
                        </div>
                      </div>
                      {!isCoach&&(
                        <div style={{marginTop:5,fontSize:10,color:C.muted}}>
                          {item.qty} {unit} · {cal} cal · P:{pro}g C:{carb}g F:{fat}g
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            )
          })}

          {isCoach&&(
            <button onClick={async()=>{await dbInsert('diet_plans',{client_id:KNOWN_USERS['client@eden.io']?.uuid,coach_id:KNOWN_USERS['coach@eden.io']?.uuid,protocol,high_day_meals:JSON.stringify(highMeals),low_day_meals:JSON.stringify(lowMeals),targets:JSON.stringify(targets),updated_at:new Date().toISOString()});alert('Diet plan saved!')}}
              style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:20}}>
              Save Diet Plan
            </button>
          )}

          {!isCoach&&(
            <div style={{background:'linear-gradient(135deg,#1a1200,#2a1800)',border:`1px solid ${C.gold}33`,borderRadius:12,padding:16,marginBottom:24}}>
              <div style={{fontWeight:700,fontSize:13,color:C.white,marginBottom:5}}>🍽 Eden Recipe Book</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Unlock 100+ clean eating recipes aligned with your protocol. Pull meals directly into your plan.</div>
              <button style={{background:C.gold,border:'none',borderRadius:8,padding:'9px 18px',fontWeight:700,color:C.black,fontSize:12,cursor:'pointer'}}>Unlock Recipe Book</button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          UPDATE NOTES / LOOM HISTORY TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='updates'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>

          {/* Coach: post new update */}
          {isCoach&&(
            <Card sx={{marginBottom:14}}>
              <Lbl t="Post Update to Client"/>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Update Note</div>
                <textarea value={newUpdate.text} onChange={e=>setNewUpdate(p=>({...p,text:e.target.value}))}
                  placeholder="Describe the change to their protocol, lab feedback, or any note for the client…"
                  rows={3}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
              <Inp label="Loom / Video Link (optional)" value={newUpdate.loom} onChange={v=>setNewUpdate(p=>({...p,loom:v}))} placeholder="https://loom.com/share/..."/>
              <button onClick={addUpdate}
                style={{width:'100%',background:C.gold,border:'none',borderRadius:8,padding:10,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer'}}>
                Post Update
              </button>
            </Card>
          )}

          {/* Update history feed */}
          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>
            {isCoach?'Update History Sent to Client':'Coach Updates'}
          </div>

          {updates.length===0&&(
            <div style={{textAlign:'center',padding:30,color:C.muted,fontSize:13}}>No updates yet</div>
          )}

          {updates.map(u=>(
            <Card key={u.id} sx={{marginBottom:10,borderLeft:`3px solid ${u.type==='loom'?C.gold:C.success}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <span style={{fontSize:10,fontWeight:700,color:u.type==='loom'?C.gold:C.success,letterSpacing:.8}}>
                  {u.type==='loom'?'🎥 VIDEO UPDATE':'📝 PROTOCOL UPDATE'}
                </span>
                <span style={{fontSize:10,color:C.muted}}>{u.date}</span>
              </div>
              <div style={{fontSize:13,color:C.white,lineHeight:1.6,marginBottom:u.loom?10:0}}>{u.text}</div>
              {u.loom&&(
                <a href={u.loom} target="_blank" rel="noreferrer"
                  style={{display:'flex',alignItems:'center',gap:8,background:C.surface,borderRadius:8,padding:'9px 12px',textDecoration:'none',border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:20}}>▶️</span>
                  <div>
                    <div style={{fontSize:12,color:C.gold,fontWeight:600}}>Watch Video Update</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:240}}>{u.loom}</div>
                  </div>
                </a>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CALCULATOR TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='calculator'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CHECK-IN TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='checkin'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          <div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}44`,borderLeft:`3px solid ${C.danger}`,borderRadius:9,padding:'10px 13px',marginBottom:12,fontSize:12,color:C.danger}}>
            ⚠️ All weekly updates MUST be in before 9 AM CST. Wake up on empty stomach. Include fasted weight + photos.
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
                <input type="range" min="1" max="10" value={ci[k]} onChange={e=>setC(k)(e.target.value)}
                  style={{width:'100%',accentColor:C.gold}}/>
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
            <input type="range" min="1" max="10" value={ci.cyclePain} onChange={e=>setC('cyclePain')(e.target.value)}
              style={{width:'100%',accentColor:C.gold}}/>
          </Card>
          <Card sx={{marginBottom:12}}>
            <Lbl t="Additional Notes"/>
            <textarea value={ci.notes} onChange={e=>setC('notes')(e.target.value)}
              placeholder="Deviations from plan, how long on current protocol, anything your coach should know…"
              rows={4}
              style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
            <div style={{marginTop:10,padding:'8px 10px',background:`${C.gold}11`,border:`1px solid ${C.gold}33`,borderRadius:8,fontSize:11,color:C.muted}}>
              📸 Upload progress photos (front, side, back) in the Labs &amp; Photos section
            </div>
          </Card>
          <button onClick={async()=>{await dbInsert('weekly_checkins',{client_id:KNOWN_USERS['client@eden.io']?.uuid,coach_id:KNOWN_USERS['coach@eden.io']?.uuid,...ci,submitted_at:new Date().toISOString()});alert('Check-in submitted! Your coach will review within 48 hours.')}}
            style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:14,cursor:'pointer',marginBottom:24}}>
            Submit Weekly Check-In
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          HABITS TAB — frequency count 0-7 + custom assignment
      ══════════════════════════════════════════════════════ */}
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

          {/* Habit frequency tracking */}
          <Card sx={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Lbl t="This Week — Times Completed"/>
              <span style={{fontSize:16,fontWeight:700,color:habitScore>=80?C.success:habitScore>=50?C.gold:C.danger}}>
                {habitScore}%
              </span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:12,lineHeight:1.5}}>
              Enter how many times you completed each habit since your last check-in (0–7)
            </div>
            {assignedHabits.map(h=>{
              const count = habitCounts[h.id]||0
              const pct   = Math.round(count/h.target*100)
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
                    <button onClick={()=>setHabitCount(h.id,(count||0)-1)}
                      disabled={count<=0}
                      style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count<=0?.4:1}}>−</button>
                    <div style={{width:36,height:36,borderRadius:8,border:`1px solid ${count>=h.target?C.success:C.border}`,background:count>=h.target?`${C.success}22`:C.surface,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:16,fontWeight:700,color:count>=h.target?C.success:C.white}}>{count}</span>
                    </div>
                    <button onClick={()=>setHabitCount(h.id,(count||0)+1)}
                      disabled={count>=7}
                      style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.white,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:count>=7?.4:1}}>+</button>
                    <span style={{fontSize:10,color:count>=h.target?C.success:C.muted,width:32,textAlign:'right'}}>{count}/{h.target}</span>
                  </div>
                </div>
              )
            })}
          </Card>
          <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:20}}>
            Save Habit Tracker
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SUPPLEMENTS TAB
      ══════════════════════════════════════════════════════ */}
      {tab==='supplements'&&(
        <div style={{flex:1,overflowY:'auto',padding:16}}>

          {/* Coach: supplement builder */}
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
                  <div style={{fontSize:12,color:C.muted,fontStyle:'italic',padding:'8px 0'}}>
                    Click + Add Supplements to search the database or apply a full protocol
                  </div>
                )}

                {clientSupps.map(s=>(
                  <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:C.white,fontWeight:600}}>{s.name}</div>
                        {s.category&&<div style={{fontSize:9,color:C.gold,fontWeight:700,letterSpacing:.8,marginTop:2}}>{s.category.toUpperCase()}</div>}
                      </div>
                      <button onClick={()=>removeSupp(s.id)}
                        style={{background:'none',border:'none',color:C.danger,cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0}}>×</button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
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
                    <div>
                      <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Reason for Use / What It Does</div>
                      <textarea value={s.customReason||''} onChange={e=>updateSuppField(s.id,'customReason',e.target.value)}
                        rows={2}
                        placeholder="e.g. Lowers cortisol, supports adrenal recovery and HPA axis"
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                    </div>
                    {(s.code||s.link)&&(
                      <div style={{marginTop:6,fontSize:10,color:C.muted,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                        {s.code&&<span>Discount: <span style={{color:C.gold,fontWeight:700}}>{s.code}</span></span>}
                        {s.link&&<a href={s.link} target="_blank" rel="noreferrer" style={{color:C.gold,textDecoration:'none',fontWeight:600}}>Purchase →</a>}
                      </div>
                    )}
                  </div>
                ))}

                {/* Or paste custom */}
                <div style={{marginTop:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Or Paste / Type Custom Protocol</div>
                  <textarea value={customSuppText} onChange={e=>setCustomSuppText(e.target.value)}
                    placeholder="Paste or type any custom supplement instructions here…"
                    rows={4}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                </div>
              </Card>

              <Card sx={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <Lbl t="Prescriptions / Medications"/>
                  <button onClick={()=>{
                    const id=Date.now().toString()
                    setRxList(p=>[...p,{id,name:'',dosage:'',reason:'',taperLog:[]}])
                    setRxExpanded(p=>({...p,[id]:true}))
                    setRxDraftLog(p=>({...p,[id]:{date:new Date().toISOString().slice(0,10),dose:'',direction:'hold',note:''}}))
                  }} style={{background:C.gold,border:'none',borderRadius:6,padding:'5px 12px',color:C.black,fontWeight:700,fontSize:11,cursor:'pointer',letterSpacing:.5}}>+ Add Rx</button>
                </div>
                {rxList.length===0&&(
                  <div style={{textAlign:'center',padding:'18px 0',color:C.muted,fontSize:12}}>No prescriptions added yet. Click + Add Rx to begin.</div>
                )}
                {rxList.map((rx,ri)=>(
                  <div key={rx.id} style={{border:`1px solid ${C.border}`,borderRadius:10,marginBottom:10,overflow:'hidden'}}>
                    {/* Header row */}
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:C.surface,cursor:'pointer'}}
                      onClick={()=>setRxExpanded(p=>({...p,[rx.id]:!p[rx.id]}))}>
                      <div style={{fontSize:13,color:rx.name?C.white:C.muted,fontWeight:700,flex:1}}>
                        {rx.name||'New Prescription'}
                        {rx.dosage&&<span style={{color:C.gold,fontWeight:400,fontSize:11,marginLeft:8}}>{rx.dosage}</span>}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>{rx.taperLog.length} entries</div>
                      <div style={{color:C.gold,fontSize:12}}>{rxExpanded[rx.id]?'▲':'▼'}</div>
                      <button onClick={e=>{e.stopPropagation();setRxList(p=>p.filter(r=>r.id!==rx.id))}}
                        style={{background:'transparent',border:'none',color:'#ff4444',fontSize:14,cursor:'pointer',padding:'0 2px',lineHeight:1}}>✕</button>
                    </div>

                    {rxExpanded[rx.id]&&(
                      <div style={{padding:'12px 12px 0'}}>
                        {/* Core fields */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Prescription Name</div>
                            <input value={rx.name} onChange={e=>setRxList(p=>p.map((r,i)=>i===ri?{...r,name:e.target.value}:r))}
                              placeholder="e.g. Progesterone, T3, LDN…"
                              style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Current Dosage</div>
                            <input value={rx.dosage} onChange={e=>setRxList(p=>p.map((r,i)=>i===ri?{...r,dosage:e.target.value}:r))}
                              placeholder="e.g. 100mg nightly, 5mg 2x daily…"
                              style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                          </div>
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:.8}}>Reason for Use / Goals</div>
                          <input value={rx.reason} onChange={e=>setRxList(p=>p.map((r,i)=>i===ri?{...r,reason:e.target.value}:r))}
                            placeholder="e.g. Low progesterone, hypothyroid support, inflammation…"
                            style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 8px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                        </div>

                        {/* Taper log */}
                        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginBottom:0}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Taper / Dose Adjustment Log</div>

                          {rx.taperLog.length>0&&(
                            <div style={{marginBottom:10,maxHeight:180,overflowY:'auto'}}>
                              {[...rx.taperLog].reverse().map((entry,ei)=>{
                                const dirColors={up:'#4caf50',down:'#ff7043',hold:C.gold,discontinue:'#ff4444'}
                                const dirLabels={up:'↑ Taper Up',down:'↓ Taper Down',hold:'— Hold',discontinue:'⊘ Discontinue'}
                                return(
                                  <div key={ei} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'6px 0',borderBottom:`1px solid ${C.border}`}}>
                                    <div style={{fontSize:10,color:C.muted,minWidth:72,paddingTop:1}}>{entry.date}</div>
                                    <div style={{flex:1}}>
                                      <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:2}}>
                                        <span style={{fontSize:10,fontWeight:700,color:dirColors[entry.direction]||C.gold}}>{dirLabels[entry.direction]||entry.direction}</span>
                                        {entry.dose&&<span style={{fontSize:11,color:C.white,fontWeight:600}}>{entry.dose}</span>}
                                      </div>
                                      {entry.note&&<div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>{entry.note}</div>}
                                    </div>
                                    <button onClick={()=>setRxList(p=>p.map((r,i)=>i===ri?{...r,taperLog:r.taperLog.filter((_,j)=>rx.taperLog.length-1-ei!==j)}:r))}
                                      style={{background:'transparent',border:'none',color:'#ff4444',fontSize:12,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>✕</button>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* New entry form */}
                          {(()=>{
                            const draft=rxDraftLog[rx.id]||{date:new Date().toISOString().slice(0,10),dose:'',direction:'hold',note:''}
                            const setDraft=v=>setRxDraftLog(p=>({...p,[rx.id]:{...draft,...v}}))
                            return(
                              <div style={{background:C.surface,borderRadius:8,padding:'10px 10px 10px',border:`1px solid ${C.border}`,marginBottom:12}}>
                                <div style={{fontSize:9,color:C.gold,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>New Entry</div>
                                <div style={{display:'grid',gridTemplateColumns:'110px 1fr 1fr',gap:6,marginBottom:6}}>
                                  <div>
                                    <div style={{fontSize:9,color:C.muted,marginBottom:2,textTransform:'uppercase',letterSpacing:.6}}>Date</div>
                                    <input type="date" value={draft.date} onChange={e=>setDraft({date:e.target.value})}
                                      style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 6px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box',colorScheme:'dark'}}/>
                                  </div>
                                  <div>
                                    <div style={{fontSize:9,color:C.muted,marginBottom:2,textTransform:'uppercase',letterSpacing:.6}}>Action</div>
                                    <select value={draft.direction} onChange={e=>setDraft({direction:e.target.value})}
                                      style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 6px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box'}}>
                                      <option value="up">↑ Taper Up</option>
                                      <option value="down">↓ Taper Down</option>
                                      <option value="hold">— Hold / Maintain</option>
                                      <option value="discontinue">⊘ Discontinue</option>
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{fontSize:9,color:C.muted,marginBottom:2,textTransform:'uppercase',letterSpacing:.6}}>New Dose</div>
                                    <input value={draft.dose} onChange={e=>setDraft({dose:e.target.value})}
                                      placeholder="e.g. 150mg, 2 tabs…"
                                      style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 6px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box'}}/>
                                  </div>
                                </div>
                                <div style={{marginBottom:8}}>
                                  <div style={{fontSize:9,color:C.muted,marginBottom:2,textTransform:'uppercase',letterSpacing:.6}}>Coach Notes</div>
                                  <input value={draft.note} onChange={e=>setDraft({note:e.target.value})}
                                    placeholder="Reason for change, symptoms, response, days until recheck…"
                                    style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 6px',color:C.white,fontSize:11,outline:'none',boxSizing:'border-box'}}/>
                                </div>
                                <button onClick={()=>{
                                  if(!draft.date) return
                                  setRxList(p=>p.map((r,i)=>i===ri?{...r,taperLog:[...r.taperLog,{...draft}]}:r))
                                  setDraft({date:new Date().toISOString().slice(0,10),dose:'',direction:'hold',note:''})
                                }} style={{background:C.gold,border:'none',borderRadius:6,padding:'5px 16px',color:C.black,fontWeight:700,fontSize:11,cursor:'pointer'}}>
                                  Add Entry
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Card>

              <Card sx={{marginBottom:12}}>
                <Lbl t="Coach Notes to Client"/>
                <textarea value={coachNotes} onChange={e=>setCoachNotes(e.target.value)}
                  placeholder="Notes, reminders, instructions…"
                  rows={3}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </Card>

              <button style={{width:'100%',background:C.gold,border:'none',borderRadius:10,padding:12,fontWeight:800,color:C.black,fontSize:13,cursor:'pointer',marginBottom:12}}>
                Save Protocol
              </button>
            </>
          )}

          {/* Client view of supplement protocol */}
          {!isCoach&&(
            <>
              {clientSupps.length===0&&customSuppText===''?(
                <Card sx={{marginBottom:12}}>
                  <div style={{textAlign:'center',padding:24,color:C.muted,fontSize:13}}>Your supplement protocol will appear here once your coach assigns it.</div>
                </Card>
              ):(
                <Card sx={{marginBottom:12}}>
                  <Lbl t="Your Supplement Protocol"/>
                  {clientSupps.map(s=>(
                    <div key={s.id} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
                      <div style={{fontSize:13,color:C.white,fontWeight:600,marginBottom:3}}>{s.name}</div>
                      <div style={{fontSize:12,color:C.gold}}>{s.customDose}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.customDir}</div>
                      {s.customReason&&(
                        <div style={{marginTop:6,padding:'6px 9px',background:'#ffa60010',border:'1px solid #ffa60033',borderRadius:6}}>
                          <div style={{fontSize:8,color:'#ffa600',fontWeight:700,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>Why / What It Does</div>
                          <div style={{fontSize:11,color:'#ddd',lineHeight:1.55}}>{s.customReason}</div>
                        </div>
                      )}
                      {(s.code||s.link)&&(
                        <div style={{marginTop:5,fontSize:10,color:C.muted,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                          {s.code&&<span>Discount: <span style={{color:C.gold,fontWeight:700}}>{s.code}</span></span>}
                          {s.link&&<a href={s.link} target="_blank" rel="noreferrer" style={{color:C.gold,textDecoration:'none',fontWeight:600}}>Purchase →</a>}
                        </div>
                      )}
                    </div>
                  ))}
                  {customSuppText&&<div style={{fontSize:13,color:C.white,lineHeight:1.7,borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:10,whiteSpace:'pre-wrap'}}>{customSuppText}</div>}
                </Card>
              )}

              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase',marginBottom:5}}>Your Notes / Questions</div>
                <textarea placeholder="Questions or notes for your coach…" rows={4}
                  style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.white,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
            </>
          )}

          {/* Resource links */}
          <Card sx={{marginBottom:24}}>
            <Lbl t="Helpful Resources & Lab Links"/>
            {[
              ['Male Blood Work Panel',               'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN',''],
              ['Female Blood Work Panel',             'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN',''],
              ['DUTCH Test',                          'https://www.practitionerdepot.com/products/dutch-test','Code: TOGNIETTI10'],
              ['GI Map',                             'https://www.practitionerdepot.com/products/gi-map','Code: TOGNIETTI10'],
              ['Book a Call / Calendar',              'https://links.lifestyleofeden.com/widget/booking/2kKUGzYZqAaNBVpd5uzA',''],
              ['NuEthix Supplements',                 'https://nuethix.com','Code: TOGNIETTI10'],
              ['Practitioner Depot Supplements',      'https://www.practitionerdepot.com','Code: TOGNIETTI10'],
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

      {/* ── FOOD PICKER MODAL ─────────────────────────────── */}
      {showPicker&&(
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
                    {foods.map(food=>{
                      const dQty = defaultQty(food)
                      const unit = parseServingUnit(food.serving)
                      const base = parseBaseQty(food.serving)
                      const mult = dQty / base
                      const dCal = Math.round(food.cal * mult)
                      const dPro = Math.round(food.pro * mult)
                      const dCarb= Math.round(food.carb * mult)
                      const dFat = Math.round(food.fat * mult)
                      const label= food.serving.match(/^\d/) ? `${dQty} ${unit}` : food.serving
                      return (
                        <button key={food.name} onClick={()=>addFood(food)}
                          style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'8px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}
                          onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
                          onMouseLeave={e=>e.currentTarget.style.background='none'}>
                          <div>
                            <div style={{fontSize:13,color:C.white,fontWeight:500}}>{food.name}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:1}}>per {label}</div>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                            <div style={{fontSize:12,color:C.gold,fontWeight:600}}>{dCal} cal</div>
                            <div style={{fontSize:10,color:C.muted}}>P:{dPro}g C:{dCarb}g F:{dFat}g</div>
                          </div>
                        </button>
                      )
                    })}
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

      {/* ── HABIT PICKER MODAL ────────────────────────────── */}
      {showHabitPicker&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setShowHabitPicker(false)}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:440,maxHeight:'82vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.white,marginBottom:4}}>Assign Habits to Client</div>
              <div style={{fontSize:11,color:C.muted}}>Select which habits this client should track</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 16px'}}>
              {MASTER_HABITS.map(h=>{
                const assigned = assignedHabits.find(x=>x.id===h.id)
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
                  <input value={customHabit} onChange={e=>setCustomHabit(e.target.value)}
                    placeholder="e.g. Infrared sauna 3x/week"
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

      {/* ── SUPPLEMENT PICKER MODAL ───────────────────────── */}
      {showSuppPicker&&(
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
              {/* Search results */}
              {suppSearch?(
                <div style={{padding:'8px 0'}}>
                  <div style={{padding:'5px 16px 3px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:1,textTransform:'uppercase'}}>Search Results</div>
                  {allSuppSearchResults.length===0&&<div style={{padding:'20px 16px',color:C.muted,fontSize:13}}>No supplements found</div>}
                  {allSuppSearchResults.map((s,i)=>(
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
                /* Browse by protocol */
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
