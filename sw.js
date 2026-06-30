// Service Worker بسيط لتفعيل خاصية "تثبيت كتطبيق" (PWA)
// ✅ online-only: لا كاش لـ index.html، التطبيق يعمل بالإنترنت فقط
const CACHE_NAME = 'blackrock-app-v33-online-only';

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>غير متصل بالإنترنت</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#030912;color:#DDE4EF;font-family:-apple-system,"Segoe UI",Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .box{max-width:380px;text-align:center;}
  .ico{font-size:64px;margin-bottom:18px;}
  h1{color:#FFD700;font-size:20px;font-weight:900;margin-bottom:22px;}
  button{background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;border:none;border-radius:12px;padding:13px 28px;font-size:14px;font-weight:900;font-family:inherit;cursor:pointer;}
  button:active{transform:scale(0.97);}
</style>
</head>
<body>
  <div class="box">
    <div class="ico">📡</div>
    <h1>يرجى الاتصال بالإنترنت</h1>
    <button onclick="location.reload()">🔄 إعادة المحاولة</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  // ✅ لا نخزّن index.html — التثبيت فقط لتفعيل PWA
  // skipWaiting فوراً لتفعيل النسخة الجديدة بدون انتظار
  self.skipWaiting();
});

// ✅ استجابة فورية لرسالة SKIP_WAITING من الصفحة
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // ✅ حذف كل الكاش القديم — يجبر كل الأجهزة على جلب النسخة الجديدة
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ✅ طلبات خارجية (Supabase, APIs) → شبكة مباشرة بدون تدخل
  if (url.origin !== self.location.origin) return;

  // ✅ طلبات الصفحة → شبكة فقط، بدون كاش
  // إذا فشل الاتصال → شاشة "غير متصل" واضحة
  event.respondWith(
    fetch(req, {cache: 'no-store'}).catch(() => {
      return new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    })
  );
});
