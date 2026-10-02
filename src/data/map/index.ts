import nanjingUrl from './nanjing.json?url';
import xianUrl from './xian.json?url';
import beijingUrl from './beijing.json.gz?url';
import shanghaiUrl from './shanghai.json.gz?url';
import hangzhouUrl from './hangzhou.json.gz?url';
import chengduUrl from './chengdu.json.gz?url';
import guangzhouUrl from './guangzhou.json.gz?url';
import shenzhenUrl from './shenzhen.json.gz?url';
import hongkongUrl from './hongkong.json.gz?url';
import macauUrl from './macau.json.gz?url';

export type SkeletonCoordinate = [lng: number, lat: number];
export type SkeletonBounds = [west: number, south: number, east: number, north: number];
export type SkeletonHighway = 'motorway' | 'motorway_link' | 'trunk' | 'trunk_link'
  | 'primary' | 'primary_link' | 'secondary' | 'secondary_link';

export interface SkeletonRoad {
  bounds: SkeletonBounds;
  id: string;
  name: string;
  highway: SkeletonHighway;
  coordinates: SkeletonCoordinate[];
  bridge: boolean;
  tunnel: boolean;
  layer?: number;
  access?: string;
  foot?: string;
  oneway: boolean;
  onewayDirection?: 'forward' | 'reverse';
}

export interface SkeletonWater {
  bounds: SkeletonBounds;
  id: string;
  name?: string;
  /** First ring is the shore; later rings are real islands/holes. */
  rings: SkeletonCoordinate[][];
}

export interface SkeletonWaterLine {
  bounds: SkeletonBounds;
  id: string;
  name?: string;
  coordinates: SkeletonCoordinate[];
  /** Only populated from an explicit metric OSM width tag. */
  widthMetres?: number;
}

export interface SkeletonSource {
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  downloadedAt: string;
  method: string;
  roadClasses: SkeletonHighway[];
  minimumWaterAreaSquareMetres: number;
  geometry: string;
  requests: { url: string; downloadedAt: string; sha256: string; query?: string }[];
  omittedFeatures?: { id: string; reason: string }[];
}

export interface MapSkeleton {
  cityId: string;
  bounds: SkeletonBounds;
  roads: SkeletonRoad[];
  water: SkeletonWater[];
  waterLines: SkeletonWaterLine[];
  source: SkeletonSource;
}

export interface SkeletonFeatureProperties {
  kind: 'road' | 'water' | 'waterLine';
  osmType: 'way' | 'relation';
  osmId: number;
  sourceVersion: number;
  sourceTimestamp: string;
  name: string;
  highway?: SkeletonHighway;
  bridge?: string;
  tunnel?: string;
  layer?: string;
  access?: string;
  foot?: string;
  oneway?: string;
  width?: string;
  nodeIds?: number[];
}

export interface SkeletonFeatureCollection {
  type: 'FeatureCollection';
  bbox: SkeletonBounds;
  cityId: string;
  coordinateSystem: 'WGS84';
  source: SkeletonSource;
  features: {
    type: 'Feature';
    id: string;
    properties: SkeletonFeatureProperties;
    geometry: { type: 'LineString'; coordinates: SkeletonCoordinate[] }
      | { type: 'Polygon'; coordinates: SkeletonCoordinate[][] }
      | { type: 'MultiPolygon'; coordinates: SkeletonCoordinate[][][] };
  }[];
}

function hasTag(value: string | undefined): boolean {
  return value !== undefined && value !== '' && !['no', 'false', '0'].includes(value);
}

function coordinateBounds(coordinates: SkeletonCoordinate[]): SkeletonBounds {
  const bounds: SkeletonBounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of coordinates) {
    bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat);
  }
  return bounds;
}

