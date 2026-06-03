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
  console.log('[SW] Install event');
  e.waitUntil(caches.open(CACHE).then(c => { console.log('[SW] Caching assets'); return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activate event');
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', (e) => {
  console.log('[SW] Message received:', e.data?.type);
  if (e.data?.type === 'show-notification') {
    console.log('[SW] Showing notification:', e.data.title);
    self.registration.showNotification(e.data.title || 'minotes', {
      body: e.data.body || '',
      icon: './icon-192.svg',
      tag: 'minotes-reminder',
    }).then(() => console.log('[SW] Notification shown'));
  }
});

// Handle notification click — focus or open the app
self.addEventListener('notificationclick', (e) => {
  console.log('[SW] Notification clicked:', e.notification.tag, e.notification.title);
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      console.log('[SW] Found clients:', clientList.length);
      for (const client of clientList) {
        if (client.url.includes('minotes') && 'focus' in client) {
          console.log('[SW] Focusing existing client');
          return client.focus();
        }
      }
      console.log('[SW] Opening new window');
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
