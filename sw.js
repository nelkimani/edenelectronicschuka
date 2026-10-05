/* Eden Electronics Chuka — service worker
   Offline-first: the app opens instantly from cache (even with no internet) and refreshes quietly in the background.
   All shop data (sales, stock, expenses) lives in the device's own storage, so a till keeps working offline.
   To ship an update: upload the new index.html, and bump VERSION below so every device picks it up. */
const VERSION = 'eden-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-96.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);                       // the app itself must cache, or install fails and retries
    await Promise.allSettled(CDN.map(async (u) => {  // libraries/fonts: best effort
      const res = await fetch(u, { mode: u.includes('cdnjs') ? 'cors' : 'no-cors' });
      await cache.put(u, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function tell(msg) {
  const all = await self.clients.matchAll({ type: 'window' });
  all.forEach(c => c.postMessage(msg));
}

// Serve from cache straight away; refresh the cache in the background. Tell the page when the app file changed.
async function staleWhileRevalidate(request, cacheKey, announce) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  const refresh = fetch(request).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      if (announce && cached) {
        const a = cached.headers.get('etag') || cached.headers.get('last-modified') || cached.headers.get('content-length');
        const b = res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length');
        if (a && b && a !== b) tell({ type: 'EDEN_UPDATE' });
      }
      await cache.put(cacheKey, res.clone());
    }
    return res;
  }).catch(() => null);
  if (cached) { refresh.catch(() => {}); return cached; }
  const fresh = await refresh;
  return fresh || new Response('Offline — open Eden once with internet to finish setting up.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, './index.html', true));
    return;
  }
  if (url.origin === self.location.origin || FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, req, false));
  }
});
