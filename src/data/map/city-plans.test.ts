import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import pc from 'polygon-clipping';
import { cities, getMapRegions, getLandmark, type CityId } from '../cities';
import { containsRegionPoint, isPointUnlocked } from '../../components/mapGeometry';
import { createInitialState, reducer, getCityProgress, getReplayState, isAppState, normalizeAppState, type AppState } from '../../lib/model';
import legacy from './legacy-regions.json';
interface BoundarySnapshot {
  cityId: string;
  coordinateSystem: string;
  features: { properties: { role: string }; geometry: { type: string; coordinates: unknown } }[];
}
const boundaries = Object.fromEntries(Object.values(import.meta.glob<BoundarySnapshot>('./boundaries/*.json', { eager: true, import: 'default' }))
  .map(snapshot => [snapshot.cityId, snapshot]));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Independent baseline from committed b1536e0, before adding the four cities.
// This locks old content, geometry, identifiers and versions rather than deriving
// the expected result from the new generator or the new regions themselves.
const oldContent = {
  nanjing: { city: 'd746d3d9f2c5bd1ab5d6c8b04348be0a25f20eb0fcb9462ca2a6f016e0f459cb', boundary: '844ad12b0d8b3fd7dbe6ca4324adca2522793c1859d33e268e967ba05cb21999' },
  xian: { city: '550a5a476e80a0713ecc77b769636d926209bc2a60129cfaf5620b63d9c312c7', boundary: '3b958662876501de7f0170cedd8f3850d519120fc08511453401bba69e174d39' },
};
const at = 1_000_000;
function begin(cityId: CityId = 'nanjing', squad = false) {
  return reducer(reducer(createInitialState(at), { type: 'set-city', cityId }), { type: 'start-trip', id: 'trip', at, mode: squad ? 'squad' : 'solo' });
}
function visit(state: AppState, landmarkId: string, time = at) {
  const l = getLandmark(landmarkId)!;
  return reducer(reducer(state, { type: 'set-position', position: { lat: l.lat, lng: l.lng, at: time, accuracy: 5, source: 'demo' } }),
    { type: 'check-in', id: `${landmarkId}-${time}`, photoId: 'photo', landmarkId, at: time });
}
describe('complete, coarse city partitions', () => {
  it('registers six complete cities without silently overwriting any lookup identifier', () => {
    expect(cities.map(city => city.id).sort()).toEqual(['beijing', 'chengdu', 'hangzhou', 'nanjing', 'shanghai', 'xian']);
    expect(new Set(cities.map(city => city.id)).size).toBe(cities.length);
    expect(Object.keys(boundaries).sort()).toEqual(cities.map(city => city.id).sort());
    const landmarks = cities.flatMap(city => city.landmarks);
    const regions = cities.flatMap(city => getMapRegions(city.id));
    expect(new Set(landmarks.map(landmark => landmark.id)).size).toBe(landmarks.length);
    expect(new Set(regions.map(region => region.id)).size).toBe(regions.length);
    for (const city of cities) {
      expect(city.landmarks.length).toBeGreaterThan(city.regions.length);
      expect(city.regions.length).toBeGreaterThan(0);
      expect(city.landmarks.every(landmark => landmark.cityId === city.id)).toBe(true);
      expect(city.regions.every(region => region.cityId === city.id)).toBe(true);
    }
  });
  it('keeps both original cities and all legacy rights byte-for-byte equivalent after parsing', () => {
    for (const [id, expected] of Object.entries(oldContent)) {
      const city = cities.find(candidate => candidate.id === id)!;
      expect(city.contentVersion).toBe('citywide-2026-10-02');
      expect(digest(city)).toBe(expected.city);
      expect(digest(boundaries[id])).toBe(expected.boundary);
    }
    expect(digest(legacy)).toBe('89f3069cbe0de130bde12458bb8c050d47e4fd2d577388b5bb5868189d560432');
  });
  it.each(cities)('$name covers the exact source municipality without gaps, overlaps or outside land', city => {
    const snapshot = boundaries[city.id];
    expect(snapshot, `${city.id} needs an independent source municipality`).toBeDefined();
    expect(snapshot.coordinateSystem).toBe('WGS84');
    const municipalities = snapshot.features.filter(feature => feature.properties.role === 'municipality');
    expect(municipalities).toHaveLength(1);
    const geometry = municipalities[0].geometry;
    expect(['Polygon', 'MultiPolygon']).toContain(geometry.type);
    const original = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as pc.MultiPolygon;
    const regions = city.regions.map(r => r.geometry.coordinates);
    for (const region of city.regions) {
      expect(region.geometry.type).toBe('MultiPolygon');
      expect(region.geometry.coordinates.length).toBeGreaterThan(0);
      expect(region.areaKm2).toBeGreaterThan(0);
      for (const polygon of region.geometry.coordinates) for (const ring of polygon) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(ring.every(point => point.length === 2 && point.every(Number.isFinite))).toBe(true);
      }
    }
    const combined = pc.union(regions[0], ...regions.slice(1));
    expect(pc.difference(original, combined)).toEqual([]);
    expect(pc.difference(combined, original)).toEqual([]);
    expect(city.boundary.coordinates).toEqual(original);
    regions.forEach((r, i) => regions.slice(i + 1).forEach(other => expect(pc.intersection(r, other)).toEqual([])));
    if (city.id === 'nanjing') expect(city.regions).toHaveLength(11);
    if (city.id === 'xian') expect(city.regions).toHaveLength(10);
  }, 120_000);
  it('assigns one primary per region, with every landmark inside its declared region', () => {
    for (const city of cities) {
      for (const r of city.regions) {
        const owners = city.landmarks.filter(l => l.regionIds.includes(r.id));
        expect(owners.map(l => l.id)).toEqual([r.anchorLandmarkId]);
        expect(owners[0].tier).toBe(1);
        expect(owners[0].regionId).toBe(r.id);
        expect(owners[0].regionIds).toEqual([r.id]);
      }
      for (const l of city.landmarks) {
        expect(containsRegionPoint([l.lng, l.lat], city.regions.find(r => r.id === l.regionId)!)).toBe(true);
        if (l.tier !== 1) expect(l.regionIds).toEqual([]);
      }
    }
  });
  it('merges dense groups without duplicate unlock conditions', () => {
    for (const ids of [['nj-confucius', 'nj-laomendong', 'nj-zhonghua'], ['nj-xuanwu', 'nj-jiming', 'nj-hongshan'],
      ['nj-zhongshan', 'nj-ming', 'nj-museum'], ['xa-bell', 'xa-drum', 'xa-yongning'],
      ['xa-pagoda', 'xa-furong', 'xa-history', 'xa-night'], ['xa-terracotta', 'xa-huaqing']]) {
      expect(new Set(ids.map(id => getLandmark(id)!.regionId)).size).toBe(1);
      expect(ids.filter(id => getLandmark(id)!.tier === 1)).toHaveLength(1);
    }
  });
});
describe('tiered authority and legacy rights', () => {
  it('secondary and arrival POIs visited first save photos without revealing a region', () => {
    let state = visit(visit(begin(), 'nj-laomendong'), 'nj-station', at + 1000);
    expect(state.visits).toHaveLength(2);
    expect(state.visits.every(v => v.unlockedRegionIds.length === 0)).toBe(true);
    expect(state.unlocks).toEqual([]);
    state = visit(state, 'nj-confucius', at + 2000);
    expect(getCityProgress(state).regionIds).toEqual(['nj-zone-qinhuai']);
    expect(isAppState(state)).toBe(true);
  });
  it('applies tier restriction to squad sharing, then shares a primary unlock', () => {
    let state = reducer(begin('xian', true), { type: 'update-member', member: { id: 'local-2', name: '同行者', joinedAt: at, solo: false } });
    state = visit(state, 'xa-drum');
    expect(state.visits[0].recipientIds).toContain('local-2');
    expect(getCityProgress(state, 'xian', 'local-2').unlocked).toBe(0);
    state = visit(state, 'xa-bell', at + 1000);
    expect(getCityProgress(state, 'xian', 'local-2').regionIds).toEqual(['xa-zone-center']);
  });
  it.each(cities)('$name reveals every region by visiting only representatives', city => {
    let state = begin(city.id);
    city.landmarks.filter(l => l.tier === 1).forEach((l, i) => { state = visit(state, l.id, at + i * 1000); });
    expect(getCityProgress(state).ratio).toBe(1);
    expect(getCityProgress(state).visited).toBe(city.regions.length);
    expect(getCityProgress(state).visited).toBeLessThan(city.landmarks.length);
    expect(isAppState(state)).toBe(true);
  });
  it('preserves old secondary footprints and replay without upgrading to entire new regions', () => {
    let state = visit(begin(), 'nj-jiming');
    const oldVisit = { ...state.visits[0], contentVersion: undefined, unlockedRegionIds: ['nj-jiming'] };
    state = { ...state, visits: [oldVisit], unlocks: [{ id: 'local-1:nj-jiming', userId: 'local-1', cityId: 'nanjing', regionId: 'nj-jiming', at, visitId: oldVisit.id, source: 'personal' }] };
    expect(isAppState(state)).toBe(true);
    const normalized = normalizeAppState(JSON.parse(JSON.stringify(state)));
    expect(normalized.visits).toEqual(JSON.parse(JSON.stringify(state.visits)));
    expect(normalized.unlocks).toEqual(state.unlocks);
    expect(getCityProgress(normalized).unlocked).toBe(0);
    expect(getCityProgress(normalized).legacyRegionIds).toEqual(['nj-jiming']);
    expect(isPointUnlocked([118.79, 32.065], getMapRegions('nanjing'), new Set(['nj-jiming']))).toBe(true);
    state = reducer(normalized, { type: 'end-trip', at: at + 1000 });
    state = reducer(state, { type: 'start-trip', id: 'new-trip', at: at + 2000 });
    expect(getReplayState(state, 'new-trip', at + 2000).regionIds).toEqual(['nj-jiming']);
    state = visit(state, 'nj-jiming', at + 3000);
    expect(state.unlocks).toHaveLength(1);
    state = visit(state, 'nj-xuanwu', at + 4000);
    expect(getCityProgress(state).regionIds).toEqual(['nj-zone-xuanwu']);
    expect(isAppState(state)).toBe(true);
  });
  it('rejects forged new secondary authority', () => {
    const state = visit(begin(), 'nj-laomendong');
    expect(isAppState({ ...state, visits: state.visits.map(v => ({ ...v, unlockedRegionIds: ['nj-zone-qinhuai'] })) })).toBe(false);
  });
});
