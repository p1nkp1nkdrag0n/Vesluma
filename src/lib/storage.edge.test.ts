import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from './model'
import { getStorageError, importBackup, loadState, saveState, STATE_STORAGE_KEY } from './storage'

class MemoryStorage {
  entries = new Map<string, string>()
  failWrites = false
  getItem(key: string): string | null { return this.entries.get(key) ?? null }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('Storage quota exceeded')
    this.entries.set(key, String(value))
  }
  removeItem(key: string): void { this.entries.delete(key) }
  clear(): void { this.entries.clear() }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
})
afterEach(() => vi.unstubAllGlobals())

describe('local storage recovery', () => {
  it('keeps a recovery copy of corrupt JSON before starting an empty state', () => {
    const raw = '{"version":1,"trips":['
    storage.setItem(STATE_STORAGE_KEY, raw)
    const state = loadState()
    expect(state.trips).toEqual([])
    expect(storage.getItem(`${STATE_STORAGE_KEY}:recovery`)).toBe(raw)
    expect(getStorageError()).not.toBeNull()
  })

  it('does not reinterpret a saved device coordinate as a new sample', () => {
    const state = createInitialState(1000)
    state.locationMode = 'device'
    state.position = { ...state.position!, source: 'device' }
    expect(saveState(state)).toBe(true)
    const loaded = loadState()
    expect(loaded.position).toBeNull()
    expect(loaded.points).toEqual([])
  })

  it('leaves the prior metadata intact when a save fails', () => {
    const state = createInitialState(1000)
    expect(saveState(state)).toBe(true)
    const prior = storage.getItem(STATE_STORAGE_KEY)
    storage.failWrites = true
    expect(saveState({ ...state, profile: { ...state.profile, name: 'Changed' } })).toBe(false)
    expect(storage.getItem(STATE_STORAGE_KEY)).toBe(prior)
    expect(getStorageError()).toContain('quota')
  })
})

describe('manual backup import', () => {
  it('rejects malformed JSON without replacing current records', async () => {
    const state = createInitialState(1000)
    saveState(state)
    const prior = storage.getItem(STATE_STORAGE_KEY)
    await expect(importBackup(new Blob(['{broken']))).rejects.toThrow('JSON')
    expect(storage.getItem(STATE_STORAGE_KEY)).toBe(prior)
  })

  it('rejects an unexpected photo set before opening IndexedDB', async () => {
    const state = createInitialState(1000)
    saveState(state)
    const prior = storage.getItem(STATE_STORAGE_KEY)
    const file = new Blob([JSON.stringify({ format: 'vesluma-local-backup', version: 1, state,
      photos: [{ id: 'unreferenced', type: 'image/png', data: 'data:image/png;base64,AQ==' }],
    })])
    await expect(importBackup(file)).rejects.toThrow('照片缺失或重复')
    expect(storage.getItem(STATE_STORAGE_KEY)).toBe(prior)
  })

  it('reports failed metadata restoration without claiming imported success', async () => {
    const state = createInitialState(1000)
    saveState(state)
    const prior = storage.getItem(STATE_STORAGE_KEY)
    storage.failWrites = true
    const file = new Blob([JSON.stringify({ format: 'vesluma-local-backup', version: 1, state, photos: [] })])
    await expect(importBackup(file)).rejects.toThrow('quota')
    expect(storage.getItem(STATE_STORAGE_KEY)).toBe(prior)
  })
})
