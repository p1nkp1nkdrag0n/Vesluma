import { createInitialState, isAppState, normalizeAppState, type AppState } from './model'

export const STATE_STORAGE_KEY = 'vesluma:state:v1'
const DATABASE_NAME = 'vesluma-local-v1'
const PHOTO_STORE = 'photos'
const MAX_PHOTO_BYTES = 25 * 1024 * 1024
const MAX_BACKUP_BYTES = 200 * 1024 * 1024
let databasePromise: Promise<IDBDatabase> | undefined
let lastError: string | null = null
let unrecoveredCorruption = false

export const getStorageError = (): string | null => lastError

export function loadState(): AppState {
  try {
    const raw = globalThis.localStorage?.getItem(STATE_STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed: unknown = JSON.parse(raw)
    if (!isAppState(parsed)) throw new Error('本地记录格式不完整，原始内容已保留为恢复副本。')
    lastError = null
    unrecoveredCorruption = false
    // Device coordinates are only meaningful while freshly obtained. Never claim
    // an old device location is a new sample after a restart.
    return { ...normalizeAppState(parsed), position: null }
  } catch (error) {
    lastError = error instanceof Error ? error.message : '无法读取本地记录。'
    try {
      const raw = globalThis.localStorage?.getItem(STATE_STORAGE_KEY)
      if (raw) globalThis.localStorage.setItem(`${STATE_STORAGE_KEY}:recovery`, raw)
    } catch {
      unrecoveredCorruption = true
      lastError = '本地记录读取失败且恢复副本无法写入；自动保存已停止，原始记录仍保留。'
    }
    return createInitialState()
  }
}

export function saveState(state: AppState): boolean {
  try {
    if (unrecoveredCorruption) throw new Error('原始记录尚未安全备份，自动保存已停止。')
    if (!isAppState(state)) throw new Error('记录校验失败，未写入本地存储。')
    if (!globalThis.localStorage) throw new Error('此环境未提供本地存储。')
    globalThis.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
    lastError = null
    return true
  } catch (error) {
    lastError = error instanceof Error ? error.message : '本地保存失败，请导出备份。'
    return false
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此环境不支持照片本地存储。')); return }
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PHOTO_STORE)) request.result.createObjectStore(PHOTO_STORE)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => { database.close(); databasePromise = undefined }
      resolve(database)
    }
    request.onerror = () => reject(new Error('无法打开照片存储，请检查浏览器权限或可用空间。'))
    request.onblocked = () => reject(new Error('照片存储被另一个窗口占用，请关闭旧窗口后重试。'))
  }).catch((error: unknown) => { databasePromise = undefined; throw error })
  return databasePromise
}

function validatePhoto(id: string, blob: Blob): void {
  if (!id || typeof id !== 'string' || id.length > 200) throw new Error('照片标识无效。')
  if (!(blob instanceof Blob) || !/^image\//i.test(blob.type)) throw new Error('请选择一张图片。')
  if (!blob.size) throw new Error('图片内容为空。')
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('图片超过 25 MB，请选用较小的图片。')
}

/** Resolve only after the IndexedDB write transaction is durably committed. */
export async function savePhoto(id: string, blob: Blob): Promise<void> {
  validatePhoto(id, blob)
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE, 'readwrite')
    transaction.objectStore(PHOTO_STORE).put(blob, id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('照片未能保存，请检查可用空间后重试。'))
    transaction.onabort = () => reject(new Error('照片保存中断，请重试。'))
  })
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE, 'readonly')
    const request = transaction.objectStore(PHOTO_STORE).get(id)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined)
    request.onerror = () => reject(new Error('无法读取这张本地照片。'))
    transaction.onabort = () => reject(new Error('照片读取中断。'))
  })
}

export async function deletePhoto(id: string): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE, 'readwrite')
    transaction.objectStore(PHOTO_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('照片删除失败。'))
    transaction.onabort = () => reject(new Error('照片删除中断。'))
  })
}

