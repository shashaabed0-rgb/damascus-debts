const APP_CACHE = 'damascus-debts-app-v17';
const CDN_CACHE = 'damascus-debts-cdn-v3';

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

const CDN_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// التثبيت: حفظ ملفات التطبيق + مكتبة Supabase ومحرك PDF (html2canvas و jsPDF) للعمل أوفلاين فوراً
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
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
      ),
      caches.open(CDN_CACHE).then((cache) =>
        Promise.all(
          CDN_PRECACHE.map((url) =>
            fetch(url)
              .then((res) => {
                if (res && res.ok) return cache.put(url, res);
              })
              .catch(() => {})
          )
        )
      )
    ])
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

function fetchWithTimeout(reqUrl, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(reqUrl, { cache: 'no-cache' })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// استراتيجية الشبكة أولاً مع مهلة سريعة (3.5 ثانية) لضمان الفتح الفوري أوفلاين أو مع إنترنت ضعيف
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // لا نتدخل بطلبات Supabase API أبداً
  if (url.hostname.includes('supabase.co')) return;

  // ملفات التطبيق المحلية على نفس النطاق (GitHub Pages)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetchWithTimeout(req.url, 3500)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            if (req.mode === 'navigate') return caches.match('./index.html');
          })
        )
    );
    return;
  }

  // المكتبات الخارجية (Supabase SDK / html2canvas / jsPDF): كاش أولاً للعمل أوفلاين فوراً مع تحديث بالخلفية
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(req.url).then((cached) => {
          const netPromise = fetch(req)
            .then((res) => {
              if (res && (res.ok || res.type === 'opaque')) {
                cache.put(req.url, res.clone());
              }
              return res;
            })
            .catch(() => cached);
          return cached || netPromise;
        })
      )
    );
  }
});

// نبضة يومية خفيفة بالخلفية (في حال سمح نظام الجهاز) لإبقاء Supabase نشطاً
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'supabase-keepalive') {
    event.waitUntil(
      fetch('https://oeojvcikwiyiwmenozew.supabase.co/rest/v1/workshops?select=id&limit=1', {
        method: 'GET',
        headers: {
          apikey: 'sb_publishable_Qescc0we7OizukGkCGc29w_kIiBhUHU'
        }
      }).catch(() => {})
    );
  }
});
