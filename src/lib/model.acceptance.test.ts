import { describe, expect, it } from 'vitest';
import { getLandmark } from '../data/cities';
import { createInitialState, reducer, validateCheckIn, type AppState, type Position } from './model';

const now = 1_000_000;
function arrival(landmarkId = 'nj-confucius', meters = 0): AppState {
  const landmark = getLandmark(landmarkId)!;
  let state = reducer(createInitialState(now), { type: 'set-city', cityId: landmark.cityId });
  state = reducer(state, { type: 'start-trip', id: 'acceptance-trip', at: now });
  state = reducer(state, { type: 'set-location-mode', mode: 'device' });
  return reducer(state, { type: 'set-position', position: {
    lat: landmark.lat + meters / 6_371_000 * 180 / Math.PI, lng: landmark.lng, at: now, accuracy: 5, source: 'device',
  } });
}
function withPosition(state: AppState, fields: Partial<Position>): AppState {
  return { ...state, position: { ...state.position!, ...fields } };
}

describe('trial acceptance location boundaries', () => {
  it.each(['nj-confucius', 'xa-bell'])('includes 250 metres and excludes even 250.001 metres at %s', landmarkId => {
    for (const meters of [0, 249.9, 250]) expect(validateCheckIn(arrival(landmarkId, meters), landmarkId, now).ok).toBe(true);
    for (const meters of [250.001, 250.1, 300]) expect(validateCheckIn(arrival(landmarkId, meters), landmarkId, now).ok).toBe(false);
  });

  it.each([[100, true], [100.001, false], [1000, false]])('checks reported accuracy %s metres', (accuracy, accepted) => {
    expect(validateCheckIn(withPosition(arrival(), { accuracy }), 'nj-confucius', now).ok).toBe(accepted);
  });

  it.each([[300_000, true], [300_001, false], [-5000, true], [-5001, false]])('checks a sample age of %s ms', (age, accepted) => {
    expect(validateCheckIn(withPosition(arrival(), { at: now - age }), 'nj-confucius', now).ok).toBe(accepted);
  });

  it('does not accept an old mode sample after switching location methods', () => {
    expect(validateCheckIn(withPosition(arrival(), { source: 'demo' }), 'nj-confucius', now).ok).toBe(false);
  });

  it('does not create records without current evidence, while paused or in another city', () => {
    const action = { type: 'check-in' as const, id: 'attempt', landmarkId: 'nj-confucius', photoId: 'photo', at: now };
    const noPosition = reducer(arrival(), { type: 'set-position', position: null });
    const paused = reducer(arrival(), { type: 'pause-trip', at: now });
    const otherCity = reducer(arrival(), { type: 'set-city', cityId: 'xian' });
    for (const state of [noPosition, paused, otherCity]) expect(reducer(state, action)).toBe(state);
  });

  it('keeps one event on retry, and a deliberate revisit adds only the visit', () => {
    const action = { type: 'check-in' as const, id: 'attempt', landmarkId: 'nj-confucius', photoId: 'photo', at: now };
    const first = reducer(arrival(), action);
    expect(reducer(first, action)).toBe(first);
    const revisited = reducer(first, { ...action, id: 'deliberate-revisit', at: now + 1000 });
    expect(revisited.visits).toHaveLength(2);
    expect(revisited.unlocks).toEqual(first.unlocks);
    expect(revisited.visits[1].unlockedRegionIds).toEqual([]);
  });
});
