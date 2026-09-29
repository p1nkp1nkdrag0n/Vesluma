import { describe, expect, it } from 'vitest'
import { getLandmark, type CityId } from '../data/cities'
import { createInitialState, getActiveTrip, getCityProgress, getLandmarkVisits, getProfileTrips, getProfileVisits,
  getReplayState, getTripPoints, isAppState, reducer, validateCheckIn, type AppState, type Position } from './model'

const at = 1_000_000
const position = (landmarkId: string, time = at): Position => {
  const landmark = getLandmark(landmarkId)!
  return { lat: landmark.lat, lng: landmark.lng, at: time, accuracy: 5, source: 'demo' }
}
const begin = (cityId: CityId = 'nanjing', mode: 'solo' | 'squad' = 'solo'): AppState => reducer(
  reducer(createInitialState(at), { type: 'set-city', cityId }), { type: 'start-trip', id: 'trip-1', at, mode })
const visit = (state: AppState, id: string, landmarkId: string, time = at, shareWithSquad?: boolean): AppState => reducer(
  reducer(state, { type: 'set-position', position: position(landmarkId, time) }), {
    type: 'check-in', id, landmarkId, at: time, photoId: id,
    photoUrl: landmarkId.startsWith('nj-') ? '/images/nanjing.png' : '/images/xian.png', shareWithSquad,
  })

describe('permanent city progress and independent landmark visits', () => {
  it('starts with empty progress and a clearly sourced demonstration position', () => {
    const state = createInitialState(at)
    expect(getCityProgress(state).unlocked).toBe(0)
    expect(state.visits).toEqual([])
    expect(state.position?.source).toBe('demo')
  })

  it('retains first activation and photos when a landmark is revisited', () => {
    let state = visit(begin(), 'first', 'nj-confucius')
    state = visit(state, 'revisit', 'nj-confucius', at + 1_000)
    expect(getCityProgress(state).unlocked).toBe(1)
    expect(getLandmarkVisits(state, 'nj-confucius').map((item) => item.photoId)).toEqual(['first', 'revisit'])
    expect(state.visits[1].firstActivation).toBe(false)
    expect(state.visits[1].unlockedRegionIds).toEqual([])
    expect(state.unlocks[0].at).toBe(at)
    expect(state.unlocks[0].visitId).toBe('first')
  })

  it('records another landmark in the same region without incrementing region progress', () => {
    const state = visit(visit(begin(), 'temple', 'nj-confucius'), 'gate', 'nj-laomendong', at + 1_000)
    expect(state.visits[1].firstActivation).toBe(true)
    expect(state.visits[1].firstPersonalVisit).toBe(true)
    expect(state.visits[1].unlockedRegionIds).toEqual([])
    expect(getCityProgress(state).visited).toBe(2)
    expect(getCityProgress(state).unlocked).toBe(1)
  })

  it('keeps progress separated between cities and preserves it after ending a trip', () => {
    let state = visit(begin(), 'nj', 'nj-confucius')
    state = reducer(state, { type: 'end-trip', at: at + 1_000 })
    state = reducer(state, { type: 'set-city', cityId: 'xian' })
    expect(getCityProgress(state).unlocked).toBe(0)
    state = reducer(state, { type: 'start-trip', id: 'trip-2', at: at + 2_000 })
    state = visit(state, 'xa', 'xa-bell', at + 3_000)
    expect(getCityProgress(state).unlocked).toBe(1)
    expect(getCityProgress(state, 'nanjing').regionIds).toEqual(['nj-qinhuai'])
    state = reducer(state, { type: 'end-trip', at: at + 4_000 })
    state = reducer(state, { type: 'set-city', cityId: 'nanjing' })
    expect(getCityProgress(state).unlocked).toBe(1)
    expect(getProfileTrips(state)).toHaveLength(2)
  })

  it('uses submission IDs to prevent a retry from creating duplicate visits', () => {
    const state = visit(visit(begin(), 'same-id', 'nj-confucius'), 'same-id', 'nj-confucius', at + 1_000)
    expect(state.visits).toHaveLength(1)
    expect(state.unlocks).toHaveLength(1)
  })
})

