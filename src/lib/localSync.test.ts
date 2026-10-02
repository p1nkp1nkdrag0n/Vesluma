import { describe, expect, it, vi } from 'vitest'
import { getLandmark } from '../data/cities'
import { createInitialState, reducer, type AppState } from './model'
import { emptySyncSnapshot, mergeSyncSnapshots, projectSyncState, syncPhotoId, type SyncSnapshot } from './syncProtocol'
import { LocalSyncEngine, LOCAL_SYNC_BACKUP_KEY, LOCAL_SYNC_STORAGE_KEY, type LocalSpace, type LocalSyncIO, type LocalSyncSettings, type SyncOutbox, type SyncReply } from './localSync'

const at = 1_000_000
const photo = new Blob(['test photo'], { type: 'image/png' })
const checkedIn = (state: AppState, id: string, landmarkId = 'nj-confucius'): AppState => {
  const landmark = getLandmark(landmarkId)!
  const positioned = reducer(state, { type: 'set-position', position: { lat: landmark.lat, lng: landmark.lng, at, accuracy: 5, source: 'demo' } })
  return reducer(positioned, { type: 'check-in', id, photoId: `local-photo-${id}`, landmarkId, at })
}
const traveling = (id = 'trip-a') => reducer(createInitialState(at), { type: 'start-trip', id, at })

class MemoryStorage {
  entries = new Map<string, string>()
  failKey: string | null = null
  getItem = (key: string): string | null => this.entries.get(key) ?? null
  setItem = (key: string, value: string): void => { if (key === this.failKey) throw new Error('Quota exceeded'); this.entries.set(key, value) }
}

function harness(initial = traveling()) {
  let state = initial
  let sequence = 0
  let revision = 0
  let server = emptySyncSnapshot()
  const storage = new MemoryStorage()
  const photos = new Map<string, Blob>()
  for (const visit of state.visits) photos.set(visit.photoId, photo)
  const remotePhotos = new Map<string, Blob>()
  const calls: Array<{ space: LocalSpace; request: Omit<SyncOutbox, 'photoMap'> }> = []
  const events: string[] = []
  const io: LocalSyncIO = {
    storage, available: true, getState: () => state, backup: () => JSON.stringify(state), now: () => at,
    id: () => `generated-${++sequence}`,
    commitState: next => { events.push('commit'); state = next },
    getPhoto: async id => photos.get(id),
    savePhoto: async (id, blob) => { events.push('save-photo'); photos.set(id, blob) },
    uploadPhoto: async (_space, id, blob) => { expect(settings().outbox).not.toBeNull(); events.push('upload'); remotePhotos.set(id, blob) },
    downloadPhoto: async (_space, id) => { const blob = remotePhotos.get(id); if (!blob) throw new Error('Missing remote photo'); events.push('download'); return blob },
    pull: async () => ({ revision, snapshot: server }),
    push: async (space, request) => { calls.push({ space, request: structuredClone(request) }); events.push('push'); server = mergeSyncSnapshots(server, request.snapshot); return { revision: ++revision, snapshot: server } },
  }
  const settings = () => JSON.parse(storage.getItem(LOCAL_SYNC_STORAGE_KEY)!) as LocalSyncSettings
  const create = () => new LocalSyncEngine(io)
  const engine = create()
  return { io, engine, create, settings, storage, photos, remotePhotos, calls, events,
    state: () => state, update: (next: AppState) => { state = next }, server: () => server,
    seedServer: (snapshot: SyncSnapshot, newRevision: number) => { server = snapshot; revision = newRevision } }
}

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

