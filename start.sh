#!/bin/bash
# تشغيل الموقع مع تثبيت الحزم تلقائيًا إن لم تكن موجودة
cd "$(dirname "$0")"
[ -d node_modules/express ] || npm install --silent
exec node server.js
