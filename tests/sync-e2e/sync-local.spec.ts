import { test, expect, saved, syncConfig, openSync, enableSync, waitSynced, syncNow, saveDemoVisit, assertPhotos, photoBytes, remoteSnapshot, spaceHeaders, png, migrationKey, configKey } from './fixtures';

test('pre-sync-records-and-photos-migrate-without-clearing-local-data', async ({ devices, service }) => {
  const { a, b } = devices;
  const visit = await saveDemoVisit(a.page, { note: '开启数据库同步之前的本地照片' });
  await a.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
  await a.page.getByRole('button', { name: /我的相册/ }).click();
  await a.page.getByRole('dialog').locator('.visit-photo').click();
  await a.page.getByRole('button', { name: '将这张照片公开到地标相册' }).click();
  await a.page.getByRole('button', { name: '关闭', exact: true }).click();
  await a.page.getByRole('button', { name: '关闭', exact: true }).click();
  const before = await saved(a.page);
  expect(before.visits[0].public).toBe(true);
  expect(await syncConfig(a.page)).toBeNull();
  await enableSync(a.page);
  const after = await saved(a.page);
  expect(after.visits[0].id).toBe(visit.id);
  expect(after.visits[0].photoId).toBe(visit.photoId);
  expect(after.visits[0].public).toBe(true);
  expect(await photoBytes(a.page, visit.photoId)).toEqual([...png]);
  const migration = await a.page.evaluate(key => localStorage.getItem(key), migrationKey);
  expect(migration).toBeTruthy();
  expect(migration).toContain(visit.id);
  const remote = await remoteSnapshot(a.page, service.url);
  expect(remote.snapshot.visits).toHaveLength(1);
  expect(remote.snapshot).not.toHaveProperty('points');
  expect(remote.snapshot).not.toHaveProperty('position');
  expect(remote.snapshot).not.toHaveProperty('activeTripId');
  expect(remote.snapshot.visits[0].public).toBe(false);
  await enableSync(b.page);
  await assertPhotos(b.page, 1);
  const restored = await saved(b.page);
  expect(restored.visits[0].id).toBe(visit.id);
  expect(restored.visits[0].public).toBe(false);
  expect(restored.activeTripId).toBeNull();
  expect(restored.points).toHaveLength(0);
  expect(after.points).toEqual(before.points);
});

test('two-offline-device-contexts-merge-visits-and-deduplicate-region', async ({ devices, service }) => {
  const { a, b } = devices;
  await enableSync(a.page);
  await enableSync(b.page);
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  const first = await saveDemoVisit(a.page, { anchorName: '玄武门', note: '模拟设备 A 离线到访' });
  const second = await saveDemoVisit(b.page, { anchorName: '玄武门', note: '模拟设备 B 离线到访' });
  expect(first.id).not.toBe(second.id);
  await a.context.setOffline(false);
  await syncNow(a.page);
  await b.context.setOffline(false);
  await syncNow(b.page);
  await syncNow(a.page);
  await syncNow(a.page);
  for (const page of [a.page, b.page]) {
    const state = await saved(page);
    expect(new Set(state.visits.map((visit: any) => visit.id))).toEqual(new Set([first.id, second.id]));
    expect(state.unlocks).toHaveLength(1);
    await assertPhotos(page, 2);
  }
  const remote = await remoteSnapshot(a.page, service.url);
  expect(remote.snapshot.visits).toHaveLength(2);
  expect(remote.snapshot.unlocks).toHaveLength(1);
});

test('lost-post-response-retries-the-durable-request-after-refresh', async ({ devices, service }) => {
  const { a } = devices;
  await saveDemoVisit(a.page);
  let loseResponses = true;
  const sentIds: string[] = [];
  const replies: Array<{ replayed: boolean }> = [];
  await a.page.route('**/api/sync', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    sentIds.push(route.request().postDataJSON().requestId);
    const response = await route.fetch();
    replies.push(await response.json());
    if (loseResponses) await route.abort('connectionfailed'); else await route.fulfill({ response });
  });
  const region = await openSync(a.page);
  await region.getByRole('button', { name: '开启本机同步', exact: true }).click();
  await expect(region).toContainText('同步失败');
  const pending = (await syncConfig(a.page)).outbox;
  expect(pending?.requestId).toBeTruthy();
  expect((await remoteSnapshot(a.page, service.url)).snapshot.visits).toHaveLength(1);
  await a.page.reload();
  expect((await syncConfig(a.page)).outbox.requestId).toBe(pending.requestId);
  loseResponses = false;
  await syncNow(a.page);
  expect(sentIds.length).toBeGreaterThan(1);
  expect(new Set(sentIds).size).toBe(1);
  expect(replies.some(reply => reply.replayed)).toBe(true);
  expect((await remoteSnapshot(a.page, service.url)).snapshot.visits).toHaveLength(1);
  await assertPhotos(a.page, 1);
});

