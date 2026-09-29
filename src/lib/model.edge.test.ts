import { describe, expect, it } from 'vitest'
import { getCity, getLandmark } from '../data/cities'
import { createInitialState, isAppState, isValidPosition, reducer, validateCheckIn, type AppState, type Position } from './model'

const startedAt = 1_000_000

function activeState(): AppState {
  return reducer(createInitialState(startedAt), { type: 'start-trip', id: 'edge-trip', at: startedAt })
}

function arrivedState(): AppState {
  const landmark = getLandmark('nj-confucius')!
  return reducer(activeState(), { type: 'set-position', position: {
    lat: landmark.lat, lng: landmark.lng, at: startedAt + 1000, accuracy: 5, source: 'demo',
  } })
}

function visitedState(): AppState {
  return reducer(arrivedState(), {
    type: 'check-in', id: 'edge-visit', photoId: 'edge-photo', landmarkId: 'nj-confucius', at: startedAt + 1000,
  })
}

describe('coordinate and archive boundaries', () => {
  it.each([
    { lat: NaN }, { lat: Infinity }, { lat: 90.1 }, { lng: -180.1 },
    { accuracy: -1 }, { accuracy: Infinity }, { at: -1 }, { at: NaN },
  ])('rejects an invalid actual position %o', (fields) => {
    const state = activeState()
    const position: Position = { lat: 32.1, lng: 118.8, at: startedAt + 1000, accuracy: 10, source: 'device', ...fields }
    expect(isValidPosition(position)).toBe(false)
    expect(reducer(state, { type: 'set-position', position })).toBe(state)
  })

  it('rejects a sample assigned to a different city or person', () => {
    const state = activeState()
    const point = { id: 'edge-point', tripId: 'edge-trip', cityId: 'nanjing' as const,
      userId: state.profile.id, lat: 32.1, lng: 118.8, at: startedAt + 1000, accuracy: 10, source: 'device' as const }
    expect(reducer(state, { type: 'add-point', point: { ...point, cityId: 'xian' } })).toBe(state)
    expect(reducer(state, { type: 'add-point', point: { ...point, userId: 'another-person' } })).toBe(state)
  })

  it('retains an actual point outside the illustrative trial viewport', () => {
    const state = activeState()
    const city = getCity('nanjing')
    const point = { id: 'beyond-trial', tripId: 'edge-trip', cityId: 'nanjing' as const,
      userId: state.profile.id, lat: city.bounds[1][0] + 0.01, lng: city.bounds[1][1] + 0.01,
      at: startedAt + 1000, accuracy: 10, source: 'device' as const }
    expect(reducer(state, { type: 'add-point', point }).points).toEqual([point])
  })

  it('does not accept a future device timestamp as a fresh arrival', () => {
    const state = arrivedState()
    const future = { ...state, position: { ...state.position!, at: startedAt + 60_000 } }
    expect(validateCheckIn(future, 'nj-confucius', startedAt + 1000).ok).toBe(false)
    expect(reducer(future, { type: 'check-in', id: 'future-visit', photoId: 'photo', landmarkId: 'nj-confucius', at: startedAt + 1000 })).toBe(future)
  })
})

describe('corrupted evidence and preferences', () => {
  it('rejects an unlock whose source landmark cannot unfold that region', () => {
    const state = visitedState()
    expect(isAppState(state)).toBe(true)
    const corrupted = { ...state, unlocks: state.unlocks.map(unlock => ({ ...unlock, regionId: 'nj-zhonghua' })) }
    expect(isAppState(corrupted)).toBe(false)
  })

  it('rejects demo coordinates mislabeled as a real device visit', () => {
    const state = visitedState()
    const corrupted = { ...state, visits: state.visits.map(visit => ({ ...visit, demo: false })) }
    expect(isAppState(corrupted)).toBe(false)
  })

  it('rejects a saved profile target from another city', () => {
    const state = activeState()
    const corrupted = { ...state, preferences: { ...state.preferences,
      'local-2': { cityId: 'nanjing', activeTripId: null, targetLandmarkId: 'xa-bell' },
    } }
    expect(isAppState(corrupted)).toBe(false)
  })

  it('rejects a nonarray replay baseline in a squad member', () => {
    const state = activeState()
    const corrupted = { ...state, trips: state.trips.map(trip => ({ ...trip,
      members: trip.members.map(member => ({ ...member, unlockIdsAtJoin: {} })),
    })) }
    expect(isAppState(corrupted)).toBe(false)
  })

  it('rejects a nonfinite leave timestamp without changing the trip', () => {
    const state = reducer(activeState(), { type: 'create-squad', at: startedAt + 1000 })
    expect(reducer(state, { type: 'leave-squad', at: NaN })).toBe(state)
  })
})
