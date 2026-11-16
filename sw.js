// Ultra-Fast PWA Service Worker (V4 - High-Speed Cache Engine)
const CACHE_NAME = 'musicpro-v4-cache';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 1. Completely bypass service worker for audio streams, CDNs, WebRTC & APIs
  // to ensure native AVPlayer zero-latency background lock-screen streaming
  if (
    e.request.destination === 'audio' ||
    e.request.destination === 'video' ||
    url.includes('.mp4') ||
    url.includes('.mp3') ||
    url.includes('.m4a') ||
    url.includes('saavncdn.com') ||
    url.includes('jio.com') ||
    url.includes('apple.com') ||
    url.includes('peerjs') ||
    url.includes('/.netlify/functions/') ||
    url.includes('/api/') ||
    e.request.method !== 'GET'
  ) {
    return;
  }

  // 2. Stale-While-Revalidate for HTML & static assets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
