import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Page } from '@playwright/test';
import { test, expect, cityIds, originalCityIds, gbaCityIds, cityData, openApp, switchCity, mapReady, decodedCover, capture, evidenceDir, saved, mapAssetPattern } from './fixtures';
import { enableSync } from '../sync-e2e/fixtures';

const mapCacheName = 'vesluma-maps-v1';
const shellCacheName = 'vesluma-shell-v8';
const capacity = 6;

async function cacheState(page: Page) {
  return page.evaluate(async ({ mapCacheName, shellCacheName }) => {
    const names = (await caches.keys()).filter(name => name.startsWith('vesluma-shell-') || name.startsWith('vesluma-maps-'));
    const stores = await Promise.all(names.map(async name => ({ name, paths: (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname) })));
    const metadata = await (await caches.open(mapCacheName)).match('/__vesluma_map_lru__');
    return {
      names, stores, paths: stores.flatMap(store => store.paths),
      mapPaths: stores.find(store => store.name === mapCacheName)?.paths.filter(path => path.startsWith('/assets/')) ?? [],
      shellPaths: stores.find(store => store.name === shellCacheName)?.paths ?? [],
      lru: metadata ? await metadata.json() : [],
    };
  }, { mapCacheName, shellCacheName });
}

async function installed(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await expect.poll(async () => (await cacheState(page)).names).toContain(shellCacheName);
}

async function cached(page: Page, id: string) {
  await expect.poll(async () => (await cacheState(page)).mapPaths.some(path => mapAssetPattern(id).test(path)), { timeout: 25_000 }).toBe(true);
  const state = await cacheState(page);
  expect(state.mapPaths.length).toBeLessThanOrEqual(capacity);
  expect(state.paths.some(path => path.startsWith('/api/'))).toBe(false);
  expect(state.shellPaths.some(path => cityIds.some(city => mapAssetPattern(city).test(path)))).toBe(false);
  return state;
}

async function offlineFailure(page: Page) {
  await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'error');
  const status = page.locator('.vesluma-skeleton-status').filter({ has: page.getByRole('button', { name: '重试', exact: true }) });
  await expect(status).toContainText(/联网|网络/);
  await expect(status).toContainText(/城市|缓存|地图/);
  const retry = status.getByRole('button', { name: '重试', exact: true });
  await expect(retry).toBeVisible();
  expect(await retry.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || Boolean(hit && element.contains(hit));
  }), 'Offline retry is an actual hit target').toBe(true);
  return retry;
}

