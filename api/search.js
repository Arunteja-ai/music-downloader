const CryptoJS = require('crypto-js');

const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');

// High-Performance In-Memory LRU Cache for Ultra-Fast repeat responses (<5ms)
const searchMemoryCache = new Map();
const MAX_CACHE_SIZE = 400;
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes TTL

function getCache(key) {
  const item = searchMemoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL_MS) {
    searchMemoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  if (searchMemoryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = searchMemoryCache.keys().next().value;
    searchMemoryCache.delete(oldestKey);
  }
  searchMemoryCache.set(key, { data, time: Date.now() });
}

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

function getCoreTitle(t) {
  if (!t) return '';
  return t
    .replace(/\s*\|.*$/, '')
    .replace(/\s*-\s*(?:From|Single|EP|OST|Soundtrack|Remix).*$/i, '')
    .replace(/\((?:From|Telugu|Hindi|Tamil|Kannada|Malayalam|Film|Official|Full|Lyric|Audio|Original|Soundtrack).*?\)/gi, '')
    .replace(/\[(?:From|Telugu|Hindi|Tamil|Kannada|Malayalam|Film|Official|Full|Lyric|Audio|Original|Soundtrack).*?\]/gi, '')
    .trim();
}

function deduplicateTracks(tracks) {
  const seen = new Map();
  const cleaned = [];

  for (const song of tracks) {
    if (!song || !song.title) continue;
    const coreT = getCoreTitle(song.title).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!coreT) continue;
    const songArtists = (song.artist || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);

    let isDup = false;
    for (const [key, existing] of seen.entries()) {
      if (existing.coreT === coreT) {
        const hasSharedArtist = songArtists.some(w => existing.artists.includes(w));
        if (hasSharedArtist || songArtists.length === 0 || existing.artists.length === 0) {
          isDup = true;
          break;
        }
      }
    }
    if (!isDup) {
      seen.set(song.id || `${coreT}_${song.artist}`, { coreT, artists: songArtists });
      cleaned.push(song);
    }
  }
  return cleaned;
}

const CATEGORY_DISCOVERY_WORDS = new Set([
  'telugu', 'tamil', 'hindi', 'english', 'punjabi', 'malayalam', 'kannada',
  'bhojpuri', 'bengali', 'marathi', 'gujarati',
  'song', 'songs', 'hit', 'hits', 'dj', 'remix', 'mix', 'mashup',
  'party', 'dance', 'mass', 'beat', 'beats', 'bass',
  'love', 'romantic', 'romance', 'sad', 'melody', 'melodies',
  'trending', 'viral', 'top', 'best', 'latest', 'new', 'all'
]);

function rankTracks(tracks, query) {
  if (!query || !tracks.length) return tracks;
  const qClean = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const qTokens = qClean.split(/\s+/).filter(w => w.length > 1);

  const isCategoryQuery = qTokens.some(token => CATEGORY_DISCOVERY_WORDS.has(token));

  // Filter out completely unrelated tracks for garbage/typo queries,
  // but preserve discovery/genre/language queries
  let validTracks = tracks;
  if (!isCategoryQuery && qTokens.length > 0) {
    validTracks = tracks.filter(t => {
      const text = ((t.title || '') + ' ' + (t.artist || '') + ' ' + (t.album || '') + ' ' + (t.language || '')).toLowerCase();
      return qTokens.some(token => text.includes(token));
    });
  }

  if (validTracks.length === 0) return [];

  return validTracks.map((track, originalIdx) => {
    let score = 0;
    const titleClean = (track.title || '').toLowerCase();
    const artistClean = (track.artist || '').toLowerCase();
    const albumClean = (track.album || '').toLowerCase();

    // Exact title match gets highest bonus
    if (titleClean === qClean || titleClean.startsWith(qClean)) {
      score += 100;
    } else if (titleClean.includes(qClean)) {
      score += 60;
    }

    // Exact artist match
    if (artistClean === qClean || qClean.includes(artistClean)) {
      score += 90;
    }

    // Token matches in title & artist
    qTokens.forEach(token => {
      if (titleClean.includes(token)) score += 30;
      if (artistClean.includes(token)) score += 40;
      if (albumClean.includes(token)) score += 5;
    });

    // Penalize karaoke/covers/fingerstyle if user didn't explicitly request them
    const isCover = titleClean.includes('cover') || titleClean.includes('karaoke') || titleClean.includes('tribute') || titleClean.includes('fingerstyle') || titleClean.includes('piano') || titleClean.includes('instrumental');
    const userWantsCover = qClean.includes('cover') || qClean.includes('karaoke') || qClean.includes('tribute') || qClean.includes('piano') || qClean.includes('instrumental');
    if (isCover && !userWantsCover) {
      score -= 100;
    }

    if (track.isFullSong) score += 20;

    return { track, score, originalIdx };
  })
  .sort((a, b) => b.score - a.score || a.originalIdx - b.originalIdx)
  .map(item => item.track);
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = (req.query && req.query.q) || '';
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  const cacheKey = query.trim().toLowerCase();
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Edge-Cache', 'HIT');
    return res.status(200).json(cached);
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
          language: song.language || '',
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

    // Check if query specified an artist or title that JioSaavn poorly matched or only returned covers
    const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const hasArtistInResults = results.some(r => {
      const art = (r.artist || '').toLowerCase();
      return qWords.some(w => art.includes(w));
    });

    const isCoverOrKaraokeHeavy = results.length > 0 && results.every(r => {
      const t = (r.title || '').toLowerCase();
      return t.includes('cover') || t.includes('karaoke') || t.includes('tribute') || t.includes('instrumental') || t.includes('piano');
    });

    const isCategoryQuery = qWords.some(w => CATEGORY_DISCOVERY_WORDS.has(w));
    const shouldCheckItunes = (results.length === 0) || isCoverOrKaraokeHeavy || (!isCategoryQuery && !hasArtistInResults && results.length < 5);

    if (shouldCheckItunes) {
      try {
        const itunesTracks = await searchItunesFallback(query);
        if (itunesTracks.length > 0) {
          results = [...itunesTracks, ...results];
        }
      } catch(e) {}
    }

    if (results.length > 0) {
      results = deduplicateTracks(results);
      results = rankTracks(results, query);
    }

    if (results.length === 0) {
      const payload = { results: [], fallback: false };
      setCache(cacheKey, payload);
      res.setHeader('X-Edge-Cache', 'MISS');
      return res.status(200).json(payload);
    }

    const payload = { results, fallback: false };
    setCache(cacheKey, payload);
    res.setHeader('X-Edge-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (error) {
    const fallback = await searchItunesFallback(query);
    const payload = { results: fallback, fallback: true, error: error.message };
    if (fallback.length > 0) {
      setCache(cacheKey, payload);
    }
    return res.status(200).json(payload);
  }
};
