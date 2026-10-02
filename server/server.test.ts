import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test, type TestContext } from 'node:test'
import { cities } from '../src/data/cities'
import { createInitialState, reducer } from '../src/lib/model'
import { emptySyncSnapshot, projectSyncState, syncPhotoId, type SyncSnapshot } from '../src/lib/syncProtocol'
import { LocalDatabase } from './database'
import { createLocalServer, MAX_JSON_BYTES, MAX_PHOTO_BYTES } from './http'

const headers = { 'X-Vesluma-Space': 'local-a', 'X-Vesluma-Local': '1' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

function snapshot(id = 'first', at = 1_000_000, photo = false): SyncSnapshot {
  const city = cities[0]
  const landmark = city.landmarks.find(item => item.tier === 1)!
  let state = reducer(createInitialState(at), { type: 'set-city', cityId: city.id })
  state = reducer(state, { type: 'start-trip', id: `trip-${id}`, at })
  state = reducer(state, { type: 'set-position', position: { lat: landmark.lat, lng: landmark.lng, at, accuracy: 5, source: 'demo' } })
  state = reducer(state, {
    type: 'check-in', id, landmarkId: landmark.id, at, photoId: `original-${id}`,
    ...(photo ? {} : { photoUrl: `/images/${city.id}.png` }),
  })
  assert.equal(state.visits.length, 1)
  return projectSyncState(state)
}

function payload(data = snapshot(), requestId = 'request-1', sequence = 1, clientId = 'client-1') {
  return { requestId, clientId, sequence, snapshot: data }
}

function sixCitySnapshot(): SyncSnapshot {
  assert.deepEqual(cities.map(city => city.id).sort(), ['beijing', 'chengdu', 'hangzhou', 'nanjing', 'shanghai', 'xian'])
  let state = createInitialState(1_000_000)
  for (const [index, city] of cities.entries()) {
    const at = 1_000_000 + index * 10_000
    state = reducer(state, { type: 'set-city', cityId: city.id })
    state = reducer(state, { type: 'start-trip', id: `six-trip-${city.id}`, at })
    const secondary = city.landmarks.find(landmark => landmark.tier === 2)!
    const anchorId = city.regions.find(region => region.id === secondary.regionId)!.anchorLandmarkId
    const primary = city.landmarks.find(landmark => landmark.id === anchorId)!
    for (const [offset, landmark] of [secondary, primary].entries()) {
      const time = at + offset * 1000
      const id = `six-visit-${landmark.id}`
      state = reducer(state, { type: 'set-position', position: { lat: landmark.lat, lng: landmark.lng, at: time, accuracy: 5, source: 'demo' } })
      // Real BLOB references exercise the same path for every newly added city.
      state = reducer(state, { type: 'check-in', id, landmarkId: landmark.id, at: time, photoId: `original-${id}` })
    }
    state = reducer(state, { type: 'end-trip', at: at + 2000 })
  }
  assert.equal(state.visits.length, 12)
  assert.equal(state.unlocks.length, 6)
  return projectSyncState(state)
}

async function fixture(t: TestContext, staticFiles = false) {
  const dir = await mkdtemp(join(tmpdir(), 'vesluma-db-test-'))
  const dbPath = join(dir, 'database', 'test.sqlite')
  const distDir = staticFiles ? join(dir, 'dist') : undefined
  if (distDir) {
    await mkdir(join(distDir, 'assets'), { recursive: true })
    await mkdir(join(distDir, '.vite'), { recursive: true })
    await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Local fixture</title>')
    await writeFile(join(distDir, 'assets', 'app-abcd1234.js'), 'console.log("fixture")')
    await writeFile(join(distDir, 'sw.js'), '/* local worker */')
    await writeFile(join(distDir, '.vite', 'manifest.json'), '{}')
    await writeFile(join(dir, 'private.txt'), 'not public')
    await writeFile(join(distDir, '.env'), 'not public either')
  }
  let local = createLocalServer({ dbPath, distDir })
  const started = await local.start()
  t.after(async () => { await local.close(); await rm(dir, { recursive: true, force: true }) })
  const get = (space = 'local-a') => fetch(`${started.url}/api/sync`, { headers: { ...headers, 'X-Vesluma-Space': space } })
  const post = (value: unknown, extra: Record<string, string> = {}) => fetch(`${started.url}/api/sync`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value),
  })
  const put = (id: string, bytes = png, extra: Record<string, string> = {}) => fetch(`${started.url}/api/photos/${id}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'image/png', ...extra }, body: bytes,
  })
  return {
    ...started, dir, dbPath, get, post, put,
    get local() { return local },
    async restart() { await local.close(); local = createLocalServer({ dbPath, distDir, port: started.port }); await local.start() },
  }
}

async function raw(port: number, path: string, method = 'GET', extraHeaders: Record<string, string> = {}, data?: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((accept, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers: extraHeaders }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => accept({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks).toString() }))
    })
    request.on('error', reject)
    request.end(data)
  })
}

test('initializes SQLite schema version 1 and reopens it without losing data', async t => {
  const f = await fixture(t)
  const response = await f.post(payload())
  assert.equal(response.status, 200)
  const before = await response.json()
  await f.restart()
  assert.deepEqual(await (await f.get()).json(), { revision: before.revision, snapshot: before.snapshot })
  const file = await readFile(f.dbPath)
  assert.equal(file.subarray(0, 16).toString(), 'SQLite format 3\u0000')
  const connection = new DatabaseSync(f.dbPath, { readOnly: true })
  assert.equal(connection.prepare('PRAGMA user_version').get()?.user_version, 1)
  assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM receipts').get()?.count, 1)
  connection.close()
})

test('extends an existing two-city database to all six cities and preserves photos and authority after restart', async t => {
  const f = await fixture(t)
  // A restarted listener must receive fresh TCP connections. The process-wide
  // Node fetch pool may still hold an idle socket from the closed listener.
  const fresh = { Connection: 'close' }
  const read = (space = 'local-a') => fetch(`${f.url}/api/sync`, { headers: { ...headers, ...fresh, 'X-Vesluma-Space': space } })
  const complete = sixCitySnapshot()
  const original: SyncSnapshot = {
    ...complete,
    trips: complete.trips.filter(trip => trip.cityId === 'nanjing' || trip.cityId === 'xian'),
    visits: complete.visits.filter(visit => visit.cityId === 'nanjing' || visit.cityId === 'xian'),
    unlocks: complete.unlocks.filter(unlock => unlock.cityId === 'nanjing' || unlock.cityId === 'xian'),
  }
  assert.ok(original.visits.every(visit => visit.contentVersion === 'citywide-2026-10-02'))
  for (const visit of original.visits) {
    const upload = await f.put(visit.photoId, png, fresh)
    assert.equal(upload.status, 200)
    await upload.arrayBuffer()
  }
  const seed = await f.post(payload(original, 'old-two-cities'), fresh)
  assert.equal(seed.status, 200)
  const seeded = await seed.json()
  await f.restart()
  assert.deepEqual((await (await read()).json()).snapshot, seeded.snapshot)

  for (const visit of complete.visits) {
    const upload = await f.put(visit.photoId, png, fresh)
    assert.equal(upload.status, 200)
    await upload.arrayBuffer()
  }
  const request = payload(complete, 'six-cities', 2)
  const response = await f.post(request, fresh)
  assert.equal(response.status, 200)
  const committed = await response.json()
  assert.equal(committed.snapshot.trips.length, 6)
  assert.equal(committed.snapshot.visits.length, 12)
  assert.equal(committed.snapshot.unlocks.length, 6)
  for (const city of cities) {
    const records = committed.snapshot.visits.filter((visit: { cityId: string }) => visit.cityId === city.id)
    assert.equal(records.length, 2)
    const secondaryId = city.landmarks.find(landmark => landmark.tier === 2)!.id
    assert.deepEqual(records.find((visit: { landmarkId: string }) => visit.landmarkId === secondaryId).unlockedRegionIds, [])
    assert.equal(committed.snapshot.unlocks.filter((unlock: { cityId: string }) => unlock.cityId === city.id).length, 1)
  }
  await f.restart()
  assert.deepEqual(await (await read()).json(), { revision: committed.revision, snapshot: committed.snapshot })
  const replay = await (await f.post(request, fresh)).json()
  assert.equal(replay.replayed, true)
  assert.equal(replay.revision, committed.revision)
  const stale = await (await f.post(payload(original, 'old-device-reconnect', 0), fresh)).json()
  assert.deepEqual(stale.snapshot, committed.snapshot)
  assert.equal(stale.revision, committed.revision)
  for (const visit of complete.visits) {
    const photo = await fetch(`${f.url}/api/photos/${visit.photoId}`, { headers: { ...headers, ...fresh } })
    assert.equal(photo.status, 200)
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png)
  }
  assert.deepEqual((await (await read('local-b')).json()).snapshot, emptySyncSnapshot())
})

test('rejects cross-city landmark and region authority in each of the six cities without partial writes', async t => {
  const f = await fixture(t)
  const complete = sixCitySnapshot()
  for (const [index, city] of cities.entries()) {
    const foreign = cities[(index + 1) % cities.length]
    const foreignPrimary = foreign.landmarks.find(landmark => landmark.tier === 1)!
    for (const kind of ['landmark', 'region'] as const) {
      const invalid = structuredClone(complete)
      const visit = invalid.visits.find(item => item.cityId === city.id)!
      if (kind === 'landmark') visit.landmarkId = foreignPrimary.id
      else visit.unlockedRegionIds = [foreignPrimary.regionId]
      const response = await f.post(payload(invalid, `invalid-${city.id}-${kind}`))
      assert.equal(response.status, 422, `${city.id} rejects foreign ${kind}`)
      assert.equal((await response.json()).code, 'INVALID_SNAPSHOT')
    }
  }
  assert.deepEqual(await (await f.get()).json(), { revision: 0, snapshot: emptySyncSnapshot() })
})

test('refuses a future database schema without overwriting it', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'vesluma-future-db-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'future.sqlite')
  const connection = new DatabaseSync(path)
  connection.exec('CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES (\'keep\'); PRAGMA user_version = 2;')
  connection.close()
  assert.throws(() => new LocalDatabase(path), /newer/)
  const reopened = new DatabaseSync(path)
  assert.equal(reopened.prepare('SELECT value FROM marker').get()?.value, 'keep')
  reopened.close()
})

test('health declares local-only and the server binds exclusively to IPv4 loopback', async t => {
  const f = await fixture(t)
  assert.equal((f.local.server.address() as { address: string }).address, '127.0.0.1')
  const response = await fetch(`${f.url}/api/health`)
  assert.deepEqual(await response.json(), { ok: true, mode: 'local-only', schemaVersion: 1 })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('rejects spoofed Host, cross-origin, cross-site and preflight requests', async t => {
  const f = await fixture(t)
  for (const host of [`127.0.0.1:${f.port}.evil.test`, '127.0.0.1', `evil.test:${f.port}`, `[::1]:${f.port}`]) {
    const response = await raw(f.port, '/api/health', 'GET', { Host: host })
    assert.equal(response.status, 403)
    assert.equal(JSON.parse(response.body).code, 'INVALID_HOST')
  }
  for (const origin of ['https://evil.test', 'null', `http://localhost:${f.port}`, `${f.url}/`, 'http://127.0.0.1:1']) {
    const response = await raw(f.port, '/api/sync', 'GET', { ...headers, Origin: origin })
    assert.equal(response.status, 403)
  }
  assert.equal((await raw(f.port, '/api/sync', 'GET', { ...headers, 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await raw(f.port, '/api/sync', 'OPTIONS', { ...headers, Origin: 'https://evil.test' })).status, 403)
  assert.equal((await raw(f.port, '/api/sync', 'GET', { ...headers, Origin: f.url })).status, 200)
})

