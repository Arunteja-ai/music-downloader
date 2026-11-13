const CACHE_NAME = 'music-downloader-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let network handle API and audio streams
  if (e.request.url.includes('/api/') || e.request.url.includes('.mp4') || e.request.url.includes('.mp3')) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
