import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

for (const path of [
  'src/routes/+page.svelte', 'src/routes/+layout.svelte', 'src/service-worker.ts', 'src/app.css',
  'static/legacy/index.html', 'static/legacy/limits.js', 'static/manifest.webmanifest',
  'static/icons/icon.svg', 'LICENSE'
]) assert.ok(existsSync(path), 'Missing required file: ' + path);

const page = readFileSync('src/routes/+page.svelte', 'utf8');
const legacy = readFileSync('static/legacy/index.html', 'utf8');
const css = readFileSync('src/app.css', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

assert.match(page, /src="\/legacy\/index\.html"/);
assert.match(page, /indexedDB/);
assert.match(page, /PIXELFORGE_RESTORE/);
assert.match(page, /PIXELFORGE_REQUEST_STATE/);
assert.match(page, /Save and update/);
assert.match(page, /serviceWorkerRegistration/);
assert.match(legacy, /PIXELFORGE_STATE/);
assert.match(legacy, /isAllowedDocumentSize/);
assert.match(legacy, /maxHistoryBytes/);
assert.match(css, /@import "tailwindcss"/);
const worker = readFileSync('src/service-worker.ts', 'utf8');
assert.match(worker, /SKIP_WAITING/);
assert.doesNotMatch(worker, /await sw\.skipWaiting\(\)/);
assert.ok(pkg.devDependencies['@sveltejs/kit']);
assert.ok(pkg.devDependencies['@sveltejs/adapter-vercel']);
assert.match(readme, /Vercel/);
assert.doesNotMatch(readme, /GitHub Pages deployment/i);
console.log('PixelForge Studio smoke checks passed.');
