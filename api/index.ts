import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// Load seeded data
const dataPath = path.join(__dirname,'data','hospital.json');
if(!fs.existsSync(dataPath)){
  console.error('❌ Run "npm run seed" first'); process.exit(1);
}
const db: any = JSON.parse(fs.readFileSync(dataPath,'utf-8'));

// ─── SSE Clients ─────────────────────────────────────────────────
const sseClients: Map<string, express.Response[]> = new Map();

function broadcast(unitId: string, event: object) {
  const clients = sseClients.get(unitId) || [];
  const msg = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(res => { try { res.write(msg); } catch{} });
}

function broadcastAll(event: object) {
  db.units.forEach((u: any) => broadcast(u.id, event));
}

// ─── SSE endpoint ─────────────────────────────────────────────────
app.get('/stream', (req, res) => {
  const unitId = (req.query.unit_id as string) || 'unit-1';
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.flushHeaders();

  if(!sseClients.has(unitId)) sseClients.set(unitId,[]);
  sseClients.get(unitId)!.push(res);

  // Initial heartbeat
  res.write(`data: ${JSON.stringify({type:'HEARTBEAT',payload:{server_time:new Date().toISOString()}})}\n\n`);

  req.on('close',()=>{
    const clients = sseClients.get(unitId)||[];
    sseClients.set(unitId, clients.filter(c=>c!==res));
  });
});

// ─── Heartbeat every 8s ───────────────────────────────────────────
setInterval(()=>{
  broadcastAll({type:'HEARTBEAT',payload:{server_time:new Date().toISOString()}});
},8000);

// ─── Simulate random events every 3–10s ──────────────────────────
function randomEvent() {
  const units: any[] = db.units;
  const unit: any = units[Math.floor(Math.random()*units.length)];
  const unitBeds: any[] = db.beds.filter((b:any)=>b.unit_id===unit.id);
  const unitPatients: any[] = db.patients.filter((p:any)=>p.unit_id===unit.id);
  if(!unitBeds.length||!unitPatients.length) return;

  const roll = Math.random();

  if(roll<0.3) {
    // BED_STATUS_CHANGED
    const bed: any = unitBeds[Math.floor(Math.random()*unitBeds.length)];
    const newStatus = ['available','occupied','cleaning','maintenance'][Math.floor(Math.random()*4)];
    bed.status = newStatus;
    broadcast(unit.id,{type:'BED_STATUS_CHANGED',payload:{bed_id:bed.id,new_status:newStatus,patient_id:bed.patient_id}});
  } else if(roll<0.5) {
    // ALERT_FIRED
    const pat: any = unitPatients[Math.floor(Math.random()*unitPatients.length)];
    const alert = {
      id:`alert-live-${uuidv4()}`, unit_id:unit.id, patient_id:pat.id,
      alert_type:['fall_risk','deterioration','critical_lab'][Math.floor(Math.random()*3)],
      severity:['critical','high','medium'][Math.floor(Math.random()*3)],
      message:`Patient ${pat.last_name}: Alert condition detected`,
      fired_at:new Date().toISOString(), acknowledged_by:null, acknowledged_at:null, auto_resolves_at:null
    };
    db.alerts.push(alert);
    broadcast(unit.id,{type:'ALERT_FIRED',payload:alert});
  } else if(roll<0.65) {
    // TELEMETRY_SPIKE
    const pat: any = unitPatients[Math.floor(Math.random()*unitPatients.length)];
    const vitals = ['hr','sbp','spo2','temp'];
    const vital = vitals[Math.floor(Math.random()*vitals.length)];
    broadcast(unit.id,{type:'TELEMETRY_SPIKE',payload:{patient_id:pat.id,vital,value:Math.random()*100+50,threshold:95}});
  } else if(roll<0.75) {
    // STAFF_UPDATED
    const unitStaff: any[] = db.staff.filter((s:any)=>s.unit_id===unit.id);
    if(unitStaff.length) {
      const member = unitStaff[Math.floor(Math.random()*unitStaff.length)];
      member.patient_ratio = +(Math.random()*6+1).toFixed(1);
      broadcast(unit.id,{type:'STAFF_UPDATED',payload:member});
    }
  }
}

