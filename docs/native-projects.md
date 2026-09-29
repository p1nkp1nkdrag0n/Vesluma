# Vesluma 原生手机工程

2026-09-29 已在 Windows 上生成并同步两个 Capacitor 工程：

- Android：`android/`，应用 ID `com.vesluma.app`，最低 API 24，编译及目标 API 36。
- iOS：`ios/App/App.xcodeproj`，应用 ID `com.vesluma.app`，最低 iOS 15；通过 Swift Package Manager 关联 Capacitor、Camera 与 Geolocation。

这一步生成了手机应用源码和本地网页资源，没有生成 APK／IPA，尚未完成原生编译、签名、模拟器或实机验收。网页预览与原生工程使用同一份 React 应用；打包后通过 Capacitor 使用设备相机、相册与定位。

## 更新手机工程

在项目根目录执行：

```powershell
npm install
npm run native:sync
```

`native:sync` 先构建网页，再把最新资源及插件配置同步到已有的 Android 与 iOS 工程。修改网页、城市数据或状态模型之后，需要重新执行这一步。两个平台已生成，无须重复执行 `cap add`。

## Android

安装 Android Studio 2025.2.1 或更新版本，以及 Android SDK Platform 36；Android Studio 提供需要的 JDK。然后执行 `npm run android`，在 Android Studio 中同步 Gradle，并选择模拟器或连接的手机运行。签名与发布配置后续在 Android Studio 中设置。

`android/app/src/main/AndroidManifest.xml` 已声明粗略与精确定位。GPS 与相机硬件为可选，允许设备没有硬件时继续浏览已有地图与记录。当前 Camera 插件调用系统相机／照片选择器，且未启用 `saveToGallery`，依照官方说明无需声明 `CAMERA` 或外部存储权限。位置精度不足时，应用中的到场校验仍会拒绝提交。

## iOS

原生编译需要 macOS、Xcode 26 或更新版本及 Xcode Command Line Tools。把工程与源文件带到 Mac，执行 `npm install`、`npm run native:sync`、`npm run ios`。Xcode 会解析 Swift Package Manager 依赖；选择开发团队与模拟器或手机后运行。

`ios/App/App/Info.plist` 已包含中文相机、相册读取／写入、使用期间定位的用途说明。Geolocation 插件官方要求同时包含 `NSLocationAlwaysAndWhenInUseUsageDescription`；采用与前台用途一致的描述。本工程没有添加后台定位模式，不能据此声称已具备锁屏或后台持续记录能力。

## 当前验证与后续实机检查

已确认两个 `cap add` 命令成功、插件注册与网页资源生成成功，并检查权限文件结构。当前安装版本为 Capacitor 8.5.2、Camera 8.2.4、Geolocation 8.2.2。

下一次实机验收应检查：定位拒绝／粗略定位、相机取消、相册选择、手机进出前台后的采样缺口、地图与 WGS84 点对齐、本地照片重启恢复、弱网瓦片反馈，以及导出／恢复备份。正式定位生命周期仍按产品文档另行设计。

依据：[Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)、[添加平台](https://capacitorjs.com/docs/cli/commands/add)、[Geolocation 权限](https://capacitorjs.com/docs/apis/geolocation)、[Camera 权限](https://capacitorjs.com/docs/apis/camera)。
