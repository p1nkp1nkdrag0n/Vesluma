import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Browser/network simulations only. A separate origin forwards the final build
// and can fail navigation at the HTTP server, behind the SW.
// Playwright page.route is deliberately not used to fake SW network failures.
const evidenceDir = process.env.VESLUMA_QA_DIR ?? join(tmpdir(), 'vesluma-pink-qa');
const stateKey = 'vesluma:state:v1';
let proxy: Server;
let origin: string;
const sockets = new Set<Socket>();
const faults: Array<{ kind: 'stall' | 'stall-body' | 'http500'; at: number; url: string }> = [];

async function waitForShell(page: Page) {
  await expect(page.locator('.city-title')).toBeVisible();
  await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('vesluma-shell-'));
    const keys = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
    return { names, paths: keys.map(url => new URL(url).pathname), origins: [...new Set(keys.map(url => new URL(url).origin))] };
  });
}

async function saveEvidence(page: Page, name: string, detail: object) {
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
  await writeFile(join(evidenceDir, `${name}.json`), JSON.stringify({ name, environment: 'Chromium browser simulation; not physical-device or field validation', url: page.url(), viewport: page.viewportSize(), ...detail }, null, 2));
}

test.describe('cached production shell', () => {
  test.use({ serviceWorkers: 'allow' });

  test.beforeAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error('The production preview baseURL is required.');
    proxy = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', baseURL);
      if (url.pathname === '/' && url.searchParams.has('qa-stall')) {
        faults.push({ kind: 'stall', at: Date.now(), url: request.url! });
        return; // No headers/body: the SW must enforce its navigation deadline.
      }
      if (url.pathname === '/' && url.searchParams.has('qa-stall-body')) {
        faults.push({ kind: 'stall-body', at: Date.now(), url: request.url! });
        response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
        response.write('<!doctype html><html><head><title>Incomplete response');
        return; // A successful header must not bypass the complete-body deadline.
      }
      if (url.pathname === '/' && url.searchParams.has('qa-http500')) {
        faults.push({ kind: 'http500', at: Date.now(), url: request.url! });
        response.writeHead(500, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
        response.end('Simulated unavailable origin');
        return;
      }
      try {
        // A same-origin module request to this trusted test proxy becomes a
        // same-origin request at the upstream server. Preserve the presence of
        // Origin for cache/Vary coverage; unrelated origins remain unchanged.
        const forwardedOrigin = request.headers.origin === origin ? new URL(baseURL).origin : request.headers.origin;
        const upstream = await fetch(url, { redirect: 'manual', headers: forwardedOrigin ? { origin: forwardedOrigin } : {} });
        const headers = Object.fromEntries(upstream.headers.entries());
        // fetch has decoded upstream encoding. Preserve a precise body length
        // so Chromium can cache the large immutable JSON assets normally.
        const body = Buffer.from(await upstream.arrayBuffer());
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        headers['content-length'] = String(body.length);
        response.writeHead(upstream.status, headers);
        response.end(body);
      } catch {
        response.writeHead(502, { 'content-type': 'text/plain' });
        response.end('Production preview unavailable');
      }
    });
    proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  });

  test('offline-first-city-switch-and-refresh-use-bundled-maps', async ({ page, context }) => {
    const errors: string[] = [];
    const mapResponses: Array<{ path: string; fromServiceWorker: boolean; status: number }> = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const cache = await waitForShell(page);
    expect(cache.paths.some(path => /^\/assets\/nanjing-[^/]+\.json$/.test(path))).toBe(true);
    expect(cache.paths.some(path => /^\/assets\/xian-[^/]+\.json$/.test(path))).toBe(true);
    expect(cache.origins).toEqual([origin]);
    expect(cache.paths.every(path => !/\/\d+\/\d+\/\d+\.png$/.test(path))).toBe(true);
    const initialCity = await page.locator('.city-title').innerText();
    const initialState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey);
    expect(initialState.cityId).toBe('nanjing');
    // Xian has not been opened in this context before the network is disabled.
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (/\/assets\/(nanjing|xian)-[^/]+\.json$/.test(path)) mapResponses.push({ path, fromServiceWorker: response.fromServiceWorker(), status: response.status() });
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.city-title')).toHaveText(initialCity);
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    await page.locator('.city-title').click();
    await page.locator('.city-option').nth(1).click();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).cityId, stateKey)).toBe('xian');
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    await expect(page.locator('.progress-pill')).toContainText('0 / 10');
    await page.locator('.map-theme-trigger').click();
    await page.locator('.map-theme-option').nth(1).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-map-theme', 'treasure');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-map-theme', 'treasure');
    await expect(page.locator('.progress-pill')).toContainText('0 / 10');
    await saveEvidence(page, 'offline-xian-after-refresh', { cache, mapResponses, pageErrors: errors });
    await page.locator('.city-title').click();
    await page.locator('.city-option').nth(0).click();
    await expect(page.locator('.city-title')).toHaveText(initialCity);
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    await expect(page.locator('.progress-pill')).toContainText('0 / 11');
    await page.locator('.map-theme-trigger').click();
    await page.locator('.map-theme-option').nth(0).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-map-theme', 'paper');
    const finalState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey);
    expect(finalState.visits).toEqual(initialState.visits);
    expect(finalState.unlocks).toEqual(initialState.unlocks);
    expect(mapResponses.some(response => response.path.includes('/nanjing-') && response.fromServiceWorker && response.status === 200)).toBe(true);
    expect(mapResponses.some(response => response.path.includes('/xian-') && response.fromServiceWorker && response.status === 200)).toBe(true);
    expect(errors).toEqual([]);
    await saveEvidence(page, 'offline-city-return', { cache, mapResponses, pageErrors: errors });
  });

  for (const kind of ['stall', 'stall-body'] as const) test(`${kind}-navigation-returns-cache-after-four-seconds`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const cache = await waitForShell(page);
    const before = faults.length;
    const start = Date.now();
    const response = await page.goto(`${origin}/?qa-${kind}=1`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    const elapsedMs = Date.now() - start;
    await expect(page.locator('.city-title')).toBeVisible();
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    expect(faults.slice(before).some(fault => fault.kind === kind)).toBe(true);
    expect(response?.fromServiceWorker()).toBe(true);
    expect(response?.status()).toBe(200);
    expect(elapsedMs).toBeGreaterThanOrEqual(3_600);
    expect(elapsedMs).toBeLessThan(11_000);
    expect(errors).toEqual([]);
    await saveEvidence(page, `${kind}-navigation-fallback`, { elapsedMs, cache, faults: faults.slice(before), pageErrors: errors });
  });

  test('http500-navigation-returns-cache-and-can-retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const cache = await waitForShell(page);
    const before = faults.length;
    const response = await page.goto(`${origin}/?qa-http500=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.city-title')).toBeVisible();
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    expect(faults.slice(before).some(fault => fault.kind === 'http500')).toBe(true);
    expect(response?.fromServiceWorker()).toBe(true);
    expect(response?.status()).toBe(200);
    await saveEvidence(page, 'http500-navigation-fallback', { cache, faults: faults.slice(before), pageErrors: errors });
    await page.goto(origin);
    await expect(page.locator('.city-title')).toBeVisible();
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready');
    expect(errors).toEqual([]);
  });
});
