/* ====================================================================
   minotes - Service Worker (notifications only, no caching)
   ==================================================================== */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

/**
 * Handle NOTIFY messages from the client page.
 * The client sends { type: 'NOTIFY', title, body, tag, icon, url }
 * and we show the notification via the SW registration.
 */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'NOTIFY') return;
  const { title, body, tag, icon, url } = e.data;
  self.registration.showNotification(title || 'minotes', {
    body: body || '',
    icon: icon || './icon-192.svg',
    tag: tag || 'minotes-notif',
    renotify: true,
    sticky: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: url || './' },
  });
});

/**
 * When user clicks the notification, focus or open the app.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 1) Find exact URL match
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      // 2) Any window on this origin
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      // 3) Open new window as last resort
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
