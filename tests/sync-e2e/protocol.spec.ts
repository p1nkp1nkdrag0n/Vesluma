import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { test, expect, png, enableSync, saveDemoVisit, remoteSnapshot, spaceHeaders } from './fixtures';

// All records originate from the browser's demo check-in flow. Every service and
// database belongs to the isolated fixtures; never use the user's .local-data.
type WireVisit = Record<string, unknown> & {
  id: string;
  photoId: string;
  photoUrl?: string;
  at: number;
  position: Record<string, unknown> & { at: number; lat: number; lng: number };
};
type WireSnapshot = {
  version: number;
  profiles: unknown[];
  trips: unknown[];
  visits: WireVisit[];
  unlocks: unknown[];
};
type SnapshotResponse = { revision: number; snapshot: WireSnapshot; replayed?: boolean };
type Envelope = { requestId: string; clientId: string; sequence: number; snapshot: WireSnapshot };
type Space = 'local-a' | 'local-b';

async function seed(page: Page, origin: string): Promise<SnapshotResponse> {
  await page.goto(origin);
  await saveDemoVisit(page, { note: 'Protocol QA browser simulation' });
  await enableSync(page, 'local-a');
  const state = await remoteSnapshot(page, origin, 'local-a') as SnapshotResponse;
  expect(state.snapshot.visits).toHaveLength(1);
  expect(state.snapshot.visits[0].photoId).toBe(`sync-${state.snapshot.visits[0].id}`);
  // Stop the app's automatic sync so protocol assertions have no UI timer races.
  // The context's request client remains available with explicit same-origin headers.
  await page.goto('about:blank');
  return state;
}

async function post(api: APIRequestContext, origin: string, body: Envelope, space: Space = 'local-a') {
  const response = await api.post(`${origin}/api/sync`, { headers: spaceHeaders(origin, space), data: body });
  expect(response.headers()['cache-control']).toContain('no-store');
  return response;
}

async function read(api: APIRequestContext, origin: string, space: Space = 'local-a'): Promise<SnapshotResponse> {
  const response = await api.get(`${origin}/api/sync`, { headers: spaceHeaders(origin, space) });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  return response.json();
}

async function upload(api: APIRequestContext, origin: string, photoId: string, space: Space = 'local-a') {
  const response = await api.put(`${origin}/api/photos/${encodeURIComponent(photoId)}`, {
    headers: { ...spaceHeaders(origin, space), 'Content-Type': 'image/png' }, data: png,
  });
  expect(response.status()).toBe(200);
  return response;
}

async function expectError(response: APIResponse, status: number) {
  expect(response.status()).toBe(status);
  const error = await response.json();
  expect(Object.keys(error).sort()).toEqual(['code', 'error']);
  expect(typeof error.code).toBe('string');
  expect(typeof error.error).toBe('string');
  return error;
}

function withRevisit(base: WireSnapshot, label: string, milliseconds: number): WireSnapshot {
  const next = structuredClone(base);
  const original = next.visits[0];
  const id = `${label}-${randomUUID()}`;
  const visit: WireVisit = {
    ...structuredClone(original), id, photoId: `sync-${id}`, at: original.at + milliseconds,
    position: { ...original.position, at: original.at + milliseconds },
    firstActivation: false, firstPersonalVisit: false, unlockedRegionIds: [], public: false,
    note: `Protocol QA ${label}`,
  };
  delete visit.photoUrl; // Require an actual uploaded image, not a demo URL exemption.
  next.visits.push(visit);
  return next;
}

function visitIds(snapshot: WireSnapshot) { return snapshot.visits.map(visit => visit.id).sort(); }

