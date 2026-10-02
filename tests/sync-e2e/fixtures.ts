import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export { expect };
export const evidenceDir = process.env.VESLUMA_SYNC_QA_DIR ?? join(tmpdir(), 'vesluma-local-sync-qa');
export const stateKey = 'vesluma:state:v1';
export const configKey = 'vesluma:local-sync:v1';
export const migrationKey = 'vesluma:before-local-sync:v1';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
export type Space = 'local-a' | 'local-b';
export interface LocalService { url: string; dbPath: string; stop(): Promise<void>; restart(): Promise<void> }
export interface Device { context: BrowserContext; page: Page }
export interface Devices { a: Device; b: Device; newDevice(): Promise<Device> }
interface FactoryService { start(): Promise<{ port: number; url: string }>; close(): Promise<void> }
type Factory = (options: { dbPath: string; distDir: string; port: number }) => FactoryService;

export const test = base.extend<{ service: LocalService; devices: Devices }>({
  service: async ({}, use, testInfo) => {
    await mkdir(evidenceDir, { recursive: true });
    const databaseDirectory = await mkdtemp(join(evidenceDir, 'database-'));
    const dbPath = join(databaseDirectory, 'acceptance.sqlite');
    // Import the dedicated factory, never the CLI with default .local-data.
    const module = await import(pathToFileURL(resolve('.local-build/local-server.mjs')).href);
    const createServer = module.createLocalServer as Factory;
    let running = createServer({ dbPath, distDir: resolve('dist'), port: 0 });
    const address = await running.start();
    let open = true;
    const service: LocalService = {
      url: address.url, dbPath,
      async stop() { if (open) { open = false; await running.close(); } },
      async restart() {
        await service.stop();
        running = createServer({ dbPath, distDir: resolve('dist'), port: address.port });
        const restarted = await running.start();
        expect(restarted.url).toBe(address.url);
        open = true;
      },
    };
    try { await use(service); }
    finally {
      await service.stop();
      await writeFile(join(databaseDirectory, 'test.json'), JSON.stringify({ title: testInfo.title, status: testInfo.status, url: service.url, dbPath, temporaryTestDataOnly: true }, null, 2));
    }
  },
  devices: async ({ browser, service }, use, testInfo) => {
    const opened: Device[] = [];
    const errors: string[] = [];
    const logs: string[] = [];
    const requests: Array<{ device: number; method: string; path: string; status: number }> = [];
    const newDevice = async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
      await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* System fonts in deterministic local sync acceptance. */' }));
      const page = await context.newPage();
      const number = opened.length + 1;
      page.on('pageerror', error => errors.push(`device ${number}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') logs.push(`device ${number} ${message.type()}: ${message.text()}`); });
      page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) requests.push({ device: number, method: response.request().method(), path: url.pathname, status: response.status() }); });
      const device = { context, page };
      opened.push(device);
      await page.goto(service.url);
      await expect(page).toHaveTitle(/Vesluma/);
      await expect(page.locator('.city-title')).toContainText('南京');
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      return device;
    };
    const a = await newDevice();
    const b = await newDevice();
    try { await use({ a, b, newDevice }); }
    finally {
      const name = testInfo.title.replace(/[^a-zA-Z0-9-]/g, '-');
      await mkdir(evidenceDir, { recursive: true });
      for (let index = 0; index < opened.length; index++) {
        const device = opened[index];
        if (!device.page.isClosed()) {
          const panel = device.page.getByRole('region', { name: '本机数据库同步' });
          if (await panel.count()) await panel.scrollIntoViewIfNeeded().catch(() => {});
          await device.page.screenshot({ path: join(evidenceDir, `${name}-device-${index + 1}.png`) }).catch(() => {});
        }
        await device.context.close();
      }
      const injectingNetworkFailure = /offline-device|lost-post|sqlite-restart|failed-photo/.test(testInfo.title);
      const unexpectedConsole = logs.filter(message => !message.includes('Service Worker registration blocked by Playwright') && !(injectingNetworkFailure && message.includes('Failed to load resource: net::ERR_')));
      await writeFile(join(evidenceDir, `${name}.json`), JSON.stringify({ title: testInfo.title, status: errors.length || unexpectedConsole.length ? 'failed' : testInfo.status, environment: 'Two or more isolated Chromium contexts on one local machine; simulated devices; local spaces are not production authentication', browser: browser.version(), database: service.dbPath, pageErrors: errors, console: logs, unexpectedConsole, requests }, null, 2));
      expect(errors, 'No uncaught application errors during local synchronization').toEqual([]);
      expect(unexpectedConsole, 'No unexpected console warnings or errors').toEqual([]);
    }
  },
});

export const saved = (page: Page): Promise<any> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey);
export const syncConfig = (page: Page): Promise<any> => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), configKey);
export const spaceHeaders = (origin: string, space: Space = 'local-a') => ({ Origin: new URL(origin).origin, 'X-Vesluma-Space': space, 'X-Vesluma-Local': '1' });
export async function remoteSnapshot(page: Page, origin: string, space: Space = 'local-a'): Promise<any> {
  const response = await page.request.get(`${origin}/api/sync`, { headers: spaceHeaders(origin, space) });
  expect(response.status()).toBe(200);
  return response.json();
}

export async function openSync(page: Page) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
  const region = page.getByRole('region', { name: '本机数据库同步' });
  await expect(region).toBeVisible();
  await region.scrollIntoViewIfNeeded();
  return region;
}

export async function waitSynced(page: Page) {
  const region = await openSync(page);
  await expect(region).toContainText('已同步', { timeout: 25_000 });
  await expect.poll(async () => Boolean((await syncConfig(page))?.outbox), { timeout: 25_000 }).toBe(false);
}

export async function enableSync(page: Page, space: Space = 'local-a') {
  const region = await openSync(page);
  await region.getByRole('combobox', { name: '本机资料空间' }).selectOption(space);
  await region.getByRole('button', { name: '开启本机同步', exact: true }).click();
  await waitSynced(page);
}

export async function syncNow(page: Page) {
  const region = await openSync(page);
  await region.getByRole('button', { name: '立即同步', exact: true }).click();
  await waitSynced(page);
}

export async function saveDemoVisit(page: Page, options: { note?: string; anchorName?: string } = {}) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '探索', exact: true }).click();
  if (options.anchorName) {
    await page.getByRole('button', { name: '展开地标列表' }).click();
    await page.locator('.landmark-main').filter({ hasText: options.anchorName }).click();
  } else await page.locator('.landmark-main').first().click();
  await page.locator('.landmark-actions .primary-button').click();
  if (await page.locator('#trip-name').isVisible()) {
    await page.locator('#trip-name').fill('本机同步浏览器验收');
    await page.getByRole('button', { name: '出发，留下这一程' }).click();
  }
  await expect(page.locator('.checkin-screen')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'local-sync-simulation.png', mimeType: 'image/png', buffer: png });
  if (options.note) await page.locator('#visit-note').fill(options.note);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  const state = await saved(page);
  const visit = state.visits[state.visits.length - 1];
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  return visit;
}

export async function photoBytes(page: Page, id: string): Promise<number[] | null> {
  return page.evaluate(id => new Promise<number[] | null>((resolve, reject) => {
    const request = indexedDB.open('vesluma-local-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('photos', 'readonly');
      const photo = transaction.objectStore('photos').get(id);
      photo.onerror = () => { db.close(); reject(photo.error); };
      photo.onsuccess = async () => { const blob = photo.result as Blob | undefined; const bytes = blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null; db.close(); resolve(bytes); };
    };
  }), id);
}

export async function assertPhotos(page: Page, count: number) {
  const state = await saved(page);
  expect(state.visits).toHaveLength(count);
  for (const visit of state.visits) expect(await photoBytes(page, visit.photoId)).toEqual([...png]);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: /我的相册/ }).click();
  await expect(page.getByRole('dialog').locator('.visit-photo img')).toHaveCount(count);
  await expect.poll(() => page.getByRole('dialog').locator('.visit-photo img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
}
