# 北京、上海、杭州、成都：全市旅游组团扩展

日期：2026-10-02。用户在 SQLite 阶段追加授权四城扩展；本阶段基于已备份的 Pink `b1536e0`，不修改 main、不扩展到这四城之外，不部署。

## 覆盖口径

| 城市 | 已核实市域 OSM relation | 正式区县层 | 数据处理 |
|---|---:|---:|---|
| 北京 | [912940](https://www.openstreetmap.org/relation/912940) | 16 个区 | 市级 admin_level=4，正式区 admin_level=6 |
| 上海 | [913067](https://www.openstreetmap.org/relation/913067) | 16 个区 | 用市级行政关系，不能用“上海市中心”地点 node 代替市域 |
| 杭州 | [3221112](https://www.openstreetmap.org/relation/3221112) | 13 个区县市 | 10 区、2 县、1 县级市；保留西部山区和水域 |
| 成都 | [2110264](https://www.openstreetmap.org/relation/2110264) | 20 个区县市 | 12 区、3 县、5 县级市；排除另列的天府新区／高新区 level-7 重叠功能区 |

区县数量与政府资料核对：北京[区划人口](https://www.beijing.gov.cn/renwen/)，上海[行政区概览](https://english.shanghai.gov.cn/en-AdministrativeDistricts/index.html)，杭州[国土空间总体规划](https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3390/site/attach/0/a57ace3f408f42dba035f14778d10044.pdf)，成都[区划人口](https://www.chengdu.gov.cn/cdsrmzf/c169549/2026-02/27/content_e04b664b1d044641862d4a1cf9c3a987.shtml)。各市旅游资料和坐标来源另列于实际配置及下表，行政面与旅游组团不是同一含义。

完整覆盖以已固定的 OpenStreetMap/Nominatim WGS84 市域几何为准，不把它称为官方测绘成果。保留飞地、岛屿和内环，不用主城区包围框代替全市。源快照带请求 URL、下载时间与 SHA256；位于 `src/data/map/boundaries/`。

对原始区县层做独立 Boolean 审计，北京、杭州、成都的区县并集与市域完全相同，且区县之间无面积重叠。上海区县并集完整覆盖市域、无相互重叠，但有 9 个在市域外的多边形残差；生成时与**原始市域**取交集，去掉这些超出部分。没有反过来修改市域来迎合规划结果。

## 选代表的原则

延续[原两城规则](city-unlock-planning.md)：先按公开旅游片区／线路和地理关系合并景点，再每组选择唯一一级代表。二级游览点和三级抵达点保存到访、照片与重访，不授予区域权益。一级是开图职责，不等于全国知名度或官方景区等级；全市无需强行使用相同分区数量。

密集核心不逐景点设置开图门槛。北京皇城中轴、上海外滩老城、杭州西湖沿岸、成都各相邻文化街区，都由所属组团代表统一开图；偏远独立组团根据地域代表性另选入口或建筑。跨区合并及区内分割均为产品规划判断，官方旅游资料支持目的地／线路关系，不代表政府批准这些解锁边界。

内部经纬线是暂定且相互补足的规划线，未冒充道路、河岸或实际景区边界。北京纬度超过 40°N，构建程序对新城使用完整 WGS84 裁切范围，避免沿用旧两城裁切框截掉北部；原两城保持原有输出并通过独立旧版本哈希校验。

## 坐标、热度与实地限制

候选点优先采用实际查询的 OSM 建筑、入口、标识或可识别景物坐标；同名村庄、地铁站和大景区面的质心不能不经核对就当拍照点。坐标来源与景区官方介绍分别记录，不能用只有景区名称的网页声称证明精确入口位置。所有新增点保持 `verification: candidate`，250 米是待校准的产品原型半径。

新增 92 个候选点的查询时间、坐标、来源链接和保存响应哈希归档在[坐标来源凭据](acceptance/six-city-2026-10-02/point-source-receipts.json)，原区县与市域的差异检查见[边界审计](acceptance/six-city-2026-10-02/raw-boundary-audit.json)。哈希针对保存的 JSON 响应／查询凭据文件，不冒称为未保留的 HTTP 传输字节哈希。北京密云东部曾考虑的司马台候选位于固定市域外，已排除，改用市域内古北水镇；没有为保留景点挪动坐标或修改市界。

公开官方名录和线路用于定性判断代表性，未取得实时热力、统一口径全量客流或实地采样。没有伪造热度分数，也不以定性“热门”推断现场开放、允许拍照或具体票务安排。收费或需预约景区的可达性应在小范围试用前现场核对。

四城封面是项目原创几何概念图，源 SVG、生成脚本与用途说明位于 `assets/city-covers/`，不作为实景、边界或定位证据。

<!-- GENERATED_CITY_TABLES -->

## 北京：16 组团，24 个候选点

源市域几何估算约 16,498.3 km²。

| 旅游组团 | 唯一开图代表 | 约 km² | 其他已配置到访点 |
|---|---|---:|---|
| 皇城 · 中轴 | [故宫博物院](https://www.openstreetmap.org/way/638156366) | 202.3 | [天坛祈年殿](https://www.openstreetmap.org/way/43921139)（2级）、[恭王府](https://www.openstreetmap.org/way/26514871)（2级）、[北京站](https://www.openstreetmap.org/relation/7033336)（3级） |
| 三山五园 · 海淀 | [颐和园](https://www.openstreetmap.org/way/43977851) | 430.4 | [圆明园](https://www.openstreetmap.org/way/24827108)（2级） |
| 奥运 · 朝阳西部 | [国家体育场（鸟巢）](https://www.openstreetmap.org/way/152301551) | 66.6 | 暂无额外配置；不增加开图条件 |
| 798 · 朝阳东部 | [798艺术区](https://www.openstreetmap.org/way/30663427) | 397.9 | 暂无额外配置；不增加开图条件 |
| 永定河 · 京西都市 | [卢沟桥](https://www.openstreetmap.org/way/27035564) | 389.4 | [首钢园三高炉](https://www.openstreetmap.org/node/13506337463)（2级）、[北京南站](https://www.openstreetmap.org/way/43045237)（3级） |
| 潭柘 · 京西山地 | [潭柘寺](https://www.openstreetmap.org/way/537178957) | 1446.4 | 暂无额外配置；不增加开图条件 |
| 周口店 · 房山 | [周口店遗址博物馆](https://www.openstreetmap.org/way/1090515814) | 1992.5 | 暂无额外配置；不增加开图条件 |
| 运河 · 通州 | [燃灯塔](https://www.openstreetmap.org/way/675902182) | 905.1 | [北京环球度假区](https://www.openstreetmap.org/way/740165118)（2级） |
| 水上奥运 · 顺义 | [顺义奥林匹克水上公园](https://www.openstreetmap.org/way/55784725) | 1008.1 | 暂无额外配置；不增加开图条件 |
| 十三陵 · 昌平 | [明定陵](https://www.openstreetmap.org/way/42653023) | 1341.1 | [居庸关](https://www.openstreetmap.org/way/60124709)（2级） |
| 南海子 · 大兴 | [南海子麋鹿苑](https://www.openstreetmap.org/way/242473223) | 1035.2 | 暂无额外配置；不增加开图条件 |
| 慕田峪 · 怀柔 | [慕田峪长城](https://www.openstreetmap.org/way/756859585) | 2120.1 | 暂无额外配置；不增加开图条件 |
| 金海湖 · 平谷 | [金海湖](https://www.openstreetmap.org/node/7976332585) | 946.9 | 暂无额外配置；不增加开图条件 |
| 黑龙潭 · 密云山水 | [黑龙潭](https://www.openstreetmap.org/way/55248172) | 1071.4 | 暂无额外配置；不增加开图条件 |
| 古北 · 司马台 | [古北水镇](https://www.openstreetmap.org/way/441960704) | 1152 | 暂无额外配置；不增加开图条件 |
| 八达岭 · 延庆 | [八达岭长城](https://www.openstreetmap.org/way/52440889) | 1992.8 | 暂无额外配置；不增加开图条件 |

各组团取舍及公开依据：

- **皇城 · 中轴**：故宫、中轴及什刹海构成连续历史城区；天坛、前门、恭王府等只记录到访，不逐景点增设开图门槛。 [北京市文旅局：2025五一文旅市场](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202505/t20250506_4082746.html)，[北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **三山五园 · 海淀**：皇家园林与西北文教游览方向连为一组，颐和园代表；圆明园、香山为普通到访。 [北京市文旅局：2025五一文旅市场](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202505/t20250506_4082746.html)，[北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **奥运 · 朝阳西部**：奥林匹克公园是独立北城目的地，鸟巢代表朝阳西部；经线为编辑规划缝，不冒充真实道路。 [北京市文旅局：2025五一文旅市场](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202505/t20250506_4082746.html)，[北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **798 · 朝阳东部**：798与751艺术工业更新组团辨识度高，串联望京、亮马河及东部都市游览；与奥运组团分开。 [北京工业旅游2025—2027实施方案：首钢与798](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202510/t20251012_4221312.html)。
- **永定河 · 京西都市**：相邻京西城区沿永定河历史与工业遗产合并，卢沟桥代表，首钢园、园博园普通到访；不以两区制造两个门槛。 [西山永定河历史文化主题游线路](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202311/t20231102_3293985.html)，[北京工业旅游2025—2027实施方案：首钢与798](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202510/t20251012_4221312.html)。
- **潭柘 · 京西山地**：山地古寺与京西古道方向相对独立，潭柘寺代表，保留门头沟完整山地。 [西山永定河历史文化主题游线路](https://whlyj.beijing.gov.cn/zwgk/xwzx/gzdt/202311/t20231102_3293985.html)，[北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **周口店 · 房山**：以世界遗产博物馆标识房山人文与地质游线，云居寺和十渡不再额外开图。 [周口店遗址官方旅游介绍](https://s.visitbeijing.com.cn/attraction/101537)，[北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **运河 · 通州**：大运河文化组团由燃灯塔标识，城市绿心、三大文化建筑与环球度假区仅记录到访。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京市开放平台：通州文化旅游区](https://open.beijing.gov.cn/html/park/tongzhouwenhua.html)。
- **水上奥运 · 顺义**：顺义以奥运水上运动与平原近郊休闲成组，不与更远的平谷山湖生硬合并。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京旅游网：郊区代表景点](https://www.visitbeijing.com.cn/article/4HJLMIxA6VK)。
- **十三陵 · 昌平**：十三陵与关沟长城是北京西北遗产出游方向，定陵代表，居庸关普通到访。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **南海子 · 大兴**：南海子麋鹿苑标识城南生态人文，大兴南部田园与野生动物园统一覆盖。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京市文物局：南海子麋鹿苑博物馆](https://wwj.beijing.gov.cn/bjww/362771/362773/546502/index.html)。
- **慕田峪 · 怀柔**：慕田峪长城标识怀柔山地，雁栖湖、红螺寺共享组团，避免同线路连续开图。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京旅游网：郊区代表景点](https://www.visitbeijing.com.cn/article/4HJLMIxA6VK)。
- **金海湖 · 平谷**：金海湖作为东北远郊山水目的地代表，石林峡、桃花观赏普通到访。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)。
- **黑龙潭 · 密云山水**：密云体量较大，西侧水库山水与东北古北长城分程明显；黑龙潭代表水库西侧山水游览。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京旅游网：密云景点、古北与山水](https://www.visitbeijing.com.cn/article/4JNuzqX5UPO)，[北京市园林绿化局：密云旅游西线](https://yllhj.beijing.gov.cn/ztxx/bjhx/hsdt/201704/t20170417_118342.shtml)。
- **古北 · 司马台**：古北水镇与司马台长城组成密云东北独立目的地，以市界内水镇街区代表开图；长城边界附近具体拍照点留待校准，不能为含点改动市界。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京旅游网：密云景点、古北与山水](https://www.visitbeijing.com.cn/article/4JNuzqX5UPO)。
- **八达岭 · 延庆**：八达岭代表延庆长城与北部山地，龙庆峡、世园公园不额外细切。 [北京市文旅局景区名录（页面发布日期2026-07-30）](https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html)，[北京旅游网：郊区代表景点](https://www.visitbeijing.com.cn/article/4HJLMIxA6VK)。

候选 WGS84 点及来源（原始精度保留于配置，表中仅缩短显示；所有点均待实地校准）：

| 点位／级别 | 经度, 纬度 | 候选拍摄对象与来源 |
|---|---|---|
| 故宫博物院／1 | 116.391591, 39.912117 | [故宫午门建筑；所列为城门点位，公众拍照位置仍待校准](https://www.openstreetmap.org/way/638156366) |
| 颐和园／1 | 116.267982, 39.997827 | [颐和园佛香阁；所列为建筑点位，非湖心或园区中心](https://www.openstreetmap.org/way/43977851) |
| 国家体育场（鸟巢）／1 | 116.390286, 39.991404 | [国家体育场（鸟巢）可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/152301551) |
| 798艺术区／1 | 116.490484, 39.982810 | [798艺术区可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/30663427) |
| 卢沟桥／1 | 116.212882, 39.849026 | [卢沟桥可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/27035564) |
| 潭柘寺／1 | 116.024473, 39.902843 | [潭柘寺可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/537178957) |
| 周口店遗址博物馆／1 | 115.923815, 39.689074 | [周口店遗址博物馆可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/1090515814) |
| 燃灯塔／1 | 116.659848, 39.914517 | [燃灯塔可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/675902182) |
| 顺义奥林匹克水上公园／1 | 116.686604, 40.182590 | [水上公园场馆标识；现为OSM园区代表点，游客可达拍照位置待核实](https://www.openstreetmap.org/way/55784725) |
| 明定陵／1 | 116.216961, 40.294455 | [明定陵可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/42653023) |
| 南海子麋鹿苑／1 | 116.456592, 39.774634 | [麋鹿苑内展示标识；现为OSM园区代表点，游客可达拍照位置待核实](https://www.openstreetmap.org/way/242473223) |
| 慕田峪长城／1 | 116.560575, 40.434515 | [慕田峪长城建筑；OSM景区代表点，游客可达拍照位置待核实](https://www.openstreetmap.org/way/756859585) |
| 金海湖／1 | 117.294322, 40.184758 | [金海湖景区标识；公交站附近的岸上候选点，实际入口待现场核实](https://www.openstreetmap.org/node/7976332585) |
| 黑龙潭／1 | 116.780472, 40.560198 | [黑龙潭自然风景区标识或步道；OSM步道代表点，实际入口待校准](https://www.openstreetmap.org/way/55248172) |
| 八达岭长城／1 | 116.004045, 40.350939 | [八达岭长城建筑；OSM长城台阶代表点，非已核实检票入口](https://www.openstreetmap.org/way/52440889) |
| 天坛祈年殿／2 | 116.406623, 39.882247 | [天坛祈年殿可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/43921139) |
| 恭王府／2 | 116.380112, 39.935255 | [恭王府可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/26514871) |
| 圆明园／2 | 116.294797, 40.005025 | [圆明园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/24827108) |
| 首钢园三高炉／2 | 116.149612, 39.919724 | [首钢三高炉游客服务中心附近标识；OSM设施候选点](https://www.openstreetmap.org/node/13506337463) |
| 北京环球度假区／2 | 116.677786, 39.854838 | [北京环球度假区可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/740165118) |
| 居庸关／2 | 116.059205, 40.288426 | [居庸关可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/60124709) |
| 古北水镇／1 | 117.266986, 40.648912 | [古北水镇可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/441960704) |
| 北京南站／3 | 116.372832, 39.863656 | [北京南站可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/43045237) |
| 北京站／3 | 116.420977, 39.902300 | [北京站站房或公共广场标识（候选，待校准）](https://www.openstreetmap.org/relation/7033336) |

## 上海：16 组团，29 个候选点

源市域几何估算约 16,223.4 km²。上海原始市域面东延至 123.225706°E，包含外海部分；该估算不是通常的陆域面积统计。

| 旅游组团 | 唯一开图代表 | 约 km² | 其他已配置到访点 |
|---|---|---:|---|
| 外滩 · 老城 | [外滩](https://www.openstreetmap.org/relation/2142077) | 20.6 | [豫园](https://www.openstreetmap.org/way/40036584)（2级） |
| 静安 · 苏河 | [静安寺](https://www.openstreetmap.org/way/13981430) | 92.7 | [M50创意园](https://www.openstreetmap.org/way/477237906)（2级）、[上海站](https://www.openstreetmap.org/way/513785708)（3级） |
| 徐家汇 · 海派西岸 | [徐家汇天主堂](https://www.openstreetmap.org/way/155515137) | 92.5 | [武康大楼](https://www.openstreetmap.org/way/293434151)（2级） |
| 北外滩 · 杨浦滨江 | [上海邮政博物馆](https://www.openstreetmap.org/way/11629370) | 84 | [杨树浦水厂](https://www.openstreetmap.org/way/475445627)（2级） |
| 吴淞 · 宝山 | [吴淞炮台湾湿地森林公园](https://www.openstreetmap.org/node/12372818567) | 367.2 | [顾村公园](https://www.openstreetmap.org/way/266615881)（2级） |
| 七宝 · 闵行 | [七宝古镇](https://www.openstreetmap.org/way/1194727456) | 372.9 | [上海虹桥站](https://www.openstreetmap.org/node/4610023440)（3级） |
| 南翔 · 嘉定 | [古猗园](https://www.openstreetmap.org/way/183944730) | 463.1 | [嘉定孔庙](https://www.openstreetmap.org/way/496387623)（2级） |
| 朱家角 · 淀山湖 | [朱家角放生桥](https://www.openstreetmap.org/way/35160444) | 669.6 | 暂无额外配置；不增加开图条件 |
| 广富林 · 佘山 | [广富林文化遗址](https://www.openstreetmap.org/way/354726688) | 604.9 | [佘山天主堂](https://www.openstreetmap.org/way/164102861)（2级） |
| 枫泾 · 金山北部 | [枫泾古镇](https://www.openstreetmap.org/way/1329564960) | 289.8 | 暂无额外配置；不增加开图条件 |
| 金山 · 滨海 | [金山城市沙滩](https://www.openstreetmap.org/way/562487214) | 468.7 | [金山嘴渔村](https://www.openstreetmap.org/node/5491231076)（2级） |
| 上海之鱼 · 奉贤 | [奉贤博物馆](https://www.openstreetmap.org/relation/20262808) | 1197.1 | 暂无额外配置；不增加开图条件 |
| 东平 · 崇明群岛 | [东平国家森林公园](https://www.openstreetmap.org/way/85720956) | 6478.5 | 暂无额外配置；不增加开图条件 |
| 陆家嘴 · 浦东都会 | [东方明珠](https://www.openstreetmap.org/way/40778038) | 309.1 | [上海中心](https://www.openstreetmap.org/way/165792123)（2级） |
| 迪士尼 · 浦东度假 | [上海迪士尼乐园](https://www.openstreetmap.org/way/494725605) | 2393.8 | [上海野生动物园](https://www.openstreetmap.org/way/182969057)（2级） |
| 滴水湖 · 临港 | [中国航海博物馆](https://www.openstreetmap.org/node/5660470937) | 2319 | [上海天文馆](https://www.openstreetmap.org/way/610744664)（2级） |

各组团取舍及公开依据：

- **外滩 · 老城**：外滩、豫园、人民广场及历史街区紧密相连，以外滩代表，不将每个知名景点变成独立开图块。 [一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)。
- **静安 · 苏河**：相邻苏州河城区与南京西路都市文化结合，静安寺代表，M50、玉佛寺、千树普通到访。 [普陀苏州河主题线路](https://www.shanghai.gov.cn/nw17239/20260928/b7e4fcd79c274fb7b95a88f2cfe662df.html)，[一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[静安官方City Walk文化线路](https://www.shanghai.gov.cn/nw17239/20250124/131f3ab38a064f66bf1a479f0025a8ba.html)。
- **徐家汇 · 海派西岸**：海派历史街区与西南滨江串联，徐家汇源地标代表，武康大楼、上海动物园和西岸不逐项细分。 [一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)。
- **北外滩 · 杨浦滨江**：虹口至杨浦滨江的开埠和工业记忆连续，邮政博物馆代表，杨树浦水厂和鲁迅公园普通到访。 [一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[虹口官方：北外滩人文行走路线](https://www.shanghai.gov.cn/nw15343/20250317/77c055e8b1fd4d599b150f3485e77e6a.html)。
- **吴淞 · 宝山**：吴淞口滨江邮轮与湿地休闲标识宝山北翼，顾村公园为季节性到访。 [一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[上海文化旅游局4A级景区目录](https://whlyj.sh.gov.cn/4ajjq/20191008/0022-28627.html)。
- **七宝 · 闵行**：七宝古镇代表西南日常人文休闲，浦江郊野公园与虹桥片区不被迫单独解锁。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[上海文化旅游局4A级景区目录](https://whlyj.sh.gov.cn/4ajjq/20191008/0022-28627.html)。
- **南翔 · 嘉定**：古猗园代表南翔与嘉定古镇园林、汽车文化，州桥、赛车场普通到访。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[上海文化旅游局4A级景区目录](https://whlyj.sh.gov.cn/4ajjq/20191008/0022-28627.html)。
- **朱家角 · 淀山湖**：水乡古镇与淀山湖组成西部周末线路，以放生桥代表古镇，东方绿舟等无需再开图。 [上海政府：朱家角古镇](https://www.shanghai.gov.cn/fygz/20260625/09beddb4cff345ba80b159c409cad101.html)，[上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)。
- **广富林 · 佘山**：上海之根与佘山度假方向合为西南组团，广富林代表，佘山与欢乐谷仅记录到访。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[上海文化旅游局4A级景区目录](https://whlyj.sh.gov.cn/4ajjq/20191008/0022-28627.html)。
- **枫泾 · 金山北部**：北部古镇与G320文旅方向区别于远处海岸，枫泾代表，乐高乐园作为普通到访候选。 [金山北部古镇连廊与滨海旅游](https://www.shanghai.gov.cn/nw15343/20250310/0f57373d99ba4630aeaec9b45be45014.html)。
- **金山 · 滨海**：城市沙滩与金山嘴渔村形成滨海组团；与枫泾相距较远且体验不同，南北切分有旅行意义。 [金山北部古镇连廊与滨海旅游](https://www.shanghai.gov.cn/nw15343/20250310/0f57373d99ba4630aeaec9b45be45014.html)，[上海文旅局2025五一接待情况](https://www.shanghai.gov.cn/nw31406/20250506/d78c163d45fd41438c35949139bab903.html)。
- **上海之鱼 · 奉贤**：奉贤博物馆与上海之鱼是集中人文休闲目的地，海湾森林与庄行田园随组团展开。 [奉贤文旅主题游线：上海之鱼与奉贤博物馆](https://www.shanghai.gov.cn/nw17239/20250819/f596e6729e02466da061dea14d0642b3.html)。
- **东平 · 崇明群岛**：东平森林公园代表崇明生态休闲，完整保留行政归属的长兴、横沙及崇明岛碎片，不能填平岛间水域。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[上海文化旅游局4A级景区目录](https://whlyj.sh.gov.cn/4ajjq/20191008/0022-28627.html)。
- **陆家嘴 · 浦东都会**：陆家嘴地标代表浦东北西部都会，世博、世纪公园与上海中心到访共享组团。 [一江一河2025—2035规划介绍](https://www.shanghai.gov.cn/nw4411/20250311/f8336b8ad6b5456dbc55524b35a2e5d6.html)，[上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)。
- **迪士尼 · 浦东度假**：国际旅游度假区与东部亲子游览方向独立于陆家嘴，迪士尼入口标识代表，野生动物园只记录到访。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[上海文旅局2025五一接待情况](https://www.shanghai.gov.cn/nw31406/20250506/d78c163d45fd41438c35949139bab903.html)，[上海迪士尼度假区官网](https://www.shanghaidisneyresort.com/zh-cn/)。
- **滴水湖 · 临港**：东南临港距离都会较远，中国航海博物馆作为可识别地标代表湖海科普方向，天文馆、海昌仅到访。 [上海旅游高质量发展三年计划2025—2027](https://www.shanghai.gov.cn/nw12344/20250221/f94fa1b45f7444f4a5a8767c7e98a095.html)，[浦东文博会临港科普场馆组团](https://www.shanghai.gov.cn/nw15343/20251125/537f0cf91b6e437a975c5d2b0e59c66d.html)。

候选 WGS84 点及来源（原始精度保留于配置，表中仅缩短显示；所有点均待实地校准）：

| 点位／级别 | 经度, 纬度 | 候选拍摄对象与来源 |
|---|---|---|
| 外滩／1 | 121.487632, 31.235336 | [外滩可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/relation/2142077) |
| 静安寺／1 | 121.440792, 31.225215 | [静安寺可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/13981430) |
| 徐家汇天主堂／1 | 121.431550, 31.193014 | [徐家汇天主堂可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/155515137) |
| 上海邮政博物馆／1 | 121.480564, 31.246516 | [上海邮政总局大楼外观；博物馆所在历史建筑](https://www.openstreetmap.org/way/11629370) |
| 吴淞炮台湾湿地森林公园／1 | 121.501743, 31.395343 | [炮台湾公园入口标识；公交站附近的岸上候选点，实际入口待现场核实](https://www.openstreetmap.org/node/12372818567) |
| 七宝古镇／1 | 121.353306, 31.156176 | [七宝古镇可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/1194727456) |
| 古猗园／1 | 121.311859, 31.293828 | [古猗园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/183944730) |
| 朱家角放生桥／1 | 121.051449, 31.113576 | [朱家角放生桥可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/35160444) |
| 广富林文化遗址／1 | 121.194101, 31.064487 | [广富林文化遗址可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/354726688) |
| 枫泾古镇／1 | 121.013122, 30.889536 | [枫泾古镇可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/1329564960) |
| 金山城市沙滩／1 | 121.345595, 30.710901 | [金山城市沙滩可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/562487214) |
| 奉贤博物馆／1 | 121.498288, 30.936007 | [奉贤博物馆可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/relation/20262808) |
| 东平国家森林公园／1 | 121.476825, 31.680439 | [东平国家森林公园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/85720956) |
| 东方明珠／1 | 121.495260, 31.241946 | [东方明珠可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/40778038) |
| 上海迪士尼乐园／1 | 121.656283, 31.146252 | [上海迪士尼乐园城堡或园区标识；OSM园区代表点，非已核实入口](https://www.openstreetmap.org/way/494725605) |
| 中国航海博物馆／1 | 121.915453, 30.898877 | [中国航海博物馆可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/node/5660470937) |
| 豫园／2 | 121.487975, 31.228927 | [豫园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/40036584) |
| M50创意园／2 | 121.444662, 31.249872 | [M50创意园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/477237906) |
| 武康大楼／2 | 121.433729, 31.206256 | [武康大楼可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/293434151) |
| 杨树浦水厂／2 | 121.522118, 31.252556 | [杨树浦水厂可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/475445627) |
| 顾村公园／2 | 121.370507, 31.342918 | [顾村公园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/266615881) |
| 嘉定孔庙／2 | 121.248520, 31.383450 | [嘉定孔庙可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/496387623) |
| 佘山天主堂／2 | 121.187940, 31.096316 | [佘山天主堂可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/164102861) |
| 金山嘴渔村／2 | 121.371479, 30.734868 | [金山嘴渔村可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/node/5491231076) |
| 上海天文馆／2 | 121.922585, 30.915130 | [上海天文馆可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/610744664) |
| 上海野生动物园／2 | 121.716636, 31.057382 | [上海野生动物园可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/182969057) |
| 上海中心／2 | 121.501250, 31.235645 | [上海中心可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/165792123) |
| 上海站／3 | 121.451162, 31.248984 | [上海站可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/way/513785708) |
| 上海虹桥站／3 | 121.316200, 31.195978 | [上海虹桥站可识别建筑或入口标识（候选，待校准）](https://www.openstreetmap.org/node/4610023440) |

## 杭州：12 组团，17 个候选点

源市域几何估算约 16,872.4 km²。

| 旅游组团 | 唯一开图代表 | 约 km² | 其他已配置到访点 |
|---|---|---:|---|
| 西湖 · 湖山老城 | [雷峰塔](https://www.openstreetmap.org/way/229726934) | 358.9 | [灵隐寺](https://www.openstreetmap.org/node/1218588822)（2级）、[断桥](https://www.openstreetmap.org/way/1466925249)（2级）、[杭州东站](https://www.openstreetmap.org/way/533803773)（3级） |
| 西溪 · 城西湿地 | [河渚塔](https://www.openstreetmap.org/way/445674495) | 71 | 暂无额外配置；不增加开图条件 |
| 运河 · 桥西 | [拱宸桥](https://www.openstreetmap.org/way/567466767) | 98.9 | 暂无额外配置；不增加开图条件 |
| 良渚 · 径山 | [良渚博物院](https://www.openstreetmap.org/way/433830824) | 941.6 | [径山寺](https://www.openstreetmap.org/node/5237422822)（2级） |
| 塘栖 · 临平 | [广济桥](https://www.openstreetmap.org/way/240390473) | 286.1 | 暂无额外配置；不增加开图条件 |
| 金沙湖 · 钱塘 | [金沙湖大剧院](https://www.openstreetmap.org/way/1084972518) | 495.5 | 暂无额外配置；不增加开图条件 |
| 湘湖 · 钱江南岸 | [跨湖桥遗址博物馆](https://www.openstreetmap.org/way/1022141178) | 1103.1 | [杭州奥体中心体育场](https://www.openstreetmap.org/relation/8718531)（2级） |
| 富春 · 龙门 | [龙门古镇](https://www.openstreetmap.org/way/1509810480) | 1824.4 | 暂无额外配置；不增加开图条件 |
| 临安 · 天目山 | [天目山禅源寺](https://www.openstreetmap.org/node/5127564669) | 3122.2 | 暂无额外配置；不增加开图条件 |
| 桐庐 · 富春山水 | [严子陵钓台](https://www.openstreetmap.org/node/13545225877) | 1829.4 | 暂无额外配置；不增加开图条件 |
| 建德 · 梅城 | [梅城澄清门](https://www.openstreetmap.org/way/1511929275) | 2318.2 | 暂无额外配置；不增加开图条件 |
| 千岛湖 · 淳安 | [千岛湖旅游码头](https://www.openstreetmap.org/node/14188680001) | 4423.1 | 暂无额外配置；不增加开图条件 |

各组团取舍及公开依据：

- **西湖 · 湖山老城**：西湖湖山与上城老城合为连续核心游览组团，雷峰塔代表开图，灵隐、断桥保留普通到访。西湖区北部另入西溪组团；北纬30.265度仅为完整互补的产品规划线。 [UNESCO：杭州西湖文化景观](https://whc.unesco.org/en/list/1334/)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **西溪 · 城西湿地**：西溪与西湖形成不同的湿地、湖山游览主题，以河渚塔作可辨识代表，覆盖西湖区北部；规划纬线与西湖组团互补，不裁掉外围。 [杭州：西溪湿地保护条例与湿地游览](https://ehangzhou.gov.cn/2022-05/11/c_280456.htm)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **运河 · 桥西**：以拱宸桥代表运河桥西文化组团，沿河街巷与博物馆共同展开，不逐馆切块。 [杭州政协：运河共生计划与塘栖广济桥](https://www.hzzx.gov.cn/cshz/content/2025-09/30/content_9094838_0.htm)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **良渚 · 径山**：良渚文化代表余杭广阔西北片区，以博物院建筑作为候选开图地标；径山禅茶保持普通到访，遗址公园不重复设门槛。 [UNESCO：良渚古城遗址](https://whc.unesco.org/en/list/1592/)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **塘栖 · 临平**：塘栖与桥西相距较远，广济桥代表北部运河古镇及临平全域，不把古镇各条街道细分。 [杭州政协：运河共生计划与塘栖广济桥](https://www.hzzx.gov.cn/cshz/content/2025-09/30/content_9094838_0.htm)。
- **金沙湖 · 钱塘**：以金沙湖大剧院代表东部钱塘城市文化与休闲组团，覆盖区内沿江和产业新城；不把建筑评价当作游客热度。 [杭州政协：金沙湖大剧院与钱塘城市文化](https://www.hzzx.gov.cn/cshz/content/2023-03/07/content_8486240.htm)。
- **湘湖 · 钱江南岸**：钱塘江南岸按相邻休闲组团合并滨江、萧山，以跨湖桥遗址博物馆代表湘湖文化；奥体场馆只记到访，机场与外围山地一起完整覆盖。 [杭州政协：湘湖二十年与跨湖桥遗址](https://www.hzzx.gov.cn/content/2023-04/20/content_8517054.htm)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **富春 · 龙门**：富春江与龙门古镇组成富阳独立游览组团，完整保留富阳外围山地，不按每座古村细分。 [浙江：龙门古镇历史文化名镇保护规划](https://zjic.zj.gov.cn/ywdh/shjs/202510/t20251023_23760905.shtml)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **临安 · 天目山**：以天目山禅源寺代表临安山地与生态文化片区，西部县域面积大、景点分散，整体展开。 [国家林草局：临安天目山禅源寺古树群](https://www.forestry.gov.cn/c/www/dfdt/526770.jhtml)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **桐庐 · 富春山水**：严子陵钓台代表富春江山水与历史游览主题，桐庐全域一次展开，沿江各码头不另设开图区。 [杭州政协：严子陵钓台与三江两岸旅游线](https://www.hzzx.gov.cn/zxyw/content/2024-10/18/content_8801774.htm)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **建德 · 梅城**：梅城澄清门作为易辨识的人文代表，连接新安江与三江口游览，建德完整覆盖。 [浙江：建德梅城澄清门历史](https://www.zjsjw.gov.cn/yixiankuaixun/201906/t20190625_2611876.shtml)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。
- **千岛湖 · 淳安**：千岛湖中心湖区旅游码头代表淳安湖区游览，整县岛屿和山地随同展开；码头候选点按附近站点定位，需现场校准。 [杭州政协：千岛湖中心湖区与县域游览](https://www.hzzx.gov.cn/cshz/content/2023-10/19/content_8631295.htm)，[杭州：建设世界一流国际旅游目的地的十条举措](https://zfgb.hangzhou.gov.cn/10/107220263/t110220263074/530579.shtml)。

候选 WGS84 点及来源（原始精度保留于配置，表中仅缩短显示；所有点均待实地校准）：

| 点位／级别 | 经度, 纬度 | 候选拍摄对象与来源 |
|---|---|---|
| 雷峰塔／1 | 120.145013, 30.233884 | [雷峰塔主体 · 建筑中心候选点](https://www.openstreetmap.org/way/229726934) |
| 河渚塔／1 | 120.065419, 30.274637 | [河渚塔主体 · 建筑中心候选点](https://www.openstreetmap.org/way/445674495) |
| 拱宸桥／1 | 120.134947, 30.320466 | [拱宸桥桥身 · 桥面候选点](https://www.openstreetmap.org/way/567466767) |
| 良渚博物院／1 | 120.023133, 30.379662 | [良渚博物院馆舍 · 建筑中心候选点](https://www.openstreetmap.org/way/433830824) |
| 广济桥／1 | 120.178787, 30.480335 | [塘栖广济桥 · 桥面候选点](https://www.openstreetmap.org/way/240390473) |
| 金沙湖大剧院／1 | 120.315937, 30.310773 | [金沙湖大剧院外观 · 建筑中心候选点](https://www.openstreetmap.org/way/1084972518) |
| 跨湖桥遗址博物馆／1 | 120.217309, 30.144229 | [博物馆外观或标识 · 建筑中心候选点](https://www.openstreetmap.org/way/1022141178) |
| 龙门古镇／1 | 119.947412, 29.902064 | [古镇街区标识 · 地图范围中心候选点](https://www.openstreetmap.org/way/1509810480) |
| 天目山禅源寺／1 | 119.442482, 30.323518 | [禅源寺外观或标识 · 地图候选点](https://www.openstreetmap.org/node/5127564669) |
| 严子陵钓台／1 | 119.654535, 29.701559 | [钓台景区标识 · 地图候选点](https://www.openstreetmap.org/node/13545225877) |
| 梅城澄清门／1 | 119.497192, 29.539154 | [澄清门城门 · 建筑中心候选点](https://www.openstreetmap.org/way/1511929275) |
| 千岛湖旅游码头／1 | 119.010020, 29.595200 | [中心湖区旅游码头标识 · 同名公交站附近候选点](https://www.openstreetmap.org/node/14188680001) |
| 灵隐寺／2 | 120.096799, 30.242795 | [灵隐寺外部标识 · 地图候选点](https://www.openstreetmap.org/node/1218588822) |
| 断桥／2 | 120.147030, 30.260905 | [断桥桥身 · 桥面候选点](https://www.openstreetmap.org/way/1466925249) |
| 径山寺／2 | 119.761122, 30.382079 | [径山寺外观 · 地图候选点](https://www.openstreetmap.org/node/5237422822) |
| 杭州奥体中心体育场／2 | 120.225488, 30.231710 | [大莲花场馆外观 · 场馆中心候选点](https://www.openstreetmap.org/relation/8718531) |
| 杭州东站／3 | 120.208733, 30.293796 | [杭州东站站名 · 站房中心候选点](https://www.openstreetmap.org/way/533803773) |

## 成都：16 组团，22 个候选点

源市域几何估算约 14,347.1 km²。

| 旅游组团 | 唯一开图代表 | 约 km² | 其他已配置到访点 |
|---|---|---:|---|
| 草堂 · 少城 | [杜甫草堂](https://www.openstreetmap.org/way/299409723) | 174 | [宽窄巷子](https://www.openstreetmap.org/way/588905842)（2级） |
| 武侯 · 锦里 | [武侯祠](https://www.openstreetmap.org/way/277942162) | 187.3 | [锦里](https://www.openstreetmap.org/way/837197354)（2级）、[成都太古里](https://www.openstreetmap.org/node/12741356742)（2级） |
| 熊猫 · 新都 | [成都大熊猫繁育研究基地](https://www.openstreetmap.org/way/941885688) | 606.7 | [宝光寺](https://www.openstreetmap.org/relation/18795954)（2级）、[成都东站](https://www.openstreetmap.org/relation/17923601)（3级） |
| 五凤 · 东北郊 | [五凤溪古镇](https://www.openstreetmap.org/way/530939263) | 1535.9 | 暂无额外配置；不增加开图条件 |
| 郫都 · 温江 | [望丛祠](https://www.openstreetmap.org/relation/20113539) | 714.4 | 暂无额外配置；不增加开图条件 |
| 洛带 · 龙泉山 | [洛带古镇](https://www.openstreetmap.org/way/1307949708) | 556 | 暂无额外配置；不增加开图条件 |
| 黄龙溪 · 双流 | [黄龙溪古镇](https://www.openstreetmap.org/node/4584108396) | 1065.4 | 暂无额外配置；不增加开图条件 |
| 新津 · 观音寺 | [新津观音寺](https://www.openstreetmap.org/way/1054985177) | 329.3 | 暂无额外配置；不增加开图条件 |
| 都江堰 · 青城 | [都江堰伏龙观](https://www.openstreetmap.org/way/471778968) | 1209.8 | [青城山建福宫](https://www.openstreetmap.org/way/1155405197)（2级） |
| 彭州 · 龙兴 | [龙兴寺水街](https://www.openstreetmap.org/relation/19908205) | 1421.8 | 暂无额外配置；不增加开图条件 |
| 崇州 · 街子 | [街子古镇](https://www.openstreetmap.org/way/1242282392) | 1089.2 | 暂无额外配置；不增加开图条件 |
| 安仁 · 大邑东 | [安仁古镇](https://www.openstreetmap.org/way/1014072182) | 459.7 | 暂无额外配置；不增加开图条件 |
| 西岭 · 大邑西 | [西岭雪山映雪湖观景台](https://www.openstreetmap.org/node/13284720928) | 824.6 | 暂无额外配置；不增加开图条件 |
| 邛崃 · 平乐 | [平乐古镇](https://www.openstreetmap.org/node/817369712) | 1378.8 | 暂无额外配置；不增加开图条件 |
| 蒲江 · 明月村 | [蒲江明月村](https://www.openstreetmap.org/node/5412540118) | 580.4 | 暂无额外配置；不增加开图条件 |
| 简阳 · 圣德寺塔 | [圣德寺塔](https://www.openstreetmap.org/node/10777983841) | 2213.7 | 暂无额外配置；不增加开图条件 |

各组团取舍及公开依据：

- **草堂 · 少城**：草堂、宽窄巷子与青羊金牛文化点形成西北核心组团；以草堂开图，密集街巷不逐点切分。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)，[成都：金秋旅游代表景区与山地游览](https://cdtc.chengdu.gov.cn/CDSTZCJWYH/c138915/2026-09/18/content_33d122f4c0a143c99bdd9052fec98488.shtml)。
- **武侯 · 锦里**：武侯祠与锦里集中于南侧核心，和草堂少城区分；锦江春熙太古里保留普通到访，避免中心四区一次全部解锁。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)，[成都：金秋旅游代表景区与山地游览](https://cdtc.chengdu.gov.cn/CDSTZCJWYH/c138915/2026-09/18/content_33d122f4c0a143c99bdd9052fec98488.shtml)。
- **熊猫 · 新都**：熊猫基地代表东北城市游览组团，合并相邻新都，宝光寺保留普通到访。 [成都：金秋旅游代表景区与山地游览](https://cdtc.chengdu.gov.cn/CDSTZCJWYH/c138915/2026-09/18/content_33d122f4c0a143c99bdd9052fec98488.shtml)，[文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **五凤 · 东北郊**：东北郊景点相对分散，以五凤溪古镇代表青白江金堂组团，不按乡镇细切。 [成都文旅局：五凤溪景区](https://cdwglj.chengdu.gov.cn/cdwglj/c133187/2026-09/15/content_0d5653ea77924359949251ccf58da058.shtml)，[文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **郫都 · 温江**：望丛祠代表古蜀文化与西郊休闲，温江郫都相邻完整合并，不让乡村景点各自增加门槛。 [郫都区：旅游概况与望丛祠古蜀文化](https://www.pidu.gov.cn/pidu/c126018/2023-05/17/content_8701c5573c36459ebc69b1fe1487ebaf.shtml)，[文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **洛带 · 龙泉山**：洛带古镇代表东部龙泉山人文与近郊游览，完整覆盖龙泉驿。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **黄龙溪 · 双流**：以黄龙溪代表南部河谷与双流全域，功能区管理名不重复切出重叠开图区域。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **新津 · 观音寺**：以观音寺历史建筑代表新津山水文化片区，保持全区完整覆盖。 [国家文物局：新津观音寺明代壁画](https://www.ncha.gov.cn/art/2025/5/15/art_2767_195920.html)。
- **都江堰 · 青城**：都江堰与青城山具有共同的世界遗产游览主题，以伏龙观代表，青城山建福宫保留普通到访。 [UNESCO：青城山与都江堰](https://whc.unesco.org/en/list/1001/)，[成都：金秋旅游代表景区与山地游览](https://cdtc.chengdu.gov.cn/CDSTZCJWYH/c138915/2026-09/18/content_33d122f4c0a143c99bdd9052fec98488.shtml)。
- **彭州 · 龙兴**：以龙兴寺历史街区代表彭州山地与老城，区内北部山地不按谷地继续细分。 [四川政务服务网：彭州龙兴寺区域城市更新](https://cdspzs.sczwfw.gov.cn/art/2025/6/13/art_23130_288693.html)。
- **崇州 · 街子**：街子古镇代表崇州川西古镇与乡村游览，周边街区不逐点开图。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **安仁 · 大邑东**：安仁古镇与大邑东部平原人文游览集中，西岭山地距离较远，按东经103.45度作互补产品分隔。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **西岭 · 大邑西**：西岭雪山是与安仁不同的高山游览目的地，单列西部山地；经线只是规划接缝，保留大邑全部原行政几何。 [成都：金秋旅游代表景区与山地游览](https://cdtc.chengdu.gov.cn/CDSTZCJWYH/c138915/2026-09/18/content_33d122f4c0a143c99bdd9052fec98488.shtml)。
- **邛崃 · 平乐**：平乐古镇代表邛崃山水文化组团，县域外围与天台山方向一起展开。 [文旅部：成都非遗节文化与古镇体验线路](https://www.mct.gov.cn/whzx/bnsj/fwzwhycs/201907/t20190705_844868.html)。
- **蒲江 · 明月村**：以明月村农耕陶艺代表蒲江茶乡与乡村休闲组团，整县一次展开，石象湖等景区不另设门槛。 [蒲江县：生态旅游与石象湖、成佳茶乡](https://www.pujiang.gov.cn/pjxrmzf/c160240/2023-06/21/content_7659d3165c014f94b5b203b8e8f03353.shtml)，[成都：蒲江明月村农耕陶艺文旅](https://www.chengdu.gov.cn/cdsrmzf/c174131/2025-06/19/content_fb23243777fe49948f519784e7649bc4.shtml)。
- **简阳 · 圣德寺塔**：圣德寺塔代表东部简阳历史与沱江游览，完整保留简阳辖域，不并入外市景区。 [简阳：圣德寺塔与城市游览线路](https://www.scjy.gov.cn/jianyang/c136358/2025-05/17/content_b8117750a63b4742a1cecc6daed6cf31.shtml)。

候选 WGS84 点及来源（原始精度保留于配置，表中仅缩短显示；所有点均待实地校准）：

| 点位／级别 | 经度, 纬度 | 候选拍摄对象与来源 |
|---|---|---|
| 杜甫草堂／1 | 104.026229, 30.662853 | [草堂建筑或标识 · 景区中心候选点](https://www.openstreetmap.org/way/299409723) |
| 武侯祠／1 | 104.045655, 30.647841 | [武侯祠建筑 · 景区中心候选点](https://www.openstreetmap.org/way/277942162) |
| 成都大熊猫繁育研究基地／1 | 104.132931, 30.743228 | [熊猫基地园区标识 · 园区中心候选点](https://www.openstreetmap.org/way/941885688) |
| 五凤溪古镇／1 | 104.479885, 30.609509 | [古镇建筑或标识 · 街区中心候选点](https://www.openstreetmap.org/way/530939263) |
| 望丛祠／1 | 103.872188, 30.812532 | [望丛祠建筑 · 园区中心候选点](https://www.openstreetmap.org/relation/20113539) |
| 洛带古镇／1 | 104.325951, 30.639147 | [古镇街区标识 · 地图候选点](https://www.openstreetmap.org/way/1307949708) |
| 黄龙溪古镇／1 | 103.969050, 30.317637 | [古镇建筑或标识 · 地图候选点](https://www.openstreetmap.org/node/4584108396) |
| 新津观音寺／1 | 103.772777, 30.360056 | [观音寺外部建筑 · 建筑中心候选点](https://www.openstreetmap.org/way/1054985177) |
| 都江堰伏龙观／1 | 103.610494, 31.000817 | [伏龙观主体 · 建筑中心候选点](https://www.openstreetmap.org/way/471778968) |
| 龙兴寺水街／1 | 103.938074, 30.993538 | [龙兴寺水街标识 · 街区中心候选点](https://www.openstreetmap.org/relation/19908205) |
| 街子古镇／1 | 103.556616, 30.817165 | [古镇街区标识 · 范围中心候选点](https://www.openstreetmap.org/way/1242282392) |
| 安仁古镇／1 | 103.617208, 30.511481 | [古镇建筑或标识 · 范围中心候选点](https://www.openstreetmap.org/way/1014072182) |
| 西岭雪山映雪湖观景台／1 | 103.192666, 30.700982 | [映雪湖观景台标识 · 地图候选点](https://www.openstreetmap.org/node/13284720928) |
| 平乐古镇／1 | 103.334694, 30.346843 | [平乐古镇街区标识 · 镇中心候选点](https://www.openstreetmap.org/node/817369712) |
| 蒲江明月村／1 | 103.324653, 30.262946 | [明月村村落标识 · 地图村落中心候选点](https://www.openstreetmap.org/node/5412540118) |
| 圣德寺塔／1 | 104.551374, 30.384292 | [圣德寺白塔主体 · 地图候选点](https://www.openstreetmap.org/node/10777983841) |
| 宽窄巷子／2 | 104.050808, 30.666194 | [宽窄巷子街区标识 · 范围中心候选点](https://www.openstreetmap.org/way/588905842) |
| 锦里／2 | 104.047390, 30.648709 | [锦里街区标识 · 地图候选点](https://www.openstreetmap.org/way/837197354) |
| 成都太古里／2 | 104.079521, 30.656285 | [太古里街区标识 · 地图候选点](https://www.openstreetmap.org/node/12741356742) |
| 宝光寺／2 | 104.158020, 30.834448 | [宝光寺外观 · 建筑范围中心候选点](https://www.openstreetmap.org/relation/18795954) |
| 青城山建福宫／2 | 103.570762, 30.900337 | [建福宫建筑 · 建筑中心候选点](https://www.openstreetmap.org/way/1155405197) |
| 成都东站／3 | 104.138894, 30.631182 | [成都东站站名 · 站房中心候选点](https://www.openstreetmap.org/relation/17923601) |

## 构建与验收门禁

`npm run maps:boundaries` 默认复用已提交源边界；`npm run maps:plan` 离线构建组团。生成器和独立测试分别验证市域与分区并集双向差集为空、两两区交集为空、每区恰一个一级代表、所有点位在所声明区域。六城逻辑、SQLite 和浏览器结果见 [四城验收报告](four-city-expansion-acceptance.md)。
