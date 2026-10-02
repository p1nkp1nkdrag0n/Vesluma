import { describe, expect, it } from 'vitest'
import { allowedVisitRegions, getCity, getLandmark } from '../data/cities'
import { createInitialState, getCityProgress, isAppState, reducer, type AppState } from './model'
import { applySyncSnapshot, emptySyncSnapshot, mergeSyncSnapshots, projectSyncState, snapshotFingerprint, syncPhotoId, SyncProtocolError, validateSyncSnapshot, type SyncSnapshot } from './syncProtocol'

const startedAt = 1_000_000
function started(id = 'trip-one'): AppState {
  return reducer(createInitialState(startedAt), { type: 'start-trip', id, at: startedAt })
}
function arrive(state: AppState, id = 'visit-one', landmarkId = 'nj-confucius', at = startedAt + 1000, shareWithSquad?: boolean): AppState {
  const landmark = getLandmark(landmarkId)!
  const located = reducer(state, { type: 'set-position', position: { lat: landmark.lat, lng: landmark.lng, at, accuracy: 5, source: 'demo' } })
  return reducer(located, { type: 'check-in', id, photoId: `original-photo-${id}`, landmarkId, at, shareWithSquad })
}
function wire(id = 'visit-one', landmarkId = 'nj-confucius', at = startedAt + 1000): SyncSnapshot { return projectSyncState(arrive(started(), id, landmarkId, at)) }
function copy<T>(value: T): T { return structuredClone(value) }

describe('bounded, private synchronization projection', () => {
  it('projects no location, point cloud, publication, UI preference or original photograph key', () => {
    let state = arrive(started())
    state = reducer(state, { type: 'set-public', visitId: 'visit-one', public: true })
    state = reducer(state, { type: 'pause-trip', at: startedAt + 2000 })
    state.trips[0].members[0].solo = true
    const snapshot = projectSyncState(state)
    expect(Object.keys(snapshot).sort()).toEqual(['profiles', 'trips', 'unlocks', 'version', 'visits'])
    expect(snapshot.trips[0].status).toBe('active')
    expect(snapshot.trips[0].members[0].solo).toBe(false)
    expect(snapshot.visits[0].public).toBe(false)
    expect(snapshot.visits[0].photoId).toBe('sync-visit-one')
    expect(state.trips[0].status).toBe('paused')
    expect(state.visits[0].public).toBe(true)
    expect(validateSyncSnapshot(snapshot)).toEqual(snapshot)
  })

  it('treats restored local photo keys and device preferences as the same progress', () => {
    const state = arrive(started())
    const restored = copy(state)
    restored.visits[0].photoId = 'import-123-0'
    restored.visits[0].public = true
    restored.trips[0].status = 'paused'
    restored.trips[0].members[0].solo = true
    restored.mapTheme = 'treasure'
    expect(snapshotFingerprint(projectSyncState(restored))).toBe(snapshotFingerprint(projectSyncState(state)))
  })

  it('retains known demo-member identities absent from the old profiles array', () => {
    let state = reducer(started(), { type: 'create-squad', at: startedAt })
    state = reducer(state, { type: 'update-member', member: { id: 'friend', name: 'Friend', joinedAt: startedAt, solo: false } })
    const snapshot = projectSyncState(arrive(state))
    expect(snapshot.profiles.some(profile => profile.id === 'friend')).toBe(true)
    expect(snapshot.unlocks.some(unlock => unlock.userId === 'friend')).toBe(true)
  })

  it('permits an old offline arrival using its arrival time, without a server-clock deadline', () => {
    expect(validateSyncSnapshot(wire()).visits[0].at).toBe(startedAt + 1000)
  })

  it('makes empty snapshots and their canonical fingerprint stable', () => {
    expect(mergeSyncSnapshots(emptySyncSnapshot(), emptySyncSnapshot())).toEqual(emptySyncSnapshot())
    expect(snapshotFingerprint(emptySyncSnapshot())).toBe(snapshotFingerprint(validateSyncSnapshot(emptySyncSnapshot())))
  })
})

