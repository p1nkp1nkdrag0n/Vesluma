import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cities, getCity, getLandmark, type CityId } from '../data/cities'
import { createInitialState, getCityProgress, isAppState, reducer, type AppState } from './model'
import { exportBackup, importBackup, saveState, STATE_STORAGE_KEY } from './storage'

const at = 1_000_000
let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

function demoVisit(cityId: CityId, landmarkId = getCity(cityId).regions[0].anchorLandmarkId): AppState {
  const landmark = getLandmark(landmarkId)!
  let state = reducer(createInitialState(at), { type: 'set-city', cityId })
  state = reducer(state, { type: 'start-trip', id: `trip-${cityId}`, at })
  state = reducer(state, { type: 'set-position', position: { lat: landmark.lat, lng: landmark.lng, accuracy: 5, at, source: 'demo' } })
  return reducer(state, { type: 'check-in', landmarkId, id: `visit-${cityId}`, photoId: `photo-${cityId}`, photoUrl: landmark.cover, at })
}
const backupFile = (state: AppState) => new Blob([JSON.stringify({ format: 'vesluma-local-backup', version: 1, state, photos: [] })], { type: 'application/json' })

describe('city-specific demo backup portability', () => {
  it.each(cities)('$name exports and imports its own concept cover without losing progress', async city => {
    const original = demoVisit(city.id)
    expect(isAppState(original)).toBe(true)
    const backup = await exportBackup(original)
    const restored = await importBackup(backup)
    expect(restored.cityId).toBe(city.id)
    expect(restored.visits).toEqual(original.visits)
    expect(restored.unlocks).toEqual(original.unlocks)
    expect(restored.visits[0].demo).toBe(true)
    expect(restored.visits[0].photoUrl).toBe(city.landmarks[0].cover)
    expect(restored.position).toBeNull()
    expect(getCityProgress(restored).unlocked).toBe(1)
    expect(JSON.parse(values.get(STATE_STORAGE_KEY)!).cityId).toBe(city.id)
  })

  it.each(cities)('$name rejects a cover from another city without replacing local records', async city => {
    const original = demoVisit(city.id)
    saveState(original)
    const saved = values.get(STATE_STORAGE_KEY)
    const other = cities.find(item => item.id !== city.id)!
    const forged = { ...original, visits: original.visits.map(visit => ({ ...visit, photoUrl: other.landmarks[0].cover })) }
    await expect(importBackup(backupFile(forged))).rejects.toThrow('外部照片地址')
    expect(values.get(STATE_STORAGE_KEY)).toBe(saved)
  })

  it.each(['https://example.com/photo.png', '//example.com/photo.png', '/images/unknown.png', '/images/../private.png'])('rejects unsupported photo URL %s and preserves the original state', async photoUrl => {
    const original = demoVisit('nanjing')
    saveState(original)
    const saved = values.get(STATE_STORAGE_KEY)
    await expect(importBackup(backupFile({ ...original, visits: original.visits.map(visit => ({ ...visit, photoUrl })) }))).rejects.toThrow('外部照片地址')
    expect(values.get(STATE_STORAGE_KEY)).toBe(saved)
  })

  it('imports a legacy two-city backup without expanding its old secondary footprint', async () => {
    const current = demoVisit('nanjing', 'nj-jiming')
    const visit = { ...current.visits[0], contentVersion: undefined, firstActivation: true, unlockedRegionIds: ['nj-jiming'] }
    const legacy: AppState = { ...current, visits: [visit], unlocks: [{ id: 'local-1:nj-jiming', userId: 'local-1', cityId: 'nanjing',
      regionId: 'nj-jiming', at, visitId: visit.id, source: 'personal' }] }
    expect(isAppState(legacy)).toBe(true)
    const restored = await importBackup(backupFile(legacy))
    expect(getCityProgress(restored).legacyRegionIds).toEqual(['nj-jiming'])
    expect(getCityProgress(restored).unlocked).toBe(0)
    expect(restored.visits[0].contentVersion).toBeUndefined()
    expect(restored.unlocks).toEqual(legacy.unlocks)
  })
})
