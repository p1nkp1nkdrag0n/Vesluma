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
});
