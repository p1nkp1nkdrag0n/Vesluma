/**
 * Import an authentic OpenStreetMap skeleton for both COMPLETE city extents.
 * Run: node scripts/import-map-skeleton.mjs [nanjing|xian] [--refresh]
 *
 * One bounded Overpass query per city; never tile the OSM editing API at city scale.
 * Requests are sequential and cached. Nothing is queried by the running app.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(project, 'node_modules', '.cache', 'vesluma-boundaries');
const output = join(project, 'src', 'data', 'map');
const refresh = process.argv.includes('--refresh');
const requestedCity = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const extents = {
  nanjing: [118.3345, 31.2267, 119.2396, 32.6158],
  xian: [107.6584, 33.6961, 109.8239, 34.7438],
};
if (requestedCity && !(requestedCity in extents)) throw new Error('Expected nanjing or xian');
const roadClasses = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
]);
const requests = [];
const api = 'https://overpass-api.de/api/interpreter';

await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });

async function downloadCity(cityId, [west, south, east, north]) {
  const box = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:150];(way[highway~"^(motorway|trunk|primary|secondary)(_link)?$"](${box});way[waterway~"^(river|canal)$"][name](${box});way[natural=water](${box});relation[natural=water][type=multipolygon](${box}););(._;>;);out meta;`;
  const file = join(cache, `${cityId}-overpass.json`);
  let raw;
  if (!refresh) { try { raw = await readFile(file, 'utf8'); } catch { /* Fetch below. */ } }
  if (!raw) {
    console.log(`${cityId}: downloading complete city skeleton via Overpass`);
    raw = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--silent', '--show-error', '--fail', '--compressed', '--max-time', '180',
      '--user-agent', 'VeslumaCityPlanning/0.3', '--data-urlencode', `data=${query}`, api,
    ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 185000 });
    const body = JSON.parse(raw);
    if (body.remark || !body.elements?.length) throw new Error(`Incomplete Overpass response: ${body.remark}`);
    await writeFile(file, raw);
  }
  const body = JSON.parse(raw);
  if (body.remark || !body.elements?.length) throw new Error(`Incomplete Overpass response: ${body.remark}`);
  requests.push({ url: api, query, downloadedAt: (await stat(file)).mtime.toISOString(), sha256: createHash('sha256').update(raw).digest('hex') });
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
function waterGeometry(relation, ways, nodes) {
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
  merge(await downloadCity(cityId, bounds));
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
      const geometry = waterGeometry(relation, ways, nodes);
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
      method: 'Overpass bounded complete-city arterial and water query with original node recursion',
      roadClasses: [...roadClasses], minimumWaterAreaSquareMetres: 6000,
      geometry: 'Original node coordinates; no simplification, snapping, invented junctions, or route construction.',
      requests: requests.slice(requestStart),
      omittedFeatures,
    },
    features,
  };
  const file = join(output, `${cityId}.json`);
  await writeFile(file, `${JSON.stringify(collection)}\n`);
  const stats = Object.fromEntries(['road', 'water', 'waterLine'].map(kind => [kind, features.filter(item => item.properties.kind === kind).length]));
  console.log(`${cityId}: saved ${features.length} original OSM features; ${JSON.stringify(stats)}; ${Buffer.byteLength(JSON.stringify(collection))} bytes`);
}
