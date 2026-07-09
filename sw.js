/* Pulse service worker: cache the app shell so the installed app opens
   instantly and works offline (on demo data). Live API calls always go to
   the network. */

const CACHE = 'pulse-v3';
const SHELL = [
  './',
  'css/styles.css',
  'js/indicators.js',
  'js/patterns.js',
  'js/universe.js',
  'js/uslistings.js',
  'js/data.js',
  'js/live.js',
  'js/schwab.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // never intercept live market-data, brokerage, or serverless API calls
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (url.pathname.includes('/api/')) return;

  // stale-while-revalidate: serve cache immediately, refresh it in the background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const refresh = fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
