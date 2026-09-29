import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLandmark } from '../data/cities'
import { createInitialState, getReplayState, isAppState, normalizeAppState, reducer,
  type AppState, type MapTheme } from './model'
import { exportBackup, getStorageError, importBackup, loadState, saveState, STATE_STORAGE_KEY } from './storage'

const startedAt = 1_000_000
const activationAt = startedAt + 1_000

function recordedState(): AppState {
  const landmark = getLandmark('nj-confucius')!
  let state = reducer(createInitialState(startedAt), { type: 'start-trip', id: 'theme-trip', at: startedAt })
  const position = { lat: landmark.lat, lng: landmark.lng, at: activationAt, accuracy: 5, source: 'demo' as const }
  state = reducer(state, { type: 'set-position', position })
  state = reducer(state, { type: 'check-in', id: 'theme-visit', photoId: 'theme-photo',
    photoUrl: '/images/nanjing.png', landmarkId: landmark.id, at: activationAt })
  state = reducer(state, { type: 'add-point', point: { ...position, id: 'theme-point', tripId: 'theme-trip',
    cityId: 'nanjing', userId: state.profile.id } })
  return reducer(state, { type: 'set-target', landmarkId: 'nj-laomendong' })
}

/** Simulate the existing v1 data exactly: no theme field in state or preferences. */
function oldVersionOne(state = recordedState()): AppState {
  const legacy: AppState = JSON.parse(JSON.stringify(state))
  delete legacy.mapTheme
  for (const preference of Object.values(legacy.preferences)) delete preference.mapTheme
  return legacy
}

class MemoryStorage {
  entries = new Map<string, string>()
  getItem(key: string): string | null { return this.entries.get(key) ?? null }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)) }
  removeItem(key: string): void { this.entries.delete(key) }
  clear(): void { this.entries.clear() }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  saveState(createInitialState(startedAt))
})
afterEach(() => vi.unstubAllGlobals())

describe('map theme preferences leave exploration records intact', () => {
  it('defaults to the C paper theme and keeps the same preference across cities', () => {
    let state = createInitialState(startedAt)
    expect(state.mapTheme).toBe('paper')
    state = reducer(state, { type: 'set-map-theme', theme: 'treasure' })
    state = reducer(state, { type: 'set-city', cityId: 'xian' })
    expect(state.mapTheme).toBe('treasure')
    expect(state.preferences[state.profile.id].mapTheme).toBe('treasure')
    state = reducer(state, { type: 'set-city', cityId: 'nanjing' })
    expect(state.mapTheme).toBe('treasure')
  })

  it('changes only the display preference, preserving rights, photos, target and sampled positions', () => {
    const state = recordedState()
    const themed = reducer(state, { type: 'set-map-theme', theme: 'treasure' })
    expect(themed.mapTheme).toBe('treasure')
    expect(themed.preferences[state.profile.id]).toEqual({ ...state.preferences[state.profile.id], mapTheme: 'treasure' })
    for (const field of ['trips', 'visits', 'unlocks', 'points', 'position'] as const) expect(themed[field]).toBe(state[field])
    expect(themed.targetLandmarkId).toBe(state.targetLandmarkId)
    expect(themed.activeTripId).toBe(state.activeTripId)
    expect(themed.cityId).toBe(state.cityId)
    expect(isAppState(themed)).toBe(true)
  })

  it('restores each account theme and gives an account with no saved theme its own paper default', () => {
    let state = reducer(recordedState(), { type: 'set-map-theme', theme: 'treasure' })
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    expect(state.mapTheme).toBe('paper')
    state = reducer(state, { type: 'set-city', cityId: 'xian' })
    state = reducer(state, { type: 'set-target', landmarkId: 'xa-bell' })
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } })
    expect(state.mapTheme).toBe('treasure')
    expect(state.targetLandmarkId).toBe('nj-laomendong')
    expect(state.activeTripId).toBe('theme-trip')
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    expect(state.mapTheme).toBe('paper')
    expect(state.cityId).toBe('xian')
    expect(state.targetLandmarkId).toBe('xa-bell')
  })

  it('rejects explicit invalid themes in both current and saved account preferences', () => {
    const state = recordedState()
    expect(isAppState({ ...state, mapTheme: 'generated-city' })).toBe(false)
    expect(isAppState({ ...state, mapTheme: null })).toBe(false)
    expect(isAppState({ ...state, preferences: { ...state.preferences,
      'local-2': { cityId: 'xian', activeTripId: null, targetLandmarkId: null, mapTheme: 'generated-city' },
    } })).toBe(false)
    expect(reducer(state, { type: 'set-map-theme', theme: 'generated-city' as MapTheme })).toBe(state)
  })

  it('shows detailed regions only at their recorded activation time in either theme', () => {
    const state = recordedState()
    const themed = reducer(state, { type: 'set-map-theme', theme: 'treasure' })
    expect(getReplayState(themed, 'theme-trip', activationAt - 1).unlockedRegionIds).toEqual([])
    expect(getReplayState(themed, 'theme-trip', activationAt).unlockedRegionIds).toEqual(['nj-qinhuai'])
    for (const cursorAt of [startedAt, activationAt - 1, activationAt, activationAt + 1000]) {
      expect(getReplayState(themed, 'theme-trip', cursorAt)).toEqual(getReplayState(state, 'theme-trip', cursorAt))
    }
  })
})

