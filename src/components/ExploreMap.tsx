import { memo, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { getCitySkeleton, loadCitySkeleton } from '../data/map';
import type { MapSkeleton } from '../data/map';
import { SkeletonLayer } from './SkeletonLayer';
import { isPointUnlocked, regionPolygons } from './mapGeometry';
import type { MapCoordinates, MapTheme, MapRegion } from './mapGeometry';

export type { MapCoordinates, MapTheme } from './mapGeometry';

export interface ExploreMapCity {
  id: string;
  name: string;
  center: MapCoordinates;
  zoom: number;
  landmarks: { id: string; name: string; coordinates: MapCoordinates; tier?: number; regionId?: string }[];
  regions: MapRegion[];
  boundary?: MapRegion['geometry'];
}

export interface ExploreMapProps {
  city: ExploreMapCity;
  unlockedRegionIds: string[];
  points: { lat: number; lng: number; at?: number }[];
  position: { lat: number; lng: number; accuracy?: number } | null;
  selectedLandmarkId?: string | null;
  visitedLandmarkIds?: string[];
  onSelectLandmark: (id: string) => void;
  recenterKey?: number;
  fitKey?: number;
  compact?: boolean;
  mapTheme?: MapTheme;
  overlayBottom?: number;
  showRegionPlan?: boolean;
  focusRegionId?: string | null;
}

type TileState = 'loading' | 'ready' | 'partial' | 'unavailable';
type SkeletonStatus = 'loading' | 'ready' | 'error';
const JADE = '#218675';
const landmarkSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h16M6 9l6-4 6 4M7 10v8m5-8v8m5-8v8M4 19h16M6 16h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function toLatLng([lng, lat]: MapCoordinates): L.LatLngTuple {
  return [lat, lng];
}

function createLandmarkIcon(name: string, unlocked: boolean, selected: boolean, tier = 1): L.DivIcon {
  const element = document.createElement('div');
  element.className = `vesluma-landmark-pin tier-${tier}${unlocked ? ' is-unlocked' : ''}${selected ? ' is-selected' : ''}`;
  element.innerHTML = landmarkSvg;
  element.setAttribute('aria-label', name);
  return L.divIcon({
    html: element,
    className: 'vesluma-landmark-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function createPositionIcon(): L.DivIcon {
  const element = document.createElement('span');
  element.className = 'vesluma-position-dot';
  element.setAttribute('aria-label', '最近位置');
  return L.divIcon({ html: element, className: 'vesluma-position-marker', iconSize: [22, 22], iconAnchor: [11, 11] });
}

function fitCity(map: L.Map, city: ExploreMapCity, compact: boolean, overlayBottom: number): void {
  const coordinates = city.boundary?.coordinates.flat(2) ?? city.regions.flatMap(region => regionPolygons(region).flat(2));
  const landmarks = city.landmarks.map(landmark => landmark.coordinates);
  const allCoordinates = compact && landmarks.length ? landmarks : [...coordinates, ...landmarks];
  if (allCoordinates.length) {
    map.fitBounds(L.latLngBounds(allCoordinates.map(toLatLng)), {
      paddingTopLeft: [28, compact ? 34 : overlayBottom === 0 ? 20 : 65],
      paddingBottomRight: [42, compact ? 34 : overlayBottom === 0 ? 25 : overlayBottom + 35],
      maxZoom: city.zoom,
      animate: false,
    });
  } else map.setView(toLatLng(city.center), city.zoom, { animate: false });
}

function focusPosition(map: L.Map, position: { lat: number; lng: number }, zoom: number, compact: boolean, overlayBottom: number): void {
  map.setView([position.lat, position.lng], zoom, { animate: false });
  if (compact) return;
  const mapHeight = map.getSize().y;
  const visibleHeight = Math.max(1, mapHeight - overlayBottom);
  // Leave room below the user for the city ahead and the collapsed sheet.
  map.panBy([0, mapHeight / 2 - visibleHeight * 0.28], { animate: false });
}

function resolveTiles(): { url: string; options: L.TileLayerOptions; provider: string } {
  const environment = (import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }).env;
  const key = typeof environment?.VITE_CARTO_API_KEY === 'string' ? environment.VITE_CARTO_API_KEY.trim() : '';
  const customUrl = typeof environment?.VITE_MAP_TILE_URL === 'string' ? environment.VITE_MAP_TILE_URL.trim() : '';
  const osmAttribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
  if (customUrl) {
    const customAttribution = typeof environment?.VITE_MAP_ATTRIBUTION === 'string' ? environment.VITE_MAP_ATTRIBUTION : '';
    return {
      url: customUrl,
      options: {
        maxZoom: 19,
        // The bundled skeleton remains OSM data even with a custom raster source.
        attribution: customAttribution.includes('openstreetmap.org') ? customAttribution : [customAttribution, osmAttribution].filter(Boolean).join(', '),
        updateWhenIdle: true,
        keepBuffer: 1,
      },
      provider: '自定义底图',
    };
  }
  if (key) {
    return {
      url: `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
      options: {
        maxZoom: 20,
        attribution: `${osmAttribution}, © <a href="https://carto.com/attribution/" target="_blank" rel="noreferrer">CARTO</a>`,
        // CARTO's {r} serves @2x tiles without issuing four requests per tile.
        detectRetina: false,
        updateWhenIdle: true,
        keepBuffer: 1,
      },
      provider: 'CARTO · WGS84',
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: osmAttribution,
      detectRetina: false,
      updateWhenIdle: true,
      keepBuffer: 1,
      referrerPolicy: 'strict-origin-when-cross-origin',
    },
    provider: 'OpenStreetMap · WGS84',
  };
}

function MapControlIcon({ kind }: { kind: 'fit' | 'locate' | 'plus' | 'minus' }) {
  if (kind === 'plus' || kind === 'minus') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={kind === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'} /></svg>;
  }
  if (kind === 'locate') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /><path d="m8 12 4-4 4 4-4 4z" /></svg>;
}

function MapNorth({ theme }: { theme: MapTheme }) {
  return <div className={`vesluma-map-north${theme === 'treasure' ? ' is-treasure' : ''}`} role="img" aria-label="地图上方为北">
    <span>N</span>
    {theme === 'treasure' ? <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13.5" /><path d="M20 1v38M1 20h38M9 9l22 22M9 31 31 9" className="compass-rose-lines" /><path d="m20 3 5 17-5 5-5-5z" className="compass-north" /><path d="m20 37 5-17-5 5-5-5z" className="compass-south" /></svg>
      : <svg viewBox="0 0 28 34" aria-hidden="true"><path d="m14 2 10 29-10-7-10 7z" className="compass-north" /><path d="M14 2v22l10 7z" className="compass-south" /></svg>}
  </div>;
}

export const ExploreMap = memo(function ExploreMap({
  city,
  unlockedRegionIds,
  points,
  position,
  selectedLandmarkId,
  visitedLandmarkIds,
  onSelectLandmark,
  recenterKey = 0,
  fitKey = 0,
  compact = false,
  mapTheme = 'paper',
  overlayBottom = 190,
  showRegionPlan = false,
  focusRegionId,
}: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fogRef = useRef<SkeletonLayer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LayerGroup | null>(null);
  const positionRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const regionsRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectLandmark);
  const cityRef = useRef(city);
  const focusedCitiesRef = useRef(new Set<string>());
  const [tileState, setTileState] = useState<TileState>('loading');
  const [provider, setProvider] = useState('WGS84');
  const [mapZoom, setMapZoom] = useState(city.zoom);
  const [skeletonRetryKey, setSkeletonRetryKey] = useState(0);
  const [skeletonState, setSkeletonState] = useState<{ cityId: string; skeleton: MapSkeleton | null; status: SkeletonStatus }>(() => {
    const skeleton = getCitySkeleton(city.id);
    return { cityId: city.id, skeleton, status: skeleton ? 'ready' : 'loading' };
  });
  const skeleton = skeletonState.cityId === city.id ? skeletonState.skeleton : null;
  const skeletonStatus = skeletonState.cityId === city.id ? skeletonState.status : 'loading';
  onSelectRef.current = onSelectLandmark;
  cityRef.current = city;

  useEffect(() => {
    let cancelled = false;
    const cached = getCitySkeleton(city.id);
    setSkeletonState({ cityId: city.id, skeleton: cached, status: cached ? 'ready' : 'loading' });
    loadCitySkeleton(city.id).then(loaded => {
      if (!cancelled) setSkeletonState({ cityId: city.id, skeleton: loaded, status: loaded ? 'ready' : 'error' });
    }).catch(() => {
      if (!cancelled) setSkeletonState({ cityId: city.id, skeleton: null, status: 'error' });
    });
    return () => { cancelled = true; };
  }, [city.id, skeletonRetryKey]);

  useEffect(() => {
    if (!containerRef.current) return;
    const initialCity = cityRef.current;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      fadeAnimation: false,
      minZoom: 7,
      zoomSnap: 0.25,
      zoomDelta: 1,
      maxZoom: 19,
      preferCanvas: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      tapTolerance: 20,
    }).setView(toLatLng(initialCity.center), initialCity.zoom);
    mapRef.current = map;
    map.on('zoomend', () => setMapZoom(map.getZoom()));
    map.createPane('fogPane').style.zIndex = '450';
    map.getPane('fogPane')!.style.pointerEvents = 'none';
    map.createPane('samplePane').style.zIndex = '510';
    map.getPane('samplePane')!.style.pointerEvents = 'none';
    map.createPane('locationPane').style.zIndex = '660';
    map.getPane('locationPane')!.style.pointerEvents = 'none';
    const tileConfig = resolveTiles();
    setProvider(tileConfig.provider);
    const tiles = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    tilesRef.current = tiles;
    const attribution = L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
    attribution.getContainer()?.setAttribute('aria-label', '地图数据版权');
    let errors = 0;
    let successfulTiles = 0;
    tiles.on('loading', () => { errors = 0; successfulTiles = 0; setTileState('loading'); });
    tiles.on('tileload', () => { successfulTiles += 1; });
    tiles.on('tileerror', () => { errors += 1; });
    tiles.on('load', () => {
      setTileState(errors ? (successfulTiles ? 'partial' : 'unavailable') : 'ready');
    });
    fogRef.current = new SkeletonLayer().addTo(map);
    map.createPane('regionPane').style.zIndex = '470';
    regionsRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    pointsRef.current = L.layerGroup().addTo(map);
    positionRef.current = L.layerGroup().addTo(map);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      // StrictMode replays effects with the same refs; a recreated Leaflet map
      // must be allowed to focus its first position again.
      focusedCitiesRef.current.clear();
      mapRef.current = null;
      fogRef.current = null;
      markersRef.current = null;
      pointsRef.current = null;
      positionRef.current = null;
      tilesRef.current = null;
      regionsRef.current = null;
    };
  }, []);

  useEffect(() => {
    focusedCitiesRef.current.delete(city.id);
    if (mapRef.current) fitCity(mapRef.current, city, compact, overlayBottom);
  }, [city.id, city.center[0], city.center[1], city.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (compact || !map || !position || focusedCitiesRef.current.has(city.id)) return;
    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)
      || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) return;
    focusedCitiesRef.current.add(city.id);
    focusPosition(map, position, city.zoom, false, overlayBottom);
  }, [city.id, city.zoom, position?.lat, position?.lng, compact, overlayBottom]);

  useEffect(() => {
    fogRef.current?.setContent({ regions: city.regions, boundary: city.boundary, unlockedRegionIds, skeleton, dataStatus: skeletonStatus, theme: mapTheme, landmarks: city.landmarks, compact });
  }, [city.id, city.regions, city.landmarks, unlockedRegionIds, skeleton, skeletonStatus, mapTheme, compact]);

  useEffect(() => {
    const group = regionsRef.current;
    if (!group) return;
    group.clearLayers();
    const colors = ['#358673', '#be8851', '#808f51', '#748dba', '#b77c73', '#6e9d9d'];
    const selectedRegion = focusRegionId ?? city.landmarks.find(l => l.id === selectedLandmarkId)?.regionId;
    city.regions.filter(r => !r.legacy).forEach((region, index) => {
      if (!showRegionPlan && region.id !== selectedRegion) return;
      const selected = region.id === selectedRegion;
      const layer = L.polygon(regionPolygons(region).map(p => p.map(r => r.map(toLatLng))), {
        pane: 'regionPane', color: selected ? JADE : colors[index % colors.length], weight: selected ? 2.5 : 1.2,
        fillOpacity: showRegionPlan ? selected ? 0.18 : 0.12 : 0, interactive: showRegionPlan,
      }).addTo(group);
      if (region.name) layer.bindTooltip(region.name, { sticky: true });
      if (showRegionPlan) layer.on('click', () => {
        const anchor = city.landmarks.find(l => l.tier === 1 && l.regionId === region.id);
        if (anchor) onSelectRef.current(anchor.id);
      });
    });
  }, [city.regions, city.landmarks, showRegionPlan, selectedLandmarkId, focusRegionId]);

  useEffect(() => {
    const map = mapRef.current;
    const region = city.regions.find(r => r.id === focusRegionId);
    if (map && region) map.fitBounds(L.latLngBounds(regionPolygons(region).flat(2).map(toLatLng)), { padding: [30, 35], maxZoom: 13, animate: false });
  }, [city.id, focusRegionId]);

  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    const unlocked = new Set(unlockedRegionIds);
    const map = mapRef.current!;
    const clustered = new Set<string>();
    if (!compact && mapZoom < 11) {
      const candidates = city.landmarks.filter(l => (l.tier ?? 1) === 1 && l.id !== selectedLandmarkId);
      for (const candidate of candidates) {
        if (clustered.has(candidate.id)) continue;
        const pixel = map.latLngToLayerPoint(toLatLng(candidate.coordinates));
        const members = candidates.filter(l => !clustered.has(l.id)
          && pixel.distanceTo(map.latLngToLayerPoint(toLatLng(l.coordinates))) < 27);
        if (members.length < 2) continue;
        members.forEach(l => clustered.add(l.id));
        const label = `${members.length} 处开图地标，点击展开`;
        const element = document.createElement('span');
        element.className = 'vesluma-marker-cluster';
        element.textContent = String(members.length);
        const marker = L.marker(toLatLng(candidate.coordinates), { title: label,
          icon: L.divIcon({ html: element, className: 'vesluma-cluster-marker', iconSize: [30, 30], iconAnchor: [15, 15] }),
        }).addTo(group);
        marker.bindTooltip(label);
        marker.on('click', () => map.fitBounds(L.latLngBounds(members.map(l => toLatLng(l.coordinates))), { padding: [50, 60], maxZoom: 13, animate: false }));
      }
    }
    for (const landmark of city.landmarks) {
      if (clustered.has(landmark.id)) continue;
      const selected = selectedLandmarkId === landmark.id;
      if (!selected && !compact && (landmark.tier ?? 1) > 1 && (showRegionPlan || mapZoom < 13)) continue;
      const revealed = visitedLandmarkIds
        ? visitedLandmarkIds.includes(landmark.id)
        : isPointUnlocked(landmark.coordinates, city.regions, unlocked);
      const marker = L.marker(toLatLng(landmark.coordinates), {
        icon: createLandmarkIcon(landmark.name, revealed, selected, landmark.tier),
        title: landmark.name,
        keyboard: true,
        zIndexOffset: selected ? 500 : 0,
      });
      const label = document.createElement('span');
      label.textContent = landmark.name;
      marker.bindTooltip(label, {
        permanent: compact || mapZoom >= 13 || selected,
        direction: 'bottom',
        offset: [0, 12],
        className: `vesluma-map-label${selected ? ' is-selected' : ''}`,
        opacity: 1,
      });
      marker.on('click', () => onSelectRef.current(landmark.id));
      marker.addTo(group);
      marker.getElement()?.classList.toggle('is-small', !compact && mapZoom < 14);
    }
  }, [city.landmarks, city.regions, unlockedRegionIds, selectedLandmarkId, visitedLandmarkIds, mapZoom, compact, showRegionPlan]);

  useEffect(() => {
    const group = pointsRef.current;
    if (!group) return;
    group.clearLayers();
    for (const point of points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      L.circleMarker([point.lat, point.lng], {
        pane: 'samplePane',
        radius: compact ? 2.3 : 3,
        color: '#fff',
        weight: 1.2,
        fillColor: JADE,
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(group);
    }
  }, [points, compact]);

  useEffect(() => {
    const group = positionRef.current;
    if (!group) return;
    group.clearLayers();
    if (!position) return;
    if (position.accuracy && position.accuracy > 0 && position.accuracy <= 1000) {
      L.circle([position.lat, position.lng], {
        pane: 'locationPane',
        radius: position.accuracy,
        stroke: false,
        fillColor: JADE,
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(group);
    }
    L.marker([position.lat, position.lng], {
      pane: 'locationPane',
      icon: createPositionIcon(),
      interactive: false,
      keyboard: false,
      title: '最近有效位置',
    }).addTo(group);
  }, [position]);

  useEffect(() => {
    if (recenterKey && position && mapRef.current) {
      focusPosition(mapRef.current, position, Math.max(city.zoom, mapRef.current.getZoom()), compact, overlayBottom);
    }
  }, [recenterKey]);

  useEffect(() => {
    if (fitKey && mapRef.current) fitCity(mapRef.current, city, compact, overlayBottom);
  }, [fitKey]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    if (position) focusPosition(map, position, Math.max(map.getZoom(), city.zoom), compact, overlayBottom);
    else map.setView(toLatLng(city.center), city.zoom, { animate: false });
  }

  function retryTiles() {
    setTileState('loading');
    tilesRef.current?.redraw();
  }

  return <div className={`vesluma-map${compact ? ' is-compact' : ''}`} data-map-provider={provider} data-map-theme={mapTheme} data-map-zoom={mapZoom} data-skeleton-status={skeletonStatus}>
    <div ref={containerRef} className="vesluma-map-surface" aria-label={`${city.name}探索地图，可拖动和缩放`} />
    {!compact ? <MapNorth theme={mapTheme} /> : null}
    {skeletonStatus !== 'ready' ? <div className="vesluma-skeleton-status" role="status">
      <span>{skeletonStatus === 'loading' ? '主干道正在加载' : '主干道数据暂未加载'}</span>
      {skeletonStatus === 'error' ? <button type="button" onClick={() => setSkeletonRetryKey(key => key + 1)}>重试</button> : null}
    </div> : null}
    {skeletonStatus === 'ready' && tileState === 'loading' && unlockedRegionIds.length > 0
      ? <div className="vesluma-skeleton-status" role="status">详细底图正在加载</div> : null}
    <div className="vesluma-map-controls" aria-label="地图操作">
      <button type="button" aria-label="查看全市范围" title="查看全市范围" onClick={() => mapRef.current && fitCity(mapRef.current, city, compact, overlayBottom)}><MapControlIcon kind="fit" /></button>
      <div className="vesluma-zoom-controls">
        <button type="button" aria-label="放大地图" title="放大地图" onClick={() => mapRef.current?.zoomIn()}><MapControlIcon kind="plus" /></button>
        <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => mapRef.current?.zoomOut()}><MapControlIcon kind="minus" /></button>
      </div>
      <button type="button" className="vesluma-locate-control" aria-label={position ? '回到最近位置' : '回到城市中心'} title={position ? '回到最近位置' : '回到城市中心'} onClick={recenter}><MapControlIcon kind="locate" /></button>
    </div>
    {unlockedRegionIds.length > 0 && (tileState === 'unavailable' || tileState === 'partial') ? <div className="vesluma-map-error" role="status">
      <span>{tileState === 'partial' ? '部分底图暂未加载' : '底图暂未加载'} · 地标与记录可查看</span>
      <button type="button" onClick={retryTiles}>重试</button>
    </div> : null}
  </div>;
});

export default ExploreMap;
