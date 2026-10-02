import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://vesluma.test';
const shellName = 'vesluma-shell-v8';
const mapsName = 'vesluma-maps-v1';
const orderPath = '/__vesluma_map_lru__';
const snapshots = ['nanjing-aaa.json', 'xian-bbb.json', 'beijing.json-zKQGpKMN.gz', 'shanghai.json-C-fEtP8b.gz', 'hangzhou.json-EE_123ab.gz', 'chengdu.json-fff12345.gz', 'guangzhou.json-ggg12345.gz', 'shenzhen.json-hhh12345.gz', 'hongkong.json-iii12345.gz', 'macau.json-jjj12345.gz'].map(path => `/assets/${path}`);
const manifest = { 'index.html': { file: 'assets/index-hash.js', css: ['assets/app-hash.css'], assets: snapshots.map(path => path.slice(1)) },
  ignoredRemote: { file: 'https://remote.example/assets/remote.json-abcdef12.gz' }, ignoredApi: { file: 'api/private.json-abcdef12.gz' }, ignoredOther: { file: 'assets/private.db.gz' } };

class MemoryCache {
  entries = new Map<string, Response>();
  constructor(private varyByOrigin = false) {}
  private path = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, origin).pathname;
  match = vi.fn(async (request: Request | string, options?: CacheQueryOptions) => {
    if (this.varyByOrigin && typeof request !== 'string' && request.headers.get('Origin') && !options?.ignoreVary) return undefined;
    return this.entries.get(this.path(request))?.clone();
  });
  put = vi.fn(async (request: Request | string, response: Response) => { this.entries.set(this.path(request), response.clone()); });
  delete = vi.fn(async (request: Request | string) => this.entries.delete(this.path(request)));
  keys = vi.fn(async () => [...this.entries.keys()].map(path => new Request(`${origin}${path}`)));
  addAll = vi.fn(async (paths: string[]) => { for (const path of paths) this.entries.set(path, new Response('public asset')); });
}

function worker(fetchMock: typeof fetch, cached?: Response, cacheFailure = false, varyByOrigin = false) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const stores = new Map<string, MemoryCache>();
  const cacheFor = (name: string) => { let cache = stores.get(name); if (!cache) { cache = new MemoryCache(varyByOrigin); stores.set(name, cache); } return cache; };
  const shell = cacheFor(shellName);
  shell.entries.set('/.vite/manifest.json', Response.json(manifest));
  if (cached) for (const path of ['/', '/index.html', '/assets/index-hash.js']) shell.entries.set(path, cached.clone());
  const open = vi.fn().mockImplementation(async (name: string) => {
    if (cacheFailure) throw new Error('Cache storage unavailable');
    return cacheFor(name);
  });
  const client = { url: `${origin}/`, postMessage: vi.fn() };
  const claim = vi.fn().mockResolvedValue(undefined);
  runInNewContext(workerSource, {
    self: { location: { origin }, skipWaiting, clients: { get: async () => client, claim },
      addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } },
    caches: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
    fetch: fetchMock, URL, Response, Headers, ArrayBuffer, AbortController, setTimeout, clearTimeout,
  });
  const pending: Promise<unknown>[] = [];
  function install() {
    let installation!: Promise<unknown>;
    listeners.install({ waitUntil: (value: Promise<unknown>) => { installation = value; } });
    return installation;
  }
  function activate() {
    let activation!: Promise<unknown>;
    listeners.activate({ waitUntil: (value: Promise<unknown>) => { activation = value; } });
    return activation;
  }
  function message(data: unknown, source = client, ports: Array<{ postMessage: (data: unknown) => void }> = []) {
    let handled: Promise<unknown> | undefined;
    listeners.message({ data, source, ports, waitUntil: (value: Promise<unknown>) => { handled = value; } });
    return handled;
  }
  const handoff = (url: string, body: ArrayBuffer = new TextEncoder().encode('validated city').buffer) => message({ type: 'VESLUMA_CACHE_MAP', url, body, contentType: 'application/json' });
  function navigate() {
    let response!: Promise<Response>;
    listeners.fetch({ request: { url: 'https://vesluma.test/', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    return response;
  }
  function resource(url = 'https://vesluma.test/assets/index-hash.js', cache = 'default', mode = 'cors', retry = false) {
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url, method: 'GET', mode, cache, headers: new Headers({ Origin: 'https://vesluma.test', ...(retry ? { 'X-Vesluma-Map-Retry': '1' } : {}) }) }, clientId: 'test-client',
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    return response;
  }
  return { navigate, resource, install, activate, message, handoff, pending, put: shell.put, open, addAll: shell.addAll, skipWaiting, cacheFor, stores, client, claim };
}

afterEach(() => { vi.useRealTimers(); });

function installFetch() {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === '/index.html') return new Response('<script src="/assets/index-hash.js"></script><link href="/assets/app-hash.css" rel="stylesheet">');
    if (url === '/.vite/manifest.json') return Response.json(manifest);
    throw new Error(`Unexpected install request: ${url}`);
  });
}