export function normalizeSkeleton(collection: SkeletonFeatureCollection): MapSkeleton {
  const roads: SkeletonRoad[] = [];
  const water: SkeletonWater[] = [];
  const waterLines: SkeletonWaterLine[] = [];
  for (const feature of collection.features) {
    const properties = feature.properties;
    const geometry = feature.geometry;
    if (properties.kind === 'road' && properties.highway && geometry.type === 'LineString') {
      const layer = properties.layer === undefined ? undefined : Number(properties.layer);
      const onewayDirection = properties.oneway === '-1' ? 'reverse'
        : ['yes', '1', 'true'].includes(properties.oneway ?? '') ? 'forward' : undefined;
      roads.push({
        id: feature.id, name: properties.name, highway: properties.highway,
        coordinates: geometry.coordinates, bounds: coordinateBounds(geometry.coordinates), bridge: hasTag(properties.bridge),
        tunnel: hasTag(properties.tunnel), layer: layer !== undefined && Number.isFinite(layer) ? layer : undefined,
        access: properties.access, foot: properties.foot,
        oneway: onewayDirection !== undefined, onewayDirection,
      });
    } else if (properties.kind === 'water' && geometry.type !== 'LineString') {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      polygons.forEach((rings, index) => water.push({ id: `${feature.id}/${index}`, name: properties.name || undefined, rings, bounds: coordinateBounds(rings[0]) }));
    } else if (properties.kind === 'waterLine' && geometry.type === 'LineString') {
      const metricWidth = properties.width?.match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/);
      const width = metricWidth ? Number(metricWidth[1]) : undefined;
      waterLines.push({
        id: feature.id, name: properties.name || undefined, coordinates: geometry.coordinates, bounds: coordinateBounds(geometry.coordinates),
        widthMetres: width !== undefined && width > 0 ? width : undefined,
      });
    }
  }
  return { cityId: collection.cityId, bounds: collection.bbox, roads, water, waterLines, source: collection.source };
}

/** Large source geometries are assets; they are not parsed inside the main JS bundle. */
const cityAssets: Record<string, { url: string; bounds: SkeletonBounds; gzip?: boolean }> = {
  nanjing: { url: nanjingUrl, bounds: [118.3345, 31.2267, 119.2396, 32.6158] },
  xian: { url: xianUrl, bounds: [107.6584, 33.6961, 109.8239, 34.7438] },
  beijing: { url: beijingUrl, bounds: [115.4168, 39.1707, 117.7372, 41.0593], gzip: true },
  shanghai: { url: shanghaiUrl, bounds: [120.8508, 30.6693, 123.2258, 31.8721], gzip: true },
  hangzhou: { url: hangzhouUrl, bounds: [118.3396, 29.1888, 120.7255, 30.5649], gzip: true },
  chengdu: { url: chengduUrl, bounds: [102.9896, 30.0916, 104.8949, 31.4371], gzip: true },
  guangzhou: { url: guangzhouUrl, bounds: [112.9523, 22.5607, 114.0553, 23.9357], gzip: true },
  shenzhen: { url: shenzhenUrl, bounds: [113.6805, 21.8213, 115.3891, 23.0166], gzip: true },
  hongkong: { url: hongkongUrl, bounds: [113.8171, 22.1367, 114.5025, 22.5684], gzip: true },
  macau: { url: macauUrl, bounds: [113.5281, 22.0766, 113.6302, 22.2171], gzip: true },
};
const citySkeletons = new Map<string, MapSkeleton>();
const pendingLoads = new Map<string, Promise<MapSkeleton | null>>();
const failedLoads = new Set<string>();
// Decoded coordinates cost substantially more memory than their gzip assets.
// Keep only the two most recently opened maps; the worker independently retains
// six validated files and can serve an evicted in-memory map without a network.
export const MAP_MEMORY_CITY_LIMIT = 2;
export const MAP_LOAD_TIMEOUT_MS = 30_000;
export const MAP_CACHE_READY_TIMEOUT_MS = 30_000;
const permittedRoadClasses = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link']);
const supportedOverpassSources = new Set([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function coordinate(value: unknown): value is SkeletonCoordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}
function line(value: unknown): value is SkeletonCoordinate[] {
  return Array.isArray(value) && value.length >= 2 && value.every(coordinate);
}
function polygon(value: unknown): value is SkeletonCoordinate[][] {
  return Array.isArray(value) && value.length > 0 && value.every(ring => line(ring) && ring.length >= 4
    && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]);
}
function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Reject a failed cache response, wrong city/datum or accidental detailed-road payload. */
export function validateSkeletonCollection(value: unknown, cityId: string): asserts value is SkeletonFeatureCollection {
  const fail = () => { throw new Error('城市骨架数据不匹配，请重新加载。'); };
  const asset = Object.hasOwn(cityAssets, cityId) ? cityAssets[cityId] : null;
  if (!asset || !isObject(value) || value.type !== 'FeatureCollection' || value.cityId !== cityId
    || value.coordinateSystem !== 'WGS84' || !Array.isArray(value.bbox)
    || value.bbox.length !== 4 || !value.bbox.every((number, index) => number === asset.bounds[index])
    || !isObject(value.source) || value.source.license !== 'ODbL-1.0'
    || value.source.url !== 'https://www.openstreetmap.org/copyright'
    || !validDate(value.source.downloadedAt) || !Array.isArray(value.source.requests)
    || !value.source.requests.length || !Array.isArray(value.features) || !value.features.length) return fail();
  for (const request of value.source.requests) {
    if (!isObject(request) || typeof request.url !== 'string' || !(request.url.startsWith('https://api.openstreetmap.org/api/0.6/') || supportedOverpassSources.has(request.url))
      || typeof request.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(request.sha256) || !validDate(request.downloadedAt)) return fail();
  }
  let hasRoad = false;
  for (const feature of value.features) {
    if (!isObject(feature) || feature.type !== 'Feature' || !isObject(feature.properties) || !isObject(feature.geometry)) return fail();
    const properties = feature.properties, geometry = feature.geometry;
    if (!['way', 'relation'].includes(String(properties.osmType)) || !Number.isSafeInteger(properties.osmId)
      || feature.id !== `${properties.osmType}/${properties.osmId}` || !Number.isSafeInteger(properties.sourceVersion)
      || Number(properties.sourceVersion) < 1 || !validDate(properties.sourceTimestamp) || typeof properties.name !== 'string') return fail();
    if (properties.kind === 'road') {
      if (properties.osmType !== 'way' || !permittedRoadClasses.has(String(properties.highway))
        || geometry.type !== 'LineString' || !line(geometry.coordinates) || !Array.isArray(properties.nodeIds)
        || properties.nodeIds.length !== geometry.coordinates.length || !properties.nodeIds.every(Number.isSafeInteger)) return fail();
      hasRoad = true;
    } else if (properties.kind === 'water') {
      if (geometry.type === 'Polygon') { if (!polygon(geometry.coordinates)) return fail(); }
      else if (geometry.type === 'MultiPolygon') {
        if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length || !geometry.coordinates.every(polygon)) return fail();
      } else return fail();
    } else if (properties.kind === 'waterLine') {
      if (geometry.type !== 'LineString' || !line(geometry.coordinates)) return fail();
    } else return fail();
    for (const key of ['highway', 'bridge', 'tunnel', 'layer', 'access', 'foot', 'oneway', 'width']) {
      if (properties[key] !== undefined && typeof properties[key] !== 'string') return fail();
    }
  }
  if (!hasRoad) return fail();
}