test.describe('controlled on-demand production maps', () => {
  test.use({ serviceWorkers: 'allow' });

  test('bad-http200-map-not-cached-retry-and-offline-recovery', async ({ page, context, service }) => {
    test.setTimeout(120_000);
    const sockets = new Set<Socket>();
    const faults: Array<{ path: string; status: number; requestCacheControl: string | undefined; responseCacheControl: string }> = [];
    let serveInvalidMap = true;
    let origin = '';
    // A real HTTP proxy is necessary: page.route cannot reliably intercept a
    // fetch performed inside an active service worker.
    const proxy = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', service.url);
      try {
        if (serveInvalidMap && mapAssetPattern('guangzhou').test(url.pathname)) {
          const body = JSON.stringify({ type: 'FeatureCollection', cityId: 'guangzhou', features: [] });
          faults.push({ path: url.pathname, status: 200, requestCacheControl: request.headers['cache-control'], responseCacheControl: 'public, max-age=600' });
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=600', 'content-length': Buffer.byteLength(body) });
          response.end(body);
          return;
        }
        const forwardedOrigin = request.headers.origin === origin ? service.url : request.headers.origin;
        const upstream = await fetch(url, { headers: forwardedOrigin ? { origin: forwardedOrigin } : {} });
        const headers = Object.fromEntries(upstream.headers.entries());
        const body = Buffer.from(await upstream.arrayBuffer());
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        headers['content-length'] = String(body.length);
        response.writeHead(upstream.status, headers);
        response.end(body);
      } catch {
        response.writeHead(502, { 'content-type': 'text/plain' });
        response.end('Test map fault proxy could not read temporary local service');
      }
    });
    proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    try {
      await openApp(page, origin);
      await mapReady(page);
      await installed(page);
      await cached(page, 'nanjing');
      await switchCity(page, cityData('guangzhou'), false);
      await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'error');
      const error = page.locator('.vesluma-skeleton-status');
      await expect(error).toContainText('城市骨架数据不匹配');
      expect(faults.length).toBeGreaterThan(0);
      const invalid = await cacheState(page);
      expect(invalid.mapPaths.some(path => mapAssetPattern('guangzhou').test(path))).toBe(false);
      await capture(page, 'bad-http200-guangzhou-rejected');
      const attempts = faults.length;
      await error.getByRole('button', { name: '重试', exact: true }).click();
      await expect.poll(() => faults.length).toBeGreaterThan(attempts);
      await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'error');
      expect((await cacheState(page)).mapPaths.some(path => mapAssetPattern('guangzhou').test(path))).toBe(false);
      serveInvalidMap = false;
      await error.getByRole('button', { name: '重试', exact: true }).click();
      await mapReady(page);
      const recovered = await cached(page, 'guangzhou');
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.city-title')).toHaveText(cityData('guangzhou').name);
      await mapReady(page);
      expect((await saved(page)).visits).toHaveLength(0);
      expect((await saved(page)).unlocks).toHaveLength(0);
      await capture(page, 'bad-http200-guangzhou-recovered-offline');
      await writeFile(join(evidenceDir, 'bad-http200-map-evidence.json'), JSON.stringify({
        status: 'passed', faultMethod: 'Real loopback HTTP 200 response with structurally invalid map JSON; no business API injection', faults, rejectedCache: invalid, recoveredCache: recovered, validRetryWorksOffline: true,
      }, null, 2));
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  });

  test('on-demand-install-offline-unvisited-recovery-lru-and-api-exclusion', async ({ page, context, service }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 320, height: 568 });
    const requested: string[] = [];
    context.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (cityIds.some(id => mapAssetPattern(id).test(path))) requested.push(path);
    });
    await openApp(page, service.url);
    await mapReady(page);
    await installed(page);
    const first = await cached(page, 'nanjing');
    expect(first.mapPaths).toHaveLength(1);
    expect(requested.every(path => mapAssetPattern('nanjing').test(path))).toBe(true);
    for (const id of gbaCityIds) expect(first.shellPaths).toContain(`/images/${id}.png`);
    // No preparatory online reload: hand the first successful map to the new SW.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mapReady(page);
    await switchCity(page, cityData('guangzhou'), false);
    await offlineFailure(page);
    await capture(page, 'guangzhou-unvisited-offline-320');
    await switchCity(page, cityData('nanjing'));
    await switchCity(page, cityData('guangzhou'), false);
    const retry = await offlineFailure(page);
    await context.setOffline(false);
    await retry.click();
    await mapReady(page);
    await cached(page, 'guangzhou');
    await enableSync(page); // Actual GET/POST /api/sync must not enter cache.
    expect((await cacheState(page)).paths.some(path => path.startsWith('/api/'))).toBe(false);
    for (const id of ['xian', 'beijing', 'shanghai', 'hangzhou']) {
      await switchCity(page, cityData(id));
      await cached(page, id);
    }
    // Touch a previously cached city before adding the seventh city,
    // proving LRU tracking rather than merely accepting FIFO eviction.
    await switchCity(page, cityData('nanjing'));
    await expect.poll(async () => JSON.stringify((await cacheState(page)).lru.at(-1))).toContain('nanjing');
    await switchCity(page, cityData('chengdu'));
    const full = await cached(page, 'chengdu');
    expect(full.mapPaths).toHaveLength(capacity);
    expect(full.mapPaths.some(path => mapAssetPattern('nanjing').test(path))).toBe(true);
    expect(full.mapPaths.some(path => mapAssetPattern('guangzhou').test(path))).toBe(false);
    // Clear in-memory maps before checking that the evicted city fails offline.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mapReady(page);
    await switchCity(page, cityData('guangzhou'), false);
    await offlineFailure(page);
    await switchCity(page, cityData('nanjing'));
    await capture(page, 'lru-cached-city-return-offline-320');
    await writeFile(join(evidenceDir, 'on-demand-cache-evidence.json'), JSON.stringify({
      status: 'passed', firstInstall: first, mapRequestsBeforeAndDuringScenario: requested, afterSeventhCity: full,
      cacheCapacity: capacity, evictedCity: 'guangzhou', initialVisitOfflineReloadWorked: true, apiExcluded: true,
    }, null, 2));
  });

  test('offline-each-of-ten-cities-after-visit-with-six-city-cache-limit', async ({ page, context, service }) => {
    test.setTimeout(300_000);
    await openApp(page, service.url);
    await mapReady(page);
    await installed(page);
    const before = await saved(page);
    const outcomes: Array<{ cityId: string; cache: Awaited<ReturnType<typeof cacheState>> }> = [];
    const responses: Array<{ path: string; status: number; fromServiceWorker: boolean }> = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (cityIds.some(id => mapAssetPattern(id).test(path))) responses.push({ path, status: response.status(), fromServiceWorker: response.fromServiceWorker() });
    });
    for (const id of cityIds) {
      await context.setOffline(false);
      const city = cityData(id);
      await switchCity(page, city);
      const cache = await cached(page, id);
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.city-title')).toHaveText(city.name);
      await mapReady(page);
      await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
      await page.locator('.city-title').click();
      const option = page.getByRole('dialog').locator('.city-option').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) });
      await decodedCover(option.locator('img'), `/images/${id}.png`);
      await option.click();
      await capture(page, `offline-visited-${id}-ready`);
      outcomes.push({ cityId: id, cache });
      expect(responses.some(response => mapAssetPattern(id).test(response.path) && response.status === 200 && response.fromServiceWorker)).toBe(true);
    }
    expect((await saved(page)).visits).toEqual(before.visits);
    expect((await saved(page)).unlocks).toEqual(before.unlocks);
    await writeFile(join(evidenceDir, 'ten-city-offline-cache-evidence.json'), JSON.stringify({
      status: 'passed', environment: 'Each city visited online before its own offline reload, with a six-city LRU limit; not all ten simultaneously cached. Browser simulation, not physical device verification.',
      url: service.url, outcomes, responses,
    }, null, 2));
  });

  test('offline-upgrade-v7-retains-six-valid-maps-and-removes-stale-api-cache', async ({ page, context, service }) => {
    test.setTimeout(180_000);
    const archivedWorker = await readFile(new URL('./fixtures/sw-v7.js', import.meta.url), 'utf8');
    const previousProof = JSON.parse(await readFile(new URL('../../docs/acceptance/six-city-2026-10-02/six-city-offline-cache-evidence.json', import.meta.url), 'utf8'));
    const sockets = new Set<Socket>();
    let legacy = true;
    let origin = '';
    const proxy = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', service.url);
      try {
        if (legacy && url.pathname === '/sw.js') {
          response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache', 'content-length': Buffer.byteLength(archivedWorker) });
          response.end(archivedWorker);
          return;
        }
        const forwardedOrigin = request.headers.origin === origin ? service.url : request.headers.origin;
        const upstream = await fetch(url, { headers: forwardedOrigin ? { origin: forwardedOrigin } : {} });
        const headers = Object.fromEntries(upstream.headers.entries());
        let body = Buffer.from(await upstream.arrayBuffer());
        if (legacy && url.pathname === '/.vite/manifest.json') {
          // Former six-city manifest, immutable geographic hashes still valid.
          const manifest = JSON.parse(body.toString('utf8'));
          const isNewMap = (path: string) => gbaCityIds.some(id => mapAssetPattern(id).test(`/${path}`));
          for (const [key, value] of Object.entries(manifest) as Array<[string, any]>) {
            if (isNewMap(value.file)) delete manifest[key];
            else if (value.assets) value.assets = value.assets.filter((path: string) => !isNewMap(path));
          }
          body = Buffer.from(JSON.stringify(manifest));
        }
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        headers['content-length'] = String(body.length);
        response.writeHead(upstream.status, headers);
        response.end(body);
      } catch {
        response.writeHead(502, { 'content-type': 'text/plain' });
        response.end('Test upgrade proxy could not read temporary local service');
      }
    });
    proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    try {
      await openApp(page, origin);
      await mapReady(page);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      });
      const old = await page.evaluate(async () => (await (await caches.open('vesluma-shell-v7')).keys()).map(request => new URL(request.url).pathname));
      for (const id of originalCityIds) {
        const provenLegacyPath = previousProof.cache.paths.find((path: string) => mapAssetPattern(id).test(path));
        expect(provenLegacyPath).toBeTruthy();
        expect(old).toContain(provenLegacyPath);
      }
      expect(old.some(path => gbaCityIds.some(id => mapAssetPattern(id).test(path)))).toBe(false);
      await page.evaluate(async () => {
        const cache = await caches.open('vesluma-shell-v7');
        await cache.put('/api/sync', new Response('{"private":"synthetic-upgrade-sentinel"}'));
        await cache.put('/assets/nanjing-obsolete.json', new Response('{"not":"a current valid map"}'));
      });
      legacy = false;
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) throw new Error('Legacy registration missing');
        const changed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
        await registration.update();
        await changed;
      });
      await installed(page);
      // controllerchange can precede completion of the new worker's activation
      // work. Wait for migration/old-cache cleanup before asserting its result.
      await expect.poll(async () => (await cacheState(page)).names, { timeout: 30_000 }).not.toContain('vesluma-shell-v7');
      const migrated = await cacheState(page);
      expect(migrated.names).not.toContain('vesluma-shell-v7');
      expect(migrated.mapPaths).toHaveLength(originalCityIds.length);
      for (const id of originalCityIds) expect(migrated.mapPaths.some(path => mapAssetPattern(id).test(path))).toBe(true);
      expect(migrated.paths).not.toContain('/api/sync');
      expect(migrated.paths).not.toContain('/assets/nanjing-obsolete.json');
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await mapReady(page);
      for (const id of originalCityIds) await switchCity(page, cityData(id));
      await capture(page, 'v7-six-map-upgrade-offline');
      await writeFile(join(evidenceDir, 'v7-migration-cache-evidence.json'), JSON.stringify({ status: 'passed', oldPaths: old, migrated, migratedMapsActuallyOpenedOffline: originalCityIds }, null, 2));
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  });
});
