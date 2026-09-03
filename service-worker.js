const CACHE_NAME = 'pw-posa-shell-v6';
const BADGE_STATE_CACHE = 'pw-posa-badge-state-v1';
const BADGE_STATE_URL = new URL('./__pw_posa_badge_count__', self.location.href).href;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './enhancements.css',
  './hotfix.css',
  './logo_planet.svg',
  './app-icon.svg',
  './icon-192-v2.png',
  './icon-512-v2.png',
  './icon-1024-v2.png',
  './icon-maskable-512-v2.png',
  './apple-touch-icon-v2.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => ![CACHE_NAME, BADGE_STATE_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil((async () => {
    const explicitBadge = [data.badgeCount, data.badge_count, data.badge]
      .map(value => Number(value))
      .find(value => Number.isFinite(value) && value >= 0);
    const badgeCount = explicitBadge == null
      ? (await readBadgeCount()) + 1
      : Math.floor(explicitBadge);

    await writeBadgeCount(badgeCount);

    const title = data.title || 'PW Posa';
    const options = {
      body: data.body || 'Hai una nuova notifica.',
      icon: './icon-192-v2.png',
      silent: false,
      vibrate: [220, 100, 220],
      data: { url: data.url || './', badgeCount },
      tag: data.tag || 'pw-posa',
      renotify: true
    };

    const tasks = [self.registration.showNotification(title, options)];
    if ('setAppBadge' in self.navigator) {
      tasks.push(self.navigator.setAppBadge(badgeCount).catch(error => {
        console.warn('PW Posa: badge non disponibile', error);
      }));
    }
    await Promise.all(tasks);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.href).href;

  event.waitUntil((async () => {
    await clearStoredBadge();
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PW_POSA_CLEAR_BADGE') {
    event.waitUntil(clearStoredBadge());
  }
});

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    const response = await cache.match(BADGE_STATE_URL);
    if (!response) return 0;
    const value = Number(await response.text());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

async function writeBadgeCount(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    await cache.put(
      BADGE_STATE_URL,
      new Response(String(safeCount), { headers: { 'Content-Type': 'text/plain' } })
    );
  } catch (error) {
    console.warn('PW Posa: conteggio badge non salvato', error);
  }
}

async function clearStoredBadge() {
  await writeBadgeCount(0);
  try {
    if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
    else if ('setAppBadge' in self.navigator) await self.navigator.setAppBadge(0);
  } catch (error) {
    console.warn('PW Posa: badge non rimosso', error);
  }
}
