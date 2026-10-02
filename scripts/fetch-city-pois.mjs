// One-off, explicitly selected candidates; cached, sequential Nominatim searches.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const root = 'node_modules/.cache/vesluma-boundaries/pois';
mkdirSync(root, { recursive: true });
const queries = {
  'nj-zhongshan': '南京 中山陵', 'nj-niushou': '南京 佛顶宫',
  'nj-yuejiang': '南京 阅江楼', 'nj-qixia': '南京 栖霞寺',
  'nj-pearl': '南京 珍珠泉风景区', 'nj-jinniu': '南京 金牛湖',
  'nj-wuxiang': '南京 无想寺', 'nj-gaochun': '南京 高淳老街',
  'nj-tangshan': '南京 南京直立人化石遗址博物馆',
  'nj-museum': '南京 南京博物院', 'nj-president': '南京 总统府',
  'nj-hongshan': '南京 红山森林动物园', 'nj-ming': '南京 明孝陵',
  'xa-terracotta': '西安 秦始皇兵马俑博物馆', 'xa-daming': '西安 含元殿',
  'xa-chanba': '西安 长安塔', 'xa-cuihua': '西安 翠华山',
  'xa-taiping': '西安 太平国家森林公园', 'xa-louguan': '西安 楼观台',
  'xa-shuilu': '西安 水陆庵', 'xa-zhaohui': '西安 昭慧塔',
  'xa-huaqing': '西安 华清宫', 'xa-history': '西安 陕西历史博物馆',
  'xa-furong': '西安 大唐芙蓉园', 'xa-banpo': '西安 半坡博物馆',
  'nj-pearl-exact': '珍珠泉', 'nj-gaochun-exact': '高淳老街',
  'nj-tangshan-exact': '南京直立人化石遗址博物馆',
  'xa-daming-exact': '丹凤门', 'xa-cuihua-exact': '翠华山国家地质公园',
  'xa-taiping-exact': '太平森林公园', 'xa-louguan-exact': '楼观台',
  'xa-zhaohui-exact': '昭慧塔', 'xa-furong-exact': '大唐芙蓉园',
  'nj-yangshan': '阳山碑材', 'nj-pearl-water': '南京珍珠泉水世界',
  'xa-gaoling': '高陵塔', 'xa-taiping-park': '太平国家森林公园',
};
for (const [id, query] of Object.entries(queries)) {
  const file = `${root}/${id}.json`;
  if (!existsSync(file)) {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '3', bounded: '1', viewbox: id.startsWith('nj-') ? '118.33,32.62,119.25,31.22' : '107.65,34.75,109.83,33.69' })}`;
    try {
      const raw = execFileSync('curl.exe', ['-sS', '--fail', '--max-time', '25', '-A', 'VeslumaCityPlanning/0.3 (local research snapshot)', url], { encoding: 'utf8' });
      writeFileSync(file, JSON.stringify({ url, downloadedAt: new Date().toISOString(), results: JSON.parse(raw) }));
    } catch { console.log(`${id}: request failed`); continue; }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  const data = JSON.parse(readFileSync(file));
  console.log(id, JSON.stringify(data.results.map(d => ({ name: d.name, id: `${d.osm_type}/${d.osm_id}`, lat: d.lat, lng: d.lon, type: d.type }))));
}
