/* Only the app shell and validated, same-origin city snapshots are cached.
 * API responses, user photos/positions and external map tiles never enter caches. */
const CACHE_NAME = 'vesluma-shell-v8';
const MAP_CACHE_NAME = 'vesluma-maps-v1';
const MANIFEST_PATH = '/.vite/manifest.json';
const MAP_ORDER_PATH = '/__vesluma_map_lru__';
const MAX_MAP_CITIES = 6;
// Guangzhou's HTTP-decoded snapshot is about 54 MB; accept it with a fixed cap.
const MAX_MAP_BYTES = 64 * 1024 * 1024;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/images/nanjing.png', '/images/xian.png', '/images/beijing.png', '/images/shanghai.png', '/images/hangzhou.png', '/images/chengdu.png', '/images/guangzhou.png', '/images/shenzhen.png', '/images/hongkong.png', '/images/macau.png', '/images/map-paper-texture.webp', '/images/map-treasure-texture.webp'];
const MAP_PATH = /^\/assets\/(nanjing|xian|beijing|shanghai|hangzhou|chengdu|guangzhou|shenzhen|hongkong|macau)(?:-[\w-]+)?\.json(?:-[\w-]+)?(?:\.gz)?$/;
const NAVIGATION_TIMEOUT_MS = 4_000;
let catalogPromise;
let mapMutation = Promise.resolve();

function catalogFrom(manifest) {
  const paths = Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css || []), ...(entry.assets || [])])
    .filter(path => typeof path === 'string' && /^assets\/[\w.-]+$/.test(path)).map(path => `/${path}`);
  return { shell: [...new Set([...SHELL, ...paths.filter(path => /\.(?:js|css)$/.test(path))])], maps: [...new Set(paths.filter(path => MAP_PATH.test(path)))] };
}

function getCatalog() {
  if (!catalogPromise) catalogPromise = caches.open(CACHE_NAME).then(cache => cache.match(MANIFEST_PATH))
    .then(response => { if (!response) throw new Error('No current asset catalog'); return response.json(); })
    .then(catalogFrom).catch(() => { catalogPromise = undefined; return { shell: SHELL, maps: [] }; });
  return catalogPromise;
}

function queueMapMutation(action) {
  const next = mapMutation.then(action);
  mapMutation = next.catch(() => {});
  return next;
}

function reportMap(client, path, status) {
  client?.postMessage({ type: 'VESLUMA_MAP_CACHE_STATUS', cityId: MAP_PATH.exec(path)?.[1], url: path, status });
}

async function mapOrder(cache, allowed) {
  const present = (await cache.keys()).map(key => new URL(key.url).pathname).filter(path => allowed.includes(path));
  let previous = [];
  try { const record = await cache.match(MAP_ORDER_PATH); if (record) previous = await record.json(); } catch { /* Rebuild the bounded index from actual entries. */ }
  if (!Array.isArray(previous)) previous = [];
  return [...new Set([...previous.filter(path => typeof path === 'string' && present.includes(path)), ...present])];
}

async function writeMapOrder(cache, order) {
  // Commit the small index before evicting any previously usable map. If this
  // write fails, saveValidatedMap can discard its new copy without data loss.
  await cache.put(MAP_ORDER_PATH, Response.json(order.slice(-MAX_MAP_CITIES)));
  for (const path of order.slice(0, Math.max(0, order.length - MAX_MAP_CITIES))) await cache.delete(path);
}

async function touchMap(path, client) {
  try {
    const catalog = await getCatalog();
    if (!catalog.maps.includes(path)) return;
    const cache = await caches.open(MAP_CACHE_NAME);
    const order = await mapOrder(cache, catalog.maps);
    if (!order.includes(path)) { reportMap(client, path, 'missing'); return; }
    await writeMapOrder(cache, [...order.filter(item => item !== path), path]);
    reportMap(client, path, 'cached');
  } catch { reportMap(client, path, 'failed'); }
}

