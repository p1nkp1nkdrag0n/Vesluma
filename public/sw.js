/* App-shell caching only. Map tiles, location data and remote responses are never cached. */
const CACHE_NAME = 'vesluma-shell-v7';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/images/nanjing.png', '/images/xian.png', '/images/beijing.png', '/images/shanghai.png', '/images/hangzhou.png', '/images/chengdu.png', '/images/map-paper-texture.webp', '/images/map-treasure-texture.webp'];
const MAX_LOCAL_ASSETS = 60;
const NAVIGATION_TIMEOUT_MS = 4_000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('App shell could not be loaded.');
    await cache.put('/index.html', response.clone());
    await cache.put('/', response.clone());
    const html = await response.text();
    // Vite writes hashed script, stylesheet and modulepreload URLs into this HTML.
    // Only this origin's JS/CSS under /assets/ is eligible; no remote/map prefetch.
    const bundleUrls = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/')
        && /\.(?:js|css)$/i.test(url.pathname))
      .map((url) => `${url.pathname}${url.search}`);
    // Real geographic snapshots are local JSON or losslessly compressed JSON
    // assets, loaded by city. Cache gzip bytes unchanged; the app decompresses.
    // Include their hashed build URLs in the shell cache without eagerly parsing
    // those datasets in the application or requesting any remote map tiles.
    const manifestResponse = await fetch('/.vite/manifest.json', { cache: 'reload' });
    if (!manifestResponse.ok) throw new Error('Build asset manifest could not be loaded.');
    const manifest = await manifestResponse.json();
    const localBuildAssets = Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css || []), ...(entry.assets || [])])
      .filter((path) => typeof path === 'string' && path.startsWith('assets/') && /\.(?:js|css|json|json(?:-[\w-]+)?\.gz)$/i.test(path))
      .map((path) => `/${path}`);
    const bootAssets = [...new Set([...SHELL.filter((path) => path !== '/' && path !== '/index.html'), ...bundleUrls, ...localBuildAssets])];
    await cache.addAll(bootAssets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('vesluma-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function remember(request, response) {
  if (!response.ok || response.type !== 'basic' || /no-store/i.test(response.headers.get('cache-control') || '')) return;
  try {
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
    const localAssets = (await cache.keys()).filter((key) => {
      const path = new URL(key.url).pathname;
      return path.startsWith('/assets/') || path.startsWith('/images/');
    });
    while (localAssets.length > MAX_LOCAL_ASSETS) await cache.delete(localAssets.shift());
  } catch {
    // Quota/permission failures must not turn a successful network load into an error.
  }
}

async function navigationResponse(request, event) {
  let cached;
  try {
    const cache = await caches.open(CACHE_NAME);
    cached = (await cache.match('/index.html')) || (await cache.match('/'));
  } catch { /* A successful network navigation does not require cache access. */ }
  const controller = new AbortController();
  let timer;
  try {
    const network = fetch(request, { signal: controller.signal }).then(async response => {
      // Receiving headers alone is not enough to open the app. Read a clone so
      // a stalled HTML body also falls back, preserving the original response.
      if (cached && response.ok) await response.clone().arrayBuffer();
      return response;
    });
    // A cached app should remain usable on a stalled connection. Without a
    // cache, let the browser complete the first load at the available speed.
    const response = cached ? await Promise.race([network, new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Navigation timed out.'));
        controller.abort();
      }, NAVIGATION_TIMEOUT_MS);
    })]) : await network;
    if (!response.ok) return cached || response;
    event.waitUntil(remember('/index.html', response));
    return response;
  } catch {
    return cached || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request, event));
    return;
  }

  const isBundledAsset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/');
  const isShellAsset = SHELL.includes(url.pathname) && url.pathname !== '/' && url.pathname !== '/index.html';
  if (!isBundledAsset && !isShellAsset) return;

  event.respondWith((async () => {
    let cached;
    try {
      const cache = await caches.open(CACHE_NAME);
      // Only the same-origin static paths allowed above reach this branch.
      // Module/CSS requests carry Origin, while install-time cache.addAll
      // requests do not. Vite's Vary: Origin must not hide identical bundles.
      cached = await cache.match(request, { ignoreVary: true });
    } catch { /* Continue with the network. */ }
    if (cached) return cached;
    const response = await fetch(request);
    await remember(request, response);
    return response;
  })());
});
