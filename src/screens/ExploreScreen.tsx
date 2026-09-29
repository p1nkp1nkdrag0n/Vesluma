import { useMemo, useState } from 'react';
import { ChevronDown, BriefcaseBusiness, Navigation, ChevronUp, Mountain, MapPin } from 'lucide-react';
import type { AppState } from '../lib/model';
import { distanceMeters, bearingDegrees, getProfileUnlocks, getLandmarkVisits, getActiveTrip } from '../lib/model';
import { getCity } from '../data/cities';
import ExploreMap from '../components/ExploreMap';
import { distanceLabel, clockLabel } from '../lib/format';

export function ExploreScreen({ state, onCity, onTrip, onLandmark, onTarget, onLocation, compassHeading }: { state: AppState; onCity: () => void; onTrip: () => void; onLandmark: (id: string) => void; onTarget: (id: string) => void; onLocation: () => void; compassHeading: number | null }) {
  const city = getCity(state.cityId);
  const [expanded, setExpanded] = useState(false);
  const trip = getActiveTrip(state);
  const unlocked = getProfileUnlocks(state).filter(u => u.cityId === city.id).map(u => u.regionId);
  const mapCity = useMemo(() => ({ ...city, center: [city.center[1], city.center[0]] as [number, number], landmarks: city.landmarks.map(l => ({ ...l, coordinates: [l.lng, l.lat] as [number, number] })) }), [city]);
  const position = state.position;
  const isFresh = position && Date.now() - position.at < 300000;
  const landmarks = [...city.landmarks].map(l => ({ ...l, distance: isFresh ? distanceMeters(position, l) : null })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const target = city.landmarks.find(l => l.id === state.targetLandmarkId);
  const targetDistance = target && isFresh ? distanceMeters(position, target) : null;
  const bearing = target && isFresh ? bearingDegrees(position, target) : 0;
  const hasHeading = compassHeading !== null;
  const points = state.points.filter(p => p.cityId === city.id && p.userId === state.profile.id && (!trip || p.tripId === trip.id));
  return <div className="explore-screen">
    <header className="explore-heading"><div><button className="city-title" onClick={onCity}>{city.name}<ChevronDown size={18} /></button><p>让这座城，慢慢亮起来</p></div><button className="trip-pill" onClick={onTrip}><BriefcaseBusiness size={16} />{trip ? '此刻的旅程' : '开始旅行'}{trip?.status === 'active' && <i />}</button></header>
    <div className="map-stage">
      <ExploreMap city={mapCity} unlockedRegionIds={unlocked} visitedLandmarkIds={city.landmarks.filter(l => getLandmarkVisits(state,l.id).length).map(l => l.id)} points={points} position={position} selectedLandmarkId={state.targetLandmarkId} onSelectLandmark={onLandmark} />
      <button className="progress-pill" onClick={onCity}><span className="mini-dot" />已展开 {unlocked.length} / {city.regions.length} 个试验区</button>
      {target ? <button className="compass-pill" onClick={() => onLandmark(target.id)}><div className="compass-arrow" style={{ transform: `rotate(${bearing - (compassHeading ?? 0)}deg)` }}><Navigation size={24} fill="currentColor" /></div><div><b>{target.name}</b><span>直线距离 {distanceLabel(targetDistance)}{!hasHeading ? ' · 北向参考' : ''}</span></div><ChevronDown className="rotate-left" size={18} /></button> : <div className="map-invitation"><Mountain size={17} /><span>迷雾里，也藏着下一次相遇</span></div>}
      <section className={`landmark-sheet ${expanded ? 'expanded' : ''}`} aria-label="附近地标"><button className="sheet-handle" aria-label={expanded ? '收起地标列表' : '展开地标列表'} aria-expanded={expanded} onClick={() => setExpanded(x => !x)}><span /></button><div className="sheet-heading"><h2>下一站，凭好奇心</h2><button className="text-button muted" onClick={() => setExpanded(x => !x)}>{isFresh ? '由近及远' : '等待位置'}<ChevronUp size={13} className={expanded ? 'turn-down' : ''} /></button></div><div className="landmark-list">{landmarks.map((l, index) => <div className={`landmark-row ${!expanded && index > 1 ? 'preview-hidden' : ''}`} key={l.id}><button className="landmark-main" onClick={() => onLandmark(l.id)}><img src={l.cover} alt="城市概念影像" /><span><strong>{l.name}</strong><small>{getLandmarkVisits(state, l.id).length ? '已激活' : '未激活'}<em>·</em>{distanceLabel(l.distance)}</small></span></button><button className={`target-button ${state.targetLandmarkId === l.id ? 'selected' : ''}`} aria-label={`设${l.name}为目标`} aria-pressed={state.targetLandmarkId === l.id} onClick={() => onTarget(l.id)}><Navigation size={19} fill={state.targetLandmarkId === l.id ? 'currentColor' : 'none'} /></button></div>)}</div><button className="location-footnote" onClick={onLocation}><MapPin size={12} />{state.locationMode === 'demo' ? '前台体验 · 演示位置' : position ? `设备位置 · ${clockLabel(position.at)}` : '获取设备位置'}<span>示意区划</span></button></section>
    </div>
  </div>;
}
