const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const searchHandler = require('./api/search');
const suggestHandler = require('./api/suggest');

const publicDir = path.resolve(__dirname, 'public');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

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

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch (error) {
    res.statusCode = 400;
    return res.end('Bad request');
  }

  const filePath = path.resolve(publicDir, `.${requestedPath}`);
  if (!filePath.startsWith(publicDir + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  if (path.basename(filePath) === 'index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  fs.createReadStream(filePath).on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end('Unable to load file');
  }).pipe(res);
}

module.exports = handler;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  http.createServer(handler).listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}
