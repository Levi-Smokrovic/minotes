/* =====================================================================
   minotes — Service Worker
   ===================================================================== */
const CACHE = 'minotes-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([
      '/',
      '/static/css/style.css',
      '/static/js/app.js',
      '/manifest.json',
      'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600&display=swap',
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Offline fallback: serve from cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Listen for notification display messages from the client
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'show-notification') {
    self.registration.showNotification(e.data.title || 'minotes', {
      body: e.data.body || '',
      icon: '/static/icon-192.svg',
      tag: 'minotes-reminder',
    });
  }
});
