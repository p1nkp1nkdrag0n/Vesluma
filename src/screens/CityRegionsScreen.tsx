import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronDown, Maximize, MapPin } from 'lucide-react';
import { getCity, getLandmark, getMapRegions, planningEvidence } from '../data/cities';
import { getCityProgress, type AppState } from '../lib/model';
import ExploreMap from '../components/ExploreMap';
import './regions.css';

export interface CityRegionsContext { selectedId: string | null; scrollTop: number }

export function CityRegionsScreen({ state, onBack, onCity, onLandmark, initialContext, onContextChange }: {
  state: AppState; onBack: () => void; onCity: () => void; onLandmark: (id: string) => void;
  initialContext?: CityRegionsContext; onContextChange?: (context: CityRegionsContext) => void;
}) {
  const city = getCity(state.cityId);
  const progress = getCityProgress(state);
  const [selectedId, setSelectedId] = useState<string | null>(initialContext?.selectedId ?? null);
  const [fitKey, setFitKey] = useState(0);
  const screen = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(initialContext?.scrollTop ?? 0);
  const contextCallback = useRef(onContextChange);
  contextCallback.current = onContextChange;
  useLayoutEffect(() => { if (screen.current) screen.current.scrollTop = scrollTop.current; }, []);
  useEffect(() => { contextCallback.current?.({ selectedId, scrollTop: scrollTop.current }); }, [selectedId]);
  const selected = city.regions.find(r => r.id === selectedId);
  const mapCity = useMemo(() => ({ ...city, regions: getMapRegions(city.id),
    center: [city.center[1], city.center[0]] as [number, number],
    landmarks: city.landmarks.filter(l => l.tier === 1).map(l => ({ ...l, coordinates: [l.lng, l.lat] as [number, number] })),
  }), [city]);
  const sources = planningEvidence.filter(source => city.regions.some(r => r.evidenceIds.includes(source.id)));
  return <div className="regions-screen scroll-screen" ref={screen} onScroll={event => {
    scrollTop.current = event.currentTarget.scrollTop;
    contextCallback.current?.({ selectedId, scrollTop: scrollTop.current });
  }}>
    <header className="simple-heading"><button className="icon-button" aria-label="返回探索" onClick={onBack}><ArrowLeft size={21} /></button>
      <h2>全市分区</h2><button className="text-button" onClick={onCity}>{city.name}<ChevronDown size={14} /></button></header>
    <div className="regions-intro"><span className="eyebrow">一处代表，展开一片城市</span><h1>{city.name}，分 {city.regions.length} 次展开</h1>
      <p>密集景点合并成组团，只有一级地标负责开图。<br />市域内的城区、郊野与水域都纳入分区。</p>
      {city.coverageNote ? <p>{city.coverageNote}</p> : null}
      <div className="regions-metrics"><span><b>{city.regions.length}</b>开图地标</span><span><b>{city.landmarks.length - city.regions.length}</b>游览与记录点</span><span><b>{Math.round(city.areaKm2).toLocaleString()}</b>约 km² 覆盖</span></div>
    </div>
    <div className="region-plan-map"><ExploreMap city={mapCity} mapTheme={state.mapTheme} unlockedRegionIds={progress.allRegionIds}
      points={[]} position={null} selectedLandmarkId={selected?.anchorLandmarkId} onSelectLandmark={id => setSelectedId(getLandmark(id)?.regionId ?? null)}
      showRegionPlan focusRegionId={selected?.id} fitKey={fitKey} overlayBottom={0} />
      <button className="region-map-caption" onClick={() => { setSelectedId(null); setFitKey(key => key + 1); }}><Maximize size={13} />{selected ? '返回全市总览' : '点击色块查看开图范围'}</button>
    </div>
    <div className="region-tier-legend"><span><i className="tier-one" />一级开图</span><span><i className="tier-two" />二级游览</span><span><i />三级记录</span></div>
    <div className="region-list">{city.regions.map((region, index) => {
      const anchor = getLandmark(region.anchorLandmarkId)!;
      const others = city.landmarks.filter(l => l.regionId === region.id && l.tier !== 1);
      const active = selected?.id === region.id;
      return <article key={region.id} className={`region-card${active ? ' selected' : ''}`}>
        <button className="region-card-heading" aria-pressed={active} onClick={() => setSelectedId(region.id)}><span className="region-number">{String(index + 1).padStart(2, '0')}</span>
          <span><b>{region.name}</b><small>{region.heat} · 约 {region.areaKm2.toLocaleString()} km²{progress.regionIds.includes(region.id) ? ' · 已展开' : ''}</small></span><MapPin size={17} /></button>
        <div className="region-card-body"><button className="region-anchor" onClick={() => onLandmark(anchor.id)}><span>开图代表 <b>{anchor.name}</b></span><ArrowUpRight size={16} /></button>
          <p>{region.rationale}</p>{others.length > 0 ? <p className="region-included">游览与记录：{others.map(l => l.name).join('、')}</p> : null}
          {active ? <p className="region-boundary-note">{region.boundaryNote}</p> : null}</div>
      </article>;
    })}</div>
    <div className="region-notes"><p>一级是开图职责，并非景区星级或知名度排名。二、三级地标可独立拍照、重访、记录，无须全部到访。</p>
      {progress.legacyRegionIds.length > 0 ? <p>已保留 {progress.legacyRegionIds.length} 个旧版小区的原有范围，未折算成新的整区权益。</p> : null}
      <details><summary>查看数据与规划依据</summary><p>依据截至 2026-10-02 可查的公开客流与旅游组团资料作定性规划，不是实时热力。市域边界来自 OpenStreetMap；面积是该快照的几何估算。组团内部规划线和候选拍照点仍待实地校准。</p>
        {sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}
      </details></div>
  </div>;
}
