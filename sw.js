const CACHE_NAME = 'wind-blender-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        './','./index.html','./styles.css','./script.js',
        './manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Voor de data: netwerk-first -> altijd de nieuwste latest.json
  if (url.pathname.endsWith('/data/latest.json')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Voor alles anders: cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
