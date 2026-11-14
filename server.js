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
/*  الطبقة التخزينية: Supabase هي المخزن الدائم (أساسي)                  */
/*  - مفتاح الخدمة (خدمي) إن وُجد، وإلا المفتاح العام anon عبر RLS+RPC    */
/*  - ملف JSON محلي = طابور احتياطي مؤقت فقط (لا يُعتمد عليه)            */
/*  - أي رد لا يُحفظ في Supabase يبقى معلَّمًا غير مُزامَن ويُعاد إرساله   */
/* ------------------------------------------------------------------ */
const DEFAULT_SUPABASE_URL = 'https://yxzqadwsvjezqslhlrup.supabase.co';
// المفتاح العام (anon) — مفتاح عام بطبيعته: قراءته مسموحة لكن الكتابة محدودة
// بسياسة RLS (insert فقط) والقراءة/الحذف تمرّان عبر RPC محمي بكلمة مرور الأدمن.
const PUBLIC_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4enFhZHdzdmplenFzbGhscnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTE1OTksImV4cCI6MjEwOTgyNzU5OX0.w1aDgbJ-KJ32TVpxFOvR_a8sa82vxxgcccB3YzfL8Cc';
const SUPABASE_URL = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY || PUBLIC_ANON_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'evaluations';
const HAS_SERVICE = Boolean(SERVICE_KEY);
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
const STORE_MODE = useSupabase ? (HAS_SERVICE ? 'supabase-service' : 'supabase-anon-rpc') : 'local';
// كلمة المرور المستخدمة لاستدعاء RPC المحمية (تُملأ من جلسة الأدمن أو البيئة)
const FALLBACK_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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

