import { allowedVisitRegions, cities, getCity, getLandmark, getRegion, type CityId } from '../data/cities'
import { distanceMeters, MAX_POSITION_ACCURACY_METERS, MAX_POSITION_AGE_MS, type AppState, type Member, type Position, type Profile, type Trip, type Unlock, type Visit } from './model'

/** A local test workspace contains its demo profiles; this is not an auth token. */
export interface SyncSnapshot { version: 1; profiles: Profile[]; trips: Trip[]; visits: Visit[]; unlocks: Unlock[] }
export class SyncProtocolError extends Error {
  constructor(message: string, public readonly code: 'INVALID_SNAPSHOT' | 'SYNC_CONFLICT' = 'INVALID_SNAPSHOT') {
    super(message)
    this.name = 'SyncProtocolError'
  }
}

const LIMITS = { profiles: 100, trips: 10_000, visits: 20_000, unlocks: 10_000, members: 100, regions: 100 } as const
const fail = (detail: string): never => { throw new SyncProtocolError(`Invalid sync snapshot: ${detail}`) }
const conflict = (detail: string): never => { throw new SyncProtocolError(`Sync conflict: ${detail}`, 'SYNC_CONFLICT') }
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const byId = <T extends { id: string }>(a: T, b: T): number => compare(a.id, b.id)
const byVisit = (a: Visit, b: Visit): number => a.at - b.at || byId(a, b)
const owns = (object: object, key: string): boolean => Object.hasOwn(object, key)