async function saveValidatedMap(path, body, contentType, client) {
  try {
    const catalog = await getCatalog();
    if (!catalog.maps.includes(path)) return;
    const cache = await caches.open(MAP_CACHE_NAME);
    const order = await mapOrder(cache, catalog.maps);
    // Never evict a usable city before the new copy is safely stored. A quota
    // error leaves prior offline maps intact and does not affect the online view.
    await cache.put(path, new Response(body, { headers: { 'Content-Type': contentType === 'application/json' ? contentType : 'application/octet-stream' } }));
    try { await writeMapOrder(cache, [...order.filter(item => item !== path), path]); }
    catch (error) {
      // Index/quota or eviction failures must not leave a seventh copy behind.
      // An update of an existing hash is still valid and already within budget.
      if (!order.includes(path)) await cache.delete(path).catch(() => {});
      await cache.put(MAP_ORDER_PATH, Response.json(order)).catch(() => {});
      throw error;
    }
    reportMap(client, path, 'cached');
  } catch { reportMap(client, path, 'failed'); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('App shell could not be loaded.');
    await cache.put('/index.html', response.clone());
    await cache.put('/', response.clone());
    const html = await response.text();
    const bundleUrls = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map(match => new URL(match[1], self.location.origin))
      .filter(url => url.origin === self.location.origin && /^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname))
      .map(url => url.pathname);
    const manifestResponse = await fetch(MANIFEST_PATH, { cache: 'reload' });
    if (!manifestResponse.ok) throw new Error('Build asset manifest could not be loaded.');
    await cache.put(MANIFEST_PATH, manifestResponse.clone());
    const catalog = catalogFrom(await manifestResponse.json());
    catalogPromise = Promise.resolve(catalog);
    // City JSON/gzip snapshots are intentionally absent from installation.
    // Keep only small public art and the bundles necessary to open the app.
    await cache.addAll([...new Set([...catalog.shell.filter(path => path !== '/' && path !== '/index.html'), ...bundleUrls])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const obsolete = names.filter(name => name.startsWith('vesluma-shell-') && name !== CACHE_NAME);
    await queueMapMutation(async () => {
      const catalog = await getCatalog();
      try {
        const maps = await caches.open(MAP_CACHE_NAME);
        for (const key of await maps.keys()) {
          const path = new URL(key.url).pathname;
          if (path !== MAP_ORDER_PATH && !catalog.maps.includes(path)) await maps.delete(key);
        }
        let order = await mapOrder(maps, catalog.maps);
        // v7 precached six maps. Reuse only hashes in this build, filling the
        // bounded cache without replacing cities the user has already opened.
        for (const name of obsolete.reverse()) {
          const previous = await caches.open(name);
          for (const key of await previous.keys()) {
            const path = new URL(key.url).pathname;
            if (order.length >= MAX_MAP_CITIES || !catalog.maps.includes(path) || order.includes(path)) continue;
            const copy = await previous.match(key, { ignoreVary: true });
            if (copy?.ok) {
              try { await maps.put(path, copy); order.push(path); }
              catch { /* A full cache must not prevent the new app from activating. */ }
            }
          }
        }
        await writeMapOrder(maps, order);
      } catch { /* The shell remains available when map storage is denied. */ }
    });
    await Promise.all(obsolete.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const message = event.data;
  if (!message || !event.source?.url) return;
  try { if (new URL(event.source.url).origin !== self.location.origin) return; } catch { return; }
  // An old active v7 worker has no handoff handler. The loader waits for this
  // acknowledgement (or controllerchange) before transferring its only copy.
  if (message.type === 'VESLUMA_MAP_CACHE_READY') { event.ports?.[0]?.postMessage({ version: 1 }); return; }
  if (!['VESLUMA_CACHE_MAP', 'VESLUMA_TOUCH_MAP'].includes(message.type)) return;
  let url;
  try {
    url = new URL(message.url, self.location.origin);
    if (url.origin !== self.location.origin || url.search || url.hash || !MAP_PATH.test(url.pathname)) return;
  } catch { return; }
  if (message.type === 'VESLUMA_TOUCH_MAP') {
    event.waitUntil(queueMapMutation(() => touchMap(url.pathname, event.source)));
  } else {
    // The map loader sends this copy only after winning timeout checks and full
    // geometry validation. This also covers the first fetch before SW control,
    // without downloading the same large city again to make it usable offline.
    if (!(message.body instanceof ArrayBuffer) || !message.body.byteLength || message.body.byteLength > MAX_MAP_BYTES) {
      reportMap(event.source, url.pathname, 'failed'); return;
    }
    event.waitUntil(queueMapMutation(() => saveValidatedMap(url.pathname, message.body, message.contentType, event.source)));
  }
});

async function rememberShell(request, response) {
  if (!response.ok || response.type !== 'basic' || /no-store/i.test(response.headers.get('cache-control') || '')) return;
  try { const copy = response.clone(); await (await caches.open(CACHE_NAME)).put(request, copy); }
  catch { /* Storage failure never replaces a successful online response. */ }
}

async function navigationResponse(request, event) {
  let cached;
  try {
    const cache = await caches.open(CACHE_NAME);
    cached = (await cache.match('/index.html')) || (await cache.match('/'));
  } catch { /* Continue with the network when cache storage is denied. */ }
  const controller = new AbortController();
  let timer;
  try {
    const network = fetch(request, { signal: controller.signal }).then(async response => {
      if (cached && response.ok) await response.clone().arrayBuffer();
      return response;
    });
    const response = cached ? await Promise.race([network, new Promise((_, reject) => {
      timer = setTimeout(() => { reject(new Error('Navigation timed out.')); controller.abort(); }, NAVIGATION_TIMEOUT_MS);
    })]) : await network;
    if (!response.ok) return cached || response;
    event.waitUntil(rememberShell('/index.html', response));
    return response;
  } catch { return cached || Response.error(); }
  finally { clearTimeout(timer); }
}

async function mapResponse(request, event) {
  const path = new URL(request.url).pathname;
  const catalog = await getCatalog();
  if (!catalog.maps.includes(path)) return fetch(request);
  try {
    const cache = await caches.open(MAP_CACHE_NAME);
    // Browser reload/devtools/automation may set Request.cache='reload' merely
    // to disable the HTTP cache. Only the app's explicit failed-map retry may
    // bypass a validated CacheStorage copy needed for offline startup.
    const cached = request.headers.get('X-Vesluma-Map-Retry') === '1' ? undefined : await cache.match(path, { ignoreVary: true });
    if (cached) {
      const client = await self.clients.get(event.clientId);
      event.waitUntil(queueMapMutation(() => touchMap(path, client)));
      const headers = new Headers(cached.headers);
      // A cached Response body may already have been HTTP-decoded. Let the
      // loader inspect its bytes instead of advertising a second HTTP decode.
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      headers.set('X-Vesluma-Map-Cache', 'hit');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  } catch { /* Online loading still works even when offline storage is unavailable. */ }
  try {
    // A successful HTTP response is not sufficient to cache a map. The loader
    // first validates its city, geometry and source, then sends the winning copy.
    return await fetch(request);
  } catch {
    return Response.json({ error: '此城地图尚未缓存。联网后点重试，或切换到已缓存的城市。' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Vesluma-Map-Cache': 'miss' } });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(navigationResponse(request, event));
    return;
  }
  if (url.search || url.hash) return;
  if (MAP_PATH.test(url.pathname)) { event.respondWith(mapResponse(request, event)); return; }
  if (!SHELL.includes(url.pathname) && !/^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const catalog = await getCatalog();
    if (!catalog.shell.includes(url.pathname)) return fetch(request);
    try {
      const cached = await (await caches.open(CACHE_NAME)).match(request, { ignoreVary: true });
      if (cached) return cached;
    } catch { /* Continue with the network. */ }
    const response = await fetch(request);
    await rememberShell(request, response);
    return response;
  })());
});