describe('convergent progress and immutable arrival evidence', () => {
  it('unions concurrent offline visits, de-duplicates regions, and selects the earliest evidence', () => {
    const a = wire('later', 'nj-confucius', startedAt + 2000)
    const b = wire('earlier', 'nj-confucius', startedAt + 1000)
    const merged = mergeSyncSnapshots(a, b)
    expect(merged.visits.map(visit => visit.id)).toEqual(['earlier', 'later'])
    expect(merged.unlocks).toHaveLength(1)
    expect(merged.unlocks[0].visitId).toBe('earlier')
    expect(merged.visits.map(visit => visit.firstActivation)).toEqual([true, false])
    expect(merged.visits.map(visit => visit.firstPersonalVisit)).toEqual([true, false])
    expect(merged.visits[1].unlockedRegionIds).toEqual([])
    expect(mergeSyncSnapshots(b, a)).toEqual(merged)
    expect(mergeSyncSnapshots(merged, a)).toEqual(merged)
    expect(mergeSyncSnapshots(merged, emptySyncSnapshot())).toEqual(merged)
  })

  it('breaks equal arrival timestamps by event id independently of upload order', () => {
    const merged = mergeSyncSnapshots(wire('event-z'), wire('event-a'))
    expect(merged.unlocks[0].visitId).toBe('event-a')
    expect(merged.visits.map(visit => visit.id)).toEqual(['event-a', 'event-z'])
  })

  it('accepts a stale derived first flag on the same immutable event without duplicating it', () => {
    const older = wire('event-z')
    const merged = mergeSyncSnapshots(older, wire('event-a'))
    expect(mergeSyncSnapshots(merged, older)).toEqual(merged)
  })

  it('keeps ordinary attraction visits without granting map rights', () => {
    const attraction = getCity('nanjing').landmarks.find(landmark => landmark.tier !== 1)!
    const snapshot = wire('attraction-visit', attraction.id)
    expect(snapshot.visits).toHaveLength(1)
    expect(snapshot.unlocks).toEqual([])
    expect(snapshot.visits[0].unlockedRegionIds).toEqual([])
  })

  it('preserves legacy footprints without upgrading them to new administrative regions', () => {
    const snapshot = wire()
    const visit = snapshot.visits[0]
    delete visit.contentVersion
    visit.unlockedRegionIds = allowedVisitRegions(visit.landmarkId)
    snapshot.unlocks = visit.unlockedRegionIds.map(regionId => ({ id: `${visit.userId}:${regionId}`, userId: visit.userId,
      cityId: visit.cityId, regionId, at: visit.at, visitId: visit.id, source: 'personal' }))
    const normalized = validateSyncSnapshot(snapshot)
    expect(normalized.unlocks.map(unlock => unlock.regionId)).toEqual(allowedVisitRegions(visit.landmarkId).slice().sort())
    expect(normalized.unlocks.every(unlock => !getCity('nanjing').regions.some(region => region.id === unlock.regionId))).toBe(true)
    expect(mergeSyncSnapshots(normalized, emptySyncSnapshot())).toEqual(normalized)
  })

  it.each(['note', 'tripId', 'position'] as const)('rejects same-id changes to immutable %s without mutating either input', field => {
    const a = wire()
    const b = copy(a)
    if (field === 'note') b.visits[0].note = 'Different evidence'
    if (field === 'position') b.visits[0].position.accuracy = 6
    if (field === 'tripId') { b.trips[0].id = 'other-trip'; b.visits[0].tripId = 'other-trip' }
    const beforeA = copy(a)
    const beforeB = copy(b)
    try { mergeSyncSnapshots(a, b); throw new Error('Expected a conflict') }
    catch (error) { expect(error).toBeInstanceOf(SyncProtocolError); expect((error as SyncProtocolError).code).toBe('SYNC_CONFLICT') }
    expect(a).toEqual(beforeA)
    expect(b).toEqual(beforeB)
  })

  it('rejects reusing a trip id with a different owner/start evidence', () => {
    const a = projectSyncState(started())
    const b = copy(a)
    b.trips[0].startedAt--
    expect(() => mergeSyncSnapshots(a, b)).toThrow(/conflict/i)
  })

  it('keeps an ended trip ended when another device uploads a later offline arrival', () => {
    const active = started()
    const ended = projectSyncState(reducer(active, { type: 'end-trip', at: startedAt + 2000 }))
    const later = projectSyncState(arrive(active, 'offline-later', 'nj-confucius', startedAt + 3000))
    const merged = mergeSyncSnapshots(ended, later)
    expect(merged.trips[0].status).toBe('ended')
    expect(merged.trips[0].endedAt).toBe(startedAt + 2000)
    expect(merged.visits).toHaveLength(1)
    expect(validateSyncSnapshot(merged)).toEqual(merged)
    expect(isAppState(applySyncSnapshot(active, merged))).toBe(true)
    expect(mergeSyncSnapshots(later, ended)).toEqual(merged)
  })

  it('does not let an old member snapshot undo leaving; rejoining is an explicit newer membership', () => {
    let squad = reducer(started(), { type: 'create-squad', at: startedAt })
    const initial = projectSyncState(squad)
    squad = reducer(squad, { type: 'leave-squad', at: startedAt + 1000 })
    const left = projectSyncState(squad)
    const merged = mergeSyncSnapshots(initial, left)
    expect(merged.trips[0].members[0].leftAt).toBe(startedAt + 1000)
    const rejoined = projectSyncState(reducer(squad, { type: 'join-squad', tripId: 'trip-one', at: startedAt + 2000 }))
    expect(mergeSyncSnapshots(merged, rejoined).trips[0].members[0].leftAt).toBeUndefined()
    expect(mergeSyncSnapshots(merged, rejoined).trips[0].members[0].joinedAt).toBe(startedAt + 2000)
  })

  it('preserves historical shared visits after a member leaves and rejoins', () => {
    let squad = reducer(started(), { type: 'create-squad', at: startedAt })
    squad = reducer(squad, { type: 'switch-profile', profile: { id: 'local-2', name: 'Friend' } })
    squad = reducer(squad, { type: 'join-squad', tripId: 'trip-one', at: startedAt + 500 })
    squad = reducer(squad, { type: 'switch-profile', profile: { id: 'local-1', name: 'Traveler' } })
    squad = arrive(squad)
    squad = reducer(squad, { type: 'switch-profile', profile: { id: 'local-2', name: 'Friend' } })
    squad = reducer(squad, { type: 'leave-squad', at: startedAt + 1500 })
    squad = reducer(squad, { type: 'join-squad', tripId: 'trip-one', at: startedAt + 2000 })
    const snapshot = projectSyncState(squad)
    expect(snapshot.visits[0].recipientIds).toEqual(['local-1', 'local-2'])
    expect(snapshot.unlocks).toHaveLength(2)
  })
})

