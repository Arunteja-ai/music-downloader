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
    const url96 = rawUrl.replace(/_160\.mp4|_320\.mp4/, '_96.mp4');
    return { url320, url160, url96 };
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
      const artHigh = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      const artMed = (item.artworkUrl100 || '').replace('100x100bb', '300x300bb');
      const preview = item.previewUrl;
      const durSec = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0;
      const mins = Math.floor(durSec / 60);
      const secs = (durSec % 60).toString().padStart(2, '0');

      return {
        id: 'itunes_' + item.trackId,
        title: item.trackName || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || '',
        year: item.releaseDate ? item.releaseDate.substring(0, 4) : '',
        duration: durSec ? `${mins}:${secs}` : '',
        durationSec: durSec,
        imageHigh: artHigh,
        imageMed: artMed,
        artwork: artHigh || artMed,
        audioUrl: preview,
        audioUrl160: preview,
        audioUrl96: preview,
        url320: preview,
        url160: preview,
        url96: preview,
        isFullSong: false,
        source: 'Audio'
      };
    });
  } catch (e) {
    return [];
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const query = event.queryStringParameters ? event.queryStringParameters.q : null;
  if (!query) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing query parameter q' })
    };
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
        const decryptedUrls = decryptMediaUrl(song.encrypted_media_url);
        if (!decryptedUrls) continue;

        const rawImg = song.image || '';
        const imageHigh = rawImg.replace(/150x150\.jpg$/, '500x500.jpg');
        const imageMed = rawImg.replace(/150x150\.jpg$/, '250x250.jpg');
        const durSec = parseInt(song.duration, 10) || 0;
        const mins = Math.floor(durSec / 60);
        const secs = (durSec % 60).toString().padStart(2, '0');

        results.push({
          id: song.id,
          title: decodeEntities(song.song),
          artist: decodeEntities(song.primary_artists || song.singers || song.music || ''),
          album: decodeEntities(song.album),
          year: song.year,
          duration: durSec ? `${mins}:${secs}` : 'Full Song',
          durationSec: durSec,
          imageHigh,
          imageMed,
          artwork: imageHigh || imageMed,
          audioUrl: decryptedUrls.url320,
          audioUrl160: decryptedUrls.url160,
          audioUrl96: decryptedUrls.url96,
          url320: decryptedUrls.url320,
          url160: decryptedUrls.url160,
          url96: decryptedUrls.url96,
          isFullSong: true,
          source: 'JioSaavn 320kbps Akamai CDN'
        });
      }
    }

    if (results.length === 0) {
      const fallback = await searchItunesFallback(query);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ results: fallback, fallback: true })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ results, fallback: false })
    };
  } catch (error) {
    const fallback = await searchItunesFallback(query);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ results: fallback, fallback: true, error: error.message })
    };
  }
};
