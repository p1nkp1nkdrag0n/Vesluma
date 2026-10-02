/**
 * Import authentic OpenStreetMap skeletons for COMPLETE city extents.
 * Run: node scripts/import-map-skeleton.mjs [city] [--refresh] [--endpoint=https://...]
 *
 * New city extents use sequential bounded Overpass partitions, with finer partitions
 * only for query-size timeouts. Never tile the OSM editing API at city scale.
 * Responses and exact source receipts are cached. Nothing is queried by the running app.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { completeOverpassResponse } from './overpass-response.ts';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(project, 'node_modules', '.cache', 'vesluma-boundaries');
const output = join(project, 'src', 'data', 'map');
const refresh = process.argv.includes('--refresh');
const requestedCity = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const legacyCities = new Set(['nanjing', 'xian']);
const extents = {
  nanjing: [118.3345, 31.2267, 119.2396, 32.6158],
  xian: [107.6584, 33.6961, 109.8239, 34.7438],
  // Rounded outward from the verified complete municipality Nominatim extents.
  beijing: [115.4168, 39.1707, 117.7372, 41.0593],
  shanghai: [120.8508, 30.6693, 123.2258, 31.8721],
  hangzhou: [118.3396, 29.1888, 120.7255, 30.5649],
  chengdu: [102.9896, 30.0916, 104.8949, 31.4371],
  guangzhou: [112.9523, 22.5607, 114.0553, 23.9357],
  shenzhen: [113.6805, 21.8213, 115.3891, 23.0166],
  hongkong: [113.8171, 22.1367, 114.5025, 22.5684],
  macau: [113.5281, 22.0766, 113.6302, 22.2171],
};
if (requestedCity && !Object.hasOwn(extents, requestedCity)) throw new Error(`Expected one of ${Object.keys(extents).join(', ')}`);
const roadClasses = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
]);
const requests = [];
const legacyApi = 'https://overpass-api.de/api/interpreter';
const defaultApi = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const supportedApis = new Set([legacyApi, defaultApi, 'https://overpass.private.coffee/api/interpreter']);
const endpoint = process.argv.find(argument => argument.startsWith('--endpoint='))?.slice('--endpoint='.length);
if (endpoint && !supportedApis.has(endpoint)) throw new Error('Use an explicitly supported public Overpass endpoint.');
let lastDownloadAt = 0;
const bboxPattern = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g;
function comparableQuery(value) {
  return value.replace(/\[timeout:\d+\]/g, '[timeout:*]').replace(/\[maxsize:\d+\]/g, '')
    .replace(bboxPattern, (_match, south, west, north, east) => `(${[south, west, north, east].map(value => Math.round(Number(value) * 1e7) / 1e7).join(',')})`);
}

await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });

async function downloadCity(cityId, [west, south, east, north], api) {
  const box = `${south},${west},${north},${east}`;
  // A large requested timeout also reserves more shared dispatcher capacity.
  // Smaller new-city partitions can use a modest budget; preserve legacy receipt text.
  const queryTimeout = legacyCities.has(cityId) ? 150 : 45;
  const memoryBudget = legacyCities.has(cityId) ? '' : '[maxsize:134217728]';
  const query = `[out:json][timeout:${queryTimeout}]${memoryBudget};(way[highway~"^(motorway|trunk|primary|secondary)(_link)?$"](${box});way[waterway~"^(river|canal)$"][name](${box});way[natural=water](${box});relation[natural=water][type=multipolygon](${box}););(._;>;);out meta;`;
  const file = join(cache, `${cityId}-overpass.json`);
  const receiptFile = `${file}.receipt.json`;
  let raw;
  if (!refresh) { try { raw = await readFile(file, 'utf8'); } catch { /* Fetch below. */ } }
  let receipt;
  if (raw) {
    try { receipt = JSON.parse(await readFile(receiptFile, 'utf8')); } catch {
      // Only these two historical cache names were created by the former importer,
      // whose endpoint and query are known. New caches must retain an exact receipt.
      if (!legacyCities.has(cityId)) throw new Error(`Missing source receipt for ${cityId}; do not guess its endpoint.`);
      receipt = { url: legacyApi, query, downloadedAt: (await stat(file)).mtime.toISOString(), sha256: createHash('sha256').update(raw).digest('hex') };
    }
    if (!supportedApis.has(receipt.url) || receipt.sha256 !== createHash('sha256').update(raw).digest('hex')
      || typeof receipt.query !== 'string' || comparableQuery(receipt.query) !== comparableQuery(query)
      || !Number.isFinite(Date.parse(receipt.downloadedAt))) {
      throw new Error(`Invalid cached source receipt for ${cityId}. Preserve the files and investigate before refreshing.`);
    }
  }
  if (!raw) {
    const wait = Math.max(0, 5_000 - (Date.now() - lastDownloadAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    console.log(`${cityId}: downloading original arterial/water nodes via ${api}`);
    try {
      raw = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--silent', '--show-error', '--fail-with-body', '--compressed', '--max-time', '180',
        '--user-agent', 'VeslumaCityPlanning/0.3', '--data-urlencode', `data=${query}`, api,
      ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 185000 });
    } catch (failure) {
      const detail = String(failure.stdout || failure.stderr || failure.message);
      const error = new Error(`Overpass download failed for ${cityId}: ${detail.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)}`);
      // A dispatcher outage also fails tiny queries. Do not create a burst of smaller
      // requests in response; retain successful caches and retry the server later.
      error.partitionRetry = /query timed out|runtime error.*timed out|out of memory/i.test(detail) && !/dispatcher|too busy/i.test(detail);
      throw error;
    } finally { lastDownloadAt = Date.now(); }
    const body = JSON.parse(raw);
    if (!completeOverpassResponse(body)) {
      const error = new Error(`Incomplete Overpass response: ${body.remark || 'invalid source metadata or elements'}`);
      error.partitionRetry = /query timed out|out of memory/i.test(body.remark ?? '');
      throw error;
    }
    await writeFile(file, raw);
    receipt = { url: api, query, downloadedAt: (await stat(file)).mtime.toISOString(), sha256: createHash('sha256').update(raw).digest('hex') };
    await writeFile(receiptFile, `${JSON.stringify(receipt)}\n`);
  }
  const body = JSON.parse(raw);
  if (!completeOverpassResponse(body)) throw new Error(`Incomplete Overpass response: ${body.remark || 'invalid source metadata or elements'}`);
  requests.push(receipt);
  return body.elements;
}

