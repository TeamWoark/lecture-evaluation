/**
 * بناء نسخة ثابتة (Static) من الموقع تُستضاف على Supabase Storage
 * الاستخدام: node scripts/build-static.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'static-site');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yxzqadwsvjezqslhlrup.supabase.co';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4enFhZHdzdmplenFzbGhscnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTE1OTksImV4cCI6MjEwOTgyNzU5OX0.w1aDgbJ-KJ32TVpxFOvR_a8sa82vxxgcccB3YzfL8Cc';

const supaRuntime = `
/* ==== Supabase client (بدون مكتبات) ==== */
const SUPA = ${JSON.stringify(SUPABASE_URL)};
const ANON = ${JSON.stringify(ANON_KEY)};
async function rpc(name, body) {
  const res = await fetch(SUPA + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.status);
  return text ? JSON.parse(text) : null;
}
async function insertRow(row) {
  const res = await fetch(SUPA + '/rest/v1/evaluations', {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error((await res.text()) || 'فشل الحفظ');
  return true;
}
`;

function htmlRewrite(html) {
  return html
    .replace(/href="\/style\.css"/g, 'href="style.css"')
    .replace(/src="\/vendor\/qrcode\.js"/g, 'src="vendor/qrcode.js"')
    .replace(/src="\/app\.js"/g, 'src="app.js"')
    .replace(/src="\/eval\.js"/g, 'src="eval.js"')
    .replace(/src="\/admin\.js"/g, 'src="admin.js"')
    .replace(/href="\/api\/admin\/export\.csv"/g, 'href="#"')
    .replace(/href="\/evaluation"/g, 'href="evaluation.html"')
    .replace(/href="\/admin"/g, 'href="admin.html"')
    .replace(/href="\/qr"/g, 'href="qr.html"')
    .replace(/href="\/#videos"/g, 'href="index.html#videos"')
    .replace(/href="\/"/g, 'href="index.html"')
    .replace(/url\('\/style\.css'\)/g, "url('style.css')");
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

(async () => {
  /* 1) إعدادات الموقع من السيرفر المحلي (مصدر واحد للحقيقة) */
  let cfg;
  try {
    const res = await fetch('http://localhost:3000/api/config');
    cfg = await res.json();
  } catch (e) {
    console.error('❌ شغّل السيرفر المحلي أولاً (node server.js) لتوليد config.json');
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  write(path.join(OUT, 'config.json'), JSON.stringify(cfg, null, 2));

  /* 2) النسخ + إعادة كتابة المسارات */
  for (const f of ['index.html', 'evaluation.html', 'admin.html', 'qr.html', 'style.css', '404.html']) {
    write(path.join(OUT, f), htmlRewrite(fs.readFileSync(path.join(SRC, f), 'utf8')));
  }
  fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'vendor', 'qrcode.js'), path.join(OUT, 'vendor', 'qrcode.js'));

  /* 3) app.js */
  let app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  app = app.replace(
    `fetch('/api/stats/public')
    .then((r) => r.json())
    .then((d) => { $('#statResponses').textContent = d.count ?? 0; })
    .catch(() => { $('#statResponses').textContent = '0'; });`,
    `rpc('eval_count')
    .then((n) => { $('#statResponses').textContent = Number(n) || 0; })
    .catch(() => { $('#statResponses').textContent = '0'; });`
  );
  app = app.replace(/fetch\('\/api\/config'\)/g, "fetch('config.json')");
  app = app.replace(/window\.location\.origin \+ '\/evaluation'/g, "new URL('evaluation.html', window.location.href).href");
  app = app.replace(/href="\/evaluation"/g, 'href="evaluation.html"');
  app = HTTPIFY(app);
  write(path.join(OUT, 'app.js'), supaRuntime + app);

  /* 4) eval.js */
  let ev = fs.readFileSync(path.join(SRC, 'eval.js'), 'utf8');
  ev = ev.replace(/fetch\('\/api\/config'\)/g, "fetch('config.json')");
  ev = ev.replace(
    `      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          notes: notes.value.trim(),
          durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر إرسال التقييم');`,
    `      await insertRow({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2)),
        answers,
        notes: notes.value.trim(),
        duration_seconds: Math.round((Date.now() - startedAt) / 1000),
      });`
  );
  ev = HTTPIFY(ev);
  write(path.join(OUT, 'eval.js'), supaRuntime + ev);

  /* 5) admin.js — نسخة تقرأ من RPC */
  let ad = fs.readFileSync(path.join(SRC, 'admin.js'), 'utf8');

  ad = ad.replace(
    `  fetch('/api/admin/session')
    .then((r) => r.json())
    .then((d) => {
      if (d.authenticated) showDashboard();
      else showLogin();
    })
    .catch(showLogin);`,
    `  if (sessionStorage.getItem('adm_pass')) showDashboard();
  else showLogin();`
  );

  ad = ad.replace(
    `    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('#password').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر تسجيل الدخول');
      showDashboard();`,
    `    try {
      const rows = await rpc('admin_data', { p_password: $('#password').value });
      if (!rows) throw new Error('كلمة المرور غير صحيحة');
      sessionStorage.setItem('adm_pass', $('#password').value);
      showDashboard();`
  );

  ad = ad.replace(
    `  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.reload();
  });`,
    `  $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('adm_pass');
    location.reload();
  });`
  );

  ad = ad.replace(
    `    try {
      const res = await fetch('/api/admin/data');
      if (res.status === 401) return showLogin();
      const data = await res.json();
      DATA = data;`,
    `    try {
      const cfg = await (await fetch('config.json')).json();
      const rows = await rpc('admin_data', { p_password: sessionStorage.getItem('adm_pass') || '' });
      if (!rows) {
        sessionStorage.removeItem('adm_pass');
        return showLogin();
      }
      DATA = { rows, questions: cfg.questions, dimensions: cfg.dimensions, scale: cfg.scale };`
  );

  ad = ad.replace(
    `        const res = await fetch('/api/admin/responses/' + encodeURIComponent(btn.dataset.del), {
          method: 'DELETE',
        });
        if (res.ok) load();
        else alert('تعذّر حذف الرد');`,
    `        try {
          const ok = await rpc('admin_delete', {
            p_password: sessionStorage.getItem('adm_pass') || '',
            p_id: btn.dataset.del,
          });
          if (ok) load();
          else alert('تعذّر حذف الرد');
        } catch (e) {
          alert('تعذّر حذف الرد');
        }`
  );

  // تصدير CSV من المتصفح
  ad = ad.replace(
    `  $('#refreshBtn').addEventListener('click', load);`,
    `  $('#refreshBtn').addEventListener('click', load);
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn)
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCsv();
    });

  function exportCsv() {
    const qs = DATA.questions || [];
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\\r\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [['#', 'التاريخ والوقت'].concat(qs.map((q) => q.text)).concat(['الملاحظات']).map(cell).join(',')];
    (DATA.rows || []).forEach((r, i) => {
      const d = new Date(r.created_at);
      const stamp =
        d.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' }) +
        ' ' +
        d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
      lines.push([i + 1, stamp].concat(qs.map((q) => (r.answers || {})[q.id] || '')).concat([r.notes || '']).map(cell).join(','));
    });
    const blob = new Blob(['\\ufeff' + lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'evaluation-results.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }`
  );

  ad = HTTPIFY(ad);
  write(path.join(OUT, 'admin.js'), supaRuntime + ad);

  /* 6) qr.html: رابط التقييم النسبي */
  let qr = fs.readFileSync(path.join(OUT, 'qr.html'), 'utf8');
  qr = qr.replace("var url = window.location.origin + '/evaluation';", "var url = new URL('evaluation.html', window.location.href).href;");
  write(path.join(OUT, 'qr.html'), qr);

  console.log('✅ تم بناء النسخة الثابتة في:', OUT);
  const list = fs.readdirSync(OUT, { recursive: true }).filter((f) => fs.statSync(path.join(OUT, f)).isFile());
  console.log('الملفات:', list.join(', '));
})();

function HTTPIFY(code) {
  return code.replace(/"\/evaluation"/g, '"evaluation.html"');
}
