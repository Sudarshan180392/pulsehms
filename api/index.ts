import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Load data ──────────────────────────────────────────────────────────────
let db: {
  units: any[];
  beds: any[];
  patients: any[];
  staff: any[];
  alerts: any[];
} = { units: [], beds: [], patients: [], staff: [], alerts: [] };

// Try multiple paths — Vercel CWD can vary
const possiblePaths = [
  path.join(process.cwd(), 'api', 'data', 'hospital.json'),
  path.join(process.cwd(), 'data', 'hospital.json'),
  path.join(__dirname, 'data', 'hospital.json'),
  path.join(__dirname, '..', 'api', 'data', 'hospital.json'),
];

let loaded = false;
for (const p of possiblePaths) {
  try {
    if (fs.existsSync(p)) {
      db = JSON.parse(fs.readFileSync(p, 'utf-8'));
      console.log('✅ Loaded hospital.json from:', p);
      loaded = true;
      break;
    }
  } catch (e) {
    console.error('❌ Failed at path:', p, e);
  }
}

if (!loaded) {
  console.error('❌ hospital.json not found in any path. Tried:', possiblePaths);
}

// ── Debug route — visit /api/debug to check what is happening ──────────────
app.get('/api/debug', (req: Request, res: Response) => {
  res.json({
    loaded,
    cwd: process.cwd(),
    dirname: __dirname,
    triedPaths: possiblePaths,
    unitCount: db.units.length,
    patientCount: db.patients.length,
  });
});

// ── Units ──────────────────────────────────────────────────────────────────
app.get('/api/v1/units', (req: Request, res: Response) => {
  res.json({ data: db.units });
});

app.get('/api/v1/units/:unitId/census', (req: Request, res: Response) => {
  const { unitId } = req.params;
  const beds = db.beds.filter((b: any) => b.unit_id === unitId);
  const unit = db.units.find((u: any) => u.id === unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  const occupied = beds.filter((b: any) => b.status === 'occupied').length;
  const available = beds.filter((b: any) => b.status === 'available').length;
  res.json({
    beds,
    summary: {
      unit_id: unitId,
      total_beds: unit.total_beds,
      occupied,
      available,
      occupancy_pct: +((occupied / unit.total_beds) * 100).toFixed(1),
    },
  });
});

// ── Patients ───────────────────────────────────────────────────────────────
app.get('/api/v1/patients', (req: Request, res: Response) => {
  let patients: any[] = [...db.patients];
  const { unit_id, status, acuity, search, sort_by, sort_dir, page = '1', limit = '100' } = req.query as any;
  if (unit_id) patients = patients.filter((p: any) => p.unit_id === unit_id);
  if (status) patients = patients.filter((p: any) => p.status === status);
  if (acuity) patients = patients.filter((p: any) => p.acuity === parseInt(acuity));
  if (search) {
    const q = (search as string).toLowerCase();
    patients = patients.filter((p: any) =>
      `${p.first_name} ${p.last_name} ${p.mrn} ${p.chief_complaint}`.toLowerCase().includes(q)
    );
  }
  if (sort_by) {
    const dir = sort_dir === 'desc' ? -1 : 1;
    patients.sort((a: any, b: any) => {
      if (sort_by === 'acuity') return dir * (a.acuity - b.acuity);
      if (sort_by === 'los') return dir * (a.los_hours - b.los_hours);
      if (sort_by === 'name') return dir * a.last_name.localeCompare(b.last_name);
      return 0;
    });
  }
  const total = patients.length;
  const p = parseInt(page as string);
  const l = parseInt(limit as string);
  res.json({ data: patients.slice((p - 1) * l, p * l), meta: { total, page: p, pages: Math.ceil(total / l) } });
});

app.get('/api/v1/patients/:id', (req: Request, res: Response) => {
  const p = db.patients.find((p: any) => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// ── Alerts ─────────────────────────────────────────────────────────────────
app.get('/api/v1/alerts', (req: Request, res: Response) => {
  let alerts: any[] = [...db.alerts];
  const { unit_id, severity, status } = req.query as any;
  if (unit_id) alerts = alerts.filter((a: any) => a.unit_id === unit_id);
  if (severity) alerts = alerts.filter((a: any) => a.severity === severity);
  if (status === 'active') alerts = alerts.filter((a: any) => !a.acknowledged_by);
  if (status === 'acknowledged') alerts = alerts.filter((a: any) => !!a.acknowledged_by);
  res.json({ data: alerts });
});

app.post('/api/v1/alerts/:id/acknowledge', (req: Request, res: Response) => {
  const a = db.alerts.find((a: any) => a.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  a.acknowledged_by = req.body.acknowledged_by;
  a.acknowledged_at = new Date().toISOString();
  res.json({ ok: true });
});

// ── Staff ──────────────────────────────────────────────────────────────────
app.get('/api/v1/staff', (req: Request, res: Response) => {
  let staff: any[] = [...db.staff];
  const { unit_id, role, shift } = req.query as any;
  if (unit_id) staff = staff.filter((s: any) => s.unit_id === unit_id);
  if (role) staff = staff.filter((s: any) => s.role === role);
  if (shift) staff = staff.filter((s: any) => s.shift === shift);
  res.json({ data: staff });
});

// ── Summary ────────────────────────────────────────────────────────────────
app.get('/api/v1/summary/unit-stats', (req: Request, res: Response) => {
  const { unit_id } = req.query as any;
  const unit = db.units.find((u: any) => u.id === unit_id);
  if (!unit) return res.status(404).json({ error: 'Not found' });
  const beds = db.beds.filter((b: any) => b.unit_id === unit_id);
  const patients = db.patients.filter((p: any) => p.unit_id === unit_id && p.status === 'admitted');
  res.json({
    unit_id,
    total_beds: unit.total_beds,
    occupied: beds.filter((b: any) => b.status === 'occupied').length,
    available: beds.filter((b: any) => b.status === 'available').length,
    occupancy_pct: +((beds.filter((b: any) => b.status === 'occupied').length / unit.total_beds) * 100).toFixed(1),
    avg_acuity: patients.length
      ? +(patients.reduce((s: number, p: any) => s + p.acuity, 0) / patients.length).toFixed(1)
      : 0,
  });
});

// ── Catch-all for debugging unmatched routes ───────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    attempted: req.method + ' ' + req.path,
    availableRoutes: [
      'GET /api/debug',
      'GET /api/v1/units',
      'GET /api/v1/patients',
      'GET /api/v1/alerts',
      'GET /api/v1/staff',
    ],
  });
});

export default app;