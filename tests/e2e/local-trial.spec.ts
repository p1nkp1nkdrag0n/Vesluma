import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// All coordinates, browser sizes, timeouts, storage and network failures here
// are simulations. This suite is not evidence of physical visits or phone QA.
const evidenceDir = process.env.VESLUMA_QA_DIR ?? join(tmpdir(), 'vesluma-pink-qa');
const stateKey = 'vesluma:state:v1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const plan = JSON.parse(readFileSync(new URL('../../src/data/map/city-plans.json', import.meta.url), 'utf8')) as { cities: Array<{ landmarks: Array<{ id: string; name: string; cover: string; lat: number; lng: number }> }> };
const landmarks = plan.cities.flatMap(city => city.landmarks);
type SavedState = { cityId: string; locationMode: string; activeTripId: string | null; visits: Array<{ id: string; demo: boolean; photoId: string; landmarkId: string; at: number }>; unlocks: unknown[]; trips: Array<{ id: string; cityId: string; status: string }>; position: null | { accuracy: number; lat: number; lng: number } };
const saved = (page: Page): Promise<SavedState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey);

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5_000 });
  await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: false });
}

async function openLandmark(page: Page, tier: 'anchor' | 'other' = 'anchor') {
  if (tier === 'other') await page.getByRole('button', { name: /^全部地标/ }).click();
  const list = page.locator('.landmark-row');
  const row = tier === 'anchor' ? list.filter({ hasText: '一级' }).first() : list.filter({ hasText: /二级|三级/ }).first();
  const name = (await row.locator('strong').innerText()).trim();
  await row.locator('.landmark-main').click();
  await expect(page.locator('.landmark-title h1')).toHaveText(name);
  return landmarks.find(item => item.name === name)!;
}

async function beginCheckIn(page: Page) {
  await page.locator('.landmark-actions .primary-button').click();
  if (await page.locator('#trip-name').isVisible()) {
    await page.locator('#trip-name').fill('浏览器模拟验收');
    await page.getByRole('button', { name: '出发，留下这一程' }).click();
  }
  await expect(page.locator('.checkin-screen')).toBeVisible();
}

async function pickPhoto(page: Page) {
  await page.locator('input[type=file]').setInputFiles({ name: 'browser-simulation.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-picker img')).toBeVisible();
}

async function switchCity(page: Page, name: string) {
  await page.locator('.city-title').click();
  await page.getByRole('dialog').locator('.city-option').filter({ hasText: name }).click();
  await expect(page.locator('.city-title')).toContainText(name);
}

async function installGeoMock(page: Page) {
  await page.addInitScript(() => {
    let nextId = 0;
    const callbacks = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
    const geo = {
      watchPosition(success: PositionCallback, error?: PositionErrorCallback | null) { const id = ++nextId; callbacks.set(id, { success, error }); return id; },
      clearWatch(id: number) { callbacks.delete(id); },
      getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback | null) { return geo.watchPosition(success, error); },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
    (window as any).__qaGeo = {
      count: () => callbacks.size,
      sample: (lat: number, lng: number, accuracy: number, ageMs = 0) => callbacks.forEach(cb => cb.success({ timestamp: Date.now() - ageMs, coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: 0 }, toJSON() {} } as GeolocationPosition)),
      error: (code: number) => callbacks.forEach(cb => cb.error?.({ code, message: 'Simulated geolocation failure', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })),
    };
  });
}

async function deviceMode(page: Page) {
  await page.locator('.location-footnote').click();
  await page.getByRole('button', { name: '设备定位', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__qaGeo.count())).toBeGreaterThan(0);
}

async function geoSample(page: Page, landmark: { lat: number; lng: number }, distance: number, accuracy = 5, ageMs = 0) {
  const lat = landmark.lat + distance / 6_371_000 * 180 / Math.PI;
  await page.evaluate(({ lat, lng, accuracy, ageMs }) => (window as any).__qaGeo.sample(lat, lng, accuracy, ageMs), { lat, lng: landmark.lng, accuracy, ageMs });
}

