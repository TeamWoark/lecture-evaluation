/**
 * تغيير كلمة مرور الأدمن:
 *   node scripts/set-password.js "كلمة-المرور-الجديدة"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'site.json');
const password = process.argv[2];

if (!password || password.length < 6) {
  console.error('❌ استخدم: node scripts/set-password.js "كلمة-مرور-من-6-أحرف-على-الأقل"');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
cfg.auth = cfg.auth || {};
const salt = crypto.randomBytes(16).toString('hex');
cfg.auth.password_hash = `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
cfg.auth.secret = crypto.randomBytes(32).toString('hex'); // إنهاء كل الجلسات الحالية
fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
console.log('✅ تم تحديث كلمة مرور الأدمن بنجاح.');
