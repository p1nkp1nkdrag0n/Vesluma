import { describe, expect, it } from 'vitest';
import pc from 'polygon-clipping';
import { cities, getMapRegions, getLandmark, type CityId } from '../cities';
import { containsRegionPoint, isPointUnlocked } from '../../components/mapGeometry';
import { createInitialState, reducer, getCityProgress, getReplayState, isAppState, normalizeAppState, type AppState } from '../../lib/model';
import nanjingBoundary from './boundaries/nanjing.json';
import xianBoundary from './boundaries/xian.json';
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
  it.each(cities)('$name covers the exact source municipality without gaps, overlaps or outside land', city => {
    const snapshot = city.id === 'nanjing' ? nanjingBoundary : xianBoundary;
    const original = snapshot.features.find(f => f.properties.role === 'municipality')!.geometry.coordinates as pc.MultiPolygon;
    const regions = city.regions.map(r => r.geometry.coordinates);
    const combined = pc.union(regions[0], ...regions.slice(1));
    expect(pc.difference(original, combined)).toEqual([]);
    expect(pc.difference(combined, original)).toEqual([]);
    expect(city.boundary.coordinates).toEqual(original);
    regions.forEach((r, i) => regions.slice(i + 1).forEach(other => expect(pc.intersection(r, other)).toEqual([])));
    expect(city.regions.length).toBe(city.id === 'nanjing' ? 11 : 10);
    expect(Math.min(...city.regions.map(r => r.areaKm2))).toBeGreaterThan(10);
  });
  it('assigns one primary per region, with every landmark inside its declared region', () => {
    for (const city of cities) {
      for (const r of city.regions) {
        const owners = city.landmarks.filter(l => l.regionIds.includes(r.id));
        expect(owners.map(l => l.id)).toEqual([r.anchorLandmarkId]);
        expect(owners[0].tier).toBe(1);
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
  it('reveals every region by visiting only representatives', () => {
    for (const city of cities) {
      let state = begin(city.id);
      city.landmarks.filter(l => l.tier === 1).forEach((l, i) => { state = visit(state, l.id, at + i * 1000); });
      expect(getCityProgress(state).ratio).toBe(1);
      expect(getCityProgress(state).visited).toBe(city.regions.length);
      expect(getCityProgress(state).visited).toBeLessThan(city.landmarks.length);
      expect(isAppState(state)).toBe(true);
    }
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
