# Vesluma 原生图标资源

原图来自项目内的 `public/icon.svg`：玉绿色 `#218675` 背景与指南针标志。没有使用 Capacitor 默认图标，没有增加 npm 依赖。

- `native-icon.svg`／`icon-only.png`：iOS 使用的不透明方形原图，PNG 为 1024 × 1024；圆角由系统处理。
- `native-icon-foreground.svg`／`icon-foreground.png`：Android adaptive icon 的透明前景，主要图形位于 108 dp 画布的中央 66 dp 安全范围内。
- `icon-background.png`：纯玉绿色背景。
- `splash.png`：2732 × 2732 的不透明纯白启动图。
- `native-icon-dimensions.json`：生成后核实的 30 个原生图标／启动图文件、尺寸及透明通道信息。

已写入 iOS AppIcon、iOS 三张启动图、Android 五种密度的普通／圆形／adaptive foreground 图标及全部启动图。Android adaptive 背景颜色和矢量前景也已替换；系统启动背景设置为白色。Android 12 及以上版本会使用系统启动方式显示应用的小图标。

重新生成需要 Node 与可用的 `sharp` 模块。模块路径可通过参数提供，避免向项目添加依赖。本次在 Codex 桌面运行时执行过：

```powershell
node assets/generate-native-icons.mjs 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'
```

脚本会核实 iOS 无透明通道、Android 图形安全范围及全部启动图为纯白，且不修改 `public/icon.svg`。原生编译、签名和设备上实际呈现仍需独立验收。

格式依据：[Apple 图标目录](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)、[Android adaptive icon](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)、[Android 系统启动画面](https://developer.android.com/develop/ui/views/launch/splash-screen)。
