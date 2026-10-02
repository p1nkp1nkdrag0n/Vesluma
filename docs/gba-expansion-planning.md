# 广州、深圳、香港、澳门：分区规划与来源

日期：2026-10-02。按用户追加授权，在 Pink `b6d1473db02aaa33a26144d4b4b8907305e82340` 上扩展；main 保持 `ba979334f3c07f10506b046c241d1727cde6480c`。仅本地验证，不合并、不部署。

本轮冻结广州 11 组／20 点、深圳 12 组／18 点、香港 10 组／15 点、澳门 3 组／8 点，共 **36 个旅游组团、61 个候选地标**。下表直接由最终 [city-plans.json](../src/data/map/city-plans.json) 与两份配置模块生成，并按地标 ID 与查询收据逐一核对经纬度及 OSM 对象。坐标有来源不等于入口、可达性或照片位置已经实测。

## 规划约束与三个范围

| 层面 | 本轮含义 | 不能据此推导 |
| --- | --- | --- |
| 地图源范围 | 固定下载的 OSM relation 完整 Polygon／MultiPolygon，保留海域、主域外部件及内环；来源中的区县／分区几何作为分组底稿。 | 源名称、标签、面积或某一小面不能证明正式行政归属、最新法定边界或公众通行权。 |
| 游戏旅游组团 | 把固定源范围按旅游联系合并或以明确编辑线互补划分，每组恰有一个一级代表；代表开图时整组显示。 | 编辑经纬线不是行政界、海岸线、道路或推荐路线；间接显示岛屿、海域和受管制区域不要求前往。 |
| 正式行政／管理／管辖范围 | 单独引用有日期的政府说明、条例或图件；管理职责、统计口径与特定口岸管辖安排分别说明。 | 不把 OSM 映射当行政确权，不因查询未发现新文件而断言行政归属从未变化，也不把整个横琴或跨境桥梁按旅游联系并入港澳。 |

延续六城规则：按旅游目的地与地理关系合并组团，密集景点不为增加开图条件切小块。36 个一级代表（tier 1）分别授予一个整组权益；19 个普通点（tier 2）与 6 个抵达点（tier 3）仅记录到访，最终数据的 `regionIds` 均为空。等级是游戏职责，不是景区评级、排名或实时客流。热度标签来自公开旅游线路、文化资源和客流报道的定性编辑判断，不能当成量化热力。

所有运行时几何与候选经纬度采用 WGS84，坐标表按“经度、纬度”排列。没有混用未经转换的 HK1980、澳门格网、GCJ-02 或 BD-09；坐标转换也不能改善原始精度。OSM 边界和道路来源标注 OpenStreetMap contributors／ODbL-1.0；详细底图需兼容 WGS84／Web Mercator。原六城对象、ID、版本、边界和既有权益的保留核对见[本轮验收](gba-expansion-acceptance.md)。

## 固定几何与覆盖证明

