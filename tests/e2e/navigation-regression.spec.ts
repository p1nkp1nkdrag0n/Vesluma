import { expect, test, type Page } from '@playwright/test';

// Browser-only regression checks. Visits use the explicitly labelled demo mode;
// they do not verify a phone, a physical arrival, or any cloud synchronization.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('vesluma:state:v1')!));
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true });
const browserLogs = new WeakMap<Page, { pageErrors: string[]; console: string[] }>();

async function closeModal(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function switchProfile(page: Page, name: string) {
  await nav(page, '我的').click();
  await page.getByRole('button', { name: '切换本地体验账号' }).click();
  await page.getByRole('dialog').locator('.city-option').filter({ hasText: name }).click();
  await expect(page.locator('.profile-identity h2')).toHaveText(name);
}

async function startTrip(page: Page, name: string, squad = false) {
  await page.locator('.trip-pill').click();
  await page.locator('#trip-name').fill(name);
  if (squad) await page.getByRole('button', { name: '小队同行', exact: true }).click();
  await page.getByRole('button', { name: '出发，留下这一程' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).trips.some((trip: { name: string; status: string }) => trip.name === name && trip.status === 'active')).toBe(true);
}

async function saveVisit(page: Page, note = '') {
  await page.locator('.landmark-main').first().click();
  await page.locator('.landmark-actions .primary-button').click();
  await expect(page.locator('.checkin-screen')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'navigation-demo.png', mimeType: 'image/png', buffer: png });
  if (note) await page.locator('#visit-note').fill(note);
  await page.getByRole('button', { name: '模拟抵达此地' }).click();
  await page.locator('.submit-checkin').click();
  await expect(page.getByRole('dialog')).toContainText('抵达，已被记住');
}

test.beforeEach(async ({ page }) => {
  const logs = { pageErrors: [] as string[], console: [] as string[] };
  browserLogs.set(page, logs);
  page.on('pageerror', error => logs.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') logs.console.push(`${message.type()}: ${message.text()}`);
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* Use system fallback font for browser acceptance. */' }));
  await page.goto('/');
  await expect(page).toHaveTitle(/Vesluma/);
  await expect(page.locator('.city-title')).toContainText('南京');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test.afterEach(async ({ page }, testInfo) => {
  const logs = browserLogs.get(page)!;
  await testInfo.attach('navigation-browser-log', { body: JSON.stringify({ url: page.url(), viewport: page.viewportSize(), ...logs }), contentType: 'application/json' });
  await testInfo.attach('navigation-final-screen', { body: await page.screenshot(), contentType: 'image/png' });
  expect(logs.pageErrors, 'No uncaught application errors').toEqual([]);
});

test('private-photo-remains-isolated-after-profile-switch-and-browser-history', async ({ page }) => {
  await startTrip(page, '私密照片的旅程');
  await saveVisit(page, '仅旅行者可见的私密备注');
  await page.getByRole('button', { name: '继续探索这座城' }).click();
  await nav(page, '我的').click();
  await page.getByRole('button', { name: /我的相册/ }).click();
  await page.getByRole('dialog').locator('.visit-photo').click();
  await expect(page.locator('.photo-modal-image')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('仅旅行者可见的私密备注');
  expect((await saved(page)).visits[0].public).toBe(false);
  // The close button first returns to the gallery, then to the profile.
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', '我的相册');
  await closeModal(page);
  await switchProfile(page, '同行者');
  await page.goBack();
  await expect(page.locator('.profile-identity h2')).toHaveText('同行者');
  await page.goForward();
  await expect(page.locator('.profile-identity h2')).toHaveText('同行者');
  await expect(page.locator('.photo-modal-image')).toHaveCount(0);
  await expect(page.getByText('仅旅行者可见的私密备注', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /我的相册/ }).click();
  await expect(page.getByRole('dialog')).toContainText('还没有照片');
  await expect(page.getByRole('dialog').locator('.visit-photo')).toHaveCount(0);
  expect((await saved(page)).visits).toHaveLength(1);
});

test('joining-a-squad-from-another-city-retains-the-squad-city', async ({ page }) => {
  await startTrip(page, '南京本机小队', true);
  await page.locator('.trip-pill').click();
  const code = (await page.getByRole('dialog').locator('.code-box strong').innerText()).trim();
  await closeModal(page);
  await switchProfile(page, '同行者');
  await page.locator('.profile-city').filter({ hasText: '西安' }).click();
  await expect(page.locator('.city-title')).toContainText('西安');
  await nav(page, '我的').click();
  await page.getByRole('button', { name: '切换本地体验账号' }).click();
  await page.getByRole('button', { name: '使用邀请代码加入本机小队' }).click();
  await page.getByRole('textbox', { name: '小队邀请代码' }).fill(code);
  await page.getByRole('button', { name: '加入这次旅行', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', '此刻的旅程');
  await expect(page.getByRole('dialog')).toContainText('南京本机小队');
  await expect.poll(async () => (await saved(page)).cityId).toBe('nanjing');
  const joined = await saved(page);
  expect(joined.trips.find((trip: { id: string }) => trip.id === joined.activeTripId).cityId).toBe('nanjing');
  await page.getByRole('button', { name: '回看这一路' }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('南京本机小队');
  await page.reload();
  await expect(page.locator('.city-title')).toContainText('南京');
  expect((await saved(page)).activeTripId).toBe(joined.activeTripId);
});

test('explicit-current-trip-actions-override-an-archived-trip-selection', async ({ page }) => {
  test.setTimeout(75_000);
  await startTrip(page, '历史旅程 A');
  await saveVisit(page);
  await page.getByRole('button', { name: '回看这一程', exact: true }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('历史旅程 A');
  await page.getByRole('button', { name: /管理旅行/ }).click();
  await page.getByRole('button', { name: '结束并归档本次旅行' }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('历史旅程 A');
  await nav(page, '探索').click();
  await startTrip(page, '当前旅程 B');
  await nav(page, '旅程').click();
  await expect(page.locator('.trip-selection h2')).toHaveText('历史旅程 A');
  await nav(page, '探索').click();
  await saveVisit(page);
  await page.getByRole('button', { name: '回看这一程', exact: true }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('当前旅程 B');
  await expect(page.locator('.trip-timeline-event')).toHaveCount(1);

  // This time the Trips screen remains mounted underneath the manage dialog.
  await page.locator('.trip-archive-card').filter({ hasText: '历史旅程 A' }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('历史旅程 A');
  await page.getByRole('button', { name: '开始新旅行' }).click();
  await page.getByRole('button', { name: '回看这一路' }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('当前旅程 B');

  await page.locator('.trip-archive-card').filter({ hasText: '历史旅程 A' }).click();
  await page.getByRole('button', { name: '开始新旅行' }).click();
  await page.getByRole('button', { name: '结束并归档本次旅行' }).click();
  await expect(page.locator('.trip-selection h2')).toHaveText('当前旅程 B');
  await expect(page.locator('.trip-status')).toContainText('已珍藏');
  expect((await saved(page)).visits).toHaveLength(2);
});
