/** Audit the real built worker and manifest without a browser or network access.
 * Run after npm run build: node scripts/audit-sw-install.mjs
 * This checks the install resource list, not browser quota or offline rendering.
 */
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const script = read('dist/sw.js');
const manifest = JSON.parse(read('dist/.vite/manifest.json'));
const origin = 'http://127.0.0.1:4317';
const listeners = {};
let bootAssets = [], installPromise, activated = false;
runInNewContext(script, {
  self: { location: { origin }, addEventListener: (event, handler) => { listeners[event] = handler; },
    skipWaiting: async () => { activated = true; } },
  caches: { open: async () => ({ put: async () => {}, addAll: async paths => { bootAssets = paths; } }) },
  fetch: async path => {
    if (path !== '/index.html' && path !== '/.vite/manifest.json') throw new Error(`Unexpected install fetch: ${path}`);
    return new Response(read(`dist${path}`));
  },
  URL, Response, AbortController, setTimeout, clearTimeout,
}, { timeout: 1000 });
listeners.install({ waitUntil: promise => { installPromise = promise; } });
await installPromise;

const cityAssets = Object.entries(manifest).filter(([key]) => /^src\/data\/map\/[^/]+\.json(?:\.gz)?$/.test(key))
  .map(([, entry]) => `/${entry.file}`);
const missingCityAssets = cityAssets.filter(path => !bootAssets.includes(path));
const unsafeAssets = bootAssets.filter(path => {
  const url = new URL(path, origin);
  return url.origin !== origin || url.pathname !== path
    || !(/^\/(?:assets|images)\//.test(path) || ['/manifest.webmanifest', '/icon.svg'].includes(path));
});
const missingFiles = bootAssets.filter(path => !unsafeAssets.includes(path) && !existsSync(resolve(root, `dist${path}`)));
const bytes = bootAssets.filter(path => !unsafeAssets.includes(path) && !missingFiles.includes(path))
  .reduce((sum, path) => sum + statSync(resolve(root, `dist${path}`)).size, 0);
const sourceMatchesBuild = script === read('public/sw.js');
const passed = cityAssets.length === 6 && !missingCityAssets.length && !unsafeAssets.length && !missingFiles.length && sourceMatchesBuild && activated;
const audit = {
  checkedAt: new Date().toISOString(), command: 'node scripts/audit-sw-install.mjs',
  scope: 'Node VM execution of the actual built service worker install handler using the actual built HTML and manifest; cache writes are recorded, with no network or browser execution.',
  limits: 'Does not prove browser cache quota, installation time, offline rendering, physical-device performance, or field location accuracy.',
  entry: manifest['index.html'].file, cityAssets, bootAssetCount: bootAssets.length, bootAssets,
  bytes, missingCityAssets, unsafeAssets, missingFiles, sourceMatchesBuild, activated, passed,
};
const destination = resolve(root, 'docs/acceptance/six-city-2026-10-02/sw-install-audit.json');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ passed, entry: audit.entry, bootAssetCount: bootAssets.length, bytes, missingCityAssets, unsafeAssets, missingFiles, sourceMatchesBuild }));
if (!passed) process.exitCode = 1;
