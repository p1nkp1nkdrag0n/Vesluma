import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import nanjing from './nanjing.json';
import xian from './xian.json';
import type { SkeletonFeatureCollection } from './index';

// Keep loader/error tests small; the separate data suite checks every committed
// node and ring. These two road features retain their genuine source coordinates.
const beijing = (() => {
  const source = JSON.parse(gunzipSync(readFileSync(new URL('./beijing.json.gz', import.meta.url))).toString('utf8')) as SkeletonFeatureCollection;
  return { ...source, features: source.features.filter(feature => feature.properties.kind === 'road').slice(0, 2) };
})();
const beijingGzip = gzipSync(JSON.stringify(beijing));

function mapWorker(ready?: Promise<{ active: { postMessage: ReturnType<typeof vi.fn> } }>) {
  const postMessage = vi.fn();
  const worker = { postMessage: vi.fn((message: { type: string }, transfer?: Transferable[]) => {
    if (message.type === 'VESLUMA_MAP_CACHE_READY') (transfer![0] as MessagePort).postMessage({ version: 1 });
    else postMessage(message, transfer);
  }) };
  vi.stubGlobal('location', { href: 'http://127.0.0.1:4317/' });
  vi.stubGlobal('navigator', { serviceWorker: { ready: ready ?? Promise.resolve({ active: worker }) } });
  return postMessage;
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('per-city local map asset loading', () => {
  it('shares an in-flight city request, caches success and loads another city independently', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(nanjing)).mockResolvedValueOnce(Response.json(xian));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    expect(getCitySkeleton('nanjing')).toBeNull();
    expect(await loadCitySkeleton('toString')).toBeNull();
    expect(await loadCitySkeleton('__proto__')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    const first = loadCitySkeleton('nanjing');
    const concurrent = loadCitySkeleton('nanjing');
    expect(concurrent).toBe(first);
    const skeleton = await first;
    expect(skeleton?.cityId).toBe('nanjing');
    expect(getCitySkeleton('nanjing')).toBe(skeleton);
    expect(await loadCitySkeleton('nanjing')).toBe(skeleton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('nanjing');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('api.openstreetmap.org');
    expect((await loadCitySkeleton('xian'))?.cityId).toBe('xian');
    expect(getCitySkeleton('nanjing')).toBe(skeleton);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps failure out of the cache so a missing asset can be retried', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('missing asset', { status: 404 }))
      .mockResolvedValueOnce(Response.json(nanjing));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    await expect(loadCitySkeleton('nanjing')).rejects.toThrow('未能加载');
    expect(getCitySkeleton('nanjing')).toBeNull();
    expect((await loadCitySkeleton('nanjing'))?.cityId).toBe('nanjing');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a hanging response, releases the shared request and ignores its late result', async () => {
    vi.useFakeTimers();
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(Response.json(nanjing));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton, MAP_LOAD_TIMEOUT_MS } = await import('./index');
    const first = loadCitySkeleton('nanjing');
    const failed = expect(first).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS);
    await failed;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(getCitySkeleton('nanjing')).toBeNull();
    const recovered = await loadCitySkeleton('nanjing');
    resolveOld(Response.json(nanjing));
    await vi.runAllTimersAsync();
    expect(getCitySkeleton('nanjing')).toBe(recovered);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('also bounds a hanging body and keeps different-city loads independent', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) })
      .mockResolvedValueOnce(Response.json(xian));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton, MAP_LOAD_TIMEOUT_MS } = await import('./index');
    const failed = expect(loadCitySkeleton('nanjing')).rejects.toThrow('超时');
    const otherCity = await loadCitySkeleton('xian');
    expect(otherCity?.cityId).toBe('xian');
    await vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS);
    await failed;
    expect(getCitySkeleton('nanjing')).toBeNull();
    expect(getCitySkeleton('xian')).toBe(otherCity);
  });

  it('rejects a wrong city, datum or detailed-road payload without poisoning future loads', async () => {
    const wrongDatum = { ...nanjing, coordinateSystem: 'GCJ-02' };
    const detailedRoads = {
      ...nanjing,
      features: nanjing.features.map((feature, index) => index === 0
        ? { ...feature, properties: { ...feature.properties, highway: 'residential' } } : feature),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(xian))
      .mockResolvedValueOnce(Response.json(wrongDatum))
      .mockResolvedValueOnce(Response.json(detailedRoads))
      .mockResolvedValueOnce(Response.json(nanjing));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(loadCitySkeleton('nanjing')).rejects.toThrow('不匹配');
      expect(getCitySkeleton('nanjing')).toBeNull();
    }
    expect((await loadCitySkeleton('nanjing'))?.roads.length).toBeGreaterThan(50);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('losslessly decodes a new-city gzip asset before validating and caching the original nodes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(beijingGzip, { headers: { 'Content-Type': 'application/gzip' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    const loaded = await loadCitySkeleton('beijing');
    expect(loaded?.cityId).toBe('beijing');
    expect(loaded?.roads[0].coordinates).toEqual(beijing.features[0].geometry.coordinates);
    expect(getCitySkeleton('beijing')).toBe(loaded);
    expect(String(fetchMock.mock.calls[0][0])).toContain('beijing.json.gz');
    expect(await loadCitySkeleton('beijing')).toBe(loaded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not decode twice when a static server already applied Content-Encoding gzip', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(beijing), { headers: { 'Content-Encoding': 'gzip' } })));
    const { loadCitySkeleton } = await import('./index');
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
  });

  it('explains missing browser gzip support, keeps the cache empty and permits a later retry', async () => {
    const decompress = globalThis.DecompressionStream;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(beijingGzip)));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('DecompressionStream', undefined);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    await expect(loadCitySkeleton('beijing')).rejects.toThrow('请更新浏览器');
    expect(getCitySkeleton('beijing')).toBeNull();
    vi.stubGlobal('DecompressionStream', decompress);
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed gzip and wrong-city compressed content without poisoning a valid retry', async () => {
    const wrongCity = gzipSync(JSON.stringify({ ...beijing, cityId: 'shanghai' }));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([0x1f, 0x8b, 0x08, 0xff])))
      .mockResolvedValueOnce(new Response(wrongCity)).mockResolvedValueOnce(new Response(beijingGzip));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    await expect(loadCitySkeleton('beijing')).rejects.toThrow();
    expect(getCitySkeleton('beijing')).toBeNull();
    await expect(loadCitySkeleton('beijing')).rejects.toThrow('不匹配');
    expect(getCitySkeleton('beijing')).toBeNull();
    expect((await loadCitySkeleton('beijing'))?.roads.length).toBe(2);
  });

  it('times out an interrupted gzip body and preserves the retry path', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, arrayBuffer: () => new Promise(() => {}) })
      .mockResolvedValueOnce(new Response(beijingGzip));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton, MAP_LOAD_TIMEOUT_MS } = await import('./index');
    const failure = expect(loadCitySkeleton('beijing')).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS);
    await failure;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(getCitySkeleton('beijing')).toBeNull();
    vi.useRealTimers();
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
  });

  it('hands the exact validated gzip bytes to the ready worker before this page has a controller', async () => {
    const postMessage = mapWorker();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(beijingGzip, { headers: { 'Content-Type': 'application/gzip' } })));
    const { loadCitySkeleton } = await import('./index');
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    const [message, transfer] = postMessage.mock.calls[0];
    expect(message.type).toBe('VESLUMA_CACHE_MAP');
    expect(message.url).toMatch(/^http:\/\/127\.0\.0\.1:4317\/.*beijing\.json\.gz$/);
    expect(message.contentType).toBe('application/gzip');
    expect(Buffer.from(message.body)).toEqual(beijingGzip);
    expect(transfer).toEqual([message.body]);
    await loadCitySkeleton('beijing');
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(postMessage.mock.calls[1][0]).toEqual({ type: 'VESLUMA_TOUCH_MAP', url: message.url });
  });

  it('touches an existing worker cache hit without sending or fetching a second map body', async () => {
    const postMessage = mapWorker();
    const fetchMock = vi.fn().mockResolvedValue(new Response(beijingGzip, { headers: { 'X-Vesluma-Map-Cache': 'hit' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton } = await import('./index');
    await loadCitySkeleton('beijing');
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0][0].type).toBe('VESLUMA_TOUCH_MAP');
    expect(postMessage.mock.calls[0][0]).not.toHaveProperty('body');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never hands malformed or wrong-city HTTP 200 responses to the worker and bypasses a bad cache on retry', async () => {
    const postMessage = mapWorker();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([0x1f, 0x8b, 0x08, 0xff])))
      .mockResolvedValueOnce(Response.json({ ...beijing, cityId: 'shanghai' }, { headers: { 'X-Vesluma-Map-Cache': 'hit' } }))
      .mockResolvedValueOnce(new Response(beijingGzip));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton } = await import('./index');
    await expect(loadCitySkeleton('beijing')).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1].headers?.['X-Vesluma-Map-Retry']).toBeUndefined();
    await expect(loadCitySkeleton('beijing')).rejects.toThrow('不匹配');
    expect(postMessage).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][1].cache).toBe('reload');
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'X-Vesluma-Map-Retry': '1' });
    await loadCitySkeleton('beijing');
    expect(fetchMock.mock.calls[2][1].cache).toBe('reload');
    expect(fetchMock.mock.calls[2][1].headers).toEqual({ 'X-Vesluma-Map-Retry': '1' });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0][0].type).toBe('VESLUMA_CACHE_MAP');
    await loadCitySkeleton('beijing');
    expect(fetchMock).toHaveBeenCalledTimes(3); // A successful memory hit sends no retry request.
  });

  it('keeps a late response after timeout out of both memory and worker caches', async () => {
    vi.useFakeTimers();
    const postMessage = mapWorker();
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; })));
    const { loadCitySkeleton, MAP_LOAD_TIMEOUT_MS, getCitySkeleton } = await import('./index');
    const failure = expect(loadCitySkeleton('beijing')).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS);
    await failure;
    resolveResponse(new Response(beijingGzip));
    await vi.runAllTimersAsync();
    expect(getCitySkeleton('beijing')).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('loads a valid map promptly even when no worker activates and bounds the pending cache handoff', async () => {
    vi.useFakeTimers();
    const postMessage = mapWorker(new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(beijing)));
    const { loadCitySkeleton, MAP_CACHE_READY_TIMEOUT_MS } = await import('./index');
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(MAP_CACHE_READY_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('explains an uncached offline city and permits a network retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('offline', { status: 503, headers: { 'X-Vesluma-Map-Cache': 'miss' } }))
      .mockResolvedValueOnce(new Response(beijingGzip));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton } = await import('./index');
    await expect(loadCitySkeleton('beijing')).rejects.toThrow('此城地图尚未缓存');
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
    expect(fetchMock.mock.calls[1][1].cache).toBe('reload');
  });

  it('bounds decoded map memory, refreshes hit recency and refetches an evicted city without mutating held maps', async () => {
    const smallCity = (id: string) => {
      const source = JSON.parse(gunzipSync(readFileSync(new URL(`./${id}.json.gz`, import.meta.url))).toString('utf8')) as SkeletonFeatureCollection;
      return { ...source, features: source.features.filter(feature => feature.properties.kind === 'road').slice(0, 2) };
    };
    const shanghai = smallCity('shanghai'), hangzhou = smallCity('hangzhou');
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(beijing)).mockResolvedValueOnce(Response.json(shanghai))
      .mockResolvedValueOnce(new Response('interrupted', { status: 503 })).mockResolvedValueOnce(Response.json(hangzhou))
      .mockResolvedValueOnce(Response.json(shanghai, { headers: { 'X-Vesluma-Map-Cache': 'hit' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton, getCitySkeleton } = await import('./index');
    const heldBeijing = await loadCitySkeleton('beijing');
    const heldShanghai = await loadCitySkeleton('shanghai');
    await expect(loadCitySkeleton('hangzhou')).rejects.toThrow('未能加载');
    expect(getCitySkeleton('beijing')).toBe(heldBeijing);
    expect(getCitySkeleton('shanghai')).toBe(heldShanghai);
    expect(await loadCitySkeleton('beijing')).toBe(heldBeijing);
    await loadCitySkeleton('hangzhou');
    expect(getCitySkeleton('beijing')).toBe(heldBeijing);
    expect(getCitySkeleton('shanghai')).toBeNull();
    expect(heldShanghai?.roads).toHaveLength(2);
    expect((await loadCitySkeleton('shanghai'))?.cityId).toBe('shanghai');
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(getCitySkeleton('beijing')).toBeNull();
  });

  it('waits for an upgraded worker protocol acknowledgement without refetching or giving bytes to the old worker', async () => {
    const oldWorker = { postMessage: vi.fn() };
    const posted = vi.fn();
    const nextWorker = { postMessage: vi.fn((message: { type: string }, transfer?: Transferable[]) => {
      if (message.type === 'VESLUMA_MAP_CACHE_READY') (transfer![0] as MessagePort).postMessage({ version: 1 });
      else posted(message, transfer);
    }) };
    const container = Object.assign(new EventTarget(), { ready: Promise.resolve({ active: oldWorker }), controller: oldWorker });
    vi.stubGlobal('navigator', { serviceWorker: container });
    vi.stubGlobal('location', { href: 'http://127.0.0.1:4317/' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(beijingGzip));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCitySkeleton } = await import('./index');
    expect((await loadCitySkeleton('beijing'))?.cityId).toBe('beijing');
    await vi.waitFor(() => expect(oldWorker.postMessage).toHaveBeenCalledTimes(1));
    expect(oldWorker.postMessage.mock.calls[0][0]).toEqual({ type: 'VESLUMA_MAP_CACHE_READY' });
    expect(posted).not.toHaveBeenCalled();
    container.controller = nextWorker;
    container.dispatchEvent(new Event('controllerchange'));
    await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(posted.mock.calls[0][0].type).toBe('VESLUMA_CACHE_MAP');
    expect(Buffer.from(posted.mock.calls[0][0].body)).toEqual(beijingGzip);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(oldWorker.postMessage).toHaveBeenCalledTimes(1);
  });
});
