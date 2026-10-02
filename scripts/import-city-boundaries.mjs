/** Pinned OSM/Nominatim city + district polygons, WGS84, with lossless geometry.
 * node scripts/import-city-boundaries.mjs [cityId] [--refresh]
 * No network is needed when the committed snapshots exist.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { completeOverpassResponse } from './overpass-response.ts';
const output = 'src/data/map/boundaries';
const cache = 'node_modules/.cache/vesluma-boundaries';
const municipalities = [
  ['nanjing', 2131524, '南京市', '5', 11], ['xian', 3226004, '西安市', '5', 13],
  ['beijing', 912940, '北京市', '4', 16], ['shanghai', 913067, '上海市', '4', 16],
  ['hangzhou', 3221112, '杭州市', '5', 13], ['chengdu', 2110264, '成都市', '5', 20],
  ['guangzhou', 3287346, '广州市', '5', 11], ['shenzhen', 3464353, '深圳市', '5', 10],
  ['hongkong', 913110, '香港 Hong Kong', '3', 18], ['macau', 1867188, '澳門 Macau', '3', 8],
];
// Hong Kong's SAR relation has no direct subarea members. These are its 18
// established districts, verified against the cached spatial Overpass discovery.
// Lok Ma Chau Loop is a separate OSM level-6 area, not a nineteenth district.
const hongKongDistricts = [2558879, 2558880, 2558881, 2558883, 2670978, 2800200,
  2800201, 2800276, 2800277, 7351646, 8189562, 8191142, 8368100, 8477820,
  8480494, 8480823, 9159733, 9159737];
const hongKongDistrictQuery = '[out:json][timeout:30][maxsize:67108864];relation[boundary=administrative][admin_level~"^[456]$"](22.1367222,113.8171111,22.5683333,114.5024444);out tags;';
const regionalScope = {
  guangzhou: 'Complete OSM municipality and its eleven level-6 districts.',
  shenzhen: 'Complete OSM source relation, with nine district-named subareas plus the subarea named Shenshan Special Cooperation Zone and disconnected polygons. Dapeng is within the source Longgang polygon. Source geometry and game coverage do not establish formal administrative status.',
  hongkong: 'Complete OSM source relation, including waters and spatially separate polygons near Shenzhen Bay and Huanggang. The eighteen district polygons do not imply a nineteenth district for Lok Ma Chau Loop. Source geometry and game coverage do not establish formal administrative status, immigration access or unrestricted public land.',
  macau: 'Complete OSM source relation, including waters and spatially separate polygons near Hengqin. The eight direct subareas mix two level-5 island areas and six level-6 parish/reclaimed areas. Source geometry and game coverage do not establish formal administrative status or unrestricted public access.',
};
const selected = process.argv.slice(2).filter(value => value !== '--refresh');
if (selected.some(id => !municipalities.some(city => city[0] === id))) throw new Error('Unknown city ID');
mkdirSync(output, { recursive: true });
mkdirSync(cache, { recursive: true });
for (const [cityId, cityRelation, name, level, expectedDistrictCount] of municipalities) {
  if (selected.length && !selected.includes(cityId)) continue;
  const destination = `${output}/${cityId}.json`;
  if (existsSync(destination) && !process.argv.includes('--refresh')) continue;
  const membersFile = `${cache}/${cityId}-members.json`;
  const memberUrl = `https://api.openstreetmap.org/api/0.6/relation/${cityRelation}.json`;
  const receipts = [];
  const read = async (url, file, query) => {
    const sidecar = `${file}.receipt.json`;
    if (!existsSync(file) || process.argv.includes('--refresh')) {
      const raw = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-sS', '--fail', '--max-time', '55', '-A', 'VeslumaCityPlanning/0.3',
        ...(query ? ['--data-urlencode', `data=${query}`] : []), url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const downloaded = JSON.parse(raw);
      if (query && !completeOverpassResponse(downloaded)) throw new Error('Incomplete district discovery response');
      writeFileSync(file, raw);
      writeFileSync(sidecar, JSON.stringify({ url, ...(query ? { query } : {}), downloadedAt: statSync(file).mtime.toISOString(),
        sha256: createHash('sha256').update(raw).digest('hex') }) + '\n');
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    const raw = readFileSync(file, 'utf8');
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const receipt = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, 'utf8'))
      : { url, downloadedAt: statSync(file).mtime.toISOString(), sha256 };
    if (receipt.url !== url || receipt.sha256 !== sha256 || (query && receipt.query !== query)
      || !Number.isFinite(Date.parse(receipt.downloadedAt))) throw new Error('Boundary source receipt mismatch');
    receipts.push(receipt);
    return JSON.parse(raw);
  };
  const relation = (await read(memberUrl, membersFile)).elements.find(e => e.type === 'relation' && e.id === cityRelation);
  if (relation?.tags.name !== name || relation.tags.admin_level !== level) throw new Error('Wrong municipality');
  const subareaIds = cityId === 'hongkong' ? hongKongDistricts
    : relation.members.filter(m => m.type === 'relation' && m.role === 'subarea').map(m => m.ref);
  if (cityId === 'hongkong') {
    const discoveryFile = `${cache}/hongkong-district-discovery.json`;
    const discovery = await read('https://overpass-api.de/api/interpreter', discoveryFile, hongKongDistrictQuery);
    if (!completeOverpassResponse(discovery)) throw new Error('Incomplete district discovery response');
    if (subareaIds.some(id => !discovery.elements.some(item => item.id === id && item.tags?.admin_level === '6'))) throw new Error('Unverified Hong Kong district inventory');
  }
  const childUrl = `https://api.openstreetmap.org/api/0.6/relations.json?relations=${subareaIds.join(',')}`;
  const childRelations = (await read(childUrl, `${cache}/${cityId}-child-tags.json`)).elements;
  // Chengdu's level-7 Tianfu/Hi-Tech functional zones overlap formal districts.
  // Only the level-6 official district/county/county-city layer is used.
  const children = childRelations.filter(e => e.type === 'relation' && subareaIds.includes(e.id)
    && e.tags?.boundary === 'administrative' && (e.tags.admin_level === '6'
      || (cityId === 'macau' && e.tags.admin_level === '5'))).map(e => e.id);
  if (children.length !== expectedDistrictCount || new Set(children).size !== children.length) throw new Error('Unexpected district inventory');
  const extraTags = Object.hasOwn(regionalScope, cityId) ? '&extratags=1' : '';
  const cityUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${cityRelation}&format=jsonv2&polygon_geojson=1${extraTags}`;
  // First import accepts the already downloaded exact city search result.
  const oldCityFile = `${cache}/${cityId}-search.json`;
  const cityFile = ['nanjing', 'xian'].includes(cityId) && existsSync(oldCityFile) && !process.argv.includes('--refresh') ? oldCityFile : `${cache}/${cityId}-lookup.json`;
  const actualCityUrl = cityFile === oldCityFile
    ? `https://nominatim.openstreetmap.org/search?city=${cityId === 'nanjing' ? 'Nanjing' : '%E8%A5%BF%E5%AE%89%E5%B8%82'}&country=China&format=jsonv2&polygon_geojson=1&limit=1` : cityUrl;
  const municipality = (await read(actualCityUrl, cityFile)).find(item => item.osm_id === cityRelation);
  const districtUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=${children.map(id => `R${id}`).join(',')}&format=jsonv2&polygon_geojson=1${extraTags}`;
  const districts = await read(districtUrl, `${cache}/${cityId}-districts.json`);
  if (!municipality?.geojson || districts.length !== children.length || districts.some(d => !children.includes(d.osm_id) || !d.geojson)) throw new Error('Incomplete boundaries');
  const feature = (item, role) => ({ type: 'Feature', id: `relation/${item.osm_id}`, properties: { name: item.name, role }, geometry: item.geojson });
  writeFileSync(destination, JSON.stringify({ type: 'FeatureCollection', cityId, coordinateSystem: 'WGS84',
    source: { name: 'OpenStreetMap contributors / Nominatim', url: `https://www.openstreetmap.org/relation/${cityRelation}`, license: 'ODbL-1.0', requests: receipts,
      ...(regionalScope[cityId] ? { scope: regionalScope[cityId] } : {}) },
    features: [feature(municipality, 'municipality'), ...districts.map(d => feature(d, 'district'))],
  }) + '\n');
  console.log(`${cityId}: municipality + ${districts.length} complete district polygons`);
}
