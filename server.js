/**
 * منصة اللقاء التدريبي — سيرفر بسيط (Node.js + Express)
 * - يعرض الفيديوهات داخل الموقع (Google Drive / MP4)
 * - استبيان تقييم مجهول من 10 أسئلة (مقياس 1..4) + ملاحظات اختيارية
 * - لوحة تحكم أدمن محمية بكلمة مرور + تحليلات ورسوم بيانية + تصدير CSV
 */
// تحميل متغيرات البيئة من ملف .env (بدون مكتبات خارجية)
(function loadEnv() {
  try {
    const envPath = require('path').join(__dirname, '.env');
    if (!require('fs').existsSync(envPath)) return;
    require('fs').readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* تجاهل */ }
})();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config', 'site.json');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_PATH = path.join(DATA_DIR, 'responses.json');

const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ */
/*  الإعدادات                                                          */
/* ------------------------------------------------------------------ */
function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  // سر توقيع الكوكيز (يُنشأ تلقائيًا أول مرة)
  if (!cfg.auth || !cfg.auth.secret) {
    cfg.auth = cfg.auth || {};
    cfg.auth.secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  }
  return cfg;
}
const config = loadConfig();

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/* ------------------------------------------------------------------ */
/*  كلمة المرور (scrypt hash)                                          */
/* ------------------------------------------------------------------ */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const calc = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// كلمة مرور أولية: من متغيّر البيئة أو admin123 (تُغيَّر من config/site.json)
if (!config.auth.password_hash) {
  config.auth.password_hash = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
  saveConfig();
}

/* ------------------------------------------------------------------ */
/*  الطبقة التخزينية: ملف JSON محلي + نسخ اختياري إلى Supabase         */
/* ------------------------------------------------------------------ */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'evaluations';
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '[]', 'utf8');
}
ensureData();

function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function writeLocal(rows) {
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_PATH);
}

async function supabaseRequest(method, query = '', body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function addResponse(row) {
  // 1) محليًا (مصدر أساسي يعمل دائمًا)
  const rows = readLocal();
  rows.push(row);
  writeLocal(rows);
  // 2) نسخة احتياطية على Supabase إن كانت مفعّلة
  if (useSupabase) {
    try {
      await supabaseRequest('POST', '', {
        id: row.id,
        created_at: row.created_at,
        answers: row.answers,
        notes: row.notes,
        duration_seconds: row.duration_seconds,
      });
    } catch (err) {
      console.error('[supabase] فشل حفظ الرد:', err.message);
    }
  }
  return row;
}

async function listResponses() {
  const local = readLocal();
  if (useSupabase) {
    try {
      const remote = await supabaseRequest('GET', '?select=*&order=created_at.asc');
      const mapped = (Array.isArray(remote) ? remote : []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        answers: r.answers,
        notes: r.notes || '',
        duration_seconds: r.duration_seconds || 0,
        demo: false,
      }));
      // الردود التجريبية (لعرض الشكل فقط) تُدمج مع الردود الحقيقية
      const demo = local.filter((r) => r.demo === true);
      return [...mapped, ...demo].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch (err) {
      console.error('[supabase] تعذّر جلب الردود:', err.message);
    }
  }
  return local;
}

/* ------------------------------------------------------------------ */
/*  الاستبيان                                                          */
/* ------------------------------------------------------------------ */
const QUESTIONS = [
  { id: 'q1', dim: 'content', text: 'مدى ملاءمة المحتوى العلمي لأهداف اللقاء واحتياجاتي التدريبية' },
  { id: 'q2', dim: 'content', text: 'وضوح المادة العلمية ودقتها وحداثتها' },
  { id: 'q3', dim: 'content', text: 'مدى ارتباط الأمثلة والتطبيقات العملية بمحتوى اللقاء' },
  { id: 'q4', dim: 'content', text: 'سهولة استخدام أدوات الذكاء الاصطناعي التي طُبِّقت خلال اللقاء' },
  { id: 'q5', dim: 'trainer', text: 'تمكُّن المدربين من المادة العلمية' },
  { id: 'q6', dim: 'trainer', text: 'أسلوب المدربين في الشرح وقدرتهم على إيصال المعلومة' },
  { id: 'q7', dim: 'trainer', text: 'تفاعل المدربين مع المشاركين واستجابتهم للأسئلة' },
  { id: 'q8', dim: 'time', text: 'مدى مناسبة مدة اللقاء لحجم المحتوى المقدَّم' },
  { id: 'q9', dim: 'time', text: 'جودة إدارة الوقت وتوزيعه على فقرات اللقاء' },
  { id: 'q10', dim: 'general', text: 'مدى استفادتي العامة من اللقاء واستعدادي لتوصية غيري به' },
];

const DIMENSIONS = {
  content: 'المادة العلمية',
  trainer: 'المدربون',
  time: 'وقت التدريب',
  general: 'التقييم العام',
};

