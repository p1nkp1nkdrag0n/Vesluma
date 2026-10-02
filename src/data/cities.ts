import plan from './map/city-plans.json'
import legacy from './map/legacy-regions.json'

export type CityId = 'nanjing' | 'xian' | 'beijing' | 'shanghai' | 'hangzhou' | 'chengdu' | 'guangzhou' | 'shenzhen' | 'hongkong' | 'macau'
export type Coordinate = [number, number] // GeoJSON: [longitude, latitude], WGS84
export interface CityGeometry { type: 'MultiPolygon'; coordinates: Coordinate[][][] }
export type LandmarkTier = 1 | 2 | 3
export const tierLabels: Record<LandmarkTier, string> = { 1: '一级 · 开图地标', 2: '二级 · 重点游览', 3: '三级 · 到访记录' }
export interface Landmark {
  id: string
  cityId: CityId
  name: string
  shortName: string
  category: 'arrival' | 'heritage' | 'culture'
  tier: LandmarkTier
  lat: number
  lng: number
  description: string
  photoSubject: string
  /** Membership and unlock authority are independent. */
  regionId: string
  /** Empty for tiers 2 and 3. */
  regionIds: string[]
  arrivalRadiusMeters: number
  cover: string
  verification: 'candidate'
  sourceUrl: string
}
export interface Region {
  id: string
  cityId: CityId
  name: string
  geometry: CityGeometry
  verification: 'planned' | 'illustrative'
  boundaryNote: string
  version: string
  anchorLandmarkId: string
  areaKm2: number
  districtNames: string[]
  heat: string
  rationale: string
  evidenceIds: string[]
  legacy?: boolean
}
export interface City {
  id: CityId
  name: string
  enName: string
  subtitle: string
  /** Explain special map coverage without implying access or travel permission. */
  coverageNote?: string
  center: [number, number] // Leaflet: [latitude, longitude]
  startPosition: { lat: number; lng: number }
  zoom: number
  bounds: [[number, number], [number, number]]
  boundary: CityGeometry
  areaKm2: number
  landmarks: Landmark[]
  regions: Region[]
  contentVersion: string
  coordinateSystem: 'WGS84'
  verification: 'planned'
}
export const cities = plan.cities as unknown as City[]
export const planningEvidence = plan.evidence
export const heatMethod = plan.heatMethod
export const cityById = Object.fromEntries(cities.map(city => [city.id, city])) as Record<CityId, City>
const landmarkById = new Map(cities.flatMap(city => city.landmarks).map(item => [item.id, item]))
const legacyRegions: Region[] = legacy.regions.map(region => ({
  ...region, cityId: region.cityId as CityId, geometry: { type: 'MultiPolygon', coordinates: [[region.polygon as Coordinate[]]] },
  verification: 'illustrative', legacy: true, anchorLandmarkId: '', areaKm2: 0, districtNames: [], heat: '', rationale: '', evidenceIds: [],
}))
const regionById = new Map([...cities.flatMap(city => city.regions), ...legacyRegions].map(item => [item.id, item]))
const mapRegions = Object.fromEntries(cities.map(city => [city.id, [...city.regions, ...legacyRegions.filter(r => r.cityId === city.id)]])) as Record<CityId, Region[]>
export const getCity = (id: CityId): City => cityById[id]
export const getLandmark = (id: string): Landmark | undefined => landmarkById.get(id)
export const getRegion = (id: string): Region | undefined => regionById.get(id)
export const getMapRegions = (id: CityId): Region[] => mapRegions[id]
/** Preserve exact old footprints, without granting a much larger district
 * just because a former secondary landmark used to unlock a small block. */
export function allowedVisitRegions(landmarkId: string, contentVersion?: string): string[] {
  if (contentVersion === undefined) return (legacy.landmarkRegions as Record<string, string[]>)[landmarkId] ?? []
  const landmark = getLandmark(landmarkId)
  return landmark && contentVersion === getCity(landmark.cityId).contentVersion && landmark.tier === 1 ? landmark.regionIds : []
}
