module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.q;
  if (!query || query.length < 2) {
    return res.status(200).json({ suggestions: [] });
  }

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
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

    return res.status(200).json({ suggestions });
  } catch (err) {
    return res.status(200).json({ suggestions: [] });
  }
};
