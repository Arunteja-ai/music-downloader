// High-Performance In-Memory LRU Cache for Auto-Suggestions
const fetchWithTimeout = require('../lib/fetch-with-timeout');
const suggestCache = new Map();
const MAX_SUGGEST_CACHE = 500;
const SUGGEST_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSuggestCache(key) {
  const item = suggestCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > SUGGEST_TTL_MS) {
    suggestCache.delete(key);
    return null;
  }
  return item.data;
}

function setSuggestCache(key, data) {
  if (suggestCache.size >= MAX_SUGGEST_CACHE) {
    const oldestKey = suggestCache.keys().next().value;
    suggestCache.delete(oldestKey);
  }
  suggestCache.set(key, { data, time: Date.now() });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = (req.query && req.query.q) || '';
  if (!query || query.trim().length < 2) {
    return res.status(200).json({ suggestions: [] });
  }
  if (query.length > 160) {
    return res.status(400).json({ error: 'Search query is too long' });
  }

  const key = query.trim().toLowerCase();
  const cached = getSuggestCache(key);
  if (cached) {
    res.setHeader('X-Edge-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 3500);
    if (!response.ok) throw new Error(`Suggestion provider returned ${response.status}`);
    const data = await response.json();
    const suggestions = [];

    if (data && data.songs && data.songs.data) {
      for (const item of data.songs.data.slice(0, 7)) {
        let art = item.image || '';
        if (art) {
          art = art.replace('50x50', '150x150');
        }
        suggestions.push({
          id: item.id,
          title: item.title ? item.title.replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '',
          description: item.description ? item.description.replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '',
          image: art
        });
      }
    }

    const payload = { suggestions };
    setSuggestCache(key, payload);
    res.setHeader('X-Edge-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ suggestions: [] });
  }
};