describe('durable local sync outbox', () => {
  it('defaults off, backs up exactly once, and binds the selected space permanently', async () => {
    const h = harness()
    await h.engine.sync()
    expect(h.calls).toHaveLength(0)
    h.engine.enable('local-a')
    const backup = h.storage.getItem(LOCAL_SYNC_BACKUP_KEY)
    expect(JSON.parse(backup!).trips).toHaveLength(1)
    h.engine.disable()
    h.update(checkedIn(h.state(), 'later'))
    h.engine.enable('local-b')
    expect(h.engine.getStatus()).toMatchObject({ enabled: false, space: 'local-a', phase: 'error' })
    h.engine.enable('local-a')
    expect(h.storage.getItem(LOCAL_SYNC_BACKUP_KEY)).toBe(backup)
  })

  it('does not enable or upload if the migration backup cannot be saved', async () => {
    const h = harness()
    h.storage.failKey = LOCAL_SYNC_BACKUP_KEY
    h.engine.enable('local-a')
    await h.engine.sync()
    expect(h.engine.getStatus()).toMatchObject({ enabled: false, phase: 'error', space: null })
    expect(h.storage.getItem(LOCAL_SYNC_STORAGE_KEY)).toBeNull()
    expect(h.calls).toHaveLength(0)
  })

  it('persists request and original photo mapping before uploading, then uploads photos before metadata', async () => {
    const h = harness(checkedIn(traveling(), 'arrival'))
    h.engine.enable('local-a')
    expect(h.settings().outbox?.photoMap).toEqual({ [syncPhotoId('arrival')]: 'local-photo-arrival' })
    await h.engine.sync()
    expect(h.events.indexOf('upload')).toBeLessThan(h.events.indexOf('push'))
    expect(h.events.indexOf('push')).toBeLessThan(h.events.indexOf('commit'))
    expect(h.settings().outbox).toBeNull()
    expect(h.engine.getStatus()).toMatchObject({ phase: 'synced', pending: false })
    expect(h.state().visits[0].photoId).toBe('local-photo-arrival')
  })

  it('replays the identical durable request after a committed response was lost and the engine restarted', async () => {
    const h = harness(checkedIn(traveling(), 'arrival'))
    const push = h.io.push
    h.io.push = async (...args) => { await push(...args); throw new Error('Response lost') }
    h.engine.enable('local-a')
    await h.engine.sync()
    const old = h.settings().outbox
    expect(old).not.toBeNull()
    h.io.push = push
    const restarted = h.create()
    await restarted.sync()
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].request).toEqual(h.calls[0].request)
    expect(h.state().visits).toHaveLength(1)
    expect(h.settings().outbox).toBeNull()
    expect(restarted.getStatus().phase).toBe('synced')
  })

  it('keeps a check-in created during the request and gives it a subsequent durable request', async () => {
    const h = harness()
    const reply = deferred<SyncReply>()
    const push = h.io.push
    h.io.push = () => reply.promise
    h.engine.enable('local-a')
    const pending = h.settings().outbox!
    const run = h.engine.sync()
    h.update(checkedIn(h.state(), 'during-network'))
    h.photos.set('local-photo-during-network', photo)
    h.engine.capture()
    reply.resolve({ revision: 1, snapshot: pending.snapshot })
    await run
    expect(h.state().visits).toHaveLength(1)
    expect(h.settings().outbox?.requestId).not.toBe(pending.requestId)
    expect(h.settings().outbox?.snapshot.visits[0].id).toBe('during-network')
    expect(h.engine.getStatus().pending).toBe(true)
    h.io.push = push
    await h.engine.sync()
    expect(h.server().visits).toHaveLength(1)
  })

  it('retains the request when metadata saving fails and does not falsely acknowledge success', async () => {
    const h = harness()
    const commit = h.io.commitState
    h.io.commitState = () => { throw new Error('metadata quota') }
    h.engine.enable('local-a')
    const requestId = h.settings().outbox!.requestId
    await h.engine.sync()
    expect(h.settings().outbox?.requestId).toBe(requestId)
    expect(h.settings().revision).toBe(0)
    h.io.commitState = commit
    await h.engine.sync()
    expect(h.settings().outbox).toBeNull()
  })

  it('retains the request if the final acknowledgement write fails after a successful local save', async () => {
    const h = harness()
    const commit = h.io.commitState
    h.io.commitState = state => { commit(state); h.storage.failKey = LOCAL_SYNC_STORAGE_KEY }
    h.engine.enable('local-a')
    const original = h.settings().outbox!
    await h.engine.sync()
    expect(h.settings().outbox).toEqual(original)
    h.storage.failKey = null
    h.io.commitState = commit
    await h.engine.sync()
    expect(h.calls[1].request.requestId).toBe(original.requestId)
    expect(h.settings().outbox).toBeNull()
  })

  it('never sends a request when its outbox cannot be durably saved', async () => {
    const h = harness()
    h.engine.enable('local-a')
    await h.engine.sync()
    h.update(checkedIn(h.state(), 'quota'))
    h.storage.failKey = LOCAL_SYNC_STORAGE_KEY
    await h.engine.sync()
    expect(h.calls).toHaveLength(1)
    expect(h.engine.getStatus().phase).toBe('error')
  })

  it('rejects stale revisions without erasing new progress or acknowledging the pending request', async () => {
    const h = harness()
    h.engine.enable('local-a')
    await h.engine.sync()
    h.update(checkedIn(h.state(), 'new'))
    h.photos.set('local-photo-new', photo)
    h.io.push = async () => ({ revision: 0, snapshot: emptySyncSnapshot() })
    await h.engine.sync()
    expect(h.settings().revision).toBe(1)
    expect(h.settings().outbox?.snapshot.visits).toHaveLength(1)
    expect(h.state().visits).toHaveLength(1)
    expect(h.engine.getStatus().error).toContain('旧版本')
  })

  it('ignores late replies after pause and resumes using the original request', async () => {
    const h = harness()
    const response = deferred<SyncReply>()
    h.io.push = () => response.promise
    h.engine.enable('local-a')
    const pending = h.settings().outbox!
    const run = h.engine.sync()
    h.engine.disable()
    response.resolve({ revision: 4, snapshot: pending.snapshot })
    await run
    expect(h.settings().revision).toBe(0)
    expect(h.settings().outbox?.requestId).toBe(pending.requestId)
    expect(h.engine.getStatus().phase).toBe('disabled')
  })

  it('pauses before backup imports and persists a clear warning instead of automatically resuming', async () => {
    const h = harness()
    h.engine.enable('local-a')
    const pending = h.settings().outbox!
    expect(h.engine.pauseForImport()).toBe(true)
    h.update(createInitialState(at))
    h.engine.capture()
    await h.engine.sync()
    expect(h.calls).toHaveLength(0)
    expect(h.create().getStatus()).toMatchObject({ enabled: false, pausedForImport: true, space: 'local-a' })
    expect(h.settings().outbox?.requestId).toBe(pending.requestId)
    h.engine.enable('local-a')
    expect(h.engine.getStatus().pausedForImport).toBe(false)
  })

  it('blocks imports if disabling sync could not be saved', () => {
    const h = harness()
    h.engine.enable('local-a')
    h.storage.failKey = LOCAL_SYNC_STORAGE_KEY
    expect(h.engine.pauseForImport()).toBe(false)
    expect(h.engine.getStatus().enabled).toBe(true)
  })

  it('retains a corrupt durable queue and refuses to replace it with an empty request', async () => {
    const h = harness()
    h.storage.setItem(LOCAL_SYNC_STORAGE_KEY, '{broken')
    const engine = h.create()
    engine.enable('local-a')
    await engine.sync()
    expect(h.calls).toHaveLength(0)
    expect(h.storage.getItem(LOCAL_SYNC_STORAGE_KEY)).toBe('{broken')
    expect(engine.getStatus().phase).toBe('error')
  })

  it('ignores local-only changes and avoids sending an unchanged snapshot on every poll', async () => {
    const h = harness()
    h.engine.enable('local-a')
    await h.engine.sync()
    h.update({ ...h.state(), position: { ...h.state().position!, lat: 0 }, mapTheme: 'treasure', targetLandmarkId: 'nj-confucius' })
    h.engine.capture()
    await h.engine.sync()
    await h.engine.sync()
    expect(h.calls).toHaveLength(1)
    expect(h.settings().outbox).toBeNull()
    expect(h.state().mapTheme).toBe('treasure')
  })

  it('serializes overlapping retry clicks', async () => {
    const h = harness()
    const response = deferred<SyncReply>()
    const push = vi.fn(() => response.promise)
    h.io.push = push
    h.engine.enable('local-a')
    const running = h.engine.sync()
    await h.engine.sync()
    await h.engine.sync()
    expect(push).toHaveBeenCalledTimes(1)
    response.resolve({ revision: 1, snapshot: h.settings().outbox!.snapshot })
    await running
  })
})

