/** Tourism clusters are editorial game areas, not formal administrative divisions.
 * Municipality snapshots retain every source polygon and hole. OSM WGS84 pins
 * are traceable candidates, not surveyed photo positions or proof of access.
 */
export const evidence = [
  { id: 'hk-neighbourhoods', title: '香港旅发局：香港社区与旅游主题', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/neighbourhoods.html', kind: 'geographic-planning' },
  { id: 'hk-central', title: '香港旅发局：皇后像广场与中环公共空间', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/place-to-go/travel.guide-statue-square.html', kind: 'regional-representativeness' },
  { id: 'hk-stanley', title: '香港旅发局：赤柱美利楼与南岸渡轮游览', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/place-to-go/outdoors/po-toi-island.html', kind: 'regional-representativeness' },
  { id: 'hk-tsimshatsui', title: '香港旅发局：尖沙咀海滨、太空馆与星光大道', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/attractions/top-things-to-see-and-do-around-tsim-sha-tsui-promenade.html', kind: 'regional-representativeness' },
  { id: 'hk-nanlian', title: '康文署：南莲园池公众游览', date: '2026-10-02（查阅）', url: 'https://www.lcsd.gov.hk/en/parks/nlg/', kind: 'heritage-inventory' },
  { id: 'hk-railway', title: '香港文化博物馆：香港铁路博物馆', date: '2026-10-02（查阅）', url: 'https://www.heritagemuseum.gov.hk/en/web/hm/museums/railway.html', kind: 'heritage-inventory' },
  { id: 'hk-samtung', title: '非遗办事处：三栋屋博物馆', date: '2026-10-02（查阅）', url: 'https://www.icho.hk/en/web/icho/sam_tung_uk_museum.html', kind: 'heritage-inventory' },
  { id: 'hk-pingshan', title: '古迹办：屏山文物径聚星楼', date: '2026-10-02（查阅）', url: 'https://www.amo.gov.hk/en/heritage-trails/ping-shan-heritage-trail/tsui-sing-lau-pagoda/index.html', kind: 'heritage-inventory' },
  { id: 'hk-lungyeuk', title: '古迹办：龙跃头文物径天后宫', date: '2026-10-02（查阅）', url: 'https://www.amo.gov.hk/en/heritage-trails/lung-yeuk-tau-heritage-trail/tin-hau-temple/index.html', kind: 'heritage-inventory' },
  { id: 'hk-saikung', title: '香港旅发局：西贡旧墟天后庙', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/place-to-go/travel.guide-tin-hau-temple-at-sai-kung-town.html', kind: 'heritage-inventory' },
  { id: 'hk-lantau', title: '香港旅发局：大屿山游览主题', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/neighbourhoods/outlying-islands/the-best-things-to-do-on-lantau-island.html', kind: 'regional-representativeness' },
  { id: 'hk-buddha', title: '香港旅发局：天坛大佛', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/place-to-go/travel.guide-the-big-buddha.html', kind: 'heritage-inventory' },
  { id: 'hk-islands', title: '香港旅发局：离岛渡轮游览主题与交通提醒', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/outdoors/island-hopping.html', kind: 'geographic-planning' },
  { id: 'hk-paktai', title: '香港旅发局：长洲北帝庙', date: '2026-10-02（查阅）', url: 'https://www.discoverhongkong.com/eng/place-to-go/travel.guide-pak-tai-temple-at-cheung-chau.html', kind: 'heritage-inventory' },
  { id: 'hk-clock-works', title: '康文署：尖沙咀钟楼维修围封公告，故不设为强制代表', date: '2026-05-05', url: 'https://www.lcsd.gov.hk/en/hkcc/TSTClockTower.html', kind: 'access-limitation' },
  { id: 'hk-border-access', title: '香港警务处：边境禁区与禁区许可证', date: '2026-10-02（查阅）', url: 'https://www.police.gov.hk/ppp_en/11_useful_info/licences/cap.html', kind: 'access-limitation' },
  { id: 'hk-huanggang', title: '香港保安局：皇岗口岸港方口岸区说明', date: '2026-10-02（查阅）', url: 'https://www.sb.gov.hk/chi/hg/introduction.html', kind: 'boundary-scope' },
  { id: 'hk-grid', title: '香港地政总署：HK1980 与 WGS84 坐标转换', date: '2026-10-02（查阅）', url: 'https://www.geodetic.gov.hk/en/services/tform/tform.aspx', kind: 'coordinate-system' },
  { id: 'mo-heritage', title: '澳门旅游局：世界遗产游览主题', date: '2026-10-02（查阅）', url: 'https://www.macaotourism.gov.mo/en/tags/world-heritage', kind: 'heritage-inventory' },
  { id: 'mo-stpaul', title: '澳门文化局：大三巴牌坊', date: '2026-10-02（查阅）', url: 'https://m.icm.gov.mo/en/StPaul', kind: 'heritage-inventory' },
  { id: 'mo-taipa', title: '澳门旅游局：氹仔葡式风情步行路线', date: '2026-10-02（查阅）', url: 'https://www.macaotourism.gov.mo/zh-hant/macao-full-of-fun/portuguese-ambiance-tour-at-taipa-island', kind: 'geographic-planning' },
  { id: 'mo-houses', title: '澳门文化局：龙环葡韵建筑群及公众游览', date: '2026-10-02（查阅）', url: 'https://www.macauculture.gov.mo/en/housesmuseum', kind: 'heritage-inventory' },
  { id: 'mo-coloane', title: '澳门旅游局：路环步行路线与圣方济各圣堂', date: '2026-10-02（查阅）', url: 'https://content.macaotourism.gov.mo/uploads/mgto_planyourtrip/WalkingTour8_TC.pdf', kind: 'geographic-planning' },
  { id: 'mo-marine', title: '澳门海事及水务局：海域管理说明', date: '2026-08-17', url: 'https://www.marine.gov.mo/subpage.aspx?a_id=1719312219', kind: 'boundary-scope' },
  { id: 'mo-hengqin-port', title: '澳门政府：横琴口岸指定区域适用澳门法律的说明', date: '2020-03-18', url: 'https://www.gov.mo/en/news/123674/', kind: 'boundary-scope' },
  { id: 'mo-university', title: '澳门大学：横琴校园启用及管辖安排说明', date: '2013-07-19', url: 'https://www.um.edu.mo/news-and-press-releases/campus-news/detail/25381/', kind: 'boundary-scope' },
  { id: 'mo-grid', title: '澳门地图绘制暨地籍局：澳门坐标系统说明', date: '2017-02', url: 'https://www.dscc.gov.mo/files/geographical_level_point/CHN/Macaucoord_2009_web_CS_v201702.pdf', kind: 'coordinate-system' },
];

const point = (id, name, tier, region, lng, lat, osm, photoSubject, description) => ({
  id, name, shortName: name, tier, region, lng, lat,
  sourceUrl: `https://www.openstreetmap.org/${osm}`, photoSubject, description,
  category: tier === 3 ? 'arrival' : 'heritage',
});
const zone = (key, name, anchorLandmarkId, districts, heat, evidenceIds, rationale, extra = {}) => ({
  key, name, anchorLandmarkId, districts, heat, evidenceIds, rationale, ...extra,
});

// Complementary world-spanning masks choose from the original island district;
// they are game seams through the sea, not coastline or administrative claims.
const lantauBoxes = [
  [-180, -90, 114.016, 22.22],
  [-180, 22.22, 114.025, 22.25],
  [-180, 22.25, 114.025, 22.29],
  [-180, 22.29, 114.031, 22.3],
  [-180, 22.3, 180, 90],
];
const outerIslandBoxes = [
  [114.016, -90, 180, 22.22],
  [114.025, 22.22, 180, 22.25],
  [114.025, 22.25, 180, 22.29],
  [114.031, 22.29, 180, 22.3],
];
const islands = '離島區 Islands District';
const tsuenwan = '荃灣區 Tsuen Wan District';
// The Kap Shui Mun seam was checked against separate, real OSM polygons for
// Lantau (R3676782) and Ma Wan (R12922927): it keeps all of Lantau together and
// leaves Ma Wan intact in New Territories West. Rectangles only mask source data.
const tsuenwanLantauBoxes = [[-180, -90, 114.056, 22.3477], [114.056, -90, 180, 22.34]];
const tsuenwanMainlandBoxes = [[-180, 22.3477, 114.056, 90], [114.056, 22.34, 180, 90]];
const sourceNote = '按地图源真实区界合并为游戏组团，保留源海域及孔洞；游戏分组不代表正式行政区划，开图不代表通行许可。';
const macauBandNote = '保留澳门地图源全部几何，以北纬 22.173°、22.13° 两条互补编辑线划分三组；直线不是海岸线、堂区界或正式行政界。海域和主域外小面随相应组团显示，无须前往。';

export const cityPlans = [
  {
    id: 'hongkong', prefix: 'hk', name: '香港', enName: 'HONG KONG', subtitle: '从海港街区，到山海离岛。',
    center: [22.3, 114.16], startPosition: { lat: 22.3062124, lng: 114.1662735 }, zoom: 12,
    coverageNote: '地图源几何含海域、离岛及若干主域外小面，本次仅作游戏显示范围，不代表正式区划或通行许可。18 区底图按旅游主题合并，未归入区底图的源几何随西北组显示；禁区、口岸和海上区域无须前往。',
    remainderZoneKey: 'northwest',
    zones: [
      zone('island-north', '中环 · 港岛北岸', 'hk-statue', ['中西區 Central and Western District', '灣仔區 Wan Chai District', '東區 Eastern District'], '海港文化代表', ['hk-neighbourhoods', 'hk-central'], '将中环、湾仔与港岛东的连贯城市海滨合为一组，以公众广场为代表；相邻历史建筑只记到访，不把每段街区拆成开图门槛。', { boundaryNoteOverride: sourceNote }),
      zone('island-south', '赤柱 · 港岛南岸', 'hk-murray', ['南區 Southern District'], '海岸文化代表', ['hk-stanley', 'hk-islands'], '赤柱与南岸海湾形成不同于北岸城市街区的游览主题，以美利楼外观开图；保留南区源海域与离岛，不要求逐岛登陆。', { boundaryNoteOverride: sourceNote }),
      zone('kowloon-west', '尖沙咀 · 九龙西', 'hk-space', ['油尖旺區 Yau Tsim Mong District', '深水埗區 Sham Shui Po District'], '海滨文化代表', ['hk-tsimshatsui', 'hk-neighbourhoods', 'hk-clock-works'], '尖沙咀海滨至深水埗的城市文化组团，以太空馆外观为代表；星光大道只记到访。钟楼官方公告维修围封，本轮不设为必到点。', { boundaryNoteOverride: sourceNote }),
      zone('kowloon-east', '南莲 · 九龙东', 'hk-nanlian', ['九龍城區 Kowloon City District', '黃大仙區 Wong Tai Sin District', '觀塘區 Kwun Tong District'], '园林文化代表', ['hk-nanlian', 'hk-neighbourhoods'], '合并九龙东与九龙城的园林、历史街区和海滨，以南莲园池的公众游览范围为代表；九龙寨城公园只记到访。', { boundaryNoteOverride: sourceNote }),
      zone('northeast', '大埔 · 沙田', 'hk-railway', ['沙田區 Sha Tin District', '大埔區 Tai Po District'], '铁路文化代表', ['hk-railway', 'hk-neighbourhoods'], '沿沙田至大埔的铁路城镇与文化景点合为一组，以铁路博物馆旧车站建筑为代表；外围山海一起显示，不增加遥远海岛门槛。', { boundaryNoteOverride: sourceNote }),
      zone('newterritories-west', '荃湾 · 新界西', 'hk-samtung', [tsuenwan, '葵青區 Kwai Tsing District', '屯門區 Tuen Mun District'], '聚落文化代表', ['hk-samtung', 'hk-neighbourhoods'], '荃湾、葵青至屯门合为西部城镇组，以三栋屋聚落建筑为代表；马湾保留于本组，荃湾底图内的大屿东北部分另随大屿组显示。', { districtClipBoxes: { [tsuenwan]: tsuenwanMainlandBoxes }, boundaryNoteOverride: `${sourceNote}大屿东北与马湾之间采用海上互补折线作游戏分组，保留两座岛的完整源几何，不改变原区界。` }),
      zone('northwest', '屏山 · 新界西北', 'hk-tsuising', ['元朗區 Yuen Long District', '北區 North District'], '乡村文物代表', ['hk-pingshan', 'hk-lungyeuk', 'hk-border-access', 'hk-huanggang'], '屏山与北区乡村文物合为一组，以聚星楼为公众到访候选代表。地图源中未归入 18 区底图的河道、河套与口岸附近小面仅并入本组显示，不设必到点。', { boundaryNoteOverride: '保留元朗、北区及地图源未归入 18 区底图的 27 个余部面与孔洞，包括主域外小面。它们仅作本组游戏显示范围，不据此判定正式行政归属；官方口岸资料另有范围与管制规定。开图无需进入禁区、河套或口岸，亦不授予通行许可。' }),
      zone('saikung', '西贡 · 东部山海', 'hk-saikung', ['西貢區 Sai Kung District'], '渔乡文化代表', ['hk-saikung', 'hk-islands'], '以西贡旧墟天后庙代表东部渔乡与山海游览，保留源区全域海岛，不要求进入需预约步道、偏远地质海岸或乘船到访。', { boundaryNoteOverride: sourceNote }),
      zone('lantau', '昂坪 · 大屿山', 'hk-buddha', [islands, tsuenwan], '山海文化代表', ['hk-lantau', 'hk-buddha', 'hk-islands'], '大屿山的昂坪山地、东涌与海湾游览另成一组，以天坛大佛外观为代表；与长洲、南丫等渡轮离岛分开，避免一次展开全部离岛。', { districtClipBoxes: { [islands]: lantauBoxes, [tsuenwan]: tsuenwanLantauBoxes }, boundaryNoteOverride: '从离岛区与荃湾区原始底图用互补海上折线选取大屿组，编辑线不是正式区界或海岸线。源海域、机场及其他非公众区域随组显示；开图只需代表点，无须进入机场限制区或海上区域。' }),
      zone('outer-islands', '长洲 · 东部离岛', 'hk-paktai', [islands], '渡轮聚落代表', ['hk-islands', 'hk-paktai'], '长洲、南丫与坪洲的渡轮聚落游览合为一组，以长洲北帝庙前公众空间为代表，不强迫逐岛打卡；船期和临时安排需按官方资讯确认。', { districtClipBoxes: { [islands]: outerIslandBoxes }, boundaryNoteOverride: '从离岛区源几何取大屿组的互补部分，完整保留相应岛屿和海域。海上折线仅为游戏分组，含非公众可进入的岛屿，开图不等于登岛许可。' }),
    ],
    landmarks: [
      point('hk-statue', '皇后像广场', 1, 'island-north', 114.1601175, 22.2817753, 'relation/6970394', '广场景观 · 公众步行区域候选点', '港岛北岸代表；坐标为地图广场中心，现场活动和围封安排优先。'),
      point('hk-murray', '赤柱美利楼', 1, 'island-south', 114.2097443, 22.2179337, 'way/96843417', '美利楼外观 · 海滨公众步道候选点', '以建筑外观代表南岸文化，无须进入楼内商户消费。'),
      point('hk-space', '香港太空馆', 1, 'kowloon-west', 114.1718689, 22.2941686, 'way/184731574', '太空馆圆顶外观 · 海滨公众区域候选点', '只拍建筑外观即可；不要求购买展览或天象厅门票，地面拍照点待现场校准。'),
      point('hk-nanlian', '南莲园池', 1, 'kowloon-east', 114.2048532, 22.3393548, 'way/86041251', '园林与金色亭阁 · 公众游径候选点', '坐标为园区地图中心，应停留在开放游径；不要求走入池中亭阁，开放时间以园方为准。'),
      point('hk-railway', '香港铁路博物馆', 1, 'northeast', 114.1637371, 22.4483331, 'way/111509060', '旧车站建筑外观 · 公众区域候选点', '代表大埔与沙田铁路城镇；建筑中心不是已核准入口，休馆日及外部可拍位置待实地确认。'),
      point('hk-samtung', '三栋屋博物馆', 1, 'newterritories-west', 114.1202262, 22.3720347, 'way/29703210', '三栋屋外观 · 公众区域候选点', '代表新界西聚落文化；不要求进入展厅，开放时段与现场通行路线待校准。'),
      point('hk-tsuising', '聚星楼', 1, 'northwest', 114.0061192, 22.4488060, 'way/114393168', '聚星楼外观 · 屏山文物径候选点', '在公开文物径观赏外观即可，不要求进入塔内或前往边境禁区。'),
      point('hk-saikung', '西贡旧墟天后庙', 1, 'saikung', 114.2708071, 22.3810296, 'way/404352757', '天后庙外观 · 普通道旧墟公众区域候选点', '选取普通道旧墟实体，与调景岭等地同名庙宇区别；不要求参加宗教活动或进入内部。'),
      point('hk-buddha', '天坛大佛', 1, 'lantau', 113.9050120, 22.2539595, 'way/45659816', '天坛大佛外观 · 昂坪公众区域候选点', '坐标为佛像地图中心；不要求登台阶或进入收费展厅。250 米内地面拍照位置及无障碍路径仍待实地核准。'),
      point('hk-paktai', '长洲北帝庙', 1, 'outer-islands', 114.0278615, 22.2123543, 'way/204534877', '北帝庙外观 · 庙前公众空间候选点', '以长洲聚落代表东部离岛；不要求进入庙内，节庆围封与船期按现场和官方信息确认。'),
      point('hk-taikwun', '大馆', 2, 'island-north', 114.1540090, 22.2811562, 'way/591035975', '历史建筑外观 · 公众区域候选点', '中环文化到访点，由皇后像广场统一开图；不要求购买展览门票。'),
      point('hk-stars', '星光大道', 2, 'kowloon-west', 114.1751331, 22.2934250, 'way/667356811', '海滨步道景观 · 公众步道候选点', '记录海滨到访，由太空馆代表本组开图。'),
      point('hk-walled', '九龙寨城公园', 2, 'kowloon-east', 114.1902445, 22.3321294, 'relation/1650915', '公园历史景观 · 园区中心候选点', '九龙城文化到访点，不增加独立开图门槛。'),
      point('hk-lungyeuk', '龙跃头天后宫', 2, 'northwest', 114.1527329, 22.4974683, 'way/146933497', '天后宫外观 · 公开文物径候选点', '仅记录到访，由聚星楼统一开图；庙宇开放安排以管理方为准。'),
      point('hk-westkowloon', '香港西九龙站', 3, 'kowloon-west', 114.1662735, 22.3062124, 'node/3912037749', '车站周边标识 · 佐敦道同名巴士站候选点', '取公众地面巴士站坐标记录抵达；不要求进入站内付费区或出入境管制区，不单独开图。'),
    ],
  },
  {
    id: 'macau', prefix: 'mo', name: '澳门', enName: 'MACAU', subtitle: '沿着街巷与海风，读懂小城。',
    center: [22.163, 113.56], startPosition: { lat: 22.1974091, lng: 113.5574995 }, zoom: 13,
    coverageNote: '地图源几何含海域及若干主域外小面，仅作游戏显示范围，不代表正式区划或通行许可，也不包含整个横琴。三组采用市域互补编辑线，非堂区划分；海域、口岸与其他限制区域随组显示，无须前往。',
    zones: [
      zone('peninsula', '历史城区 · 澳门半岛', 'mo-stpaul', [], '世遗街区代表', ['mo-heritage', 'mo-stpaul', 'mo-marine'], '半岛密集历史景点构成连续步行游览网络，合为一组；以大三巴外观开图，妈阁庙、议事亭前地与旅游塔只记到访，不把相邻街巷切碎。', { source: 'municipality', clipBoxes: [[-180, 22.173, 180, 90]], boundaryNoteOverride: macauBandNote }),
      zone('taipa-cotai', '氹仔 · 路氹', 'mo-taipa', [], '建筑文化代表', ['mo-taipa', 'mo-houses', 'mo-hengqin-port', 'mo-university'], '依据氹仔步行路线，将旧城建筑与相邻路氹游览合为一组，以龙环葡韵公众建筑景观为代表；不要求进入赌场、酒店收费设施或口岸。', { source: 'municipality', clipBoxes: [[-180, 22.13, 180, 22.173]], boundaryNoteOverride: `${macauBandNote}本组含地图源部分横琴附近小面，仅按编辑线显示，不据此认定正式行政归属。` }),
      zone('coloane', '路环 · 南部海岸', 'mo-francis', [], '渔村文化代表', ['mo-coloane', 'mo-marine', 'mo-university'], '路环村、海岸与郊野形成独立慢游主题，以圣方济各圣堂外观为代表；外围海域和限制区域通过代表点间接显示，不设置登陆或入园门槛。', { source: 'municipality', clipBoxes: [[-180, -90, 180, 22.13]], boundaryNoteOverride: `${macauBandNote}编辑线也穿过地图源部分主域外小面，这只是游戏覆盖，不将该部分称作正式路环辖区。` }),
    ],
    landmarks: [
      point('mo-stpaul', '大三巴牌坊', 1, 'peninsula', 113.5412582, 22.1975219, 'way/1001795464', '大三巴正立面 · 前地公众区域候选点', '半岛历史城区代表；无需进入地下墓室或展览，具体可拍位置和人流安排待实地校准。'),
      point('mo-taipa', '龙环葡韵', 1, 'taipa-cotai', 113.5597339, 22.1539406, 'node/4664838891', '葡式建筑群外观 · 海边马路公众区域候选点', '以建筑群与花园代表氹仔、路氹游览；不要求进入博物馆展厅或消费。'),
      point('mo-francis', '路环圣方济各圣堂', 1, 'coloane', 113.5514616, 22.1169176, 'way/229184934', '圣堂外观 · 马忌士前地公众区域候选点', '以路环村的公共前地与建筑外观为代表；不要求参加宗教活动或进入圣堂内部。'),
      point('mo-ama', '妈阁庙', 2, 'peninsula', 113.5312671, 22.1861086, 'way/192187333', '妈阁庙外观 · 公众区域候选点', '半岛文化到访点，由大三巴统一开图；250 米仅为候选距离，不能证明跨水面或跨界可达。'),
      point('mo-senado', '议事亭前地', 2, 'peninsula', 113.5399903, 22.1938271, 'way/192573684', '前地建筑景观 · 公众步行区域候选点', '历史城区连续步行到访点，不另设开图门槛。'),
      point('mo-tower', '澳门旅游塔', 2, 'peninsula', 113.5367944, 22.1798132, 'node/7914304898', '旅游塔外观 · 地面公众区域候选点', '只记建筑外观到访，不要求付费登塔或参加高空项目。'),
      point('mo-cunha', '官也街', 2, 'taipa-cotai', 113.5569741, 22.1535855, 'way/183607324', '官也街街景 · 公众步行街候选点', '氹仔旧城到访点，由龙环葡韵统一开图，不要求消费。'),
      point('mo-ferry', '澳门外港码头', 3, 'peninsula', 113.5574995, 22.1974091, 'node/5949397451', '码头周边标识 · 公众巴士总站候选点', '取码头外公众巴士总站坐标记录抵达，不进入出入境管制区，不单独开图。'),
    ],
  },
];
