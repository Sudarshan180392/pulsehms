import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const FIRST_NAMES = ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara','David','Elizabeth','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Christopher','Lisa','Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley','Steven','Dorothy','Paul','Kimberly','Andrew','Emily','Kenneth','Donna','Joshua','Michelle','Kevin','Carol','Brian','Amanda','George','Melissa','Edward','Deborah'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];
const COMPLAINTS = ['Chest pain','Shortness of breath','Abdominal pain','Altered mental status','Fever and chills','Syncope','Weakness/numbness','Headache','Back pain','Nausea/vomiting','Sepsis','Hip fracture','Stroke symptoms','Seizure','Respiratory distress','Cardiac arrhythmia','Acute kidney injury','GI bleed','Cellulitis','DVT'];
const DIAGNOSES = ['Acute MI','CHF exacerbation','COPD exacerbation','Pneumonia','Sepsis','CVA','TIA','Acute renal failure','Bowel obstruction','Pancreatitis','Diabetic ketoacidosis','Hypertensive emergency','Pulmonary embolism','Atrial fibrillation','Hip fracture','Cellulitis','UTI','Dehydration','Anemia','Liver failure'];
const PROVIDERS = Array.from({length:20},(_,i)=>({id:`prov-${i+1}`,name:`Dr. ${LAST_NAMES[i]}`}));

const rand = (arr: any[]) => arr[Math.floor(Math.random()*arr.length)];
const randInt = (min:number,max:number) => Math.floor(Math.random()*(max-min+1))+min;
const randFloat = (min:number,max:number) => +(Math.random()*(max-min)+min).toFixed(1);

const UNITS = [
  {id:'unit-1',name:'3 North - Cardiac Step-Down',floor:3,specialty:'cardiac',total_beds:28,staffed_beds:26,target_census:22},
  {id:'unit-2',name:'4 South - Neuro/Stroke',floor:4,specialty:'neuro',total_beds:24,staffed_beds:22,target_census:18},
  {id:'unit-3',name:'5 West - Surgical',floor:5,specialty:'surgical',total_beds:32,staffed_beds:30,target_census:26},
  {id:'unit-4',name:'2 East - Medical ICU',floor:2,specialty:'icu',total_beds:20,staffed_beds:20,target_census:18},
  {id:'unit-5',name:'6 North - Oncology',floor:6,specialty:'oncology',total_beds:26,staffed_beds:24,target_census:20},
  {id:'unit-6',name:'7 South - Pediatrics',floor:7,specialty:'peds',total_beds:22,staffed_beds:20,target_census:16},
  {id:'unit-7',name:'3 South - General Med',floor:3,specialty:'medical',total_beds:30,staffed_beds:28,target_census:24},
  {id:'unit-8',name:'4 North - Orthopedics',floor:4,specialty:'surgical',total_beds:28,staffed_beds:26,target_census:22}
];

function generateBeds(unit: any): any[] {
  const beds: any[] = [];
  const statuses = ['available','occupied','occupied','occupied','cleaning','maintenance','blocked'];
  const isolations = [null,null,null,'contact','droplet','airborne'];
  let roomNum = unit.floor * 100 + 1;
  let bedCount = 0;
  while(bedCount < unit.total_beds) {
    const bedsInRoom = Math.min(randInt(1,2), unit.total_beds - bedCount);
    for(let b=0;b<bedsInRoom;b++) {
      beds.push({
        id:`bed-${unit.id}-${roomNum}${String.fromCharCode(65+b)}`,
        unit_id: unit.id,
        room: `${roomNum}`,
        bed_number: String.fromCharCode(65+b),
        status: rand(statuses),
        patient_id: null,
        isolation_type: rand(isolations),
        telemetry_equipped: Math.random() > 0.4
      });
      bedCount++;
    }
    roomNum++;
  }
  return beds;
}

