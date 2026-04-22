import { useState, useEffect, useCallback, useRef } from "react";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCiKMmgS8Y0VWzDzWfK6kuWiKz1rqLcN3E",
  authDomain: "flock-and-field.firebaseapp.com",
  databaseURL: "https://flock-and-field-default-rtdb.firebaseio.com",
  projectId: "flock-and-field",
  storageBucket: "flock-and-field.firebasestorage.app",
  messagingSenderId: "13186079053",
  appId: "1:13186079053:web:bfa443dee9d528d281bf04",
  measurementId: "G-TL7HXDTLKD",
};

let fbDB = null, fbRef = null, fbSet = null, fbOnValue = null;
async function initFB() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getDatabase, ref, set, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    const app = initializeApp(FIREBASE_CONFIG);
    fbDB = getDatabase(app); fbRef = ref; fbSet = set; fbOnValue = onValue;
    return true;
  } catch (e) { console.error("Firebase:", e); return false; }
}

const BUCKET_KG = 12.75;
const BUCKET_G  = BUCKET_KG * 1000;
const EGGS_PER_TRAY   = 30;
const EGGS_PER_DOZEN  = 12;
const PRICE_PER_TRAY  = 30;
const PRICE_PER_DOZEN = 14;
const EGG_COLORS = { a:"#c4913a", b:"#4a7fa5", c:"#7a5fa5", d:"#5a8a3c", e:"#b5652a" };

const BREEDS = {
  cornishCross: {
    label: "Cornish Cross — Free Range Organic",
    shortLabel: "Cornish Cross",
    cycleDays: 84,
    starterDays: 10,
    color: "#b5652a",
    targetWeights: [45, 220, 440, 660, 880, 1100, 1320, 1540, 1760, 1980, 2200, 2420, 2640],
    baselineDailyGainG: 31.4,
    stdFeedPerDay: [0, 40, 80, 120, 160, 180, 180, 180, 180, 180, 180, 180, 180],
    growerMinG: 160, growerMaxG: 300, growerTgtG: 220,
    starterMinG: 40, starterMaxG: 100, starterTgtG: 65,
    maintenanceFeedG: 180,
    notes: "ACO certified free-range. 12hr on/12hr off after day 7. Process by day 70–84.",
    warnings: [
      "12hr on/12hr off after day 7 — reduces leg stress",
      "Watch for leg issues & blue comb (heart failure)",
      "Process by day 70–84 — FCR worsens after",
      "Free-range: ensure adequate shade & water stations outside",
    ],
    managementNotes: [
      ["Water",   "Fresh water always — dehydration cuts gain up to 30%."],
      ["Temp",    "Brooder 32–35°C week 1, drop 3°C/week until ambient."],
      ["Weigh",   "Weigh 10–15 birds weekly for a reliable average."],
      ["Feed",    "12hr on/off after day 7 reduces leg stress & ascites."],
      ["Ranging", "Open range from day 21+ once feathered. Rotate paddocks."],
      ["Monitor", "Birds 10%+ below target — check feed, water, space, health."],
    ],
  },
};

const DEFAULT_HOUSES = [
  { id:"h1", label:"House 1", batchId:null },
  { id:"h2", label:"House 2", batchId:null },
  { id:"h3", label:"House 3", batchId:null },
];

const DEFAULT_CARAVANS = [
  {id:"a",label:"Caravan A",birds:50,isPullet:false,ageWeeks:52,ageSetDate:null,notes:"Established flock",feedLog:[]},
  {id:"b",label:"Caravan B",birds:40,isPullet:true, ageWeeks:18,ageSetDate:null,notes:"Recently added pullets",feedLog:[]},
  {id:"c",label:"Caravan C",birds:40,isPullet:true, ageWeeks:16,ageSetDate:null,notes:"Recently added pullets",feedLog:[]},
  {id:"d",label:"Caravan D",birds:50,isPullet:false,ageWeeks:48,ageSetDate:null,notes:"Established flock",feedLog:[]},
  {id:"e",label:"Caravan E",birds:50,isPullet:false,ageWeeks:60,ageSetDate:null,notes:"Established flock",feedLog:[]},
];

function isaRate(w) {
  if(w<20) return 0;
  if(w<22) return 0.3+(w-20)*0.25;
  if(w<30) return 0.8+((w-22)/8)*0.16;
  if(w<80) return 0.96-((w-30)/50)*0.15;
  return Math.max(0.3,0.81-((w-80)/52)*0.3);
}
const ISA_ECONOMIC_THRESHOLD = 0.65;

const fmt  = (n,d=1) => isNaN(n)||n==null ? "-" : Number(n).toFixed(d);
const fmtC = n => n==null||isNaN(n) ? "-" : `$${Number(n).toFixed(2)}`;
const fmtN = n => n==null||isNaN(n) ? "-" : Math.round(n).toLocaleString();
const toDay = () => new Date().toISOString().slice(0,10);