test('protocol-request-id-is-idempotent-and-rejects-a-different-payload', async ({ devices, service }, testInfo) => {
  const { page, context } = devices.a;
  const initial = await seed(page, service.url);
  const envelope: Envelope = { requestId: randomUUID(), clientId: randomUUID(), sequence: 1, snapshot: initial.snapshot };
  const firstResponse = await post(context.request, service.url, envelope);
  expect(firstResponse.status()).toBe(200);
  const first = await firstResponse.json() as SnapshotResponse;
  expect(first.replayed).toBe(false);
  const repeatedResponse = await post(context.request, service.url, envelope);
  expect(repeatedResponse.status()).toBe(200);
  const repeated = await repeatedResponse.json() as SnapshotResponse;
  expect(repeated.replayed).toBe(true);
  expect(repeated.revision).toBe(first.revision);
  expect(repeated.snapshot).toEqual(first.snapshot);

  const conflicting = structuredClone(envelope);
  conflicting.snapshot.visits[0].note = 'A different payload reused the same request ID';
  const error = await expectError(await post(context.request, service.url, conflicting), 409);
  const after = await read(context.request, service.url);
  expect(after.revision).toBe(first.revision);
  expect(after.snapshot).toEqual(first.snapshot);
  await testInfo.attach('request-id-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ firstStatus: 200, replayed: repeated.replayed, unchangedRevision: after.revision, conflictStatus: 409, error })) });
});

test('protocol-new-request-cannot-overwrite-existing-visit-evidence', async ({ devices, service }, testInfo) => {
  const { page, context } = devices.a;
  const initial = await seed(page, service.url);
  const conflicting = structuredClone(initial.snapshot);
  // This is still within the accepted arrival radius. A 409 must come from the
  // immutable evidence collision, rather than invalid coordinates or missing photos.
  conflicting.visits[0].position.lat += 0.00001;
  const error = await expectError(await post(context.request, service.url, {
    requestId: randomUUID(), clientId: randomUUID(), sequence: 1, snapshot: conflicting,
  }), 409);
  const after = await read(context.request, service.url);
  expect(after.revision).toBe(initial.revision);
  expect(after.snapshot).toEqual(initial.snapshot);
  await testInfo.attach('immutable-visit-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ visitId: initial.snapshot.visits[0].id, conflictStatus: 409, error, unchangedRevision: after.revision })) });
});

test('protocol-out-of-order-union-missing-photo-retry-and-space-isolation', async ({ devices, service }, testInfo) => {
  const { page, context } = devices.a;
  const initial = await seed(page, service.url);
  const early = withRevisit(initial.snapshot, 'early', 1);
  const late = withRevisit(initial.snapshot, 'late', 2);
  const earlyVisit = early.visits.at(-1)!;
  const lateVisit = late.visits.at(-1)!;
  const clientId = randomUUID();
  const lateRequest: Envelope = { requestId: randomUUID(), clientId, sequence: 3, snapshot: late };

  const missing = await expectError(await post(context.request, service.url, lateRequest), 422);
  const unchanged = await read(context.request, service.url);
  expect(unchanged).toEqual(initial);
  await upload(context.request, service.url, lateVisit.photoId);
  await upload(context.request, service.url, lateVisit.photoId); // Same key/bytes retry.
  // A failed missing-photo POST must remain retryable with its original request ID.
  const lateResponse = await post(context.request, service.url, lateRequest);
  expect(lateResponse.status()).toBe(200);
  const lateResult = await lateResponse.json() as SnapshotResponse;
  expect(lateResult.replayed).toBe(false);
  expect(visitIds(lateResult.snapshot)).toEqual(visitIds(late));

  await upload(context.request, service.url, earlyVisit.photoId);
  const earlyResponse = await post(context.request, service.url, { requestId: randomUUID(), clientId, sequence: 2, snapshot: early });
  expect(earlyResponse.status()).toBe(200);
  const merged = await earlyResponse.json() as SnapshotResponse;
  const expectedIds = [...visitIds(initial.snapshot), earlyVisit.id, lateVisit.id].sort();
  expect(visitIds(merged.snapshot)).toEqual(expectedIds);
  expect(merged.snapshot.unlocks).toEqual(initial.snapshot.unlocks);
  const replayResponse = await post(context.request, service.url, lateRequest);
  expect(replayResponse.status()).toBe(200);
  const replay = await replayResponse.json() as SnapshotResponse;
  expect(replay.replayed).toBe(true);
  expect(replay.revision).toBe(merged.revision);
  expect(visitIds(replay.snapshot)).toEqual(expectedIds); // Replay returns current union.

  const emptySpace = await read(context.request, service.url, 'local-b');
  expect(emptySpace.snapshot.visits).toHaveLength(0);
  expect(emptySpace.snapshot.unlocks).toHaveLength(0);
  const privatePhoto = await context.request.get(`${service.url}/api/photos/${encodeURIComponent(lateVisit.photoId)}`, { headers: spaceHeaders(service.url, 'local-b') });
  await expectError(privatePhoto, 404);
  for (const visit of initial.snapshot.visits) await upload(context.request, service.url, visit.photoId, 'local-b');
  // Receipts are space-local too: this same request ID has a different payload in B.
  const otherSpaceResponse = await post(context.request, service.url, { ...lateRequest, snapshot: initial.snapshot }, 'local-b');
  expect(otherSpaceResponse.status()).toBe(200);
  const otherSpace = await otherSpaceResponse.json() as SnapshotResponse;
  expect(otherSpace.replayed).toBe(false);
  expect(visitIds(otherSpace.snapshot)).toEqual(visitIds(initial.snapshot));
  expect(visitIds((await read(context.request, service.url)).snapshot)).toEqual(expectedIds);
  await testInfo.attach('out-of-order-and-isolation-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ missingPhotoStatus: 422, missing, acceptedSequences: [3, 2], localAVisitCount: expectedIds.length, localBVisitCount: otherSpace.snapshot.visits.length, foreignPhotoStatus: 404, replayedCurrentUnion: true, independentSpaceReceipt: !otherSpace.replayed })) });
});