const SCALE = {
  1: 'ضعيف جدًا',
  2: 'ضعيف',
  3: 'جيد',
  4: 'ممتاز',
};

/* ------------------------------------------------------------------ */
/*  الجلسة                                                             */
/* ------------------------------------------------------------------ */
const COOKIE_NAME = 'adm_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 ساعات

function sign(value) {
  return crypto.createHmac('sha256', config.auth.secret).update(value).digest('hex');
}
function makeToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `v1.${expires}`;
  return `${payload}.${sign(payload)}`;
}
function checkToken(token) {
  if (!token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [v, expires, sig] = parts;
  const payload = `${v}.${expires}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(expires) > Date.now();
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function requireAdmin(req, res, next) {
  if (checkToken(parseCookies(req)[COOKIE_NAME])) return next();
  res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول' });
}

/* ------------------------------------------------------------------ */
/*  التطبيق                                                            */
/* ------------------------------------------------------------------ */
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '128kb' }));

/* --- عام --------------------------------------------------------- */
app.get('/api/config', (req, res) => {
  res.json({
    site: config.site,
    trainers: config.trainers || [],
    tools: config.tools || [],
    videos: (config.videos || []).filter((v) => v.visible !== false),
    questions: QUESTIONS,
    dimensions: DIMENSIONS,
    scale: SCALE,
    evaluationOpen: config.evaluationOpen !== false,
  });
});

app.get('/api/stats/public', async (req, res) => {
  // رقم عام بسيط (بدون أي بيانات شخصية) لتشجيع المشاركة
  try {
    const rows = await listResponses();
    res.json({ count: rows.filter((r) => !r.demo).length });
  } catch {
    res.json({ count: 0 });
  }
});

app.post('/api/evaluate', async (req, res) => {
  if (config.evaluationOpen === false) {
    return res.status(403).json({ error: 'التقييم مغلق حاليًا' });
  }
  const body = req.body || {};
  const answers = body.answers || {};

  const clean = {};
  for (const q of QUESTIONS) {
    const val = Number(answers[q.id]);
    if (!Number.isInteger(val) || val < 1 || val > 4) {
      return res.status(400).json({ error: `الرجاء الإجابة على جميع الأسئلة (${q.text})` });
    }
    clean[q.id] = val;
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
  const duration = Math.max(0, Math.min(86400, Number(body.durationSeconds) || 0));

  const row = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    answers: clean,
    notes,
    duration_seconds: duration,
  };
  await addResponse(row);
  res.json({ ok: true, id: row.id });
});

/* --- الأدمن ------------------------------------------------------ */
app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: checkToken(parseCookies(req)[COOKIE_NAME]) });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password, config.auth.password_hash)) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${makeToken()}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`
  );
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get('/api/admin/data', requireAdmin, async (req, res) => {
  const rows = await listResponses();
  res.json({ rows, questions: QUESTIONS, dimensions: DIMENSIONS, scale: SCALE });
});

app.delete('/api/admin/responses/:id', requireAdmin, async (req, res) => {
  const rows = readLocal();
  const isDemo = rows.some((r) => r.id === req.params.id && r.demo === true);
  const next = rows.filter((r) => r.id !== req.params.id);
  if (next.length === rows.length) {
    // قد يكون الرد في Supabase فقط
    if (useSupabase) {
      try {
        await supabaseRequest('DELETE', `?id=eq.${encodeURIComponent(req.params.id)}`);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    } else {
      return res.status(404).json({ error: 'الرد غير موجود' });
    }
  } else {
    writeLocal(next);
    if (useSupabase && !isDemo) {
      try {
        await supabaseRequest('DELETE', `?id=eq.${encodeURIComponent(req.params.id)}`);
      } catch (err) {
        console.error('[supabase]', err.message);
      }
    }
  }
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  const rows = await listResponses();
  const header = ['#', 'التاريخ والوقت', ...QUESTIONS.map((q) => q.text), 'الملاحظات'];
  const lines = [header.map(csvCell).join(',')];
  rows.forEach((row, i) => {
    const date = new Date(row.created_at).toLocaleString('en-GB', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    lines.push(
      [
        i + 1,
        date,
        ...QUESTIONS.map((q) => (row.answers ? row.answers[q.id] : '')),
        row.notes || '',
      ]
        .map(csvCell)
        .join(',')
    );
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evaluation-results.csv"');
  res.send('\ufeff' + lines.join('\r\n')); // BOM لدعم العربية في Excel
});

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* --- الصفحات ----------------------------------------------------- */
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('/admin', (req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html')));

app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'public', '404.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ الموقع يعمل على http://localhost:${PORT}`);
  console.log(`   لوحة التحكم: http://localhost:${PORT}/admin`);
  console.log(`   التخزين: ${useSupabase ? 'Supabase (' + SUPABASE_URL + ' → ' + SUPABASE_TABLE + ')' : 'محلي (data/responses.json)'}`);
});