describe('location evidence and trip archives', () => {
  it('requires a trip, a fresh nearby position and sufficient accuracy', () => {
    expect(validateCheckIn(createInitialState(at), 'nj-station', at).ok).toBe(false)
    let state = reducer(begin(), { type: 'set-position', position: null })
    expect(validateCheckIn(state, 'nj-confucius', at).ok).toBe(false)
    state = reducer(state, { type: 'set-position', position: position('nj-confucius') })
    expect(validateCheckIn(state, 'nj-confucius', at).ok).toBe(true)
    expect(validateCheckIn(state, 'nj-confucius', at + 300_001).ok).toBe(false)
    state = reducer(state, { type: 'set-position', position: { ...position('nj-confucius'), accuracy: 101 } })
    expect(validateCheckIn(state, 'nj-confucius', at).ok).toBe(false)
    state = reducer(state, { type: 'set-position', position: position('nj-station') })
    expect(validateCheckIn(state, 'nj-confucius', at).ok).toBe(false)
    expect(validateCheckIn(state, 'xa-bell', at).ok).toBe(false)
  })

  it('rejects check-ins and samples while paused, and never fills the recording gap', () => {
    let state = begin()
    const point = { ...position('nj-confucius'), id: 'p1', tripId: 'trip-1', cityId: 'nanjing' as const, userId: 'local-1' }
    state = reducer(state, { type: 'add-point', point })
    state = reducer(state, { type: 'pause-trip', at: at + 1_000 })
    state = reducer(state, { type: 'add-point', point: { ...point, id: 'gap', at: at + 2_000 } })
    state = visit(state, 'paused-visit', 'nj-confucius', at + 2_000)
    expect(state.points).toHaveLength(1)
    expect(state.visits).toHaveLength(0)
    state = reducer(state, { type: 'resume-trip', at: at + 3_000 })
    state = reducer(state, { type: 'add-point', point: { ...point, id: 'p2', at: at + 4_000 } })
    expect(getTripPoints(state, 'trip-1').map((item) => item.id)).toEqual(['p1', 'p2'])
    state = reducer(state, { type: 'end-trip', at: at + 5_000 })
    state = reducer(state, { type: 'add-point', point: { ...point, id: 'after-end', at: at + 6_000 } })
    expect(state.points).toHaveLength(2)
  })

  it('rejects a device point assigned to a different trip archive', () => {
    const point = { ...position('nj-confucius'), source: 'device' as const,
      id: 'another-trip-point', tripId: 'another-trip', cityId: 'nanjing' as const, userId: 'local-1' }
    expect(reducer(begin(), { type: 'add-point', point }).points).toHaveLength(0)
  })

  it('replays only actual events up to the cursor while retaining progress from before this trip', () => {
    let state = visit(begin(), 'previous', 'nj-zhonghua')
    state = reducer(state, { type: 'end-trip', at: at + 1_000 })
    state = reducer(state, { type: 'start-trip', id: 'trip-2', at: at + 2_000 })
    state = visit(state, 'now', 'nj-confucius', at + 3_000)
    expect(getReplayState(state, 'trip-2', at + 2_000).regionIds).toEqual(['nj-zhonghua'])
    const replay = getReplayState(state, 'trip-2', at + 3_000)
    expect(replay.visits.map((item) => item.id)).toEqual(['now'])
    expect(replay.regionIds).toEqual(['nj-zhonghua', 'nj-qinhuai'])
    expect(replay.newRegionIds).toEqual(['nj-qinhuai'])
  })
})