test('requires explicit local context for both progress and photo reads and writes', async t => {
  const f = await fixture(t)
  const contexts: Array<Record<string, string>> = [{}, { 'X-Vesluma-Local': '1' }, { 'X-Vesluma-Space': 'local-a' }, { ...headers, 'X-Vesluma-Space': 'local-c' }]
  for (const extra of contexts) {
    assert.equal((await raw(f.port, '/api/sync', 'GET', extra)).status, 400)
    assert.equal((await raw(f.port, '/api/photos/sync-first', 'GET', extra)).status, 400)
    assert.equal((await raw(f.port, '/api/photos/sync-first', 'PUT', extra)).status, 400)
  }
})

test('isolates progress, receipts and photos between validation spaces', async t => {
  const f = await fixture(t)
  assert.equal((await f.put('sync-first')).status, 200)
  assert.equal((await f.post(payload(snapshot('first', 1_000_000, true)))).status, 200)
  assert.deepEqual((await (await f.get('local-b')).json()).snapshot, emptySyncSnapshot())
  const privatePhoto = await fetch(`${f.url}/api/photos/sync-first`, { headers: { ...headers, 'X-Vesluma-Space': 'local-b' } })
  assert.equal(privatePhoto.status, 404)
  const other = await f.post(payload(snapshot('other')), { 'X-Vesluma-Space': 'local-b' })
  assert.equal(other.status, 200)
  assert.equal((await other.json()).replayed, false)
  assert.equal((await (await f.get()).json()).snapshot.visits[0].id, 'first')
  assert.equal((await f.put('sync-first', Buffer.from('different'), { 'X-Vesluma-Space': 'local-b' })).status, 200)
  const original = await fetch(`${f.url}/api/photos/sync-first`, { headers })
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png)
})

