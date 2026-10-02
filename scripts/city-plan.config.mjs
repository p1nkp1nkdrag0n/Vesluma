/** Editorial planning, not official scenic-area grades or measured live heat.
 * Tiers express product roles; an independent rural cluster can have a tier-1
 * representative without being claimed as nationally more famous than tier 2.
 */
import { evidence as beijingShanghaiEvidence, cityPlans as beijingShanghaiCities } from './city-plan.beijing-shanghai.mjs';
import { evidence as hangzhouChengduEvidence, cityPlans as hangzhouChengduCities } from './city-plan.hangzhou-chengdu.mjs';
import { evidence as guangzhouShenzhenEvidence, cityPlans as guangzhouShenzhenCities } from './city-plan.guangzhou-shenzhen.mjs';
import { evidence as hongkongMacauEvidence, cityPlans as hongkongMacauCities } from './city-plan.hongkong-macau.mjs';
// This version is also stored in existing local/SQLite visits. Keep the original
// two cities and their IDs stable when adding independent city configurations.
export const planVersion = 'citywide-2026-10-02';
export const evidence = [
  { id: 'nj-heat', title: '南京公安：2026 清明客流前五与五一组团交通', date: '2026-04-30', url: 'https://gaj.nanjing.gov.cn/jtgl/202604/t20260430_5832898.html', kind: 'visitor-ranking' },
  { id: 'nj-clusters', title: '南京全域旅游片区规划', date: '2021-11-12', url: 'https://www.nanjing.gov.cn/xxgkn/zt/ghxxgk_70036/ssw_70043/zxgh_70047/202111/t20211112_3188577.html', kind: 'geographic-planning' },
  { id: 'nj-rural', title: '南京五条春季乡村旅游线路', date: '2025-04-01', url: 'https://www.nanjing.gov.cn/zzb/ywdt/njxx/202504/t20250401_5108099.html', kind: 'regional-representativeness' },
  { id: 'nj-links', title: '南京旅游巴士串联栖霞—汤山、浦口—六合、溧水—高淳', date: '2024-06-06', url: 'https://www.nanjing.gov.cn/njxx/202406/t20240606_4684314.html', kind: 'geographic-planning' },
  { id: 'xa-heat', title: '西安文物局：2025 国庆中秋文博客流', date: '2025-10-09', url: 'https://wwj.xa.gov.cn/xwzx/gzdt/1976105586082709505.html', kind: 'visitor-counts' },
  { id: 'xa-list', title: '西安文旅局：2026 年 A 级旅游景区名录', date: '2026-02-25', url: 'https://wlj.xa.gov.cn/wlml/lyjq/1.html', kind: 'official-inventory' },
  { id: 'xa-chanba', title: '浐灞国际港：2025 春节片区旅游客流', date: '2025-02-06', url: 'https://cbip.xa.gov.cn/zwgk/shgysy/ggwhty/1887436978742394882.html', kind: 'regional-visitor-counts' },
];
const osm = id => `https://www.openstreetmap.org/${id}`;
const wiki = name => `https://zh.wikipedia.org/wiki/${encodeURIComponent(name)}`;
const point = (id, name, tier, region, lng, lat, source, subject, reason) => ({
  id, name, shortName: name, tier, region, lng, lat, sourceUrl: source.startsWith('http') ? source : osm(source),
  photoSubject: subject || `${name}建筑或景区标识 · 候选点`,
  description: reason, category: tier === 3 ? 'arrival' : 'heritage',
});
const zone = (key, name, anchorLandmarkId, districts, heat, evidenceIds, rationale, slice) => ({
  key, name, anchorLandmarkId, districts, heat, evidenceIds, rationale, ...(slice ? { slice } : {}),
});

