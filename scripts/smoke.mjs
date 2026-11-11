import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

for (const path of [
  'src/routes/+page.svelte', 'src/routes/+layout.svelte', 'src/service-worker.ts', 'src/app.css',
  'src/lib/editor/EditorWorkbench.svelte', 'src/lib/editor/editorMarkup.ts', 'src/lib/editor/engine.ts', 'src/lib/editor/editor.css', 'src/lib/editor/project.ts', 'src/lib/editor/storage.ts', 'src/lib/editor/history.js', 'src/lib/editor/canvasRenderer.js', 'tests/history.test.mjs', 'tests/canvas-renderer.test.mjs', 'static/legacy/limits.js', 'static/manifest.webmanifest',
  'static/icons/icon.svg', 'LICENSE'
]) assert.ok(existsSync(path), 'Missing required file: ' + path);

const page = readFileSync('src/routes/+page.svelte', 'utf8');
const engine = readFileSync('src/lib/editor/engine.ts', 'utf8');
const workbench = readFileSync('src/lib/editor/EditorWorkbench.svelte', 'utf8');
const storage = readFileSync('src/lib/editor/storage.ts', 'utf8');
const project = readFileSync('src/lib/editor/project.ts', 'utf8');
const history = readFileSync('src/lib/editor/history.js', 'utf8');
const renderer = readFileSync('src/lib/editor/canvasRenderer.js', 'utf8');
const css = readFileSync('src/app.css', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

assert.match(page, /<EditorWorkbench \/>/);
assert.doesNotMatch(page, /legacy\/index\.html|<iframe/);
assert.match(storage, /indexedDB\.open/);
assert.match(storage, /getRecoveryOverview/);
assert.match(storage, /clearRecoveryData/);
assert.match(page, /Manage local recovery/);
assert.match(page, /window\.confirm/);
assert.match(page, /offline app cache are unaffected/);
assert.match(page, /PIXELFORGE_RESTORE/);
assert.match(page, /PIXELFORGE_REQUEST_STATE/);
assert.match(page, /Save and update/);
assert.match(page, /serviceWorkerRegistration/);
assert.match(engine, /pixelforge:state/);
assert.match(engine, /PIXELFORGE_REQUEST_STATE/);
assert.match(workbench, /@html editorMarkup/);
assert.match(workbench, /mountEditor/);
assert.match(engine, /isAllowedDocumentSize/);
assert.match(engine, /fitWithinDocumentLimit/);
assert.match(engine, /MAX_HISTORY_BYTES/);
assert.match(history, /MAX_HISTORY_ENTRIES/);
assert.match(renderer, /getRenderedLayerCanvas/);
assert.match(renderer, /destination-in/);
assert.match(engine, /getRenderedLayerCanvas/);
assert.match(project, /isProjectSnapshot/);
assert.match(css, /@import "tailwindcss"/);
const worker = readFileSync('src/service-worker.ts', 'utf8');
assert.match(worker, /SKIP_WAITING/);
assert.doesNotMatch(worker, /await sw\.skipWaiting\(\)/);
assert.ok(pkg.devDependencies['@sveltejs/kit']);
assert.ok(pkg.devDependencies['@sveltejs/adapter-vercel']);
assert.match(readme, /Vercel/);
assert.doesNotMatch(readme, /GitHub Pages deployment/i);
console.log('PixelForge Studio smoke checks passed.');