describe('applying progress without overwriting current device work', () => {
  it('preserves local draft context, paused state, photo identity/publication and exact points reference', () => {
    let local = arrive(started())
    local = reducer(local, { type: 'pause-trip', at: startedAt + 2000 })
    local = reducer(local, { type: 'set-target', landmarkId: 'nj-confucius' })
    local = reducer(local, { type: 'set-public', visitId: 'visit-one', public: true })
    local.trips[0].members[0].solo = true
    const applied = applySyncSnapshot(local, wire('remote-visit', 'nj-confucius', startedAt + 3000))
    expect(applied.visits).toHaveLength(2)
    expect(applied.visits.find(visit => visit.id === 'visit-one')).toMatchObject({ public: true, photoId: 'original-photo-visit-one' })
    expect(applied.visits.find(visit => visit.id === 'remote-visit')).toMatchObject({ public: false, photoId: 'sync-remote-visit' })
    expect(applied.trips[0].status).toBe('paused')
    expect(applied.trips[0].members[0].solo).toBe(true)
    expect(applied.activeTripId).toBe(local.activeTripId)
    expect(applied.position).toBe(local.position)
    expect(applied.points).toBe(local.points)
    expect(applied.preferences).toBe(local.preferences)
    expect(applied.profile).toBe(local.profile)
    expect(applied.targetLandmarkId).toBe(local.targetLandmarkId)
    expect(getCityProgress(applied).unlocked).toBe(1)
    expect(isAppState(applied)).toBe(true)
    expect(snapshotFingerprint(projectSyncState(applied))).toBe(snapshotFingerprint(mergeSyncSnapshots(projectSyncState(local), wire('remote-visit', 'nj-confucius', startedAt + 3000))))
  })

  it('retains a new local arrival made while a request was in flight', () => {
    const sent = wire()
    const newerLocal = arrive(arrive(started()), 'new-during-request', 'nj-confucius', startedAt + 3000)
    expect(applySyncSnapshot(newerLocal, sent).visits.map(visit => visit.id)).toEqual(['visit-one', 'new-during-request'])
  })

  it('does not choose another session’s active trip, but exposes its saved records', () => {
    const local = createInitialState(startedAt)
    const remote = wire()
    const applied = applySyncSnapshot(local, remote)
    expect(applied.activeTripId).toBeNull()
    expect(applied.trips).toHaveLength(1)
    expect(applied.visits).toHaveLength(1)
    expect(isAppState(applied)).toBe(true)
  })

  it('clears an ended active entrance while leaving selected city and identity unchanged', () => {
    const local = started()
    const remote = projectSyncState(reducer(local, { type: 'end-trip', at: startedAt + 2000 }))
    const applied = applySyncSnapshot(local, remote)
    expect(applied.activeTripId).toBeNull()
    expect(applied.trips[0].status).toBe('ended')
    expect(applied.profile).toBe(local.profile)
    expect(applied.cityId).toBe(local.cityId)
  })

  it('keeps concurrently-created trips and new profiles instead of deleting them', () => {
    const local = started('local-trip')
    const remoteState = reducer(started('remote-trip'), { type: 'switch-profile', profile: { id: 'new-person', name: 'New person' } })
    const applied = applySyncSnapshot(local, projectSyncState(remoteState))
    expect(applied.trips).toHaveLength(2)
    expect(applied.activeTripId).toBe('local-trip')
    expect(applied.profiles.some(profile => profile.id === 'new-person')).toBe(true)
  })

  it('converges conflicting profile names without changing selected identity or producing endless uploads', () => {
    const local = started()
    local.profile = { ...local.profile, name: 'Z traveler' }
    local.profiles = local.profiles.map(profile => profile.id === local.profile.id ? local.profile : profile)
    const remoteState = copy(local)
    remoteState.profile = { ...remoteState.profile, name: 'A traveler' }
    remoteState.profiles = remoteState.profiles.map(profile => profile.id === remoteState.profile.id ? remoteState.profile : profile)
    const remote = projectSyncState(remoteState)
    const applied = applySyncSnapshot(local, remote)
    expect(applied.profile).toEqual({ id: local.profile.id, name: 'A traveler' })
    expect(snapshotFingerprint(projectSyncState(applied))).toBe(snapshotFingerprint(remote))
    expect(applySyncSnapshot(applied, remote)).toEqual(applied)
  })
})