export const cityPlans = [
  {
    id: 'nanjing', prefix: 'nj', name: '南京', enName: 'NANJING', subtitle: '从秦淮河畔，展开一座城。',
    center: [32.045, 118.79], startPosition: { lat: 32.088617, lng: 118.791253 }, zoom: 13,
    zones: [
      zone('qinhuai', '秦淮 · 老城南', 'nj-confucius', ['秦淮区', '雨花台区'], '高热组团', ['nj-heat', 'nj-clusters'], '夫子庙统领秦淮—门东游览组团，并覆盖雨花台城南延伸区；城门、街巷不再各切一块。'),
      zone('xuanwu', '玄武湖 · 城中', 'nj-xuanwu', ['玄武区'], '高热组团', ['nj-heat'], '玄武湖、鸡鸣寺、总统府与红山合并为城中北组团，以玄武门作建筑代表。', { side: 'west', longitude: 118.812 }),
      zone('zhongshan', '钟山 · 紫金山', 'nj-zhongshan', ['玄武区'], '高热组团', ['nj-heat', 'nj-clusters'], '中山陵代表钟山山体组团，明孝陵、灵谷寺与南京博物院只作游览记录。', { side: 'east', longitude: 118.812 }),
      zone('riverside', '阅江 · 河西滨江', 'nj-yuejiang', ['鼓楼区', '建邺区'], '城市代表', ['nj-clusters', 'nj-links'], '沿长江东南岸合并下关与河西，以阅江楼代表滨江历史与城市景观，不为南京眼另开小块。'),
      zone('qixia', '栖霞 · 仙林', 'nj-qixia', ['栖霞区'], '季节热点', ['nj-clusters', 'nj-links'], '栖霞山有独立的秋季旅游吸引力，与城中组团分开，兼顾仙林和东北沿江。'),
      zone('pukou', '浦口 · 老山', 'nj-pearl', ['浦口区'], '区域代表', ['nj-links', 'nj-clusters'], '长江作为主要分隔，珍珠泉代表江北老山休闲组团，北岸不与城区机械就近合并。'),
      zone('liuhe', '六合 · 金牛湖', 'nj-jinniu', ['六合区'], '区域代表', ['nj-rural', 'nj-links'], '以金牛湖代表独立的北部山水组团，六合全域一次展开。'),
      zone('niushou', '牛首 · 江宁西南', 'nj-niushou', ['江宁区'], '高热组团', ['nj-heat', 'nj-clusters'], '牛首山佛顶宫代表江宁西南组团，谷里、银杏湖、东山与禄口不另设强制开图点。', { side: 'west', longitude: 118.9 }),
      zone('tangshan', '汤山 · 江宁东', 'nj-yangshan', ['江宁区'], '区域代表', ['nj-clusters', 'nj-links'], '汤山距牛首山较远，单列温泉—地质文化组团，以阳山碑材作为可辨识的历史地标。', { side: 'east', longitude: 118.9 }),
      zone('lishui', '溧水 · 无想山', 'nj-wuxiang', ['溧水区'], '区域代表', ['nj-rural', 'nj-links'], '以无想寺代表溧水山水文化组团，天生桥、无想水镇和石臼湖东岸合并覆盖。'),
      zone('gaochun', '高淳 · 慢城', 'nj-gaochun', ['高淳区'], '区域代表', ['nj-rural', 'nj-links'], '以高淳老街代表南端人文组团，固城湖与桠溪慢城纳入同一大区。'),
    ],
    landmarks: [
      point('nj-confucius', '夫子庙', 1, 'qinhuai', 118.783786, 32.022579, 'https://dbpedia.org/page/Nanjing_Fuzimiao', '夫子庙大成殿或牌坊', '秦淮组团的开图代表；到访后展开秦淮与老城南。'),
      point('nj-xuanwu', '玄武门', 1, 'xuanwu', 118.7823389, 32.0726194, 'https://www.wikidata.org/wiki/Q17059567', '玄武门门楼', '以湖畔城门代表玄武湖—城中组团。鸡鸣寺、总统府和红山无需逐一打卡开图。'),
      point('nj-zhongshan', '中山陵', 1, 'zhongshan', 118.8485432, 32.0601798, 'relation/18303735', '中山陵主体 · 景点中心候选点', '钟山组团的代表，明孝陵等周边名胜随本区一并展开。'),
      point('nj-yuejiang', '阅江楼', 1, 'riverside', 118.7413236, 32.0961677, 'way/461035531', '阅江楼主体', '以沿江历史地标代表下关—河西滨江组团。'),
      point('nj-qixia', '栖霞寺', 1, 'qixia', 118.9529986, 32.1535359, 'way/1243073749', '栖霞寺建筑或标识', '以古寺代表栖霞山与东北部旅游组团。'),
      point('nj-pearl', '珍珠泉', 1, 'pukou', 118.654014, 32.1215965, 'node/10178129786', '珍珠泉西门 · 站点附近候选入口', '江北老山休闲组团的代表；具体拍照点需在西门现场确认。'),
      point('nj-jinniu', '金牛湖', 1, 'liuhe', 118.969, 32.476, 'relation/18108381', '金牛湖景区门楼 · 西南岸候选入口', '代表六合独立山水组团；入口为按湖岸选定的规划候选点，待现场定位。'),
      point('nj-niushou', '牛首山佛顶宫', 1, 'niushou', 118.7363713, 31.9151992, 'way/1160624650', '佛顶宫主体', '以高辨识度建筑代表江宁西南旅游组团。'),
      point('nj-yangshan', '阳山碑材', 1, 'tangshan', 118.9978911, 32.0663931, 'way/165713282', '阳山碑材或景区标识 · 景区中心候选点', '作为汤山—江宁东部组团的历史地标，温泉与园博园不另设开图条件。'),
      point('nj-wuxiang', '无想寺', 1, 'lishui', 119.0257283, 31.5978081, 'way/626220260', '无想寺建筑', '以无想山的人文地标代表溧水全域。'),
      point('nj-gaochun', '高淳老街', 1, 'gaochun', 118.86355, 31.32053, 'node/1836262442', '老街牌坊 · 同名站附近候选入口', '以老街代表高淳慢生活组团；入口拍照位置待现场核实。'),
      point('nj-laomendong', '老门东', 2, 'qinhuai', 118.7819, 32.0185, 'https://commons.wikimedia.org/wiki/Category:Laomendong', '老门东牌坊', '秦淮组团的重要游览点，保留到访与照片，由夫子庙统一开图。'),
      point('nj-zhonghua', '中华门', 2, 'qinhuai', 118.7764861, 32.0146861, 'https://commons.wikimedia.org/wiki/Category:Zhonghua_Gate', '中华门城堡主体', '与夫子庙、门东同属城南游览组团，记录到访即可。'),
      point('nj-jiming', '鸡鸣寺', 2, 'xuanwu', 118.79003, 32.06305, 'way/319055520', '鸡鸣寺外部建筑或标识', '玄武湖组团的重点游览点，由玄武门统一展开本区。'),
      point('nj-president', '总统府', 2, 'xuanwu', 118.7922062, 32.0460896, 'way/62353727', '总统府建筑 · 景点中心候选点', '知名度很高，但与城中组团共同开图，不再增加独立地图门槛。'),
      point('nj-hongshan', '红山森林动物园', 2, 'xuanwu', 118.7967424, 32.0939361, 'way/62344632', '动物园标识 · 园区中心候选点', '热门亲子景点，保留完整到访记录，不重复切分玄武湖—城北组团。'),
      point('nj-ming', '明孝陵', 2, 'zhongshan', 118.8347042, 32.0623145, 'way/380923041', '明孝陵主体', '钟山组团的重要遗产景点，由中山陵统一开图。'),
      point('nj-museum', '南京博物院', 2, 'zhongshan', 118.819887, 32.0422995, 'way/319998727', '南京博物院馆舍', '位于钟山南侧的文化景点，与钟山组团共同展开。'),
      point('nj-station', '南京站', 3, 'xuanwu', 118.791253, 32.088617, 'https://commons.wikimedia.org/wiki/File:Nanjing_Railway_Station_20160810-2.jpg', '南京站站名 · 南广场候选位置', '记录抵达城市的第一张合影，车站不承担开图任务。'),
    ],
  },
  {
    id: 'xian', prefix: 'xa', name: '西安', enName: 'XI’AN', subtitle: '穿过城门，留下这一程。',
    center: [34.26101, 108.94234], startPosition: { lat: 34.377556, lng: 108.934083 }, zoom: 13,
    zones: [
      zone('center', '钟楼 · 城墙老城', 'xa-bell', ['新城区', '碑林区', '莲湖区'], '高热组团', ['xa-heat', 'xa-list'], '钟楼作为城市中心标志，统一展开钟鼓楼—城墙—碑林组团，避免老城被城门与街巷切碎。'),
      zone('qujiang', '大雁塔 · 曲江', 'xa-pagoda', ['雁塔区'], '高热组团', ['xa-list', 'xa-heat'], '以大雁塔代表曲江文化组团，芙蓉园、不夜城与陕历博不再分别成为开图门槛。'),
      zone('weiyang', '大明宫 · 未央', 'xa-daming', ['未央区'], '高热组团', ['xa-heat', 'xa-list'], '大明宫与老城有独立的宫城遗址组团，兼顾汉长安城、汉城湖和北站周边。'),
      zone('chanba', '浐灞 · 白鹿原北', 'xa-chanba', ['灞桥区'], '城市代表', ['xa-chanba', 'xa-list'], '以长安塔作为浐灞组团建筑标志，世博园、半坡与白鹿仓统一开图。'),
      zone('lintong', '临潼 · 秦陵骊山', 'xa-terracotta', ['临潼区'], '高热组团', ['xa-heat', 'xa-list'], '秦始皇帝陵博物院在官方客流中领先，以兵马俑代表整个临潼组团，华清宫保留游览记录。'),
      zone('north', '高陵 · 阎良', 'xa-zhaohui', ['高陵区', '阎良区'], '区域代表', ['xa-list'], '北部平原旅游点较疏，以昭慧塔代表北部人文组团，高陵与阎良合并为一个大区。'),
      zone('changan', '长安 · 秦岭中段', 'xa-cuihua', ['长安区'], '区域代表', ['xa-list'], '翠华山作为秦岭中段旅游代表，南五台、秦岭动物园与长安城郊不再细分。'),
      zone('huyi', '鄠邑 · 太平峪', 'xa-taiping', ['鄠邑区'], '区域代表', ['xa-list'], '太平森林公园代表鄠邑山地组团，朱雀与金龙峡纳入同一大区。'),
      zone('zhouzhi', '周至 · 楼观', 'xa-louguan', ['周至县'], '区域代表', ['xa-list'], '楼观台代表西部道文化与生态旅游，周至山地面积大、景点分散，整体展开而不按山谷切块。'),
      zone('lantian', '蓝田 · 水陆庵', 'xa-shuilu', ['蓝田县'], '区域代表', ['xa-list'], '水陆庵是明确可识别的蓝田人文地标，东南山地和白鹿原南部合并覆盖。'),
    ],
    landmarks: [
      point('xa-bell', '钟楼', 1, 'center', 108.94234, 34.26101, 'way/254488435', '钟楼建筑主体', '以城市中心地标统一展开钟鼓楼—城墙老城组团。'),
      point('xa-pagoda', '大雁塔', 1, 'qujiang', 108.95943, 34.2198, 'way/92223044', '大雁塔主体 · 北广场候选位置', '曲江组团的开图代表；大唐不夜城、芙蓉园和陕历博不再分别开图。'),
      point('xa-daming', '大明宫丹凤门', 1, 'weiyang', 108.958, 34.285, 'relation/3885075', '丹凤门主体 · 广场北侧候选点', '以大明宫宫门代表未央组团，候选点根据丹凤门广场位置确定，待现场核实。'),
      point('xa-chanba', '长安塔', 1, 'chanba', 109.0550139, 34.3233549, 'way/252885706', '长安塔主体', '以世博园建筑标志代表浐灞与灞桥组团。'),
      point('xa-terracotta', '秦始皇兵马俑', 1, 'lintong', 109.277673, 34.3873627, 'way/71235670', '秦始皇帝陵博物院馆舍或标识 · 景点中心候选点', '临潼组团的代表地标，秦陵、华清宫与骊山共同展开。'),
      point('xa-zhaohui', '昭慧塔', 1, 'north', 109.09651, 34.52505, wiki('昭慧塔'), '昭慧塔主体', '作为高陵—阎良北部组团的区域代表；一级表达开图职责，不代表全国知名度排名。'),
      point('xa-cuihua', '翠华山', 1, 'changan', 109.00413, 33.99849, 'way/408666185', '翠华山入口标识 · 汽车站附近候选点', '代表长安与秦岭中段，入口坐标需在现场确认。'),
      point('xa-taiping', '太平森林公园', 1, 'huyi', 108.6483849, 33.9086375, 'node/8778148829', '公园标识 · 景区步道北端候选点', '代表鄠邑与太平峪山地组团，正式拍照入口待核实。'),
      point('xa-louguan', '楼观台', 1, 'zhouzhi', 108.3242264, 34.066026, 'way/250710317', '楼观台道文化景区建筑或标识', '以历史文化地标代表周至与西部秦岭组团。'),
      point('xa-shuilu', '水陆庵', 1, 'lantian', 109.4114938, 34.1332998, 'node/5381134232', '水陆庵外部建筑或标识', '以蓝田人文地标代表东南部山地组团。'),
      point('xa-drum', '鼓楼', 2, 'center', 108.93884, 34.26176, 'way/254488437', '鼓楼建筑主体', '与钟楼同属中心组团，保留独立到访记录，由钟楼统一开图。'),
      point('xa-yongning', '永宁门', 2, 'center', 108.94232, 34.2531, 'node/6817037487', '永宁门城门建筑', '西安城墙的重要游览点，纳入钟楼—城墙组团。'),
      point('xa-huaqing', '华清宫', 2, 'lintong', 109.2075385, 34.3649458, 'way/88216827', '华清宫建筑或标识 · 景区中心候选点', '知名景区与兵马俑共同组成临潼游览组团，无需重复开图。'),
      point('xa-history', '陕西历史博物馆', 2, 'qujiang', 108.9503368, 34.2259093, 'way/1419575277', '陕西历史博物馆馆舍', '重要文博景点，记录游览与照片，随大雁塔展开所在组团。'),
      point('xa-furong', '大唐芙蓉园', 2, 'qujiang', 108.971, 34.2125, 'https://wlj.xa.gov.cn/wlml/lyjq/1.html', '大唐芙蓉园建筑或入口标识 · 规划候选点', '与大雁塔共属曲江组团，不单独切出一个开图小区。'),
      point('xa-night', '大唐不夜城', 2, 'qujiang', 108.9586, 34.2126, 'https://wlj.xa.gov.cn/xxgk/ghjh/1915235700400730114.html', '大唐不夜城街区标识 · 规划候选点', '与大雁塔相邻的夜游街区，保留到访记录，由大雁塔统一开图。'),
      point('xa-banpo', '半坡博物馆', 2, 'chanba', 109.0479754, 34.2740167, 'way/838033005', '半坡博物馆馆舍', '灞桥组团的重点文博景点，不再另切开图区。'),
      point('xa-station', '西安北站', 3, 'weiyang', 108.934083, 34.377556, 'https://en.wikipedia.org/wiki/Xi%27an_North_railway_station', '西安北站站名', '保存抵达记录，车站不承担地图解锁任务。'),
    ],
  },
];

// Cross-district scenic clusters override the administrative scaffold. These
// are explicit planning seams, not claims about surveyed road/river locations.
const nj = cityPlans[0].zones;
nj.find(z => z.key === 'qinhuai').districtClips = { 雨花台区: { side: 'south-of', latitude: 31.96, keep: 'north' } };
const niushou = nj.find(z => z.key === 'niushou');
niushou.districts.push('雨花台区');
niushou.districtClips = { 雨花台区: { side: 'south-of', latitude: 31.96, keep: 'south' } };
const xa = cityPlans[1].zones;
xa.find(z => z.key === 'center').districtClips = { 新城区: { latitude: 34.282, keep: 'south' } };
const weiyang = xa.find(z => z.key === 'weiyang');
weiyang.districts.push('新城区');
weiyang.districtClips = { 新城区: { latitude: 34.282, keep: 'north' } };

evidence.push(...beijingShanghaiEvidence, ...hangzhouChengduEvidence, ...guangzhouShenzhenEvidence, ...hongkongMacauEvidence);
cityPlans.push(...beijingShanghaiCities, ...hangzhouChengduCities, ...guangzhouShenzhenCities, ...hongkongMacauCities);
