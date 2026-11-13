const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const PORT = process.env.PORT || 3000;
const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');

// Decrypt JioSaavn media URL into direct CDN stream
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

    // Provide 320kbps (highest quality) and 160kbps fallback
    const url320 = rawUrl.replace(/_96\.mp4|_160\.mp4/, '_320.mp4');
    const url160 = rawUrl.replace(/_96\.mp4|_320\.mp4/, '_160.mp4');
    return { url320, url160, defaultUrl: url320 };
  } catch (err) {
    return null;
  }
}

// Clean HTML entities from string
function decodeEntities(encodedString) {
  if (!encodedString) return '';
  const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
  const translate = {
    "nbsp": " ",
    "amp": "&",
    "quot": "\"",
    "lt": "<",
    "gt": ">"
  };
  return encodedString.replace(translate_re, function(match, entity) {
    return translate[entity];
  }).replace(/&#(\d+);/gi, function(match, numStr) {
    const num = parseInt(numStr, 10);
    return String.fromCharCode(num);
  });
}

// Search JioSaavn API for full songs
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

      // HD artwork (500x500)
      let art = song.image || '';
      if (art) {
        art = art.replace('150x150', '500x500').replace('50x50', '500x500');
      }

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
        artwork: art,
        audioUrl: media.url320,
        audioFallback: media.url160,
        isFullSong: true,
        source: 'JioSaavn 320kbps'
      });
    }
    return formatted;
  } catch (err) {
    console.error('JioSaavn search error:', err.message);
    return [];
  }
}

// Global iTunes search fallback
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
        artwork: art,
        audioUrl: item.previewUrl,
        isFullSong: false,
        source: 'iTunes Audio'
      };
    });
  } catch (err) {
    return [];
  }
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
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

  // Search API endpoint
  if (pathname === '/api/search') {
    const query = parsedUrl.query.q;
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing search query q' }));
      return;
    }

    try {
      // Primary: JioSaavn full 320kbps songs
      let results = await searchJioSaavn(query);

      // If no results on Saavn, fallback to iTunes
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

  // Serve static index.html
  if (pathname === '/' || pathname === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  // 404 for other paths
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Mobile network URL: http://10.150.10.158:${PORT}`);
});
