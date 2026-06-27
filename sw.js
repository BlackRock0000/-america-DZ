// Service Worker بسيط لتفعيل خاصية "تثبيت كتطبيق" (PWA)
// ✅ تحديث مهم بطلب صريح: التطبيق لا يجوز أن يعمل إطلاقاً بدون اتصال بالإنترنت.
// السبب: لو فُتح من كاش قديم بدون إنترنت، يستطيع المستخدم التسجيل/الضغط على أزرار وكل تفاعل
// يبدو طبيعياً، لكن لا شيء منه يصل فعلياً لقاعدة البيانات (Supabase)، فيظن أن العملية نجحت بينما
// لم تحدث أبداً — وهذا يخلق بيانات وهمية ومتضاربة عندما يرجع الاتصال لاحقاً. الحل: لا نخزّن أي
// نسخة من index.html في الكاش إطلاقاً، وأي طلب صفحة يفشل بسبب انقطاع الشبكة يُعرض له شاشة
// "غير متصل" واضحة بدل أي نسخة قديمة من التطبيق.
const CACHE_NAME = 'blackrock-app-v32-online-only';

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
  // ✅ لا نخزّن index.html في الكاش إطلاقاً — التثبيت فقط لتفعيل صلاحية "Service Worker" نفسها
  self.skipWaiting();
});

// ✅ استجابة فورية لرسالة من الصفحة لتفعيل النسخة الجديدة بدون انتظار إغلاق التبويبات
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // ✅ حذف أي كاش قديم بالكامل (من إصدارات سابقة كانت تخزّن index.html) — لا نريد أي نسخة قديمة
    // متبقية على أي جهاز يمكن أن تُستخدم بدل صفحة "غير متصل"
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // لا تتدخل أبداً في POST/PATCH/DELETE (كل عمليات الحفظ الحقيقية)

  const url = new URL(req.url);
  // ✅ أي طلب لدومين مختلف عن دومين الموقع نفسه (Supabase، أي API خارجي) يتجاوز الـService Worker
  // بالكامل ويذهب مباشرة للشبكة دون أي تدخل — لو فشل (انقطاع إنترنت)، يفشل بشكل طبيعي تماماً
  // كأن الـService Worker غير موجود، فلا يحصل المستخدم على بيانات قديمة من أي سيرفر خارجي
  if (url.origin !== self.location.origin) {
    return;
  }

  // ✅ لطلبات الصفحة نفسها: شبكة فقط، بدون أي كاش احتياطي. لو فشل الاتصال، نعرض شاشة "غير متصل"
  // واضحة بدل أي نسخة قديمة من index.html قد تعمل بشكل منفصل تماماً عن قاعدة البيانات الحقيقية
  event.respondWith(
    fetch(req).catch(() => {
      return new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    })
  );
});
