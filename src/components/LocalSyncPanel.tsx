import { useState } from 'react'
import { Database, RefreshCw } from 'lucide-react'
import type { LocalSpace } from '../lib/localSync'
import type { LocalSyncControls } from '../lib/localSyncHook'
import './LocalSyncPanel.css'

const phaseLabels = { disabled: '尚未开启', pending: '等待同步', syncing: '正在同步', synced: '已同步', error: '同步失败' }

export function LocalSyncPanel({ sync }: { sync: LocalSyncControls }) {
  const [selectedSpace, setSelectedSpace] = useState<LocalSpace>('local-a')
  const { status } = sync
  const space = status.space ?? selectedSpace
  return <section className="local-sync-panel" aria-label="本机数据库同步">
    <h2><Database size={17} />本机数据库同步</h2>
    <p>把到访、开图、旅行和关联照片存入这台电脑的数据库。在连接同一服务的浏览器中选择同一资料空间，可以恢复记录。</p>
    <p>在项目目录运行 <code>npm run local</code>，打开命令显示的本机地址（默认 127.0.0.1:4317）。开发页和静态预览不附带数据库服务。</p>
    <p className="local-sync-disclosure">每个资料空间包含「旅行者／同行者」两个演示角色。空间名不是账号或密码，知道名称的本机程序可以访问；仅用于本地验证。照片与到访时的位置证据只传往本机回环服务，不上传当前定位、连续轨迹或公开开关。</p>
    {!status.space ? <label className="local-sync-space">本机资料空间<select aria-label="本机资料空间" value={selectedSpace} onChange={event => setSelectedSpace(event.target.value as LocalSpace)}>
      <option value="local-a">local-a · 资料空间 A</option><option value="local-b">local-b · 资料空间 B</option>
    </select></label> : <p className="local-sync-bound">已绑定 {status.space} · 此浏览器不能直接改绑</p>}
    <div className="local-sync-status" role="status" aria-live="polite" aria-atomic="true">
      <strong>{!status.enabled && status.space && status.phase === 'disabled' ? '已暂停' : phaseLabels[status.phase]}</strong>
      {status.pending && <span>有记录等待同步</span>}
      {status.lastSuccessAt && <span>最近完成 {new Date(status.lastSuccessAt).toLocaleTimeString('zh-CN')}</span>}
    </div>
    {status.error && <p className="local-sync-error" role="alert">{status.error}</p>}
    {status.pausedForImport && <p className="local-sync-error">已为导入备份暂停同步。恢复后，导入记录和原待同步记录会与 {status.space} 的历史记录只增合并；之前的记录可能重新出现，不会删除数据库中的资料。</p>}
    {!status.available && <p className="local-sync-error">请使用本机启动地址 localhost 或 127.0.0.1；此入口不会连接外部服务。</p>}
    <div className="local-sync-actions">{status.enabled ? <>
      <button className="primary-button" onClick={sync.retry} disabled={status.phase === 'syncing'}><RefreshCw size={15} />立即同步</button>
      <button className="secondary-button" onClick={sync.disable}>暂停同步</button>
    </> : <button className="primary-button" disabled={!status.available} onClick={() => sync.enable(space)}>{status.space ? '恢复本机同步' : '开启本机同步'}</button>}</div>
    <p className="local-sync-footnote">首次开启会保留原记录副本和原照片。暂停不删除数据；断开服务后仍可记录，重新连接后自动重试。这里不是云备份，请继续定期导出备份。</p>
  </section>
}
