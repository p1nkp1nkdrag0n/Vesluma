/** Pinned OSM/Nominatim city + district polygons, WGS84, with lossless geometry.
 * node scripts/import-city-boundaries.mjs [--refresh]
 * No network is needed when the committed snapshots exist.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
const output = 'src/data/map/boundaries';
const cache = 'node_modules/.cache/vesluma-boundaries';
mkdirSync(output, { recursive: true });
mkdirSync(cache, { recursive: true });
for (const [cityId, cityRelation, name] of [['nanjing', 2131524, '南京市'], ['xian', 3226004, '西安市']]) {
  const destination = `${output}/${cityId}.json`;
  if (existsSync(destination) && !process.argv.includes('--refresh')) continue;
  const membersFile = `${cache}/${cityId}-members.json`;
  const memberUrl = `https://api.openstreetmap.org/api/0.6/relation/${cityRelation}.json`;
  const receipts = [];
  const read = (url, file) => {
    if (!existsSync(file) || process.argv.includes('--refresh')) {
      const raw = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-sS', '--fail', '--max-time', '45', '-A', 'VeslumaCityPlanning/0.3', url], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      JSON.parse(raw);
      writeFileSync(file, raw);
    }
    const raw = readFileSync(file, 'utf8');
    receipts.push({ url, downloadedAt: statSync(file).mtime.toISOString(), sha256: createHash('sha256').update(raw).digest('hex') });
    return JSON.parse(raw);
  };
  const relation = read(memberUrl, membersFile).elements.find(e => e.type === 'relation' && e.id === cityRelation);
  if (relation?.tags.name !== name || relation.tags.admin_level !== '5') throw new Error('Wrong municipality');
  const children = relation.members.filter(m => m.type === 'relation' && m.role === 'subarea').map(m => m.ref);
  const cityUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${cityRelation}&format=jsonv2&polygon_geojson=1`;
  // First import accepts the already downloaded exact city search result.
  const oldCityFile = `${cache}/${cityId}-search.json`;
  const cityFile = existsSync(oldCityFile) && !process.argv.includes('--refresh') ? oldCityFile : `${cache}/${cityId}-lookup.json`;
  const actualCityUrl = cityFile === oldCityFile
    ? `https://nominatim.openstreetmap.org/search?city=${cityId === 'nanjing' ? 'Nanjing' : '%E8%A5%BF%E5%AE%89%E5%B8%82'}&country=China&format=jsonv2&polygon_geojson=1&limit=1` : cityUrl;
  const municipality = read(actualCityUrl, cityFile).find(item => item.osm_id === cityRelation);
  await new Promise(resolve => setTimeout(resolve, 1100));
  const districtUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=${children.map(id => `R${id}`).join(',')}&format=jsonv2&polygon_geojson=1`;
  const districts = read(districtUrl, `${cache}/${cityId}-districts.json`);
  if (!municipality?.geojson || districts.length !== children.length || districts.some(d => !children.includes(d.osm_id) || !d.geojson)) throw new Error('Incomplete boundaries');
  const feature = (item, role) => ({ type: 'Feature', id: `relation/${item.osm_id}`, properties: { name: item.name, role }, geometry: item.geojson });
  writeFileSync(destination, JSON.stringify({ type: 'FeatureCollection', cityId, coordinateSystem: 'WGS84',
    source: { name: 'OpenStreetMap contributors / Nominatim', url: `https://www.openstreetmap.org/relation/${cityRelation}`, license: 'ODbL-1.0', requests: receipts },
    features: [feature(municipality, 'municipality'), ...districts.map(d => feature(d, 'district'))],
  }) + '\n');
  console.log(`${cityId}: municipality + ${districts.length} complete district polygons`);
}
