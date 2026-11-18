const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Running Music Downloader Build & Verification ---');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Validate index.html JavaScript syntax
const indexPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const scripts = indexHtml.match(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi) || [];
console.log(`Checking ${scripts.length} scripts in index.html...`);

scripts.forEach((tag, idx) => {
  if (tag.includes('application/ld+json')) return;
  const content = tag.replace(/^<script(?:\s+[^>]*)?>/i, '').replace(/<\/script>$/i, '');
  if (!content.trim()) return;
  try {
    new vm.Script(content);
  } catch (err) {
    console.error(`❌ JavaScript Syntax Error in script #${idx}:`, err.message);
    process.exit(1);
  }
});
console.log('✅ index.html JavaScript syntax is 100% valid!');

// Validate server-side JavaScript before publishing the static copy.
const serverFiles = [
  'index.js',
  'dev-server.js',
  'api/search.js',
  'api/suggest.js',
  'lib/fetch-with-timeout.js',
  'netlify/functions/search.js',
  'netlify/functions/suggest.js'
];
serverFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Required server file is missing: ${file}`);
    process.exit(1);
  }
  try {
    new vm.Script(fs.readFileSync(filePath, 'utf8'), { filename: file });
  } catch (err) {
    console.error(`❌ JavaScript Syntax Error in ${file}:`, err.message);
    process.exit(1);
  }
});
console.log(`✅ Validated ${serverFiles.length} server-side JavaScript files!`);

// 2. Validate sw.js syntax
const swPath = path.join(rootDir, 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf8');
  try {
    new vm.Script(swContent);
    console.log('✅ sw.js syntax is 100% valid!');
  } catch (err) {
    console.error('❌ sw.js Syntax Error:', err.message);
    process.exit(1);
  }
}

// 3. Synchronize canonical files from root to public/
const filesToSync = ['index.html', 'sw.js', 'manifest.json', 'robots.txt', 'sitemap.xml', 'share-card.svg'];

filesToSync.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Synced ${file} -> public/${file}`);
  }
});

console.log('🎉 Build verified and public/ folder successfully synchronized!');
