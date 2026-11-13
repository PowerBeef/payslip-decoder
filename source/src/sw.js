/* Offline support: the app and the PDF reader are cached on first visit. Payslips are never cached or sent anywhere. */
const VERSION = 'pd-__VERSION__';
const CORE = __CORE__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Fresh page when online (so updates arrive), cached page when offline or the network is slow.
    e.respondWith(Promise.race([fetch(req), timeout(4000)])
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); } return res; })
      .catch(() => caches.match('./').then((r) => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