function displayName(tags = {}) { return tags['name:zh-Hans'] || tags['name:zh'] || tags.name || ''; }
function isWater(element) {
  return element.tags?.natural === 'water' || element.tags?.waterway === 'riverbank';
}
function coordinates(way, nodes) {
  if (!Array.isArray(way.nodes) || way.nodes.some(id => !nodes.has(id))) {
    throw new Error(`Missing original nodes for way/${way.id}; do not fabricate geometry.`);
  }
  return way.nodes.map(id => {
    const node = nodes.get(id);
    return [node.lon, node.lat];
  });
}
function closed(ids) { return ids.length >= 4 && ids[0] === ids.at(-1); }

/** Join only by matching ORIGINAL node IDs; never close an unfinished shore. */
function joinRings(memberWays) {
  const pending = memberWays.map(way => [...way.nodes]);
  const rings = [];
  while (pending.length) {
    let chain = pending.pop();
    while (!closed(chain)) {
      const first = chain[0], last = chain.at(-1);
      const index = pending.findIndex(part => part[0] === last || part.at(-1) === last || part[0] === first || part.at(-1) === first);
      if (index < 0) throw new Error('Incomplete multipolygon: unmatched original node endpoints');
      let part = pending.splice(index, 1)[0];
      if (part[0] === last) chain.push(...part.slice(1));
      else if (part.at(-1) === last) chain.push(...part.reverse().slice(1));
      else if (part.at(-1) === first) chain = [...part.slice(0, -1), ...chain];
      else chain = [...part.reverse().slice(0, -1), ...chain];
    }
    rings.push(chain);
  }
  return rings;
}
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function signedArea(ring) {
  return ring.reduce((area, [x, y], i) => {
    const [nextX, nextY] = ring[(i + 1) % ring.length];
    return area + x * nextY - nextX * y;
  }, 0) / 2;
}
function orient(ring, outer) {
  return (signedArea(ring) > 0) === outer ? ring : [...ring].reverse();
}
function areaSquareMetres(ring) {
  const latitude = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
  return Math.abs(signedArea(ring)) * 111320 * 111320 * Math.cos(latitude * Math.PI / 180);
}
function waterGeometry(relation, ways, nodes, reportUnsupportedRelations = false) {
  if (reportUnsupportedRelations && relation.members.some(member => member.type === 'relation')) throw new Error('Nested water relation members are not flattened or invented');
  const selected = role => relation.members.filter(member => member.type === 'way' && (member.role === role || role === 'outer' && member.role === '')).map(member => {
    const way = ways.get(member.ref);
    if (!way) throw new Error(`Missing way/${member.ref} for relation/${relation.id}`);
    return way;
  });
  const toRing = ids => ids.map(id => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing node/${id} for relation/${relation.id}`);
    return [node.lon, node.lat];
  });
  const outers = joinRings(selected('outer')).map(ids => orient(toRing(ids), true));
  if (reportUnsupportedRelations && !outers.length) throw new Error('No closed original outer water ring');
  const inners = joinRings(selected('inner')).map(ids => orient(toRing(ids), false));
  const polygons = outers.map(outer => [outer]);
  for (const inner of inners) {
    const index = outers.findIndex(outer => inner.some(point => pointInRing(point, outer)));
    if (index < 0) throw new Error(`Unassigned water island hole for relation/${relation.id}`);
    polygons[index].push(inner);
  }
  return { type: 'MultiPolygon', coordinates: polygons.filter(polygon => areaSquareMetres(polygon[0]) >= 6000) };
}
function properties(element, kind) {
  const keep = ['highway', 'bridge', 'tunnel', 'layer', 'access', 'foot', 'oneway', 'junction', 'water', 'waterway', 'width', 'intermittent'];
  return {
    kind, osmType: element.type, osmId: element.id, sourceVersion: element.version,
    sourceTimestamp: element.timestamp, name: displayName(element.tags),
    ...Object.fromEntries(keep.filter(key => element.tags?.[key] !== undefined).map(key => [key, element.tags[key]])),
    ...(kind === 'road' ? { nodeIds: element.nodes } : {}),
  };
}
function feature(element, kind, geometry) {
  return { type: 'Feature', id: `${element.type}/${element.id}`, properties: properties(element, kind), geometry };
}

for (const [cityId, bounds] of Object.entries(extents)) {
  if (requestedCity && cityId !== requestedCity) continue;
  const requestStart = requests.length;
  const byId = new Map();
  const merge = elements => {
    for (const element of elements) {
      const key = `${element.type}/${element.id}`;
      if (!byId.has(key) || (byId.get(key).version || 0) < (element.version || 0)) byId.set(key, element);
    }
  };
  const api = endpoint ?? (legacyCities.has(cityId) ? legacyApi : defaultApi);
  const splitBounds = ([west, south, east, north]) => {
    const middleLng = (west + east) / 2, middleLat = (south + north) / 2;
    return [[west, south, middleLng, middleLat], [middleLng, south, east, middleLat], [west, middleLat, middleLng, north], [middleLng, middleLat, east, north]]
      .map(box => box.map(value => Math.round(value * 1e7) / 1e7));
  };
  const collectPartition = async (key, box, depth = 0) => {
    try { merge(await downloadCity(key, box, api)); }
    catch (error) {
      if (!error.partitionRetry || depth >= 2) throw error;
      console.log(`${key}: query-size timeout; retry smaller full-coverage partitions`);
      for (const [index, child] of splitBounds(box).entries()) await collectPartition(`${key}-${index}`, child, depth + 1);
    }
  };
  if (legacyCities.has(cityId)) merge(await downloadCity(cityId, bounds, api));
  else for (const [index, box] of splitBounds(bounds).entries()) await collectPartition(`${cityId}-part-${index}`, box);
  const waterRelations = [...byId.values()].filter(element => element.type === 'relation' && isWater(element) && element.tags.type === 'multipolygon');
  const elements = [...byId.values()];
  const nodes = new Map(elements.filter(element => element.type === 'node').map(node => [node.id, node]));
  const ways = new Map(elements.filter(element => element.type === 'way').map(way => [way.id, way]));
  const waterMemberIds = new Set(waterRelations.flatMap(relation => relation.members.filter(member => member.type === 'way').map(member => member.ref)));
  const features = [];
  const omittedFeatures = [];
  for (const way of ways.values()) {
    if (roadClasses.has(way.tags?.highway)) features.push(feature(way, 'road', { type: 'LineString', coordinates: coordinates(way, nodes) }));
    else if (isWater(way) && !waterMemberIds.has(way.id) && closed(way.nodes)) {
      const ring = orient(coordinates(way, nodes), true);
      if (areaSquareMetres(ring) >= 6000) features.push(feature(way, 'water', { type: 'Polygon', coordinates: [ring] }));
    }
    else if (['river', 'canal'].includes(way.tags?.waterway) && displayName(way.tags) && way.nodes.length >= 2) {
      features.push(feature(way, 'waterLine', { type: 'LineString', coordinates: coordinates(way, nodes) }));
    }
  }
  for (const candidate of waterRelations) {
    const relation = byId.get(`relation/${candidate.id}`);
    try {
      const geometry = waterGeometry(relation, ways, nodes, !legacyCities.has(cityId));
      if (geometry.coordinates.length) features.push(feature(relation, 'water', geometry));
    } catch (error) {
      // A broken source shore must not be filled or repaired by invention.
      omittedFeatures.push({ id: `relation/${relation.id}`, reason: error.message });
    }
  }
  features.sort((a, b) => a.properties.kind.localeCompare(b.properties.kind) || a.properties.osmType.localeCompare(b.properties.osmType) || a.properties.osmId - b.properties.osmId);
  const collection = {
    type: 'FeatureCollection', bbox: bounds, cityId, coordinateSystem: 'WGS84',
    source: {
      name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      downloadedAt: requests.slice(requestStart).reduce((latest, request) => request.downloadedAt > latest ? request.downloadedAt : latest, ''),
      method: legacyCities.has(cityId) ? 'Overpass bounded complete-city arterial and water query with original node recursion'
        : 'Sequential bounded Overpass partitions cover the complete city extent; original arterial and water nodes are merged by OSM identity without simplification',
      roadClasses: [...roadClasses], minimumWaterAreaSquareMetres: 6000,
      geometry: 'Original node coordinates; no simplification, snapping, invented junctions, or route construction.',
      requests: requests.slice(requestStart),
      omittedFeatures,
    },
    features,
  };
  const serialized = `${JSON.stringify(collection)}\n`;
  const compressed = !legacyCities.has(cityId);
  const file = join(output, `${cityId}.json${compressed ? '.gz' : ''}`);
  const contents = compressed ? gzipSync(serialized, { level: 9 }) : serialized;
  await writeFile(file, contents);
  // The new-city source is stored exactly once, losslessly compressed. Original
  // Nanjing/Xian assets are intentionally left in their historical JSON format.
  if (compressed) await rm(join(output, `${cityId}.json`), { force: true });
  const stats = Object.fromEntries(['road', 'water', 'waterLine'].map(kind => [kind, features.filter(item => item.properties.kind === kind).length]));
  console.log(`${cityId}: saved ${features.length} original OSM features; ${JSON.stringify(stats)}; ${Buffer.byteLength(serialized)} JSON bytes; ${Buffer.byteLength(contents)} asset bytes`);
}
