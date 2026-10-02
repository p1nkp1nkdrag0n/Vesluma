import { createId, type AppState } from './model'
import { applySyncSnapshot, projectSyncState, snapshotFingerprint, validateSyncSnapshot, type SyncSnapshot } from './syncProtocol'

export const LOCAL_SYNC_STORAGE_KEY = 'vesluma:local-sync:v1'
export const LOCAL_SYNC_BACKUP_KEY = 'vesluma:before-local-sync:v1'
export type LocalSpace = 'local-a' | 'local-b'
export interface SyncReply { revision: number; snapshot: SyncSnapshot }
export interface SyncOutbox {
  requestId: string
  clientId: string
  sequence: number
  snapshot: SyncSnapshot
  photoMap: Record<string, string>
}
export interface LocalSyncSettings {
  version: 1
  enabled: boolean
  space: LocalSpace | null
  clientId: string
  sequence: number
  revision: number
  acknowledgedFingerprint: string | null
  outbox: SyncOutbox | null
  pausedForImport?: boolean
}
export interface LocalSyncStatus {
  enabled: boolean
  available: boolean
  space: LocalSpace | null
  phase: 'disabled' | 'pending' | 'syncing' | 'synced' | 'error'
  pending: boolean
  error: string | null
  lastSuccessAt: number | null
  pausedForImport: boolean
}
export interface LocalSyncIO {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  available: boolean
  getState: () => AppState
  /** Must durably save metadata before updating the current in-memory state. */
  commitState: (state: AppState) => void
  backup: () => string
  getPhoto: (id: string) => Promise<Blob | undefined>
  savePhoto: (id: string, blob: Blob) => Promise<void>
  pull: (space: LocalSpace) => Promise<SyncReply>
  push: (space: LocalSpace, request: Omit<SyncOutbox, 'photoMap'>) => Promise<SyncReply>
  uploadPhoto: (space: LocalSpace, id: string, blob: Blob) => Promise<void>
  downloadPhoto: (space: LocalSpace, id: string) => Promise<Blob>
  now?: () => number
  id?: () => string
}

const isSpace = (value: unknown): value is LocalSpace => value === 'local-a' || value === 'local-b'
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0

function parseSettings(raw: string): LocalSyncSettings {
  const value = JSON.parse(raw) as LocalSyncSettings
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' || !validId(value.clientId)
    || !(value.space === null || isSpace(value.space)) || (value.enabled && !value.space)
    || !integer(value.sequence) || !integer(value.revision)
    || !(value.acknowledgedFingerprint === null || typeof value.acknowledgedFingerprint === 'string')
    || !(value.pausedForImport === undefined || typeof value.pausedForImport === 'boolean')) throw new Error('同步设置损坏，原始队列已保留；请先导出本地备份。')
  if (value.outbox !== null) {
    const pending = value.outbox
    if (!pending || !validId(pending.requestId) || pending.clientId !== value.clientId || !integer(pending.sequence)
      || pending.sequence < 1 || pending.sequence > value.sequence || !pending.photoMap || typeof pending.photoMap !== 'object' || Array.isArray(pending.photoMap)) throw new Error('待同步队列损坏，原始内容已保留；请先导出本地备份。')
    pending.snapshot = validateSyncSnapshot(pending.snapshot)
    for (const visit of pending.snapshot.visits) {
      const photoId = pending.photoMap[visit.photoId]
      if (!visit.photoUrl && (typeof photoId !== 'string' || !photoId.length || photoId.length > 200)) throw new Error('待同步照片索引不完整，原始队列已保留。')
    }
  }
  return value
}

/** A serial, durable outbox. Network failures never acknowledge local progress. */
export class LocalSyncEngine {
  private settings: LocalSyncSettings
  private status: LocalSyncStatus
  private listeners = new Set<() => void>()
  private busy = false
  private generation = 0
  private blocked = false

  constructor(private readonly io: LocalSyncIO) {
    this.settings = { version: 1, enabled: false, space: null, clientId: this.newId(), sequence: 0,
      revision: 0, acknowledgedFingerprint: null, outbox: null }
    let error: string | null = null
    try {
      const raw = io.storage.getItem(LOCAL_SYNC_STORAGE_KEY)
      if (raw) this.settings = parseSettings(raw)
    } catch (cause) { this.blocked = true; error = this.errorMessage(cause) }
    this.status = { enabled: this.settings.enabled, available: io.available, space: this.settings.space,
      phase: error ? 'error' : this.settings.enabled ? 'pending' : 'disabled', pending: !!this.settings.outbox,
      error, lastSuccessAt: null, pausedForImport: !!this.settings.pausedForImport }
  }

