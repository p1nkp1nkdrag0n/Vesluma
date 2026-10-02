# 本机数据库同步协议与验收范围

本轮仅本机验证，基线 Pink `f6c1e8a`。实现 Node 24 内置 SQLite，服务固定绑定 `127.0.0.1`，默认端口 4317，并提供生产静态页面。不创建账号、凭据或公网服务。

## 范围

- 同步单位是一个本机测试资料空间（`local-a` / `local-b`），包含原应用的演示身份与小队记录。它是同一用户资料的验证命名空间，不是正式认证；知道空间名的本机程序可以访问它。
- 首次启用前说明并由用户在界面开启；浏览器一经绑定空间不能直接改绑，以免把一个空间的资料无意传入另一个空间。停用不删除本地或数据库数据。
- 同步 profiles、trips、visits、unlocks 以及到访关联照片。当前定位、连续轨迹 points、选中城市、主题、目标、当前身份、活动行程入口均留在当前浏览器。
- 照片仅传往同源回环地址数据库，不发往任何云服务。旧数据先留存一次元数据迁移副本；IndexedDB 原照片和原 localStorage 记录不清除。
- 公开开关仍是原本机演示功能，不新增跨资料空间公开 API。同步投影把 public 置为 false，接收合并保留当前浏览器已有的公开开关，新恢复照片默认私密。

## 共享模块接口（src/lib/syncProtocol.ts）

```ts
interface SyncSnapshot { version: 1; profiles: Profile[]; trips: Trip[]; visits: Visit[]; unlocks: Unlock[] }
emptySyncSnapshot(): SyncSnapshot
projectSyncState(state: AppState): SyncSnapshot
validateSyncSnapshot(input: unknown): SyncSnapshot // bounded allowlist validation; throws on invalid input
mergeSyncSnapshots(left: SyncSnapshot, right: SyncSnapshot): SyncSnapshot
applySyncSnapshot(state: AppState, snapshot: SyncSnapshot): AppState
syncPhotoId(visitId: string): string // stable wire photo key: sync-${visitId}
snapshotFingerprint(snapshot: SyncSnapshot): string // canonical serialization, not a secret
```

到访 ID 去重，同 ID 不可变证据冲突明确拒绝；真正重访新 ID 保留。缺失不表示删除。开图按 userId+regionId 唯一，合并后按到访时间与 ID 确定首次及权益来源，保留 legacy 规则。已结束旅行不能被旧快照复活；未结束的暂停状态与活动入口按设备保留。普通地标不可产生区域权益。新记录校验到访时的位置证据，不以服务器当前时间拒绝合法离线记录。

投影照片 ID 使用 visit ID 派生，避免导入备份重命名 IndexedDB 照片 ID 后制造伪冲突。当前浏览器已有到访合并时保留其原 photoId；新到访使用 wire ID 下载照片并写入 IndexedDB。

## HTTP API

所有 API 加 `Cache-Control: no-store`。校验精确回环 Host 和 Origin；无通配 CORS，不拦截远程资源。同步／照片 API 要求 `X-Vesluma-Space: local-a|local-b` 与 `X-Vesluma-Local: 1`，这些不是秘密凭据。

- `GET /api/health` → `{ ok: true, mode: 'local-only', schemaVersion: 1 }`
- `GET /api/sync` → `{ revision, snapshot }`
- `POST /api/sync` JSON `{ requestId, clientId, sequence, snapshot }` → `{ revision, snapshot, replayed }`
- `PUT /api/photos/:photoId` 原始图片字节与图片 Content-Type → `{ ok: true }`；相同 key 同字节幂等，不同字节 409。上限 25 MiB。
- `GET /api/photos/:photoId` → 原始图片或 404，仅当前空间。

请求 ID+载荷摘要写入 SQLite 幂等收据，与进度合并、revision 在同一事务完成。重复同载荷返回当前合并结果；同请求 ID 不同载荷 409。接受合法乱序序号的追加合并，不以旧快照覆盖新记录。POST 元数据须先有全部关联照片（本地演示 photoUrl 除外），缺失 422；错误返回 `{ error: string, code: string }`，无内部路径或堆栈。

## 前端同步

浏览器持久化 clientId、递增 sequence、已确认 revision、待提交请求及 wire/local 照片映射。先持久化 outbox，再传照片、再提交元数据。失败重试沿用同请求 ID；响应返回后与最新本地状态合并，不能覆盖请求期间新增的打卡。下载缺失照片且本地状态耐久保存后，才能确认待提交请求。低 revision 迟到响应不能回退状态。自动重试有间隔，并提供立即同步／停用入口与待同步、成功、失败状态。

每 5 秒及窗口聚焦／网络恢复时尝试同步，进度变化也会触发；没有新进度时只拉取，不上传连续定位。界面导入备份前暂停并使旧响应失效，显式恢复后按原绑定空间只增合并。同步不提供删除传播或撤销历史功能。

## 启动、存储与迁移

要求 Node 24.16+。`npm run local` 构建前端及本机服务，读取可选 `.env.local`，默认访问 `http://127.0.0.1:4317/`。`npm run dev`／`preview` 仅提供前端，不提供代理或数据库。环境示例见根目录 `.env.example`；服务绑定地址不可通过环境变量改为局域网／公网地址。

默认 SQLite 路径 `.local-data/vesluma.sqlite`，可以用 `VESLUMA_DB_PATH` 指定路径，端口用 `VESLUMA_PORT` 指定。`.local-data/`、`.local-build/` 和 `.env.local` 均不纳入 Git。数据库、WAL 日志和照片原始字节都保存在本机，不创建云资源。复制数据库备份前先正常停止服务，不要仅复制运行中的主文件而漏掉 WAL。浏览器里的“导出完整备份”仍可用。

首次启动在事务中创建 `spaces`（快照／revision）、`photos`（按空间隔离的图片字节）、`receipts`（请求幂等收据），设置 `PRAGMA user_version = 1`。重复启动保留数据，启用外键、WAL 和 FULL 同步。发现高于本程序的 schema 版本拒绝启动，不重置、不降级数据库。未提供清空数据库或自动删旧数据命令。

`npm run test:server`、`npm run test:e2e:sync` 的数据库位于系统临时目录，测试不会打开默认资料库。浏览器同步测试使用两个隔离 context 模拟设备；没有验证同一浏览器资料目录多标签页同时写入的锁协调。该范围也不等于真实两台设备联网、正式认证或生产多人权限。

快照请求上限 10 MiB；单照片 25 MiB（前端拍照选择上限更低）。当前合并以完整资料快照为单位，小范围本机验证后仍需评估大量历史照片／记录的成本。异常、空间隔离和输入校验不能替代正式账号认证；数据库文件亦未加密。

## 预定验收

1. SQLite 初始化、重复启动、持久化重启恢复；测试全部使用临时数据库。
2. 参数／引用／证据／体积校验；Host、Origin、空间与照片隔离。
3. 两会话离线各自到访、交错同步、重叠权益去重；同 ID 证据冲突不静默覆盖。
4. 重复请求、乱序请求、提交后响应丢失、同步中新增记录、服务离线恢复。
5. 旧本地资料与照片迁移，legacy 权益不扩大；新会话恢复已同步记录和照片。
6. 既有 114 单元和 26 浏览器场景回归（公网冒烟单独执行），最终生产代码验证。
