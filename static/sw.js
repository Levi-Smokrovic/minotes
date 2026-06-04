/* ====================================================================
   minotes — Service Worker (notifications only, no caching)
   ==================================================================== */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

/** Show a notification. Called either via postMessage from client
 *  or directly via reg.showNotification() from the client page.
 *  We keep the message handler as a secondary path for robustness. */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'show-notification') return;
  const { title, body, tag, icon } = e.data;
  showNotif(title, body, tag, icon, e.data.url);
});

/** Helper: show notification with consistent options. */
function showNotif(title, body, tag, icon, url) {
  self.registration.showNotification(title || 'minotes', {
    body: body || '',
    icon: icon || '/static/icon-192.svg',
    tag: tag || 'minotes-notif',
    data: { url: url || '/' },
  });
}

/** Focus the app window when user clicks a notification. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Try to focus an existing minotes window
      for (const c of list) {
        if (c.url.includes('minotes') && 'focus' in c) {
          return c.focus();
        }
      }
      // Try to focus any window from this origin
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      // Open new window as last resort
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