export function getCitySkeleton(cityId: string): MapSkeleton | null {
  return citySkeletons.get(cityId) ?? null;
}

function hasMapWorker(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker)
    && typeof location !== 'undefined';
}

/** First-load caching also works before the page has a service-worker controller.
 * A worker that never activates must not retain a large map response indefinitely.
 */
async function mapWorker(): Promise<ServiceWorker | null> {
  if (!hasMapWorker()) return null;
  return new Promise(resolve => {
    const container = navigator.serviceWorker;
    let settled = false;
    let channel: MessageChannel | undefined;
    const closeChannel = () => { channel?.port1.close(); channel?.port2.close(); channel = undefined; };
    const finish = (worker: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      container.removeEventListener?.('controllerchange', onControllerChange);
      closeChannel();
      resolve(worker);
    };
    const timer = setTimeout(() => finish(null), MAP_CACHE_READY_TIMEOUT_MS);
    const verify = (worker: ServiceWorker | null) => {
      if (settled || !worker || typeof MessageChannel === 'undefined') return;
      closeChannel();
      channel = new MessageChannel();
      channel.port1.onmessage = event => { if (event.data?.version === 1) finish(worker); };
      try { worker.postMessage({ type: 'VESLUMA_MAP_CACHE_READY' }, [channel.port2]); }
      catch { closeChannel(); } // A redundant worker may be replaced by controllerchange.
    };
    const onControllerChange = () => verify(container.controller);
    container.addEventListener?.('controllerchange', onControllerChange);
    try {
      // ready can still refer to an older worker during an update. It must
      // acknowledge this cache protocol before receiving any large map body.
      container.ready.then(registration => verify(container.controller ?? registration.active), () => finish(null));
    } catch { finish(null); }
  });
}

