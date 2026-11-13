const CryptoJS = require('crypto-js');

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
    return { url320, url160 };
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

async function searchItunesFallback(query) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=15`);
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
        source: 'Audio'
      };
    });
  } catch (e) {
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  try {
    const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=25&q=${encodeURIComponent(query)}`;
    const response = await fetch(saavnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.json();
    let results = [];

    if (data && data.results) {
      for (const song of data.results) {
        if (!song.encrypted_media_url) continue;
        const media = decryptMediaUrl(song.encrypted_media_url);
        if (!media) continue;

        let art = song.image || '';
        if (art) {
          art = art.replace('150x150', '500x500').replace('50x50', '500x500');
        }

        const durSec = parseInt(song.duration, 10) || 0;
        const mins = Math.floor(durSec / 60);
        const secs = (durSec % 60).toString().padStart(2, '0');

        results.push({
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
          source: '320kbps'
        });
      }
    }

    if (!results.length) {
      results = await searchItunesFallback(query);
    }

    return res.status(200).json({ success: true, count: results.length, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
