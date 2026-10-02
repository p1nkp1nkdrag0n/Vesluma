import type { LocalSpace, SyncOutbox, SyncReply } from './localSync'

export function isLocalSyncOrigin(location: Pick<Location, 'hostname' | 'protocol'>): boolean {
  return (location.protocol === 'http:' || location.protocol === 'https:')
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
}

async function request<T>(space: LocalSpace, path: string, init: RequestInit, parse: (response: Response) => Promise<T>): Promise<T> {
  if (!isLocalSyncOrigin(window.location)) throw new Error('本机同步仅允许访问同源回环地址。')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { ...init.headers, 'X-Vesluma-Space': space, 'X-Vesluma-Local': '1' } })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `本机服务返回 ${response.status}`
      throw new Error(message)
    }
    return await parse(response)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('本机服务响应超时，记录已留在待同步队列。请重试。')
    if (error instanceof TypeError) throw new Error('无法连接本机数据库服务，记录仍在此浏览器；启动服务后会自动重试。')
    throw error
  } finally { clearTimeout(timer) }
}

export const localSyncClient = {
  pull: (space: LocalSpace): Promise<SyncReply> => request(space, '/api/sync', {}, response => response.json()),
  push: (space: LocalSpace, pending: Omit<SyncOutbox, 'photoMap'>): Promise<SyncReply> => request(space, '/api/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending),
  }, response => response.json()),
  uploadPhoto: (space: LocalSpace, id: string, blob: Blob): Promise<void> => request(space, `/api/photos/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob,
  }, async () => undefined),
  downloadPhoto: (space: LocalSpace, id: string): Promise<Blob> => request(space, `/api/photos/${encodeURIComponent(id)}`, {}, response => response.blob()),
}