test('persists private photo BLOBs through restart and marks all photo responses no-store', async t => {
  const f = await fixture(t)
  assert.equal((await f.put('sync-first')).status, 200)
  await f.restart()
  const photo = await fetch(`${f.url}/api/photos/sync-first`, { headers })
  assert.equal(photo.status, 200)
  assert.equal(photo.headers.get('content-type'), 'image/png')
  assert.equal(photo.headers.get('cache-control'), 'no-store')
  assert.equal(photo.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png)
  const missing = await fetch(`${f.url}/api/photos/sync-missing`, { headers })
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
})

test('photo PUT is idempotent for equal bytes and rejects overwriting an existing key', async t => {
  const f = await fixture(t)
  assert.equal((await f.put('sync-first')).status, 200)
  assert.equal((await f.put('sync-first')).status, 200)
  const conflict = await f.put('sync-first', Buffer.concat([png, Buffer.from('changed')]))
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).code, 'PHOTO_CONFLICT')
  assert.equal((await f.put('sync-first', png, { 'Content-Type': 'image/jpeg' })).status, 409)
  assert.deepEqual(Buffer.from(await (await fetch(`${f.url}/api/photos/sync-first`, { headers })).arrayBuffer()), png)
})

test('rejects empty photos, executable image types, malformed IDs and oversized declared bodies', async t => {
  const f = await fixture(t)
  assert.equal((await f.put('sync-first', Buffer.alloc(0))).status, 422)
  assert.equal((await f.put('sync-first', png, { 'Content-Type': 'image/svg+xml' })).status, 415)
  assert.equal((await f.put('sync-first', png, { 'Content-Type': 'text/html' })).status, 415)
  assert.equal((await f.put('not-a-wire-id')).status, 422)
  assert.equal((await raw(f.port, '/api/photos/sync-a%2Fb', 'PUT', headers)).status, 422)
  const photo = await raw(f.port, '/api/photos/sync-big', 'PUT', { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(MAX_PHOTO_BYTES + 1) })
  assert.equal(photo.status, 413)
  const metadata = await raw(f.port, '/api/sync', 'POST', { ...headers, 'Content-Type': 'application/json', 'Content-Length': String(MAX_JSON_BYTES + 1) })
  assert.equal(metadata.status, 413)
})

