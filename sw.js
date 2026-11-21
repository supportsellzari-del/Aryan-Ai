/* J.A.R.V.I.S Service Worker
   App shell + background + VRM model caching.
   AI replies, weather and API requests always use network.
*/

const VERSION = 'jarvis-v3';

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'favicon.ico',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/favicon-16.png'
];

// Important assets: cached automatically on first successful load
const IMPORTANT_ASSETS = [
  './assets/background/command-center.jpg',
  './assets/models/lady_avatar_v3.vrm'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache =>
        Promise.allSettled(
          SHELL.map(file => cache.add(file))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== VERSION)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // External requests: never cache
  if (url.origin !== self.location.origin) return;

  // Page navigation: network first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(VERSION).then(cache =>
              cache.put('./index.html', copy)
            );
          }

          return response;
        })
        .catch(async () => {
          return (
            await caches.match('./index.html') ||
            await caches.match('./')
          );
        })
    );

    return;
  }

  // Background image + VRM model: cache first
  const isImportantAsset = IMPORTANT_ASSETS.some(path => {
    return url.pathname.endsWith(
      new URL(path, self.location.href).pathname
    );
  });

  if (isImportantAsset) {
    event.respondWith(
      caches.match(request).then(async cached => {
        if (cached) return cached;

        try {
          const response = await fetch(request);

          if (response.ok) {
            const copy = response.clone();

            const cache = await caches.open(VERSION);
            await cache.put(request, copy);
          }

          return response;

        } catch (error) {
          return new Response(
            'Asset unavailable offline',
            { status: 503 }
          );
        }
      })
    );

    return;
  }

  // Other same-origin files: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(VERSION).then(cache =>
            cache.put(request, copy)
          );
        }

        return response;
      })
      .catch(async () => {
        return await caches.match(request) ||
          new Response('Offline', { status: 503 });
      })
  );
});