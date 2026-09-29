import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nanjing from './nanjing.json';
import xian from './xian.json';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

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
});
