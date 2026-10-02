/** Read-only audit of committed source geometry. No network or source mutation.
 * node scripts/audit-gba-boundaries.mjs
 * Optional original lookup/town receipts: --research-dir <directory>
 * Optional report archive: --write <file.json>
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const research = option('--research-dir');
const output = option('--write');
const ids = ['guangzhou', 'shenzhen', 'hongkong', 'macau'];
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const multi = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const bbox = polygons => {
  const result = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    result[0] = Math.min(result[0], lng); result[1] = Math.min(result[1], lat);
    result[2] = Math.max(result[2], lng); result[3] = Math.max(result[3], lat);
  }
  return polygons.length ? result : null;
};
const ringArea = ring => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += (ring[i + 1][0] - ring[i][0]) * Math.PI / 180
    * (2 + Math.sin(ring[i][1] * Math.PI / 180) + Math.sin(ring[i + 1][1] * Math.PI / 180));
  return Math.abs(sum * 6371008.8 ** 2 / 2) / 1e6;
};
const area = polygons => polygons.reduce((sum, polygon) => sum + polygon.reduce((value, ring, index) => value + (index ? -1 : 1) * ringArea(ring), 0), 0);
const summary = polygons => ({ empty: polygons.length === 0, componentCount: polygons.length, bbox: bbox(polygons), areaKm2: area(polygons) });
const components = polygons => polygons.map((polygon, index) => ({ index, ...summary([polygon]), holes: polygon.length - 1, outerVertices: polygon[0].length }));
const snapshots = Object.fromEntries(ids.map(id => [id, read(resolve(root, `src/data/map/boundaries/${id}.json`))]));
const features = Object.fromEntries(ids.map(id => {
  const municipality = snapshots[id].features.filter(feature => feature.properties.role === 'municipality');
  if (municipality.length !== 1 || snapshots[id].coordinateSystem !== 'WGS84') throw new Error(`Invalid source snapshot: ${id}`);
  return [id, municipality[0]];
}));
const polygons = Object.fromEntries(ids.map(id => [id, multi(features[id].geometry)]));
const report = {
  checkedAt: new Date().toISOString(),
  command: 'node scripts/audit-gba-boundaries.mjs [--research-dir <original-research-directory>] [--write <report.json>]',
  method: {
    topology: 'Complete polygon-clipping Boolean intersection/difference. Empty means an empty geometry array, not rounded area or point sampling. Adjacent shared lines are not area overlap.',
    area: 'Descriptive spherical ring area using Earth radius 6371008.8 m, subtracting holes. These values include all source faces and are not official land or maritime areas.',
    bboxOrder: '[west, south, east, north], WGS84 longitude/latitude degrees',
    optionalResearch: 'The four-town raw Nominatim response is research evidence, not a required runtime or main audit input. Without --research-dir it is explicitly not rerun.',
  },
  limits: [
    'OSM source polygons are project map coverage; neither their relation names nor their geometry establish legal administrative attribution.',
    'Tourism game groups partition this source. A representative unlocks its whole group, including indirectly covered water, islands or source-marked jurisdiction faces; this is not access permission.',
    'Two-dimensional OSM geometry does not establish legal port boundaries, vertical jurisdiction, public access, official land area, or surveyed accuracy.',
    'This audit does not validate physical arrival, photographs, 250-metre field accuracy, or real-device behavior.',
  ],
  officialContext: [
    { title: '深圳市、区、街道三级行政区划代码汇总表', url: 'https://mzj.sz.gov.cn/szmz/pc/bmxx/cyfwzy/content/post_10275241.html', publishedAt: '2022-11-25 17:41', separatelyDisplayedUpdatedAt: null, shortQuote: '行政区划隶属于海丰县', limit: 'Dated official administrative-code table, not an independently verified 2026 change register.' },
    { title: '《广东省深汕特别合作区条例》全文', url: 'https://www.szss.gov.cn/gkmlpt/content/10/10863/mpost_10863191.html', adoptedAt: '2023-09-27', publishedAt: '2023-09-28', effectiveAt: '2023-11-01', displayedStatus: '现行有效', paraphrase: 'Article 2 identifies the four streets in Shanwei Haifeng County. Article 4 assigns Shenzhen development, construction, management and service responsibilities at the standard of its economic functional zones.', limit: 'Official legal context, not proof that the OSM coastlines or faces match the statutory territory.' },
    { title: '香港地政总署 Coordinates Transformation API', url: 'https://data.gov.hk/en-data/dataset/hk-landsd-openmap-coordinates-transformation-api', paraphrase: 'HK1980 grid northing/easting and WGS84 latitude/longitude are distinct systems; converting coordinates does not improve their original accuracy.' },
    { title: '澳门测绘常见问题', url: 'https://geomatics.dsscu.gov.mo/zh-hans/question_and_answer.html', paraphrase: 'Macao grid coordinates and WGS84 geographic coordinates are separately provided coordinate products.' },
    { title: '香港保安局皇岗口岸简介', url: 'https://www.sb.gov.hk/chi/hg/introduction.html', eventDate: '2026-07-31', paraphrase: 'The official page states that the Hong Kong Port Area was established and Hong Kong law applied from this date.', limit: 'This does not certify an OSM face or grant a visitor permission to enter it.' },
    { title: '全国人大常委会授权澳门对横琴口岸澳方口岸区及相关延伸区实施管辖', url: 'https://www.gov.mo/zh-hans/news/267884/', publishedAt: '2019-10-26', paraphrase: 'Specified port and extension areas have separate jurisdiction arrangements; this is not a statement that all Hengqin is Macao.', limit: 'No legal boundary equivalence is inferred for the source faces.' },
  ],
  cities: {}, intersections: [], shenshan: null, optionalTownAudit: { status: 'not-run', reason: 'Pass --research-dir containing shenshan-towns.json and its receipt to repeat the supplemental research check.' },
};
for (const id of ids) {
  const path = `src/data/map/boundaries/${id}.json`;
  const lookupReceipt = snapshots[id].source.requests.find(request => /\/lookup\?osm_ids=R\d+&/.test(request.url));
  const city = { sourceFile: path, sourceFileSha256: hash(readFileSync(resolve(root, path))), sourceUrl: snapshots[id].source.url,
    originalLookupReceipt: lookupReceipt, sourceScope: snapshots[id].source.scope ?? null, ...summary(polygons[id]), components: components(polygons[id]) };
  if (research && existsSync(resolve(research, `${id}-lookup.json`))) {
    const originalPath = resolve(research, `${id}-lookup.json`), raw = readFileSync(originalPath);
    city.originalLookupChecked = { sha256MatchesReceipt: hash(raw) === lookupReceipt?.sha256,
      geometryExactlyMatchesCommittedSnapshot: JSON.stringify(read(originalPath)[0].geojson) === JSON.stringify(features[id].geometry) };
  }
  report.cities[id] = city;
}
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const intersection = pc.intersection(polygons[ids[i]], polygons[ids[j]]);
  report.intersections.push({ cities: [ids[i], ids[j]], ...summary(intersection), components: components(intersection) });
}
const shenshanFeature = snapshots.shenzhen.features.find(feature => feature.properties.role === 'district' && feature.properties.name === '深汕特别合作区');
if (!shenshanFeature) throw new Error('Missing independently sourced Shenshan district geometry');
const shenshan = multi(shenshanFeature.geometry);
report.shenshan = { sourceFeatureName: shenshanFeature.properties.name, ...summary(shenshan), components: components(shenshan), outsideShenzhen: summary(pc.difference(shenshan, polygons.shenzhen)) };
if (research && existsSync(resolve(research, 'shenshan-towns.json'))) {
  const path = resolve(research, 'shenshan-towns.json'), towns = read(path);
  const receiptPath = `${path}.receipt.json`;
  const union = pc.union(...towns.map(town => multi(town.geojson)));
  report.optionalTownAudit = {
    status: 'run', rawFile: 'shenshan-towns.json (optional research file, not committed)', rawSha256: hash(readFileSync(path)),
    receipt: existsSync(receiptPath) ? read(receiptPath) : null,
    expectedRelationIds: [19451183, 19451184, 19451185, 19451186], actualRelationIds: towns.map(town => town.osm_id).sort((a, b) => a - b),
    towns: towns.map(town => { const geometry = multi(town.geojson); return { osmId: town.osm_id, sourceName: town.name, ...summary(geometry), outsideShenzhen: summary(pc.difference(geometry, polygons.shenzhen)), outsideShenshan: summary(pc.difference(geometry, shenshan)) }; }),
    union: summary(union), shenshanOutsideTowns: summary(pc.difference(shenshan, union)), townsOutsideShenshan: summary(pc.difference(union, shenshan)),
    interpretation: 'All four complete source town geometries are checked, not just their centres. The remainder is an OSM geometric difference; no official sea-area measurement or legal scope is inferred.',
  };
}
report.passed = report.intersections.every(pair => pair.empty) && report.shenshan.outsideShenzhen.empty
  && Object.values(report.cities).every(city => !city.originalLookupChecked || Object.values(city.originalLookupChecked).every(Boolean))
  && (report.optionalTownAudit.status !== 'run' || (JSON.stringify(report.optionalTownAudit.actualRelationIds) === JSON.stringify(report.optionalTownAudit.expectedRelationIds)
    && report.optionalTownAudit.towns.every(town => town.outsideShenzhen.empty && town.outsideShenshan.empty)));
if (output) { const path = resolve(root, output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(output ? { passed: report.passed, report: output, cities: Object.fromEntries(ids.map(id => [id, { components: report.cities[id].componentCount, areaKm2: report.cities[id].areaKm2 }])), pairwiseIntersectionsEmpty: report.intersections.every(pair => pair.empty), shenshanInsideShenzhen: report.shenshan.outsideShenzhen.empty, optionalTownAudit: report.optionalTownAudit.status } : report, null, 2));
if (!report.passed) process.exitCode = 1;
