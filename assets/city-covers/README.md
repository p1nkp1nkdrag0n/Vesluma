# 城市原创概念封面

北京、上海、杭州、成都、广州、深圳、香港、澳门的封面由项目任务中直接编写的 SVG 几何图形构成。没有使用外部照片、素材库、图标库、图像生成服务或地图截图，也没有下载字体。源图可随本项目使用、修改和分发。

每张源图为 1200 × 800：北京使用宫阙屋顶意象，上海使用滨江几何天际线，杭州使用湖山桥塔，成都使用竹林亭阁山影。它们是城市视觉意象，**不是实景照片、精确建筑描摹、拍照点或地理边界依据**。图内均标注“原创概念图 · 非实景”。应用的演示到访仍标记为 `demo`，不会因使用封面而被视为真实到访。

对应 PNG 存放在 `public/images/<cityId>.png`，便于现有照片演示与本机数据库接口读取。SVG 是可编辑源文件，PNG 是本机 Playwright 无头浏览器渲染的结果。

在已安装依赖和 Chromium 的环境中重新生成：

```powershell
node assets/city-covers/render.mjs
```

也可用已安装的浏览器，避免另行下载：

```powershell
$env:VESLUMA_QA_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node assets/city-covers/render.mjs
```

新增广深港澳分别采用塔身格网、湾畔几何楼群、海港帆船和历史立面意象；这些造型不表示实际建筑比例、边界或通行关系。

脚本只读取此目录的 SVG、向 `public/images` 输出同名 PNG；渲染时阻止所有网络请求。可传城市 ID 仅更新指定资源，例如 `node assets/city-covers/render.mjs guangzhou shenzhen hongkong macau`。文字使用本机系统字体，不同操作系统可能有细微排版差别。PNG 使用 Windows 已安装的 Chromium 渲染，并进行视觉检查；新增四城时不重生成旧封面。