test.beforeEach(async ({ page }, testInfo) => {
  const logs: string[] = [];
  const errors: string[] = [];
  page.on('console', event => { if (event.type() === 'error' || event.type() === 'warning') logs.push(`${event.type()}: ${event.text().replace(/\?[^\s]+/g, '?[redacted]')}`); });
  page.on('pageerror', error => errors.push(error.message));
  (testInfo as any).__qaLogs = logs;
  (testInfo as any).__qaErrors = errors;
  // Deterministic external raster response for workflow tests. The separate
  // real-network smoke test records actual third-party availability.
  if (!testInfo.title.includes('real-external-network')) {
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* Acceptance uses the system fallback font. */' }));
  }
});

test.afterEach(async ({ page }, testInfo) => {
  await mkdir(evidenceDir, { recursive: true });
  const name = testInfo.title.replace(/[^a-zA-Z0-9-]/g, '-');
  const errors = (testInfo as any).__qaErrors as string[];
  const injectedNetworkFault = /failed-example|slow-city-map|320-map-tile|total-timeout|pending-example/.test(testInfo.title);
  const unexpectedLogs = ((testInfo as any).__qaLogs as string[]).filter(log => !log.includes('Service Worker registration blocked by Playwright') && !(injectedNetworkFault && log.includes('Failed to load resource: net::ERR_')));
  await writeFile(join(evidenceDir, `${name}.json`), JSON.stringify({ title: testInfo.title, url: page.url(), browser: page.context().browser()?.version(), viewport: page.viewportSize(), status: errors.length || unexpectedLogs.length ? 'failed' : testInfo.status, console: (testInfo as any).__qaLogs, pageErrors: errors, unexpectedConsole: unexpectedLogs }, null, 2));
  expect(errors, 'No uncaught application runtime errors').toEqual([]);
  expect(unexpectedLogs, 'No unexpected console errors or warnings').toEqual([]);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`identity-and-layout-${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page).toHaveTitle(/Vesluma/);
    await expect(page.locator('.city-title')).toContainText('南京');
    await expect(page.locator('.landmark-main').first()).toBeVisible();
    await expect(page.locator('.vesluma-map')).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 30_000 });
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capture(page, `explore-${viewport.width}`);
    await page.getByRole('button', { name: /已展开.*全市分区/ }).click();
    await expect(page.locator('.region-card')).toHaveCount(11);
    await page.getByRole('button', { name: '返回探索' }).click();
    await expect(page.locator('.city-title')).toContainText('南京');
    await openLandmark(page);
    await beginCheckIn(page);
    await pickPhoto(page);
    await page.getByRole('button', { name: '模拟抵达此地' }).click();
    await expect(page.locator('.submit-checkin')).toBeEnabled();
    await page.locator('.submit-checkin').scrollIntoViewIfNeeded();
    await capture(page, `checkin-${viewport.width}`);
    const box = await page.locator('.submit-checkin').boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.locator('.submit-checkin').evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
  });
}

test('anchor-duplicate-revisit-city-refresh', async ({ page }) => {
  await page.goto('/');
  const landmark = await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  // Two immediate clicks reproduce a double tap without waiting for navigation.
  await page.locator('.submit-checkin').evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  let state = await saved(page);
  expect(state.visits).toHaveLength(1);
  expect(state.unlocks).toHaveLength(1);
  expect(state.visits[0].demo).toBe(true);
  const firstAt = state.visits[0].at;
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /我的记录 1/ }).click();
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  state = await saved(page);
  expect(state.visits).toHaveLength(2);
  expect(state.unlocks).toHaveLength(1);
  expect(state.visits[0].at).toBe(firstAt);
  expect(state.visits.every(visit => visit.landmarkId === landmark.id)).toBe(true);
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await expect(page.locator('.progress-pill')).toContainText('1 / 11');
  await switchCity(page, '西安');
  await expect(page.locator('.progress-pill')).toContainText('0 / 10');
  await page.locator('.trip-pill').click();
  await page.getByRole('button', { name: '回到 南京 的当前旅行' }).click();
  await expect(page.locator('.progress-pill')).toContainText('1 / 11');
  await page.reload();
  await expect(page.locator('.progress-pill')).toContainText('1 / 11');
  expect((await saved(page)).visits).toHaveLength(2);
  await capture(page, 'anchor-progress-after-refresh');
  await page.getByRole('button', { name: '展开地标列表' }).click();
  await page.locator('.landmark-main').filter({ hasText: landmark.name }).click();
  await expect(page.locator('.visit-photo img')).toHaveCount(2);
  await expect.poll(() => page.locator('.visit-photo img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
});

test('secondary-landmark-records-without-unlock', async ({ page }) => {
  await page.goto('/');
  const landmark = await openLandmark(page, 'other');
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  const state = await saved(page);
  expect(state.visits).toHaveLength(1);
  expect(state.visits[0].landmarkId).toBe(landmark.id);
  expect(state.unlocks).toHaveLength(0);
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await expect(page.locator('.progress-pill')).toContainText('0 / 11');
});

for (const code of [1, 2, 3]) {
  test(`geolocation-error-${code}-retry-keeps-photo`, async ({ page }) => {
    await installGeoMock(page);
    await page.goto('/');
    await deviceMode(page);
    await page.evaluate(code => (window as any).__qaGeo.error(code), code);
    await expect(page.getByRole('dialog')).toContainText(code === 1 ? /权限未获允许/ : code === 2 ? /暂时无法|无法取得|暂时不可用/ : /超时/);
    await capture(page, `geolocation-error-${code}`);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    const landmark = await openLandmark(page);
    await beginCheckIn(page);
    await pickPhoto(page);
    await page.locator('#visit-note').fill('定位重试保留的草稿');
    await expect(page.locator('.submit-checkin')).toBeDisabled();
    await page.getByRole('button', { name: '重新获取设备位置' }).click();
    await geoSample(page, landmark, 0);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('.photo-picker img')).toBeVisible();
    await expect(page.locator('#visit-note')).toHaveValue('定位重试保留的草稿');
    await expect(page.locator('.submit-checkin')).toBeEnabled();
    await page.locator('.submit-checkin').click();
    await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
    expect((await saved(page)).visits[0].demo).toBe(false);
  });
}

test('geolocation-accuracy-staleness-and-250m-boundary', async ({ page }) => {
  await installGeoMock(page);
  await page.goto('/');
  await deviceMode(page);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const landmark = await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await geoSample(page, landmark, 0, 101);
  await expect(page.locator('.location-validation')).toContainText('精度不足');
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await geoSample(page, landmark, 0, 100.1);
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await geoSample(page, landmark, 0, 5, 301_000);
  await expect(page.locator('.location-validation')).toContainText('过期');
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await geoSample(page, landmark, 250.1);
  await expect(page.locator('.location-validation')).toContainText('250 米内');
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await capture(page, 'outside-250m');
  await geoSample(page, landmark, 250, 100);
  await expect(page.locator('.location-validation')).toContainText('校验通过');
  await expect(page.locator('.submit-checkin')).toBeEnabled();
  await capture(page, 'exact-250m');
  await geoSample(page, landmark, 249.9, 100);
  await expect(page.locator('.location-validation')).toContainText('校验通过');
  await expect(page.locator('.submit-checkin')).toBeEnabled();
  await capture(page, 'inside-250m');
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  expect((await saved(page)).visits).toHaveLength(1);
});

test('failed-example-photo-local-photo-recovery', async ({ page }) => {
  await page.goto('/');
  const landmark = await openLandmark(page);
  await beginCheckIn(page);
  await page.route(`**${landmark.cover}`, route => route.abort('failed'));
  await page.getByRole('button', { name: '使用示例图片体验流程' }).click();
  await expect(page.getByRole('alert')).toContainText('示例图片没有加载成功');
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await page.unroute(`**${landmark.cover}`);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
});

test('slow-city-map-and-resource-failure-retry', async ({ page }) => {
  let fail = true;
  let requests = 0;
  await page.route(/\/assets\/nanjing-[^/]+\.json$/, async route => {
    requests += 1;
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (fail) await route.abort('failed'); else await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.city-title')).toContainText('南京');
  await expect(page.locator('.landmark-main').first()).toBeVisible();
  // This assertion intentionally verifies a useful recovery control.
  const retry = page.locator('.vesluma-skeleton-status').getByRole('button', { name: '重试', exact: true });
  await expect(retry).toBeVisible({ timeout: 20_000 });
  await capture(page, 'map-resource-failed');
  fail = false;
  await retry.click();
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(page.locator('.vesluma-map')).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 20_000 });
  await capture(page, 'map-resource-recovered');
});

test('draft-browser-back-cancel-then-discard', async ({ page }) => {
  await page.goto('/');
  await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.locator('#visit-note').fill('取消离开应保留草稿');
  page.once('dialog', dialog => dialog.dismiss());
  await page.goBack();
  await expect(page.locator('.checkin-screen')).toBeVisible();
  await expect(page.locator('#visit-note')).toHaveValue('取消离开应保留草稿');
  await expect(page.locator('.photo-picker img')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '返回地标详情' }).click();
  await expect(page.locator('.landmark-screen')).toBeVisible();
  expect((await saved(page)).visits).toHaveLength(0);
  await beginCheckIn(page);
  await expect(page.locator('#visit-note')).toHaveValue('');
  await expect(page.locator('.photo-picker img')).toHaveCount(0);
});

test('save-in-flight-navigation-cancels-late-record', async ({ page }) => {
  await page.goto('/');
  await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  // Delay only the real IDB transaction's completion callback, never app APIs.
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      configurable: true,
      get: original.get,
      set(handler) {
        const transaction = this as IDBTransaction;
        if (transaction.mode !== 'readwrite' || !(window as any).__qaDelaySave) { original.set!.call(transaction, handler); return; }
        original.set!.call(transaction, (event: Event) => { (window as any).__qaReleaseSave = () => handler.call(transaction, event); });
      },
    });
    (window as any).__qaDelaySave = true;
  });
  await page.locator('.submit-checkin').click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__qaReleaseSave)).toBe('function');
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await capture(page, 'save-in-flight');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的' }).click();
  await expect(page.locator('.profile-heading')).toBeVisible();
  await page.evaluate(() => { (window as any).__qaDelaySave = false; (window as any).__qaReleaseSave(); });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).visits.length).toBe(0);
  await page.reload();
  expect((await saved(page)).visits).toHaveLength(0);
  expect((await saved(page)).unlocks).toHaveLength(0);
});

test('failed-record-storage-retry-is-single-save', async ({ page }) => {
  await page.goto('/');
  await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    (window as any).__qaBlockState = true;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && (window as any).__qaBlockState && JSON.parse(value).visits.length > 0) throw new DOMException('模拟：本地存储空间不足', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, stateKey);
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('alert')).toContainText('本地存储空间不足');
  expect((await saved(page)).visits).toHaveLength(0);
  await expect(page.locator('.photo-picker img')).toBeVisible();
  await capture(page, 'storage-failed-retains-draft');
  await page.evaluate(() => { (window as any).__qaBlockState = false; });
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  expect((await saved(page)).visits).toHaveLength(1);
  expect((await saved(page)).unlocks).toHaveLength(1);
});

test('320-map-tile-failure-retry-hit-targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let fail = true;
  await page.route('https://tile.openstreetmap.org/**', route => fail ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.goto('/');
  await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await expect(page.locator('.vesluma-map')).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: '重试底图' })).toBeVisible({ timeout: 20_000 });
  await capture(page, 'map-tiles-failed-320');
  for (const name of ['重试底图', '查看全市范围', '放大地图', '缩小地图', '回到最近位置']) {
    const target = page.getByRole('button', { name, exact: true });
    expect(await target.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), `${name} is not obscured at 320px`).toBe(true);
  }
  fail = false;
  await page.getByRole('button', { name: '重试底图' }).click();
  await expect(page.getByRole('button', { name: '重试底图' })).toHaveCount(0);
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await page.getByRole('button', { name: '缩小地图', exact: true }).click();
  await capture(page, 'map-tiles-recovered-320');
});

test('map-request-total-timeout-and-retry', async ({ page }) => {
  test.setTimeout(60_000);
  let hold = true;
  await page.route(/\/assets\/nanjing-[^/]+\.json$/, async route => {
    if (hold) await new Promise(resolve => setTimeout(resolve, 35_000));
    if (!page.isClosed()) await route.continue().catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.city-title')).toContainText('南京');
  const retry = page.locator('.vesluma-skeleton-status').getByRole('button', { name: '重试', exact: true });
  await expect(retry).toBeVisible({ timeout: 34_000 });
  await capture(page, 'map-timeout');
  hold = false;
  await retry.click();
  await expect(page.locator('.vesluma-map')).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 20_000 });
});

test('real-external-network-map-smoke', async ({ page }) => {
  test.skip(process.env.VESLUMA_QA_REAL_NETWORK !== '1', 'Opt in separately to inspect actual public tile availability; deterministic acceptance uses stubbed raster tiles.');
  test.setTimeout(75_000);
  const responses: Array<{ host: string; status: number }> = [];
  page.on('response', response => { if (new URL(response.url()).host === 'tile.openstreetmap.org') responses.push({ host: 'tile.openstreetmap.org', status: response.status() }); });
  await page.goto('/');
  await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  responses.length = 0;
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await expect(page.locator('.vesluma-map')).toHaveAttribute('data-skeleton-status', 'ready', { timeout: 30_000 });
  await expect.poll(() => page.locator('.leaflet-tile-pane img').evaluateAll(images => images.length > 0 && images.every(image => image.classList.contains('leaflet-tile-loaded') && (image as HTMLImageElement).naturalWidth > 0)), { timeout: 35_000 }).toBe(true);
  await expect(page.locator('.vesluma-map-statuses')).not.toContainText('详细底图正在加载');
  await expect(page.getByRole('button', { name: '重试底图' })).toHaveCount(0);
  await capture(page, 'real-external-map');
  await writeFile(join(evidenceDir, 'real-external-map-responses.json'), JSON.stringify({ map: 'after save success and return to explore', responses, decodedTileImages: await page.locator('.leaflet-tile-pane img').count() }, null, 2));
  expect(responses.some(response => response.status === 200), 'At least one real external tile responds successfully').toBe(true);
});

test('geolocation-no-callback-deadline-and-loss-invalidates-old-fix', async ({ page }) => {
  await installGeoMock(page);
  await page.goto('/');
  await deviceMode(page);
  await expect(page.getByRole('dialog')).toContainText('获取位置超时', { timeout: 17_000 });
  await capture(page, 'geolocation-no-callback-timeout');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const landmark = await openLandmark(page);
  await beginCheckIn(page);
  await pickPhoto(page);
  await geoSample(page, landmark, 0);
  await expect(page.locator('.submit-checkin')).toBeEnabled();
  await page.evaluate(() => (window as any).__qaGeo.error(1));
  await expect(page.locator('.submit-checkin')).toBeDisabled();
  await expect(page.locator('.location-validation')).toContainText('权限未获允许');
  expect((await saved(page)).position).toBeNull();
  await expect(page.locator('.photo-picker img')).toBeVisible();
});

test('pending-example-can-be-replaced-by-local-photo', async ({ page }) => {
  await page.goto('/');
  const landmark = await openLandmark(page);
  await beginCheckIn(page);
  let release: (() => void) | undefined;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${landmark.cover}`, async route => {
    await responseGate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: png }).catch(() => {});
  });
  await page.getByRole('button', { name: '使用示例图片体验流程' }).click();
  await expect(page.locator('.example-photo-button')).toContainText('加载中');
  await pickPhoto(page);
  release!();
  await expect(page.locator('.photo-picker img')).toHaveAttribute('alt', `${landmark.name}准备保存的到访合影`);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await expect(page.locator('.submit-checkin')).toBeEnabled();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
  expect((await saved(page)).visits).toHaveLength(1);
});
