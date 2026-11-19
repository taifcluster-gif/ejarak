/* ينسخ ملفات الويب فقط إلى مجلد www ليقرأها Capacitor.
   لا ننسخ sw.js لأن التطبيق الأصلي لا يحتاج service worker. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const items = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const it of items) {
  const src = path.join(root, it);
  if (!fs.existsSync(src)) throw new Error('ملف ناقص: ' + it);
  fs.cpSync(src, path.join(out, it), { recursive: true });
}
console.log('تم نسخ ملفات الويب إلى www:', items.join(', '));
