const CACHE_NAME = 'music-downloader-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Completely bypass service worker for media streams, CDNs, and API calls to ensure native background streaming
  if (
    e.request.destination === 'audio' ||
    e.request.destination === 'video' ||
    e.request.url.includes('.mp4') ||
    e.request.url.includes('.mp3') ||
    e.request.url.includes('.m4a') ||
    e.request.url.includes('saavncdn.com') ||
    e.request.url.includes('jio.com') ||
    e.request.url.includes('/.netlify/functions/') ||
    e.request.url.includes('/api/')
  ) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
