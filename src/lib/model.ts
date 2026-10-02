import { cities, getCity, getLandmark, getRegion, allowedVisitRegions, type CityId, type Landmark } from '../data/cities'
import { isMapTheme, type MapTheme } from './mapTheme'
export type { MapTheme } from './mapTheme'

export type LocationMode = 'demo' | 'device'
export interface Profile { id: string; name: string }
export interface Position {
  lat: number
  lng: number
  at: number
  accuracy: number
  speed?: number | null
  heading?: number | null
  source: LocationMode
}
export interface Point extends Position { id: string; tripId: string; cityId: CityId; userId: string }
export interface Member {
  id: string
  name: string
  joinedAt: number
  leftAt?: number
  solo: boolean
  unlockIdsAtJoin?: string[]
}
export interface Trip {
  id: string
  userId: string
  cityId: CityId
  name: string
  mode: 'solo' | 'squad'
  status: 'active' | 'paused' | 'ended'
  startedAt: number
  endedAt?: number
  members: Member[]
  unlockIdsAtStart: string[]
  squadName?: string
  squadCode?: string
}
export interface Visit {
  contentVersion?: string
  id: string
  tripId: string
  cityId: CityId
  landmarkId: string
  userId: string
  photoId: string
  photoUrl?: string
  at: number
  source: 'personal' | 'squad'
  recipientIds: string[]
  firstActivation: boolean
  firstPersonalVisit: boolean
  unlockedRegionIds: string[]
  public: boolean
  demo: boolean
  position: Position
  note?: string
}
export interface Unlock {
  id: string
  userId: string
  cityId: CityId
  regionId: string
  at: number
  visitId: string
  source: 'personal' | 'squad'
}
export interface Preferences {
  cityId: CityId
  activeTripId: string | null
  targetLandmarkId: string | null
  mapTheme?: MapTheme
}
export interface AppState {
  version: 1
  profile: Profile
  profiles: Profile[]
  preferences: Record<string, Preferences>
  cityId: CityId
  activeTripId: string | null
  targetLandmarkId: string | null
  trips: Trip[]
  visits: Visit[]
  points: Point[]
  unlocks: Unlock[]
  position: Position | null
  locationMode: LocationMode
  mapTheme?: MapTheme
}

type CheckInAction = {
  type: 'check-in' | 'add-visit'
  id: string
  landmarkId: string
  photoId: string
  photoUrl?: string
  at: number
  shareWithSquad?: boolean
  note?: string
}
export type Action =
  | { type: 'start-trip'; id: string; at: number; mode?: 'solo' | 'squad'; name?: string }
  | { type: 'pause-trip' | 'resume-trip' | 'end-trip'; at: number }
  | { type: 'set-city'; cityId: CityId }
  | { type: 'set-target'; landmarkId: string | null }
  | { type: 'set-location-mode'; mode: LocationMode }
  | { type: 'set-map-theme'; theme: MapTheme }
  | { type: 'set-position'; position: Position | null }
  | { type: 'add-point'; point: Point }
  | CheckInAction
  | { type: 'set-public' | 'set-visit-public'; visitId: string; public: boolean }
  | { type: 'create-squad'; at: number; name?: string; code?: string }
  | { type: 'join-squad'; tripId: string; at: number }
  | { type: 'set-solo'; solo: boolean }
  | { type: 'leave-squad'; at: number }
  | { type: 'update-member'; member: Member }
  | { type: 'set-profile' | 'switch-profile'; profile: Profile }

export const createId = (prefix = 'item'): string => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export function createInitialState(at = Date.now()): AppState {
  const profile = { id: 'local-1', name: '旅行者' }
  return {
    version: 1, profile, profiles: [profile, { id: 'local-2', name: '同行者' }], preferences: {},
    cityId: 'nanjing', activeTripId: null, targetLandmarkId: null,
    trips: [], visits: [], points: [], unlocks: [], locationMode: 'demo', mapTheme: 'paper',
    position: { ...getCity('nanjing').startPosition, at, accuracy: 5, source: 'demo' },
  }
}

