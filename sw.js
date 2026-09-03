const CACHE_NAME = 'pw-posa-v7';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './app-icon.svg',
  './notification-badge.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'PW Posa';
  const options = {
    body: payload.body || 'Hai una nuova notifica.',
    icon: './icon-192-v2.png',
    badge: './notification-badge.svg',
    vibrate: [200, 100, 200],
    silent: false,
    tag: payload.tag || ('pw-posa-' + Date.now()),
    renotify: true,
    data: {
      url: payload.url || './',
      ...(payload.data || {})
    }
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      updateAppBadge(1, true)
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;

  event.waitUntil((async () => {
    await clearAppBadge();
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch (e) {}
        }
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'CLEAR_APP_BADGE') {
    event.waitUntil(clearAppBadge());
  } else if (type === 'SET_APP_BADGE') {
    const count = Number(event.data?.count || 0);
    event.waitUntil(count > 0 ? updateAppBadge(count, false) : clearAppBadge());
  }
});

async function updateAppBadge(amount = 1, increment = true) {
  if (!('setAppBadge' in self.navigator)) return;
  try {
    let next = amount;
    if (increment) {
      const current = Number((await getStoredBadge()) || 0);
      next = current + amount;
    }
    await setStoredBadge(next);
    await self.navigator.setAppBadge(next);
  } catch (e) {}
}

async function clearAppBadge() {
  try {
    await setStoredBadge(0);
    if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
    else if ('setAppBadge' in self.navigator) await self.navigator.setAppBadge(0);
  } catch (e) {}
}

function getStoredBadge() {
  return Promise.resolve(Number(self.__pwBadgeCount || 0));
}

function setStoredBadge(value) {
  self.__pwBadgeCount = Number(value || 0);
  return Promise.resolve();
}