function discardMapResponse(response?: Response): void {
  // A tee branch may wait for its sibling to finish. Never block the error path.
  if (response?.body) void response.body.cancel().catch(() => {});
}

/** Only the winner of full validation may hand bytes to the offline cache. */
function cacheValidatedMap(url: string, response?: Response): void {
  if (!hasMapWorker()) { discardMapResponse(response); return; }
  void (async () => {
    try {
      const absoluteUrl = new URL(url, location.href).href;
      const worker = await mapWorker();
      if (!worker) { discardMapResponse(response); return; }
      if (!response) {
        worker.postMessage({ type: 'VESLUMA_TOUCH_MAP', url: absoluteUrl });
        return;
      }
      const body = await response.arrayBuffer();
      worker.postMessage({ type: 'VESLUMA_CACHE_MAP', url: absoluteUrl, body,
        contentType: response.headers.get('Content-Type') || 'application/octet-stream' }, [body]);
    } catch { discardMapResponse(response); /* Offline quota/worker failure cannot hide a valid map. */ }
  })();
}

/** Successes and in-flight loads are shared. A rejected request can be retried. */
export function loadCitySkeleton(cityId: string): Promise<MapSkeleton | null> {
  if (!Object.hasOwn(cityAssets, cityId)) return Promise.resolve(null);
  const cached = citySkeletons.get(cityId);
  if (cached) {
    citySkeletons.delete(cityId);
    citySkeletons.set(cityId, cached);
    cacheValidatedMap(cityAssets[cityId].url);
    return Promise.resolve(cached);
  }
  const pending = pendingLoads.get(cityId);
  if (pending) return pending;
  const controller = new AbortController();
  let cacheResponse: Response | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('主干道加载超时，请检查网络后重试。'));
      controller.abort();
    }, MAP_LOAD_TIMEOUT_MS);
  });
  const request = fetch(cityAssets[cityId].url, { signal: controller.signal,
    ...(failedLoads.has(cityId) ? { cache: 'reload' as RequestCache, headers: { 'X-Vesluma-Map-Retry': '1' } } : {}) }).then(async response => {
    if (controller.signal.aborted) throw new Error('骨架地图加载超时，请联网后重试。');
    if (!response.ok) {
      if (response.headers?.get('X-Vesluma-Map-Cache') === 'miss') throw new Error('此城地图尚未缓存。联网后点重试，或切换到已缓存的城市。');
      throw new Error('城市主干道未能加载，请重试。');
    }
    if (hasMapWorker() && response.headers?.get('X-Vesluma-Map-Cache') !== 'hit') cacheResponse = response.clone();
    let collection: unknown;
    if (cityAssets[cityId].gzip) {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!bytes.length) throw new Error('城市地图数据为空，请重新加载。');
      // Node local/Vite preview send a raw gzip asset. Some static hosts instead
      // set Content-Encoding and fetch transparently decodes it. Inspect the actual
      // bytes so either host gets exactly one decode, regardless of response headers.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持城市地图解压，请更新浏览器后重试。');
        collection = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      } else collection = JSON.parse(new TextDecoder().decode(bytes));
    } else collection = await response.json();
    validateSkeletonCollection(collection, cityId);
    return normalizeSkeleton(collection);
  });
  // Race the entire body load as well as the response headers. Only the winning
  // request may populate the cache, even when a transport ignores AbortSignal.
  const load = Promise.race([request, timeout]).then(skeleton => {
    citySkeletons.delete(cityId);
    citySkeletons.set(cityId, skeleton);
    while (citySkeletons.size > MAP_MEMORY_CITY_LIMIT) citySkeletons.delete(citySkeletons.keys().next().value!);
    failedLoads.delete(cityId);
    cacheValidatedMap(cityAssets[cityId].url, cacheResponse);
    cacheResponse = undefined;
    return skeleton;
  }).catch(error => {
    failedLoads.add(cityId);
    discardMapResponse(cacheResponse);
    cacheResponse = undefined;
    throw error;
  }).finally(() => {
    clearTimeout(timer);
    pendingLoads.delete(cityId);
  });
  pendingLoads.set(cityId, load);
  return load;
}