describe('bounded, on-demand offline maps', () => {
  it('acknowledges the cache protocol only to a same-origin client before body transfer', () => {
    const app = worker(vi.fn());
    const reply = { postMessage: vi.fn() };
    app.message({ type: 'VESLUMA_MAP_CACHE_READY' }, app.client, [reply]);
    expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith({ version: 1 });
    reply.postMessage.mockClear();
    app.message({ type: 'VESLUMA_MAP_CACHE_READY' }, { url: 'https://external.example/', postMessage: vi.fn() }, [reply]);
    expect(reply.postMessage).not.toHaveBeenCalled();
    expect(app.open).not.toHaveBeenCalled();
  });
  it('installs the app and small city artwork without fetching or precaching any city snapshot', async () => {
    const fetchMock = installFetch();
    const app = worker(fetchMock);
    await app.install();
    const paths = app.addAll.mock.calls[0][0];
    expect(paths).toContain('/assets/index-hash.js');
    expect(paths).toContain('/images/macau.png');
    expect(paths.some(path => /\.json|\.gz|\/api\/|remote\.example/.test(path))).toBe(false);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/index.html', '/.vite/manifest.json']);
    expect(app.skipWaiting).toHaveBeenCalledOnce();
    expect(app.stores.has(mapsName)).toBe(false);
  });

  it('still refuses activation when an essential shell resource fails', async () => {
    const app = worker(installFetch());
    app.addAll.mockRejectedValueOnce(new Error('App CSS unavailable'));
    await expect(app.install()).rejects.toThrow('App CSS unavailable');
    expect(app.skipWaiting).not.toHaveBeenCalled();
  });

  it.each([Uint8Array.from([31, 139, 8, 0, 1, 2, 3, 4]), new TextEncoder().encode('{"type":"FeatureCollection"}')])('stores a validated initial uncontrolled response without a second download, preserving its bytes', async bytes => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    const app = worker(fetchMock);
    await app.handoff(snapshots[2], bytes.buffer);
    expect(fetchMock).not.toHaveBeenCalled();
    const response = await app.resource(`${origin}${snapshots[2]}`);
    expect(response?.headers.get('X-Vesluma-Map-Cache')).toBe('hit');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(bytes);
    expect(app.client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'beijing', status: 'cached' }));
  });

  it('does not cache even HTTP 200 map bytes until the loader validates them, so malformed JSON can be retried', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{broken')).mockResolvedValueOnce(new Response('valid second attempt'));
    const app = worker(fetchMock);
    expect(await (await app.resource(`${origin}${snapshots[0]}`))!.text()).toBe('{broken');
    expect(app.cacheFor(mapsName).entries.has(snapshots[0])).toBe(false);
    expect(await (await app.resource(`${origin}${snapshots[0]}`, 'reload', 'cors', true))!.text()).toBe('valid second attempt');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(app.cacheFor(mapsName).entries.has(snapshots[0])).toBe(false);
  });

  it('serves an HTTP-decoded cached body without advertising a second gzip decode', async () => {
    const app = worker(vi.fn());
    app.cacheFor(mapsName).entries.set(snapshots[2], new Response('{"decoded":true}', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '999' } }));
    const response = await app.resource(`${origin}${snapshots[2]}`);
    expect(response?.headers.get('Content-Encoding')).toBeNull();
    expect(response?.headers.get('Content-Length')).toBeNull();
    expect(await response!.json()).toEqual({ decoded: true });
  });

  it.each(['reload', 'no-store'])('still serves the validated offline map when the browser sets HTTP cache mode %s', async mode => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    const app = worker(fetchMock);
    await app.handoff(snapshots[0], new TextEncoder().encode('validated offline map').buffer);
    const response = await app.resource(`${origin}${snapshots[0]}`, mode);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-Vesluma-Map-Cache')).toBe('hit');
    expect(await response!.text()).toBe('validated offline map');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows only an explicitly marked app retry to bypass an old invalid cached map, replacing it after validation', async () => {
    const app = worker(vi.fn().mockResolvedValue(new Response('fresh validated map')));
    await app.handoff(snapshots[0], new TextEncoder().encode('old invalid cache').buffer);
    const response = await app.resource(`${origin}${snapshots[0]}`, 'reload', 'cors', true);
    expect(await response!.text()).toBe('fresh validated map');
    expect(await app.cacheFor(mapsName).entries.get(snapshots[0])!.clone().text()).toBe('old invalid cache');
    await app.handoff(snapshots[0], new TextEncoder().encode('fresh validated map').buffer);
    expect(await app.cacheFor(mapsName).entries.get(snapshots[0])!.clone().text()).toBe('fresh validated map');
  });

  it('reports a recoverable offline miss, while a recently cached city remains available', async () => {
    const app = worker(vi.fn().mockRejectedValue(new TypeError('offline')));
    await app.handoff(snapshots[0]);
    const missing = await app.resource(`${origin}${snapshots[1]}`);
    expect(missing?.status).toBe(503);
    expect(missing?.headers.get('X-Vesluma-Map-Cache')).toBe('miss');
    expect(missing?.headers.get('Cache-Control')).toBe('no-store');
    expect((await missing!.json()).error).toContain('联网后点重试');
    expect((await app.resource(`${origin}${snapshots[0]}`))?.ok).toBe(true);
  });

  it('retains six least-recently-used cities separately from the app shell and touches in-memory visits', async () => {
    const app = worker(vi.fn());
    app.cacheFor(shellName).entries.set('/assets/index-hash.js', new Response('app shell'));
    for (const path of snapshots.slice(0, 6)) await app.handoff(path);
    await app.message({ type: 'VESLUMA_TOUCH_MAP', url: snapshots[0] });
    await app.handoff(snapshots[6]);
    const maps = app.cacheFor(mapsName);
    expect(maps.entries.has(snapshots[1])).toBe(false);
    expect(maps.entries.has(snapshots[0])).toBe(true);
    expect(maps.entries.has(snapshots[6])).toBe(true);
    expect([...maps.entries.keys()].filter(path => path !== orderPath)).toHaveLength(6);
    expect(await maps.entries.get(orderPath)!.clone().json()).toEqual([...snapshots.slice(2, 6), snapshots[0], snapshots[6]]);
    expect(await app.cacheFor(shellName).entries.get('/assets/index-hash.js')!.clone().text()).toBe('app shell');
  });

  it('serializes simultaneous successful downloads instead of exceeding the six-city limit', async () => {
    const app = worker(vi.fn());
    await Promise.all(snapshots.slice(0, 8).map(path => app.handoff(path)));
    expect([...app.cacheFor(mapsName).entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(2, 8));
  });

  it('preserves earlier cached cities on quota failure and still returns the successful online map', async () => {
    const app = worker(vi.fn().mockResolvedValue(new Response('online remains usable')));
    for (const path of snapshots.slice(0, 6)) await app.handoff(path);
    app.cacheFor(mapsName).put.mockRejectedValueOnce(new Error('QuotaExceededError'));
    await app.handoff(snapshots[6]);
    expect([...app.cacheFor(mapsName).entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(0, 6));
    expect(app.client.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: 'guangzhou', status: 'failed' }));
    const online = await app.resource(`${origin}${snapshots[6]}`);
    expect(await online!.text()).toBe('online remains usable');
  });

  it('rolls back a newly stored seventh map if the index write hits quota, preserving every earlier map', async () => {
    const app = worker(vi.fn());
    for (const path of snapshots.slice(0, 6)) await app.handoff(path);
    const maps = app.cacheFor(mapsName);
    const put = maps.put.getMockImplementation()!;
    maps.put.mockImplementation(async (request, response) => {
      if (request === orderPath) throw new Error('Index quota exceeded');
      return put(request, response);
    });
    await app.handoff(snapshots[6]);
    expect([...maps.entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(0, 6));
    expect(await maps.entries.get(orderPath)!.clone().json()).toEqual(snapshots.slice(0, 6));
    expect(app.client.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: 'guangzhou', status: 'failed' }));
    maps.put.mockImplementation(put);
    await app.handoff(snapshots[6]);
    expect([...maps.entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(1, 7));
    expect(app.client.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: 'guangzhou', status: 'cached' }));
  });

  it('rolls back the new map and restores prior order if eviction fails after writing the new index', async () => {
    const app = worker(vi.fn());
    for (const path of snapshots.slice(0, 6)) await app.handoff(path);
    const maps = app.cacheFor(mapsName);
    maps.delete.mockRejectedValueOnce(new Error('Cannot evict old map'));
    await app.handoff(snapshots[6]);
    expect([...maps.entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(0, 6));
    expect(await maps.entries.get(orderPath)!.clone().json()).toEqual(snapshots.slice(0, 6));
    expect(app.client.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it.each([54_000_983, 64 * 1024 * 1024])('accepts an already validated decoded city of %s bytes within the fixed 64 MiB cap', async size => {
    const app = worker(vi.fn());
    await app.handoff(snapshots[6], new ArrayBuffer(size));
    expect(app.cacheFor(mapsName).entries.has(snapshots[6])).toBe(true);
    expect(app.client.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: 'guangzhou', status: 'cached' }));
  });

  it('migrates all six valid v7 hashes without a network request and discards stale maps without touching user data', async () => {
    const fetchMock = vi.fn();
    const app = worker(fetchMock);
    const old = app.cacheFor('vesluma-shell-v7');
    for (const path of snapshots.slice(0, 6)) old.entries.set(path, new Response(`old ${path}`));
    old.entries.set('/assets/nanjing-obsolete.json', new Response('obsolete'));
    old.entries.set('/api/sync', new Response('must not migrate'));
    app.cacheFor('another-app-cache').entries.set('/keep', new Response('unrelated'));
    await app.activate();
    expect([...app.cacheFor(mapsName).entries.keys()].filter(path => path !== orderPath)).toEqual(snapshots.slice(0, 6));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(app.stores.has('vesluma-shell-v7')).toBe(false);
    expect(app.stores.has('another-app-cache')).toBe(true);
    expect(app.claim).toHaveBeenCalledOnce();
  });

  it('prunes an expired hash from the independent map cache when a new build activates', async () => {
    const app = worker(vi.fn());
    const maps = app.cacheFor(mapsName);
    maps.entries.set('/assets/beijing.json-obsolete.gz', new Response('obsolete'));
    await app.handoff(snapshots[2]);
    await app.activate();
    expect(maps.entries.has('/assets/beijing.json-obsolete.gz')).toBe(false);
    expect(maps.entries.has(snapshots[2])).toBe(true);
  });

  it('can activate the shell even when browser map storage is full', async () => {
    const app = worker(vi.fn());
    app.cacheFor('vesluma-shell-v7').entries.set(snapshots[0], new Response('old map'));
    app.cacheFor(mapsName).put.mockRejectedValue(new Error('QuotaExceededError'));
    await app.activate();
    expect(app.claim).toHaveBeenCalledOnce();
    expect(app.stores.has(shellName)).toBe(true);
  });

  it('accepts handoffs only from this origin and for exact current city assets, with bounded nonempty bodies', async () => {
    const app = worker(vi.fn());
    const body = new TextEncoder().encode('validated').buffer;
    const post = { type: 'VESLUMA_CACHE_MAP', body };
    await app.message({ ...post, url: snapshots[0] }, { url: 'https://external.example/', postMessage: vi.fn() });
    for (const url of ['https://external.example' + snapshots[0], '/api/sync', '/assets/nanjing-obsolete.json', snapshots[0] + '?private=1', '/assets/private.db.gz']) await app.message({ ...post, url });
    await app.handoff(snapshots[0], new ArrayBuffer(0));
    await app.handoff(snapshots[0], new ArrayBuffer(64 * 1024 * 1024 + 1));
    expect(app.cacheFor(mapsName).entries.size).toBe(0);
  });

  it('never treats API navigation, API reads or remote tiles as app-shell or city-cache requests', () => {
    const fetchMock = vi.fn();
    const app = worker(fetchMock);
    expect(app.resource(`${origin}/api/sync`, 'default', 'navigate')).toBeUndefined();
    expect(app.resource(`${origin}/api/photos/private`)).toBeUndefined();
    expect(app.resource('https://tile.openstreetmap.org/10/100/100.png')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(app.open).not.toHaveBeenCalled();
  });
});

describe('service worker navigation recovery', () => {
  it.each([500, 503, 404])('opens the current cached app when HTML returns %s', async status => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('server failure', { status }));
    const app = worker(fetchMock, new Response('cached app'));
    expect(await (await app.navigate()).text()).toBe('cached app');
    expect(app.open).toHaveBeenCalledWith(shellName);
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