test('a-local-checkin-during-sync-survives-an-older-response', async ({ devices, service }) => {
  const { a } = devices;
  await saveDemoVisit(a.page, { note: '先到访' });
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false;
  let first = true;
  await a.page.route('**/api/sync', async route => {
    if (route.request().method() !== 'POST' || !first) { await route.continue(); return; }
    first = false;
    const response = await route.fetch();
    held = true;
    await gate;
    await route.fulfill({ response });
  });
  const region = await openSync(a.page);
  await region.getByRole('button', { name: '开启本机同步', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await saveDemoVisit(a.page, { note: '请求期间新增的本地到访' });
  expect((await saved(a.page)).visits).toHaveLength(2);
  release!();
  await waitSynced(a.page);
  await expect.poll(async () => (await remoteSnapshot(a.page, service.url)).snapshot.visits.length, { timeout: 25_000 }).toBe(2);
  await assertPhotos(a.page, 2);
});

test('sqlite-restart-preserves-progress-and-retries-an-offline-outbox', async ({ devices, service }) => {
  const { a } = devices;
  await saveDemoVisit(a.page, { note: '重启前已同步' });
  await enableSync(a.page);
  const clientId = (await syncConfig(a.page)).clientId;
  await service.stop();
  await saveDemoVisit(a.page, { note: '服务离线时保存' });
  const region = await openSync(a.page);
  await region.getByRole('button', { name: '立即同步', exact: true }).click();
  await expect(region).toContainText('同步失败');
  expect((await syncConfig(a.page)).outbox).toBeTruthy();
  await service.restart();
  expect((await remoteSnapshot(a.page, service.url)).snapshot.visits).toHaveLength(1);
  await syncNow(a.page);
  expect((await syncConfig(a.page)).clientId).toBe(clientId);
  expect((await remoteSnapshot(a.page, service.url)).snapshot.visits).toHaveLength(2);
  const fresh = await devices.newDevice();
  await enableSync(fresh.page);
  await assertPhotos(fresh.page, 2);
});

test('failed-photo-download-remains-retryable-without-false-success', async ({ devices }) => {
  const { a, b } = devices;
  await saveDemoVisit(a.page);
  await enableSync(a.page);
  let fail = true;
  await b.page.route('**/api/photos/**', route => route.request().method() === 'GET' && fail ? route.abort('connectionfailed') : route.continue());
  const region = await openSync(b.page);
  await region.getByRole('button', { name: '开启本机同步', exact: true }).click();
  await expect(region).toContainText('同步失败');
  expect((await syncConfig(b.page)).outbox).toBeTruthy();
  fail = false;
  await syncNow(b.page);
  await assertPhotos(b.page, 1);
  await b.page.reload();
  await waitSynced(b.page);
  await assertPhotos(b.page, 1);
});

test('local-a-and-local-b-remain-isolated-and-binding-is-fixed', async ({ devices, service }) => {
  const { a, b } = devices;
  await a.page.setViewportSize({ width: 320, height: 568 });
  const first = await saveDemoVisit(a.page, { note: '空间 A 的记录' });
  await enableSync(a.page, 'local-a');
  await enableSync(b.page, 'local-b');
  expect((await saved(b.page)).visits).toHaveLength(0);
  const second = await saveDemoVisit(b.page, { note: '空间 B 的记录' });
  await syncNow(b.page);
  const remoteA = await remoteSnapshot(a.page, service.url, 'local-a');
  const remoteB = await remoteSnapshot(b.page, service.url, 'local-b');
  expect(remoteA.snapshot.visits.map((visit: any) => visit.id)).toEqual([first.id]);
  expect(remoteB.snapshot.visits.map((visit: any) => visit.id)).toEqual([second.id]);
  const privatePhoto = remoteA.snapshot.visits[0].photoId;
  const denied = await b.page.request.get(`${service.url}/api/photos/${encodeURIComponent(privatePhoto)}`, { headers: spaceHeaders(service.url, 'local-b') });
  expect(denied.status()).toBe(404);
  const region = await openSync(a.page);
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(region.getByRole('combobox', { name: '本机资料空间' })).toHaveCount(0);
  await region.getByRole('button', { name: '暂停同步', exact: true }).click();
  await expect(region).toContainText('已暂停');
  expect((await syncConfig(a.page)).space).toBe('local-a');
  expect((await saved(a.page)).visits).toHaveLength(1);
  expect((await remoteSnapshot(a.page, service.url, 'local-a')).snapshot.visits).toHaveLength(1);
  await region.getByRole('button', { name: '恢复本机同步', exact: true }).click();
  await waitSynced(a.page);
  const fresh = await devices.newDevice();
  await enableSync(fresh.page, 'local-a');
  expect((await saved(fresh.page)).visits.map((visit: any) => visit.id)).toEqual([first.id]);
  expect(await fresh.page.evaluate(key => localStorage.getItem(key), configKey)).not.toContain(second.id);
});
