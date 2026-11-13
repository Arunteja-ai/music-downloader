function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d));
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
      body: JSON.stringify({ suggestions: [] })
    };
  }

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.json();
    let suggestions = [];

    if (data && data.songs && data.songs.data) {
      for (const item of data.songs.data) {
        suggestions.push({
          title: decodeEntities(item.title),
          description: decodeEntities(item.description || item.more_info?.primary_artists || ''),
          image: (item.image || '').replace('50x50.jpg', '150x150.jpg')
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ suggestions: suggestions.slice(0, 7) })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ suggestions: [] })
    };
  }
};