function fmtDateAU(iso) {
  if(!iso) return "-";
  const p = iso.slice(0,10).split("-");
  return p.length<3 ? iso : `${p[2]}/${p[1]}`;
}
function fmtDateAUFull(iso) {
  if(!iso) return "-";
  const p = iso.slice(0,10).split("-");
  return p.length<3 ? iso : `${p[2]}/${p[1]}/${p[0].slice(2)}`;
}
function addDays(ds, d) {
  const dt = new Date(ds);
  dt.setDate(dt.getDate() + Math.round(d));
  return dt.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
}
function daysBetween(a,b) { return Math.round((new Date(b)-new Date(a))/86400000); }
function effectiveAgeWeeks(c) {
  if(!c.ageSetDate) return c.ageWeeks;
  return c.ageWeeks + Math.floor(daysBetween(c.ageSetDate, toDay())/7);
}
function batchAgeDays(batch) {
  const ref = batch.arrivalDate || batch.startDate;
  return ref ? daysBetween(ref, toDay()) : null;
}
function calcFeed(birds, rateG) {
  const g = birds*rateG;
  return { gramsDay:g, kgDay:g/1000, bucketsDay:g/BUCKET_G };
}
function calcDepletion(birds, rateG, tonnes) {
  const days = (tonnes*1_000_000)/(birds*rateG);
  return { days, weeks:days/7 };
}
function dynamicDailyGain(batch) {
  const bp = BREEDS[batch.breed]||BREEDS.cornishCross;
  const log = (batch.weightLog||[]).sort((a,b)=>a.week-b.week);
  if(log.length>=2) {
    const last=log[log.length-1], prev=log[log.length-2];
    const wd=last.week-prev.week;
    if(wd>0) return { gainPerDay:Math.max(0,(last.avgWeightG-prev.avgWeightG)/(wd*7)), basedOn:"actual", lastEntry:last };
  }
  if(log.length===1) return { gainPerDay:bp.baselineDailyGainG, basedOn:"baseline (1 entry)", lastEntry:log[0] };
  return { gainPerDay:bp.baselineDailyGainG, basedOn:"baseline", lastEntry:null };
}
function predictedWeightToday(batch) {
  const bp=BREEDS[batch.breed]||BREEDS.cornishCross;
  const dayOfCycle=daysBetween(batch.startDate,toDay());
  const {gainPerDay,lastEntry}=dynamicDailyGain(batch);
  if(lastEntry) {
    const dSince=dayOfCycle-(lastEntry.week*7);
    return Math.max(lastEntry.avgWeightG,lastEntry.avgWeightG+gainPerDay*dSince);
  }
  return Math.max(bp.targetWeights[0],bp.targetWeights[0]+gainPerDay*dayOfCycle);
}
function predictHarvestDays(batch,targetWeightG) {
  const current=predictedWeightToday(batch);
  const {gainPerDay,basedOn}=dynamicDailyGain(batch);
  if(gainPerDay<=0) return null;
  return { daysFromNow:Math.max(0,Math.round((targetWeightG-current)/gainPerDay)), basedOn, currentWeight:current, gainPerDay };
}
function predictMaintenanceDays(batch) {
  const targetWeightG=batch.targetWeightG||3000;
  const current=predictedWeightToday(batch);
  const {gainPerDay,basedOn}=dynamicDailyGain(batch);
  if(current>=targetWeightG) return {status:"reached",currentWeight:current};
  if(gainPerDay<=0) return {status:"stalled",currentWeight:current};
  const daysFromNow=Math.round((targetWeightG-current)/gainPerDay);
  return {status:"predicted",daysFromNow,estimatedDate:addDays(toDay(),daysFromNow),currentWeight:current,gainPerDay,basedOn};
}
function calcLiveFCR(batch) {
  const feedLog=batch.feedLog||[];
  const weightLog=(batch.weightLog||[]).sort((a,b)=>a.week-b.week);
  if(!feedLog.length||!weightLog.length) return null;
  const totalFeedKg=feedLog.reduce((s,e)=>{
    const sk=(parseFloat(e.starterBuckets)||0)*BUCKET_KG;
    const gk=(parseFloat(e.growerBuckets)||0)*BUCKET_KG;
    return s+sk+gk+((parseFloat(e.bucketsGiven)||0)*BUCKET_KG);
  },0);
  const lastWeight=weightLog[weightLog.length-1].avgWeightG;
  const totalGainKg=((lastWeight-BREEDS.cornishCross.targetWeights[0])*batch.birds)/1000;
  if(totalGainKg<=0) return null;
  return {fcr:totalFeedKg/totalGainKg,totalFeedKg,totalGainKg};
}
function calcMortality(batch) {
  const events=batch.birdEvents||[];
  const deaths=events.filter(e=>e.type==="death").reduce((s,e)=>s+e.count,0);
  const allEvents=events.reduce((s,e)=>s+e.count,0);
  const originalBirds=batch.birds+allEvents;
  return {deaths,originalBirds,pct:originalBirds>0?(deaths/originalBirds)*100:0};
}
function calcCostPerBirdFull(batch) {
  const fd=batch[batch.currentPhase];
  const feedLog=batch.feedLog||[];
  const actualKg=feedLog.reduce((s,e)=>{
    const sk=(parseFloat(e.starterBuckets)||0)*BUCKET_KG;
    const gk=(parseFloat(e.growerBuckets)||0)*BUCKET_KG;
    return s+sk+gk+((parseFloat(e.bucketsGiven)||0)*BUCKET_KG);
  },0);
  const actualCost=batch.birds>0?(actualKg/batch.birds)*fd.pricePerKg:0;
  const usedDays=daysBetween(batch.startDate,toDay());
  const remainDays=Math.max(0,batch.cycleDays-usedDays);
  const predKg=(batch.birds*fd.rateG*remainDays)/1000;
  const predCost=batch.birds>0?(predKg/batch.birds)*fd.pricePerKg:0;
  return {total:actualCost+predCost,actual:actualCost,predicted:predCost,actualKg,predictedKgRemaining:predKg};
}
function eggIncomeForEntry(traysTotal) {
  const eggs=traysTotal*EGGS_PER_TRAY;
  const fullTrays=Math.floor(traysTotal);
  const remainEggs=eggs-(fullTrays*EGGS_PER_TRAY);
  const fullDozens=Math.floor(remainEggs/EGGS_PER_DOZEN);
  return (fullTrays*PRICE_PER_TRAY)+(fullDozens*PRICE_PER_DOZEN);
}
function exportBatchCSV(batch) {
  const rows=[["Date","Phase","Starter Buckets","Grower Buckets","Total kg","Rate g/bird","Notes"]];
  (batch.feedLog||[]).sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{
    const sk=parseFloat(e.starterBuckets)||0,gk=parseFloat(e.growerBuckets)||0,leg=parseFloat(e.bucketsGiven)||0;
    rows.push([e.date,e.phase||"",sk||leg,gk,fmt((sk+gk+leg)*BUCKET_KG,1),e.rateG||"",e.notes||""]);
  });
  rows.push([],["Week","Avg Weight (g)","Notes"]);
  (batch.weightLog||[]).sort((a,b)=>a.week-b.week).forEach(e=>rows.push([`Week ${e.week}`,e.avgWeightG,e.notes||""]));
  rows.push([],["Date","Type","Count","Notes"]);
  (batch.birdEvents||[]).sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>rows.push([e.date,e.type,e.count,e.notes||""]));
  if(batch.processingSummary){
    const ps=batch.processingSummary;
    rows.push([],["--- PROCESSING SUMMARY ---"],
      ["Process date",ps.processDate||""],
      ["Birds processed",ps.birdsProcessed||""],
      ["Avg carcass (g)",ps.avgCarcassWeightG||""],
      ["Condemned",ps.condemnedBirds||0],
      ["Actual FCR",ps.processingOutcome?.actualFCR?fmt(ps.processingOutcome.actualFCR,2):""],
      ["Revenue",ps.processingOutcome?.revenue?fmtC(ps.processingOutcome.revenue):""],
      ["Net margin",ps.processingOutcome?.netMargin?fmtC(ps.processingOutcome.netMargin):""],
      ["Notes",ps.slaughterNotes||""]);
  }
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`${batch.name.replace(/\s+/g,"_")}_export.csv`; a.click();
  URL.revokeObjectURL(url);
}
function exportEggCSV(eggLog,caravans) {
  const rows=[["Date",...caravans.map(c=>c.label+" Trays"),...caravans.map(c=>c.label+" Deaths"),"Total Trays","Total Eggs","Est Income","Notes"]];
  [...(eggLog||[])].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{
    const tt=caravans.reduce((s,c)=>s+((e.trays||{})[c.id]||0),0);
    rows.push([e.date,...caravans.map(c=>fmt((e.trays||{})[c.id]||0,1)),...caravans.map(c=>(e.deaths||{})[c.id]||0),fmt(tt,1),Math.round(tt*EGGS_PER_TRAY),fmtC(eggIncomeForEntry(tt)),e.notes||""]);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="egg_log_export.csv"; a.click();
  URL.revokeObjectURL(url);
}
function newBatch(name) {
  const bp=BREEDS.cornishCross;
  return {
    id:`b_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name,breed:"cornishCross",birds:640,startDate:toDay(),arrivalDate:toDay(),
    cycleDays:bp.cycleDays,growerStartDay:bp.starterDays,targetWeightG:3000,doubleFeed:false,
    starter:{rateG:bp.starterTgtG,pricePerKg:1.80,tonnes:0.3},
    grower:{rateG:bp.growerTgtG,pricePerKg:1.50,tonnes:1.0},
    currentPhase:"starter",feedLog:[],weightLog:[],birdEvents:[],archived:false,createdAt:Date.now(),
  };
}
const LOCAL_KEY="chookgpt_v2";
function loadLocal() {
  try {
    const r=localStorage.getItem(LOCAL_KEY)||localStorage.getItem("chookgpt_v1");
    if(r){
      const p=JSON.parse(r);
      if(p.batches) p.batches=p.batches.map(b=>{
        let u=b.breed==="freeRange"?{...b,breed:"cornishCross"}:b;
        if(!u.arrivalDate) u={...u,arrivalDate:u.startDate};
        return u;
      });
      if(p.caravans) p.caravans=p.caravans.map(c=>({...c,ageSetDate:c.ageSetDate===undefined?null:c.ageSetDate,feedLog:c.feedLog||[]}));
      if(!p.houses) p.houses=DEFAULT_HOUSES;
      return p;
    }
  } catch {}
  const defs=["Alpha","Bravo","Charlie","Delta"].map(n=>newBatch(n));
  return {batches:defs,activeBatchId:defs[0].id,caravans:DEFAULT_CARAVANS,eggLog:[],houses:DEFAULT_HOUSES};
}
function saveLocal(d){ try{ localStorage.setItem(LOCAL_KEY,JSON.stringify(d)); }catch{} }

// ── Theme ──────────────────────────────────────────────────────────────────
const T={
  bg:"#0e1a0c",surf:"#141f12",surf2:"#1a2918",
  brd:"#243d1e",brd2:"#2e5026",
  green:"#4a9e30",greenL:"rgba(74,158,48,0.12)",
  amber:"#c4913a",amberL:"rgba(196,145,58,0.12)",
  red:"#c44a3a",redL:"rgba(196,74,58,0.1)",
  blue:"#3a7ab5",blueL:"rgba(58,122,181,0.1)",
  purple:"#8a5fa5",purpleL:"rgba(138,95,165,0.1)",
  ink:"#e8f0e0",inkMid:"#b8d0a8",inkDim:"#7a9e6a",inkFaint:"#4a6e3a",
};
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0e1a0c;color:#e8f0e0;font-family:'DM Sans',sans-serif;-webkit-text-size-adjust:100%;}
input,select,textarea{font-size:16px !important;}
input[type=range]{-webkit-appearance:none;width:100%;height:5px;border-radius:3px;background:#2e5026;outline:none;cursor:pointer;}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#4a9e30;border:2px solid #0e1a0c;cursor:pointer;}
input[type=number]{-moz-appearance:textfield;}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
input:focus,select:focus,textarea:focus{outline:none;border-color:#4a9e30!important;box-shadow:0 0 0 2px rgba(74,158,48,0.13)!important;}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:#141f12}
::-webkit-scrollbar-thumb{background:#2e5026;border-radius:2px}
select{background:#141f12;color:#e8f0e0;border:1px solid #2e5026;border-radius:8px;font-family:'DM Sans',sans-serif;padding:10px 12px;}
table{border-collapse:collapse;width:100%;}
th,td{text-align:left;padding:8px 6px;}
button{-webkit-tap-highlight-color:transparent;}
.stack{display:flex;flex-direction:column;gap:12px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
.full{grid-column:1/-1;}
.scroll-x{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.tabs{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;border-bottom:1px solid #243d1e;margin-bottom:14px;}
.hero-grid{display:grid;grid-template-columns:1fr 1fr;}
@media(min-width:600px){.hero-grid{grid-template-columns:repeat(4,1fr);}}
.note-cell{font-size:11px;color:#4a6e3a;font-style:italic;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;text-decoration:underline dotted;}
`;
const S={
  app:{background:T.bg,minHeight:"100vh",color:T.ink,fontFamily:"'DM Sans',sans-serif",paddingBottom:90},
  bar:{background:"rgba(14,26,12,0.97)",borderBottom:`1px solid ${T.brd}`,padding:"0 14px",display:"flex",alignItems:"center",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(10px)",minHeight:50},
  body:{maxWidth:680,margin:"0 auto",padding:"14px 12px"},
  card:{background:T.surf,border:`1px solid ${T.brd}`,borderRadius:10,padding:"14px",position:"relative",overflow:"hidden"},
  top:c=>({position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${c},transparent)`}),
  lbl:{fontSize:10,fontWeight:600,letterSpacing:"0.16em",textTransform:"uppercase",color:T.inkFaint,marginBottom:10},
  label:{display:"block",fontSize:10,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:T.inkFaint,marginBottom:5},
  inp:{width:"100%",background:T.bg,border:`1px solid ${T.brd2}`,borderRadius:8,color:T.ink,fontFamily:"'DM Mono',monospace",fontSize:16,padding:"12px"},
  inpSm:{width:"100%",background:T.bg,border:`1px solid ${T.brd}`,borderRadius:8,color:T.ink,fontFamily:"'DM Mono',monospace",fontSize:16,padding:"10px"},
  pill:c=>({display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:600,background:`${c}18`,color:c,border:`1px solid ${c}44`,flexShrink:0}),
  btn:(c,out=false)=>({padding:"10px 16px",borderRadius:8,border:`1.5px solid ${c}`,background:out?"transparent":`${c}18`,color:c,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}),
  btnLg:c=>({padding:"14px 16px",borderRadius:8,border:`1.5px solid ${c}`,background:`${c}20`,color:c,fontSize:14,fontWeight:700,cursor:"pointer",width:"100%",fontFamily:"'DM Sans',sans-serif",marginTop:4}),
  btnIcon:{background:"none",border:"none",cursor:"pointer",padding:"4px 6px",fontSize:14,lineHeight:1},
  tab:(a,c=T.green)=>({padding:"12px 10px",background:"none",border:"none",color:a?c:T.inkFaint,fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:a?700:400,letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",borderBottom:a?`2px solid ${c}`:"2px solid transparent",marginBottom:-1,whiteSpace:"nowrap",flexShrink:0}),
  row:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.brd}`},
  rl:{fontSize:12,color:T.inkDim},
  rv:{fontSize:12,fontFamily:"'DM Mono',monospace",color:T.ink},
  f:{marginBottom:12},
};

// ── Reusable components ────────────────────────────────────────────────────
function NoteModal({note,onClose}){
  if(!note) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={onClose}>
      <div style={{...S.card,maxWidth:420,width:"100%",padding:"20px"}} onClick={e=>e.stopPropagation()}>
        <div style={S.top(T.inkDim)}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:T.inkFaint}}>Note</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.inkFaint,cursor:"pointer",fontSize:22,lineHeight:1,padding:"2px 6px"}}>×</button>
        </div>
        <div style={{fontSize:14,color:T.inkMid,lineHeight:1.7,fontStyle:"italic",whiteSpace:"pre-wrap"}}>{note}</div>
      </div>
    </div>
  );
}
function NoteCell({note}){
  const [open,setOpen]=useState(false);
  if(!note) return <span style={{fontSize:11,color:T.inkFaint}}>—</span>;
  return(<><span className="note-cell" onClick={()=>setOpen(true)} title={note}>{note}</span>{open&&<NoteModal note={note} onClose={()=>setOpen(false)}/>}</>);
}
function Card({accent=T.green,style={},children}){
  return <div style={{...S.card,...style}}><div style={S.top(accent)}/>{children}</div>;
}
function Lbl({c,style={},children}){ return <div style={{...S.lbl,...style,color:c||T.inkFaint}}>{children}</div>; }
function Row({label,val,valColor,last=false}){
  return(
    <div style={{...S.row,borderBottom:last?"none":`1px solid ${T.brd}`}}>
      <span style={S.rl}>{label}</span><span style={{...S.rv,color:valColor||T.ink}}>{val}</span>
    </div>
  );
}
function Field({label,type="number",value,onChange,step,min,max,placeholder,style={}}){
  return(
    <div style={S.f}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={onChange} step={step} min={min} max={max} placeholder={placeholder} style={{...S.inp,...style}}/>
    </div>
  );
}
function FieldSm({label,type="number",value,onChange,min,max,placeholder,step}){
  return(
    <div>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={onChange} min={min} max={max} step={step} placeholder={placeholder} style={S.inpSm}/>
    </div>
  );
}
function SyncBadge({synced,syncing}){
  if(syncing) return <span style={{...S.pill(T.amber),fontSize:9}}>Syncing…</span>;
  if(synced)  return <span style={{...S.pill(T.green),fontSize:9}}>● Live</span>;
  return <span style={{...S.pill(T.red),fontSize:9}}>Offline</span>;
}
function Logo(){
  return(
    <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 0",flexShrink:0}}>
      <div style={{width:30,height:30,borderRadius:7,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🐔</div>
      <div>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:T.green,lineHeight:1}}>ChookGPT</div>
        <div style={{fontSize:8,color:T.inkFaint,letterSpacing:"0.16em",textTransform:"uppercase"}}>The Food Farm</div>
      </div>
    </div>
  );
}
function Spark({pts,color=T.green,H=80,yMin,refLine}){
  if(!pts||pts.length<2) return null;
  const W=340,PL=26,PR=4,PT=4,PB=16,w=W-PL-PR,h=H-PT-PB;
  const ys=pts.map(p=>p.y),lo=yMin!=null?yMin:Math.min(...ys)*0.88,hi=Math.max(...ys)*1.1||1;
  const sx=i=>PL+(i/(pts.length-1))*w,sy=v=>PT+h-((v-lo)/(hi-lo))*h;
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const gid=`sg${Math.random().toString(36).slice(2,7)}`;
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {refLine!=null&&<line x1={PL} x2={PL+w} y1={sy(refLine)} y2={sy(refLine)} stroke={color} strokeWidth="1" strokeDasharray="4 3" opacity="0.4"/>}
      <path d={`${path} L${sx(pts.length-1)},${PT+h} L${PL},${PT+h} Z`} fill={`url(#${gid})`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p,i)=>(<g key={i}><circle cx={sx(i)} cy={sy(p.y)} r="4" fill={color} stroke={T.bg} strokeWidth="1.5"/><text x={sx(i)} y={PT+h+12} textAnchor="middle" fontSize="8" fill={T.inkFaint} fontFamily="DM Mono">{p.label}</text></g>))}
      {[lo,Math.max(...ys)].map((v,i)=>(<text key={i} x={PL-2} y={sy(v)+3} textAnchor="end" fontSize="7.5" fill={T.inkFaint} fontFamily="DM Mono">{Math.round(v)}</text>))}
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({data,setPage,setSub,setActive,openLogModal}){
  const {batches,caravans,eggLog,houses}=data;
  const activeBatches=(batches||[]).filter(b=>!b.archived);
  const sorted=[...(eggLog||[])].sort((a,b)=>a.date.localeCompare(b.date));
  const todayE=sorted[sorted.length-1];
  const todayTrays=todayE?Object.values(todayE.trays||{}).reduce((s,v)=>s+v,0):0;
  const avg7=sorted.slice(-7).reduce((s,e)=>s+Object.values(e.trays||{}).reduce((ss,v)=>ss+v,0),0)/Math.max(sorted.slice(-7).length,1);
  const totalAllTimeIncome=sorted.reduce((s,e)=>{
    const tt=Object.values(e.trays||{}).reduce((ss,v)=>ss+v,0);
    return s+eggIncomeForEntry(tt);
  },0);

  const alerts=[];
  activeBatches.forEach(b=>{
    const ageDays=batchAgeDays(b),mort=calcMortality(b),fd=b[b.currentPhase];
    const usedDays=daysBetween(b.startDate,toDay()),remainDays=Math.max(0,b.cycleDays-usedDays);
    const {days:deplDays}=calcDepletion(b.birds,fd.rateG,fd.tonnes);
    if(mort.pct>5) alerts.push({type:"danger",msg:`${b.name}: mortality ${fmt(mort.pct,1)}% — above 5% threshold`});
    if(deplDays<remainDays) alerts.push({type:"warning",msg:`${b.name}: feed supply short by ${fmt(remainDays-deplDays,0)} days`});
    if(ageDays!=null&&ageDays>=b.cycleDays-7&&ageDays<b.cycleDays) alerts.push({type:"info",msg:`${b.name}: harvest due in ${b.cycleDays-ageDays} days`});
  });
  caravans.forEach(c=>{
    const age=effectiveAgeWeeks(c);
    if(age>=85) alerts.push({type:"danger",msg:`${c.label}: past economic lay rate — plan replacement`});
    else if(age>=75) alerts.push({type:"warning",msg:`${c.label}: approaching retirement (~${Math.round(80-age)}wk left)`});
  });
  const alertColors={danger:T.red,warning:T.amber,info:T.blue};

  return(
    <div className="stack">
      {alerts.length>0&&(
        <Card accent={T.red}>
          <Lbl c={T.red}>Alerts</Lbl>
          {alerts.map((a,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:i<alerts.length-1?`1px solid ${T.brd}`:"none",fontSize:12,color:alertColors[a.type]}}>
              <span style={{flexShrink:0}}>{a.type==="danger"?"⚠":a.type==="warning"?"!":"i"}</span>
              <span>{a.msg}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Quick log */}
      <Card accent={T.blue}>
        <Lbl c={T.blue}>Quick log</Lbl>
        <div className="g2" style={{gap:8}}>
          <button onClick={()=>openLogModal(null,"feed")} style={{...S.btn(T.blue),padding:"16px 12px",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:6,border:`1.5px solid ${T.blue}`}}>
            <span style={{fontSize:22}}>🪣</span>
            <span style={{fontSize:13,fontWeight:700,color:T.blue}}>Log feed</span>
            <span style={{fontSize:10,color:T.inkFaint}}>Meat birds</span>
          </button>
          <button onClick={()=>setPage("eggs")} style={{...S.btn(T.amber),padding:"16px 12px",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:6,border:`1.5px solid ${T.amber}`}}>
            <span style={{fontSize:22}}>🥚</span>
            <span style={{fontSize:13,fontWeight:700,color:T.amber}}>Log eggs</span>
            <span style={{fontSize:10,color:T.inkFaint}}>All caravans</span>
          </button>
        </div>
      </Card>

      {/* Egg income summary */}
      <Card accent={T.amber}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>Eggs today</Lbl>
          <button onClick={()=>setPage("eggs")} style={{...S.btn(T.amber,true),padding:"6px 12px",fontSize:11}}>View →</button>
        </div>
        <div className="g2" style={{gap:8}}>
          {[
            {l:"Trays",v:fmt(todayTrays,1),s:`≈ ${Math.round(todayTrays*EGGS_PER_TRAY)} eggs`,c:T.amber},
            {l:"Est. income",v:fmtC(eggIncomeForEntry(todayTrays)),s:`7d avg ${fmtC(avg7*PRICE_PER_TRAY)}/day`,c:T.green},
          ].map((x,i)=>(
            <div key={i} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:8,padding:"10px"}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:T.inkFaint,marginBottom:3}}>{x.l}</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:700,color:x.c,lineHeight:1}}>{x.v}</div>
              <div style={{fontSize:10,color:T.inkFaint,marginTop:2}}>{x.s}</div>
            </div>
          ))}
        </div>
        {totalAllTimeIncome>0&&(
          <div style={{marginTop:8,fontSize:11,color:T.inkFaint}}>
            All-time income: <b style={{color:T.green}}>{fmtC(totalAllTimeIncome)}</b> from {sorted.length} log days
          </div>
        )}
      </Card>

      {/* Houses overview */}
      <Card accent={T.green}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>Meat bird houses</Lbl>
          <button onClick={()=>{setPage("meat");setSub("calc");}} style={{...S.btn(T.green,true),padding:"6px 12px",fontSize:11}}>Manage →</button>
        </div>
        <div className="stack" style={{gap:8}}>
          {(houses||[]).map(h=>{
            const b=activeBatches.find(x=>x.id===h.batchId);
            const ageDays=b?batchAgeDays(b):null;
            const mort=b?calcMortality(b):null;
            const fcrData=b?calcLiveFCR(b):null;
            return(
              <div key={h.id} style={{background:T.bg,border:`1px solid ${b?T.green:T.brd}`,borderRadius:8,padding:"10px 12px",cursor:b?"pointer":"default"}}
                onClick={()=>{if(b){setActive(b.id);setPage("meat");setSub("calc");}}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:b?5:0}}>
                  <span style={{fontWeight:600,fontSize:13,color:b?T.green:T.inkFaint}}>🏠 {h.label}</span>
                  {b?<span style={S.pill(BREEDS.cornishCross.color)}>{b.name}</span>:<span style={{fontSize:11,color:T.inkFaint,fontStyle:"italic"}}>Empty</span>}
                </div>
                {b&&(
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:T.inkDim}}>
                    <span>{b.birds} birds</span>
                    {ageDays!=null&&<span style={{color:T.amber}}>{Math.floor(ageDays/7)}w {ageDays%7}d old</span>}
                    {mort&&mort.pct>0&&<span style={{color:mort.pct>5?T.red:T.inkFaint}}>Mort: {fmt(mort.pct,1)}%</span>}
                    {fcrData&&<span style={{color:fcrData.fcr<2.6?T.green:T.amber}}>FCR: {fmt(fcrData.fcr,2)}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {activeBatches.filter(b=>!(houses||[]).some(h=>h.batchId===b.id)).map(b=>(
            <div key={b.id} style={{background:T.bg,border:`1px dashed ${T.brd}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}}
              onClick={()=>{setActive(b.id);setPage("meat");setSub("calc");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,fontSize:13,color:T.inkFaint}}>{b.name}</span>
                <span style={{...S.pill(T.inkFaint),fontSize:9}}>no house assigned</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Flock retirement */}
      <Card accent={T.purple}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Lbl style={{marginBottom:0}} c={T.purple}>Flock retirement</Lbl>
          <button onClick={()=>setPage("eggs")} style={{...S.btn(T.purple,true),padding:"6px 12px",fontSize:11}}>View →</button>
        </div>
        {caravans.map(c=>{
          const age=effectiveAgeWeeks(c),rate=isaRate(age);
          const wksLeft=Math.max(0,Math.round(80-age));
          const isOverdue=age>=80,isNear=age>=70;
          const color=isOverdue?T.red:isNear?T.amber:EGG_COLORS[c.id]||T.amber;
          return(
            <div key={c.id} style={{padding:"7px 0",borderBottom:`1px solid ${T.brd}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:EGG_COLORS[c.id]||T.amber,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,color:EGG_COLORS[c.id]||T.amber}}>{c.label}</span>
                  <span style={{fontSize:10,color:T.inkFaint}}>{age}wk · {(rate*100).toFixed(0)}% lay</span>
                </div>
                {isOverdue?<span style={{...S.pill(T.red),fontSize:9}}>Replace now</span>:<span style={{fontSize:10,color}}>{wksLeft}wk to retire</span>}
              </div>
              <div style={{height:4,borderRadius:2,background:T.brd2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,(age/80)*100)}%`,background:color,borderRadius:2}}/>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── Processing Day Summary Modal ──────────────────────────────────────────
function ProcessingSummaryModal({batch,onConfirm,onCancel}){
  const [form,setForm]=useState({processDate:toDay(),birdsProcessed:batch.birds,avgCarcassWeightG:"",condemnedBirds:0,slaughterNotes:"",salePrice:""});
  const mort=calcMortality(batch);
  const fcrData=calcLiveFCR(batch);
  const costData=calcCostPerBirdFull(batch);
  const totalFeedKg=(batch.feedLog||[]).reduce((s,e)=>s+((parseFloat(e.starterBuckets)||0)+(parseFloat(e.growerBuckets)||0)+(parseFloat(e.bucketsGiven)||0))*BUCKET_KG,0);
  const log=(batch.weightLog||[]).sort((a,b)=>a.week-b.week);
  const lastWeight=log.length?log[log.length-1].avgWeightG:null;
  const ageDays=batchAgeDays(batch);
  const carcassKg=parseFloat(form.avgCarcassWeightG)/1000;
  const totalMeatKg=!isNaN(carcassKg)&&carcassKg>0?carcassKg*form.birdsProcessed:null;
  const actualFCR=totalFeedKg>0&&totalMeatKg?totalFeedKg/totalMeatKg:null;
  const revenue=form.salePrice&&totalMeatKg?parseFloat(form.salePrice)*totalMeatKg:null;
  const feedCost=costData.actual*batch.birds;
  const netMargin=revenue&&feedCost?revenue-feedCost:null;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{...S.card,width:"100%",maxWidth:560,borderRadius:"14px 14px 0 0",padding:"20px 16px",paddingBottom:44,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.5)"}}>
        <div style={S.top(T.green)}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:700,color:T.green}}>Processing Day — {batch.name}</div>
          <button onClick={onCancel} style={{background:"none",border:"none",color:T.inkFaint,cursor:"pointer",fontSize:26,lineHeight:1,padding:"2px 6px"}}>×</button>
        </div>

        {/* Cycle recap */}
        <div style={{background:T.surf2,borderRadius:8,padding:"12px",marginBottom:14}}>
          <Lbl>Cycle recap</Lbl>
          <div className="g2" style={{gap:8,marginBottom:10}}>
            {[
              {l:"Arrived",v:fmtDateAUFull(batch.arrivalDate||batch.startDate)},
              {l:"Age at process",v:ageDays!=null?`${Math.floor(ageDays/7)}w ${ageDays%7}d`:"—"},
              {l:"Birds in",v:mort.originalBirds},
              {l:"Deaths",v:`${mort.deaths} (${fmt(mort.pct,1)}%)`},
              {l:"Feed used (logged)",v:totalFeedKg>0?`${fmt(totalFeedKg,1)}kg`:"No feed log"},
              {l:"Last recorded wt",v:lastWeight?`${fmtN(lastWeight)}g`:"—"},
            ].map((x,i)=>(
              <div key={i} style={{padding:"7px 8px",background:T.bg,borderRadius:6,border:`1px solid ${T.brd}`}}>
                <div style={{fontSize:9,color:T.inkFaint,letterSpacing:"0.1em",textTransform:"uppercase"}}>{x.l}</div>
                <div style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:T.inkMid,marginTop:2}}>{x.v}</div>
              </div>
            ))}
          </div>
          {fcrData&&(
            <div style={{padding:"8px 10px",background:T.greenL,borderRadius:6,fontSize:12,color:T.inkDim}}>
              Estimated FCR from logs: <b style={{color:fcrData.fcr<2.6?T.green:T.amber}}>{fmt(fcrData.fcr,2)}</b>
              <span style={{fontSize:10,color:T.inkFaint,marginLeft:6}}>({fcrData.fcr<2?"Excellent":fcrData.fcr<2.6?"Good":fcrData.fcr<3?"Average":"Poor"})</span>
            </div>
          )}
        </div>

        {/* Processing entry */}
        <Lbl>Enter processing data</Lbl>
        <Field label="Processing date" type="date" value={form.processDate} onChange={e=>setForm(f=>({...f,processDate:e.target.value}))}/>
        <div className="g2" style={{marginBottom:12}}>
          <FieldSm label="Birds processed" type="number" min={0} value={form.birdsProcessed} onChange={e=>setForm(f=>({...f,birdsProcessed:+e.target.value}))}/>
          <FieldSm label="Condemned birds" type="number" min={0} value={form.condemnedBirds} onChange={e=>setForm(f=>({...f,condemnedBirds:+e.target.value}))}/>
        </div>
        <div className="g2" style={{marginBottom:12}}>
          <FieldSm label="Avg carcass weight (g)" type="number" min={0} value={form.avgCarcassWeightG} onChange={e=>setForm(f=>({...f,avgCarcassWeightG:e.target.value}))} placeholder="e.g. 2200"/>
          <FieldSm label="Sale price ($/kg)" type="number" min={0} step="0.5" value={form.salePrice} onChange={e=>setForm(f=>({...f,salePrice:e.target.value}))} placeholder="e.g. 12.00"/>
        </div>
        <div style={S.f}>
          <label style={S.label}>Processing notes</label>
          <textarea value={form.slaughterNotes} onChange={e=>setForm(f=>({...f,slaughterNotes:e.target.value}))}
            placeholder="e.g. good conformation, a few condemned for bruising, excellent leg quality..." rows={3}
            style={{...S.inp,resize:"vertical"}}/>
        </div>

        {/* Live outcomes */}
        {(totalMeatKg||actualFCR||revenue)&&(
          <div style={{background:T.greenL,border:`1px solid ${T.green}44`,borderRadius:8,padding:"14px",marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.green,marginBottom:10}}>Processing outcomes</div>
            <div className="g3" style={{gap:8,marginBottom:12}}>
              {[
                {l:"Total meat",v:totalMeatKg?`${fmt(totalMeatKg,1)}kg`:"—",c:T.inkMid},
                {l:"Actual FCR",v:actualFCR?fmt(actualFCR,2):"—",c:actualFCR?(actualFCR<2.6?T.green:T.amber):T.inkFaint},
                {l:"Revenue",v:revenue?fmtC(revenue):"—",c:T.green},
              ].map((x,i)=>(
                <div key={i} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:6,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:T.inkFaint,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{x.l}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:x.c,lineHeight:1}}>{x.v}</div>
                </div>
              ))}
            </div>
            {netMargin!=null&&(
              <div style={{padding:"8px 10px",background:`${netMargin>0?T.green:T.red}18`,border:`1px solid ${netMargin>0?T.green:T.red}44`,borderRadius:6,fontSize:12,color:T.inkDim}}>
                Net margin (revenue minus feed cost): <b style={{color:netMargin>0?T.green:T.red}}>{fmtC(netMargin)}</b>
                <span style={{fontSize:10,color:T.inkFaint,marginLeft:6}}>(feed cost: {fmtC(feedCost)})</span>
              </div>
            )}
            {actualFCR&&(
              <div style={{marginTop:8,fontSize:11,color:T.inkFaint,lineHeight:1.6}}>
                {actualFCR<2&&"Excellent FCR — outstanding result for free-range production."}
                {actualFCR>=2&&actualFCR<2.6&&"Good FCR — within expected range for free-range Cornish Cross."}
                {actualFCR>=2.6&&actualFCR<3&&"Average FCR — review feed rate, stocking density, and water access."}
                {actualFCR>=3&&"Poor FCR — investigate health, feed wastage, and management practices."}
              </div>
            )}
          </div>
        )}
        <button onClick={()=>onConfirm({...form,processingOutcome:{totalMeatKg,actualFCR,revenue,netMargin}})} style={S.btnLg(T.green)}>
          Save & archive batch
        </button>
      </div>
    </div>
  );
}

// ── Feed Hero ──────────────────────────────────────────────────────────────
function FeedHero({batch,phase,onPhaseChange}){
  const bp=BREEDS.cornishCross,fd=batch[phase];
  const {gramsDay,kgDay,bucketsDay}=calcFeed(batch.birds,fd.rateG);
  const morn=batch.doubleFeed?bucketsDay/2:bucketsDay;
  const usedDays=daysBetween(batch.startDate,toDay()),remainDays=Math.max(0,batch.cycleDays-usedDays);
  const bucketsRemaining=(batch.birds*fd.rateG*remainDays)/BUCKET_G;
  const {days:deplDays}=calcDepletion(batch.birds,fd.rateG,fd.tonnes);
  const short=deplDays<remainDays;
  const ageDays=batchAgeDays(batch),mort=calcMortality(batch),fcrData=calcLiveFCR(batch);
  return(
    <Card accent={bp.color}>
      {ageDays!=null&&(
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,padding:"8px 10px",background:`${bp.color}12`,borderRadius:6,border:`1px solid ${bp.color}33`,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:bp.color,lineHeight:1}}>{Math.floor(ageDays/7)}w {ageDays%7}d</span>
          <span style={{fontSize:10,color:T.inkFaint}}>· arrived {fmtDateAUFull(batch.arrivalDate)}</span>
          {mort.pct>0&&<span style={{...S.pill(mort.pct>5?T.red:T.amber),marginLeft:"auto"}}>Mort {fmt(mort.pct,1)}%</span>}
          {fcrData&&<span style={S.pill(fcrData.fcr<2.6?T.green:T.amber)}>FCR {fmt(fcrData.fcr,2)}</span>}
        </div>
      )}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        {["starter","grower"].map(ph=>{
          const phc=ph==="starter"?T.blue:bp.color;
          return(
            <button key={ph} onClick={()=>onPhaseChange(ph)} style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${phase===ph?phc:T.brd2}`,background:phase===ph?`${phc}18`:"transparent",color:phase===ph?phc:T.inkDim,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {ph==="starter"?"Starter":"Grower"}
            </button>
          );
        })}
        <span style={S.pill(bp.color)}>{bp.shortLabel}</span>
        <span style={{...S.pill(T.inkFaint),fontSize:10}}>{batch.birds} birds</span>
      </div>
      <div className="hero-grid" style={{margin:"0 -14px",borderTop:`1px solid ${T.brd}`}}>
        {[
          {label:"Buckets / Day",big:fmt(bucketsDay,1),color:bp.color,sub:batch.doubleFeed?`${fmt(morn,2)} morn + ${fmt(morn,2)} aftn`:"× 12.75 kg",br:true,bb:true},
          {label:"kg / Day",big:fmt(kgDay,1),color:T.inkMid,sub:`${fmtN(gramsDay)}g total`,br:false,bb:true},
          {label:"Buckets Left",big:fmt(bucketsRemaining,1),color:T.amber,sub:`${remainDays}d remaining`,br:true,bb:false},
          {label:"Feed runs out",big:null,color:short?T.red:T.green,br:false,bb:false,custom:(
            <><div style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,color:short?T.red:T.green,lineHeight:1.2,marginBottom:4}}>{addDays(batch.startDate,deplDays)}</div>{short?<span style={{...S.pill(T.red),fontSize:9}}>Short {fmt(remainDays-deplDays,0)}d</span>:<span style={{...S.pill(T.green),fontSize:9}}>Sufficient</span>}</>
          )},
        ].map((cell,i)=>(
          <div key={i} style={{padding:"12px 14px",borderRight:cell.br?`1px solid ${T.brd}`:"none",borderBottom:cell.bb?`1px solid ${T.brd}`:"none"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.inkFaint,marginBottom:5}}>{cell.label}</div>
            {cell.custom||(<><div style={{fontFamily:"'Syne',sans-serif",fontSize:34,fontWeight:800,color:cell.color,lineHeight:1}}>{cell.big}</div><div style={{fontSize:10,color:T.inkFaint,marginTop:3}}>{cell.sub}</div></>)}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Feed Log Card ─────────────────────────────────────────────────────────
function FeedLogCard({active,bp,updA,openLogModal}){
  return(
    <Card accent={T.blue}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <Lbl style={{marginBottom:0}}>Feed log</Lbl>
        <button style={S.btn(T.blue)} onClick={()=>openLogModal(null,"feed")}>+ Log today</button>
      </div>
      {!(active.feedLog||[]).length&&<p style={{color:T.inkFaint,fontSize:12}}>No entries yet. Tap "+ Log today" to record feed given.</p>}
      {!!(active.feedLog||[]).length&&(
        <div className="scroll-x">
          <table style={{minWidth:360}}>
            <thead><tr style={{borderBottom:`1px solid ${T.brd}`}}>
              {["Date","Starter","Grower","g/bird","Notes",""].map(h=>(
                <th key={h} style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:T.inkFaint,paddingBottom:6,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...(active.feedLog||[])].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8).map(e=>{
                const sb=e.starterBuckets!=null?fmt(e.starterBuckets,2):(e.phase==="starter"?fmt(e.bucketsGiven,2):"—");
                const gb=e.growerBuckets!=null?fmt(e.growerBuckets,2):(e.phase==="grower"?fmt(e.bucketsGiven,2):"—");
                return(
                  <tr key={e.id} style={{borderBottom:`1px solid ${T.brd}22`}}>
                    <td style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:T.inkDim,whiteSpace:"nowrap"}}>{fmtDateAU(e.date)}</td>
                    <td style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:T.blue,fontWeight:600}}>{sb}</td>
                    <td style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:bp.color,fontWeight:600}}>{gb}</td>
                    <td style={{fontSize:11,fontFamily:"'DM Mono',monospace"}}>{e.rateG}g</td>
                    <td><NoteCell note={e.notes}/></td>
                    <td><div style={{display:"flex",gap:2}}>
                      <button onClick={()=>openLogModal(e,"feed")} style={{...S.btnIcon,color:T.blue}}>✏️</button>
                      <button onClick={()=>updA({feedLog:(active.feedLog||[]).filter(x=>x.id!==e.id)})} style={{...S.btnIcon,color:T.inkFaint}}>×</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Batch Settings — full-width fields, no overflow ───────────────────────
function BatchSettings({active,updA,updPhase}){
  const bp=BREEDS.cornishCross,phase=active.currentPhase,fd=active[phase];
  return(
    <Card accent={T.inkFaint}>
      <Lbl>Batch settings — {active.name}</Lbl>
      <div style={{marginBottom:10,padding:"8px 10px",background:T.greenL,borderRadius:6,fontSize:11,color:T.inkDim}}>
        <b style={{color:bp.color}}>{bp.label}</b> — {bp.notes}
      </div>
      <Field label="Birds (current)" value={active.birds} onChange={e=>updA({birds:+e.target.value})} min={1}/>
      <div className="g2" style={{marginBottom:12}}>
        <FieldSm label="Arrival date" type="date" value={active.arrivalDate||active.startDate} onChange={e=>updA({arrivalDate:e.target.value})}/>
        <FieldSm label="Cycle start date" type="date" value={active.startDate} onChange={e=>updA({startDate:e.target.value})}/>
      </div>
      <div className="g2" style={{marginBottom:12}}>
        <FieldSm label="Cycle (days)" type="number" value={active.cycleDays} onChange={e=>updA({cycleDays:+e.target.value})} min={1}/>
        <FieldSm label="Grower from day" type="number" value={active.growerStartDay} onChange={e=>updA({growerStartDay:+e.target.value})} min={7} max={28}/>
      </div>
      <div className="g2" style={{marginBottom:12}}>
        <FieldSm label={`${phase==="starter"?"Starter":"Grower"} $/kg`} type="number" step="0.05" value={fd.pricePerKg} onChange={e=>updPhase(phase,{pricePerKg:+e.target.value})} min={0.1}/>
        <FieldSm label="Tonnes on hand" type="number" step="0.5" value={fd.tonnes} onChange={e=>updPhase(phase,{tonnes:+e.target.value})} min={0.1}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px",background:T.greenL,borderRadius:8}}>
        <input type="checkbox" id="doubleFeed" checked={!!active.doubleFeed} onChange={e=>updA({doubleFeed:e.target.checked})} style={{width:20,height:20,accentColor:T.green,cursor:"pointer"}}/>
        <label htmlFor="doubleFeed" style={{fontSize:13,color:T.inkMid,cursor:"pointer",fontWeight:500}}>Double feed (morning + afternoon)</label>
      </div>
      <div style={{fontSize:11,color:T.inkFaint,marginTop:8}}>Bucket = 12.75 kg · Arrival date drives live bird age</div>
    </Card>
  );
}

// ── Houses Panel ──────────────────────────────────────────────────────────
function HousesPanel({houses,batches,onUpdate}){
  const activeBatches=batches.filter(b=>!b.archived);
  const [adding,setAdding]=useState(false),[label,setLabel]=useState("");
  const doAdd=()=>{
    if(!label.trim()) return;
    onUpdate([...houses,{id:`h_${Date.now()}`,label:label.trim(),batchId:null}]);
    setLabel("");setAdding(false);
  };
  return(
    <Card accent={T.green}>
      <Lbl>Mobile houses</Lbl>
      <div className="stack" style={{gap:8,marginBottom:10}}>
        {houses.map(h=>{
          const b=activeBatches.find(x=>x.id===h.batchId);
          const ageDays=b?batchAgeDays(b):null;
          return(
            <div key={h.id} style={{display:"flex",gap:10,alignItems:"center",background:T.bg,border:`1px solid ${b?T.green:T.brd}`,borderRadius:8,padding:"10px 12px",flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:T.ink,flexShrink:0}}>🏠 {h.label}</span>
              <select value={h.batchId||""} onChange={e=>onUpdate(houses.map(x=>x.id===h.id?{...x,batchId:e.target.value||null}:x))}
                style={{...S.inpSm,flex:1,minWidth:90,fontSize:13,padding:"7px 10px"}}>
                <option value="">— Empty —</option>
                {activeBatches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {b&&ageDays!=null&&<span style={{fontSize:10,color:T.amber,flexShrink:0}}>{Math.floor(ageDays/7)}w {ageDays%7}d</span>}
              <button onClick={()=>onUpdate(houses.filter(x=>x.id!==h.id))} style={{...S.btnIcon,color:T.inkFaint,flexShrink:0}}>×</button>
            </div>
          );
        })}
      </div>
      {adding?(
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <input value={label} onChange={e=>setLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAdd()} placeholder="House name..." autoFocus style={{...S.inpSm,flex:1}}/>
          <button onClick={doAdd} style={S.btn(T.green)}>Add</button>
          <button onClick={()=>setAdding(false)} style={S.btn(T.red,true)}>✕</button>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} style={{...S.btn(T.green,true),width:"100%",textAlign:"center"}}>+ Add house</button>
      )}
    </Card>
  );
}

// ── Bird Events ────────────────────────────────────────────────────────────
function BirdEvents({batch,onUpdate}){
  const [type,setType]=useState("death"),[count,setCount]=useState(""),[date,setDate]=useState(toDay()),[notes,setNotes]=useState(""),[editId,setEditId]=useState(null);
  const events=batch.birdEvents||[];
  const sortedEvents=[...events].sort((a,b)=>b.date.localeCompare(a.date));
  const mort=calcMortality(batch);
  const save=()=>{
    if(!count||+count<=0) return;
    if(editId){
      const old=events.find(e=>e.id===editId),diff=+count-(old?.count||0);
      onUpdate({birdEvents:events.map(e=>e.id===editId?{...e,type,count:+count,date,notes}:e),birds:Math.max(0,batch.birds-diff)});
      setEditId(null);setCount("");setDate(toDay());setNotes("");
    } else {
      onUpdate({birdEvents:[...events,{id:`ev_${Date.now()}`,type,count:+count,date,notes}],birds:Math.max(0,batch.birds-+count)});
      setCount("");setNotes("");
    }
  };
  return(
    <Card accent={T.red}>
      <Lbl>Bird count — deaths & removals</Lbl>
      <div className="g3" style={{marginBottom:12}}>
        {[{l:"Current",v:batch.birds,c:T.green},{l:"Deaths",v:mort.deaths,c:mort.deaths>0?T.red:T.inkFaint},{l:"Mortality",v:`${fmt(mort.pct,1)}%`,c:mort.pct>5?T.red:mort.pct>0?T.amber:T.inkFaint}].map((x,i)=>(
          <div key={i} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:8,padding:"10px",textAlign:"center"}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:700,color:x.c,lineHeight:1}}>{x.v}</div>
            <div style={{fontSize:9,color:T.inkFaint,marginTop:3}}>{x.l}</div>
          </div>
        ))}
      </div>
      {mort.pct>5&&<div style={{background:T.redL,border:`1px solid ${T.red}44`,borderRadius:6,padding:"8px 10px",marginBottom:10,fontSize:11,color:T.red}}>⚠ Mortality above 5% — investigate cause</div>}
      {editId&&<div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:6,padding:"8px 10px",marginBottom:10,fontSize:11,color:T.amber}}>Editing entry — <button onClick={()=>{setEditId(null);setCount("");setDate(toDay());setNotes("");}} style={{...S.btnIcon,color:T.amber,fontSize:11,padding:0}}>cancel</button></div>}
      <div className="g2" style={{marginBottom:10}}>
        <div><label style={S.label}>Type</label><select value={type} onChange={e=>setType(e.target.value)} style={{...S.inpSm,width:"100%"}}><option value="death">Death</option><option value="removal">Removal</option></select></div>
        <FieldSm label="Count" type="number" min={1} value={count} onChange={e=>setCount(e.target.value)} placeholder="0"/>
      </div>
      <div style={{marginBottom:10}}><FieldSm label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <div style={{marginBottom:12}}><FieldSm label="Notes" type="text" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. heat stress..."/></div>
      <button onClick={save} style={S.btnLg(T.red)}>{editId?"Update event":"Log Event"}</button>
      {sortedEvents.length>0&&(
        <div style={{maxHeight:160,overflowY:"auto",marginTop:10}}>
          {sortedEvents.map(e=>(
            <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${T.brd}33`}}>
              <span style={S.pill(e.type==="death"?T.red:T.amber)}>{e.type}</span>
              <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:e.type==="death"?T.red:T.amber,fontWeight:600}}>{e.count}</span>
              <span style={{fontSize:11,color:T.inkFaint,flexShrink:0}}>{fmtDateAU(e.date)}</span>
              {e.notes&&<NoteCell note={e.notes}/>}
              <div style={{marginLeft:"auto",display:"flex",gap:4,flexShrink:0}}>
                <button onClick={()=>{setEditId(e.id);setType(e.type);setCount(String(e.count));setDate(e.date);setNotes(e.notes||"");}} style={{...S.btnIcon,color:T.blue}}>✏️</button>
                <button onClick={()=>{const r=events.find(x=>x.id===e.id);onUpdate({birdEvents:events.filter(x=>x.id!==e.id),birds:batch.birds+(r?.count||0)});}} style={{...S.btnIcon,color:T.inkFaint}}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Weight Tracker ─────────────────────────────────────────────────────────
function WeightTracker({batch,onUpdate}){
  const bp=BREEDS.cornishCross,ageDays=batchAgeDays(batch);
  const defaultWk=ageDays!=null?Math.max(1,Math.floor(ageDays/7)):1;
  const [wk,setWk]=useState(defaultWk),[wg,setWg]=useState(""),[notes,setNotes]=useState(""),[editId,setEditId]=useState(null);
  const log=(batch.weightLog||[]).sort((a,b)=>a.week-b.week);
  const {gainPerDay,basedOn}=dynamicDailyGain(batch);
  const fcrData=calcLiveFCR(batch);
  const wPts=log.map(e=>({y:e.avgWeightG,label:`W${e.week}`}));
  const add=()=>{
    if(!wg) return;
    if(editId){
      onUpdate({weightLog:log.map(e=>e.id===editId?{...e,week:+wk,avgWeightG:parseFloat(wg),notes}:e).sort((a,b)=>a.week-b.week)});
      setEditId(null);setWg("");setNotes("");
    } else {
      onUpdate({weightLog:[...log,{id:`w_${Date.now()}`,week:+wk,avgWeightG:parseFloat(wg),notes}].sort((a,b)=>a.week-b.week)});
      setWg("");setNotes("");
    }
  };
  return(
    <div className="stack">
      <Card accent={T.amber}>
        <Lbl>Weekly weights — {batch.name}</Lbl>
        {ageDays!=null&&(
          <div style={{background:T.surf2,borderRadius:6,padding:"7px 10px",marginBottom:10,fontSize:11,color:T.inkFaint}}>
            Birds are <b style={{color:T.amber}}>{Math.floor(ageDays/7)}w {ageDays%7}d</b> old — log this week as <b style={{color:T.amber}}>Week {Math.floor(ageDays/7)}</b>
          </div>
        )}
        {wPts.length>1&&<div style={{marginBottom:12}}><Spark pts={wPts} color={T.amber} yMin={0}/></div>}
        <div style={{background:T.amberL,border:`1px solid ${T.amber}33`,borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:11,color:T.inkDim}}>
          Gain rate: <b style={{color:T.amber}}>{fmtN(gainPerDay)}g/day · {fmtN(gainPerDay*7)}g/wk</b>
          <span style={{fontSize:9,color:T.inkFaint,marginLeft:6}}>({basedOn})</span>
          {fcrData&&<span style={{marginLeft:10}}>FCR: <b style={{color:fcrData.fcr<2.6?T.green:T.amber}}>{fmt(fcrData.fcr,2)}</b></span>}
        </div>
        {editId&&<div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:6,padding:"8px 10px",marginBottom:10,fontSize:11,color:T.amber}}>Editing Wk{wk} — <button onClick={()=>{setEditId(null);setWg("");setNotes("");}} style={{...S.btnIcon,color:T.amber,fontSize:11,padding:0}}>cancel</button></div>}
        <div className="g2" style={{marginBottom:10}}>
          <FieldSm label="Week #" type="number" min={1} max={16} value={wk} onChange={e=>setWk(+e.target.value)}/>
          <FieldSm label="Avg weight (g)" value={wg} onChange={e=>setWg(e.target.value)} placeholder="e.g. 1500"/>
        </div>
        <div style={{marginBottom:10}}><FieldSm label="Notes (optional)" type="text" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional"/></div>
        <button onClick={add} style={S.btnLg(T.amber)}>{editId?"Update entry":"Add Weight Entry"}</button>
        {log.length>0&&(
          <div style={{marginTop:12,maxHeight:200,overflowY:"auto"}}>
            {log.map(e=>{
              const tgt=bp.targetWeights[Math.min(e.week,bp.targetWeights.length-1)];
              const diff=e.avgWeightG-tgt;
              return(
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.brd}22`}}>
                  <span style={{fontSize:12,color:T.inkDim,minWidth:32,flexShrink:0}}>Wk{e.week}</span>
                  <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:T.amber,fontWeight:600}}>{fmtN(e.avgWeightG)}g</span>
                  <span style={{fontSize:11,color:diff>=0?T.green:T.red}}>{diff>=0?"+":""}{fmtN(diff)}g vs base</span>
                  {e.notes&&<NoteCell note={e.notes}/>}
                  <div style={{marginLeft:"auto",display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>{setEditId(e.id);setWk(e.week);setWg(String(e.avgWeightG));setNotes(e.notes||"");}} style={{...S.btnIcon,color:T.blue}}>✏️</button>
                    <button onClick={()=>onUpdate({weightLog:log.filter(x=>x.id!==e.id)})} style={{...S.btnIcon,color:T.inkFaint}}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card accent={T.blue}>
        <Lbl>FCR guide</Lbl>
        <div style={{fontSize:12,color:T.inkDim,lineHeight:1.7,marginBottom:12,padding:"10px",background:T.blueL,borderRadius:6}}>
          <b style={{color:T.inkMid}}>FCR = total feed (kg) ÷ weight gained (kg)</b><br/>Lower is better. Free-range target: 2.0–2.6.
        </div>
        {[["< 2.0","Excellent for free-range",T.green],["2.0–2.6","Good — expected range",T.green],["2.6–3.0","Average — review management",T.amber],["> 3.0","Poor — check health & feed",T.red]].map(([r,l,c])=>(
          <div key={r} style={{padding:"8px 10px",borderRadius:6,marginBottom:6,background:`${c}0e`,border:`1px solid ${c}33`}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:c,marginBottom:2}}>{r}</div>
            <div style={{fontSize:11,color:T.inkDim}}>{l}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Harvest Predictor ─────────────────────────────────────────────────────
function HarvestPredictor({batch,onTargetChange}){
  const bp=BREEDS.cornishCross;
  const target=batch.targetWeightG||3000;
  const pred=predictHarvestDays(batch,target);
  const maintPred=predictMaintenanceDays(batch);
  const dayOfCycle=daysBetween(batch.startDate,toDay());
  const mBuckets=calcFeed(batch.birds,bp.maintenanceFeedG).bucketsDay;
  const {gainPerDay,basedOn}=dynamicDailyGain(batch);
  const todayWeight=Math.round(predictedWeightToday(batch));
  const stdWeight=bp.targetWeights[Math.min(Math.floor(dayOfCycle/7),bp.targetWeights.length-1)];
  const ageDays=batchAgeDays(batch);
  return(
    <div className="stack">
      <Card accent={T.amber}>
        <Lbl>Harvest predictor</Lbl>
        {ageDays!=null&&(
          <div style={{background:T.surf2,borderRadius:6,padding:"7px 10px",marginBottom:10,fontSize:11,color:T.inkFaint}}>
            Birds are <b style={{color:T.amber}}>{Math.floor(ageDays/7)}w {ageDays%7}d</b> old ({ageDays} days)
          </div>
        )}
        <div style={S.f}>
          <label style={S.label}>Target harvest weight (g)</label>
          <input type="number" value={target} min={500} max={6000} step={100} onChange={e=>onTargetChange(+e.target.value)} style={{...S.inp,fontSize:26,fontFamily:"'Syne',sans-serif",fontWeight:700,color:T.amber}}/>
        </div>
        <div style={{background:T.surf2,borderRadius:8,padding:"10px 12px",marginBottom:12,display:"flex",gap:16,alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:T.inkFaint,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>Predicted today</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:700,color:T.amber,lineHeight:1}}>{fmtN(todayWeight)}g</div>
          </div>
          <div style={{fontSize:11,color:T.inkFaint,lineHeight:1.8}}>
            <div>Day {dayOfCycle} of cycle</div>
            <div>Gain: <b style={{color:T.amber}}>{fmtN(gainPerDay*7)}g/wk</b> <span style={{fontSize:9}}>({basedOn})</span></div>
            <div style={{color:todayWeight>=stdWeight?T.green:T.red}}>{todayWeight>=stdWeight?"+":""}{fmtN(todayWeight-stdWeight)}g vs baseline</div>
          </div>
        </div>
        {pred&&(
          <div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:8,padding:"12px",marginBottom:12}}>
            {pred.daysFromNow>0?(
              <>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:36,fontWeight:700,color:T.amber,lineHeight:1}}>{pred.daysFromNow}d</div>
                <div style={{fontSize:12,color:T.inkDim,marginTop:2}}>until target weight ({pred.basedOn})</div>
                <div style={{fontSize:13,color:T.inkMid,marginTop:6}}>Est. harvest: <b style={{color:T.amber}}>{addDays(toDay(),pred.daysFromNow)}</b></div>
              </>
            ):<span style={S.pill(T.green)}>Target weight reached or passed</span>}
          </div>
        )}
        <div style={{background:T.surf2,borderRadius:8,padding:"10px"}}>
          <Row label="Growth rate" val={`${fmtN(gainPerDay)}g/day (${basedOn})`} valColor={T.amber} last/>
        </div>
      </Card>
      <Card accent={T.blue}>
        <Lbl c={T.blue}>Maintenance feed predictor</Lbl>
        <div style={{background:T.blueL,border:`1px solid ${T.blue}44`,borderRadius:8,padding:"12px",marginBottom:12}}>
          {maintPred?.status==="reached"&&<span style={S.pill(T.green)}>Target reached — switch to maintenance now</span>}
          {maintPred?.status==="stalled"&&<><span style={S.pill(T.red)}>Growth stalled</span><div style={{fontSize:12,color:T.inkDim,marginTop:6}}>Check feed rate, health, stocking density.</div></>}
          {maintPred?.status==="predicted"&&(
            <><div style={{fontFamily:"'Syne',sans-serif",fontSize:36,fontWeight:700,color:T.blue,lineHeight:1}}>{maintPred.daysFromNow}d</div>
            <div style={{fontSize:12,color:T.inkDim,marginTop:2}}>until maintenance switch</div>
            <div style={{fontSize:13,color:T.inkMid,marginTop:6}}>Est: <b style={{color:T.blue}}>{maintPred.estimatedDate}</b></div>
            {maintPred.gainPerDay&&<div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>{fmtN(maintPred.gainPerDay)}g/day ({maintPred.basedOn})</div>}</>
          )}
          {!maintPred&&<div style={{fontSize:12,color:T.inkFaint}}>Check start date and settings.</div>}
        </div>
        <Row label="Maintenance rate" val={`${bp.maintenanceFeedG}g/bird/day`} valColor={T.blue}/>
        <Row label="Buckets/day at maintenance" val={fmt(mBuckets,2)} valColor={T.blue} last/>
      </Card>
      <Card accent={bp.color}>
        <Lbl>Baseline growth curve — 12wk at 180g/bird/day</Lbl>
        <div style={{fontSize:11,color:T.inkFaint,marginBottom:10}}>~220g/wk gain. Predictions use your actual logged gain when available — this is the fallback only.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(65px,1fr))",gap:6}}>
          {bp.targetWeights.slice(1).map((w,i)=>(
            <div key={i} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:6,padding:"7px 8px"}}>
              <div style={{fontSize:9,color:T.inkFaint}}>Wk {i+1}</div>
              <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:w>=target?T.amber:T.inkMid,fontWeight:w>=target?700:400}}>{fmtN(w)}g{w>=target?" ←":""}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Layer Feed Entry ──────────────────────────────────────────────────────
function LayerFeedEntry({caravan,updC}){
  const [buckets,setBuckets]=useState(""),[date,setDate]=useState(toDay());
  const feedLog=caravan.feedLog||[];
  const recent=[...feedLog].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const avg7kg=feedLog.filter(e=>daysBetween(e.date,toDay())<=7).reduce((s,e)=>s+(parseFloat(e.buckets)||0)*BUCKET_KG,0);
  const avg7days=Math.min(7,feedLog.filter(e=>daysBetween(e.date,toDay())<=7).length);
  const save=()=>{
    if(!buckets) return;
    updC(caravan.id,{feedLog:[...feedLog,{id:`lf_${Date.now()}`,date,buckets:parseFloat(buckets)}].sort((a,b)=>a.date.localeCompare(b.date))});
    setBuckets("");
  };
  return(
    <div>
      <Lbl style={{marginBottom:8}}>Layer feed log</Lbl>
      <div className="g2" style={{marginBottom:8,gap:8}}>
        <FieldSm label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        <FieldSm label="Buckets" type="number" step="0.5" min={0} value={buckets} onChange={e=>setBuckets(e.target.value)} placeholder="0"/>
      </div>
      <button onClick={save} style={{...S.btn(EGG_COLORS[caravan.id]||T.amber),width:"100%",textAlign:"center",marginBottom:8}}>+ Log feed</button>
      {avg7days>0&&avg7kg>0&&(
        <div style={{fontSize:11,color:T.inkFaint,marginBottom:6}}>
          7-day avg: <b style={{color:EGG_COLORS[caravan.id]||T.amber}}>{fmt(avg7kg/avg7days,1)}kg/day</b>
        </div>
      )}
      {recent.length>0&&(
        <div style={{maxHeight:100,overflowY:"auto"}}>
          {recent.map(e=>(
            <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${T.brd}22`,fontSize:11}}>
              <span style={{color:T.inkFaint}}>{fmtDateAU(e.date)}</span>
              <span style={{color:EGG_COLORS[caravan.id]||T.amber,fontFamily:"'DM Mono',monospace"}}>{fmt(e.buckets,2)} bkt · {fmt(e.buckets*BUCKET_KG,1)}kg</span>
              <button onClick={()=>updC(caravan.id,{feedLog:feedLog.filter(x=>x.id!==e.id)})} style={{...S.btnIcon,color:T.inkFaint,fontSize:11,padding:"0 2px"}}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Egg Module ─────────────────────────────────────────────────────────────
function EggModule({data,setData}){
  const {caravans,eggLog}=data;
  const [eTab,setETab]=useState("log");
  const [visC,setVisC]=useState(caravans.map(c=>c.id));
  const [editEggId,setEditEggId]=useState(null);
  const blank=()=>{
    const e={date:toDay(),notes:""};
    caravans.forEach(c=>{e[`tr_${c.id}`]="";e[`dt_${c.id}`]="";e[`ql_${c.id}`]="";});
    return e;
  };
  const [form,setForm]=useState(blank);
  const sorted=[...(eggLog||[])].sort((a,b)=>a.date.localeCompare(b.date));

  const updC=(id,patch)=>setData(d=>({...d,caravans:d.caravans.map(c=>{
    if(c.id!==id) return c;
    const u={...c,...patch};
    if(patch.ageWeeks!==undefined&&patch.ageWeeks!==c.ageWeeks) u.ageSetDate=toDay();
    return u;
  })}));

  const save=()=>{
    const trays={},deaths={},quality={};
    caravans.forEach(c=>{
      const t=parseFloat(form[`tr_${c.id}`]),d=parseInt(form[`dt_${c.id}`]),q=form[`ql_${c.id}`];
      if(!isNaN(t)&&t>=0) trays[c.id]=t;
      if(!isNaN(d)&&d>0) deaths[c.id]=d;
      if(q) quality[c.id]=q;
    });
    if(editEggId){
      setData(d=>({...d,eggLog:(d.eggLog||[]).map(e=>e.id===editEggId?{...e,trays:{...e.trays,...trays},deaths:{...e.deaths,...deaths},quality:{...e.quality,...quality},notes:form.notes}:e)}));
      setEditEggId(null);
    } else {
      const existing=(eggLog||[]).find(e=>e.date===form.date);
      const newLog=existing
        ?(eggLog||[]).map(e=>e.date===form.date?{...e,trays:{...e.trays,...trays},deaths:{...e.deaths,...deaths},quality:{...e.quality,...quality},notes:form.notes}:e)
        :[...(eggLog||[]),{id:`e_${Date.now()}`,date:form.date,trays,deaths,quality,notes:form.notes}];
      setData(d=>({...d,eggLog:newLog}));
    }
    setForm(blank());
  };

  const startEditEgg=(entry)=>{
    setEditEggId(entry.id);
    const f={date:entry.date,notes:entry.notes||""};
    caravans.forEach(c=>{
      f[`tr_${c.id}`]=(entry.trays||{})[c.id]!=null?String((entry.trays||{})[c.id]):"";
      f[`dt_${c.id}`]=(entry.deaths||{})[c.id]!=null?String((entry.deaths||{})[c.id]):"";
      f[`ql_${c.id}`]=(entry.quality||{})[c.id]||"";
    });
    setForm(f);setETab("log");window.scrollTo({top:0,behavior:"smooth"});
  };

  const todayE=sorted[sorted.length-1];
  const todayTrays=todayE?Object.values(todayE.trays||{}).reduce((s,v)=>s+v,0):0;
  const totalBirds=caravans.reduce((s,c)=>s+c.birds,0);
  const layRate=totalBirds>0?(todayTrays*EGGS_PER_TRAY)/totalBirds:0;
  const avg7=sorted.slice(-7).reduce((s,e)=>s+Object.values(e.trays||{}).reduce((ss,v)=>ss+v,0),0)/Math.max(sorted.slice(-7).length,1);
  const totalIncome=sorted.reduce((s,e)=>{
    const tt=Object.values(e.trays||{}).reduce((ss,v)=>ss+v,0);
    return s+eggIncomeForEntry(tt);
  },0);

  return(
    <div>
      <div className="g2" style={{marginBottom:14,gap:8}}>
        {[
          {l:"Today's trays",v:fmt(todayTrays,1),s:`≈ ${Math.round(todayTrays*EGGS_PER_TRAY)} eggs`,c:T.amber},
          {l:"Today's income",v:fmtC(eggIncomeForEntry(todayTrays)),s:"$30/tray · $14/doz",c:T.green},
          {l:"Lay rate",v:todayTrays>0?`${(layRate*100).toFixed(1)}%`:"-",s:todayTrays>0?`${Math.round(todayTrays*EGGS_PER_TRAY)} eggs`:"no data",c:layRate>0.85?T.green:layRate>0.7?T.amber:T.red},
          {l:"7d avg income",v:fmtC(avg7*PRICE_PER_TRAY),s:"/day",c:T.green},
        ].map((x,i)=>(
          <div key={i} style={{background:T.surf,border:`1px solid ${T.brd}`,borderRadius:8,padding:"11px 10px"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.inkFaint,marginBottom:4}}>{x.l}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:700,color:x.c,lineHeight:1}}>{x.v}</div>
            <div style={{fontSize:10,color:T.inkFaint,marginTop:3}}>{x.s}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        {[["log","Daily Log"],["trends","Trends"],["caravans","Caravans"],["retire","Retirement"],["deaths","Mortality"]].map(([k,v])=>(
          <button key={k} style={S.tab(eTab===k,T.amber)} onClick={()=>setETab(k)}>{v}</button>
        ))}
      </div>

      {eTab==="log"&&(
        <div className="stack">
          <Card accent={T.amber}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Lbl style={{marginBottom:0}}>{editEggId?"Edit entry":"Log egg trays"}</Lbl>
              <button onClick={()=>exportEggCSV(eggLog,caravans)} style={{...S.btn(T.inkFaint,true),padding:"6px 10px",fontSize:10}}>Export CSV</button>
            </div>
            {editEggId&&(
              <div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:11,color:T.amber,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Editing {fmtDateAUFull(form.date)}</span>
                <button onClick={()=>{setEditEggId(null);setForm(blank());}} style={{...S.btnIcon,color:T.amber,fontSize:11,padding:0}}>cancel</button>
              </div>
            )}
            <Field label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
            {caravans.map(c=>(
              <div key={c.id} style={{background:T.bg,borderRadius:8,padding:"12px",border:`1px solid ${T.brd}`,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                  <div style={{width:10,height:10,borderRadius:2,background:EGG_COLORS[c.id],flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:700,color:EGG_COLORS[c.id],textTransform:"uppercase",letterSpacing:"0.06em"}}>{c.label}</span>
                  {c.isPullet&&<span style={{...S.pill(T.blue),fontSize:9}}>pullet</span>}
                  <span style={{fontSize:10,color:T.inkFaint,marginLeft:"auto"}}>{c.birds} birds · {effectiveAgeWeeks(c)}wk</span>
                </div>
                <div className="g3" style={{gap:8}}>
                  <div>
                    <label style={{...S.label,color:T.amber}}>Trays</label>
                    <input type="number" min={0} step={0.5} value={form[`tr_${c.id}`]} onChange={e=>setForm(f=>({...f,[`tr_${c.id}`]:e.target.value}))}
                      style={{...S.inpSm,fontSize:24,fontWeight:700,color:T.amber,fontFamily:"'Syne',sans-serif",textAlign:"center"}} placeholder="0"/>
                  </div>
                  <div>
                    <label style={{...S.label,color:T.red}}>Deaths</label>
                    <input type="number" min={0} value={form[`dt_${c.id}`]} onChange={e=>setForm(f=>({...f,[`dt_${c.id}`]:e.target.value}))}
                      style={{...S.inpSm,fontSize:24,fontWeight:700,color:T.red,fontFamily:"'Syne',sans-serif",textAlign:"center"}} placeholder="0"/>
                  </div>
                  <div>
                    <label style={{...S.label,color:T.inkFaint}}>Quality note</label>
                    <input type="text" value={form[`ql_${c.id}`]} onChange={e=>setForm(f=>({...f,[`ql_${c.id}`]:e.target.value}))}
                      style={{...S.inpSm,fontSize:13}} placeholder="e.g. 2 cracked"/>
                  </div>
                </div>
              </div>
            ))}
            {(()=>{
              const tt=caravans.reduce((s,c)=>s+(parseFloat(form[`tr_${c.id}`])||0),0);
              if(tt<=0) return null;
              return(
                <div style={{background:T.amberL,border:`1px solid ${T.amber}44`,borderRadius:8,padding:"12px",marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:9,color:T.amber,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Today's total</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:700,color:T.amber,lineHeight:1}}>{fmt(tt,1)} trays</div>
                      <div style={{fontSize:10,color:T.inkFaint,marginTop:2}}>≈ {Math.round(tt*EGGS_PER_TRAY)} eggs</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:T.inkFaint,marginBottom:2}}>Est. income</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:700,color:T.green}}>{fmtC(eggIncomeForEntry(tt))}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <Field label="Notes" type="text" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. hot day, low production..."/>
            <button onClick={save} style={S.btnLg(T.amber)}>{editEggId?"Update entry":"Save entry"}</button>
          </Card>

          <Card accent={T.green}>
            <Lbl>Recent entries</Lbl>
            {!sorted.length&&<p style={{color:T.inkFaint,fontSize:12}}>No entries yet.</p>}
            {[...sorted].reverse().slice(0,12).map(e=>{
              const tt=Object.values(e.trays||{}).reduce((s,v)=>s+v,0);
              const deaths=Object.values(e.deaths||{}).reduce((s,v)=>s+v,0);
              return(
                <div key={e.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.brd}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:12,color:T.inkDim,fontFamily:"'DM Mono',monospace"}}>{fmtDateAUFull(e.date)}</span>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,color:T.amber}}>{fmt(tt,1)}<span style={{fontSize:10,color:T.inkFaint,fontWeight:400}}> tr</span></span>
                      <span style={{fontSize:11,color:T.green,fontFamily:"'DM Mono',monospace"}}>{fmtC(eggIncomeForEntry(tt))}</span>
                      {deaths>0&&<span style={{...S.pill(T.red),fontSize:9}}>{deaths}💀</span>}
                      <button onClick={()=>startEditEgg(e)} style={{...S.btnIcon,color:T.blue,fontSize:13}}>✏️</button>
                      <button onClick={()=>setData(d=>({...d,eggLog:(d.eggLog||[]).filter(x=>x.id!==e.id)}))} style={{...S.btnIcon,color:T.inkFaint,fontSize:14}}>×</button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {caravans.map(c=>{
                      const t=(e.trays||{})[c.id];
                      if(t==null) return null;
                      return(
                        <span key={c.id} style={{fontSize:10,color:EGG_COLORS[c.id],background:`${EGG_COLORS[c.id]}18`,padding:"2px 8px",borderRadius:10,border:`1px solid ${EGG_COLORS[c.id]}33`}}>
                          {c.id.toUpperCase()}: {fmt(t,1)}
                          {(e.quality||{})[c.id]&&<span style={{fontSize:9,color:T.inkFaint,marginLeft:3}}>· {(e.quality||{})[c.id]}</span>}
                        </span>
                      );
                    })}
                  </div>
                  {e.notes&&<NoteCell note={e.notes}/>}
                </div>
              );
            })}
            {totalIncome>0&&(
              <div style={{marginTop:10,padding:"8px 10px",background:T.greenL,borderRadius:6,fontSize:12,color:T.inkDim}}>
                All-time income: <b style={{color:T.green}}>{fmtC(totalIncome)}</b>
                <span style={{fontSize:10,color:T.inkFaint,marginLeft:6}}>from {sorted.length} log days</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {eTab==="trends"&&(
        <div className="stack">
          <Card accent={T.amber}>
            <Lbl>Tray production — all caravans</Lbl>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {caravans.map(c=>(
                <button key={c.id} onClick={()=>setVisC(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}
                  style={{...S.btn(EGG_COLORS[c.id],!visC.includes(c.id)),fontSize:11,padding:"6px 12px"}}>{c.label}</button>
              ))}
            </div>
            {sorted.length>=2?(
              <svg viewBox="0 0 340 130" style={{width:"100%",height:"auto",overflow:"visible"}}>
                {(()=>{
                  const W=340,H=130,PL=26,PR=4,PT=4,PB=18,ww=W-PL-PR,hh=H-PT-PB;
                  const allV=sorted.flatMap(e=>visC.map(id=>(e.trays||{})[id]||0));
                  const hi=Math.max(...allV,1)*1.15;
                  const sx=i=>PL+(i/(sorted.length-1))*ww,sy=v=>PT+hh-(v/hi)*hh;
                  return(<>
                    {[0,hi/2,hi].map((v,i)=>(<g key={i}><line x1={PL} x2={PL+ww} y1={sy(v)} y2={sy(v)} stroke={T.brd} strokeWidth="0.7"/><text x={PL-2} y={sy(v)+3} textAnchor="end" fontSize="7.5" fill={T.inkFaint}>{fmt(v,1)}</text></g>))}
                    {visC.map(id=>{
                      const pts=sorted.filter(e=>(e.trays||{})[id]!=null);
                      if(pts.length<2) return null;
                      const line=pts.map((e,ii)=>{const si=sorted.indexOf(e);return`${ii===0?"M":"L"}${sx(si).toFixed(1)},${sy((e.trays||{})[id]||0).toFixed(1)}`;}).join(" ");
                      return(<path key={id} d={line} fill="none" stroke={EGG_COLORS[id]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>);
                    })}
                    {sorted.length<=14&&sorted.map((e,i)=>(<text key={i} x={sx(i)} y={PT+hh+14} textAnchor="middle" fontSize="7.5" fill={T.inkFaint}>{fmtDateAU(e.date)}</text>))}
                  </>);
                })()}
              </svg>
            ):<p style={{color:T.inkFaint,fontSize:12}}>Log at least 2 days to chart.</p>}
          </Card>
          {caravans.filter(c=>visC.includes(c.id)).map(c=>{
            const age=effectiveAgeWeeks(c),expR=isaRate(age),expTrays=(c.birds*expR)/EGGS_PER_TRAY;
            const pts=sorted.filter(e=>(e.trays||{})[c.id]!=null).map(e=>({y:(e.trays||{})[c.id],label:fmtDateAU(e.date)}));
            const latest=pts.slice(-1)[0]?.y;
            const actualRate=latest!=null?(latest*EGGS_PER_TRAY)/c.birds:null;
            return(
              <Card key={c.id} accent={EGG_COLORS[c.id]}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <Lbl c={EGG_COLORS[c.id]} style={{marginBottom:0}}>{c.label} — {c.birds} birds</Lbl>
                  {c.isPullet&&<span style={S.pill(T.blue)}>pullet</span>}
                </div>
                <div style={{display:"flex",gap:14,marginBottom:10,alignItems:"flex-end"}}>
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:700,color:EGG_COLORS[c.id],lineHeight:1}}>{latest!=null?fmt(latest,1):"-"}</div>
                    <div style={{fontSize:9,color:T.inkFaint}}>trays (latest)</div>
                  </div>
                  <div style={{fontSize:12,color:T.inkDim,lineHeight:1.9,paddingBottom:2}}>
                    <div>Age: <b>{age}wk</b></div>
                    <div>Actual: <b style={{color:actualRate!=null?(actualRate>=expR?T.green:T.red):T.inkFaint}}>{actualRate!=null?`${(actualRate*100).toFixed(1)}%`:"—"}</b></div>
                    <div>Expected: <b>{(expR*100).toFixed(0)}%</b> ({fmt(expTrays,1)} trays)</div>
                    {actualRate!=null&&<div style={{color:actualRate>=expR?T.green:T.red,fontWeight:600}}>{actualRate>=expR?"+":""}{((actualRate-expR)*100).toFixed(1)}% vs expected</div>}
                  </div>
                </div>
                {pts.length>1?<Spark pts={pts} color={EGG_COLORS[c.id]} yMin={0} refLine={expTrays}/>:<p style={{fontSize:11,color:T.inkFaint}}>Need 2+ entries to chart.</p>}
              </Card>
            );
          })}
        </div>
      )}

      {eTab==="caravans"&&(
        <div className="stack">
          {caravans.map(c=>{
            const age=effectiveAgeWeeks(c),expR=isaRate(age),expTrays=(c.birds*expR)/EGGS_PER_TRAY;
            return(
              <Card key={c.id} accent={EGG_COLORS[c.id]}>
                <Lbl c={EGG_COLORS[c.id]}>{c.label} — ISA Brown</Lbl>
                <div className="g2">
                  <Field label="Birds" value={c.birds} onChange={e=>updC(c.id,{birds:+e.target.value})} min={1}/>
                  <div style={S.f}>
                    <label style={S.label}>Age (weeks)</label>
                    <input type="number" min={0} value={c.ageWeeks} onChange={e=>updC(c.id,{ageWeeks:+e.target.value})} style={S.inp}/>
                    {c.ageSetDate
                      ?<div style={{fontSize:9,color:T.green,marginTop:4}}>● auto-tracking · now {age}wk</div>
                      :<div style={{fontSize:9,color:T.amber,marginTop:4}}>Set age above to enable auto-tracking</div>}
                  </div>
                </div>
                <Field label="Notes" type="text" value={c.notes} onChange={e=>updC(c.id,{notes:e.target.value})}/>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <input type="checkbox" id={`p_${c.id}`} checked={!!c.isPullet} onChange={e=>updC(c.id,{isPullet:e.target.checked})} style={{width:18,height:18,accentColor:T.green,cursor:"pointer"}}/>
                  <label htmlFor={`p_${c.id}`} style={{fontSize:13,color:T.inkDim,cursor:"pointer"}}>Pullet — building to lay</label>
                </div>
                <div style={{background:T.amberL,borderRadius:6,padding:"10px 12px",fontSize:12,color:T.inkDim,lineHeight:1.9,marginBottom:10}}>
                  <div>Age: <b style={{color:EGG_COLORS[c.id]}}>{age}wk</b> · Lay rate: <b style={{color:EGG_COLORS[c.id]}}>{(expR*100).toFixed(0)}%</b></div>
                  <div>Expected: <b style={{color:EGG_COLORS[c.id]}}>{Math.round(c.birds*expR)} eggs · {fmt(expTrays,1)} trays</b>/day</div>
                  <div>Income/day: <b style={{color:T.green}}>{fmtC(eggIncomeForEntry(expTrays))}</b></div>
                  {c.isPullet&&age<20&&<div style={{color:T.blue}}>Laying starts ~20–22 weeks</div>}
                  {c.isPullet&&age>=20&&age<30&&<div style={{color:T.amber}}>Ramping up to peak lay</div>}
                </div>
                <div style={{borderTop:`1px solid ${T.brd}`,paddingTop:10}}>
                  <LayerFeedEntry caravan={c} updC={updC}/>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {eTab==="retire"&&(
        <div className="stack">
          <Card accent={T.purple}>
            <Lbl c={T.purple}>Flock retirement planner</Lbl>
            <div style={{fontSize:11,color:T.inkFaint,marginBottom:14,lineHeight:1.6}}>
              ISA Browns drop below economic lay rate (~65%) around 80 weeks. Plan flock replacements and cash flow accordingly.
            </div>
            {caravans.map(c=>{
              const age=effectiveAgeWeeks(c),rate=isaRate(age);
              const wksLeft=Math.max(0,Math.round(80-age));
              const retireDate=age<80?addDays(toDay(),wksLeft*7):"Now";
              const isOverdue=age>=80,isNear=age>=70;
              const color=isOverdue?T.red:isNear?T.amber:EGG_COLORS[c.id]||T.amber;
              const expTrays=(c.birds*rate)/EGGS_PER_TRAY;
              return(
                <div key={c.id} style={{background:T.bg,border:`1px solid ${color}44`,borderRadius:8,padding:"12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{width:10,height:10,borderRadius:2,background:EGG_COLORS[c.id]}}/>
                      <span style={{fontSize:13,fontWeight:600,color:EGG_COLORS[c.id]}}>{c.label}</span>
                      <span style={{fontSize:11,color:T.inkFaint}}>{age}wk · {(rate*100).toFixed(0)}% lay</span>
                    </div>
                    {isOverdue?<span style={S.pill(T.red)}>Replace now</span>:isNear?<span style={S.pill(T.amber)}>{wksLeft}wk left</span>:<span style={{fontSize:11,color:color}}>{wksLeft}wk to retire</span>}
                  </div>
                  <div style={{height:6,borderRadius:3,background:T.brd2,overflow:"hidden",marginBottom:8}}>
                    <div style={{height:"100%",width:`${Math.min(100,(age/80)*100)}%`,background:color,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:14,fontSize:11,color:T.inkDim,flexWrap:"wrap"}}>
                    <span>Retire: <b style={{color}}>{retireDate}</b></span>
                    <span>Income/day: <b style={{color:T.green}}>{fmtC(eggIncomeForEntry(expTrays))}</b></span>
                    <span>{c.birds} birds</span>
                  </div>
                  {isOverdue&&(
                    <div style={{marginTop:8,padding:"7px 10px",background:T.redL,borderRadius:6,fontSize:11,color:T.red}}>
                      Revenue declining each week — plan replacement flock now.
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
          <Card accent={T.inkFaint}>
            <Lbl>ISA Brown lay curve reference</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(60px,1fr))",gap:6,marginBottom:8}}>
              {[20,30,40,50,60,70,75,80,85,90].map(w=>(
                <div key={w} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:9,color:T.inkFaint}}>Wk {w}</div>
                  <div style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:isaRate(w)>=ISA_ECONOMIC_THRESHOLD?T.green:T.red,fontWeight:600}}>{(isaRate(w)*100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:T.inkFaint}}>Red = below 65% economic threshold</div>
          </Card>
        </div>
      )}

      {eTab==="deaths"&&(
        <div className="stack">
          <div className="g2">
            {caravans.map(c=>{
              const total=sorted.reduce((s,e)=>s+((e.deaths||{})[c.id]||0),0);
              return(
                <div key={c.id} style={{background:T.surf,border:`1px solid ${T.brd}`,borderRadius:8,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:9,fontWeight:700,color:EGG_COLORS[c.id],letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>{c.label}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:700,color:total>0?T.red:T.green,lineHeight:1}}>{total}</div>
                  <div style={{fontSize:9,color:T.inkFaint,marginTop:2}}>{c.birds} birds</div>
                </div>
              );
            })}
          </div>
          <Card accent={T.red}>
            <Lbl>Death log by date</Lbl>
            {sorted.filter(e=>Object.values(e.deaths||{}).some(v=>v>0)).length===0&&<p style={{color:T.inkFaint,fontSize:12}}>No deaths logged yet.</p>}
            {[...sorted].filter(e=>Object.values(e.deaths||{}).some(v=>v>0)).reverse().map(e=>(
              <div key={e.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.brd}33`}}>
                <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:T.inkDim,marginBottom:6}}>{fmtDateAUFull(e.date)}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {caravans.map(c=>{const d=(e.deaths||{})[c.id];if(!d) return null;return(<span key={c.id} style={{...S.pill(T.red),fontSize:10}}>{c.label}: {d}</span>);})}
                </div>
                {e.notes&&<NoteCell note={e.notes}/>}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── App Root ───────────────────────────────────────────────────────────────
export default function App(){
  const [data,setData]       =useState(loadLocal);
  const [page,setPage]       =useState("dash");
  const [sub,setSub]         =useState("calc");
  const [synced,setSynced]   =useState(false);
  const [syncing,setSyncing] =useState(false);
  const [addingBatch,setAddingBatch]=useState(false);
  const [newName,setNewName] =useState("");
  const [confirmDel,setConfirmDel]=useState(null);
  const [logModal,setLogModal]=useState(false);
  const [logEditEntry,setLogEditEntry]=useState(null);
  const [logEntry,setLogEntry]=useState({date:toDay(),starterBuckets:"",growerBuckets:"",notes:""});
  const [processingBatch,setProcessingBatch]=useState(null);
  const fbReady=useRef(false),fbListening=useRef(false);

  useEffect(()=>{
    if(fbReady.current) return; fbReady.current=true;
    initFB().then(ok=>{
      if(!ok){setSynced(false);return;}
      const r=fbRef(fbDB,"chookgpt");
      fbOnValue(r,snap=>{const val=snap.val();if(val){setData(val);saveLocal(val);setSynced(true);setSyncing(false);}});
      fbListening.current=true;
    });
  },[]);

  useEffect(()=>{
    saveLocal(data);
    if(!fbListening.current) return;
    setSyncing(true);
    fbSet(fbRef(fbDB,"chookgpt"),data).then(()=>{setSynced(true);setSyncing(false);}).catch(()=>{setSynced(false);setSyncing(false);});
  },[data]);

  const active   =data.batches?.find(b=>b.id===data.activeBatchId)||data.batches?.[0];
  const setActive=id=>setData(d=>({...d,activeBatchId:id}));
  const upd =useCallback((id,patch)=>setData(d=>({...d,batches:d.batches.map(b=>b.id===id?{...b,...patch}:b)})),[]);
  const updA=useCallback(patch=>{if(active) upd(active.id,patch);},[active,upd]);
  const updPhase=(ph,patch)=>{if(active) updA({[ph]:{...active[ph],...patch}});};
  const addBatch=()=>{
    const nb=newBatch(newName.trim()||`Batch ${data.batches.length+1}`);
    setData(d=>({...d,batches:[...d.batches,nb],activeBatchId:nb.id}));
    setNewName("");setAddingBatch(false);
  };
  const houses=data.houses||DEFAULT_HOUSES;
  const setHouses=h=>setData(d=>({...d,houses:h}));

  const openLogModal=(entry,_type)=>{
    if(entry&&entry!==true){
      setLogEditEntry(entry);
      setLogEntry({
        date:entry.date,
        starterBuckets:entry.starterBuckets!=null?String(entry.starterBuckets):(entry.phase==="starter"?String(entry.bucketsGiven||""):""),
        growerBuckets: entry.growerBuckets!=null?String(entry.growerBuckets):(entry.phase==="grower"?String(entry.bucketsGiven||""):""),
        notes:entry.notes||""
      });
    } else {
      setLogEditEntry(null);
      setLogEntry({date:toDay(),starterBuckets:"",growerBuckets:"",notes:""});
    }
    setLogModal(true);
  };

  const handleArchive=batchId=>{
    const b=data.batches.find(x=>x.id===batchId);
    if(b) setProcessingBatch(b);
  };
  const confirmProcessing=processData=>{
    if(!processingBatch) return;
    upd(processingBatch.id,{archived:true,processingSummary:processData});
    setProcessingBatch(null);
  };

  if(!active) return <div style={{padding:40,color:T.inkDim}}>Loading ChookGPT…</div>;

  const phase=active.currentPhase,bp=BREEDS.cornishCross,fd=active[phase];
  const {bucketsDay}=calcFeed(active.birds,fd.rateG);
  const activeBatches =(data.batches||[]).filter(b=>!b.archived);
  const archivedBatches=(data.batches||[]).filter(b=>b.archived);
  const sbVal=parseFloat(logEntry.starterBuckets)||0;
  const gbVal=parseFloat(logEntry.growerBuckets)||0;
  const totalBL=sbVal+gbVal;
  const derivedRateG=active.birds>0?Math.round((totalBL*BUCKET_G)/active.birds):0;

  return(
    <div style={S.app}>
      <style>{CSS}</style>

      {/* Top bar */}
      <div style={S.bar}>
        <Logo/>
        <div style={{display:"flex",gap:0,overflowX:"auto",WebkitOverflowScrolling:"touch",marginLeft:8}}>
          {[{k:"dash",label:"Dashboard",c:T.green},{k:"meat",label:"Meat Birds",c:T.green},{k:"eggs",label:"Eggs",c:T.amber}].map(p=>(
            <button key={p.k} style={S.tab(page===p.k,p.c)} onClick={()=>setPage(p.k)}>{p.label}</button>
          ))}
        </div>
        <div style={{marginLeft:8,flexShrink:0}}><SyncBadge synced={synced} syncing={syncing}/></div>
      </div>

      <div style={S.body}>

        {/* ── DASHBOARD ── */}
        {page==="dash"&&(
          <div>
            <div style={{marginBottom:14}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:T.green,lineHeight:1}}>Farm Dashboard</div>
              <div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>The Food Farm · {fmtDateAUFull(toDay())}</div>
            </div>
            <Dashboard data={data} setPage={setPage} setSub={setSub} setActive={setActive} openLogModal={openLogModal}/>
          </div>
        )}

        {/* ── MEAT BIRDS ── */}
        {page==="meat"&&(
          <div>
            <div style={{marginBottom:12}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:T.green,lineHeight:1}}>Meat Bird Manager</div>
              <div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>The Food Farm</div>
            </div>
            <div className="tabs">
              {[["calc","Calculator"],["harvest","Harvest"],["weights","Weights"],["history","History"]].map(([k,v])=>(
                <button key={k} style={S.tab(sub===k)} onClick={()=>setSub(k)}>{v}</button>
              ))}
            </div>

            {/* Batch selector */}
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:T.inkFaint,flexShrink:0}}>Batch:</span>
              {activeBatches.map(b=>{
                const inHouse=houses.find(h=>h.batchId===b.id);
                return(
                  <button key={b.id}
                    style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${b.id===active.id?bp.color:T.brd}`,background:b.id===active.id?`${bp.color}18`:"transparent",color:b.id===active.id?bp.color:T.inkDim,fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}
                    onClick={()=>setActive(b.id)}>
                    {b.name}{inHouse&&<span style={{fontSize:9,color:T.inkFaint,marginLeft:4}}>🏠{inHouse.label.replace("House ","")}</span>}
                  </button>
                );
              })}
              {addingBatch?(
                <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                  <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addBatch()} placeholder="Name..." autoFocus style={{...S.inpSm,width:110}}/>
                  <button onClick={addBatch} style={S.btn(T.green)}>Add</button>
                  <button onClick={()=>setAddingBatch(false)} style={S.btn(T.red,true)}>✕</button>
                </div>
              ):(
                <button onClick={()=>setAddingBatch(true)} style={{padding:"7px 12px",borderRadius:20,border:`1.5px dashed ${T.brd}`,background:"transparent",color:T.inkFaint,fontSize:11,cursor:"pointer",flexShrink:0}}>+ New</button>
              )}
            </div>

            {sub==="calc"&&(
              <div className="stack">
                <FeedHero batch={active} phase={phase} onPhaseChange={ph=>updA({currentPhase:ph})}/>
                <FeedLogCard active={active} bp={bp} updA={updA} openLogModal={openLogModal}/>

                {/* Economics card */}
                <Card accent={T.green}>
                  <Lbl>Economics — {active.name}</Lbl>
                  {(()=>{
                    const cost=calcCostPerBirdFull(active);
                    const fcrData=calcLiveFCR(active);
                    return(
                      <>
                        <div className="g2" style={{gap:8,marginBottom:12}}>
                          <div style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:8,padding:"12px"}}>
                            <div style={{fontSize:9,color:T.inkFaint,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Est. cost/bird</div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:700,color:T.green,lineHeight:1}}>{fmtC(cost.total)}</div>
                            <div style={{fontSize:10,color:T.inkFaint,marginTop:2}}>feed cost</div>
                          </div>
                          <div style={{background:T.bg,border:`1px solid ${fcrData?(fcrData.fcr<2.6?T.green:T.amber):T.brd}33`,borderRadius:8,padding:"12px"}}>
                            <div style={{fontSize:9,color:T.inkFaint,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Live FCR</div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:700,color:fcrData?(fcrData.fcr<2.6?T.green:T.amber):T.inkFaint,lineHeight:1}}>{fcrData?fmt(fcrData.fcr,2):"—"}</div>
                            <div style={{fontSize:10,color:T.inkFaint,marginTop:2}}>{fcrData?`${fmt(fcrData.totalFeedKg,1)}kg ÷ ${fmt(fcrData.totalGainKg,1)}kg`:"log feed + weights to calculate"}</div>
                          </div>
                        </div>
                        <div style={{background:T.surf2,borderRadius:8,padding:"10px"}}>
                          <Row label="Actual feed used" val={`${fmt(cost.actualKg,1)}kg — ${fmtC(cost.actual)}/bird`} valColor={T.green}/>
                          <Row label="Predicted remaining" val={`${fmt(cost.predictedKgRemaining,1)}kg — ${fmtC(cost.predicted)}/bird`} valColor={T.amber}/>
                          <Row label="Feed rate" val={`${fd.rateG}g/bird/day @ ${fmtC(fd.pricePerKg)}/kg`} last/>
                        </div>
                      </>
                    );
                  })()}
                </Card>

                {/* Feed rate */}
                <Card accent={bp.color}>
                  <Lbl>{phase==="starter"?"Starter Crumble":"Grower Pellet"} — rate per bird</Lbl>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:14}}>
                    <input type="number" min={0} max={phase==="starter"?130:340} value={fd.rateG}
                      onChange={e=>updPhase(phase,{rateG:+e.target.value})}
                      style={{...S.inp,fontSize:42,width:110,padding:"2px 6px",fontFamily:"'Syne',sans-serif",fontWeight:800,color:bp.color,background:"transparent",border:"none",borderBottom:`2px solid ${bp.color}`,borderRadius:0}}/>
                    <span style={{fontSize:12,color:T.inkFaint}}>g/bird/day</span>
                  </div>
                  <input type="range" min={0} max={phase==="starter"?130:340} step={1} value={fd.rateG}
                    onChange={e=>updPhase(phase,{rateG:+e.target.value})} style={{width:"100%",marginBottom:8}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.inkFaint,marginBottom:10}}>
                    <span>{phase==="starter"?40:160}g min</span>
                    <span style={{color:bp.color}}>{phase==="starter"?65:220}g target</span>
                    <span>{phase==="starter"?100:300}g max</span>
                  </div>
                </Card>

                <BatchSettings active={active} updA={updA} updPhase={updPhase}/>
                <HousesPanel houses={houses} batches={data.batches} onUpdate={setHouses}/>
                <BirdEvents batch={active} onUpdate={patch=>updA(patch)}/>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button style={S.btn(T.green)} onClick={()=>exportBatchCSV(active)}>Export CSV</button>
                  <button style={S.btn(T.amber,true)} onClick={()=>handleArchive(active.id)}>Archive batch</button>
                  <button style={S.btn(T.red,true)} onClick={()=>setConfirmDel(active.id)}>Delete</button>
                </div>
                {confirmDel===active.id&&(
                  <div style={{padding:"12px",background:T.redL,border:`1px solid ${T.red}44`,borderRadius:8}}>
                    <div style={{fontSize:13,color:T.red,marginBottom:10}}>Delete <b>{active.name}</b>? This cannot be undone.</div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={S.btn(T.red)} onClick={()=>{setData(d=>({...d,batches:d.batches.filter(b=>b.id!==active.id),activeBatchId:d.batches.find(b=>b.id!==active.id)?.id||null}));setConfirmDel(null);}}>Confirm delete</button>
                      <button style={S.btn(T.inkFaint,true)} onClick={()=>setConfirmDel(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sub==="harvest"&&<HarvestPredictor batch={active} onTargetChange={v=>updA({targetWeightG:v})}/>}
            {sub==="weights"&&<WeightTracker batch={active} onUpdate={patch=>updA(patch)}/>}

            {sub==="history"&&(
              <div className="stack">
                {activeBatches.length>0&&(
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:T.green,marginBottom:10}}>Active</div>
                    <div className="stack">
                      {activeBatches.map(b=>{
                        const bfd=b[b.currentPhase];
                        const {bucketsDay:bd}=calcFeed(b.birds,bfd.rateG);
                        const wPts=(b.weightLog||[]).map(e=>({y:e.avgWeightG,label:`W${e.week}`}));
                        const cost=calcCostPerBirdFull(b);
                        const fcrD=calcLiveFCR(b);
                        const mort=calcMortality(b);
                        const ageDays=batchAgeDays(b);
                        const inHouse=houses.find(h=>h.batchId===b.id);
                        return(
                          <div key={b.id} style={{...S.card,cursor:"pointer"}} onClick={()=>{setActive(b.id);setSub("calc");}}>
                            <div style={S.top(bp.color)}/>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                              <span style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,color:bp.color}}>{b.name}</span>
                              <div style={{display:"flex",gap:4}}>
                                {inHouse&&<span style={{...S.pill(T.green),fontSize:9}}>🏠{inHouse.label}</span>}
                              </div>
                            </div>
                            <div style={{fontSize:10,color:T.inkFaint,marginBottom:8}}>
                              {fmtDateAUFull(b.startDate)} · {b.birds} birds
                              {ageDays!=null&&<span style={{color:T.amber,marginLeft:6}}>· {Math.floor(ageDays/7)}w {ageDays%7}d old</span>}
                            </div>
                            <div className="g2" style={{gap:6,marginBottom:8}}>
                              {[
                                ["FCR",fcrD?fmt(fcrD.fcr,2):"—",fcrD?(fcrD.fcr<2.6?T.green:T.amber):T.inkFaint],
                                ["Mortality",`${fmt(mort.pct,1)}%`,mort.pct>5?T.red:T.inkFaint],
                                ["Cost/bird",fmtC(cost.total),T.green],
                                ["Buckets/day",fmt(bd,2),T.inkMid],
                              ].map(([l,v,c])=>(
                                <div key={l} style={{background:T.bg,border:`1px solid ${T.brd}`,borderRadius:6,padding:"6px 8px"}}>
                                  <div style={{fontSize:9,color:T.inkFaint,textTransform:"uppercase",letterSpacing:"0.1em"}}>{l}</div>
                                  <div style={{fontSize:14,fontFamily:"'DM Mono',monospace",color:c,fontWeight:600}}>{v}</div>
                                </div>
                              ))}
                            </div>
                            {wPts.length>1&&<Spark pts={wPts} color={T.amber} yMin={0}/>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {archivedBatches.length>0&&(
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:T.inkFaint,marginBottom:10}}>Archived</div>
                    <div className="stack">
                      {archivedBatches.map(b=>{
                        const wPts=(b.weightLog||[]).map(e=>({y:e.avgWeightG,label:`W${e.week}`}));
                        const ps=b.processingSummary;
                        return(
                          <div key={b.id} style={S.card}>
                            <div style={S.top(T.inkFaint)}/>
                            <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:T.inkDim,marginBottom:4}}>{b.name}</div>
                            <div style={{fontSize:10,color:T.inkFaint}}>{fmtDateAUFull(b.startDate)} · {b.birds} birds</div>
                            {ps&&(
                              <div style={{marginTop:8,background:T.surf2,borderRadius:6,padding:"10px 12px",fontSize:11,color:T.inkDim,lineHeight:2}}>
                                <div>Processed: <b style={{color:T.inkMid}}>{fmtDateAUFull(ps.processDate)}</b> · {ps.birdsProcessed} birds</div>
                                {ps.avgCarcassWeightG&&<div>Avg carcass: <b style={{color:T.inkMid}}>{ps.avgCarcassWeightG}g</b>{ps.condemnedBirds>0&&<span style={{color:T.red,marginLeft:6}}>{ps.condemnedBirds} condemned</span>}</div>}
                                {ps.processingOutcome?.actualFCR&&<div>Actual FCR: <b style={{color:ps.processingOutcome.actualFCR<2.6?T.green:T.amber}}>{fmt(ps.processingOutcome.actualFCR,2)}</b></div>}
                                {ps.processingOutcome?.revenue&&<div>Revenue: <b style={{color:T.green}}>{fmtC(ps.processingOutcome.revenue)}</b>{ps.processingOutcome?.netMargin!=null&&<span style={{color:T.inkFaint,marginLeft:6}}>net {fmtC(ps.processingOutcome.netMargin)}</span>}</div>}
                                {ps.slaughterNotes&&<div style={{color:T.inkFaint,fontStyle:"italic",marginTop:2}}>{ps.slaughterNotes}</div>}
                              </div>
                            )}
                            {wPts.length>1&&<div style={{marginTop:8}}><Spark pts={wPts} color={T.inkFaint} yMin={0}/></div>}
                            <button onClick={()=>exportBatchCSV(b)} style={{...S.btn(T.inkFaint,true),marginTop:8,fontSize:11,padding:"6px 12px"}}>Export CSV</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── EGGS ── */}
        {page==="eggs"&&(
          <div>
            <div style={{marginBottom:14}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:T.amber,lineHeight:1}}>Egg Layer Tracker</div>
              <div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>The Food Farm · ISA Brown · Caravans A–E</div>
            </div>
            <EggModule data={data} setData={setData}/>
          </div>
        )}
      </div>

      {/* ── Feed log modal ── */}
      {logModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{...S.card,width:"100%",maxWidth:560,borderRadius:"14px 14px 0 0",padding:"20px 16px",paddingBottom:40,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.5)"}}>
            <div style={S.top(T.blue)}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:700,color:T.blue}}>
                {logEditEntry?"Edit Feed Entry":"Log Feed"}
              </div>
              <button onClick={()=>setLogModal(false)} style={{background:"none",border:"none",color:T.inkFaint,cursor:"pointer",fontSize:26,lineHeight:1,padding:"2px 6px"}}>×</button>
            </div>

            {/* Batch picker */}
            <div style={{marginBottom:12}}>
              <label style={S.label}>Batch</label>
              <select value={active.id} onChange={e=>setActive(e.target.value)} style={{...S.inp,fontSize:15}}>
                {activeBatches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.birds} birds)</option>)}
              </select>
            </div>

            {logEditEntry&&<div style={{background:T.blueL,border:`1px solid ${T.blue}44`,borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:11,color:T.blue}}>Editing entry for {fmtDateAUFull(logEditEntry.date)}</div>}
            <Field label="Date" type="date" value={logEntry.date} onChange={e=>setLogEntry(l=>({...l,date:e.target.value}))}/>

            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.inkFaint,marginBottom:8}}>Buckets given today</div>
              <div className="g2" style={{gap:10}}>
                <div style={{background:T.blueL,border:`1px solid ${T.blue}33`,borderRadius:8,padding:"12px"}}>
                  <label style={{...S.label,color:T.blue}}>Starter</label>
                  <input type="number" step="0.5" min={0} value={logEntry.starterBuckets} onChange={e=>setLogEntry(l=>({...l,starterBuckets:e.target.value}))} placeholder="0"
                    style={{...S.inp,fontSize:36,fontFamily:"'Syne',sans-serif",fontWeight:700,color:T.blue,textAlign:"center",padding:"8px"}}/>
                  {sbVal>0&&<div style={{fontSize:10,color:T.blue,marginTop:4,textAlign:"center"}}>{fmt(sbVal*BUCKET_KG,1)}kg</div>}
                </div>
                <div style={{background:`${bp.color}12`,border:`1px solid ${bp.color}33`,borderRadius:8,padding:"12px"}}>
                  <label style={{...S.label,color:bp.color}}>Grower</label>
                  <input type="number" step="0.5" min={0} value={logEntry.growerBuckets} onChange={e=>setLogEntry(l=>({...l,growerBuckets:e.target.value}))} placeholder="0"
                    style={{...S.inp,fontSize:36,fontFamily:"'Syne',sans-serif",fontWeight:700,color:bp.color,textAlign:"center",padding:"8px"}}/>
                  {gbVal>0&&<div style={{fontSize:10,color:bp.color,marginTop:4,textAlign:"center"}}>{fmt(gbVal*BUCKET_KG,1)}kg</div>}
                </div>
              </div>
              <div style={{textAlign:"center",fontSize:11,color:T.inkFaint,marginTop:6}}>
                Suggested: <b style={{color:T.blue}}>{fmt(bucketsDay,2)} buckets</b> ({fmt(bucketsDay*BUCKET_KG,1)}kg)
              </div>
            </div>
            {totalBL>0&&(
              <div style={{background:T.blueL,border:`1px solid ${T.blue}44`,borderRadius:8,padding:"12px",marginBottom:12}}>
                <div className="g3" style={{textAlign:"center"}}>
                  {[["Total",fmt(totalBL,2)+" bkt"],["kg total",fmt(totalBL*BUCKET_KG,1)+"kg"],["g/bird",fmtN(derivedRateG)+"g"]].map(([l,v],i)=>(
                    <div key={i}>
                      <div style={{fontSize:9,color:T.inkFaint,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{l}</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,color:T.blue}}>{v}</div>
                    </div>
                  ))}
                </div>
                {sbVal>0&&gbVal>0&&<div style={{marginTop:8,textAlign:"center",fontSize:11,color:T.inkFaint}}>Mixed: <span style={{color:T.blue}}>{fmt(sbVal,2)} starter</span> + <span style={{color:bp.color}}>{fmt(gbVal,2)} grower</span></div>}
              </div>
            )}
            <Field label="Notes" type="text" value={logEntry.notes} placeholder="e.g. birds eating well, transition mix..." onChange={e=>setLogEntry(l=>({...l,notes:e.target.value}))}/>
            <button onClick={()=>{
              if(totalBL<=0) return;
              const entry={
                id:logEditEntry?.id||`fl_${Date.now()}`,
                date:logEntry.date,
                starterBuckets:sbVal||null,
                growerBuckets:gbVal||null,
                bucketsGiven:totalBL,
                rateG:derivedRateG,
                notes:logEntry.notes,
                birds:active.birds,
                phase:sbVal>0&&gbVal>0?"mixed":sbVal>0?"starter":"grower",
              };
              if(logEditEntry){
                updA({feedLog:(active.feedLog||[]).map(e=>e.id===logEditEntry.id?entry:e)});
              } else {
                updA({feedLog:[...(active.feedLog||[]),entry].sort((a,b)=>a.date.localeCompare(b.date))});
              }
              setLogModal(false);setLogEditEntry(null);setLogEntry({date:toDay(),starterBuckets:"",growerBuckets:"",notes:""});
            }} style={S.btnLg(T.blue)}>{logEditEntry?"Update Entry":"Save Feed Entry"}</button>
          </div>
        </div>
      )}

      {/* ── Processing summary modal ── */}
      {processingBatch&&(
        <ProcessingSummaryModal
          batch={processingBatch}
          onConfirm={confirmProcessing}
          onCancel={()=>setProcessingBatch(null)}
        />
      )}
    </div>
  );
}