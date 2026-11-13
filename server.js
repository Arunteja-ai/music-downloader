const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const PORT = process.env.PORT || 3000;
const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');

function decryptMediaUrl(encryptedMediaUrl) {
  if (!encryptedMediaUrl) return null;
  try {
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl) },
      DES_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    let rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    const url320 = rawUrl.replace(/_96\.mp4|_160\.mp4/, '_320.mp4');
    const url160 = rawUrl.replace(/_96\.mp4|_320\.mp4/, '_160.mp4');
    const url96 = rawUrl.replace(/_160\.mp4|_320\.mp4/, '_96.mp4');
    return { url320, url160, url96, defaultUrl: url320 };
  } catch (err) {
    return null;
  }
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d));
}

async function searchJioSaavn(query) {
  const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=25&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(saavnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    if (!data || !data.results || !data.results.length) return [];

    const formatted = [];
    for (const song of data.results) {
      if (!song.encrypted_media_url) continue;
      const media = decryptMediaUrl(song.encrypted_media_url);
      if (!media) continue;

      let art = song.image || '';
      if (art) art = art.replace('150x150', '500x500').replace('50x50', '500x500');

      const durSec = parseInt(song.duration, 10) || 0;
      const mins = Math.floor(durSec / 60);
      const secs = (durSec % 60).toString().padStart(2, '0');

      formatted.push({
        id: song.id,
        title: decodeEntities(song.song),
        artist: decodeEntities(song.primary_artists || song.singers || song.music || 'Unknown Artist'),
        album: decodeEntities(song.album || 'Single'),
        year: song.year || '',
        language: song.language || '',
        duration: durSec ? `${mins}:${secs}` : 'Full Song',
        durationSec: durSec,
        artwork: art,
        audioUrl: media.url320,
        audioUrl160: media.url160,
        audioUrl96: media.url96,
        isFullSong: true,
        source: 'JioSaavn 320kbps'
      });
    }
    return formatted;
  } catch (err) {
    return [];
  }
}

async function searchItunes(query) {
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=15`;
  try {
    const res = await fetch(itunesUrl);
    const data = await res.json();
    if (!data.results) return [];

    return data.results.map(item => {
      const art = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb.jpg', '500x500bb.jpg') : '';
      const durSec = item.trackTimeMillis ? Math.floor(item.trackTimeMillis / 1000) : 0;
      const mins = Math.floor(durSec / 60);
      const secs = (durSec % 60).toString().padStart(2, '0');

      return {
        id: item.trackId,
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName || 'Single',
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : '',
        language: 'Global',
        duration: durSec ? `${mins}:${secs}` : '',
        durationSec: durSec,
        artwork: art,
        audioUrl: item.previewUrl,
        audioUrl160: item.previewUrl,
        audioUrl96: item.previewUrl,
        isFullSong: false,
        source: 'iTunes Audio'
      };
    });
  } catch (err) {
    return [];
  }
}

function resolveStaticFile(reqPath) {
  const candidates = [
    path.join(__dirname, reqPath),
    path.join(__dirname, 'public', reqPath),
    path.join(process.cwd(), reqPath),
    path.join(process.cwd(), 'public', reqPath)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Autocomplete endpoint
  if (pathname === '/api/suggest') {
    const q = parsedUrl.query.q;
    if (!q || q.length < 2) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ suggestions: [] }));
      return;
    }
    try {
      const suggestUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(q)}`;
      const response = await fetch(suggestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const data = await response.json();
      const suggestions = [];
      if (data && data.songs && data.songs.data) {
        for (const item of data.songs.data.slice(0, 7)) {
          let art = item.image || '';
          if (art) art = art.replace('50x50', '150x150');
          suggestions.push({
            id: item.id,
            title: decodeEntities(item.title),
            description: decodeEntities(item.description),
            image: art
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ suggestions }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ suggestions: [] }));
    }
    return;
  }

  // Search API endpoint
  if (pathname === '/api/search') {
    const query = parsedUrl.query.q;
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing search query q' }));
      return;
    }

    try {
      let results = await searchJioSaavn(query);
      if (!results.length) {
        results = await searchItunes(query);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: results.length, results }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Static file handling
  let reqPath = (pathname === '/' || !pathname) ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = resolveStaticFile(reqPath);

  if (filePath) {
    let contentType = 'text/plain';
    if (filePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    else if (filePath.endsWith('.js')) contentType = 'application/javascript';
    else if (filePath.endsWith('.json')) contentType = 'application/json';
    else if (filePath.endsWith('.css')) contentType = 'text/css';
    else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (filePath.endsWith('.png')) contentType = 'image/png';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback to index.html for any SPA routes
  const fallbackIndex = resolveStaticFile('index.html');
  if (fallbackIndex) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fallbackIndex).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = server;
