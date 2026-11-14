# نشر الموقع على لينك عام (Render) — 4 خطوات

> المطلوب: حساب GitHub + حساب Render (مجاني).
> ملف `.env` **غير مضمّن** في الحزمة لأسباب أمنية — قيم المتغيرات موجودة في آخر هذا الملف.

## 1) ارفع الكود على GitHub
1. من GitHub: **New repository** → الاسم `lecture-evaluation` → Public → Create.
2. في صفحة المستودع: **Add file → Upload files**.
3. اسحب **محتويات** مجلد `lecture-site` كلها (بعد فك ضغط `lecture-site.zip`) ما عدا `node_modules` و `.env` → Commit changes.

## 2) أنشئ الخدمة على Render
- **الأسهل (Blueprint):** افتح الرابط ده بعد ما تعرف اسم المستخدم بتاعك:
  `https://render.com/deploy?repo=https://github.com/<USERNAME>/lecture-evaluation`
  ووافق على الصلاحيات → Render هيقرأ `render.yaml` ويطلب منك قيم المتغيرات.
- **يدويًا:** Render → New → **Web Service** → اختر المستودع → Runtime: `Node`
  - Build Command: `npm install`
  - Start Command: `node server.js`

## 3) أضف متغيرات البيئة (Environment)
| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://yxzqadwsvjezqslhlrup.supabase.co` |
| `SUPABASE_SERVICE_KEY` | مفتاح `service_role` الموجود في ملف `.env` بالمشروع |
| `SUPABASE_TABLE` | `evaluations` |

## 4) استلم اللينكات
بعد أول نشر (٢–٣ دقائق) هيبقى عندك:

- الموقع: `https://<اسم-الخدمة>.onrender.com`
- التقييم: `https://<اسم-الخدمة>.onrender.com/evaluation`
- الأدمن: `https://<اسم-الخدمة>.onrender.com/admin`  (كلمة السر: `admin123` — غيّرها بـ `npm run set-password -- "كلمة جديدة"` أو من `config/site.json`)
- ملصق QR: `https://<اسم-الخدمة>.onrender.com/qr`

> كود QR بيتولّد تلقائيًا من دومين الموقع، فالملصق هيتحدّث لوحده على اللينك الجديد.
> ملاحظة: الخطة المجانية في Render بتنام بعد فترة خمول وبتصحى في ~٥٠ ثانية أول زيارة.
