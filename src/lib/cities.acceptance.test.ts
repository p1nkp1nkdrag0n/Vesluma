import { afterEach, describe, expect, it, vi } from 'vitest'
import { cities, getLandmark, type City, type Landmark } from '../data/cities'
import { createInitialState, getCityProgress, isAppState, reducer, validateCheckIn, type AppState } from './model'
import { loadState, saveState, STATE_STORAGE_KEY } from './storage'
import { applySyncSnapshot, emptySyncSnapshot, mergeSyncSnapshots, projectSyncState } from './syncProtocol'

const at = 1_000_000
function begin(city: City, state = createInitialState(at), time = at): AppState {
  return reducer(reducer(state, { type: 'set-city', cityId: city.id }), { type: 'start-trip', id: `trip-${city.id}`, at: time })
}
function arrive(state: AppState, landmark: Landmark, time = at, metres = 0): AppState {
  return reducer(state, { type: 'set-position', position: {
    lat: landmark.lat + metres / 6_371_000 * 180 / Math.PI, lng: landmark.lng,
    at: time, accuracy: 5, source: 'demo',
  } })
}
function checkIn(state: AppState, landmark: Landmark, id: string, time = at): AppState {
  return reducer(arrive(state, landmark, time), { type: 'check-in', id, landmarkId: landmark.id,
    at: time, photoId: `photo-${id}`, photoUrl: landmark.cover })
}
afterEach(() => vi.unstubAllGlobals())

describe('six-city progress acceptance', () => {
  it.each(cities)('$name records a secondary first, unlocks only its representative, and keeps retries idempotent', city => {
    const secondary = city.landmarks.find(landmark => landmark.tier === 2)!
    expect(secondary, `${city.id} must include an ordinary scenic point`).toBeDefined()
    const representative = getLandmark(city.regions.find(region => region.id === secondary.regionId)!.anchorLandmarkId)!
    let state = checkIn(begin(city), secondary, `${city.id}-secondary`)
    expect(state.visits).toHaveLength(1)
    expect(state.visits[0].unlockedRegionIds).toEqual([])
    expect(getCityProgress(state).unlocked).toBe(0)
    state = checkIn(state, representative, `${city.id}-primary`, at + 1000)
    expect(getCityProgress(state).regionIds).toEqual([representative.regionId])
    const retry = reducer(state, { type: 'check-in', id: `${city.id}-primary`, landmarkId: representative.id,
      at: at + 1000, photoId: 'retry-photo' })
    expect(retry).toBe(state)
    const revisit = checkIn(state, representative, `${city.id}-revisit`, at + 2000)
    expect(revisit.visits).toHaveLength(3)
    expect(revisit.unlocks).toEqual(state.unlocks)
    expect(revisit.visits[2].unlockedRegionIds).toEqual([])
    expect(isAppState(revisit)).toBe(true)
    const remote = applySyncSnapshot(createInitialState(at), mergeSyncSnapshots(emptySyncSnapshot(), projectSyncState(revisit)))
    expect(getCityProgress(remote, city.id).regionIds).toEqual([representative.regionId])
    expect(remote.visits.filter(visit => visit.landmarkId === secondary.id)[0].unlockedRegionIds).toEqual([])
  })

  it.each(cities)('$name retains the inclusive 250-metre boundary at its representative latitude', city => {
    const representative = city.landmarks.find(landmark => landmark.tier === 1)!
    const state = begin(city)
    expect(representative.arrivalRadiusMeters).toBe(250)
    expect(validateCheckIn(arrive(state, representative, at, 250), representative.id, at).ok).toBe(true)
    expect(validateCheckIn(arrive(state, representative, at, 250.001), representative.id, at).ok).toBe(false)
  })

  it('keeps each city progress and archive intact through six-city switching, storage reload and sync projection', () => {
    const saved = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    })
    expect(cities).toHaveLength(6)
    let state = createInitialState(at)
    const expected = new Map<string, string>()
    for (const [index, city] of cities.entries()) {
      const time = at + index * 10_000
      const representative = city.landmarks.find(landmark => landmark.tier === 1)!
      state = checkIn(begin(city, state, time), representative, `visit-${city.id}`, time)
      state = reducer(state, { type: 'end-trip', at: time + 1000 })
      expected.set(city.id, representative.regionId)
      expect(isAppState(state)).toBe(true)
    }
    const visits = state.visits
    const unlocks = state.unlocks
    for (const city of [...cities].reverse()) {
      state = reducer(state, { type: 'set-city', cityId: city.id })
      state = reducer(state, { type: 'set-target', landmarkId: city.landmarks[0].id })
      expect(saveState(state)).toBe(true)
      state = loadState()
      expect(state.cityId).toBe(city.id)
      expect(state.targetLandmarkId).toBe(city.landmarks[0].id)
      expect(state.position).toBeNull()
      expect(state.visits).toEqual(visits)
      expect(state.unlocks).toEqual(unlocks)
      expect(state.trips.every(trip => trip.status === 'ended')).toBe(true)
      expect(getCityProgress(state).regionIds).toEqual([expected.get(city.id)])
    }
    expect(saved.has(`${STATE_STORAGE_KEY}:recovery`)).toBe(false)
    const remote = applySyncSnapshot(createInitialState(at), projectSyncState(state))
    expect(isAppState(remote)).toBe(true)
    expect(remote.visits).toHaveLength(6)
    expect(remote.trips).toHaveLength(6)
    for (const city of cities) expect(getCityProgress(remote, city.id).regionIds).toEqual([expected.get(city.id)])
  })
})
