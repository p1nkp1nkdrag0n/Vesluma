import { Check, Compass, Map } from 'lucide-react';
import type { MapTheme } from '../lib/mapTheme';
import { mapThemes } from '../lib/mapTheme';

export function MapThemePicker({ value, onChange }: { value: MapTheme; onChange: (theme: MapTheme) => void }) {
  return <>
    <p className="modal-description">为尚未展开的城市选一种纸张。已展开区域始终保留真实详细地图。</p>
    <div className="map-theme-options" role="group" aria-label="未解锁地图主题">
      {mapThemes.map(theme => <button key={theme.id} className={`map-theme-option ${value === theme.id ? 'selected' : ''}`} aria-pressed={value === theme.id} onClick={() => onChange(theme.id)}>
        <span className={`map-theme-sample ${theme.id}`} style={{ backgroundImage: `url(${theme.texture})` }}>
          <span className="sample-arterial vertical" /><span className="sample-arterial horizontal" />
          {theme.id === 'paper' ? <Map size={22} /> : <Compass size={25} strokeWidth={1.2} />}
        </span>
        <span className="map-theme-copy"><b>{theme.name}</b><small>{theme.description}</small></span>
        <span className="theme-check">{value === theme.id && <Check size={17} />}</span>
      </button>)}
    </div>
    <p className="quiet-note">主干道取自真实地理数据，用于辨认方向。<br />已知通行受限路段会在路名和线条中标识。<br />主题切换保持开图进度、地标位置和旅行记录。</p>
  </>;
}