export const isValidPosition = (value: Position | null | undefined): value is Position => Boolean(value
  && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
  && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180
  && Number.isFinite(value.at) && value.at >= 0
  && Number.isFinite(value.accuracy) && value.accuracy >= 0
  && (value.source === 'demo' || value.source === 'device'))

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const phi = (b.lat - a.lat) * rad
  const lambda = (b.lng - a.lng) * rad
  const h = Math.sin(phi / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lambda / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, h))), Math.sqrt(Math.max(0, 1 - h)))
}

export function bearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const delta = (b.lng - a.lng) * rad
  const y = Math.sin(delta) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(delta)
  return (Math.atan2(y, x) / rad + 360) % 360
}

export const getActiveTrip = (state: AppState): Trip | undefined => state.trips.find((trip) => trip.id === state.activeTripId
  && trip.status !== 'ended' && (trip.userId === state.profile.id || trip.members.some((member) => member.id === state.profile.id && member.leftAt === undefined)))
export const getProfileTrips = (state: AppState, userId = state.profile.id): Trip[] => state.trips.filter((trip) => trip.userId === userId || trip.members.some((member) => member.id === userId))
export const getProfileUnlocks = (state: AppState, userId = state.profile.id): Unlock[] => state.unlocks.filter((unlock) => unlock.userId === userId)
export const getProfileVisits = (state: AppState, userId = state.profile.id): Visit[] => state.visits.filter((visit) => visit.recipientIds.includes(userId))
export const getLandmarkVisits = (state: AppState, landmarkId: string, userId = state.profile.id): Visit[] => getProfileVisits(state, userId).filter((visit) => visit.landmarkId === landmarkId).sort((a, b) => a.at - b.at)
export const getTripVisits = (state: AppState, tripId: string, userId = state.profile.id): Visit[] => getProfileVisits(state, userId).filter((visit) => visit.tripId === tripId).sort((a, b) => a.at - b.at)
export const getTripPoints = (state: AppState, tripId: string, userId = state.profile.id): Point[] => state.points.filter((point) => point.tripId === tripId && point.userId === userId).sort((a, b) => a.at - b.at)

export function getCityProgress(state: AppState, cityId = state.cityId, userId = state.profile.id) {
  const city = getCity(cityId)
  const allRegionIds = [...new Set(getProfileUnlocks(state, userId).filter((unlock) => unlock.cityId === cityId).map((unlock) => unlock.regionId))]
  const regionIds = allRegionIds.filter(id => city.regions.some(region => region.id === id))
  const legacyRegionIds = allRegionIds.filter(id => getRegion(id)?.legacy)
  const visits = getProfileVisits(state, userId).filter((visit) => visit.cityId === cityId)
  const landmarkIds = [...new Set(visits.map((visit) => visit.landmarkId))]
  return { regionIds, allRegionIds, legacyRegionIds, landmarkIds, unlocked: regionIds.length, total: city.regions.length,
    visited: landmarkIds.length, totalLandmarks: city.landmarks.length, visitCount: visits.length,
    ratio: city.regions.length ? regionIds.length / city.regions.length : 0 }
}

export function getSortedLandmarks(state: AppState): Array<Landmark & { distance: number | null }> {
  const position = state.position
  return getCity(state.cityId).landmarks.map((item) => ({ ...item, distance: position ? distanceMeters(position, item) : null }))
    .sort((a, b) => a.distance !== null && b.distance !== null ? a.distance - b.distance : 0)
}

export interface CheckInValidation { ok: boolean; reason: string; distanceMeters: number | null; ageMs: number | null }
export const MAX_POSITION_AGE_MS = 5 * 60_000
export const MAX_POSITION_ACCURACY_METERS = 100

export function validateCheckIn(state: AppState, landmarkId: string, now: number): CheckInValidation {
  const landmark = getLandmark(landmarkId)
  const position = state.position
  const distance = landmark && isValidPosition(position) ? distanceMeters(position, landmark) : null
  const ageMs = isValidPosition(position) ? now - position.at : null
  const result = (ok: boolean, reason: string): CheckInValidation => ({ ok, reason, distanceMeters: distance, ageMs })
  const trip = getActiveTrip(state)
  if (!landmark || landmark.cityId !== state.cityId) return result(false, '请在当前城市选择有效地标。')
  if (!trip || trip.cityId !== landmark.cityId) return result(false, '先开始本城的一次旅行，照片会保存在这一程。')
  if (trip.status === 'paused') return result(false, '旅行已暂停，恢复后可记录到访。')
  if (!position || !isValidPosition(position)) return result(false, '尚未取得可用位置；照片可以保留，获取位置后再提交。')
  if (ageMs === null || ageMs > MAX_POSITION_AGE_MS || ageMs < -5_000) return result(false, '位置已过期，请重新获取地标附近的位置。')
  if (position.accuracy > MAX_POSITION_ACCURACY_METERS) return result(false, '当前位置精度不足，请在开阔处重新获取。')
  if (distance === null || distance > landmark.arrivalRadiusMeters) return result(false, `需要到达地标附近 ${landmark.arrivalRadiusMeters} 米内再提交。`)
  return result(true, position.source === 'demo' ? '演示位置通过校验 · 此次记录会标为演示' : '当前位置通过基础校验')
}

