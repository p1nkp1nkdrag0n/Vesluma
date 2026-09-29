# 主干道简图数据来源与更新

本轮把未解锁区的道路从完全遮挡改为真实几何骨架。骨架使用 **OpenStreetMap 的原始道路节点和水域几何**，以本地 GeoJSON 快照随应用打包。C 纸感与藏宝图共用这份数据；参考图里的生成道路没有进入地图数据。

## 快照与覆盖

取数日期：**2026-09-29，UTC**。覆盖框使用 `[西经度, 南纬度, 东经度, 北纬度]`，不是解锁多边形，也不是全城地图覆盖声明。

| 城市 | WGS84 覆盖框 | 道路 way 分段 | 水域 feature | 命名河流／运河线 | JSON 大小 | gzip 大小 | 最近取数时间 |
|---|---|---:|---:|---:|---:|---:|---|
| 南京 | `[118.758,32.001,118.816,32.103]` | 922 | 49 | 49 | 636,959 B | 134,500 B | 15:14:13.621Z |
| 西安 | `[108.914,34.203,108.981,34.393]` | 1,813 | 23 | 3 | 1,263,622 B | 268,201 B | 15:18:07.879Z |

数量指 OSM 的分段要素，不代表同数量的独立道路；道路在路口、桥梁、通行标签变化处会分段。覆盖框包括目前两城所有候选地标。原始 way 或完整水域关系的部分几何可能延伸到框外，显示时必须裁剪到该框。

南京骨架中可以核对中华路、建康路、中山南路、中央路、龙蟠路；[中华路 way/61857816](https://www.openstreetmap.org/way/61857816) 保留原始节点序列。[玄武湖 relation/2138994](https://www.openstreetmap.org/relation/2138994) 保留水岸及 7 个岛屿孔洞。西安骨架含南大街、北大街、东大街、西大街、长安北路、太华南路、慈恩西路。

## 筛选与真实几何

- 道路只接受 `motorway`、`trunk`、`primary`、`secondary` 及对应的 `_link`，不把住宅道路、巷道、步行道、建筑和店铺内容打入骨架。放大不会获得这些隐藏信息。
- 保留 `bridge`、`tunnel`、`layer`、`access`、`foot`、`oneway` 和 `junction` 的原始值。桥梁、隧道和分层交叉需要在渲染时区别表达，不能把视觉交叉推断为平面可转向路口。
- 道路直接使用原始节点坐标，不平移、不吸附、不补路、不把足迹接成路线；保留原始 node IDs 以核对共同路口。
- 水域接受真实 `natural=water`／`waterway=riverbank` 多边形，外环面积至少约 6,000 平方米；保留内部孔洞。多段岸线只按相同原始节点 ID 拼接，未闭合的岸线不会被人工封口。
- 有名称的 `waterway=river/canal` 作为线状方位参照。没有明确宽度标签时只能画常规细线，不能据此伪造水岸面积。

高速／快速道路存在于骨架中，供辨认方向；显示道路不代表确认其允许步行。缺少 `foot`／`access` 标签也不能推断通行已经核实。MVP 不根据这些简图生成自动步行路线、逐路口导航或预计到达时间。

## 来源与可复现导入

来源为 [OpenStreetMap API](https://api.openstreetmap.org/) 的只读 `map.json?bbox=...` 与选定水域的 `relation/{id}/full.json`。本次 Overpass 端点不可用后，对两个有限试验框进行了顺序、小块读取；南京记录 26 次有效源响应，西安记录 75 次。密集地块超过节点上限时才继续分块。API 的格式和边界查询见 [OSM API v0.6 资料](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map)。

每份 GeoJSON 内都有来源、许可、覆盖框、下载时间、查询 URL 和原始响应 SHA-256；每个要素保留 OSM type、ID、version、timestamp。原始下载缓存放在已经忽略的 `node_modules/.cache/vesluma-osm/`，不会把包含大量非骨架内容的源包提交到项目。

```powershell
node scripts/import-map-skeleton.mjs
node scripts/import-map-skeleton.mjs nanjing
node scripts/import-map-skeleton.mjs xian --refresh
npm test -- src/data/map/map.data.test.ts
```

脚本使用 Node.js 和 curl；默认复用缓存，`--refresh` 才向源重新请求。App 运行时读取打包的数据，不请求 OSM 查询 API。正式运行或周期性更新应转为区域数据提取包、合适的 Overpass／商业数据服务，避免把编辑 API 作为应用的数据后端。

## 坐标系、许可与验收边界

骨架和位置点都采用 WGS84，经纬度顺序为 GeoJSON 的 `[longitude,latitude]`。Leaflet 用 Web Mercator 投影展示。默认 OSM 与已有 CARTO 底图与这套坐标兼容；GCJ-02／BD-09 瓦片不能作为直接替换而宣称对齐，必须先有明确且一致的转换方案。

数据版权为 **© OpenStreetMap contributors**，遵循 [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。两份筛选后的 GeoJSON 同样按 ODbL-1.0 提供；地图界面保留 [OpenStreetMap 版权链接](https://www.openstreetmap.org/copyright)，使用自定义详细底图时也要保留骨架的数据归属。

真实来源不等于已经完成本地勘察。OSM 路段分类、缺漏、施工和通行情况尚未逐段现场核实；详细在线底图与该快照可能存在更新时间差。现有地标到场半径和解锁多边形继续属于候选／示意配置，本次没有将它们冒充正式街道／河岸区划。框外属于骨架未覆盖范围；离线骨架可用也不意味着已展开的在线详细底图已缓存。

数据测试检查当前地标的覆盖、允许的主干道类别、原始节点序列与共同节点位置、闭合岸线与玄武湖岛屿、标签传递、来源和许可记录。渲染测试另需确认未解锁细节没有泄露、主题不进入已展开区、前后道路／点的位置一致以及回放按当时权益展开。