describe('existing v1 storage and complete backups remain compatible', () => {
  it('normalizes absent themes without mutating legacy records or interpreting them as corruption', () => {
    const legacy = oldVersionOne()
    expect(isAppState(legacy)).toBe(true)
    const normalized = normalizeAppState(legacy)
    expect(normalized.mapTheme).toBe('paper')
    expect(normalized.preferences['local-1'].mapTheme).toBe('paper')
    expect(legacy.mapTheme).toBeUndefined()
    expect(legacy.preferences['local-1'].mapTheme).toBeUndefined()
    expect(normalized.visits).toBe(legacy.visits)
    expect(normalized.unlocks).toBe(legacy.unlocks)
    expect(normalized.points).toBe(legacy.points)
  })

  it('loads existing v1 records with paper while retaining progress, targets and stored photos', () => {
    const legacy = oldVersionOne()
    storage.setItem(STATE_STORAGE_KEY, JSON.stringify(legacy))
    const loaded = loadState()
    expect(loaded.mapTheme).toBe('paper')
    expect(loaded.preferences['local-1'].mapTheme).toBe('paper')
    expect(loaded.visits).toEqual(legacy.visits)
    expect(loaded.unlocks).toEqual(legacy.unlocks)
    expect(loaded.points).toEqual(legacy.points)
    expect(loaded.trips).toEqual(legacy.trips)
    expect(loaded.targetLandmarkId).toBe(legacy.targetLandmarkId)
    expect(loaded.position).toBeNull()
    expect(getStorageError()).toBeNull()
    expect(storage.getItem(`${STATE_STORAGE_KEY}:recovery`)).toBeNull()
  })

  it('imports an old backup without a theme and preserves the original activation and photograph', async () => {
    const legacy = oldVersionOne()
    const file = new Blob([JSON.stringify({ format: 'vesluma-local-backup', version: 1, state: legacy, photos: [] })])
    const restored = await importBackup(file)
    expect(restored.mapTheme).toBe('paper')
    expect(restored.preferences['local-1'].mapTheme).toBe('paper')
    expect(restored.visits).toEqual(legacy.visits)
    expect(restored.unlocks).toEqual(legacy.unlocks)
    expect(restored.points).toEqual(legacy.points)
    expect(restored.activeTripId).toBe('theme-trip')
    expect(restored.targetLandmarkId).toBe('nj-laomendong')
    expect(loadState()).toEqual(restored)
  })

  it('persists each theme through export and import without reactivating any region', async () => {
    let state = reducer(recordedState(), { type: 'set-map-theme', theme: 'treasure' })
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    state = reducer(state, { type: 'set-city', cityId: 'xian' })
    const restored = await importBackup(await exportBackup(state))
    expect(restored.mapTheme).toBe('paper')
    expect(restored.preferences['local-1'].mapTheme).toBe('treasure')
    expect(restored.preferences['local-2'].mapTheme).toBe('paper')
    expect(restored.unlocks).toEqual(state.unlocks)
    expect(restored.visits).toEqual(state.visits)
    expect(reducer(restored, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } }).mapTheme).toBe('treasure')
  })

  it('does not overwrite existing records when a backup explicitly contains an invalid theme', async () => {
    const state = recordedState()
    expect(saveState(state)).toBe(true)
    const prior = storage.getItem(STATE_STORAGE_KEY)
    const file = new Blob([JSON.stringify({ format: 'vesluma-local-backup', version: 1,
      state: { ...state, mapTheme: 'unknown' }, photos: [] })])
    await expect(importBackup(file)).rejects.toThrow('备份格式不匹配')
    expect(storage.getItem(STATE_STORAGE_KEY)).toBe(prior)
  })
})
