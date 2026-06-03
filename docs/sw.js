const CACHE = 'minotes-static-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.svg',
  './icon-512.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'show-notification') {
    self.registration.showNotification(e.data.title || 'minotes', {
      body: e.data.body || '',
      icon: './icon-192.svg',
      tag: 'minotes-reminder',
    });
  }
});
