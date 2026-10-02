/** Pinned OSM/Nominatim city + district polygons, WGS84, with lossless geometry.
 * node scripts/import-city-boundaries.mjs [cityId] [--refresh]
 * No network is needed when the committed snapshots exist.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
const output = 'src/data/map/boundaries';
const cache = 'node_modules/.cache/vesluma-boundaries';
const municipalities = [
  ['nanjing', 2131524, '南京市', '5', 11], ['xian', 3226004, '西安市', '5', 13],
  ['beijing', 912940, '北京市', '4', 16], ['shanghai', 913067, '上海市', '4', 16],
  ['hangzhou', 3221112, '杭州市', '5', 13], ['chengdu', 2110264, '成都市', '5', 20],
];
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
  const read = async (url, file) => {
    if (!existsSync(file) || process.argv.includes('--refresh')) {
      const raw = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-sS', '--fail', '--max-time', '55', '-A', 'VeslumaCityPlanning/0.3', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      JSON.parse(raw);
      writeFileSync(file, raw);
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    const raw = readFileSync(file, 'utf8');
    receipts.push({ url, downloadedAt: statSync(file).mtime.toISOString(), sha256: createHash('sha256').update(raw).digest('hex') });
    return JSON.parse(raw);
  };
  const relation = (await read(memberUrl, membersFile)).elements.find(e => e.type === 'relation' && e.id === cityRelation);
  if (relation?.tags.name !== name || relation.tags.admin_level !== level) throw new Error('Wrong municipality');
  const subareaIds = relation.members.filter(m => m.type === 'relation' && m.role === 'subarea').map(m => m.ref);
  const childUrl = `https://api.openstreetmap.org/api/0.6/relations.json?relations=${subareaIds.join(',')}`;
  const childRelations = (await read(childUrl, `${cache}/${cityId}-child-tags.json`)).elements;
  // Chengdu's level-7 Tianfu/Hi-Tech functional zones overlap formal districts.
  // Only the level-6 official district/county/county-city layer is used.
  const children = childRelations.filter(e => e.type === 'relation' && subareaIds.includes(e.id)
    && e.tags?.boundary === 'administrative' && e.tags.admin_level === '6').map(e => e.id);
  if (children.length !== expectedDistrictCount || new Set(children).size !== children.length) throw new Error('Unexpected district inventory');
  const cityUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${cityRelation}&format=jsonv2&polygon_geojson=1`;
  // First import accepts the already downloaded exact city search result.
  const oldCityFile = `${cache}/${cityId}-search.json`;
  const cityFile = existsSync(oldCityFile) && !process.argv.includes('--refresh') ? oldCityFile : `${cache}/${cityId}-lookup.json`;
  const actualCityUrl = cityFile === oldCityFile
    ? `https://nominatim.openstreetmap.org/search?city=${cityId === 'nanjing' ? 'Nanjing' : '%E8%A5%BF%E5%AE%89%E5%B8%82'}&country=China&format=jsonv2&polygon_geojson=1&limit=1` : cityUrl;
  const municipality = (await read(actualCityUrl, cityFile)).find(item => item.osm_id === cityRelation);
  const districtUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=${children.map(id => `R${id}`).join(',')}&format=jsonv2&polygon_geojson=1`;
  const districts = await read(districtUrl, `${cache}/${cityId}-districts.json`);
  if (!municipality?.geojson || districts.length !== children.length || districts.some(d => !children.includes(d.osm_id) || !d.geojson)) throw new Error('Incomplete boundaries');
  const feature = (item, role) => ({ type: 'Feature', id: `relation/${item.osm_id}`, properties: { name: item.name, role }, geometry: item.geojson });
  writeFileSync(destination, JSON.stringify({ type: 'FeatureCollection', cityId, coordinateSystem: 'WGS84',
    source: { name: 'OpenStreetMap contributors / Nominatim', url: `https://www.openstreetmap.org/relation/${cityRelation}`, license: 'ODbL-1.0', requests: receipts },
    features: [feature(municipality, 'municipality'), ...districts.map(d => feature(d, 'district'))],
  }) + '\n');
  console.log(`${cityId}: municipality + ${districts.length} complete district polygons`);
}