setInterval(randomEvent, 3000 + Math.random()*7000);
setInterval(randomEvent, 5000 + Math.random()*5000);

// ─── REST Endpoints ───────────────────────────────────────────────

app.get('/api/v1/units',(req,res)=>{
  res.json({data:db.units});
});

app.get('/api/v1/units/:unitId/census',(req,res)=>{
  const {unitId}=req.params;
  const beds=db.beds.filter((b:any)=>b.unit_id===unitId);
  const unit=db.units.find((u:any)=>u.id===unitId);
  if(!unit) return res.status(404).json({error:'Unit not found'});
  const occupied=beds.filter((b:any)=>b.status==='occupied').length;
  const available=beds.filter((b:any)=>b.status==='available').length;
  res.json({beds,summary:{unit_id:unitId,total_beds:unit.total_beds,occupied,available,cleaning:beds.filter((b:any)=>b.status==='cleaning').length,maintenance:beds.filter((b:any)=>b.status==='maintenance').length,blocked:beds.filter((b:any)=>b.status==='blocked').length,occupancy_pct:+(occupied/unit.total_beds*100).toFixed(1)}});
});

app.get('/api/v1/patients',(req,res)=>{
  let patients: any[] = [...db.patients];
  const {unit_id,status,acuity,search,sort_by,sort_dir,page='1',limit='100'}=req.query as any;
  if(unit_id) patients=patients.filter(p=>p.unit_id===unit_id);
  if(status) patients=patients.filter(p=>p.status===status);
  if(acuity) patients=patients.filter(p=>p.acuity===parseInt(acuity));
  if(search) {
    const q=search.toLowerCase();
    patients=patients.filter(p=>`${p.first_name} ${p.last_name} ${p.mrn} ${p.chief_complaint} ${p.admitting_dx}`.toLowerCase().includes(q));
  }
  if(sort_by) {
    const dir=sort_dir==='desc'?-1:1;
    patients.sort((a,b)=>{
      if(sort_by==='name') return dir*(a.last_name.localeCompare(b.last_name));
      if(sort_by==='acuity') return dir*(a.acuity-b.acuity);
      if(sort_by==='los') return dir*(a.los_hours-b.los_hours);
      return 0;
    });
  }
  const total=patients.length, p=parseInt(page), l=parseInt(limit);
  const sliced=patients.slice((p-1)*l,p*l);
  res.json({data:sliced,meta:{total,page:p,pages:Math.ceil(total/l)}});
});

