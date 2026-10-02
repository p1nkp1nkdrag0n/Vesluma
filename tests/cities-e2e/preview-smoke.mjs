// Additional host-compatibility smoke; deliberately separate from the counted
// SQLite-backed cases. Build and start Vite preview before running this file.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const url = process.env.VESLUMA_CITIES_PREVIEW_URL ?? 'http://127.0.0.1:4173';
const evidenceDir = join(process.env.VESLUMA_CITIES_QA_DIR ?? join(tmpdir(), 'vesluma-gba-qa'), process.env.VESLUMA_CITIES_HOST_LABEL ?? 'vite-preview');
const plan = JSON.parse(await readFile(new URL('../../src/data/map/city-plans.json', import.meta.url), 'utf8'));
const cityIds = ['nanjing', 'xian', 'beijing', 'shanghai', 'hangzhou', 'chengdu', 'guangzhou', 'shenzhen', 'hongkong', 'macau'];
const mapPattern = id => new RegExp(`^/assets/${id}(?:-[^/]+\\.json(?:\\.gz)?|\\.json-[^/]+\\.gz)$`);
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.VESLUMA_QA_BROWSER });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* System fonts for deterministic host compatibility smoke. */' }));
await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64') }));
const page = await context.newPage();
const pageErrors = [];
const consoleMessages = [];
const responses = [];
const rawHttpResponses = [];
const outcomes = [];
let status = 'failed';
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`); });
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  const cityId = cityIds.find(id => mapPattern(id).test(path));
  if (cityId) responses.push({ cityId, path, status: response.status(), contentType: response.headers()['content-type'], contentEncoding: response.headers()['content-encoding'] ?? null });
});
try {
  await page.goto(url);
  await expect(page).toHaveTitle(/Vesluma/);
  for (const id of cityIds) {
    const city = plan.cities.find(candidate => candidate.id === id);
    expect(city).toBeTruthy();
    await page.locator('.city-title').click();
    await page.getByRole('dialog').locator('.city-option').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) }).click();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await expect(page.locator('.vesluma-map').first()).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 35_000 });
    await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
    await page.screenshot({ path: join(evidenceDir, `${id}-ready.png`) });
    // Read an independent HTTP response: Chromium may evict these large map
    // bodies from its inspector cache even though application decoding worked.
    const asset = responses.find(response => response.cityId === id && response.status === 200);
    expect(asset).toBeTruthy();
    const raw = await page.request.get(new URL(asset.path, url).href);
    const bytes = await raw.body();
    expect(raw.status()).toBe(200);
    expect(bytes.length).toBeGreaterThan(0);
    rawHttpResponses.push({ cityId: id, path: asset.path, status: raw.status(), contentType: raw.headers()['content-type'], contentEncoding: raw.headers()['content-encoding'] ?? null, bytes: bytes.length, firstTwoBytes: [...bytes.subarray(0, 2)] });
    outcomes.push({ cityId: id, status: 'passed', skeleton: 'ready' });
  }
  for (const id of cityIds) expect(responses.some(response => response.cityId === id && response.status === 200)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleMessages.filter(message => !message.includes('Service Worker registration blocked by Playwright'))).toEqual([]);
  status = 'passed';
} finally {
  const entry = await page.locator('script[type=module]').first().getAttribute('src').catch(() => null);
  await writeFile(join(evidenceDir, 'summary.json'), JSON.stringify({ status, url, entry, hostLabel: process.env.VESLUMA_CITIES_HOST_LABEL ?? 'vite-preview', browser: browser.version(), environment: 'Desktop Chromium browser simulation; local host compatibility only, no physical device/field verification. OSM raster tiles and Google Fonts stubbed; bundled geographic snapshots served as real local assets.', outcomes, responses, rawHttpResponses, pageErrors, consoleMessages }, null, 2));
  await context.close();
  await browser.close();
}
