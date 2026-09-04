self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  const options = {
    body: 'New DNI Mail available.',
    tag: 'dni-mail-background',
    renotify: true,
    icon: '/src/images/dni-helmet-icon.webp',
    data: { url: '/mail' }
  };
  event.waitUntil(self.registration.showNotification('DNI Mail', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/mail', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (!client?.url) continue;
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) await client.focus();
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});