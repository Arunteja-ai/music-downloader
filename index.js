const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const searchHandler = require('./api/search');
const suggestHandler = require('./api/suggest');

let cachedHtml = null;
function getHtml() {
  try {
    return fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  } catch (e) {
    return '<!DOCTYPE html><html><body>Error loading index.html</body></html>';
  }
}

function handler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Add query helper for serverless compatibility
  req.query = parsedUrl.query || {};

  // Enhance res with status and json helpers
  if (!res.status) {
    res.status = function(code) {
      res.statusCode = code;
      return res;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };
  }

  if (pathname === '/api/search' || pathname === '/.netlify/functions/search') {
    return searchHandler(req, res);
  }
  if (pathname === '/api/suggest' || pathname === '/.netlify/functions/suggest') {
    return suggestHandler(req, res);
  }
  if (pathname === '/api/health') {
    return res.status(200).json({ status: 'ok', timestamp: Date.now() });
  }

  // Check if static file exists (e.g. favicon, manifest, etc.)
  if (pathname !== '/') {
    const safePath = path.join(__dirname, path.normalize(pathname).replace(/^(\.\.[\/\\])+/, ''));
    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile() && !pathname.includes('node_modules')) {
      return fs.createReadStream(safePath).pipe(res);
    }
  }

  // Fallback serve index.html for all other routes
  if (!cachedHtml) {
    cachedHtml = getHtml();
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.end(cachedHtml);
}

module.exports = handler;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  http.createServer(handler).listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}
