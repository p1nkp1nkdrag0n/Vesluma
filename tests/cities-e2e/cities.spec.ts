import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect, cityIds, newCityIds, gbaCityIds, cityData, openApp, switchCity, mapReady, decodedCover, capture, saveVisit, endTrip, saved, png, evidenceDir } from './fixtures';
import { enableSync, syncNow, photoBytes, remoteSnapshot } from '../sync-e2e/fixtures';

for (const id of cityIds) {
  test(`${id}-entry-cover-all-regions-and-ready-map`, async ({ page, service }) => {
    if (id === 'beijing' || gbaCityIds.some(candidate => candidate === id)) await page.setViewportSize({ width: 320, height: 568 });
    const city = cityData(id);
    const expectedCover = `/images/${id}.png`;
    expect(city.landmarks[0].cover).toBe(expectedCover);
    await openApp(page, service.url);
    await page.locator('.city-title').click();
    const options = page.getByRole('dialog').locator('.city-option');
    await expect(options).toHaveCount(cityIds.length);
    for (const candidateId of cityIds) {
      const candidate = cityData(candidateId);
      const option = options.filter({ has: page.locator('b', { hasText: new RegExp(`^${candidate.name}$`) }) });
      await decodedCover(option.locator('img'), `/images/${candidateId}.png`);
    }
    await options.filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) }).click();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await mapReady(page);
    await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `${id}-explore-ready`);
    await page.locator('.progress-pill').click();
    await expect(page.locator('.regions-intro h1')).toContainText(`${city.name}，分 ${city.regions.length} 次展开`);
    await expect(page.locator('.region-card')).toHaveCount(city.regions.length);
    const names = await page.locator('.region-card-heading b').allTextContents();
    expect(names).toEqual(city.regions.map(region => region.name));
    await mapReady(page);
    // Real click into the final district catches clipping/scroll reachability.
    const last = page.locator('.region-card-heading').last();
    await last.click();
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.region-card.selected .region-boundary-note')).toBeVisible();
    await page.getByRole('button', { name: '返回探索', exact: true }).click();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
    await expect(page.locator('.profile-city')).toHaveCount(cityIds.length);
    const profileCity = page.locator('.profile-city').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) });
    await decodedCover(profileCity.locator('img'), expectedCover);
    await profileCity.click();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await page.reload();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await mapReady(page);
  });
}

for (const id of newCityIds) {
  test(`${id}-ordinary-visit-anchor-unlock-back-and-refresh`, async ({ page, service }) => {
    const city = cityData(id);
    const ordinary = city.landmarks.find(landmark => landmark.tier !== 1);
    expect(ordinary, `${city.name} must offer an ordinary visit without unlock`).toBeTruthy();
    const anchor = city.landmarks.find(landmark => landmark.tier === 1)!;
    await openApp(page, service.url);
    await switchCity(page, city);
    const ordinaryVisit = await saveVisit(page, ordinary!);
    let state = await saved(page);
    expect(state.visits).toHaveLength(1);
    expect(state.unlocks).toHaveLength(0);
    expect(ordinaryVisit.unlockedRegionIds).toEqual([]);
    await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
    const anchorVisit = await saveVisit(page, anchor);
    state = await saved(page);
    expect(state.visits).toHaveLength(2);
    expect(state.unlocks.map((unlock: any) => unlock.regionId).sort()).toEqual([...anchor.regionIds].sort());
    expect(anchorVisit.unlockedRegionIds).toEqual(anchor.regionIds);
    expect(state.visits.every((visit: any) => visit.cityId === id && visit.demo)).toBe(true);
    const expectedVisitIds = [ordinaryVisit.id, anchorVisit.id];
    if (gbaCityIds.some(candidate => candidate === id)) {
      const repeat = await saveVisit(page, anchor);
      expectedVisitIds.push(repeat.id);
      state = await saved(page);
      expect(state.visits).toHaveLength(3);
      expect(new Set(expectedVisitIds).size).toBe(3);
      expect(state.unlocks).toHaveLength(anchor.regionIds.length);
      expect(state.unlocks[0].at).toBe(anchorVisit.at);
      expect(repeat.firstActivation).toBe(false);
      expect(repeat.unlockedRegionIds).toEqual([]);
    }
    for (const visit of state.visits) expect(await photoBytes(page, visit.photoId)).toEqual([...png]);
    await expect(page.locator('.progress-pill')).toContainText(`${anchor.regionIds.length} / ${city.regions.length}`);
    await page.locator('.progress-pill').click();
    await page.getByRole('button', { name: '返回探索', exact: true }).click();
    await page.reload();
    await expect(page.locator('.city-title')).toHaveText(city.name);
    await mapReady(page);
    expect((await saved(page)).visits.map((visit: any) => visit.id)).toEqual(expectedVisitIds);
    await expect(page.locator('.progress-pill')).toContainText(`${anchor.regionIds.length} / ${city.regions.length}`);
    await capture(page, `${id}-ordinary-and-anchor-after-refresh`);
  });
}