function generatePatient(bed: any, idx: number): any {
  const fn = rand(FIRST_NAMES), ln = rand(LAST_NAMES);
  const dob = new Date(Date.now() - randInt(18,95)*365*24*3600*1000);
  const admittedHoursAgo = randInt(1,240);
  const admitted = new Date(Date.now() - admittedHoursAgo*3600*1000);
  const expectedDischarge = Math.random()>0.2 ? new Date(Date.now() + randInt(4,96)*3600*1000).toISOString() : null;
  const acuity = randInt(1,5) as 1|2|3|4|5;
  return {
    id: `pat-${idx}`,
    mrn: `MRN${String(100000+idx).padStart(6,'0')}`,
    first_name: fn, last_name: ln,
    dob: dob.toISOString().split('T')[0],
    gender: rand(['M','F','X']),
    bed_id: bed.id, unit_id: bed.unit_id,
    status: rand(['admitted','admitted','admitted','pending','discharging','boarding']),
    acuity,
    chief_complaint: rand(COMPLAINTS),
    admitting_dx: rand(DIAGNOSES),
    admitted_at: admitted.toISOString(),
    expected_discharge: expectedDischarge,
    los_hours: admittedHoursAgo,
    attending_provider_id: rand(PROVIDERS).id,
    care_team: [{role:'rn',name:`${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`},{role:'md',name:rand(PROVIDERS).name}],
    flags: Math.random()>0.7?[{type:'fall_risk',note:'High risk - bed alarm on'}]:[],
    isolation_type: bed.isolation_type,
    fall_risk: rand(['low','low','moderate','high']),
    code_status: rand(['full','full','full','dnr','dnar','comfort']),
    vitals_history: Array.from({length:6},(_,i)=>({
      timestamp: new Date(Date.now()-i*3600*1000).toISOString(),
      hr: randInt(55,130), sbp: randInt(85,200), dbp: randInt(50,110),
      spo2: randFloat(88,100), temp: randFloat(96.5,102.5), rr: randInt(10,30)
    })),
    notes: [{author: rand(PROVIDERS).name, text: 'Patient stable. Continue current management.', timestamp: admitted.toISOString()}],
    etag: uuidv4()
  };
}

function generateStaff(units: any[]): any[] {
  const staff: any[] = [];
  const roles: ('rn'|'cna'|'md'|'np'|'charge_rn'|'transport')[] = ['rn','rn','rn','cna','md','np','charge_rn','transport'];
  const shifts: ('day'|'evening'|'night')[] = ['day','day','evening','night'];
  let idx = 0;
  for(const unit of units) {
    for(let i=0;i<8;i++) {
      staff.push({
        id: `staff-${idx++}`,
        name: `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
        role: rand(roles), unit_id: unit.id,
        shift: rand(shifts), patient_ids: [],
        patient_ratio: randFloat(1,6)
      });
    }
  }
  return staff;
}

function generateAlerts(patients: any[], units: any[]): any[] {
  const alerts: any[] = [];
  const types = ['fall_risk','deterioration','rrt_criteria','isolation_breach','medication','critical_lab'];
  const sevs: ('critical'|'high'|'medium')[] = ['critical','high','high','medium','medium','medium'];
  for(let i=0;i<50;i++) {
    const p = rand(patients);
    const sev = rand(sevs);
    alerts.push({
      id: `alert-${i}`,
      unit_id: p.unit_id, patient_id: p.id,
      alert_type: rand(types), severity: sev,
      message: `Patient ${p.last_name}: ${rand(['Vitals deteriorating','Fall risk elevated','Isolation protocol breach','Critical lab value','Medication due','RRT criteria met'])}`,
      fired_at: new Date(Date.now()-randInt(0,7200)*1000).toISOString(),
      acknowledged_by: Math.random()>0.6?rand(PROVIDERS).name:null,
      acknowledged_at: null, auto_resolves_at: null
    });
  }
  return alerts;
}

function seed() {
  const allBeds: any[] = [];
  const allPatients: any[] = [];
  let patIdx = 0;

  for(const unit of UNITS) {
    const beds = generateBeds(unit);
    for(const bed of beds) {
      if(bed.status==='occupied') {
        const p = generatePatient(bed,patIdx++);
        bed.patient_id = p.id;
        allPatients.push(p);
      }
      allBeds.push(bed);
    }
  }

  // fill to 400 patients (boarding/pending without beds)
  while(patIdx < 400) {
    const fakeUnit = rand(UNITS);
    const fakePat = generatePatient({id:null,unit_id:fakeUnit.id,isolation_type:null},patIdx++);
    fakePat.bed_id = null;
    fakePat.status = rand(['pending','boarding']);
    allPatients.push(fakePat);
  }

  const staff = generateStaff(UNITS);
  const alerts = generateAlerts(allPatients,UNITS);

  const data = {units: UNITS, beds: allBeds, patients: allPatients, staff, alerts, providers: PROVIDERS};
  const dir = path.join(__dirname,'data');
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'hospital.json'),JSON.stringify(data,null,2));
  console.log(`✅ Seeded: ${UNITS.length} units, ${allBeds.length} beds, ${allPatients.length} patients, ${staff.length} staff, ${alerts.length} alerts`);
}

seed();