interface BackupPhoto { id: string; data: string; type: string }
interface Backup { format: 'vesluma-local-backup'; version: 1; exportedAt: string; state: AppState; photos: BackupPhoto[] }

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('照片备份转换失败。'))
    reader.onerror = () => reject(new Error('照片备份读取失败。'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(photo: BackupPhoto): Blob {
  if (typeof photo.id !== 'string' || typeof photo.data !== 'string' || typeof photo.type !== 'string') throw new Error('备份照片格式无效。')
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(photo.data)
  if (!match || match[1] !== photo.type || match[2].length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4) throw new Error('备份照片格式或大小无效。')
  const decoded = atob(match[2])
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  const blob = new Blob([bytes], { type: photo.type })
  validatePhoto(photo.id, blob)
  return blob
}

/** Local manual backup, including uploaded photos; it provides no cloud service. */
export async function exportBackup(state = loadState()): Promise<Blob> {
  if (!isAppState(state)) throw new Error('无法导出无效的旅行记录。')
  const photoIds = [...new Set(state.visits.filter((visit) => !visit.photoUrl).map((visit) => visit.photoId))]
  const photos: BackupPhoto[] = []
  for (const id of photoIds) {
    const blob = await getPhotoBlob(id)
    if (!blob) throw new Error('有照片未能读取，备份尚未完成。请检查原浏览器存储。')
    photos.push({ id, type: blob.type, data: await blobToDataUrl(blob) })
  }
  const backup: Backup = { format: 'vesluma-local-backup', version: 1, exportedAt: new Date().toISOString(), state, photos }
  const file = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  if (file.size > MAX_BACKUP_BYTES) throw new Error('备份超过 200 MB，请减少照片大小后重试。')
  return file
}

export async function importBackup(file: Blob): Promise<AppState> {
  if (!(file instanceof Blob) || file.size > MAX_BACKUP_BYTES) throw new Error('请选择不超过 200 MB 的 Vesluma 备份。')
  let backup: Backup
  try { backup = JSON.parse(await file.text()) as Backup } catch { throw new Error('备份文件不是有效的 JSON。') }
  if (backup?.format !== 'vesluma-local-backup' || backup.version !== 1 || !isAppState(backup.state) || !Array.isArray(backup.photos)) {
    throw new Error('备份格式不匹配，当前记录未被替换。')
  }
  const state = normalizeAppState(backup.state)
  if (state.visits.some((visit) => visit.photoUrl && (!visit.demo || !/^\/images\/(?:nanjing|xian)\.png$/.test(visit.photoUrl)))) {
    throw new Error('备份含不支持的外部照片地址。')
  }
  const requiredPhotoIds = [...new Set(state.visits.filter((visit) => !visit.photoUrl).map((visit) => visit.photoId))]
  const providedPhotoIds = backup.photos.map((photo) => photo?.id)
  if (new Set(providedPhotoIds).size !== providedPhotoIds.length || requiredPhotoIds.some((id) => !providedPhotoIds.includes(id))
    || providedPhotoIds.some((id) => !requiredPhotoIds.includes(id))) throw new Error('备份照片缺失或重复，当前记录未被替换。')
  const decoded = backup.photos.map((photo) => ({ id: photo.id, blob: dataUrlToBlob(photo) }))
  // A single transaction imports the photo set atomically. State metadata changes
  // only after every photo succeeds. Remap ids so a failed metadata save never
  // overwrites photographs referenced by the previous local state.
  const importPrefix = `import-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
  const remappedIds = new Map(decoded.map((photo, index) => [photo.id, `${importPrefix}-${index}`]))
  if (decoded.length) {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PHOTO_STORE, 'readwrite')
      for (const photo of decoded) transaction.objectStore(PHOTO_STORE).put(photo.blob, remappedIds.get(photo.id)!)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('备份照片写入失败，当前记录未被替换。'))
      transaction.onabort = () => reject(new Error('备份照片写入中断，当前记录未被替换。'))
    })
  }
  const restored: AppState = { ...state, position: null, visits: state.visits.map((visit) => ({ ...visit,
    photoId: remappedIds.get(visit.photoId) ?? visit.photoId })) }
  const wasUnrecovered = unrecoveredCorruption
  unrecoveredCorruption = false // Explicit valid import authorizes replacing old state.
  if (!saveState(restored)) {
    unrecoveredCorruption = wasUnrecovered
    throw new Error(getStorageError() ?? '恢复记录失败，当前记录未被替换。')
  }
  return restored
}