async function sbFetch(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

/* كل عملية تُنفَّذ بالخدمي إن توفّر، وإلا بالمفتاح العام + RPC محمي */
async function sbInsert(row) {
  return sbFetch(`/rest/v1/${SUPABASE_TABLE}`, {
    method: 'POST',
    // return=minimal: لا نحتاج قراءة الصف بعد الإدخال (لا سياسة SELECT للمفتاح العام)
    prefer: 'return=minimal',
    body: {
      id: row.id,
      created_at: row.created_at,
      answers: row.answers,
      notes: row.notes || '',
      duration_seconds: row.duration_seconds || 0,
    },
  });
}

async function sbList(adminPassword) {
  if (HAS_SERVICE) {
    const rows = await sbFetch(`/rest/v1/${SUPABASE_TABLE}?select=*&order=created_at.asc`);
    return Array.isArray(rows) ? rows : [];
  }
  const rows = await sbFetch('/rest/v1/rpc/admin_data', {
    method: 'POST',
    body: { p_password: adminPassword || FALLBACK_ADMIN_PASSWORD },
  });
  if (rows === null) {
    const err = new Error('كلمة مرور الأدمن لا تطابق كلمة المرور في قاعدة البيانات');
    err.code = 'AUTH_MISMATCH';
    throw err;
  }
  return Array.isArray(rows) ? rows : [];
}

async function sbDelete(id, adminPassword) {
  if (HAS_SERVICE) {
    await sbFetch(`/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  }
  const ok = await sbFetch('/rest/v1/rpc/admin_delete', {
    method: 'POST',
    body: { p_password: adminPassword || FALLBACK_ADMIN_PASSWORD, p_id: id },
  });
  if (ok !== true) throw new Error('فشل الحذف — تحقّق من كلمة مرور الأدمن في قاعدة البيانات');
  return true;
}

async function sbCount() {
  try {
    const n = await sbFetch('/rest/v1/rpc/eval_count', { method: 'POST', body: {} });
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

/* حفظ الرد: Supabase أولًا (دائم)، والملف المحلي طابور احتياط مؤقت */
async function addResponse(row) {
  let saved = false;
  let lastErr = null;
  for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
    try {
      await sbInsert(row);
      saved = true;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  const rows = readLocal();
  rows.push({ ...row, demo: false, synced: saved });
  writeLocal(rows);

  if (!saved) {
    console.error('[storage] تعذّر الحفظ في Supabase — الرد محفوظ محليًا كطابور مؤقت:', lastErr && lastErr.message);
  } else {
    // أزل أي نسخة معلّقة سابقة لنفس المعرّف
    console.log('[storage] تم حفظ الرد في Supabase:', row.id);
  }
  return { ...row, saved };
}

/* إعادة إرسال الردود غير المُزامنة إلى Supabase */
async function flushPending() {
  const rows = readLocal();
  const pending = rows.filter((r) => r.demo !== true && r.synced === false);
  if (!pending.length) return 0;
  let done = 0;
  for (const r of pending) {
    try {
      await sbInsert(r);
      r.synced = true;
      done += 1;
    } catch (err) {
      console.error('[storage] فشل رفع رد معلّق:', r.id, err.message);
      break;
    }
  }
  if (done) writeLocal(rows);
  return done;
}

async function listResponses(adminPassword) {
  const local = readLocal();
  const pending = local.filter((r) => r.demo !== true && r.synced === false);
  const demo = local.filter((r) => r.demo === true);

  if (useSupabase) {
    try {
      const remote = await sbList(adminPassword);
      const mapped = remote.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        answers: r.answers,
        notes: r.notes || '',
        duration_seconds: r.duration_seconds || 0,
        demo: false,
      }));
      const seen = new Set(mapped.map((r) => r.id));
      const missing = pending.filter((r) => !seen.has(r.id));
      return [...mapped, ...missing, ...demo].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch (err) {
      console.error('[storage] تعذّر الجلب من Supabase:', err.message);
      if (err.code === 'AUTH_MISMATCH') throw err;
    }
  }
  return [...local.filter((r) => r.demo !== true), ...demo].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
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
// جلسات الأدمن: رمز الكوكي → كلمة المرور (لازمة لاستدعاء RPC المحمية)
const sessionPasswords = new Map();
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function requireAdmin(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!checkToken(token) || !sessionPasswords.has(token)) {
    return res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول' });
  }
  req.adminPassword = sessionPasswords.get(token);
  return next();
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
    credit: config.credit || null,
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
    const n = await sbCount();
    if (typeof n === 'number') return res.json({ count: n });
    const rows = await listResponses();
    return res.json({ count: rows.filter((r) => !r.demo).length });
  } catch {
    res.json({ count: 0 });
  }
});

/* --- حالة التخزين (تشخيص) --------------------------------------- */
app.get('/api/health', async (req, res) => {
  const n = await sbCount();
  res.json({
    ok: true,
    storage: STORE_MODE,
    supabase: { url: SUPABASE_URL, table: SUPABASE_TABLE, reachable: n !== null, rows: n },
    pendingLocal: readLocal().filter((r) => r.demo !== true && r.synced === false).length,
  });
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
  const token = makeToken();
  sessionPasswords.set(token, String(password));
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`
  );
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sessionPasswords.delete(parseCookies(req)[COOKIE_NAME]);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get('/api/admin/data', requireAdmin, async (req, res) => {
  try {
    await flushPending();
    const rows = await listResponses(req.adminPassword);
    res.json({
      rows,
      questions: QUESTIONS,
      dimensions: DIMENSIONS,
      scale: SCALE,
      storage: STORE_MODE,
      pending: readLocal().filter((r) => r.demo !== true && r.synced === false).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/responses/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const rows = readLocal();
    const target = rows.find((r) => r.id === id);
    const next = rows.filter((r) => r.id !== id);

    if (target && target.demo === true) {
      // رد تجريبي محلي فقط
      writeLocal(next);
      return res.json({ ok: true, scope: 'local-demo' });
    }

    // احذف من قاعدة البيانات أولًا (المصدر الدائم)
    await sbDelete(id, req.adminPassword);
    writeLocal(next);
    return res.json({ ok: true, scope: 'supabase' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  const rows = await listResponses(req.adminPassword);
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

setInterval(() => { flushPending().catch(() => {}); }, 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ الموقع يعمل على http://localhost:${PORT}`);
  console.log(`   لوحة التحكم: http://localhost:${PORT}/admin`);
  console.log(`   التخزين الدائم: ${useSupabase ? 'Supabase (' + SUPABASE_URL + ' → ' + SUPABASE_TABLE + '، ' + STORE_MODE + ')' : 'محلي فقط ⚠️'}`);
});