describe('untrusted wire validation', () => {
  const invalidCases: Array<[string, (snapshot: SyncSnapshot) => void]> = [
    ['unknown root field', snapshot => { Object.assign(snapshot, { position: { lat: 1, lng: 2 } }) }],
    ['unknown nested field', snapshot => { Object.assign(snapshot.visits[0].position, { secret: 'do not store' }) }],
    ['overlong note', snapshot => { snapshot.visits[0].note = 'x'.repeat(201) }],
    ['bad note type', snapshot => { Object.assign(snapshot.visits[0], { note: {} }) }],
    ['private local photo key', snapshot => { snapshot.visits[0].photoId = 'original-photo' }],
    ['invalid identifier', snapshot => { snapshot.visits[0].id = '../traversal' }],
    ['unknown owner', snapshot => { snapshot.trips[0].userId = 'unknown' }],
    ['unknown recipient', snapshot => { snapshot.visits[0].recipientIds.push('unknown') }],
    ['personal visit with another recipient', snapshot => { snapshot.visits[0].recipientIds.push('local-2') }],
    ['unknown trip', snapshot => { snapshot.visits[0].tripId = 'unknown' }],
    ['arrival before trip', snapshot => { snapshot.visits[0].at = startedAt - 1; snapshot.visits[0].position.at = startedAt - 1 }],
    ['mismatched city', snapshot => { snapshot.visits[0].cityId = 'xian' }],
    ['mislabeled demonstration', snapshot => { snapshot.visits[0].demo = false }],
    ['public state', snapshot => { snapshot.visits[0].public = true }],
    ['external image', snapshot => { snapshot.visits[0].photoUrl = 'https://example.test/photo.jpg' }],
    ['non-demo sample photo', snapshot => { snapshot.visits[0].photoUrl = '/images/nanjing.png'; snapshot.visits[0].demo = false; snapshot.visits[0].position.source = 'device' }],
    ['stale arrival', snapshot => { snapshot.visits[0].position.at -= 300_001 }],
    ['future arrival evidence', snapshot => { snapshot.visits[0].position.at += 5_001 }],
    ['inaccurate arrival', snapshot => { snapshot.visits[0].position.accuracy = 100.1 }],
    ['out-of-radius arrival', snapshot => { snapshot.visits[0].position.lat += 0.01 }],
    ['invalid coordinate', snapshot => { snapshot.visits[0].position.lat = NaN }],
    ['forged region', snapshot => { snapshot.visits[0].unlockedRegionIds = ['nj-zone-zhongshan'] }],
    ['forged unlock source', snapshot => { snapshot.unlocks[0].source = 'squad' }],
    ['unreferenced unlock', snapshot => { snapshot.unlocks[0].visitId = 'unknown' }],
    ['duplicate event', snapshot => { snapshot.visits.push(copy(snapshot.visits[0])) }],
    ['duplicate profile', snapshot => { snapshot.profiles.push(copy(snapshot.profiles[0])) }],
    ['too many profiles', snapshot => { snapshot.profiles = Array.from({ length: 101 }, (_, i) => ({ id: `user-${i}`, name: 'User' })) }],
    ['ended trip missing timestamp', snapshot => { snapshot.trips[0].status = 'ended' }],
    ['paused wire trip', snapshot => { snapshot.trips[0].status = 'paused' }],
    ['device solo preference', snapshot => { snapshot.trips[0].members[0].solo = true }],
  ]
  it.each(invalidCases)('rejects %s without changing the supplied data', (_label, mutate) => {
    const snapshot = wire()
    mutate(snapshot)
    const before = copy(snapshot)
    expect(() => validateSyncSnapshot(snapshot)).toThrow(SyncProtocolError)
    expect(snapshot).toEqual(before)
  })

  it('permits exact accuracy/time/radius boundaries', () => {
    const snapshot = wire()
    const landmark = getLandmark(snapshot.visits[0].landmarkId)!
    snapshot.visits[0].position.accuracy = 100
    snapshot.visits[0].position.at -= 300_000
    snapshot.visits[0].position.lat = landmark.lat + (landmark.arrivalRadiusMeters / 6_371_000) * (180 / Math.PI)
    expect(validateSyncSnapshot(snapshot).visits).toHaveLength(1)
  })

  it('accepts only a matching bundled demo image URL', () => {
    const snapshot = wire()
    snapshot.visits[0].photoUrl = '/images/nanjing.png'
    expect(validateSyncSnapshot(snapshot).visits[0].photoUrl).toBe('/images/nanjing.png')
    snapshot.visits[0].photoUrl = '/images/xian.png'
    expect(() => validateSyncSnapshot(snapshot)).toThrow()
  })

  it('canonicalizes array order and rejects prototype keys', () => {
    const snapshot = wire()
    const reversed = copy(snapshot)
    reversed.profiles.reverse()
    expect(snapshotFingerprint(reversed)).toBe(snapshotFingerprint(snapshot))
    const injected: unknown = JSON.parse(JSON.stringify(snapshot).replace('"version":1', '"version":1,"__proto__":{"polluted":true}'))
    expect(() => validateSyncSnapshot(injected)).toThrow()
    expect(syncPhotoId('visit-one')).toBe('sync-visit-one')
    expect(() => syncPhotoId('../photo')).toThrow()
  })
})
