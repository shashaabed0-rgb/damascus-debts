const APP_CACHE = 'damascus-debts-app-v1';
const CDN_CACHE = 'damascus-debts-cdn-v1';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './sync.js',
  './reports.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// التثبيت: حفظ ملفات التطبيق للعمل أوفلاين وتفعيل النسخة الجديدة فوراً
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// التفعيل: السيطرة الفورية على جميع الصفحات المفتوحة ومسح أي كاش قديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== CDN_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// استراتيجية الشبكة أولاً (Network-First) لملفات التطبيق لضمان ظهور أي تعديل بالكود فوراً
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // لا نتدخل بطلبات Supabase أبداً
  if (url.hostname.includes('supabase.co')) return;

  // ملفات التطبيق المحلية على نفس النطاق (GitHub Pages)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === 'navigate') return caches.match('./index.html');
          })
        )
    );
    return;
  }

  // المكتبات الخارجية (Supabase SDK / html2canvas / jsPDF): كاش للعمل أوفلاين مع تحديث بالخلفية
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const netPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CDN_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || netPromise;
      })
    );
  }
});
