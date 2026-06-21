// Service Worker بسيط لتفعيل خاصية "تثبيت كتطبيق" (PWA)
// لا يغيّر أي منطق بالتطبيق — فقط يخزّن نسخة من الصفحة للعمل دون إنترنت إن انقطع مؤقتاً
const CACHE_NAME = 'blackrock-app-v1';
const APP_SHELL = ['./index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// شبكة أولاً، وإن فشلت نرجع للنسخة المخزّنة (يضمن أن المستخدم يحصل دائماً على آخر تحديث عند توفر الإنترنت)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