describe('photo and metadata recovery', () => {
  it('downloads a new remote photograph before saving metadata and acknowledging', async () => {
    const h = harness(createInitialState(at))
    const remote = checkedIn(traveling('remote-trip'), 'remote-visit')
    h.seedServer(projectSyncState(remote), 3)
    h.remotePhotos.set(syncPhotoId('remote-visit'), photo)
    h.engine.enable('local-a')
    await h.engine.sync()
    expect(h.events.indexOf('save-photo')).toBeLessThan(h.events.indexOf('commit'))
    expect(h.state().visits[0].photoId).toBe(syncPhotoId('remote-visit'))
    expect(h.photos.has(syncPhotoId('remote-visit'))).toBe(true)
    expect(h.engine.getStatus().phase).toBe('synced')
  })

  it('leaves metadata unmodified and the same request queued if photo download fails', async () => {
    const h = harness(createInitialState(at))
    h.seedServer(projectSyncState(checkedIn(traveling('remote-trip'), 'remote-visit')), 3)
    h.engine.enable('local-a')
    const requestId = h.settings().outbox!.requestId
    await h.engine.sync()
    expect(h.state().visits).toHaveLength(0)
    expect(h.settings().outbox?.requestId).toBe(requestId)
    h.remotePhotos.set(syncPhotoId('remote-visit'), photo)
    await h.engine.sync()
    expect(h.state().visits).toHaveLength(1)
    expect(h.calls[1].request.requestId).toBe(requestId)
  })

  it('repairs an evicted IndexedDB photo using its original local ID', async () => {
    const h = harness(checkedIn(traveling(), 'arrival'))
    h.engine.enable('local-a')
    await h.engine.sync()
    h.photos.clear()
    await h.engine.sync()
    expect(h.photos.has('local-photo-arrival')).toBe(true)
    expect(h.state().visits[0].photoId).toBe('local-photo-arrival')
    expect(h.engine.getStatus().phase).toBe('synced')
  })

  it('restores an evicted pending photo from its earlier successful upload before retry', async () => {
    const h = harness(checkedIn(traveling(), 'arrival'))
    const push = h.io.push
    h.io.push = async () => { throw new Error('offline') }
    h.engine.enable('local-a')
    await h.engine.sync()
    const requestId = h.settings().outbox!.requestId
    h.photos.clear()
    h.io.push = push
    await h.create().sync()
    expect(h.calls[0].request.requestId).toBe(requestId)
    expect(h.photos.has('local-photo-arrival')).toBe(true)
    expect(h.settings().outbox).toBeNull()
  })

  it('does not acknowledge before the IndexedDB write actually resolves', async () => {
    const h = harness(createInitialState(at))
    h.seedServer(projectSyncState(checkedIn(traveling('remote-trip'), 'remote-visit')), 3)
    h.remotePhotos.set(syncPhotoId('remote-visit'), photo)
    const write = deferred<void>()
    const writing = deferred<void>()
    h.io.savePhoto = async () => { writing.resolve(); await write.promise }
    h.engine.enable('local-a')
    const run = h.engine.sync()
    await writing.promise
    expect(h.settings().outbox).not.toBeNull()
    expect(h.state().visits).toHaveLength(0)
    write.resolve()
    await run
    expect(h.settings().outbox).toBeNull()
  })
})
