import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect, cityIds, cityData, openApp, switchCity, mapReady, decodedCover, capture, evidenceDir, saved, mapAssetPattern } from './fixtures';

test.describe('six-city installed production shell', () => {
  test.use({ serviceWorkers: 'allow' });

  test('offline-first-switch-to-all-six-cities-with-cached-map-and-cover', async ({ page, context, service }) => {
    test.setTimeout(240_000);
    await openApp(page, service.url);
    await mapReady(page);
    // Installation caches the manifest's local geographic snapshots. No new
    // city is opened online here: subsequent first switches prove prefetched
    // data works, rather than merely reusing previously rendered maps.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return;
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    const cache = await page.evaluate(async () => {
      const names = (await caches.keys()).filter(name => name.startsWith('vesluma-shell-'));
      const keys = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
      return { names, paths: keys.map(url => new URL(url).pathname), origins: [...new Set(keys.map(url => new URL(url).origin))] };
    });
    expect(cache.origins).toEqual([service.url]);
    expect(cache.paths.every(path => !/\/\d+\/\d+\/\d+\.png$/.test(path))).toBe(true);
    for (const id of cityIds) {
      expect(cache.paths.some(path => mapAssetPattern(id).test(path)), `${id} map snapshot must be installed`).toBe(true);
      expect(cache.paths).toContain(`/images/${id}.png`);
    }
    const before = await saved(page);
    expect(before.cityId).toBe('nanjing');
    const responses: Array<{ path: string; status: number; fromServiceWorker: boolean }> = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (cityIds.some(id => mapAssetPattern(id).test(path)) || /^\/images\/(?:nanjing|xian|beijing|shanghai|hangzhou|chengdu)\.png$/.test(path)) {
        responses.push({ path, status: response.status(), fromServiceWorker: response.fromServiceWorker() });
      }
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mapReady(page);
    for (const id of cityIds) {
      const city = cityData(id);
      await page.locator('.city-title').click();
      const option = page.getByRole('dialog').locator('.city-option').filter({ has: page.locator('b', { hasText: new RegExp(`^${city.name}$`) }) });
      await decodedCover(option.locator('img'), `/images/${id}.png`);
      await option.click();
      await expect(page.locator('.city-title')).toHaveText(city.name);
      await mapReady(page);
      await expect(page.locator('.progress-pill')).toContainText(`0 / ${city.regions.length}`);
      await capture(page, `offline-first-${id}-ready`);
    }
    // Reload in the last, newly opened city, then return to the first one.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.city-title')).toHaveText(cityData('chengdu').name);
    await mapReady(page);
    await switchCity(page, cityData('nanjing'));
    const after = await saved(page);
    expect(after.visits).toEqual(before.visits);
    expect(after.unlocks).toEqual(before.unlocks);
    for (const id of cityIds) {
      expect(responses.some(response => mapAssetPattern(id).test(response.path) && response.status === 200 && response.fromServiceWorker), `${id} geographic response must come from SW while offline`).toBe(true);
      // Images may be reused by Chromium's decoded-image memory cache. Each
      // cover is independently asserted present in the installed SW cache and
      // decoded after networking is disabled; actual response sources are logged.
    }
    await writeFile(join(evidenceDir, 'six-city-offline-cache-evidence.json'), JSON.stringify({
      environment: 'Desktop Chromium with network disabled after complete SW installation; geographic data are bundled snapshots, external detail tiles are not promised offline.',
      url: service.url, cache, responses, visitedOnlineBeforeOffline: ['nanjing'], status: 'passed',
    }, null, 2));
  });
});