function withPreference(state: AppState): AppState {
  return { ...state, preferences: { ...state.preferences, [state.profile.id]: {
    cityId: state.cityId, activeTripId: state.activeTripId, targetLandmarkId: state.targetLandmarkId, mapTheme: state.mapTheme ?? 'paper',
  } } }
}
function replaceTrip(state: AppState, trip: Trip): AppState {
  return { ...state, trips: state.trips.map((item) => item.id === trip.id ? trip : item) }
}

/** Pure state transitions. Event identifiers and timestamps come from the caller;
 * rejected/duplicate operations return the same state and never fabricate data.
 */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-map-theme': {
      if (!isMapTheme(action.theme) || action.theme === (state.mapTheme ?? 'paper')) return state
      return withPreference({ ...state, mapTheme: action.theme })
    }
    case 'set-city': {
      if (!cities.some((city) => city.id === action.cityId) || action.cityId === state.cityId) return state
      return withPreference({ ...state, cityId: action.cityId, targetLandmarkId: null, position: null })
    }
    case 'set-target': {
      if (action.landmarkId && getLandmark(action.landmarkId)?.cityId !== state.cityId) return state
      return withPreference({ ...state, targetLandmarkId: action.landmarkId })
    }
    case 'set-location-mode': return { ...state, locationMode: action.mode, position: null }
    case 'set-position': return action.position === null || isValidPosition(action.position) ? { ...state, position: action.position } : state
    case 'set-profile':
    case 'switch-profile': {
      if (!action.profile.id.trim()) return state
      const saved = withPreference(state)
      const preference = Object.hasOwn(saved.preferences, action.profile.id) ? saved.preferences[action.profile.id]
        : { cityId: 'nanjing' as CityId, activeTripId: null, targetLandmarkId: null, mapTheme: 'paper' as const }
      const trip = saved.trips.find((item) => item.id === preference.activeTripId && item.status !== 'ended')
      return { ...saved, profile: action.profile,
        profiles: saved.profiles.some((profile) => profile.id === action.profile.id)
          ? saved.profiles.map((profile) => profile.id === action.profile.id ? action.profile : profile)
          : [...saved.profiles, action.profile],
        ...preference, mapTheme: preference.mapTheme ?? 'paper', activeTripId: trip?.id ?? null, position: null }
    }
    case 'start-trip': {
      if (getActiveTrip(state) || state.trips.some((trip) => trip.id === action.id) || !action.id || !Number.isFinite(action.at)) return state
      const unlockIdsAtStart = getCityProgress(state).allRegionIds
      const trip: Trip = { id: action.id, userId: state.profile.id, cityId: state.cityId,
        name: action.name?.trim() || `${getCity(state.cityId).name} · 自在探索`, mode: action.mode ?? 'solo', status: 'active',
        startedAt: action.at, members: [{ ...state.profile, joinedAt: action.at, solo: false, unlockIdsAtJoin: unlockIdsAtStart }], unlockIdsAtStart }
      if (trip.mode === 'squad') { trip.squadName = '这一程的小队'; trip.squadCode = action.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() }
      return withPreference({ ...state, activeTripId: trip.id, trips: [...state.trips, trip] })
    }
    case 'pause-trip':
    case 'resume-trip':
    case 'end-trip': {
      const trip = getActiveTrip(state)
      if (!trip || !Number.isFinite(action.at) || action.at < trip.startedAt) return state
      const status = action.type === 'end-trip' ? 'ended' : action.type === 'pause-trip' ? 'paused' : 'active'
      const next = replaceTrip(state, { ...trip, status, ...(status === 'ended' ? { endedAt: action.at } : {}) })
      return withPreference(status === 'ended' ? { ...next, activeTripId: null, targetLandmarkId: null } : next)
    }
    case 'add-point': {
      const trip = getActiveTrip(state)
      const point = action.point
      if (!trip || trip.status !== 'active' || trip.id !== point.tripId || trip.cityId !== point.cityId
        || point.userId !== state.profile.id || !isValidPosition(point) || point.at < trip.startedAt
        || !point.id || state.points.some((item) => item.id === point.id)) return state
      return { ...state, points: [...state.points, { ...point }] }
    }
    case 'check-in':
    case 'add-visit': {
      if (!action.id || !action.photoId || state.visits.some((visit) => visit.id === action.id) || !Number.isFinite(action.at)) return state
      if (!validateCheckIn(state, action.landmarkId, action.at).ok) return state
      const trip = getActiveTrip(state)!
      if (action.at < trip.startedAt) return state
      const landmark = getLandmark(action.landmarkId)!
      const self = trip.members.find((member) => member.id === state.profile.id)
      const shared = trip.mode === 'squad' && (action.shareWithSquad ?? !self?.solo)
      const recipientIds = shared ? [...new Set([state.profile.id, ...trip.members.filter((member) => member.joinedAt <= action.at
        && (member.leftAt === undefined || member.leftAt > action.at)).map((member) => member.id)])] : [state.profile.id]
      const personalVisits = state.visits.filter((visit) => visit.landmarkId === action.landmarkId && visit.userId === state.profile.id)
      const priorVisits = getLandmarkVisits(state, action.landmarkId)
      const owned = getCityProgress(state).regionIds
      const unlockable = landmark.tier === 1 ? landmark.regionIds : []
      const newlyUnlocked = unlockable.filter((id) => !owned.includes(id))
      const visit: Visit = { id: action.id, tripId: trip.id, cityId: trip.cityId, landmarkId: landmark.id,
        userId: state.profile.id, photoId: action.photoId, ...(action.photoUrl ? { photoUrl: action.photoUrl } : {}),
        at: action.at, source: shared ? 'squad' : 'personal', recipientIds, firstActivation: priorVisits.length === 0,
        firstPersonalVisit: personalVisits.length === 0, unlockedRegionIds: newlyUnlocked, public: false, contentVersion: getCity(trip.cityId).contentVersion,
        demo: state.position!.source === 'demo', position: { ...state.position! }, ...(action.note ? { note: action.note } : {}) }
      const unlocks = [...state.unlocks]
      for (const userId of recipientIds) for (const regionId of unlockable) {
        if (!unlocks.some((unlock) => unlock.userId === userId && unlock.regionId === regionId)) {
          unlocks.push({ id: `${userId}:${regionId}`, userId, cityId: trip.cityId, regionId, at: action.at, visitId: visit.id,
            source: userId === state.profile.id ? 'personal' : 'squad' })
        }
      }
      return { ...state, visits: [...state.visits, visit], unlocks }
    }
    case 'set-public':
    case 'set-visit-public': {
      if (!state.visits.some((visit) => visit.id === action.visitId && visit.userId === state.profile.id)) return state
      return { ...state, visits: state.visits.map((visit) => visit.id === action.visitId ? { ...visit, public: action.public } : visit) }
    }
    case 'create-squad': {
      const trip = getActiveTrip(state)
      if (!trip) return state
      return replaceTrip(state, { ...trip, mode: 'squad', squadName: action.name?.trim() || '这一程的小队',
        squadCode: action.code?.trim().toUpperCase() || trip.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() })
    }
    case 'join-squad': {
      const trip = state.trips.find((item) => item.id === action.tripId && item.mode === 'squad' && item.status !== 'ended')
      if (!trip || !Number.isFinite(action.at) || action.at < trip.startedAt || (getActiveTrip(state) && state.activeTripId !== trip.id)) return state
      const oldMember = trip.members.find((member) => member.id === state.profile.id)
      const member: Member = { ...state.profile, joinedAt: action.at, solo: false,
        unlockIdsAtJoin: getCityProgress(state, trip.cityId).allRegionIds }
      const next = replaceTrip(state, { ...trip, members: oldMember
        ? trip.members.map((item) => item.id === member.id ? oldMember.leftAt === undefined ? oldMember : member : item)
        : [...trip.members, member] })
      return withPreference({ ...next, cityId: trip.cityId, activeTripId: trip.id, targetLandmarkId: null, position: null })
    }
    case 'set-solo': {
      const trip = getActiveTrip(state)
      if (!trip || trip.mode !== 'squad') return state
      return replaceTrip(state, { ...trip, members: trip.members.map((member) => member.id === state.profile.id ? { ...member, solo: action.solo } : member) })
    }
    case 'leave-squad': {
      const trip = getActiveTrip(state)
      if (!trip || trip.mode !== 'squad' || !Number.isFinite(action.at) || action.at < trip.startedAt) return state
      const next = replaceTrip(state, { ...trip, members: trip.members.map((member) => member.id === state.profile.id ? { ...member, leftAt: action.at } : member) })
      return withPreference({ ...next, activeTripId: null, targetLandmarkId: null })
    }
    case 'update-member': {
      const trip = getActiveTrip(state)
      if (!trip || trip.mode !== 'squad' || !action.member.id || !Number.isFinite(action.member.joinedAt)) return state
      const members = trip.members.some((member) => member.id === action.member.id)
        ? trip.members.map((member) => member.id === action.member.id ? { ...action.member } : member)
        : [...trip.members, { ...action.member, unlockIdsAtJoin: action.member.unlockIdsAtJoin ?? getCityProgress(state, trip.cityId, action.member.id).allRegionIds }]
      return replaceTrip(state, { ...trip, members })
    }
  }
}

