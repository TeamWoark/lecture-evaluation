/** رفع النسخة الثابتة إلى Supabase Storage (bucket: site) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'static-site');
const env = {};
fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim();
});
const SUPA = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

(async () => {
  const files = walk(DIR);
  for (const rel of files) {
    const body = fs.readFileSync(path.join(DIR, rel));
    const res = await fetch(`${SUPA}/storage/v1/object/site/${rel}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream',
        'Cache-Control': 'max-age=60',
        'x-upsert': 'true',
      },
      body,
    });
    const txt = res.ok ? '' : await res.text();
    console.log(res.ok ? '✅' : '❌', rel, res.status, txt.slice(0, 120));
  }
  console.log('\nرابط الموقع:', `${SUPA}/storage/v1/object/public/site/index.html`);
})();
