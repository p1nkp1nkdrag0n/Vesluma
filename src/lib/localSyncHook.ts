import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { AppState } from './model'
import { LocalSyncEngine, type LocalSpace } from './localSync'
import { isLocalSyncOrigin, localSyncClient } from './localSyncClient'
import { getPhotoBlob, savePhoto, saveState, getStorageError, STATE_STORAGE_KEY } from './storage'

export function useLocalSync(state: AppState, stateRef: RefObject<AppState>, applyState: (state: AppState) => void) {
  const [engine] = useState(() => new LocalSyncEngine({
    // Read inside methods so browsers denying localStorage show an error, not a blank app.
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    available: isLocalSyncOrigin(window.location), getState: () => stateRef.current,
    commitState: next => { if (!saveState(next)) throw new Error(getStorageError() ?? '同步记录尚未保存，请重试。'); applyState(next) },
    backup: () => localStorage.getItem(STATE_STORAGE_KEY) ?? JSON.stringify(stateRef.current),
    getPhoto: getPhotoBlob, savePhoto, ...localSyncClient,
  }))
  const status = useSyncExternalStore(engine.subscribe, engine.getStatus)
  useEffect(() => {
    const run = () => { void engine.sync() }
    const timer = setInterval(run, 5_000)
    window.addEventListener('online', run)
    window.addEventListener('focus', run)
    run()
    return () => { clearInterval(timer); window.removeEventListener('online', run); window.removeEventListener('focus', run); engine.cancel() }
  }, [engine])
  useEffect(() => {
    engine.capture()
    const timer = setTimeout(() => { void engine.sync() }, 700)
    return () => clearTimeout(timer)
  }, [engine, state.profiles, state.trips, state.visits, state.unlocks])
  return { status, enable: (space: LocalSpace) => { engine.enable(space); void engine.sync() },
    disable: () => engine.disable(), pauseForImport: () => engine.pauseForImport(), retry: () => { void engine.sync() } }
}

export type LocalSyncControls = ReturnType<typeof useLocalSync>
