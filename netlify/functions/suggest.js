// High-Performance In-Memory LRU Cache for Auto-Suggestions
const fetchWithTimeout = require('../../lib/fetch-with-timeout');
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

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600, s-maxage=7200'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { ...headers, Allow: 'GET, OPTIONS' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const query = (event.queryStringParameters && event.queryStringParameters.q) || '';
  if (!query || query.trim().length < 2) {
    return { statusCode: 200, headers, body: JSON.stringify({ suggestions: [] }) };
  }
  if (query.length > 160) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Search query is too long' }) };
  }

  const key = query.trim().toLowerCase();
  const cached = getSuggestCache(key);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify(cached) };
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
    return { statusCode: 200, headers, body: JSON.stringify(payload) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ suggestions: [] }) };
  }
};
