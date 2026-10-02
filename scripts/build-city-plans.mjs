/** Offline, deterministic city partition builder. Input snapshots are committed. */
import { readFileSync, writeFileSync } from 'node:fs';
import pc from 'polygon-clipping';
import { cityPlans, evidence, planVersion } from './city-plan.config.mjs';
const multi = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const box = (west, south, east, north) => [[[[west, south], [east, south], [east, north], [west, north], [west, south]]]];
// Optional editorial masks for new coastal / island plans. They select from
// unmodified source geometry; they never substitute rectangles for coastlines.
const boxMask = boxes => {
  if (!Array.isArray(boxes) || !boxes.length || boxes.some(bounds => !Array.isArray(bounds) || bounds.length !== 4
    || !bounds.every(Number.isFinite) || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90
    || bounds[0] >= bounds[2] || bounds[1] >= bounds[3])) throw new Error('Invalid editorial clip boxes');
  return pc.union(...boxes.map(bounds => box(...bounds)));
};
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
  if (config.remainderZoneKey && !config.zones.some(zone => zone.key === config.remainderZoneKey)) {
    throw new Error(`Unknown municipality remainder recipient: ${config.remainderZoneKey}`);
  }
  // Some SAR source faces (e.g. port jurisdiction and the boundary river) are
  // not assigned to the formal district scaffold. Preserve them explicitly in
  // one declared tourism group instead of discarding them or inventing a district.
  const municipalityRemainder = config.remainderZoneKey
    ? pc.difference(boundary, pc.union(...districts.map(district => multi(district.geometry)))) : [];
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const polygon of boundary) for (const ring of polygon) for (const [lng, lat] of ring) {
    bounds[0][0] = Math.min(bounds[0][0], lat); bounds[0][1] = Math.min(bounds[0][1], lng);
    bounds[1][0] = Math.max(bounds[1][0], lat); bounds[1][1] = Math.max(bounds[1][1], lng);
  }
  // Preserve the original two cities byte-for-byte while allowing Beijing's
  // northern districts beyond 40N. New clips span the full WGS84 world.
  const clipExtent = ['nanjing', 'xian'].includes(config.id) ? [100, 20, 125, 40] : [-180, -90, 180, 90];
  const regions = config.zones.map(zone => {
    if (zone.source && zone.source !== 'municipality') throw new Error(`Unknown region source: ${zone.source}`);
    const selected = zone.source === 'municipality' ? [] : zone.districts.map(name => {
      const district = districts.find(d => d.properties.name === name);
      if (!district) throw new Error(`Missing district: ${name}`);
      const clip = zone.districtClips?.[name];
      let geometry = clip ? pc.intersection(multi(district.geometry), clip.keep === 'north'
        ? box(clipExtent[0], clip.latitude, clipExtent[2], clipExtent[3])
        : box(clipExtent[0], clipExtent[1], clipExtent[2], clip.latitude)) : multi(district.geometry);
      if (zone.districtClipBoxes?.[name]) geometry = pc.intersection(geometry, boxMask(zone.districtClipBoxes[name]));
      return geometry;
    });
    if (zone.source !== 'municipality' && !selected.length) throw new Error(`No source geometry for ${zone.key}`);
    let polygons = zone.source === 'municipality' ? boundary : pc.intersection(pc.union(...selected), boundary);
    if (zone.clipBoxes) polygons = pc.intersection(polygons, boxMask(zone.clipBoxes));
    if (zone.slice) polygons = pc.intersection(polygons, zone.slice.side === 'west'
      ? box(clipExtent[0], clipExtent[1], zone.slice.longitude, clipExtent[3])
      : box(zone.slice.longitude, clipExtent[1], clipExtent[2], clipExtent[3]));
    if (config.remainderZoneKey === zone.key && municipalityRemainder.length) polygons = pc.union(polygons, municipalityRemainder);
    const anchor = config.landmarks.find(l => l.id === zone.anchorLandmarkId);
    if (!anchor || anchor.tier !== 1 || !inside([anchor.lng, anchor.lat], polygons)) throw new Error(`Anchor outside its region: ${zone.anchorLandmarkId}`);
    return { id: `${config.prefix}-zone-${zone.key}`, cityId: config.id, name: zone.name,
      geometry: { type: 'MultiPolygon', coordinates: polygons }, anchorLandmarkId: anchor.id,
      areaKm2: Math.round(area(polygons) * 10) / 10, districtNames: zone.districts, heat: zone.heat,
      rationale: zone.rationale, evidenceIds: zone.evidenceIds, verification: 'planned', version: planVersion,
      boundaryNote: zone.boundaryNoteOverride ?? `外缘沿 OSM 市域边界，区内以区县为底稿合并。${zone.slice ? `东经 ${zone.slice.longitude}°为内部规划线。` : ''}${Object.entries(zone.districtClips ?? {}).map(([name, clip]) => `${name}在北纬 ${clip.latitude}°处作组团规划分隔。`).join('')}内部规划线不代表实测道路、河流或行政边界。`,
    };
  });
  const union = pc.union(...regions.map(r => r.geometry.coordinates));
  const missingGeometry = pc.difference(boundary, union), outsideGeometry = pc.difference(union, boundary);
  const intersections = regions.flatMap((region, i) => regions.slice(i + 1).flatMap(other => pc.intersection(region.geometry.coordinates, other.geometry.coordinates)));
  const missing = area(missingGeometry), outside = area(outsideGeometry), overlap = area(intersections);
  // Empty Boolean geometry proves full coverage; area rounding or sampled
  // points cannot demonstrate the absence of narrow gaps or accidental holes.
  if (missingGeometry.length || outsideGeometry.length || intersections.length) throw new Error(`Invalid partition: ${JSON.stringify({ city: config.id, missing, outside, overlap })}`);
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
    ...(config.coverageNote ? { coverageNote: config.coverageNote } : {}), landmarks, regions };
});
writeFileSync('src/data/map/city-plans.json', JSON.stringify({ version: planVersion, researchedOn: '2026-10-02',
  heatMethod: '公开客流、官方景区名录和旅游片区规划的定性代理；非实时热力。先合并邻近组团，再选区域代表。', evidence, cities }) + '\n');