test('missing photos reject the complete metadata transaction, then the same request succeeds after upload', async t => {
  const f = await fixture(t)
  const request = payload(snapshot('first', 1_000_000, true))
  const failed = await f.post(request)
  assert.equal(failed.status, 422)
  assert.equal((await failed.json()).code, 'PHOTO_MISSING')
  assert.deepEqual(await (await f.get()).json(), { revision: 0, snapshot: emptySyncSnapshot() })
  assert.equal((await f.put(syncPhotoId('first'))).status, 200)
  const retry = await f.post(request)
  assert.equal(retry.status, 200)
  const result = await retry.json()
  assert.equal(result.replayed, false)
  assert.equal(result.revision, 1)
  assert.equal(result.snapshot.visits.length, 1)
})

test('a lost response and repeated request merge once, including after server restart', async t => {
  const f = await fixture(t)
  const request = payload()
  await (await f.post(request)).arrayBuffer() // Simulate discarding a committed response.
  await f.restart()
  const result = await (await f.post(request)).json()
  assert.equal(result.replayed, true)
  assert.equal(result.revision, 1)
  assert.equal(result.snapshot.visits.length, 1)
  assert.equal(result.snapshot.unlocks.length, 1)
})

test('a repeated request returns current merged state, not the earlier response snapshot', async t => {
  const f = await fixture(t)
  const first = payload()
  await f.post(first)
  await f.post(payload(snapshot('second', 1_001_000), 'request-2', 2))
  const replay = await (await f.post(first)).json()
  assert.equal(replay.replayed, true)
  assert.equal(replay.revision, 2)
  assert.equal(replay.snapshot.visits.length, 2)
  assert.equal(replay.snapshot.unlocks.length, 1)
})

