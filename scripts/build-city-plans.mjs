/** Offline, deterministic city partition builder. Input snapshots are committed. */
import { readFileSync, writeFileSync } from 'node:fs';
import pc from 'polygon-clipping';
import { cityPlans, evidence, planVersion } from './city-plan.config.mjs';
const multi = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const box = (west, south, east, north) => [[[[west, south], [east, south], [east, north], [west, north], [west, south]]]];
// Spherical ring area, sufficient for descriptive km²; topology uses exact clipping.
const ringArea = ring => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * Math.PI / 180
      * (2 + Math.sin(ring[i][1] * Math.PI / 180) + Math.sin(ring[i + 1][1] * Math.PI / 180));
  }
  return Math.abs(sum * 6371008.8 ** 2 / 2) / 1e6;
};
const area = polygons => polygons.reduce((s, polygon) => s + polygon.reduce((a, ring, i) => a + (i ? -1 : 1) * ringArea(ring), 0), 0);
const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
};
const inside = (point, polygons) => polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(r => inRing(point, r)));
const cities = cityPlans.map(config => {
  const snapshot = JSON.parse(readFileSync(`src/data/map/boundaries/${config.id}.json`, 'utf8'));
  const boundary = multi(snapshot.features.find(f => f.properties.role === 'municipality').geometry);
  const districts = snapshot.features.filter(f => f.properties.role === 'district');
  const coordinates = boundary.flat(2);
  const bounds = [[Math.min(...coordinates.map(p => p[1])), Math.min(...coordinates.map(p => p[0]))],
    [Math.max(...coordinates.map(p => p[1])), Math.max(...coordinates.map(p => p[0]))]];
  const regions = config.zones.map(zone => {
    const selected = zone.districts.map(name => {
      const district = districts.find(d => d.properties.name === name);
      if (!district) throw new Error(`Missing district: ${name}`);
      const clip = zone.districtClips?.[name];
      return clip ? pc.intersection(multi(district.geometry), clip.keep === 'north'
        ? box(100, clip.latitude, 125, 40) : box(100, 20, 125, clip.latitude)) : multi(district.geometry);
    });
    let polygons = pc.intersection(pc.union(...selected), boundary);
    if (zone.slice) polygons = pc.intersection(polygons, zone.slice.side === 'west'
      ? box(100, 20, zone.slice.longitude, 40) : box(zone.slice.longitude, 20, 125, 40));
    const anchor = config.landmarks.find(l => l.id === zone.anchorLandmarkId);
    if (!anchor || anchor.tier !== 1 || !inside([anchor.lng, anchor.lat], polygons)) throw new Error(`Anchor outside its region: ${zone.anchorLandmarkId}`);
    return { id: `${config.prefix}-zone-${zone.key}`, cityId: config.id, name: zone.name,
      geometry: { type: 'MultiPolygon', coordinates: polygons }, anchorLandmarkId: anchor.id,
      areaKm2: Math.round(area(polygons) * 10) / 10, districtNames: zone.districts, heat: zone.heat,
      rationale: zone.rationale, evidenceIds: zone.evidenceIds, verification: 'planned', version: planVersion,
      boundaryNote: `外缘沿 OSM 市域边界，区内以区县为底稿合并。${zone.slice ? `东经 ${zone.slice.longitude}°为内部规划线。` : ''}${Object.entries(zone.districtClips ?? {}).map(([name, clip]) => `${name}在北纬 ${clip.latitude}°处作组团规划分隔。`).join('')}内部规划线不代表实测道路、河流或行政边界。`,
    };
  });
  const union = pc.union(...regions.map(r => r.geometry.coordinates));
  const missing = area(pc.difference(boundary, union)), outside = area(pc.difference(union, boundary));
  const overlap = regions.reduce((s, region, i) => s + regions.slice(i + 1).reduce((s, other) => s + area(pc.intersection(region.geometry.coordinates, other.geometry.coordinates)), 0), 0);
  if (missing > 1e-6 || outside > 1e-6 || overlap > 1e-6) throw new Error(`Invalid partition: ${JSON.stringify({ missing, outside, overlap })}`);
  const landmarks = config.landmarks.map(({ region, ...l }) => {
    const regionId = `${config.prefix}-zone-${region}`;
    const owner = regions.find(r => r.id === regionId);
    if (!owner || !inside([l.lng, l.lat], owner.geometry.coordinates)) throw new Error(`Landmark outside assigned cluster: ${l.id}`);
    return { ...l, cityId: config.id, regionId, regionIds: l.tier === 1 ? [regionId] : [],
      arrivalRadiusMeters: 250, cover: `/images/${config.id}.png`, verification: 'candidate' };
  });
  console.log(`${config.name}: ${regions.length} zones, ${landmarks.length} landmarks, ${area(boundary).toFixed(1)} km²; missing=${missing}, overlap=${overlap}, outside=${outside}`);
  return { id: config.id, name: config.name, enName: config.enName, subtitle: config.subtitle, center: config.center,
    startPosition: config.startPosition, zoom: config.zoom, bounds, coordinateSystem: 'WGS84', verification: 'planned',
    contentVersion: planVersion, boundary: { type: 'MultiPolygon', coordinates: boundary }, areaKm2: Math.round(area(boundary) * 10) / 10,
    coverage: { missingKm2: missing, overlapKm2: overlap, outsideKm2: outside, districtCount: districts.length, boundarySource: snapshot.source },
    landmarks, regions };
});
writeFileSync('src/data/map/city-plans.json', JSON.stringify({ version: planVersion, researchedOn: '2026-10-02',
  heatMethod: '公开客流、官方景区名录和旅游片区规划的定性代理；非实时热力。先合并邻近组团，再选区域代表。', evidence, cities }) + '\n');
