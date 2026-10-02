import { useMemo, useState } from 'react';
import { ChevronDown, BriefcaseBusiness, Navigation, ChevronUp, MapPin, Palette } from 'lucide-react';
import type { AppState } from '../lib/model';
import { distanceMeters, bearingDegrees, getProfileUnlocks, getLandmarkVisits, getActiveTrip, getCityProgress } from '../lib/model';
import { getCity, getMapRegions } from '../data/cities';
import ExploreMap from '../components/ExploreMap';
import { distanceLabel, clockLabel } from '../lib/format';

export function ExploreScreen({ state, onCity, onTrip, onLandmark, onTarget, onLocation, onMapTheme, onRegions, compassHeading }: { state: AppState; onCity: () => void; onTrip: () => void; onLandmark: (id: string) => void; onTarget: (id: string) => void; onLocation: () => void; onMapTheme: () => void; onRegions: () => void; compassHeading: number | null }) {
  const city = getCity(state.cityId);
  const [expanded, setExpanded] = useState(false);
  const trip = getActiveTrip(state);
  const progress = getCityProgress(state);
  const [filter, setFilter] = useState<'anchors' | 'all'>('anchors');
  const unlocked = getProfileUnlocks(state).filter(u => u.cityId === city.id).map(u => u.regionId);
  const mapCity = useMemo(() => ({ ...city, regions: getMapRegions(city.id), center: [city.center[1], city.center[0]] as [number, number], landmarks: city.landmarks.filter(l => filter === 'all' || l.tier === 1 || l.id === state.targetLandmarkId).map(l => ({ ...l, coordinates: [l.lng, l.lat] as [number, number] })) }), [city, filter, state.targetLandmarkId]);
  const position = state.position;
  const isFresh = position && Date.now() - position.at < 300000;
  const landmarks = [...city.landmarks].map(l => ({ ...l, distance: isFresh ? distanceMeters(position, l) : null })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const target = city.landmarks.find(l => l.id === state.targetLandmarkId);
  const filteredLandmarks = filter === 'anchors' ? landmarks.filter(l => l.tier === 1) : landmarks;
  const displayLandmarks = expanded ? filteredLandmarks : [target ? landmarks.find(l => l.id === target.id)! : (filteredLandmarks.find(l => getLandmarkVisits(state, l.id).length === 0) ?? filteredLandmarks[0])];
  const targetDistance = target && isFresh ? distanceMeters(position, target) : null;
  const bearing = target && isFresh ? bearingDegrees(position, target) : 0;
  const hasHeading = compassHeading !== null;
  const points = state.points.filter(p => p.cityId === city.id && p.userId === state.profile.id && (!trip || p.tripId === trip.id));
  return <div className="explore-screen">
    <header className="explore-heading"><div><button className="city-title" onClick={onCity}>{city.name}<ChevronDown size={18} /></button><p>沿着城市的轮廓，去探索</p></div><button className="trip-pill" onClick={onTrip}><BriefcaseBusiness size={16} />{trip ? '此刻的旅程' : '开始旅行'}{trip?.status === 'active' && <i />}</button></header>
    <div className="map-stage">
      <ExploreMap mapTheme={state.mapTheme ?? 'paper'} city={mapCity} unlockedRegionIds={unlocked} visitedLandmarkIds={city.landmarks.filter(l => getLandmarkVisits(state,l.id).length).map(l => l.id)} points={points} position={position} selectedLandmarkId={state.targetLandmarkId} onSelectLandmark={onLandmark} overlayBottom={225} />
      <button className="map-theme-trigger" aria-label="切换地图主题" onClick={onMapTheme}><Palette size={17} /></button>
      <button className="progress-pill" onClick={onRegions}><span className="mini-dot" />已展开 {progress.unlocked} / {city.regions.length} 区 · 全市分区</button>
      {target ? <button className="compass-pill" onClick={() => onLandmark(target.id)}><div className="compass-arrow" style={{ transform: `rotate(${bearing - (compassHeading ?? 0)}deg)` }}><>{isFresh ? <Navigation size={24} fill="currentColor" /> : <MapPin size={22} />}</></div><div><b>{target.name}</b><span>{isFresh ? `直线距离 ${distanceLabel(targetDistance)}` : '位置待更新 · 方向待更新'}{isFresh && !hasHeading ? ' · 北向参考' : ''}</span></div><ChevronDown className="rotate-left" size={18} /></button> : <div className="map-invitation"><span>沿着主干道，去遇见下一站</span></div>}
      <section className={`landmark-sheet ${expanded ? 'expanded' : ''}`} aria-label="附近地标"><button className="sheet-handle" aria-label={expanded ? '收起地标列表' : '展开地标列表'} aria-expanded={expanded} onClick={() => setExpanded(x => !x)}><span /></button><div className="sheet-heading"><h2>下一站，凭好奇心</h2><button className="text-button muted" onClick={() => setExpanded(x => !x)}>{isFresh ? '由近及远' : '等待位置'}<ChevronUp size={13} className={expanded ? 'turn-down' : ''} /></button></div><div className="landmark-filter"><button aria-pressed={filter === 'anchors'} onClick={() => setFilter('anchors')}>开图地标 {city.regions.length}</button><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部地标 {city.landmarks.length}</button><button onClick={onRegions}>查看分区 ↗</button></div><div className="landmark-list">{displayLandmarks.map(l => <div className="landmark-row" key={l.id}><button className="landmark-main" onClick={() => onLandmark(l.id)}><img src={l.cover} alt="城市概念影像" /><span><strong>{l.name}</strong><small>{getLandmarkVisits(state, l.id).length ? '已到访' : l.tier === 1 ? '一级 · 可开图' : l.tier === 2 ? '二级 · 游览' : '三级 · 记录'}<em>·</em>{distanceLabel(l.distance)}</small></span></button><button className={`target-button ${state.targetLandmarkId === l.id ? 'selected' : ''}`} aria-label={`设${l.name}为目标`} aria-pressed={state.targetLandmarkId === l.id} onClick={() => onTarget(l.id)}><Navigation size={19} fill={state.targetLandmarkId === l.id ? 'currentColor' : 'none'} /></button></div>)}</div><p className="map-information-legend">一级地标展开整区 · 其余景点记录到访</p><button className="location-footnote" onClick={onLocation}><MapPin size={12} />{state.locationMode === 'demo' ? '前台体验 · 演示位置' : position ? `设备位置 · ${clockLabel(position.at)}` : '获取设备位置'}<span>全市规划</span></button></section>
    </div>
  </div>;
}