test('ten-city-progress-stays-independent-after-return-and-refresh', async ({ page, service }) => {
  test.setTimeout(240_000);
  await openApp(page, service.url);
  const completed: string[] = [];
  for (const id of cityIds) {
    const city = cityData(id);
    await switchCity(page, city);
    await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
    await saveVisit(page, city.landmarks.find(landmark => landmark.tier === 1)!);
    completed.push(id);
    const state = await saved(page);
    for (const candidate of cityIds) {
      expect(state.visits.filter((visit: any) => visit.cityId === candidate)).toHaveLength(completed.includes(candidate) ? 1 : 0);
      expect(state.unlocks.filter((unlock: any) => unlock.cityId === candidate)).toHaveLength(completed.includes(candidate) ? 1 : 0);
    }
    await endTrip(page);
  }
  await page.reload();
  for (const id of [...cityIds].reverse()) {
    const city = cityData(id);
    await switchCity(page, city);
    await expect(page.locator('.progress-pill')).toContainText(`1 / ${city.regions.length}`);
  }
  expect((await saved(page)).visits).toHaveLength(cityIds.length);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
  for (const id of cityIds) {
    const city = cityData(id);
    const card = page.locator('.profile-city').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) });
    await expect(card).toContainText(`已展开 1 / ${city.regions.length} 片区域 · 到访 1 个地标`);
  }
  await capture(page, 'ten-city-independent-progress');
});

test('new-city-two-context-sqlite-restore-retains-progress-and-photo', async ({ page, browser, service }) => {
  const city = cityData('chengdu');
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const restoredPage = await second.newPage();
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  restoredPage.on('pageerror', error => errors.push(error.message));
  restoredPage.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(`${message.type()}: ${message.text()}`); });
  try {
    await openApp(page, service.url);
    await switchCity(page, city);
    const visit = await saveVisit(page, city.landmarks.find(landmark => landmark.tier === 1)!);
    await enableSync(page);
    const remote = await remoteSnapshot(page, service.url);
    expect(remote.snapshot.visits[0].cityId).toBe(city.id);
    expect(remote.snapshot.unlocks).toHaveLength(1);
    await service.restart();
    await openApp(restoredPage, service.url);
    await enableSync(restoredPage);
    const restored = await saved(restoredPage);
    expect(restored.visits).toHaveLength(1);
    expect(restored.visits[0].id).toBe(visit.id);
    expect(restored.activeTripId).toBe(null);
    expect(await photoBytes(restoredPage, restored.visits[0].photoId)).toEqual([...png]);
    await syncNow(restoredPage);
    await switchCity(restoredPage, city);
    await expect(restoredPage.locator('.progress-pill')).toContainText(`1 / ${city.regions.length}`);
    await restoredPage.reload();
    await mapReady(restoredPage);
    await expect(restoredPage.locator('.city-title')).toHaveText(city.name);
    await expect(restoredPage.locator('.progress-pill')).toContainText(`1 / ${city.regions.length}`);
    await capture(restoredPage, 'chengdu-second-context-after-sqlite-restart');
    expect(errors).toEqual([]);
    expect(consoleMessages.filter(message => !message.includes('Service Worker registration blocked by Playwright'))).toEqual([]);
  } finally {
    await writeFile(join(evidenceDir, 'chengdu-second-context-console.json'), JSON.stringify({ pageErrors: errors, consoleMessages }, null, 2));
    await second.close();
  }
});

test('gba-four-cities-two-context-sqlite-restart-restores-each-private-photo', async ({ devices, service }) => {
  test.setTimeout(180_000);
  const { a, b } = devices;
  const visitIds: string[] = [];
  for (const id of gbaCityIds) {
    const city = cityData(id);
    await switchCity(a.page, city);
    const visit = await saveVisit(a.page, city.landmarks.find(landmark => landmark.tier === 1)!);
    visitIds.push(visit.id);
    await endTrip(a.page);
  }
  await enableSync(a.page);
  const remote = await remoteSnapshot(a.page, service.url);
  expect(remote.snapshot.visits).toHaveLength(gbaCityIds.length);
  expect(remote.snapshot.unlocks).toHaveLength(gbaCityIds.length);
  await service.restart();
  await enableSync(b.page);
  const restored = await saved(b.page);
  expect(restored.activeTripId).toBe(null);
  expect(restored.visits.map((visit: any) => visit.id).sort()).toEqual([...visitIds].sort());
  for (const visit of restored.visits) {
    expect(visit.public).toBe(false);
    expect(await photoBytes(b.page, visit.photoId)).toEqual([...png]);
  }
  for (const id of cityIds) {
    const expected = gbaCityIds.some(candidate => candidate === id) ? 1 : 0;
    expect(restored.visits.filter((visit: any) => visit.cityId === id)).toHaveLength(expected);
    expect(restored.unlocks.filter((unlock: any) => unlock.cityId === id)).toHaveLength(expected);
  }
  await syncNow(b.page);
  for (const id of gbaCityIds) {
    const city = cityData(id);
    await switchCity(b.page, city);
    await expect(b.page.locator('.progress-pill')).toContainText(`1 / ${city.regions.length}`);
    await b.page.reload();
    await mapReady(b.page);
    await expect(b.page.locator('.city-title')).toHaveText(city.name);
    await expect(b.page.locator('.progress-pill')).toContainText(`1 / ${city.regions.length}`);
    await capture(b.page, `${id}-second-context-after-sqlite-restart`);
  }
});
