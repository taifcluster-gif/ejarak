/* يعمل التطبيق بدون إنترنت: نخزّن ملفاته أول مرة ونفتحه منها.
   غيّر رقم VERSION كل ما عدّلت أي ملف عشان يتحدث عند المستخدمين. */
const VERSION = 'v3';
const CACHE = 'daftar-amarati-' + VERSION;
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/i18n.js', './js/logic.js', './js/store.js', './js/ui.js', './js/views.js', './js/native.js', './js/main.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