export function getReplayState(state: AppState, tripId: string, throughAt = Infinity, userId = state.profile.id) {
  const trip = getProfileTrips(state, userId).find((item) => item.id === tripId)
  if (!trip) return { trip: undefined, visits: [] as Visit[], points: [] as Point[], regionIds: [] as string[], unlockedRegionIds: [] as string[], newRegionIds: [] as string[] }
  const member = trip.members.find((item) => item.id === userId)
  const baseline = trip.userId === userId ? trip.unlockIdsAtStart : member?.unlockIdsAtJoin ?? []
  const visits = getTripVisits(state, tripId, userId).filter((visit) => visit.at <= throughAt)
  const points = getTripPoints(state, tripId, userId).filter((point) => point.at <= throughAt)
  const newRegionIds = [...new Set(state.unlocks.filter((unlock) => unlock.userId === userId && unlock.at <= throughAt
    && visits.some((visit) => visit.id === unlock.visitId)).map((unlock) => unlock.regionId))]
  const regionIds = [...new Set([...baseline, ...newRegionIds])]
  return { trip, visits, points, regionIds, unlockedRegionIds: regionIds, newRegionIds }
}

/** Validate untrusted backup/local JSON before it can become application state. */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as AppState
  if (state.version !== 1 || !state.profile || typeof state.profile.id !== 'string' || typeof state.profile.name !== 'string'
    || !cities.some((city) => city.id === state.cityId) || !Array.isArray(state.profiles)
    || !state.preferences || typeof state.preferences !== 'object' || Array.isArray(state.preferences)
    || !Array.isArray(state.trips) || !Array.isArray(state.visits) || !Array.isArray(state.points) || !Array.isArray(state.unlocks)
    || !['demo', 'device'].includes(state.locationMode) || (state.position !== null && !isValidPosition(state.position))
    || (state.mapTheme !== undefined && !isMapTheme(state.mapTheme))) return false
  if (!state.profiles.every((profile) => profile && typeof profile.id === 'string' && typeof profile.name === 'string')) return false
  if (!Object.values(state.preferences).every((preference) => preference && cities.some((city) => city.id === preference.cityId)
    && (preference.mapTheme === undefined || isMapTheme(preference.mapTheme))
    && (preference.activeTripId === null || typeof preference.activeTripId === 'string')
    && (preference.targetLandmarkId === null || getLandmark(preference.targetLandmarkId)?.cityId === preference.cityId))) return false
  if (!state.trips.every((trip) => trip && typeof trip.id === 'string' && typeof trip.userId === 'string' && typeof trip.name === 'string'
    && cities.some((city) => city.id === trip.cityId) && Number.isFinite(trip.startedAt)
    && ['solo', 'squad'].includes(trip.mode) && ['active', 'paused', 'ended'].includes(trip.status)
    && (trip.endedAt === undefined || (Number.isFinite(trip.endedAt) && trip.endedAt >= trip.startedAt))
    && (trip.status !== 'ended' || trip.endedAt !== undefined)
    && Array.isArray(trip.unlockIdsAtStart) && trip.unlockIdsAtStart.every((id) => getRegion(id)?.cityId === trip.cityId)
    && Array.isArray(trip.members) && trip.members.every((member) => member && typeof member.id === 'string'
      && typeof member.name === 'string' && typeof member.solo === 'boolean' && Number.isFinite(member.joinedAt)
      && (member.leftAt === undefined || Number.isFinite(member.leftAt))
      && (member.unlockIdsAtJoin === undefined || (Array.isArray(member.unlockIdsAtJoin)
        && member.unlockIdsAtJoin.every((id) => getRegion(id)?.cityId === trip.cityId)))))) return false
  if (!state.visits.every((visit) => visit && typeof visit.id === 'string' && typeof visit.photoId === 'string' && typeof visit.userId === 'string'
    && state.trips.some((trip) => trip.id === visit.tripId && trip.cityId === visit.cityId)
    && getLandmark(visit.landmarkId)?.cityId === visit.cityId && Number.isFinite(visit.at) && isValidPosition(visit.position)
    && typeof visit.public === 'boolean' && typeof visit.demo === 'boolean' && visit.demo === (visit.position.source === 'demo') && ['personal', 'squad'].includes(visit.source)
    && typeof visit.firstActivation === 'boolean' && typeof visit.firstPersonalVisit === 'boolean'
    && Array.isArray(visit.recipientIds) && visit.recipientIds.includes(visit.userId) && visit.recipientIds.every((id) => typeof id === 'string')
    && (visit.contentVersion === undefined || visit.contentVersion === getCity(visit.cityId).contentVersion)
    && Array.isArray(visit.unlockedRegionIds) && visit.unlockedRegionIds.every((id) => allowedVisitRegions(visit.landmarkId, visit.contentVersion).includes(id)))) return false
  if (!state.points.every((point) => point && typeof point.id === 'string' && typeof point.userId === 'string' && isValidPosition(point)
    && state.trips.some((trip) => trip.id === point.tripId && trip.cityId === point.cityId))) return false
  if (!state.unlocks.every((unlock) => unlock && typeof unlock.id === 'string' && typeof unlock.userId === 'string' && Number.isFinite(unlock.at)
    && getRegion(unlock.regionId)?.cityId === unlock.cityId && ['personal', 'squad'].includes(unlock.source)
    && state.visits.some((visit) => visit.id === unlock.visitId && visit.cityId === unlock.cityId && visit.recipientIds.includes(unlock.userId)
      && allowedVisitRegions(visit.landmarkId, visit.contentVersion).includes(unlock.regionId) && unlock.at === visit.at))) return false
  if (new Set(state.trips.map((trip) => trip.id)).size !== state.trips.length
    || new Set(state.visits.map((visit) => visit.id)).size !== state.visits.length
    || new Set(state.points.map((point) => point.id)).size !== state.points.length
    || new Set(state.unlocks.map((unlock) => `${unlock.userId}:${unlock.regionId}`)).size !== state.unlocks.length) return false
  if (state.activeTripId !== null && !state.trips.some((trip) => trip.id === state.activeTripId)) return false
  if (state.targetLandmarkId !== null && getLandmark(state.targetLandmarkId)?.cityId !== state.cityId) return false
  return true
}

/** Extend valid v1 records without changing their trips, photos, points or rights. */
export function normalizeAppState(state: AppState): AppState {
  const preferences = Object.fromEntries(Object.entries(state.preferences).map(([id, value]) => [id, { ...value, mapTheme: value.mapTheme ?? 'paper' }]))
  const mapTheme = state.mapTheme ?? preferences[state.profile.id]?.mapTheme ?? 'paper'
  return { ...state, mapTheme, preferences: { ...preferences, [state.profile.id]: {
    cityId: state.cityId, activeTripId: state.activeTripId, targetLandmarkId: state.targetLandmarkId, mapTheme,
  } } }
}