app.get('/api/v1/patients/:id',(req,res)=>{
  const p=db.patients.find((p:any)=>p.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  res.json(p);
});

app.post('/api/v1/patients/:id/admit',(req,res)=>{
  const p=db.patients.find((p:any)=>p.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  // 15% conflict simulation
  if(Math.random()<0.15) {
    return res.status(409).json({error:'conflict',current_etag:p.etag,current_state:p});
  }
  const ifMatch=req.headers['if-match'];
  if(ifMatch && ifMatch!==p.etag) {
    return res.status(409).json({error:'conflict',current_etag:p.etag,current_state:p});
  }
  Object.assign(p,req.body,{status:'admitted',etag:uuidv4()});
  const bed=db.beds.find((b:any)=>b.id===req.body.bed_id);
  if(bed){bed.status='occupied';bed.patient_id=p.id;}
  broadcast(p.unit_id,{type:'PATIENT_ADMITTED',payload:p});
  res.json({patient:p,etag:p.etag});
});

app.post('/api/v1/patients/:id/discharge',(req,res)=>{
  const p=db.patients.find((p:any)=>p.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  if(Math.random()<0.15) return res.status(409).json({error:'conflict',current_etag:p.etag,current_state:p});
  const bed=db.beds.find((b:any)=>b.id===p.bed_id);
  if(bed){bed.status='cleaning';bed.patient_id=null;}
  const ts=new Date().toISOString();
  broadcast(p.unit_id,{type:'PATIENT_DISCHARGED',payload:{patient_id:p.id,bed_id:p.bed_id,timestamp:ts}});
  p.status='discharging'; p.etag=uuidv4();
  res.json({ok:true});
});

app.post('/api/v1/patients/:id/transfer',(req,res)=>{
  const p=db.patients.find((p:any)=>p.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  if(Math.random()<0.15) return res.status(409).json({error:'conflict',current_etag:p.etag,current_state:p});
  const fromBed=p.bed_id, fromUnit=p.unit_id;
  const oldBed=db.beds.find((b:any)=>b.id===fromBed);
  if(oldBed){oldBed.status='cleaning';oldBed.patient_id=null;}
  const newBed=db.beds.find((b:any)=>b.id===req.body.target_bed_id);
  if(newBed){newBed.status='occupied';newBed.patient_id=p.id;}
  p.bed_id=req.body.target_bed_id; p.unit_id=req.body.target_unit_id; p.etag=uuidv4();
  broadcast(fromUnit,{type:'PATIENT_TRANSFERRED',payload:{patient_id:p.id,from_bed:fromBed,to_bed:req.body.target_bed_id,to_unit:req.body.target_unit_id}});
  res.json({ok:true});
});

app.get('/api/v1/staff',(req,res)=>{
  let staff: any[]=db.staff;
  const {unit_id,role,shift}=req.query as any;
  if(unit_id) staff=staff.filter((s:any)=>s.unit_id===unit_id);
  if(role) staff=staff.filter((s:any)=>s.role===role);
  if(shift) staff=staff.filter((s:any)=>s.shift===shift);
  res.json({data:staff});
});

app.get('/api/v1/alerts',(req,res)=>{
  let alerts: any[]=db.alerts;
  const {unit_id,severity,status}=req.query as any;
  if(unit_id) alerts=alerts.filter((a:any)=>a.unit_id===unit_id);
  if(severity) alerts=alerts.filter((a:any)=>a.severity===severity);
  if(status==='active') alerts=alerts.filter((a:any)=>!a.acknowledged_by);
  if(status==='acknowledged') alerts=alerts.filter((a:any)=>!!a.acknowledged_by);
  res.json({data:alerts});
});

app.post('/api/v1/alerts/:id/acknowledge',(req,res)=>{
  const a=db.alerts.find((a:any)=>a.id===req.params.id);
  if(!a) return res.status(404).json({error:'Not found'});
  a.acknowledged_by=req.body.acknowledged_by;
  a.acknowledged_at=new Date().toISOString();
  broadcast(a.unit_id,{type:'ALERT_RESOLVED',payload:{alert_id:a.id,resolved_at:a.acknowledged_at}});
  res.json({ok:true});
});

app.get('/api/v1/summary/unit-stats',(req,res)=>{
  const {unit_id}=req.query as any;
  const unit=db.units.find((u:any)=>u.id===unit_id);
  if(!unit) return res.status(404).json({error:'Not found'});
  const beds=db.beds.filter((b:any)=>b.unit_id===unit_id);
  const patients=db.patients.filter((p:any)=>p.unit_id===unit_id&&p.status==='admitted');
  res.json({unit_id,total_beds:unit.total_beds,occupied:beds.filter((b:any)=>b.status==='occupied').length,available:beds.filter((b:any)=>b.status==='available').length,cleaning:beds.filter((b:any)=>b.status==='cleaning').length,maintenance:beds.filter((b:any)=>b.status==='maintenance').length,blocked:beds.filter((b:any)=>b.status==='blocked').length,occupancy_pct:+(beds.filter((b:any)=>b.status==='occupied').length/unit.total_beds*100).toFixed(1),avg_acuity:patients.length?+(patients.reduce((s:number,p:any)=>s+p.acuity,0)/patients.length).toFixed(1):0,critical_count:patients.filter((p:any)=>p.acuity>=4).length});
});

const PORT = 3001;
app.listen(PORT,()=>console.log(`✅ PulseOps Mock Server running on http://localhost:${PORT}`));