test('rejects reused request IDs with a different payload, client or sequence', async t => {
  const f = await fixture(t)
  const original = payload()
  await f.post(original)
  for (const changed of [payload(snapshot('different')), { ...original, clientId: 'other' }, { ...original, sequence: 2 }]) {
    const result = await f.post(changed)
    assert.equal(result.status, 409)
    assert.equal((await result.json()).code, 'REQUEST_CONFLICT')
  }
  const state = await (await f.get()).json()
  assert.equal(state.revision, 1)
  assert.equal(state.snapshot.visits[0].id, 'first')
})

test('accepts out-of-order and concurrent offline additions without duplicate unlocks', async t => {
  const f = await fixture(t)
  const responses = await Promise.all([
    f.post(payload(snapshot('later', 1_003_000), 'request-later', 50, 'client-a')),
    f.post(payload(snapshot('earlier', 1_000_000), 'request-earlier', 1, 'client-a')),
    f.post(payload(snapshot('other', 1_002_000), 'request-other', 1, 'client-b')),
  ])
  for (const response of responses) assert.equal(response.status, 200)
  const state = await (await f.get()).json()
  assert.equal(state.snapshot.visits.length, 3)
  assert.equal(state.snapshot.unlocks.length, 1)
  assert.equal(state.snapshot.unlocks[0].visitId, 'earlier')
  const stale = await (await f.post(payload(snapshot('later', 1_003_000), 'stale-copy', 0))).json()
  assert.equal(stale.snapshot.visits.length, 3)
  assert.equal(stale.revision, state.revision)
})

test('empty and stale snapshots never delete durable progress or roll back an ended trip', async t => {
  const f = await fixture(t)
  const active = snapshot()
  const ended = structuredClone(active)
  ended.trips[0].status = 'ended'
  ended.trips[0].endedAt = 1_005_000
  await f.post(payload(ended))
  await f.post(payload(active, 'older-active', 0))
  await f.post(payload(emptySyncSnapshot(), 'empty', 0))
  const state = await (await f.get()).json()
  assert.equal(state.snapshot.visits.length, 1)
  assert.equal(state.snapshot.trips[0].status, 'ended')
  assert.equal(state.snapshot.trips[0].endedAt, 1_005_000)
})

test('immutable visit conflicts roll back the whole merge and do not consume the request ID', async t => {
  const f = await fixture(t)
  const original = snapshot()
  await f.post(payload(original))
  const changed = structuredClone(original)
  changed.visits[0].note = 'conflicting evidence'
  changed.profiles.push({ id: 'new-profile', name: 'No partial writes' })
  const failure = await f.post(payload(changed, 'conflict'))
  assert.equal(failure.status, 409)
  assert.equal((await failure.json()).code, 'SYNC_CONFLICT')
  const after = await (await f.get()).json()
  assert.equal(after.revision, 1)
  assert.equal(after.snapshot.profiles.some((item: { id: string }) => item.id === 'new-profile'), false)
  const retry = await f.post(payload(original, 'conflict'))
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).replayed, false)
})

test('a SQLite failure during receipt insertion rolls back the already-updated progress and revision', async t => {
  const f = await fixture(t)
  const connection = new DatabaseSync(f.dbPath)
  try {
    connection.exec("CREATE TRIGGER simulate_write_failure BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END")
    const failed = await f.post(payload())
    assert.equal(failed.status, 500)
    assert.equal((await failed.json()).code, 'LOCAL_STORAGE_ERROR')
    assert.deepEqual(await (await f.get()).json(), { revision: 0, snapshot: emptySyncSnapshot() })
    assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM receipts').get()?.count, 0)
    connection.exec('DROP TRIGGER simulate_write_failure')
    const retry = await f.post(payload())
    assert.equal(retry.status, 200)
    const result = await retry.json()
    assert.equal(result.replayed, false)
    assert.equal(result.revision, 1)
    assert.equal(result.snapshot.visits.length, 1)
  } finally { connection.close() }
})