describe('profile isolation and local squad sharing', () => {
  it('isolates private progress and restores each profile’s current trip, city and target', () => {
    let state = visit(begin(), 'private', 'nj-confucius')
    state = reducer(state, { type: 'set-target', landmarkId: 'nj-laomendong' })
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    expect(getProfileVisits(state)).toHaveLength(0)
    expect(getProfileTrips(state)).toHaveLength(0)
    expect(getCityProgress(state).unlocked).toBe(0)
    expect(state.activeTripId).toBeNull()
    state = reducer(state, { type: 'set-city', cityId: 'xian' })
    state = reducer(state, { type: 'start-trip', id: 'second-person', at: at + 1_000 })
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } })
    expect(state.cityId).toBe('nanjing')
    expect(state.activeTripId).toBe('trip-1')
    expect(state.targetLandmarkId).toBe('nj-laomendong')
    expect(state.position).toBeNull()
    expect(getCityProgress(state).unlocked).toBe(1)
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    expect(state.cityId).toBe('xian')
    expect(state.activeTripId).toBe('second-person')
  })

  it('shares one event with current members including solo members, without sharing point clouds', () => {
    let state = begin('nanjing', 'squad')
    state = reducer(state, { type: 'update-member', member: { id: 'local-2', name: '同行者', joinedAt: at, solo: true } })
    state = reducer(state, { type: 'update-member', member: { id: 'future', name: '稍后加入', joinedAt: at + 10_000, solo: false } })
    state = reducer(state, { type: 'add-point', point: { ...position('nj-confucius'), id: 'mine', tripId: 'trip-1', cityId: 'nanjing', userId: 'local-1' } })
    state = visit(state, 'one-photo', 'nj-confucius', at + 1_000)
    expect(state.visits).toHaveLength(1)
    expect(state.visits[0].recipientIds).toEqual(['local-1', 'local-2'])
    expect(getCityProgress(state, 'nanjing', 'local-2').unlocked).toBe(1)
    expect(getCityProgress(state, 'nanjing', 'future').unlocked).toBe(0)
    expect(getTripPoints(state, 'trip-1', 'local-2')).toEqual([])
    state = reducer(state, { type: 'set-solo', solo: true })
    state = visit(state, 'solo-photo', 'nj-zhonghua', at + 2_000)
    expect(state.visits[1].recipientIds).toEqual(['local-1'])
    state = visit(state, 'explicit-share', 'nj-jiming', at + 3_000, true)
    expect(state.visits[2].recipientIds).toEqual(['local-1', 'local-2'])
  })

  it('does not backfill old squad rights for a new member and retains rights after leaving', () => {
    let state = visit(begin('nanjing', 'squad'), 'before-join', 'nj-confucius')
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    state = reducer(state, { type: 'join-squad', tripId: 'trip-1', at: at + 1_000 })
    expect(getActiveTrip(state)?.id).toBe('trip-1')
    expect(getProfileVisits(state)).toHaveLength(0)
    expect(getCityProgress(state).unlocked).toBe(0)
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } })
    state = visit(state, 'after-join', 'nj-zhonghua', at + 2_000)
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    expect(getCityProgress(state).regionIds).toEqual(['nj-zhonghua'])
    state = reducer(state, { type: 'leave-squad', at: at + 3_000 })
    expect(getCityProgress(state).regionIds).toEqual(['nj-zhonghua'])
    expect(getProfileVisits(state).map((item) => item.id)).toEqual(['after-join'])
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } })
    state = visit(state, 'after-leave', 'nj-jiming', at + 4_000)
    expect(getCityProgress(state, 'nanjing', 'local-2').regionIds).toEqual(['nj-zhonghua'])
  })

  it('only lets the original uploader publish or withdraw a specific visit', () => {
    let state = visit(begin(), 'photo', 'nj-confucius')
    expect(state.visits[0].public).toBe(false)
    state = reducer(state, { type: 'set-public', visitId: 'photo', public: true })
    expect(state.visits[0].public).toBe(true)
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-2', name: '同行者' } })
    state = reducer(state, { type: 'set-public', visitId: 'photo', public: false })
    expect(state.visits[0].public).toBe(true)
    expect(getCityProgress(state).unlocked).toBe(0)
    state = reducer(state, { type: 'switch-profile', profile: { id: 'local-1', name: '旅行者' } })
    state = reducer(state, { type: 'set-public', visitId: 'photo', public: false })
    expect(state.visits[0].public).toBe(false)
    expect(getLandmarkVisits(state, 'nj-confucius')).toHaveLength(1)
    expect(getCityProgress(state).unlocked).toBe(1)
  })

  it('accepts a round trip of valid state JSON and rejects malformed state', () => {
    const state = visit(begin(), 'one', 'nj-confucius')
    expect(isAppState(JSON.parse(JSON.stringify(state)))).toBe(true)
    expect(isAppState({ version: 1 })).toBe(false)
    const duplicateVisit = { ...state, visits: [...state.visits, state.visits[0]] }
    expect(isAppState(duplicateVisit)).toBe(false)
  })
})
