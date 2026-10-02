import { describe, expect, it } from 'vitest';
import { cities } from '../cities';
import nanjing from './nanjing.json';
import xian from './xian.json';
import { getCitySkeleton as getCachedCitySkeleton, normalizeSkeleton, validateSkeletonCollection,
  type SkeletonCoordinate, type SkeletonFeatureCollection } from './index';

// Raw JSON imports belong only to source tests; application code loads URL assets.
const skeletonCollections: Record<string, SkeletonFeatureCollection> = {
  nanjing: nanjing as unknown as SkeletonFeatureCollection,
  xian: xian as unknown as SkeletonFeatureCollection,
};
const normalized = Object.fromEntries(Object.entries(skeletonCollections).map(([id, data]) => {
  validateSkeletonCollection(data, id);
  return [id, normalizeSkeleton(data)];
}));
const getCitySkeleton = (id: string) => normalized[id];

describe('bundled real city skeleton', () => {
  it('covers every current candidate landmark in WGS84 without a fabricated fallback', () => {
    for (const city of cities) {
      const skeleton = getCitySkeleton(city.id)!;
      const [west, south, east, north] = skeleton.bounds;
      expect(skeleton.cityId).toBe(city.id);
      expect(skeletonCollections[city.id].coordinateSystem).toBe('WGS84');
      for (const landmark of city.landmarks) {
        expect(landmark.lng).toBeGreaterThanOrEqual(west);
        expect(landmark.lng).toBeLessThanOrEqual(east);
        expect(landmark.lat).toBeGreaterThanOrEqual(south);
        expect(landmark.lat).toBeLessThanOrEqual(north);
      }
    }
    expect(getCachedCitySkeleton('unsupported-city')).toBeNull();
    expect(getCachedCitySkeleton('toString')).toBeNull();
    expect(getCachedCitySkeleton('__proto__')).toBeNull();
  });

  it('includes only arterial road classes, source IDs and complete original coordinate sequences', () => {
    const permitted = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link']);
    for (const city of cities) {
      const collection = skeletonCollections[city.id];
      const skeleton = getCitySkeleton(city.id)!;
      const knownNodes = new Map<number, SkeletonCoordinate>();
      expect(skeleton.roads.length).toBeGreaterThan(50);
      const originalRoads = collection.features.filter(feature => feature.properties.kind === 'road');
      const byId = new Map(originalRoads.map(feature => [feature.id, feature]));
      expect(skeleton.roads).toHaveLength(originalRoads.length);
      for (const road of skeleton.roads) {
        expect(permitted.has(road.highway)).toBe(true);
        const source = byId.get(road.id)!;
        expect(source.properties.osmType).toBe('way');
        expect(source.id).toBe(`way/${source.properties.osmId}`);
        expect(source.properties.sourceVersion).toBeGreaterThan(0);
        expect(Number.isFinite(Date.parse(source.properties.sourceTimestamp))).toBe(true);
        expect(source.geometry.type).toBe('LineString');
        expect(road.coordinates).toBe(source.geometry.coordinates);
        expect(road.coordinates.length).toBeGreaterThanOrEqual(2);
        expect(source.properties.nodeIds).toHaveLength(road.coordinates.length);
        road.coordinates.forEach((coordinate, index) => {
          const [lng, lat] = coordinate;
          // Scan every original node without allocating hundreds of thousands
          // of assertion objects now that the snapshot spans whole cities.
          if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng <= 100 || lng >= 125 || lat <= 25 || lat >= 40) {
            throw new Error(`Invalid original coordinate in ${road.id}, node ${index}`);
          }
          const id = source.properties.nodeIds![index];
          const known = knownNodes.get(id);
          if (known && (known[0] !== lng || known[1] !== lat)) throw new Error(`Inconsistent shared node ${id}`);
          if (!known) knownNodes.set(id, coordinate);
        });
      }
      expect(new Set(collection.features.map(feature => feature.id)).size).toBe(collection.features.length);
      expect(collection.features.every(feature => ['road', 'water', 'waterLine'].includes(feature.properties.kind))).toBe(true);
    }
  });

  it('preserves real shore polygons and the islands inside Xuanwu Lake', () => {
    for (const city of cities) {
      const skeleton = getCitySkeleton(city.id)!;
      for (const water of skeleton.water) {
        expect(water.rings.length).toBeGreaterThan(0);
        for (const ring of water.rings) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring.at(-1));
        }
      }
    }
    const lake = getCitySkeleton('nanjing')!.water.find(water => water.id.startsWith('relation/2138994/'))!;
    expect(lake.name).toBe('玄武湖');
    expect(lake.rings.length).toBeGreaterThan(1);
    const road = getCitySkeleton('nanjing')!.roads.find(item => item.id === 'way/61857816')!;
    expect(road.name).toBe('中华路');
    expect(road.highway).toBe('secondary');
  });

  it('retains explicit crossing/access facts without inferring pedestrian permission', () => {
    for (const city of cities) {
      const skeleton = getCitySkeleton(city.id)!;
      const collection = skeletonCollections[city.id];
      const byId = new Map(collection.features.map(feature => [feature.id, feature]));
      for (const road of skeleton.roads) {
        const raw = byId.get(road.id)!.properties;
        expect(road.foot).toBe(raw.foot);
        expect(road.access).toBe(raw.access);
        if (raw.layer !== undefined && Number.isFinite(Number(raw.layer))) expect(road.layer).toBe(Number(raw.layer));
        if (raw.bridge === 'yes') expect(road.bridge).toBe(true);
        if (raw.tunnel === 'yes') expect(road.tunnel).toBe(true);
        if (raw.oneway === '-1') expect(road.onewayDirection).toBe('reverse');
      }
    }
  });

  it('ships traceable source receipts and attribution, with no runtime source request', () => {
    for (const city of cities) {
      const skeleton = getCitySkeleton(city.id)!;
      expect(getCitySkeleton(city.id)).toBe(skeleton);
      expect(skeleton.source.license).toBe('ODbL-1.0');
      expect(skeleton.source.url).toBe('https://www.openstreetmap.org/copyright');
      expect(Number.isFinite(Date.parse(skeleton.source.downloadedAt))).toBe(true);
      expect(skeleton.source.requests.length).toBeGreaterThan(0);
      for (const request of skeleton.source.requests) {
        expect(request.url).toBe('https://overpass-api.de/api/interpreter');
        expect(request.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(Number.isFinite(Date.parse(request.downloadedAt))).toBe(true);
      }
    }
  });
});
