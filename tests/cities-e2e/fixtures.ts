import { type Page, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as syncTest, expect, evidenceDir, saved, png } from '../sync-e2e/fixtures';

export { expect, evidenceDir, saved, png };
export const originalCityIds = ['nanjing', 'xian', 'beijing', 'shanghai', 'hangzhou', 'chengdu'] as const;
export const gbaCityIds = ['guangzhou', 'shenzhen', 'hongkong', 'macau'] as const;
export const cityIds = [...originalCityIds, ...gbaCityIds];
export const newCityIds = cityIds.slice(2);
export const mapAssetPattern = (id: string) => new RegExp(`^/assets/${id}(?:-[^/]+\\.json(?:\\.gz)?|\\.json-[^/]+\\.gz)$`);
export interface Landmark { id: string; name: string; tier: number; cover: string; regionIds: string[] }
export interface City { id: string; name: string; landmarks: Landmark[]; regions: Array<{ id: string; name: string; anchorLandmarkId: string }> }
const plan = JSON.parse(readFileSync(new URL('../../src/data/map/city-plans.json', import.meta.url), 'utf8')) as { cities: City[] };
export function cityData(id: string): City {
  const city = plan.cities.find(item => item.id === id);
  if (!city) throw new Error(`Ten-city acceptance requires configured city: ${id}`);
  return city;
}

export const test = syncTest.extend<{ cityAudit: void }>({
  cityAudit: [async ({ page, browser }, use, testInfo) => {
    const pageErrors: string[] = [];
    const consoleMessages: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    await use();
    await mkdir(evidenceDir, { recursive: true });
    const name = testInfo.title.replace(/[^a-zA-Z0-9-]/g, '-');
    const intentionalOffline = testInfo.title.includes('offline');
    const expectedCacheMiss = testInfo.title === 'on-demand-install-offline-unvisited-recovery-lru-and-api-exclusion';
    const unexpectedConsole = consoleMessages.filter(message => !message.includes('Service Worker registration blocked by Playwright')
      && !(intentionalOffline && /Failed to load resource: net::ERR_(INTERNET_DISCONNECTED|FAILED)/.test(message))
      && !(expectedCacheMiss && /Failed to load resource: the server responded with a status of 503/.test(message)));
    if (!page.isClosed() && page.url() !== 'about:blank') await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
    // Device-fixture cases have their own multi-context evidence under name.json.
    // Preserve it when this automatically created audit page stayed unused.
    const auditName = page.url() === 'about:blank' ? `${name}-page-audit` : name;
    await writeFile(join(evidenceDir, `${auditName}.json`), JSON.stringify({
      title: testInfo.title, status: testInfo.status, browser: browser.version(), url: page.url(), viewport: page.viewportSize(),
      environment: 'Desktop Chromium browser/context/position simulations, not physical phones or field verification. Temporary local SQLite spaces are not production authentication.',
      externalResources: 'OSM raster tiles and Google Fonts are stubbed for deterministic flows; independent real-network smoke runs in the baseline suite.',
      pageErrors, consoleMessages, unexpectedConsole,
    }, null, 2));
    expect(pageErrors, 'No application page errors').toEqual([]);
    expect(unexpectedConsole, 'No unexpected console errors or warnings').toEqual([]);
  }, { auto: true }],
});

export async function stubExternal(page: Page) {
  await page.context().route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.context().route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* City acceptance uses system fonts. */' }));
}

export async function openApp(page: Page, url: string) {
  await stubExternal(page);
  await page.goto(url);
  await expect(page).toHaveTitle(/Vesluma/);
  await expect(page.locator('.city-title')).toHaveText('南京');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
}

export async function mapReady(page: Page) {
  await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 35_000 });
  await expect(page.locator('.map-loading')).toHaveCount(0);
}

export async function switchCity(page: Page, city: City, waitForMap = true) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '探索', exact: true }).click();
  await page.locator('.city-title').click();
  await page.getByRole('dialog').locator('.city-option').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) }).click();
  await expect(page.locator('.city-title')).toHaveText(city.name);
  await expect.poll(async () => (await saved(page)).cityId).toBe(city.id);
  if (waitForMap) await mapReady(page);
}

export async function decodedCover(image: Locator, path: string) {
  await expect(image).toHaveAttribute('src', path);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
}

export async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5_000 });
  await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
}

export async function saveVisit(page: Page, landmark: Landmark) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '探索', exact: true }).click();
  const expand = page.getByRole('button', { name: '展开地标列表', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: /^全部地标/ }).click();
  await page.locator('.landmark-main').filter({ has: page.locator('strong', { hasText: new RegExp(`^${landmark.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).click();
  await expect(page.locator('.landmark-title h1')).toHaveText(landmark.name);
  await decodedCover(page.locator('.landmark-cover img'), landmark.cover);
  await page.locator('.landmark-actions .primary-button').click();
  if (await page.locator('#trip-name').isVisible()) {
    await page.locator('#trip-name').fill('六城浏览器模拟验收');
    await page.getByRole('button', { name: '出发，留下这一程' }).click();
  }
  await expect(page.locator('.checkin-screen')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'six-city-simulation.png', mimeType: 'image/png', buffer: png });
  await page.locator('#visit-note').fill(`浏览器模拟：${landmark.name}，不代表实地到访`);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  const state = await saved(page);
  const visit = state.visits[state.visits.length - 1];
  expect(visit.landmarkId).toBe(landmark.id);
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await mapReady(page);
  return visit;
}

export async function endTrip(page: Page) {
  if (!(await saved(page)).activeTripId) return;
  await page.locator('.trip-pill').click();
  await page.getByRole('button', { name: '结束并归档本次旅行', exact: true }).click();
  await expect.poll(async () => (await saved(page)).activeTripId).toBe(null);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '探索', exact: true }).click();
}