test('rejects malformed envelopes, unsupported fields and invalid location evidence', async t => {
  const f = await fixture(t)
  const invalidSnapshots = [
    { ...snapshot(), position: { lat: 0, lng: 0 } },
    { ...snapshot(), profiles: [{ id: 'bad\' OR 1=1; --', name: 'Bad ID' }] },
    (() => { const s = snapshot(); s.visits[0].position.accuracy = 101; return s })(),
    (() => { const s = snapshot(); s.visits[0].position.lat = 0; return s })(),
    (() => { const s = snapshot(); s.visits[0].photoUrl = 'https://external.test/image.png'; return s })(),
  ]
  for (const data of invalidSnapshots) {
    const response = await f.post(payload(data as SyncSnapshot))
    assert.equal(response.status, 422)
    assert.equal((await response.json()).code, 'INVALID_SNAPSHOT')
  }
  for (const data of [null, [], { ...payload(), sequence: -1 }, { ...payload(), sequence: 0.5 }, { ...payload(), sequence: Number.MAX_SAFE_INTEGER + 1 }, { ...payload(), requestId: '../x' }, { ...payload(), extra: 'no' }]) {
    assert.equal((await f.post(data)).status, 422)
  }
  const malformed = await raw(f.port, '/api/sync', 'POST', { ...headers, 'Content-Type': 'application/json' }, '{broken')
  assert.equal(malformed.status, 400)
  assert.equal((await raw(f.port, '/api/sync', 'POST', { ...headers, 'Content-Type': 'text/plain' }, '{}')).status, 415)
  assert.deepEqual(await (await f.get()).json(), { revision: 0, snapshot: emptySyncSnapshot() })
})

test('an interrupted request cannot partially save metadata or reserve its request ID', async t => {
  const f = await fixture(t)
  const serialized = JSON.stringify(payload())
  await new Promise<void>((accept, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port: f.port, path: '/api/sync', method: 'POST', headers: {
      ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized),
    } })
    request.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') accept(); else reject(error) })
    request.write(serialized.slice(0, Math.floor(serialized.length / 2)), () => request.destroy())
  })
  assert.equal((await (await f.get()).json()).revision, 0)
  const retry = await (await f.post(payload())).json()
  assert.equal(retry.replayed, false)
  assert.equal(retry.snapshot.visits.length, 1)
})

test('an interrupted photo upload stores no partial BLOB and can be retried with the same photo ID', async t => {
  const f = await fixture(t)
  await new Promise<void>((accept, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port: f.port, path: '/api/photos/sync-first', method: 'PUT', headers: {
      ...headers, 'Content-Type': 'image/png', 'Content-Length': png.length,
    } })
    request.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') accept(); else reject(error) })
    request.write(png.subarray(0, Math.floor(png.length / 2)), () => request.destroy())
  })
  assert.equal((await fetch(`${f.url}/api/photos/sync-first`, { headers })).status, 404)
  assert.equal((await f.put('sync-first')).status, 200)
  assert.deepEqual(Buffer.from(await (await fetch(`${f.url}/api/photos/sync-first`, { headers })).arrayBuffer()), png)
})

test('serves built files and client routes while missing assets stay errors and private paths stay hidden', async t => {
  const f = await fixture(t, true)
  const index = await fetch(f.url)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /Local fixture/)
  assert.equal((await fetch(`${f.url}/journey/one`)).status, 200)
  assert.equal((await fetch(`${f.url}/assets/app-abcd1234.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal((await fetch(`${f.url}/sw.js`)).headers.get('cache-control'), 'no-cache')
  assert.equal((await fetch(`${f.url}/.vite/manifest.json`)).status, 200)
  assert.equal((await fetch(`${f.url}/assets/missing.js`)).status, 404)
  const head = await fetch(f.url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/..%5cprivate.txt', '/.env', '/%2eenv', '/C:/Windows/win.ini', '/%00']) {
    const response = await raw(f.port, path)
    assert.equal(response.status, 404, path)
    assert.doesNotMatch(response.body, /not public|test\.sqlite|vesluma-db-test-/)
  }
  assert.equal((await raw(f.port, '/api/does-not-exist')).status, 404)
  assert.equal((await raw(f.port, '/api/sync', 'DELETE', headers)).status, 405)
  assert.equal((await raw(f.port, '/api/%')).status, 400)
})

test('server-side failures expose a retryable generic error without disk paths or stack traces', async t => {
  const f = await fixture(t)
  f.local.db.getSnapshot = () => { throw new Error(`SQL failed at ${f.dbPath}`) }
  const response = await f.get()
  assert.equal(response.status, 500)
  const value = await response.json()
  assert.equal(value.code, 'LOCAL_STORAGE_ERROR')
  assert.doesNotMatch(JSON.stringify(value), /SQL failed|test\.sqlite|vesluma-db-test-|stack/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