  private newId(): string { return this.io.id?.() ?? createId('sync') }
  private errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : '同步暂未完成，请稍后重试。' }
  getStatus = (): LocalSyncStatus => this.status
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private report(patch: Partial<LocalSyncStatus>): void {
    this.status = { ...this.status, enabled: this.settings.enabled, space: this.settings.space, pausedForImport: !!this.settings.pausedForImport, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private persist(settings: LocalSyncSettings): void {
    this.io.storage.setItem(LOCAL_SYNC_STORAGE_KEY, JSON.stringify(settings))
    this.settings = settings
  }

  enable(space: LocalSpace): void {
    try {
      if (this.blocked) throw new Error('同步设置无法安全读取，原始队列已保留；请先导出本地备份。')
      if (!this.io.available) throw new Error('本机同步仅在 localhost 或 127.0.0.1 页面可用。')
      if (!isSpace(space)) throw new Error('请选择有效的本机资料空间。')
      if (this.settings.space && this.settings.space !== space) throw new Error('此浏览器已绑定另一资料空间，不能直接改绑。')
      // If backup storage fails, no binding, outbox or network request is started.
      if (this.io.storage.getItem(LOCAL_SYNC_BACKUP_KEY) === null) this.io.storage.setItem(LOCAL_SYNC_BACKUP_KEY, this.io.backup())
      this.persist({ ...this.settings, enabled: true, space, pausedForImport: false })
      this.report({ phase: 'pending', error: null })
      this.capture()
    } catch (cause) { this.report({ phase: 'error', error: this.errorMessage(cause) }) }
  }

  disable(): void {
    try {
      this.persist({ ...this.settings, enabled: false })
      this.generation++
      this.report({ phase: 'disabled', error: null })
    } catch (cause) { this.report({ phase: 'error', error: this.errorMessage(cause) }) }
  }

  pauseForImport(): boolean {
    if (!this.settings.space) return true
    try {
      this.persist({ ...this.settings, enabled: false, pausedForImport: true })
      this.generation++
      this.report({ phase: 'disabled', error: null })
      return true
    } catch (cause) {
      this.report({ phase: 'error', error: this.errorMessage(cause) })
      return false
    }
  }

  /** Called only for progress changes, never for continuous GPS samples. */
  capture(): void {
    if (!this.settings.enabled || this.blocked || !this.io.available) return
    try {
      const pending = this.ensureOutbox()
      this.report({ pending, ...(!this.busy && !this.status.error && pending ? { phase: 'pending' as const } : {}) })
    } catch (cause) { this.report({ phase: 'error', pending: true, error: this.errorMessage(cause) }) }
  }

  private ensureOutbox(): boolean {
    if (this.settings.outbox) return true
    const state = this.io.getState()
    const snapshot = projectSyncState(state)
    if (snapshotFingerprint(snapshot) === this.settings.acknowledgedFingerprint) return false
    const photoMap: Record<string, string> = {}
    const localVisits = new Map(state.visits.map(visit => [visit.id, visit]))
    for (const visit of snapshot.visits) {
      if (!visit.photoUrl) photoMap[visit.photoId] = localVisits.get(visit.id)!.photoId
    }
    const sequence = this.settings.sequence + 1
    this.persist({ ...this.settings, sequence, outbox: { requestId: this.newId(), clientId: this.settings.clientId, sequence, snapshot, photoMap } })
    return true
  }

  async sync(): Promise<void> {
    if (this.busy || this.blocked || !this.io.available || !this.settings.enabled || !this.settings.space) return
    this.busy = true
    const generation = this.generation
    const current = () => generation === this.generation && this.settings.enabled
    const space = this.settings.space
    this.report({ phase: 'syncing', error: null })
    try {
      this.ensureOutbox()
      const pending = this.settings.outbox
      let reply: SyncReply
      if (pending) {
        for (const visit of pending.snapshot.visits) {
          if (visit.photoUrl) continue
          let blob = await this.io.getPhoto(pending.photoMap[visit.photoId])
          if (!current()) return
          if (!blob) {
            // Metadata can survive browser eviction of IndexedDB. Recover the
            // previously uploaded photograph before replaying its request.
            blob = await this.io.downloadPhoto(space, visit.photoId)
            if (!current()) return
            await this.io.savePhoto(pending.photoMap[visit.photoId], blob)
            if (!current()) return
          }
          await this.io.uploadPhoto(space, visit.photoId, blob)
          if (!current()) return
        }
        const { photoMap: _photoMap, ...request } = pending
        reply = await this.io.push(space, request)
      } else reply = await this.io.pull(space)
      if (!current()) return
      if (!integer(reply.revision) || reply.revision < this.settings.revision) throw new Error('收到旧版本同步响应，未覆盖当前进度；请重试。')
      const snapshot = validateSyncSnapshot(reply.snapshot)
      for (const visit of snapshot.visits) {
        if (visit.photoUrl) continue
        const localId = this.io.getState().visits.find(item => item.id === visit.id)?.photoId ?? visit.photoId
        if (!await this.io.getPhoto(localId)) {
          if (!current()) return
          const blob = await this.io.downloadPhoto(space, visit.photoId)
          if (!current()) return
          await this.io.savePhoto(localId, blob)
        }
        if (!current()) return
      }
      // Read after every async operation: check-ins created while waiting survive.
      const latest = this.io.getState()
      const next = applySyncSnapshot(latest, snapshot)
      this.io.commitState(JSON.stringify(next) === JSON.stringify(latest) ? latest : next)
      // A failed settings write leaves the request intact for identical replay.
      this.persist({ ...this.settings, revision: reply.revision, acknowledgedFingerprint: snapshotFingerprint(snapshot), outbox: null })
      const more = this.ensureOutbox()
      this.report({ phase: more ? 'pending' : 'synced', pending: more, error: null, lastSuccessAt: this.io.now?.() ?? Date.now() })
    } catch (cause) {
      if (current()) this.report({ phase: 'error', pending: !!this.settings.outbox || this.status.pending, error: this.errorMessage(cause) })
    } finally { this.busy = false }
  }

  /** In-flight replies are ignored; the durable queue is retained for remount. */
  cancel(): void { this.generation++ }
}
