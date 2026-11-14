/**
 * توليد ردود تجريبية لعرض شكل الداشبورد:
 *   node scripts/seed-demo.js 40
 * ثم لمسحها:  rm data/responses.json && echo '[]' > data/responses.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const n = Number(process.argv[2] || 30);
const DATA = path.join(__dirname, '..', 'data', 'responses.json');
const notesPool = [
  'لقاء ممتاز ومعلوماته عملية جدًا، أتمنى نسخة متقدمة.',
  'أفضل ما في اللقاء التطبيق العملي على الأدوات.',
  'الوقت كان قصيرًا على كمية المحتوى، نحتاج لقاءً إضافيًا.',
  'أقترح تزويدنا بملف PDF يضم الأدوات التي تم عرضها.',
  'الشرح واضح والمدرب متعاون، شكرًا لكم.',
  'أحتاج أمثلة أكثر في تخصصي (المرحلة الابتدائية).',
  'استفدت كثيرًا من جزئية توليد الصور التعليمية.',
  'يفضّل تقسيم اللقاء على يومين لتغطية التطبيقات.',
  '',
  '',
];

const rows = [];
for (let i = 0; i < n; i++) {
  const bias = Math.random() < 0.72 ? 4 : Math.random() < 0.6 ? 3 : 2;
  const answers = {};
  for (let q = 1; q <= 10; q++) {
    let v = bias + (Math.random() < 0.3 ? (Math.random() < 0.6 ? -1 : 1) : 0);
    answers['q' + q] = Math.max(1, Math.min(4, v));
  }
  const daysAgo = Math.floor(Math.random() * 12);
  const created = new Date(Date.now() - daysAgo * 86400000 - Math.random() * 8 * 3600000);
  rows.push({
    id: crypto.randomUUID(),
    created_at: created.toISOString(),
    answers,
    notes: notesPool[Math.floor(Math.random() * notesPool.length)],
    duration_seconds: 45 + Math.floor(Math.random() * 120),
    demo: true,
  });
}
rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.writeFileSync(DATA, JSON.stringify(rows, null, 2), 'utf8');
console.log(`✅ تم توليد ${n} ردًا تجريبيًا في data/responses.json`);
