// Service Worker بسيط لتفعيل خاصية "تثبيت كتطبيق" (PWA)
// ✅ إصلاح جذري: لا يجوز اعتراض أي طلب لقاعدة البيانات (Supabase) أو أي API خارجي إطلاقاً —
// كان الإصدار السابق يعترض كل طلبات GET بما فيها استدعاءات السيرفر الحقيقية، فيُرجع بيانات قديمة
// من الكاش عند أي تأخر شبكة بسيط، وهذا يفسر تماماً: عمل التطبيق "بدون إنترنت" ببيانات ميتة،
// وعدم وصول السحب/الشحن/الإحالات/أوامر الأدمن بشكل موثوق للنسخة المثبّتة.
// الآن: نخزّن فقط شكل الصفحة نفسها (index.html)، ونتجاهل تماماً أي طلب لدومين خارجي (Supabase وغيره).
const CACHE_NAME = 'blackrock-app-v28-light-helpdesk';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // لا تتدخل أبداً في POST/PATCH/DELETE (كل عمليات الحفظ الحقيقية)

  const url = new URL(req.url);
  // ✅ أي طلب لدومين مختلف عن دومين الموقع نفسه (Supabase، أي API خارجي) يتجاوز الـService Worker بالكامل
  // ويذهب مباشرة للشبكة دون أي كاش أو نسخة احتياطية — تماماً كسلوك المتصفح العادي بدون تثبيت
  if (url.origin !== self.location.origin) {
    return; // لا event.respondWith() = يمر الطلب كما هو، بلا أي تدخل من الـService Worker
  }

  // فقط لملف الصفحة نفسه: شبكة أولاً دائماً، والكاش فقط كحل أخير عند انقطاع حقيقي للإنترنت
  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
        return response;
      })
      .catch(() => caches.match(req))
  );
});
