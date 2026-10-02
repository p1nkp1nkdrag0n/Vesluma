import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalSyncOrigin, localSyncClient } from './localSyncClient'
import { emptySyncSnapshot } from './syncProtocol'

beforeEach(() => vi.stubGlobal('window', { location: { hostname: '127.0.0.1', protocol: 'http:' } }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('same-origin loopback sync transport', () => {
  it.each(['127.0.0.1', 'localhost'])('allows the exact loopback hostname %s', hostname => {
    expect(isLocalSyncOrigin({ hostname, protocol: 'http:' })).toBe(true)
  })

  it.each(['127.0.0.1.example.com', 'localhost.evil', '192.168.1.5', 'example.com', 'localhost.'])('rejects nonlocal hostname %s', hostname => {
    expect(isLocalSyncOrigin({ hostname, protocol: 'https:' })).toBe(false)
  })

  it('rejects native or file origins before any network access', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol: 'capacitor:' } })
    await expect(localSyncClient.pull('local-a')).rejects.toThrow('同源回环')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses a relative API URL and fixed local marker with no credentials, cache, or redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: 0, snapshot: emptySyncSnapshot() })))
    vi.stubGlobal('fetch', fetch)
    await localSyncClient.pull('local-b')
    expect(fetch).toHaveBeenCalledWith('/api/sync', expect.objectContaining({
      cache: 'no-store', redirect: 'error', credentials: 'omit', headers: { 'X-Vesluma-Space': 'local-b', 'X-Vesluma-Local': '1' },
    }))
  })

  it('sends only the saved request envelope, never the local photo map', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: 1, snapshot: emptySyncSnapshot() })))
    vi.stubGlobal('fetch', fetch)
    const request = { requestId: 'request-1', clientId: 'client-1', sequence: 1, snapshot: emptySyncSnapshot() }
    await localSyncClient.push('local-a', request)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(request)
  })

  it('reports service unavailability without losing the retry intent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(localSyncClient.pull('local-a')).rejects.toThrow('启动服务后会自动重试')
  })

  it('surfaces a server conflict rather than claiming a successful sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Conflicting evidence', code: 'SYNC_CONFLICT' }), { status: 409 })))
    await expect(localSyncClient.pull('local-a')).rejects.toThrow('Conflicting evidence')
  })

  it('aborts requests that never complete and gives a recoverable timeout message', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = expect(localSyncClient.pull('local-a')).rejects.toThrow('响应超时')
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
  })
})
