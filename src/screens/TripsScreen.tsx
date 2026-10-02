import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Camera, ChevronRight, Clock3, Compass, Footprints, Grid2X2, List, MapPin, Pause, Play, Plus, Settings2, Sparkles, UsersRound } from 'lucide-react';
import type { AppState, Visit } from '../lib/model';
import { getActiveTrip, getProfileTrips, getProfileVisits, getProfileUnlocks, getReplayState } from '../lib/model';
import { getCity, getLandmark, getMapRegions } from '../data/cities';
import { clockLabel, dateLabel } from '../lib/format';
import ExploreMap from '../components/ExploreMap';
import { EmptyState } from '../components/Primitives';
import { VisitPhoto } from './LandmarkScreen';
import './trips.css';

export interface TripsScreenContext {
  selectedId: string | null;
  tab: 'timeline' | 'gallery';
  replayProgress: number;
  scrollTop: number;
}

interface TripsScreenProps {
  state: AppState;
  onStart: () => void;
  onManage: () => void;
  onLandmark: (id: string) => void;
  onVisit: (visit: Visit) => void;
  initialContext?: TripsScreenContext;
  onContextChange?: (context: TripsScreenContext) => void;
}

export function TripsScreen({ state, onStart, onManage, onLandmark, onVisit, initialContext, onContextChange }: TripsScreenProps) {
  const trips = getProfileTrips(state).slice().sort((a, b) => b.startedAt - a.startedAt);
  const activeTrip = getActiveTrip(state);
  const [selectedId, setSelectedId] = useState<string | null>(initialContext?.selectedId ?? null);
  const [tab, setTab] = useState<'timeline' | 'gallery'>(initialContext?.tab ?? 'timeline');
  const [replayProgress, setReplayProgress] = useState(initialContext?.replayProgress ?? 1000);
  const [playing, setPlaying] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(initialContext?.scrollTop ?? 0);
  const contextCallback = useRef(onContextChange);
  contextCallback.current = onContextChange;
  useLayoutEffect(() => { if (screen.current) screen.current.scrollTop = scrollTop.current; }, []);
  useEffect(() => { contextCallback.current?.({ selectedId, tab, replayProgress, scrollTop: scrollTop.current }); }, [selectedId, tab, replayProgress]);
  const selectedTrip = trips.find((trip) => trip.id === selectedId) || activeTrip || trips[0];
  const profileVisits = getProfileVisits(state);
  const visits = selectedTrip ? profileVisits.filter((visit) => visit.tripId === selectedTrip.id).sort((a, b) => a.at - b.at) : [];
  const tripPoints = selectedTrip ? state.points.filter((point) => point.tripId === selectedTrip.id && point.userId === state.profile.id) : [];
  const city = getCity(selectedTrip?.cityId || state.cityId);
  const mapCity = useMemo(() => ({
    ...city, regions: getMapRegions(city.id),
    center: [city.center[1], city.center[0]] as [number, number],
    landmarks: city.landmarks.map((landmark) => ({ ...landmark, coordinates: [landmark.lng, landmark.lat] as [number, number] })),
  }), [city]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(replayProgress + 20, 1000);
      setReplayProgress(next);
      if (next === 1000) setPlaying(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [playing, replayProgress]);

  const chooseTrip = (id: string) => {
    setSelectedId(id);
    setReplayProgress(1000);
    setPlaying(false);
  };

  if (!selectedTrip) {
    return <div className="trips-screen scroll-screen">
      <header className="trips-heading"><h1>这一程，留了下来</h1></header>
      <EmptyState icon={<Compass size={30} />} title="故事，从出发开始" body="开始一段旅行，记录位置、到访地标，把城市里的相遇留在这一程。" action={<button className="primary-button" onClick={onStart}><Plus size={17} />开始第一段旅行</button>} />
      <div className="trip-empty-note"><Footprints size={17} /><p>足迹以位置点云保存。到访一级地标后，展开其负责的整片区域。</p></div>
    </div>;
  }

  const startedAt = selectedTrip.startedAt;
  const lastEventAt = Math.max(tripPoints.reduce((last, point) => Math.max(last, point.at), startedAt), visits.reduce((last, visit) => Math.max(last, visit.at), startedAt));
  const endedAt = selectedTrip.endedAt || (selectedTrip.status === 'ended' ? lastEventAt : Math.max(lastEventAt, Date.now()));
  const cursorAt = startedAt + Math.round((endedAt - startedAt) * replayProgress / 1000);
  const replay = getReplayState(state, selectedTrip.id, cursorAt);
  const replayVisits = replay.visits.slice().sort((a, b) => a.at - b.at);
  const landmarkIds = [...new Set(replayVisits.map((visit) => visit.landmarkId))];
  const replayMapCity = { ...mapCity, landmarks: mapCity.landmarks.filter((landmark) => landmarkIds.includes(landmark.id)) };
  const personalUnlocks = getProfileUnlocks(state).filter((unlock) => unlock.cityId === city.id);
  const expandedCount = replay.unlockedRegionIds.filter((id) => city.regions.some((region) => region.id === id)).length;
  const archivedTrips = trips.filter((trip) => trip.id !== selectedTrip.id);
  const hasReplay = visits.length > 0 || tripPoints.length > 0;
  const isCurrent = activeTrip?.id === selectedTrip.id;
  const statusText = selectedTrip.status === 'active' ? '记录中' : selectedTrip.status === 'paused' ? '已暂停' : '已珍藏';

  return <div className="trips-screen scroll-screen" ref={screen} onScroll={event => {
    scrollTop.current = event.currentTarget.scrollTop;
    contextCallback.current?.({ selectedId, tab, replayProgress, scrollTop: scrollTop.current });
  }}>
    <header className="trips-heading"><h1>这一程，留了下来</h1><button className="trip-add-button icon-button" aria-label="开始新旅行" onClick={onStart}><Plus size={22} /></button></header>

    <div className="trip-selection"><div className="trip-city-mark"><Compass size={21} /></div><div className="trip-selection-title"><h2>{selectedTrip.name}</h2><p>{city.name}<span>·</span>{dateLabel(startedAt)}{selectedTrip.mode === 'squad' ? <><span>·</span><UsersRound size={12} />小队旅行</> : null}</p></div><span className={`trip-status ${selectedTrip.status}`}><i />{statusText}</span></div>

    <section className="trip-map-preview" aria-label="旅程的地图回放">
      <ExploreMap mapTheme={state.mapTheme ?? 'paper'} city={replayMapCity} compact unlockedRegionIds={replay.unlockedRegionIds} visitedLandmarkIds={landmarkIds} points={replay.points} position={null} onSelectLandmark={onLandmark} fitKey={selectedTrip.startedAt} />
      <div className="trip-map-caption"><span><Footprints size={13} />展开 {expandedCount} 片区域</span><b>{replayProgress === 1000 ? '完整记录' : `回放至 ${clockLabel(cursorAt)}`}</b></div>
    </section>

    <div className="trip-statistics" aria-label="旅程统计"><div><b>{landmarkIds.length}<small>处</small></b><span>到访地标</span></div><div><b>{replay.points.length}<small>个</small></b><span>位置足迹</span></div><div><b>{replayVisits.length}<small>张</small></b><span>留存照片</span></div></div>

    <section className={`trip-replay ${!hasReplay ? 'empty' : ''}`} aria-label="时间回放">
      <button className="trip-replay-play" disabled={!hasReplay} aria-label={playing ? '暂停回放' : '播放旅行回放'} onClick={() => { if (!playing && replayProgress === 1000) setReplayProgress(0); setPlaying((value) => !value); }}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <div className="trip-replay-track"><div><span>回看这一程</span><b>{clockLabel(cursorAt)}</b></div><input type="range" min="0" max="1000" step="1" value={replayProgress} disabled={!hasReplay} aria-label="旅行回放时间" aria-valuetext={`${dateLabel(cursorAt)} ${clockLabel(cursorAt)}`} style={{ '--replay-progress': `${replayProgress / 10}%` } as CSSProperties} onChange={(event) => { setPlaying(false); setReplayProgress(Number(event.target.value)); }} /><div className="trip-replay-times"><span>{clockLabel(startedAt)} 出发</span><span>{clockLabel(endedAt)} {selectedTrip.status === 'ended' ? '结束' : '此刻'}</span></div></div>
    </section>
    <p className="trip-data-note">{hasReplay ? '回放只呈现当时已留下的足迹与到访。' : '还没有足迹。获取位置或拍照到访后，就可以回放。'}{personalUnlocks.length > expandedCount ? '历史已展开区域继续保留。' : ''}</p>

    {isCurrent ? <button className="trip-manage" onClick={onManage}><div><span className={`trip-recording-dot ${selectedTrip.status}`} /><span>{selectedTrip.status === 'paused' ? '这段旅行正在休息' : '新的足迹，还在继续'}</span></div><span>管理旅行<Settings2 size={15} /></span></button> : null}

    <div className="trip-records-heading"><div><h2>沿途的相遇</h2><span>{replayVisits.length} 次到访</span></div><div className="trip-view-toggle" aria-label="到访视图"><button className={tab === 'timeline' ? 'active' : ''} aria-label="时间线视图" aria-pressed={tab === 'timeline'} onClick={() => setTab('timeline')}><List size={17} /></button><button className={tab === 'gallery' ? 'active' : ''} aria-label="照片视图" aria-pressed={tab === 'gallery'} onClick={() => setTab('gallery')}><Grid2X2 size={16} /></button></div></div>

    {replayVisits.length ? tab === 'timeline' ? <div className="trip-timeline">{replayVisits.map((visit, index) => {
      const landmark = getLandmark(visit.landmarkId);
      const previous = replayVisits[index - 1];
      const newDay = !previous || dateLabel(previous.at) !== dateLabel(visit.at);
      return <article className="trip-timeline-event" key={visit.id}><div className="trip-event-time">{newDay ? <small>{dateLabel(visit.at).slice(5)}</small> : null}<b>{clockLabel(visit.at)}</b><i /></div><div className="trip-event-content"><div className="trip-event-title"><button onClick={() => onLandmark(visit.landmarkId)}><h3>{landmark?.name || '到访地标'}</h3><ArrowUpRight size={15} /></button>{visit.firstActivation ? <span><Sparkles size={11} />首次到访</span> : <span>再次相遇</span>}</div><p>{visit.source === 'squad' ? '来自本次小队的共同记录' : visit.demo ? '本地演示到访' : '在这里，留下一张照片'}</p><div className="trip-timeline-photo"><VisitPhoto visit={visit} onClick={() => onVisit(visit)} /><button className="trip-photo-details" onClick={() => onVisit(visit)}><span>查看这次到访</span><small>{visit.unlockedRegionIds.length ? `展开 ${visit.unlockedRegionIds.length} 片地图区域` : '记忆已留在这一程'}</small><ChevronRight size={15} /></button></div></div></article>;
    })}</div> : <div className="trip-gallery">{replayVisits.map((visit) => <article key={visit.id}><VisitPhoto visit={visit} onClick={() => onVisit(visit)} /><button className="trip-gallery-caption" onClick={() => onLandmark(visit.landmarkId)}><b>{getLandmark(visit.landmarkId)?.name || '到访地标'}</b><span>{clockLabel(visit.at)}<ArrowUpRight size={13} /></span></button></article>)}</div> : <div className="trip-visits-empty"><Camera size={26} /><p>{visits.length && replayProgress < 1000 ? '这一刻，故事还没开始。' : '第一张合影，等你来留下。'}</p><small>{visits.length && replayProgress < 1000 ? '向后拖动回放，看看接下来的相遇。' : '在地标拍照到访，它会出现在这条时间线上。'}</small></div>}

    {archivedTrips.length ? <section className="trip-archive"><div className="trip-archive-heading"><h2>其他旅程</h2><span>{archivedTrips.length} 段记忆</span></div>{archivedTrips.map((trip) => {
      const tripCity = getCity(trip.cityId);
      const count = new Set(profileVisits.filter((visit) => visit.tripId === trip.id).map((visit) => visit.landmarkId)).size;
      return <button className="trip-archive-card" key={trip.id} onClick={() => chooseTrip(trip.id)}><img src={tripCity.landmarks[0].cover} alt={`${tripCity.name}城市概念影像`} /><div><h3>{trip.name}</h3><p>{dateLabel(trip.startedAt)}<span>·</span>{count} 处地标</p><small><MapPin size={11} />{tripCity.name}{trip.status === 'ended' ? ' · 已珍藏' : ' · 进行中'}</small></div><ChevronRight size={18} /></button>;
    })}</section> : null}
    <div className="trip-bottom-note"><Clock3 size={13} /><span>每一次到访，都值得被记住</span></div>
  </div>;
}