| 城市 | 固定 OSM 关系 | 来源底稿数 | 源部件／孔洞 | 源几何面积 km² | 组团／地标 |
| --- | --- | --- | --- | --- | --- |
| 广州 | [3287346](https://www.openstreetmap.org/relation/3287346) | 11 | 2／2 | 7390.4 | 11／20 |
| 深圳 | [3464353](https://www.openstreetmap.org/relation/3464353) | 10 | 24／14 | 5948.3 | 12／18 |
| 香港 | [913110](https://www.openstreetmap.org/relation/913110) | 18 | 13／22 | 2762.7 | 10／15 |
| 澳门 | [1867188](https://www.openstreetmap.org/relation/1867188) | 8 | 4／0 | 116.7 | 3／8 |

面积是源面含海域、孔洞扣除后的计算值，不是官方陆地面积，也不作海域权属面积。广州 11 个底稿为来源中的区面；深圳 10 个底稿为 9 个区名面与“深汕特别合作区”面，大鹏在来源龙岗面内；香港为 18 区底稿；澳门 8 个底稿混合 2 个 level 5 岛区面及 6 个 level 6 堂区／填海区面，不能称“8 个正式堂区”。

- [完整源边界审计](acceptance/gba-2026-10-02/boundary-audit.json)记录原始请求、下载时间、SHA256、组件和孔洞；四城六对完整源面交集均为空。该结论是二维几何检验，不是法律或通行判断。
- [广深覆盖记录](acceptance/gba-2026-10-02/guangzhou-shenzhen-validation.json)与[港澳最终覆盖记录](acceptance/gba-2026-10-02/hongkong-macau-generated-audit.json)分别记录组团并集对原始源面的缺口、越界和组间交叠全为空；点均落入指定组团。结论基于完整 Boolean 运算，不是将面积四舍五入为零或抽样顶点。
- [港澳底稿差集](acceptance/gba-2026-10-02/hongkong-macau-scaffold-audit.json)单独保留香港 18 区底稿未覆盖的 27 个源余部面，以及澳门底稿未覆盖的海域余部。香港余部随西北游戏组显示；澳门直接对完整源面作三带划分。底稿有余部与最终游戏覆盖无缺口是两件事。
- [全部 61 点边界筛查](acceptance/gba-2026-10-02/selected-points-boundary-audit.json)使用局部切平面近似筛查 300 米内邻界风险；普通点妈阁庙距本城源边界约 205.7 米，是唯一告警。该距离不证明精确法定边界或可跨界到达，不能靠 250 米圆圈推导通行路线。

## 带日期的官方背景与通行限制

已核对的坐标和范围区别：

- [香港土地署坐标转换 API 说明](https://data.gov.hk/en-data/dataset/hk-landsd-openmap-coordinates-transformation-api)明确区分 HK1980 格网与 WGS84 经纬度；[澳门土地工务局常见问题](https://geomatics.dsscu.gov.mo/zh-hans/question_and_answer.html)区分澳门格网基础图与 WGS84 服务。本轮采用 OSM 原始 WGS84，不混用本地格网坐标。
- [深圳民政行政区划代码表](https://mzj.sz.gov.cn/szmz/pc/bmxx/cyfwzy/content/post_10275241.html)发布于 2022-11-25；[《广东省深汕特别合作区条例》官方公布页](https://www.szss.gov.cn/gkmlpt/content/10/10863/mpost_10863191.html)发布于 2023-09-28，2023-11-01 施行，查阅时页面标注现行有效。条例第二条将四街道范围列于汕尾市海丰县，第四条规定深圳的管理工作。这与 OSM 深圳关系所含面、项目把这些面合成旅游组团，是三个不同层面的事实。项目界面采用中性覆盖说明，不把源关系名称或搜索不到新文件解释为行政变更结论。
- [澳门政府发言人办公室 2015-12-20 说明](https://www.gce.gov.mo/read_news_page.aspx?lang=cs&newsid=1671)记录当时行政区域图及 85 平方公里水域口径；[横琴口岸特定区域](https://www.gov.mo/zh-hans/news/267884/)与[澳门大学校区授权范围](https://bo.dsaj.gov.mo/bo/i/2009/35/aviso19_cn.asp)均有特定范围，不能把整个横琴并入澳门。这些带日期官方说明不证明每个 OSM 小面均与最新正式图件逐点一致；来源几何总面积也不能当作官方陆地统计面积。
- [香港警方边境禁区提示](https://www.police.gov.hk/ppp_en/11_useful_info/licences/remind.html)列有通行要求。地图显示或开图不表示获准进入；本轮不设必须前往禁区或口岸的代表点。
- [香港旅游发展局钟楼页面](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-clock-tower.html)注明维修至 2026 年底、围板遮挡，因此本轮不选钟楼为必打卡代表。

所有公开开放信息均为 2026-10-02 查阅结果，不保证未来某日、某时段开放。旅行前仍须按官方最新开放时间、预约及交通条件安排。

深圳界面采用中性说明：“本次游戏地图沿来源几何覆盖深圳及深汕组团；该覆盖不等同正式行政区划，也不代表通行许可。”源中的深汕子面完整包含在深圳源关系内，包含额外向南延伸面；其源计算面积约 1935.1 km²，不可当作四街道陆地面积。游戏组命名“深汕 · 山海组团”，代表选择真实查询的百安村聚落节点，照片目标是公共街巷或村落标识，不要求进入度假村私人庭院、港区或下海。2025 年[百安半岛公众音乐节资料](https://www.sz.gov.cn/szzt2010/szwtt/wthd/content/post_12349291.html)支持此地有公众文旅活动，不保证任何日期开放或每段海岸可通行。

香港的源范围含海域、离岛以及深圳湾和皇岗附近主域外小面。[2009 年发展局文件](https://www.devb.gov.hk/filemanager/article/en/upload/5233/20090408_735_paper.pdf)第 6 段说明 1997 年深圳河改道相关边界背景；[2007-05-04 深圳湾口岸说明](https://www.info.gov.hk/gia/general/200705/04/P200705040133.htm)与[2026-07-30 皇岗口岸说明](https://www.info.gov.hk/gia/general/202607/30/P2026073000180.htm)分别记录特定口岸安排，[保安局简介](https://www.sb.gov.hk/chi/hg/introduction.html)注明皇岗港方口岸区于 2026-07-31 设立并实施香港法律。这些文件不逐面认证 OSM，地图开图不替代通关手续、禁区许可证或边检规则。

澳门[2026-08-17 海域说明](https://www.marine.gov.mo/subpage.aspx?a_id=1719312219)记载 2015 年海域口径和 2024 年拱北口岸东南相关安排。[2020-03-18 横琴口岸说明](https://www.gov.mo/en/news/123674/)与[澳门大学 2013-07-19 公告](https://www.um.edu.mo/news-and-press-releases/campus-news/detail/25381/)涉及指定区域；后者所述启用事件是 2013-07-20，发布日期与事件日不可混用。[横琴合作区官方简介](https://www.hengqin-cooperation.gov.mo/en_US/shq)区分横琴与澳门。本轮保留源几何而不据这些文字拼造新边界，不纳入整个横琴、珠海口岸或整座港珠澳大桥。

## 编辑分界、海域与岛屿

- 广州合并荔湾／越秀与海珠／天河；番禺按东经 113.38°分为中西部与东部组团，增城按北纬 23.45°分为北部山林与中南部文化组团。其余来源区面按旅游代表覆盖。
- 深圳合并福田／罗湖；南山按北纬 22.525°分为华侨城与蛇口。来源龙岗面以东经 114.35°分出西部客家组，东部再按北纬 22.55°分为大鹏所城与南澳西涌两组。经纬线为互补编辑线，不能写成大鹏正式行政边界。
- 香港大屿山跨离岛区与荃湾底稿，因此合并相应部分。离岛区使用北纬 22.22／22.25／22.29／22.3°与东经 114.016／114.025／114.031°构成互补海上折线；荃湾底稿在东经 114.056°两侧以北纬 22.3477／22.34°互补分隔。原始区面和市域未移动。独立取得[大屿山岛面 R3676782](https://www.openstreetmap.org/relation/3676782)与[马湾岛面 R12922927](https://www.openstreetmap.org/relation/12922927)后，完整 Boolean 证明大屿全岛在大屿组、马湾全岛在新界西且与大屿组不交叠；此结论仅适用于核验过的岛面，不声称验证了全部海岛可达性。
- 澳门完整源面以北纬 22.173°与 22.13°分为澳门半岛、氹仔路氹、路环三条互补带。包括海水与主域外小面，直线不是海岸、堂区界或正式行政边界。所有海域、机场限制区、口岸面、孔洞周边及非公众岛屿随代表点间接显示，无需进入或逐一登岛。

## 广州：11 个组团、20 个候选点

组团表说明旅游选择依据；完整范围由最终数据中的几何决定，不能将组团简称当作行政面。

| 组团／固定 ID | 唯一一级代表 | 来源底稿与编辑范围 | 旅游依据／定性定位 | 依据 ID |
| --- | --- | --- | --- | --- |
| 西关 · 越秀老城<br>`gz-zone-oldtown` | 陈家祠<br>`gz-chen` | 荔湾区、越秀区；来源整面合并并裁于完整城市源几何内 | 西关与越秀历史城区邻接，陈家祠作为共同代表；永庆坊、沙面、镇海楼只记录到访，避免密集老城重复设开图门槛。 定性标签：经典都会。 | [gz-oldtown](https://www.gz.gov.cn/zt/2025ycbjpxhd/tjjd/content/post_10329063.html)、[gz-routes](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html) |
| 珠江 · 新中轴<br>`gz-zone-axis` | 广州塔<br>`gz-tower` | 海珠区、天河区；来源整面合并并裁于完整城市源几何内 | 广州塔与花城广场隔江相望，由跨江新中轴串联天河、海珠都市体验；省博物馆等文化点随本组统一展开。 定性标签：都市热门。 | [gz-routes](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html)、[gz-holiday](https://jtj.gz.gov.cn/jtzt/aqschyjgl/content/post_10249382.html) |
| 白云 · 城北山林<br>`gz-zone-baiyun` | 云台花园<br>`gz-baiyun` | 白云区；来源整面合并并裁于完整城市源几何内 | 以白云山三台岭的云台花园代表城北公共园林体验，全区外围山地和社区共同覆盖；不以山顶或水库中心设必到点。 定性标签：山水热门。 | [gz-holiday](https://jtj.gz.gov.cn/jtzt/aqschyjgl/content/post_10249382.html)、[gz-plan](https://www.gz.gov.cn/zwgk/ghjh/fzgh/ssw/content/post_7845329.html)、[gz-yuntai](https://lyylj.gz.gov.cn/stly/gyjq/bysfjmsq/jdjs/content/post_9925049.html) |
| 黄埔 · 海丝古港<br>`gz-zone-huangpu` | 南海神庙<br>`gz-nanhai` | 黄埔区；来源整面合并并裁于完整城市源几何内 | 南海神庙代表黄埔海丝文化，覆盖全区南部滨江至北部科技与乡村空间；军校旧址为普通到访，不为邻近文化点重复开图。 定性标签：文化代表。 | [gz-huangpu](https://mzj.gz.gov.cn/zt/2025/gzxcdmzdd/content/post_10252682.html)、[gz-plan](https://www.gz.gov.cn/zwgk/ghjh/fzgh/ssw/content/post_7845329.html) |
| 长隆 · 沙湾水乡<br>`gz-zone-panyu-west` | 长隆欢乐世界<br>`gz-chimelong` | 番禺区；东经 113.38°以西 | 长隆主题游乐与沙湾岭南文化归为番禺中西部组团；与东部狮子洋、莲花山行程分开。经线仅为产品覆盖分割，不是官方景区边界。 定性标签：游乐热门。 | [gz-panyu](https://sthjj.gz.gov.cn/qxxx/fzq/content/post_9670425.html)、[gz-panyu-events](https://www.gz.gov.cn/xw/zwlb/gqdt/fzq/content/post_10273593.html) |
| 莲花山 · 番禺东部<br>`gz-zone-panyu-east` | 莲花塔<br>`gz-lianhua` | 番禺区；东经 113.38°以东 | 东部莲花山、海鸥岛及大学城片区统一覆盖，莲花山文化地标作为代表，余荫山房只记到访；与中西部组团互补。 定性标签：滨江文化。 | [gz-panyu](https://sthjj.gz.gov.cn/qxxx/fzq/content/post_9670425.html)、[gz-panyu-events](https://www.gz.gov.cn/xw/zwlb/gqdt/fzq/content/post_10273593.html) |
| 南沙 · 珠江入海<br>`gz-zone-nansha` | 南沙天后宫<br>`gz-tianhou` | 南沙区；来源整面合并并裁于完整城市源几何内 | 天后宫代表南沙滨海文化，湿地、水乡及行政范围内岛屿统一覆盖，不将港区受控设施作为开图条件。 定性标签：滨海代表。 | [gz-routes](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html)、[gz-plan](https://www.gz.gov.cn/zwgk/ghjh/fzgh/ssw/content/post_7845329.html) |
| 花都 · 人文空港<br>`gz-zone-huadu` | 洪秀全故居<br>`gz-hongxiuquan` | 花都区；来源整面合并并裁于完整城市源几何内 | 以洪秀全故居纪念馆代表花都公共文化旅游，全区古村、空港、城区和北部山林随组覆盖；不要求进入机场禁区。 定性标签：文化代表。 | [gz-hongxiuquan](https://www.huadu.gov.cn/zjhd/lyjq/content/post_8532684.html)、[gz-hongxiuquan-access](https://www.huadu.gov.cn/gzhdwglt/gkmlpt/content/10/10635/post_10635572.html)、[gz-langtou](https://www.huadu.gov.cn/zjhd/lyjq/content/mpost_8532878.html) |
| 从化 · 流溪山水<br>`gz-zone-conghua` | 流溪河国家森林公园<br>`gz-liuxihe` | 从化区；来源整面合并并裁于完整城市源几何内 | 流溪河沿线将森林、温泉和乡村串联为从化完整山水组团；代表设在可公众游览的公园区域，水库中心不作拍照目标。 定性标签：生态代表。 | [gz-liuxihe](https://lyylj.gz.gov.cn/stly/gyjq/lxhgjslgy/index.html)、[gz-routes](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html) |
| 白水寨 · 增北山林<br>`gz-zone-zengcheng-north` | 白水寨<br>`gz-baishuizhai` | 增城区；增城区北纬 23.45°以北 | 派潭白水寨与增城城区相距较远，北部山林度假形成独立行程；取低处入口候选，不将登顶作为开图条件。纬线是产品规划线。 定性标签：山水热门。 | [gz-baishuizhai](https://sthjj.gz.gov.cn/mlzg/dmgz/mlxc/content/post_10582704.html)、[gz-plan](https://www.gz.gov.cn/zwgk/ghjh/fzgh/ssw/content/post_7845329.html) |
| 增江 · 古邑文化<br>`gz-zone-zengcheng-south` | 增城区博物馆<br>`gz-zengcheng-museum` | 增城区；增城区北纬 23.45°以南 | 增城城区、增江沿岸和南部片区作为另一完整组团，由增城区博物馆代表古邑文化；沿线文创与滨水休闲同组覆盖，不与北部登山行程捆绑。 定性标签：文化代表。 | [gz-zengcheng-museum](https://www.zc.gov.cn/zx/bmdt/qwhgdlytyj/content/post_9905710.html)、[gz-zengjiang](https://www.zc.gov.cn/gl/cylx/yzzc/content/post_9191945.html)、[gz-routes](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html) |

坐标表全部为候选 WGS84 原始查询值，保留原精度；以下“普通到访”和“抵达记录”均不解锁地图。建筑／园区中心、公交站与聚落节点的语义按配置原样标注，不移点冒充入口。

| 地标／固定 ID | 所属游戏组团 | 职责 | 经度、纬度（WGS84） | 坐标源对象 | 候选照片与到达限制 |
| --- | --- | --- | --- | --- | --- |
| 陈家祠<br>`gz-chen` | 西关 · 越秀老城 | 一级代表／开整组 | 113.2401325, 23.1298279 | [way/520935699](https://www.openstreetmap.org/way/520935699) | 陈家祠建筑正面 · 建筑中心参考，街前拍照位置待校准 |
| 广州塔<br>`gz-tower` | 珠江 · 新中轴 | 一级代表／开整组 | 113.3191477, 23.1090145 | [way/584204634](https://www.openstreetmap.org/way/584204634) | 广州塔外观 · 塔体参考，公共广场拍照位置待校准 |
| 云台花园<br>`gz-baiyun` | 白云 · 城北山林 | 一级代表／开整组 | 113.2880415, 23.1596277 | [relation/12122143](https://www.openstreetmap.org/relation/12122143) | 云台花园园林景观 · 园区代表候选，非白云山南门或地铁站 |
| 南海神庙<br>`gz-nanhai` | 黄埔 · 海丝古港 | 一级代表／开整组 | 113.4923283, 23.0836586 | [way/604389577](https://www.openstreetmap.org/way/604389577) | 南海神庙院落与庙宇 · 园区代表点，非已核实入口 |
| 长隆欢乐世界<br>`gz-chimelong` | 长隆 · 沙湾水乡 | 一级代表／开整组 | 113.3256854, 23.0025583 | [way/292110019](https://www.openstreetmap.org/way/292110019) | 长隆欢乐世界园内标识 · 园区代表候选，需按景区购票入园，入口待校准 |
| 莲花塔<br>`gz-lianhua` | 莲花山 · 番禺东部 | 一级代表／开整组 | 113.4978286, 22.9931549 | [way/980873135](https://www.openstreetmap.org/way/980873135) | 莲花塔外观 · 塔体参考，周边公众拍照位置待校准 |
| 洪秀全故居<br>`gz-hongxiuquan` | 花都 · 人文空港 | 一级代表／开整组 | 113.1672302, 23.4192526 | [way/620108305](https://www.openstreetmap.org/way/620108305) | 洪秀全故居建筑外观 · 景区代表候选，按场馆开放安排参观 |
| 流溪河国家森林公园<br>`gz-liuxihe` | 从化 · 流溪山水 | 一级代表／开整组 | 113.7796425, 23.7464098 | [node/13252778879](https://www.openstreetmap.org/node/13252778879) | 流溪河国家森林公园公交站附近标识 · 道路站点候选，园门位置待校准 |
| 白水寨<br>`gz-baishuizhai` | 白水寨 · 增北山林 | 一级代表／开整组 | 113.7565445, 23.5816693 | [node/14069809239](https://www.openstreetmap.org/node/14069809239) | 白水寨总站附近景区标识 · 公交站附近候选，不要求登顶 |
| 增城区博物馆<br>`gz-zengcheng-museum` | 增江 · 古邑文化 | 一级代表／开整组 | 113.8082925, 23.2885078 | [way/751243163](https://www.openstreetmap.org/way/751243163) | 增城区博物馆外观 · 建筑参考候选，按场馆开放安排参观 |
| 南沙天后宫<br>`gz-tianhou` | 南沙 · 珠江入海 | 一级代表／开整组 | 113.6162214, 22.7600173 | [way/583389941](https://www.openstreetmap.org/way/583389941) | 南沙天后宫建筑外观 · 园区代表候选，具体拍照位置待校准 |
| 永庆坊<br>`gz-yongqing` | 西关 · 越秀老城 | 普通到访／不开图 | 113.2329007, 23.1175027 | [way/1164896995](https://www.openstreetmap.org/way/1164896995) | 永庆坊街区标识 · 街区代表候选 |
| 沙面公园<br>`gz-shamian` | 西关 · 越秀老城 | 普通到访／不开图 | 113.2395608, 23.1083501 | [way/352610332](https://www.openstreetmap.org/way/352610332) | 沙面公园滨江景观 · 公园代表候选 |
| 镇海楼<br>`gz-zhenhai` | 西关 · 越秀老城 | 普通到访／不开图 | 113.2602757, 23.1406034 | [way/146688561](https://www.openstreetmap.org/way/146688561) | 镇海楼外观 · 建筑参考候选 |
| 广东省博物馆<br>`gz-museum` | 珠江 · 新中轴 | 普通到访／不开图 | 113.3214163, 23.1174004 | [way/240896442](https://www.openstreetmap.org/way/240896442) | 广东省博物馆外观 · 建筑参考候选，入馆安排以官方为准 |
| 沙湾古镇<br>`gz-shawan` | 长隆 · 沙湾水乡 | 普通到访／不开图 | 113.3321082, 22.904568 | [way/499814088](https://www.openstreetmap.org/way/499814088) | 沙湾古镇街巷 · 街区代表候选，非已核实入口 |
| 黄埔军校旧址纪念馆<br>`gz-academy` | 黄埔 · 海丝古港 | 普通到访／不开图 | 113.4194552, 23.0886919 | [way/422551795](https://www.openstreetmap.org/way/422551795) | 黄埔军校旧址纪念馆建筑 · 场馆代表候选，按官方开放安排参观 |
| 余荫山房<br>`gz-yuyin` | 莲花山 · 番禺东部 | 普通到访／不开图 | 113.3900627, 23.0140303 | [way/1523898842](https://www.openstreetmap.org/way/1523898842) | 余荫山房园林建筑 · 园林代表候选 |
| 广州南站<br>`gz-south-station` | 长隆 · 沙湾水乡 | 抵达记录／不开图 | 113.2644624, 22.9917961 | [way/506168739](https://www.openstreetmap.org/way/506168739) | 广州南站站房外观 · 站房参考候选，不要求进入轨道区域 |
| 广州东站<br>`gz-east-station` | 珠江 · 新中轴 | 抵达记录／不开图 | 113.3194386, 23.1525447 | [way/266991496](https://www.openstreetmap.org/way/266991496) | 广州东站站房外观 · 站前拍照位置待校准 |

## 深圳：12 个组团、18 个候选点

界面覆盖说明：本次游戏地图沿来源几何覆盖深圳及深汕组团；该覆盖不等同正式行政区划，也不代表通行许可。

组团表说明旅游选择依据；完整范围由最终数据中的几何决定，不能将组团简称当作行政面。

| 组团／固定 ID | 唯一一级代表 | 来源底稿与编辑范围 | 旅游依据／定性定位 | 依据 ID |
| --- | --- | --- | --- | --- |
| 福田 · 罗湖都会<br>`sz-zone-center` | 深圳市民中心<br>`sz-civic` | 福田区、罗湖区；来源整面合并并裁于完整城市源几何内 | 以市民中心代表福田与罗湖相连的都会文化体验；莲花山与东门只记到访，边境口岸和管制区域不设必到代表。 定性标签：都市热门。 | [sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 华侨城 · 南山北部<br>`sz-zone-oct` | 世界之窗<br>`sz-window` | 南山区；南山区北纬 22.525°以北 | 华侨城主题公园群与南头文化同属南山北部组团，以世界之窗代表；密集主题公园不各自拆块。与南部蛇口滨海行程采用纬线互补覆盖。 定性标签：主题游乐。 | [sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-scenic-list](https://wtl.sz.gov.cn/ggfw/lyl/jqjdylb/index.html) |
| 蛇口 · 深圳湾<br>`sz-zone-shekou` | 海上世界·明华轮<br>`sz-minghua` | 南山区；南山区北纬 22.525°以南 | 海上世界明华轮代表蛇口开放历史和滨海公共空间，深圳湾沿线统一展开；不要求进入邮轮口岸、港区或出入境区域。 定性标签：滨海都会。 | [sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 宝安 · 欢乐港湾<br>`sz-zone-baoan` | 欢乐港湾<br>`sz-harbour` | 宝安区；来源整面合并并裁于完整城市源几何内 | 以欢乐港湾公开滨海空间代表西部湾区体验，凤凰古村等北部文化点保留为普通到访；机场、港口作地理背景而非必到点。 定性标签：滨海热门。 | [sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 龙岗 · 客家街巷<br>`sz-zone-longgang` | 甘坑古镇<br>`sz-gankeng` | 龙岗区；东经 114.35°以西 | 甘坑客家文化街区代表龙岗西部，鹤湖新居等文化点记录到访；东部半岛另按旅游行程分组。经114.35度仅为编辑规划线，不是大鹏新区行政边界。 定性标签：文化代表。 | [sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 龙华 · 观澜版画<br>`sz-zone-longhua` | 观澜版画博物馆<br>`sz-guanlan` | 龙华区；来源整面合并并裁于完整城市源几何内 | 观澜版画公共文化空间代表龙华文化旅游，全区一体覆盖；深圳北站只记录抵达，不承担开图。 定性标签：文化代表。 | [sz-guanlan](https://www.szlhq.gov.cn/xxgk/xwzx/tzgg/content/post_11401625.html)、[sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html) |
| 光明 · 虹桥山林<br>`sz-zone-guangming` | 虹桥公园<br>`sz-hongqiao` | 光明区；来源整面合并并裁于完整城市源几何内 | 虹桥公园作为光明公共山林体验代表，不将实验设施或科研园区设为开图条件；公园候选拍照点仍需现场校准。 定性标签：生态代表。 | [sz-hongqiao](https://cgj.sz.gov.cn/xsmh/gysz/csgy/content/post_10775009.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 坪山 · 大万客家<br>`sz-zone-pingshan` | 大万世居<br>`sz-dawan` | 坪山区；来源整面合并并裁于完整城市源几何内 | 大万世居及其公共书房是可通过地铁与步行到达的客家文化目的地，以一处代表覆盖坪山城区、村落和山地。 定性标签：文化代表。 | [sz-pingshan](https://www.szpsq.gov.cn/english/Travel/Itinerary/content/post_10558565.html)、[sz-parks-plan](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) |
| 盐田 · 梅沙海岸<br>`sz-zone-yantian` | 大梅沙海滨公园<br>`sz-dameisha` | 盐田区；来源整面合并并裁于完整城市源几何内 | 以大梅沙公开海滨空间代表盐田山海组团；中英街、港口作业区和其他受控范围不设必须打卡点。 定性标签：海滨热门。 | [sz-beaches](https://pnr.sz.gov.cn/bmgkml/hyghzyc/gggs/content/post_9477497.html)、[sz-dameisha](https://www.sz.gov.cn/hdjlpt/detail?pid=2889329&via=pc) |
| 大鹏 · 所城海湾<br>`sz-zone-dapeng-north` | 大鹏所城<br>`sz-dapeng` | 龙岗区；东经 114.35°以东；龙岗区北纬 22.55°以北 | 大鹏所城与较场尾邻近，共用一次开图；使用原始龙岗区东部几何，按经114.35、纬22.55度形成旅游规划分组，绝不表示大鹏新区行政边界。 定性标签：文化海滨。 | [sz-dapeng](https://wtl.sz.gov.cn/lyfw/qyly/content/post_12150983.html)、[sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-dapeng-traffic](https://www.sz.gov.cn/hdjl/ywzsk/gajjj/wfclyw/content/post_12761059.html) |
| 南澳 · 西涌海岸<br>`sz-zone-dapeng-south` | 西涌沙滩<br>`sz-xichong` | 龙岗区；东经 114.35°以东；龙岗区北纬 22.55°以南 | 西涌公众沙滩代表半岛南部山海行程，按产品规划线与北部所城互补；不要求进入天文台科研区或穿越未开放海岸。节假日自驾预约仍应按官方安排。 定性标签：海滨度假。 | [sz-beaches](https://pnr.sz.gov.cn/bmgkml/hyghzyc/gggs/content/post_9477497.html)、[sz-dapeng](https://wtl.sz.gov.cn/lyfw/qyly/content/post_12150983.html)、[sz-dapeng-traffic](https://www.sz.gov.cn/hdjl/ywzsk/gajjj/wfclyw/content/post_12761059.html) |
| 深汕 · 山海组团<br>`sz-zone-shenshan` | 百安村<br>`sz-baian` | 深汕特别合作区；来源整面合并并裁于完整城市源几何内 | 本游戏组团沿本次OSM来源中标记为深汕特别合作区的几何，作为山海旅游体验范围；不据此判断正式行政归属。百安村公众旅游街巷代表本组，不要求进入港区作业设施。 定性标签：山海代表。 | [sz-shenshan-scope](https://hmo.sz.gov.cn/cq/szgq/content/post_143.html)、[sz-administration](https://mzj.sz.gov.cn/szmz/pc/bmxx/cyfwzy/content/post_10275241.html)、[sz-shenshan-ordinance](https://www.szss.gov.cn/gkmlpt/content/10/10863/mpost_10863191.html)、[sz-plan](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html)、[sz-baian](https://www.sz.gov.cn/szzt2010/szwtt/wthd/content/post_12349291.html) |

坐标表全部为候选 WGS84 原始查询值，保留原精度；以下“普通到访”和“抵达记录”均不解锁地图。建筑／园区中心、公交站与聚落节点的语义按配置原样标注，不移点冒充入口。

| 地标／固定 ID | 所属游戏组团 | 职责 | 经度、纬度（WGS84） | 坐标源对象 | 候选照片与到达限制 |
| --- | --- | --- | --- | --- | --- |
| 深圳市民中心<br>`sz-civic` | 福田 · 罗湖都会 | 一级代表／开整组 | 114.0545223, 22.5463725 | [relation/10837975](https://www.openstreetmap.org/relation/10837975) | 市民中心建筑外观 · 建筑参考，公共广场拍照位置待校准 |
| 世界之窗<br>`sz-window` | 华侨城 · 南山北部 | 一级代表／开整组 | 113.9686115, 22.5375058 | [way/236402460](https://www.openstreetmap.org/way/236402460) | 世界之窗园内标识 · 园区代表候选，需按景区购票入园，入口待校准 |
| 海上世界·明华轮<br>`sz-minghua` | 蛇口 · 深圳湾 | 一级代表／开整组 | 113.9119691, 22.4863889 | [way/105683429](https://www.openstreetmap.org/way/105683429) | 明华轮船体外观 · 周边广场候选，不要求登船或出境 |
| 欢乐港湾<br>`sz-harbour` | 宝安 · 欢乐港湾 | 一级代表／开整组 | 113.881011, 22.5463106 | [way/771513760](https://www.openstreetmap.org/way/771513760) | 欢乐港湾公共滨海景观 · 景区代表候选，非已核实摩天轮或入口坐标 |
| 甘坑古镇<br>`sz-gankeng` | 龙岗 · 客家街巷 | 一级代表／开整组 | 114.0995854, 22.6589693 | [way/1039077937](https://www.openstreetmap.org/way/1039077937) | 甘坑古镇公共街巷 · 街区代表候选 |
| 观澜版画博物馆<br>`sz-guanlan` | 龙华 · 观澜版画 | 一级代表／开整组 | 114.0805356, 22.7389209 | [way/1306415964](https://www.openstreetmap.org/way/1306415964) | 观澜版画博物馆外观 · 建筑参考候选，入馆按官方开放安排 |
| 虹桥公园<br>`sz-hongqiao` | 光明 · 虹桥山林 | 一级代表／开整组 | 113.9532991, 22.7482039 | [relation/17497367](https://www.openstreetmap.org/relation/17497367) | 虹桥公园红色步道 · 园区代表候选，公众步道拍照位置待校准 |
| 大万世居<br>`sz-dawan` | 坪山 · 大万客家 | 一级代表／开整组 | 114.33789, 22.6837721 | [way/784652604](https://www.openstreetmap.org/way/784652604) | 大万世居建筑外观 · 围屋建筑参考候选 |
| 大梅沙海滨公园<br>`sz-dameisha` | 盐田 · 梅沙海岸 | 一级代表／开整组 | 114.3046577, 22.598131 | [way/995114198](https://www.openstreetmap.org/way/995114198) | 大梅沙愿望塔外观 · 公园内塔体参考，不要求登塔 |
| 大鹏所城<br>`sz-dapeng` | 大鹏 · 所城海湾 | 一级代表／开整组 | 114.507692, 22.5978742 | [way/404249608](https://www.openstreetmap.org/way/404249608) | 大鹏所城公共街巷 · 古城代表候选，非已核实南门坐标 |
| 西涌沙滩<br>`sz-xichong` | 南澳 · 西涌海岸 | 一级代表／开整组 | 114.5246573, 22.4804412 | [node/6726139335](https://www.openstreetmap.org/node/6726139335) | 西涌一号沙滩公交站附近标识 · 站点候选，实际沙滩入口待校准 |
| 百安村<br>`sz-baian` | 深汕 · 山海组团 | 一级代表／开整组 | 115.1721195, 22.7878255 | [node/2065860243](https://www.openstreetmap.org/node/2065860243) | 百安村公共街巷或滨海村落标识 · 聚落代表候选，不要求进入度假村或港区 |
| 东门老街<br>`sz-dongmen` | 福田 · 罗湖都会 | 普通到访／不开图 | 114.1158592, 22.5470489 | [way/673047309](https://www.openstreetmap.org/way/673047309) | 东门老街街景 · 道路代表候选，公共人行拍照位置待校准 |
| 南头古城<br>`sz-nantou` | 华侨城 · 南山北部 | 普通到访／不开图 | 113.9156824, 22.5448527 | [way/1183877518](https://www.openstreetmap.org/way/1183877518) | 南头古城南门 · 门楼建筑参考候选 |
| 鹤湖新居<br>`sz-hehu` | 龙岗 · 客家街巷 | 普通到访／不开图 | 114.2610725, 22.730885 | [way/1088961704](https://www.openstreetmap.org/way/1088961704) | 鹤湖新居围屋外观 · 历史街区代表候选，不进入私人住所 |
| 较场尾<br>`sz-jiaochangwei` | 大鹏 · 所城海湾 | 普通到访／不开图 | 114.5061164, 22.5922831 | [node/5094066074](https://www.openstreetmap.org/node/5094066074) | 较场尾公共街巷标识 · 聚落代表候选，非精确海滩入口 |
| 深圳北站<br>`sz-north-station` | 龙华 · 观澜版画 | 抵达记录／不开图 | 114.0252465, 22.6131465 | [way/370233869](https://www.openstreetmap.org/way/370233869) | 深圳北站东广场站房外观 · 站房参考候选 |
| 福田站<br>`sz-futian-station` | 福田 · 罗湖都会 | 抵达记录／不开图 | 114.049646, 22.5422861 | [way/800275814](https://www.openstreetmap.org/way/800275814) | 福田站地面出入口标识 · 地下站房范围参考，地面位置待校准 |

## 香港：10 个组团、15 个候选点

界面覆盖说明：地图源几何含海域、离岛及若干主域外小面，本次仅作游戏显示范围，不代表正式区划或通行许可。18 区底图按旅游主题合并，未归入区底图的源几何随西北组显示；禁区、口岸和海上区域无须前往。

组团表说明旅游选择依据；完整范围由最终数据中的几何决定，不能将组团简称当作行政面。

| 组团／固定 ID | 唯一一级代表 | 来源底稿与编辑范围 | 旅游依据／定性定位 | 依据 ID |
| --- | --- | --- | --- | --- |
| 中环 · 港岛北岸<br>`hk-zone-island-north` | 皇后像广场<br>`hk-statue` | 中西區 Central and Western District、灣仔區 Wan Chai District、東區 Eastern District；来源整面合并并裁于完整城市源几何内 | 将中环、湾仔与港岛东的连贯城市海滨合为一组，以公众广场为代表；相邻历史建筑只记到访，不把每段街区拆成开图门槛。 定性标签：海港文化代表。 | [hk-neighbourhoods](https://www.discoverhongkong.com/eng/neighbourhoods.html)、[hk-central](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-statue-square.html) |
| 赤柱 · 港岛南岸<br>`hk-zone-island-south` | 赤柱美利楼<br>`hk-murray` | 南區 Southern District；来源整面合并并裁于完整城市源几何内 | 赤柱与南岸海湾形成不同于北岸城市街区的游览主题，以美利楼外观开图；保留南区源海域与离岛，不要求逐岛登陆。 定性标签：海岸文化代表。 | [hk-stanley](https://www.discoverhongkong.com/eng/place-to-go/outdoors/po-toi-island.html)、[hk-islands](https://www.discoverhongkong.com/eng/outdoors/island-hopping.html) |
| 尖沙咀 · 九龙西<br>`hk-zone-kowloon-west` | 香港太空馆<br>`hk-space` | 油尖旺區 Yau Tsim Mong District、深水埗區 Sham Shui Po District；来源整面合并并裁于完整城市源几何内 | 尖沙咀海滨至深水埗的城市文化组团，以太空馆外观为代表；星光大道只记到访。钟楼官方公告维修围封，本轮不设为必到点。 定性标签：海滨文化代表。 | [hk-tsimshatsui](https://www.discoverhongkong.com/eng/attractions/top-things-to-see-and-do-around-tsim-sha-tsui-promenade.html)、[hk-neighbourhoods](https://www.discoverhongkong.com/eng/neighbourhoods.html)、[hk-clock-works](https://www.lcsd.gov.hk/en/hkcc/TSTClockTower.html) |
| 南莲 · 九龙东<br>`hk-zone-kowloon-east` | 南莲园池<br>`hk-nanlian` | 九龍城區 Kowloon City District、黃大仙區 Wong Tai Sin District、觀塘區 Kwun Tong District；来源整面合并并裁于完整城市源几何内 | 合并九龙东与九龙城的园林、历史街区和海滨，以南莲园池的公众游览范围为代表；九龙寨城公园只记到访。 定性标签：园林文化代表。 | [hk-nanlian](https://www.lcsd.gov.hk/en/parks/nlg/)、[hk-neighbourhoods](https://www.discoverhongkong.com/eng/neighbourhoods.html) |
| 大埔 · 沙田<br>`hk-zone-northeast` | 香港铁路博物馆<br>`hk-railway` | 沙田區 Sha Tin District、大埔區 Tai Po District；来源整面合并并裁于完整城市源几何内 | 沿沙田至大埔的铁路城镇与文化景点合为一组，以铁路博物馆旧车站建筑为代表；外围山海一起显示，不增加遥远海岛门槛。 定性标签：铁路文化代表。 | [hk-railway](https://www.heritagemuseum.gov.hk/en/web/hm/museums/railway.html)、[hk-neighbourhoods](https://www.discoverhongkong.com/eng/neighbourhoods.html) |
| 荃湾 · 新界西<br>`hk-zone-newterritories-west` | 三栋屋博物馆<br>`hk-samtung` | 荃灣區 Tsuen Wan District、葵青區 Kwai Tsing District、屯門區 Tuen Mun District；荃湾扣除大屿部分，保留完整马湾（见编辑分界） | 荃湾、葵青至屯门合为西部城镇组，以三栋屋聚落建筑为代表；马湾保留于本组，荃湾底图内的大屿东北部分另随大屿组显示。 定性标签：聚落文化代表。 | [hk-samtung](https://www.icho.hk/en/web/icho/sam_tung_uk_museum.html)、[hk-neighbourhoods](https://www.discoverhongkong.com/eng/neighbourhoods.html) |
| 屏山 · 新界西北<br>`hk-zone-northwest` | 聚星楼<br>`hk-tsuising` | 元朗區 Yuen Long District、北區 North District；另合并 27 个源底稿余部面，仅作游戏显示 | 屏山与北区乡村文物合为一组，以聚星楼为公众到访候选代表。地图源中未归入 18 区底图的河道、河套与口岸附近小面仅并入本组显示，不设必到点。 定性标签：乡村文物代表。 | [hk-pingshan](https://www.amo.gov.hk/en/heritage-trails/ping-shan-heritage-trail/tsui-sing-lau-pagoda/index.html)、[hk-lungyeuk](https://www.amo.gov.hk/en/heritage-trails/lung-yeuk-tau-heritage-trail/tin-hau-temple/index.html)、[hk-border-access](https://www.police.gov.hk/ppp_en/11_useful_info/licences/cap.html)、[hk-huanggang](https://www.sb.gov.hk/chi/hg/introduction.html) |
| 西贡 · 东部山海<br>`hk-zone-saikung` | 西贡旧墟天后庙<br>`hk-saikung` | 西貢區 Sai Kung District；来源整面合并并裁于完整城市源几何内 | 以西贡旧墟天后庙代表东部渔乡与山海游览，保留源区全域海岛，不要求进入需预约步道、偏远地质海岸或乘船到访。 定性标签：渔乡文化代表。 | [hk-saikung](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-tin-hau-temple-at-sai-kung-town.html)、[hk-islands](https://www.discoverhongkong.com/eng/outdoors/island-hopping.html) |
| 昂坪 · 大屿山<br>`hk-zone-lantau` | 天坛大佛<br>`hk-buddha` | 離島區 Islands District、荃灣區 Tsuen Wan District；大屿及相邻源海域互补折线部分（见编辑分界） | 大屿山的昂坪山地、东涌与海湾游览另成一组，以天坛大佛外观为代表；与长洲、南丫等渡轮离岛分开，避免一次展开全部离岛。 定性标签：山海文化代表。 | [hk-lantau](https://www.discoverhongkong.com/eng/neighbourhoods/outlying-islands/the-best-things-to-do-on-lantau-island.html)、[hk-buddha](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-the-big-buddha.html)、[hk-islands](https://www.discoverhongkong.com/eng/outdoors/island-hopping.html) |
| 长洲 · 东部离岛<br>`hk-zone-outer-islands` | 长洲北帝庙<br>`hk-paktai` | 離島區 Islands District；大屿组的互补部分（见编辑分界） | 长洲、南丫与坪洲的渡轮聚落游览合为一组，以长洲北帝庙前公众空间为代表，不强迫逐岛打卡；船期和临时安排需按官方资讯确认。 定性标签：渡轮聚落代表。 | [hk-islands](https://www.discoverhongkong.com/eng/outdoors/island-hopping.html)、[hk-paktai](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-pak-tai-temple-at-cheung-chau.html) |

坐标表全部为候选 WGS84 原始查询值，保留原精度；以下“普通到访”和“抵达记录”均不解锁地图。建筑／园区中心、公交站与聚落节点的语义按配置原样标注，不移点冒充入口。

| 地标／固定 ID | 所属游戏组团 | 职责 | 经度、纬度（WGS84） | 坐标源对象 | 候选照片与到达限制 |
| --- | --- | --- | --- | --- | --- |
| 皇后像广场<br>`hk-statue` | 中环 · 港岛北岸 | 一级代表／开整组 | 114.1601175, 22.2817753 | [relation/6970394](https://www.openstreetmap.org/relation/6970394) | 广场景观 · 公众步行区域候选点 |
| 赤柱美利楼<br>`hk-murray` | 赤柱 · 港岛南岸 | 一级代表／开整组 | 114.2097443, 22.2179337 | [way/96843417](https://www.openstreetmap.org/way/96843417) | 美利楼外观 · 海滨公众步道候选点 |
| 香港太空馆<br>`hk-space` | 尖沙咀 · 九龙西 | 一级代表／开整组 | 114.1718689, 22.2941686 | [way/184731574](https://www.openstreetmap.org/way/184731574) | 太空馆圆顶外观 · 海滨公众区域候选点 |
| 南莲园池<br>`hk-nanlian` | 南莲 · 九龙东 | 一级代表／开整组 | 114.2048532, 22.3393548 | [way/86041251](https://www.openstreetmap.org/way/86041251) | 园林与金色亭阁 · 公众游径候选点 |
| 香港铁路博物馆<br>`hk-railway` | 大埔 · 沙田 | 一级代表／开整组 | 114.1637371, 22.4483331 | [way/111509060](https://www.openstreetmap.org/way/111509060) | 旧车站建筑外观 · 公众区域候选点 |
| 三栋屋博物馆<br>`hk-samtung` | 荃湾 · 新界西 | 一级代表／开整组 | 114.1202262, 22.3720347 | [way/29703210](https://www.openstreetmap.org/way/29703210) | 三栋屋外观 · 公众区域候选点 |
| 聚星楼<br>`hk-tsuising` | 屏山 · 新界西北 | 一级代表／开整组 | 114.0061192, 22.448806 | [way/114393168](https://www.openstreetmap.org/way/114393168) | 聚星楼外观 · 屏山文物径候选点 |
| 西贡旧墟天后庙<br>`hk-saikung` | 西贡 · 东部山海 | 一级代表／开整组 | 114.2708071, 22.3810296 | [way/404352757](https://www.openstreetmap.org/way/404352757) | 天后庙外观 · 普通道旧墟公众区域候选点 |
| 天坛大佛<br>`hk-buddha` | 昂坪 · 大屿山 | 一级代表／开整组 | 113.905012, 22.2539595 | [way/45659816](https://www.openstreetmap.org/way/45659816) | 天坛大佛外观 · 昂坪公众区域候选点 |
| 长洲北帝庙<br>`hk-paktai` | 长洲 · 东部离岛 | 一级代表／开整组 | 114.0278615, 22.2123543 | [way/204534877](https://www.openstreetmap.org/way/204534877) | 北帝庙外观 · 庙前公众空间候选点 |
| 大馆<br>`hk-taikwun` | 中环 · 港岛北岸 | 普通到访／不开图 | 114.154009, 22.2811562 | [way/591035975](https://www.openstreetmap.org/way/591035975) | 历史建筑外观 · 公众区域候选点 |
| 星光大道<br>`hk-stars` | 尖沙咀 · 九龙西 | 普通到访／不开图 | 114.1751331, 22.293425 | [way/667356811](https://www.openstreetmap.org/way/667356811) | 海滨步道景观 · 公众步道候选点 |
| 九龙寨城公园<br>`hk-walled` | 南莲 · 九龙东 | 普通到访／不开图 | 114.1902445, 22.3321294 | [relation/1650915](https://www.openstreetmap.org/relation/1650915) | 公园历史景观 · 园区中心候选点 |
| 龙跃头天后宫<br>`hk-lungyeuk` | 屏山 · 新界西北 | 普通到访／不开图 | 114.1527329, 22.4974683 | [way/146933497](https://www.openstreetmap.org/way/146933497) | 天后宫外观 · 公开文物径候选点 |
| 香港西九龙站<br>`hk-westkowloon` | 尖沙咀 · 九龙西 | 抵达记录／不开图 | 114.1662735, 22.3062124 | [node/3912037749](https://www.openstreetmap.org/node/3912037749) | 车站周边标识 · 佐敦道同名巴士站候选点 |

## 澳门：3 个组团、8 个候选点

界面覆盖说明：地图源几何含海域及若干主域外小面，仅作游戏显示范围，不代表正式区划或通行许可，也不包含整个横琴。三组采用市域互补编辑线，非堂区划分；海域、口岸与其他限制区域随组显示，无须前往。

组团表说明旅游选择依据；完整范围由最终数据中的几何决定，不能将组团简称当作行政面。

| 组团／固定 ID | 唯一一级代表 | 来源底稿与编辑范围 | 旅游依据／定性定位 | 依据 ID |
| --- | --- | --- | --- | --- |
| 历史城区 · 澳门半岛<br>`mo-zone-peninsula` | 大三巴牌坊<br>`mo-stpaul` | 完整澳门源面；北纬 22.173°以北 | 半岛密集历史景点构成连续步行游览网络，合为一组；以大三巴外观开图，妈阁庙、议事亭前地与旅游塔只记到访，不把相邻街巷切碎。 定性标签：世遗街区代表。 | [mo-heritage](https://www.macaotourism.gov.mo/en/tags/world-heritage)、[mo-stpaul](https://m.icm.gov.mo/en/StPaul)、[mo-marine](https://www.marine.gov.mo/subpage.aspx?a_id=1719312219) |
| 氹仔 · 路氹<br>`mo-zone-taipa-cotai` | 龙环葡韵<br>`mo-taipa` | 完整澳门源面；北纬 22.13°—22.173°之间 | 依据氹仔步行路线，将旧城建筑与相邻路氹游览合为一组，以龙环葡韵公众建筑景观为代表；不要求进入赌场、酒店收费设施或口岸。 定性标签：建筑文化代表。 | [mo-taipa](https://www.macaotourism.gov.mo/zh-hant/macao-full-of-fun/portuguese-ambiance-tour-at-taipa-island)、[mo-houses](https://www.macauculture.gov.mo/en/housesmuseum)、[mo-hengqin-port](https://www.gov.mo/en/news/123674/)、[mo-university](https://www.um.edu.mo/news-and-press-releases/campus-news/detail/25381/) |
| 路环 · 南部海岸<br>`mo-zone-coloane` | 路环圣方济各圣堂<br>`mo-francis` | 完整澳门源面；北纬 22.13°以南 | 路环村、海岸与郊野形成独立慢游主题，以圣方济各圣堂外观为代表；外围海域和限制区域通过代表点间接显示，不设置登陆或入园门槛。 定性标签：渔村文化代表。 | [mo-coloane](https://content.macaotourism.gov.mo/uploads/mgto_planyourtrip/WalkingTour8_TC.pdf)、[mo-marine](https://www.marine.gov.mo/subpage.aspx?a_id=1719312219)、[mo-university](https://www.um.edu.mo/news-and-press-releases/campus-news/detail/25381/) |

坐标表全部为候选 WGS84 原始查询值，保留原精度；以下“普通到访”和“抵达记录”均不解锁地图。建筑／园区中心、公交站与聚落节点的语义按配置原样标注，不移点冒充入口。

| 地标／固定 ID | 所属游戏组团 | 职责 | 经度、纬度（WGS84） | 坐标源对象 | 候选照片与到达限制 |
| --- | --- | --- | --- | --- | --- |
| 大三巴牌坊<br>`mo-stpaul` | 历史城区 · 澳门半岛 | 一级代表／开整组 | 113.5412582, 22.1975219 | [way/1001795464](https://www.openstreetmap.org/way/1001795464) | 大三巴正立面 · 前地公众区域候选点 |
| 龙环葡韵<br>`mo-taipa` | 氹仔 · 路氹 | 一级代表／开整组 | 113.5597339, 22.1539406 | [node/4664838891](https://www.openstreetmap.org/node/4664838891) | 葡式建筑群外观 · 海边马路公众区域候选点 |
| 路环圣方济各圣堂<br>`mo-francis` | 路环 · 南部海岸 | 一级代表／开整组 | 113.5514616, 22.1169176 | [way/229184934](https://www.openstreetmap.org/way/229184934) | 圣堂外观 · 马忌士前地公众区域候选点 |
| 妈阁庙<br>`mo-ama` | 历史城区 · 澳门半岛 | 普通到访／不开图 | 113.5312671, 22.1861086 | [way/192187333](https://www.openstreetmap.org/way/192187333) | 妈阁庙外观 · 公众区域候选点 |
| 议事亭前地<br>`mo-senado` | 历史城区 · 澳门半岛 | 普通到访／不开图 | 113.5399903, 22.1938271 | [way/192573684](https://www.openstreetmap.org/way/192573684) | 前地建筑景观 · 公众步行区域候选点 |
| 澳门旅游塔<br>`mo-tower` | 历史城区 · 澳门半岛 | 普通到访／不开图 | 113.5367944, 22.1798132 | [node/7914304898](https://www.openstreetmap.org/node/7914304898) | 旅游塔外观 · 地面公众区域候选点 |
| 官也街<br>`mo-cunha` | 氹仔 · 路氹 | 普通到访／不开图 | 113.5569741, 22.1535855 | [way/183607324](https://www.openstreetmap.org/way/183607324) | 官也街街景 · 公众步行街候选点 |
| 澳门外港码头<br>`mo-ferry` | 历史城区 · 澳门半岛 | 抵达记录／不开图 | 113.5574995, 22.1974091 | [node/5949397451](https://www.openstreetmap.org/node/5949397451) | 码头周边标识 · 公众巴士总站候选点 |

## 选点排除与现场验收限制

公开来源支持旅游主题和存在公众游览机会，不能证明当日开放、免费、无预约或无障碍。所有 61 点的 250 米范围、最佳拍照位置、GPS 误差与安全路径均待现场校准；本轮未做真机或实地验证，浏览器模拟不能替代。

| 对象 | 本轮处理与限制 |
| --- | --- |
| 长隆欢乐世界、世界之窗 | 当前是已查询园区代表坐标，可能需购票入园；不能许诺在公共道路或园门外 250 米内完成。入口与具体拍照位置尚未实测。 |
| 云台花园、虹桥公园、南海神庙等 | 园区、建筑或塔体参考点，不能当已核实门口。按开放时段、预约及场馆规则参观。 |
| 流溪河国家森林公园、白水寨、西涌 | 选用确有查询证据的附近公交站候选，并在照片说明标明；尚未确认站点旁景区标识或实际入口满足照片和 250 米要求。不得误称景区门楼或沙滩中心。 |
| 百安村 | 使用聚落节点；公共街巷与村落标识待实测。不要求进入百安海景度假村、港区、私人庭院或下海。公开文旅活动记录不是永久通行保证。 |
| 南莲园池、天坛大佛 | 园池中心不表示可踏入水池或亭台；大佛有高差和台阶，不宣称无障碍。应核实合法公众路径、山下观看位置及其与候选圆的关系。 |
| 妈阁庙 | 普通到访，约 205.7 米源边界距离进入筛查告警范围；不能将距离圆跨水面、跨界或跨管制区部分当可达路线。 |
| 车站与外港码头 | 仅记抵达；站房或地下站范围坐标需要核实地面公众出入口，不要求进入轨道、边检或口岸限制区拍照。 |
| 钟楼及同名／不可靠查询结果 | 尖沙咀钟楼因 2026 维修围封未作代表；塱头古村、1978 小镇等未取得可靠坐标的候选未配置。南海神庙地铁站、白云山外地同名结果、西贡同名误候选、大三巴厕所和车公庙站点结果均未冒充目标景点。 |

公众旅游点的选择不取消[大鹏半岛 2026 预约通行](https://www.sz.gov.cn/hdjl/ywzsk/gajjj/wfclyw/content/post_12761059.html)、轮渡班次、场馆休馆、风暴及海滨关闭、节假日人流管制等限制。不得要求登顶、下水、登上非公众岛屿、进入赌场、私人住所、军事设施或受控口岸来完成开图。

## 坐标收据、官方旅游依据与复核

- [广深 38 点收据](acceptance/gba-2026-10-02/guangzhou-shenzhen-point-receipts.json)：保留地标 ID、名称、城市、经纬度、源对象、查询 URL／时间、原响应 SHA256、选中结果序号与原始文件名。
- [港澳 23 点收据](acceptance/gba-2026-10-02/hongkong-macau-point-receipts.json)：从[港澳完整研究 metadata](acceptance/gba-2026-10-02/hongkong-macau-research.json)的 points 字段原样提取，保留 OSM 对象、等级、组团键、查询收据和限制；完整研究另保留旅游依据、源覆盖和岛面核验结果。
- [文档逐项核对记录](acceptance/gba-2026-10-02/planning-document-verification.json)：记录最终计划与配置哈希、61 点匹配、36 组唯一代表、普通／抵达点无开图权益，以及归档结构与原文件的语义一致性。归档为 compact JSON，仅去空白，不改原字段／数值；元数据里的原始响应文件名是研究来源标识，并非已把所有原始响应打包进仓库。

以下按配置证据 ID 列出已核公开来源。标“查阅”的日期是本轮核查日，不冒充网页发布日期；配置没有记录发布日期的来源明确写“发布日期未记录”。区域主题与定性定位由这些来源综合推论，精确游戏分界由项目编辑制定。

| 依据 ID | 官方／公开原始来源 | 记录日期 | 用途 |
| --- | --- | --- | --- |
| gz-administration | [广州年鉴：11个行政区](https://www.gz.gov.cn/zlgz/gzgk/xzqy/mindex.html) | 2026-03-18 | administrative-reference |
| gz-plan | [广州文化和旅游发展十四五规划：珠江主脉与都会、滨海、生态三类空间](https://www.gz.gov.cn/zwgk/ghjh/fzgh/ssw/content/post_7845329.html) | 2026-10-02 查阅；发布日期未记录 | geographic-planning |
| gz-routes | [广州50条精品旅游线路](https://wglj.gz.gov.cn/gkmlpt/content/9/9984/post_9984226.html) | 2024-11-20 | official-tourism-routes |
| gz-oldtown | [广州羊城八景候选：陈家祠与西关文化旅游](https://www.gz.gov.cn/zt/2025ycbjpxhd/tjjd/content/post_10329063.html) | 2026-10-02 查阅；发布日期未记录 | regional-representativeness |
| gz-holiday | [广州2025五一公交保障：白云山、广州塔、花城广场等旅游客流](https://jtj.gz.gov.cn/jtzt/aqschyjgl/content/post_10249382.html) | 2026-10-02 查阅；发布日期未记录 | qualitative-visitor-demand |
| gz-panyu | [番禺全域旅游：东部莲花山与中西部长隆、沙湾文化片区](https://sthjj.gz.gov.cn/qxxx/fzq/content/post_9670425.html) | 2026-10-02 查阅；发布日期未记录 | geographic-planning |
| gz-panyu-events | [番禺2025中国旅游日：长隆、莲花山、沙湾与余荫山房公众旅游活动](https://www.gz.gov.cn/xw/zwlb/gqdt/fzq/content/post_10273593.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| gz-huangpu | [广州市民政局：庙头社区与南海神庙、黄埔军校文化资源](https://mzj.gz.gov.cn/zt/2025/gzxcdmzdd/content/post_10252682.html) | 2025-05-08 | heritage-inventory |
| gz-langtou | [花都区官方旅游景区：塱头古村](https://www.huadu.gov.cn/zjhd/lyjq/content/mpost_8532878.html) | 2026-10-02 查阅；发布日期未记录 | official-inventory |
| gz-langtou-demand | [广州规划资源局：塱头古村保护活化与2024游客增长](https://ghzyj.gz.gov.cn/zwgk/xxgkml3/gzdt/content/post_10270193.html) | 2026-10-02 查阅；发布日期未记录 | qualitative-visitor-demand |
| gz-liuxihe | [广州林业和园林局：流溪河国家森林公园及公园牌坊](https://lyylj.gz.gov.cn/stly/gyjq/lxhgjslgy/index.html) | 2026-10-02 查阅；发布日期未记录 | official-inventory |
| gz-baishuizhai | [广州上九陂村：白水寨景区与公共交通到达](https://sthjj.gz.gov.cn/mlzg/dmgz/mlxc/content/post_10582704.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| gz-zengjiang | [增城区文旅局：1978电影小镇](https://www.zc.gov.cn/gl/cylx/yzzc/content/post_9191945.html) | 2023-09-04 | official-inventory |
| gz-yuntai | [广州林业和园林局：白云山三台岭云台花园](https://lyylj.gz.gov.cn/stly/gyjq/bysfjmsq/jdjs/content/post_9925049.html) | 2026-10-02 查阅；发布日期未记录 | official-inventory |
| gz-hongxiuquan | [花都区文旅局：洪秀全故居纪念馆](https://www.huadu.gov.cn/zjhd/lyjq/content/post_8532684.html) | 2022-08-30 | official-inventory |
| gz-hongxiuquan-access | [花都区博物馆：2026洪秀全故居纪念馆展览对公众开放](https://www.huadu.gov.cn/gzhdwglt/gkmlpt/content/10/10635/post_10635572.html) | 2026-01-09 | public-tourism-access |
| gz-zengcheng-museum | [增城区博物馆：文化资源与公众展览](https://www.zc.gov.cn/zx/bmdt/qwhgdlytyj/content/post_9905710.html) | 2026-10-02 查阅；发布日期未记录 | official-inventory |
| sz-administration | [深圳民政：行政区划代码与深汕四街道行政归属说明](https://mzj.sz.gov.cn/szmz/pc/bmxx/cyfwzy/content/post_10275241.html) | 2026-10-02 查阅；发布日期未记录 | administrative-reference |
| sz-plan | [深圳旅游业发展十四五规划：滨海、主题公园与客家文化街区](https://wtl.sz.gov.cn/gkmlpt/content/9/9500/post_9500296.html) | 2022-01-05 | geographic-planning |
| sz-scenic-list | [深圳文旅局A级旅游景区目录](https://wtl.sz.gov.cn/ggfw/lyl/jqjdylb/index.html) | 2026-01-04 | official-inventory |
| sz-parks-plan | [深圳公园城市规划：海洋、客家与广府蚝乡文化游径](https://www.sz.gov.cn/zfgb/2023/gb1272/content/post_10389162.html) | 2026-10-02 查阅；发布日期未记录 | geographic-planning |
| sz-hongqiao | [深圳城管：虹桥公园公共开放与游览说明](https://cgj.sz.gov.cn/xsmh/gysz/csgy/content/post_10775009.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| sz-guanlan | [龙华：版画基地与中国版画博物馆免费向公众开放](https://www.szlhq.gov.cn/xxgk/xwzx/tzgg/content/post_11401625.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| sz-pingshan | [坪山官方地铁旅游路线：大万世居与城市书房](https://www.szpsq.gov.cn/english/Travel/Itinerary/content/post_10558565.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| sz-beaches | [深圳规划资源局：大梅沙与西涌列为浴场型沙滩](https://pnr.sz.gov.cn/bmgkml/hyghzyc/gggs/content/post_9477497.html) | 2021-12-24 | public-tourism-access |
| sz-dameisha | [深圳城管答复：大梅沙公园地铁直达、拆围挡后的入园安排](https://www.sz.gov.cn/hdjlpt/detail?pid=2889329&via=pc) | 2024-05-06 | public-tourism-access |
| sz-dapeng | [深圳文旅局：大鹏所城、西涌等经典景区与假日公交](https://wtl.sz.gov.cn/lyfw/qyly/content/post_12150983.html) | 2026-10-02 查阅；发布日期未记录 | regional-representativeness |
| sz-dapeng-traffic | [深圳交警：2026年大鹏半岛预约通行安排](https://www.sz.gov.cn/hdjl/ywzsk/gajjj/wfclyw/content/post_12761059.html) | 2026-04-30 | travel-access-limitation |
| sz-shenshan-scope | [深汕合作区管理范围四镇介绍；不作为深圳法定市域扩界依据](https://hmo.sz.gov.cn/cq/szgq/content/post_143.html) | 2026-10-02 查阅；发布日期未记录 | management-scope-reference |
| sz-baian | [深圳文体活动：2025深汕百安半岛公众音乐节](https://www.sz.gov.cn/szzt2010/szwtt/wthd/content/post_12349291.html) | 2026-10-02 查阅；发布日期未记录 | public-tourism-access |
| sz-shenshan-ordinance | [广东省深汕特别合作区条例：2023年第二、四条分别说明四街道范围与深圳管理职责](https://www.szss.gov.cn/gkmlpt/content/10/10863/mpost_10863191.html) | 2023-09-28 | dated-administrative-management-reference |
| hk-neighbourhoods | [香港旅发局：香港社区与旅游主题](https://www.discoverhongkong.com/eng/neighbourhoods.html) | 2026-10-02（查阅） | geographic-planning |
| hk-central | [香港旅发局：皇后像广场与中环公共空间](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-statue-square.html) | 2026-10-02（查阅） | regional-representativeness |
| hk-stanley | [香港旅发局：赤柱美利楼与南岸渡轮游览](https://www.discoverhongkong.com/eng/place-to-go/outdoors/po-toi-island.html) | 2026-10-02（查阅） | regional-representativeness |
| hk-tsimshatsui | [香港旅发局：尖沙咀海滨、太空馆与星光大道](https://www.discoverhongkong.com/eng/attractions/top-things-to-see-and-do-around-tsim-sha-tsui-promenade.html) | 2026-10-02（查阅） | regional-representativeness |
| hk-nanlian | [康文署：南莲园池公众游览](https://www.lcsd.gov.hk/en/parks/nlg/) | 2026-10-02（查阅） | heritage-inventory |
| hk-railway | [香港文化博物馆：香港铁路博物馆](https://www.heritagemuseum.gov.hk/en/web/hm/museums/railway.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-samtung | [非遗办事处：三栋屋博物馆](https://www.icho.hk/en/web/icho/sam_tung_uk_museum.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-pingshan | [古迹办：屏山文物径聚星楼](https://www.amo.gov.hk/en/heritage-trails/ping-shan-heritage-trail/tsui-sing-lau-pagoda/index.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-lungyeuk | [古迹办：龙跃头文物径天后宫](https://www.amo.gov.hk/en/heritage-trails/lung-yeuk-tau-heritage-trail/tin-hau-temple/index.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-saikung | [香港旅发局：西贡旧墟天后庙](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-tin-hau-temple-at-sai-kung-town.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-lantau | [香港旅发局：大屿山游览主题](https://www.discoverhongkong.com/eng/neighbourhoods/outlying-islands/the-best-things-to-do-on-lantau-island.html) | 2026-10-02（查阅） | regional-representativeness |
| hk-buddha | [香港旅发局：天坛大佛](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-the-big-buddha.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-islands | [香港旅发局：离岛渡轮游览主题与交通提醒](https://www.discoverhongkong.com/eng/outdoors/island-hopping.html) | 2026-10-02（查阅） | geographic-planning |
| hk-paktai | [香港旅发局：长洲北帝庙](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-pak-tai-temple-at-cheung-chau.html) | 2026-10-02（查阅） | heritage-inventory |
| hk-clock-works | [康文署：尖沙咀钟楼维修围封公告，故不设为强制代表](https://www.lcsd.gov.hk/en/hkcc/TSTClockTower.html) | 2026-05-05 | access-limitation |
| hk-border-access | [香港警务处：边境禁区与禁区许可证](https://www.police.gov.hk/ppp_en/11_useful_info/licences/cap.html) | 2026-10-02（查阅） | access-limitation |
| hk-huanggang | [香港保安局：皇岗口岸港方口岸区说明](https://www.sb.gov.hk/chi/hg/introduction.html) | 2026-10-02（查阅） | boundary-scope |
| hk-grid | [香港地政总署：HK1980 与 WGS84 坐标转换](https://www.geodetic.gov.hk/en/services/tform/tform.aspx) | 2026-10-02（查阅） | coordinate-system |
| mo-heritage | [澳门旅游局：世界遗产游览主题](https://www.macaotourism.gov.mo/en/tags/world-heritage) | 2026-10-02（查阅） | heritage-inventory |
| mo-stpaul | [澳门文化局：大三巴牌坊](https://m.icm.gov.mo/en/StPaul) | 2026-10-02（查阅） | heritage-inventory |
| mo-taipa | [澳门旅游局：氹仔葡式风情步行路线](https://www.macaotourism.gov.mo/zh-hant/macao-full-of-fun/portuguese-ambiance-tour-at-taipa-island) | 2026-10-02（查阅） | geographic-planning |
| mo-houses | [澳门文化局：龙环葡韵建筑群及公众游览](https://www.macauculture.gov.mo/en/housesmuseum) | 2026-10-02（查阅） | heritage-inventory |
| mo-coloane | [澳门旅游局：路环步行路线与圣方济各圣堂](https://content.macaotourism.gov.mo/uploads/mgto_planyourtrip/WalkingTour8_TC.pdf) | 2026-10-02（查阅） | geographic-planning |
| mo-marine | [澳门海事及水务局：海域管理说明](https://www.marine.gov.mo/subpage.aspx?a_id=1719312219) | 2026-08-17 | boundary-scope |
| mo-hengqin-port | [澳门政府：横琴口岸指定区域适用澳门法律的说明](https://www.gov.mo/en/news/123674/) | 2020-03-18 | boundary-scope |
| mo-university | [澳门大学：横琴校园启用及管辖安排说明](https://www.um.edu.mo/news-and-press-releases/campus-news/detail/25381/) | 2013-07-19 | boundary-scope |
| mo-grid | [澳门地图绘制暨地籍局：澳门坐标系统说明](https://www.dscc.gov.mo/files/geographical_level_point/CHN/Macaucoord_2009_web_CS_v201702.pdf) | 2017-02 | coordinate-system |

## 缓存与试用口径

本轮将城市骨架与启动素材分开缓存。新增城市在线打开并成功读取后才保存地图；缓存最多保留最近使用的六城，地图不挤出应用启动素材。离线未缓存城市须明确显示恢复网络后重试的入口，并能返回已缓存城市。缓存空间、浏览器清理或安装失败仍可能影响离线可用性。

升级会尝试保留旧版本仍有效的同 hash 地图。首次安装不再预取所有城市骨架；实际安装清单、新增资源大小和浏览器执行结果见[本轮验收](gba-expansion-acceptance.md)。
