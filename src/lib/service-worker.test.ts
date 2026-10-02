import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function worker(fetchMock: typeof fetch, cached?: Response, cacheFailure = false, varyByOrigin = false) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const put = vi.fn().mockResolvedValue(undefined);
  const cache = { match: vi.fn().mockImplementation(async (request: Request | string, options?: CacheQueryOptions) => {
    if (varyByOrigin && typeof request !== 'string' && request.headers.get('Origin') && !options?.ignoreVary) return undefined;
    return cached?.clone();
  }), put, keys: vi.fn().mockResolvedValue([]) };
  const open = vi.fn().mockImplementation(async () => {
    if (cacheFailure) throw new Error('Cache storage unavailable');
    return cache;
  });
  runInNewContext(workerSource, {
    self: { location: { origin: 'https://vesluma.test' }, addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } },
    caches: { open }, fetch: fetchMock, URL, Response, AbortController, setTimeout, clearTimeout,
  });
  const pending: Promise<unknown>[] = [];
  function navigate() {
    let response!: Promise<Response>;
    listeners.fetch({ request: { url: 'https://vesluma.test/', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    return response;
  }
  function resource(url = 'https://vesluma.test/assets/index-hash.js') {
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url, method: 'GET', mode: 'cors', headers: new Headers({ Origin: 'https://vesluma.test' }) },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    return response;
  }
  return { navigate, resource, pending, put, open };
}

afterEach(() => { vi.useRealTimers(); });

describe('service worker navigation recovery', () => {
  it.each([500, 503, 404])('opens the current cached app when HTML returns %s', async status => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('server failure', { status }));
    const app = worker(fetchMock, new Response('cached app'));
    expect(await (await app.navigate()).text()).toBe('cached app');
    expect(app.open).toHaveBeenCalledWith('vesluma-shell-v6');
    expect(app.put).not.toHaveBeenCalled();
  });

  it('opens the cached app offline', async () => {
    const app = worker(vi.fn().mockRejectedValue(new TypeError('offline')), new Response('cached app'));
    expect(await (await app.navigate()).text()).toBe('cached app');
  });

  it('bounds a stalled navigation and does not replace the cache with its late response', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const app = worker(fetchMock, new Response('cached app'));
    const navigation = app.navigate();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await (await navigation).text()).toBe('cached app');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    finish(new Response('late app'));
    await vi.runAllTimersAsync();
    expect(app.put).not.toHaveBeenCalled();
  });

  it('returns a healthy network response and refreshes the cache without delaying navigation', async () => {
    const network = new Response('new app');
    Object.defineProperty(network, 'type', { value: 'basic' });
    const app = worker(vi.fn().mockResolvedValue(network), new Response('cached app'));
    expect(await (await app.navigate()).text()).toBe('new app');
    await Promise.all(app.pending);
    expect(app.put).toHaveBeenCalledTimes(1);
    expect(app.put.mock.calls[0][0]).toBe('/index.html');
    expect(await app.put.mock.calls[0][1].text()).toBe('new app');
  });

  it('also falls back when healthy HTML headers arrive but its body stalls', async () => {
    vi.useFakeTimers();
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }));
    const fetchMock = vi.fn().mockResolvedValue(response);
    const app = worker(fetchMock, new Response('cached app'));
    const navigation = app.navigate();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await (await navigation).text()).toBe('cached app');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    body.enqueue(new TextEncoder().encode('late body'));
    body.close();
    await vi.runAllTimersAsync();
    expect(app.put).not.toHaveBeenCalled();
  });

  it('does not cut off an uncached slow first load and still works when cache storage is unavailable', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const app = worker(fetchMock, undefined, true);
    const navigation = app.navigate();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    finish(new Response('first app'));
    expect(await (await navigation).text()).toBe('first app');
  });

  it('serves precached static modules offline despite their Vary Origin request difference', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    const app = worker(fetchMock, new Response('cached module', { headers: { Vary: 'Origin' } }), false, true);
    expect(await (await app.resource())!.text()).toBe('cached module');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never applies the static cache path to APIs or remote map tiles', () => {
    const fetchMock = vi.fn();
    const app = worker(fetchMock, new Response('cached module'));
    expect(app.resource('https://vesluma.test/api/records')).toBeUndefined();
    expect(app.resource('https://tile.openstreetmap.org/10/100/100.png')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(app.open).not.toHaveBeenCalled();
  });
});