function record(value: unknown, keys: readonly string[], context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${context} must be an object`)
  const object = value as Record<string, unknown>
  if (Object.keys(object).some(key => !keys.includes(key))) return fail(`${context} has unsupported fields`)
  return object
}
function text(value: unknown, context: string, max = 200, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return fail(`${context} is invalid`)
  return value
}
function identifier(value: unknown, context: string): string {
  const id = text(value, context, 160)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id)) return fail(`${context} is invalid`)
  return id
}
function number(value: unknown, context: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(`${context} is invalid`)
  return value
}
function timestamp(value: unknown, context: string): number { return number(value, context, 0, 8_640_000_000_000_000) }
function bool(value: unknown, context: string): boolean { if (typeof value !== 'boolean') return fail(`${context} must be boolean`); return value }
function array(value: unknown, max: number, context: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(`${context} exceeds its limit or is not an array`)
  return value
}
function unique<T>(values: T[], key: (value: T) => string, context: string): T[] {
  if (new Set(values.map(key)).size !== values.length) return fail(`${context} contains duplicate identifiers`)
  return values
}
function city(value: unknown): CityId {
  const match = cities.find(item => item.id === value)
  if (!match) return fail('unknown city')
  return match.id
}
function regionIds(value: unknown, cityId: CityId, context: string): string[] {
  return unique(array(value, LIMITS.regions, context).map(item => {
    const id = identifier(item, context)
    if (getRegion(id)?.cityId !== cityId) return fail(`${context} contains a region from another city`)
    return id
  }), id => id, context).sort(compare)
}
function parsePosition(value: unknown): Position {
  const input = record(value, ['lat', 'lng', 'at', 'accuracy', 'speed', 'heading', 'source'], 'position')
  if (input.source !== 'demo' && input.source !== 'device') return fail('position source is invalid')
  const output: Position = {
    lat: number(input.lat, 'latitude', -90, 90), lng: number(input.lng, 'longitude', -180, 180),
    at: timestamp(input.at, 'position time'), accuracy: number(input.accuracy, 'accuracy', 0, MAX_POSITION_ACCURACY_METERS), source: input.source,
  }
  if (input.speed !== undefined) output.speed = input.speed === null ? null : number(input.speed, 'speed', -1, 10_000)
  if (input.heading !== undefined) output.heading = input.heading === null ? null : number(input.heading, 'heading', -1, 360)
  return output
}
function parseProfile(value: unknown): Profile {
  const input = record(value, ['id', 'name'], 'profile')
  return { id: identifier(input.id, 'profile id'), name: text(input.name, 'profile name') }
}
function parseMember(value: unknown, cityId: CityId, startedAt: number): Member {
  const input = record(value, ['id', 'name', 'joinedAt', 'leftAt', 'solo', 'unlockIdsAtJoin'], 'member')
  const joinedAt = timestamp(input.joinedAt, 'membership time')
  if (joinedAt < startedAt) return fail('membership predates trip')
  const output: Member = { id: identifier(input.id, 'member id'), name: text(input.name, 'member name'), joinedAt, solo: bool(input.solo, 'solo') }
  if (output.solo) return fail('solo preference must remain on this device')
  if (input.leftAt !== undefined) {
    output.leftAt = timestamp(input.leftAt, 'leave time')
    if (output.leftAt < joinedAt) return fail('leave time predates membership')
  }
  if (input.unlockIdsAtJoin !== undefined) output.unlockIdsAtJoin = regionIds(input.unlockIdsAtJoin, cityId, 'member baseline')
  return output
}
function parseTrip(value: unknown): Trip {
  const input = record(value, ['id', 'userId', 'cityId', 'name', 'mode', 'status', 'startedAt', 'endedAt', 'members', 'unlockIdsAtStart', 'squadName', 'squadCode'], 'trip')
  const cityId = city(input.cityId)
  const startedAt = timestamp(input.startedAt, 'trip time')
  if (input.mode !== 'solo' && input.mode !== 'squad') return fail('trip mode is invalid')
  if (input.status !== 'active' && input.status !== 'ended') return fail('trip status must be active or ended')
  const output: Trip = {
    id: identifier(input.id, 'trip id'), userId: identifier(input.userId, 'trip owner'), cityId,
    name: text(input.name, 'trip name'), mode: input.mode, status: input.status, startedAt,
    members: unique(array(input.members, LIMITS.members, 'members').map(member => parseMember(member, cityId, startedAt)), member => member.id, 'members').sort(byId),
    unlockIdsAtStart: regionIds(input.unlockIdsAtStart, cityId, 'trip baseline'),
  }
  if (input.endedAt !== undefined) output.endedAt = timestamp(input.endedAt, 'end time')
  if ((output.status === 'ended') !== (output.endedAt !== undefined) || (output.endedAt !== undefined && output.endedAt < startedAt)) return fail('trip end time is invalid')
  if (input.squadName !== undefined) output.squadName = text(input.squadName, 'squad name')
  if (input.squadCode !== undefined) output.squadCode = text(input.squadCode, 'squad code', 40)
  if (!output.members.some(member => member.id === output.userId)) return fail('trip owner is not a member')
  return output
}
function parseVisit(value: unknown): Visit {
  const input = record(value, ['contentVersion', 'id', 'tripId', 'cityId', 'landmarkId', 'userId', 'photoId', 'photoUrl', 'at', 'source', 'recipientIds', 'firstActivation', 'firstPersonalVisit', 'unlockedRegionIds', 'public', 'demo', 'position', 'note'], 'visit')
  const cityId = city(input.cityId)
  const id = identifier(input.id, 'visit id')
  const landmarkId = identifier(input.landmarkId, 'landmark id')
  const landmark = getLandmark(landmarkId)
  if (!landmark || landmark.cityId !== cityId) return fail('visit landmark is invalid')
  if (input.source !== 'personal' && input.source !== 'squad') return fail('visit source is invalid')
  const output: Visit = {
    id, tripId: identifier(input.tripId, 'visit trip'), cityId, landmarkId, userId: identifier(input.userId, 'visit owner'),
    photoId: text(input.photoId, 'photo id', 165), at: timestamp(input.at, 'visit time'), source: input.source,
    recipientIds: unique(array(input.recipientIds, LIMITS.members, 'recipients').map(recipient => identifier(recipient, 'recipient')), item => item, 'recipients').sort(compare),
    firstActivation: bool(input.firstActivation, 'first activation'), firstPersonalVisit: bool(input.firstPersonalVisit, 'first personal visit'),
    unlockedRegionIds: regionIds(input.unlockedRegionIds, cityId, 'visit regions'),
    public: bool(input.public, 'public'), demo: bool(input.demo, 'demo'), position: parsePosition(input.position),
  }
  if (output.public || output.photoId !== syncPhotoId(id)) return fail('visit contains device-only publication or photo identifiers')
  if (input.contentVersion !== undefined) {
    output.contentVersion = text(input.contentVersion, 'content version', 100)
    if (output.contentVersion !== getCity(cityId).contentVersion) return fail('unknown content version')
  }
  if (input.photoUrl !== undefined) {
    output.photoUrl = text(input.photoUrl, 'photo URL', 100)
    if (!output.demo || output.photoUrl !== `/images/${cityId}.png`) return fail('external or non-demo photo URL')
  }
  if (input.note !== undefined) output.note = text(input.note, 'visit note', 200, true)
  if (output.demo !== (output.position.source === 'demo')) return fail('visit evidence mode mismatch')
  if (!output.recipientIds.includes(output.userId) || (output.source === 'personal' && output.recipientIds.length !== 1)) return fail('visit recipients are invalid')
  if (output.at - output.position.at > MAX_POSITION_AGE_MS || output.at - output.position.at < -5_000) return fail('visit evidence was stale at arrival')
  if (distanceMeters(output.position, landmark) > landmark.arrivalRadiusMeters + 1e-6) return fail('visit evidence is outside the arrival radius')
  if (output.unlockedRegionIds.some(region => !allowedVisitRegions(landmarkId, output.contentVersion).includes(region))) return fail('visit cannot unlock its supplied regions')
  return output
}
function parseUnlock(value: unknown): Unlock {
  const input = record(value, ['id', 'userId', 'cityId', 'regionId', 'at', 'visitId', 'source'], 'unlock')
  if (input.source !== 'personal' && input.source !== 'squad') return fail('unlock source is invalid')
  const output: Unlock = { id: text(input.id, 'unlock id', 330), userId: identifier(input.userId, 'unlock owner'), cityId: city(input.cityId),
    regionId: identifier(input.regionId, 'unlock region'), at: timestamp(input.at, 'unlock time'), visitId: identifier(input.visitId, 'unlock visit'), source: input.source }
  if (output.id !== `${output.userId}:${output.regionId}` || getRegion(output.regionId)?.cityId !== output.cityId) return fail('unlock key is invalid')
  return output
}

export function emptySyncSnapshot(): SyncSnapshot { return { version: 1, profiles: [], trips: [], visits: [], unlocks: [] } }
export function syncPhotoId(visitId: string): string { return `sync-${identifier(visitId, 'visit id')}` }

/** Canonical data, independent of arrival order. Only visits confer rights. */
function derive(snapshot: SyncSnapshot): SyncSnapshot {
  const unlocks = new Map<string, Unlock>()
  const personalVisits = new Set<string>()
  const receivedVisits = new Set<string>()
  const visits = snapshot.visits.slice().sort(byVisit).map(visit => {
    const personalKey = `${visit.userId}:${visit.landmarkId}`
    const firstActivation = !receivedVisits.has(personalKey)
    const firstPersonalVisit = !personalVisits.has(personalKey)
    const unlockedRegionIds: string[] = []
    for (const regionId of allowedVisitRegions(visit.landmarkId, visit.contentVersion).slice().sort(compare)) {
      for (const userId of visit.recipientIds) {
        const id = `${userId}:${regionId}`
        if (!unlocks.has(id)) {
          unlocks.set(id, { id, userId, cityId: visit.cityId, regionId, at: visit.at, visitId: visit.id, source: userId === visit.userId ? 'personal' : 'squad' })
          if (userId === visit.userId) unlockedRegionIds.push(regionId)
        }
      }
    }
    personalVisits.add(personalKey)
    for (const recipient of visit.recipientIds) receivedVisits.add(`${recipient}:${visit.landmarkId}`)
    return { ...visit, firstActivation, firstPersonalVisit, unlockedRegionIds }
  })
  if (unlocks.size > LIMITS.unlocks) return fail('derived unlocks exceed the limit')
  return { version: 1, profiles: snapshot.profiles.slice().sort(byId), trips: snapshot.trips.slice().sort(byId), visits, unlocks: [...unlocks.values()].sort(byId) }
}

/** Validate an untrusted wire DTO. Extra fields are rejected, never persisted. */
export function validateSyncSnapshot(value: unknown): SyncSnapshot {
  const input = record(value, ['version', 'profiles', 'trips', 'visits', 'unlocks'], 'snapshot')
  if (input.version !== 1) return fail('unsupported version')
  const profiles = unique(array(input.profiles, LIMITS.profiles, 'profiles').map(parseProfile), profile => profile.id, 'profiles')
  const trips = unique(array(input.trips, LIMITS.trips, 'trips').map(parseTrip), trip => trip.id, 'trips')
  const visits = unique(array(input.visits, LIMITS.visits, 'visits').map(parseVisit), visit => visit.id, 'visits')
  const unlocks = unique(array(input.unlocks, LIMITS.unlocks, 'unlocks').map(parseUnlock), unlock => unlock.id, 'unlocks')
  const profileIds = new Set(profiles.map(profile => profile.id))
  const tripById = new Map(trips.map(trip => [trip.id, trip]))
  const visitById = new Map(visits.map(visit => [visit.id, visit]))
  for (const trip of trips) {
    if (!profileIds.has(trip.userId) || trip.members.some(member => !profileIds.has(member.id))) return fail('trip refers to an unknown profile')
  }
  for (const visit of visits) {
    const trip = tripById.get(visit.tripId)
    if (!trip || trip.cityId !== visit.cityId || visit.at < trip.startedAt) return fail('visit trip reference or time is invalid')
    if (!profileIds.has(visit.userId) || visit.recipientIds.some(id => !profileIds.has(id) || !trip.members.some(member => member.id === id))) return fail('visit refers to an unknown member')
    if (visit.source === 'squad' && trip.mode !== 'squad') return fail('shared visit requires a squad trip')
    // Rejoining overwrites Member.joinedAt in the v1 model. Current membership
    // times cannot validate a historical recipient snapshot without losing it.
  }
  for (const unlock of unlocks) {
    const visit = visitById.get(unlock.visitId)
    if (!visit || visit.cityId !== unlock.cityId || visit.at !== unlock.at || !visit.recipientIds.includes(unlock.userId)
      || !allowedVisitRegions(visit.landmarkId, visit.contentVersion).includes(unlock.regionId)
      || unlock.source !== (unlock.userId === visit.userId ? 'personal' : 'squad')) return fail('unlock has no matching arrival evidence')
  }
  return derive({ version: 1, profiles, trips, visits, unlocks })
}

/** Device location, tracks, UI preferences and publication never leave here. */
export function projectSyncState(state: AppState): SyncSnapshot {
  const profiles = new Map(state.profiles.map(profile => [profile.id, { id: profile.id, name: profile.name }]))
  profiles.set(state.profile.id, { id: state.profile.id, name: state.profile.name })
  const trips: Trip[] = state.trips.map(trip => {
    for (const member of trip.members) if (!profiles.has(member.id)) profiles.set(member.id, { id: member.id, name: member.name })
    return { id: trip.id, userId: trip.userId, cityId: trip.cityId, name: trip.name, mode: trip.mode,
      status: trip.status === 'ended' ? 'ended' : 'active', startedAt: trip.startedAt,
      ...(trip.status === 'ended' ? { endedAt: trip.endedAt } : {}),
      members: trip.members.map(member => ({ id: member.id, name: member.name, joinedAt: member.joinedAt, solo: false,
        ...(member.leftAt !== undefined ? { leftAt: member.leftAt } : {}),
        ...(member.unlockIdsAtJoin !== undefined ? { unlockIdsAtJoin: member.unlockIdsAtJoin.slice() } : {}) })),
      unlockIdsAtStart: trip.unlockIdsAtStart.slice(), ...(trip.squadName !== undefined ? { squadName: trip.squadName } : {}), ...(trip.squadCode !== undefined ? { squadCode: trip.squadCode } : {}) }
  })
  const visits = state.visits.map(visit => ({ id: visit.id, tripId: visit.tripId, cityId: visit.cityId, landmarkId: visit.landmarkId,
    userId: visit.userId, photoId: syncPhotoId(visit.id), ...(visit.photoUrl !== undefined ? { photoUrl: visit.photoUrl } : {}),
    at: visit.at, source: visit.source, recipientIds: visit.recipientIds.slice(), firstActivation: visit.firstActivation,
    firstPersonalVisit: visit.firstPersonalVisit, unlockedRegionIds: visit.unlockedRegionIds.slice(), public: false,
    demo: visit.demo, position: { lat: visit.position.lat, lng: visit.position.lng, at: visit.position.at, accuracy: visit.position.accuracy,
      source: visit.position.source, ...(visit.position.speed !== undefined ? { speed: visit.position.speed } : {}), ...(visit.position.heading !== undefined ? { heading: visit.position.heading } : {}) },
    ...(visit.contentVersion !== undefined ? { contentVersion: visit.contentVersion } : {}), ...(visit.note !== undefined ? { note: visit.note } : {}) }))
  return validateSyncSnapshot({ version: 1, profiles: [...profiles.values()], trips, visits,
    unlocks: state.unlocks.map(unlock => ({ id: `${unlock.userId}:${unlock.regionId}`, userId: unlock.userId, cityId: unlock.cityId,
      regionId: unlock.regionId, at: unlock.at, visitId: unlock.visitId, source: unlock.source })) })
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort(compare)
    .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function snapshotFingerprint(snapshot: SyncSnapshot): string { return canonical(validateSyncSnapshot(snapshot)) }
function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right) }
function unionStrings(left: string[] = [], right: string[] = []): string[] { return [...new Set([...left, ...right])].sort(compare) }
function mergeMember(left: Member, right: Member): Member {
  if (left.joinedAt !== right.joinedAt) return { ...(left.joinedAt > right.joinedAt ? left : right) }
  return { ...left, name: compare(left.name, right.name) <= 0 ? left.name : right.name, solo: false,
    ...(left.leftAt !== undefined || right.leftAt !== undefined ? { leftAt: Math.max(left.leftAt ?? 0, right.leftAt ?? 0) } : {}),
    ...(left.unlockIdsAtJoin !== undefined || right.unlockIdsAtJoin !== undefined ? { unlockIdsAtJoin: unionStrings(left.unlockIdsAtJoin, right.unlockIdsAtJoin) } : {}) }
}
function mergeTrip(left: Trip, right: Trip): Trip {
  for (const field of ['userId', 'cityId', 'name', 'startedAt', 'unlockIdsAtStart'] as const) if (!same(left[field], right[field])) return conflict(`trip ${left.id} changed ${field}`)
  for (const field of ['squadName', 'squadCode'] as const) if (owns(left, field) && owns(right, field) && left[field] !== right[field]) return conflict(`trip ${left.id} changed ${field}`)
  const members = new Map(left.members.map(member => [member.id, member]))
  for (const member of right.members) members.set(member.id, members.has(member.id) ? mergeMember(members.get(member.id)!, member) : member)
  const ended = left.status === 'ended' || right.status === 'ended'
  return { ...left, mode: left.mode === 'squad' || right.mode === 'squad' ? 'squad' : 'solo', status: ended ? 'ended' : 'active',
    ...(ended ? { endedAt: Math.min(left.endedAt ?? Infinity, right.endedAt ?? Infinity) } : {}), members: [...members.values()].sort(byId),
    ...(left.squadName !== undefined || right.squadName !== undefined ? { squadName: left.squadName ?? right.squadName } : {}),
    ...(left.squadCode !== undefined || right.squadCode !== undefined ? { squadCode: left.squadCode ?? right.squadCode } : {}) }
}
function visitEvidence(visit: Visit): unknown {
  const { firstActivation: _activation, firstPersonalVisit: _personal, unlockedRegionIds: _unlocks, ...evidence } = visit
  return evidence
}
export function mergeSyncSnapshots(left: SyncSnapshot, right: SyncSnapshot): SyncSnapshot {
  const a = validateSyncSnapshot(left)
  const b = validateSyncSnapshot(right)
  const profiles = new Map(a.profiles.map(profile => [profile.id, profile]))
  for (const profile of b.profiles) {
    const previous = profiles.get(profile.id)
    profiles.set(profile.id, previous && compare(previous.name, profile.name) <= 0 ? previous : profile)
  }
  const trips = new Map(a.trips.map(trip => [trip.id, trip]))
  for (const trip of b.trips) trips.set(trip.id, trips.has(trip.id) ? mergeTrip(trips.get(trip.id)!, trip) : trip)
  const visits = new Map(a.visits.map(visit => [visit.id, visit]))
  for (const visit of b.visits) {
    const previous = visits.get(visit.id)
    if (previous && !same(visitEvidence(previous), visitEvidence(visit))) return conflict(`visit ${visit.id} changed immutable evidence`)
    visits.set(visit.id, visit)
  }
  return validateSyncSnapshot({ version: 1, profiles: [...profiles.values()], trips: [...trips.values()], visits: [...visits.values()], unlocks: [] })
}

/** Apply against the latest local state, preserving unsent work and device UI. */
export function applySyncSnapshot(state: AppState, snapshot: SyncSnapshot): AppState {
  const merged = mergeSyncSnapshots(projectSyncState(state), snapshot)
  const localTrips = new Map(state.trips.map(trip => [trip.id, trip]))
  const localVisits = new Map(state.visits.map(visit => [visit.id, visit]))
  // Profile identity stays selected locally; shared names must converge as well
  // or every sync would enqueue the same losing name forever.
  const sharedProfile = merged.profiles.find(profile => profile.id === state.profile.id)!
  const profile = sharedProfile.name === state.profile.name ? state.profile : sharedProfile
  const trips = merged.trips.map(trip => {
    const local = localTrips.get(trip.id)
    return { ...trip, status: trip.status === 'ended' ? 'ended' as const : local?.status ?? 'active' as const,
      members: trip.members.map(member => ({ ...member, solo: local?.members.find(item => item.id === member.id)?.solo ?? false })) }
  })
  const visits = merged.visits.map(visit => {
    const local = localVisits.get(visit.id)
    return { ...visit, photoId: local?.photoId ?? visit.photoId, public: local?.public ?? false }
  })
  // Keep the current entrance if still eligible; never adopt another device's.
  const active = trips.find(trip => trip.id === state.activeTripId && trip.status !== 'ended'
    && (trip.userId === state.profile.id || trip.members.some(member => member.id === state.profile.id && member.leftAt === undefined)))
  return { ...state, profile, profiles: merged.profiles, trips, visits, unlocks: merged.unlocks, activeTripId: active?.id ?? null }
}
