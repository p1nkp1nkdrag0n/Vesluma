import { memo, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';

export type MapCoordinates = [lng: number, lat: number];

export interface ExploreMapCity {
  id: string;
  name: string;
  center: MapCoordinates;
  zoom: number;
  landmarks: { id: string; name: string; coordinates: MapCoordinates }[];
  regions: { id: string; polygon: MapCoordinates[] }[];
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
}

type TileState = 'loading' | 'ready' | 'partial' | 'unavailable';
type FogRegion = ExploreMapCity['regions'][number];

const FOG_COLOR = '#edf2ef';
const OUTSIDE_COLOR = '#e7ede9';
const JADE = '#218675';
const FOG_MARGIN = 192;
const landmarkSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h16M6 9l6-4 6 4M7 10v8m5-8v8m5-8v8M4 19h16M6 16h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function toLatLng([lng, lat]: MapCoordinates): L.LatLngTuple {
  return [lat, lng];
}

/** Ray casting is only used to label markers; the fog uses polygon union compositing. */
function containsPoint(point: MapCoordinates, polygon: MapCoordinates[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[j];
    if ((y1 > point[1]) !== (y2 > point[1])
      && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * An opaque viewport canvas, above all tiles and below records. Clearing each
 * unlocked polygon produces the union of holes, including overlapping regions.
 * Overscan keeps pan edges covered; nonanimated zoom prevents transient leaks.
 */
class FogLayer extends L.Layer {
  private leafletMap: L.Map | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private outsideCanvas: HTMLCanvasElement | null = null;
  private regions: FogRegion[] = [];
  private unlocked = new Set<string>();
  private animationFrame = 0;

  onAdd(map: L.Map): this {
    this.leafletMap = map;
    this.canvas = L.DomUtil.create('canvas', 'vesluma-fog-canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.outsideCanvas = document.createElement('canvas');
    map.getPane('fogPane')!.appendChild(this.canvas);
    map.on('move zoom resize viewreset', this.scheduleDraw, this);
    this.draw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off('move zoom resize viewreset', this.scheduleDraw, this);
    cancelAnimationFrame(this.animationFrame);
    this.canvas?.remove();
    this.canvas = null;
    this.outsideCanvas = null;
    this.leafletMap = null;
    return this;
  }

  setRegions(regions: FogRegion[], unlockedRegionIds: string[]): void {
    this.regions = regions;
    this.unlocked = new Set(unlockedRegionIds);
    // Rights changes must be painted before a subsequent interaction frame.
    this.draw();
  }

  private scheduleDraw = (): void => {
    if (this.animationFrame) return;
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = 0;
      this.draw();
    });
  };

  private traceRegion(context: CanvasRenderingContext2D, region: FogRegion): void {
    const map = this.leafletMap!;
    context.beginPath();
    region.polygon.forEach((coordinate, index) => {
      const point = map.latLngToContainerPoint(toLatLng(coordinate));
      if (index === 0) context.moveTo(point.x + FOG_MARGIN, point.y + FOG_MARGIN);
      else context.lineTo(point.x + FOG_MARGIN, point.y + FOG_MARGIN);
    });
    context.closePath();
  }

  private draw(): void {
    const map = this.leafletMap;
    const canvas = this.canvas;
    const outsideCanvas = this.outsideCanvas;
    if (!map || !canvas || !outsideCanvas) return;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const width = size.x + FOG_MARGIN * 2;
    const height = size.y + FOG_MARGIN * 2;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.ceil(width * ratio);
    const pixelHeight = Math.ceil(height * ratio);
    for (const surface of [canvas, outsideCanvas]) {
      if (surface.width !== pixelWidth || surface.height !== pixelHeight) {
        surface.width = pixelWidth;
        surface.height = pixelHeight;
      }
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([-FOG_MARGIN, -FOG_MARGIN]));
    const context = canvas.getContext('2d')!;
    const outsideContext = outsideCanvas.getContext('2d')!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    outsideContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    context.fillStyle = FOG_COLOR;
    context.fillRect(0, 0, width, height);

    // Fine decorative grain is deliberately unrelated to roads or geography.
    context.fillStyle = '#dfe7e1';
    for (let y = 6; y < height; y += 24) {
      for (let x = (y % 48 === 6 ? 6 : 18); x < width; x += 24) {
        context.fillRect(x, y, 1, 1);
      }
    }
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000';
    for (const region of this.regions) {
      if (!this.unlocked.has(region.id) || region.polygon.length < 3) continue;
      this.traceRegion(context, region);
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';

    // Outside the configured UNION stays opaque and has a distinct texture.
    outsideContext.globalCompositeOperation = 'source-over';
    outsideContext.clearRect(0, 0, width, height);
    outsideContext.fillStyle = OUTSIDE_COLOR;
    outsideContext.fillRect(0, 0, width, height);
    outsideContext.strokeStyle = '#dbe4dd';
    outsideContext.lineWidth = 0.7;
    outsideContext.beginPath();
    for (let x = -height; x < width; x += 15) {
      outsideContext.moveTo(x, height);
      outsideContext.lineTo(x + height, 0);
    }
    outsideContext.stroke();
    outsideContext.globalCompositeOperation = 'destination-out';
    outsideContext.fillStyle = '#000';
    for (const region of this.regions) {
      if (region.polygon.length < 3) continue;
      this.traceRegion(outsideContext, region);
      outsideContext.fill();
    }
    outsideContext.globalCompositeOperation = 'source-over';
    // Draw the secondary surface at CSS dimensions after its device-scale paint.
    context.drawImage(outsideCanvas, 0, 0, pixelWidth, pixelHeight, 0, 0, width, height);

    context.lineWidth = 1;
    for (const region of this.regions) {
      if (region.polygon.length < 3) continue;
      this.traceRegion(context, region);
      const unlocked = this.unlocked.has(region.id);
      context.strokeStyle = unlocked ? '#83b7a9' : '#d0ded5';
      context.setLineDash(unlocked ? [] : [3, 7]);
      context.stroke();
    }
    context.setLineDash([]);
    context.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.fillStyle = '#8d9e93';
    // Labels appear only where the sampled location is outside configured areas.
    for (let y = 90; y < size.y; y += 270) {
      for (let x = 100; x < size.x; x += 270) {
        const location = map.containerPointToLatLng([x, y]);
        const point: MapCoordinates = [location.lng, location.lat];
        if (!this.regions.some(region => containsPoint(point, region.polygon))) {
          context.fillText('尚未纳入试验', x + FOG_MARGIN, y + FOG_MARGIN);
        }
      }
    }
  }
}

function createLandmarkIcon(name: string, unlocked: boolean, selected: boolean): L.DivIcon {
  const element = document.createElement('div');
  element.className = `vesluma-landmark-pin${unlocked ? ' is-unlocked' : ''}${selected ? ' is-selected' : ''}`;
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

function fitCity(map: L.Map, city: ExploreMapCity, compact: boolean): void {
  const coordinates = city.regions.flatMap(region => region.polygon);
  const landmarks = city.landmarks.map(landmark => landmark.coordinates);
  const allCoordinates = compact ? landmarks : [...coordinates, ...landmarks];
  if (allCoordinates.length) {
    map.fitBounds(L.latLngBounds(allCoordinates.map(toLatLng)), {
      paddingTopLeft: [42, compact ? 34 : 65],
      paddingBottomRight: [52, compact ? 34 : 285],
      maxZoom: city.zoom,
      animate: false,
    });
  } else map.setView(toLatLng(city.center), city.zoom, { animate: false });
}

function resolveTiles(): { url: string; options: L.TileLayerOptions; provider: string } {
  const environment = (import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }).env;
  const key = typeof environment?.VITE_CARTO_API_KEY === 'string' ? environment.VITE_CARTO_API_KEY.trim() : '';
  const customUrl = typeof environment?.VITE_MAP_TILE_URL === 'string' ? environment.VITE_MAP_TILE_URL.trim() : '';
  const osmAttribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
  if (customUrl) {
    return {
      url: customUrl,
      options: {
        maxZoom: 19,
        attribution: typeof environment?.VITE_MAP_ATTRIBUTION === 'string' ? environment.VITE_MAP_ATTRIBUTION : osmAttribution,
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
}: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fogRef = useRef<FogLayer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LayerGroup | null>(null);
  const positionRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const onSelectRef = useRef(onSelectLandmark);
  const cityRef = useRef(city);
  const [tileState, setTileState] = useState<TileState>('loading');
  const [provider, setProvider] = useState('WGS84');
  const [mapZoom, setMapZoom] = useState(city.zoom);
  onSelectRef.current = onSelectLandmark;
  cityRef.current = city;

  useEffect(() => {
    if (!containerRef.current) return;
    const initialCity = cityRef.current;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      fadeAnimation: false,
      minZoom: 10,
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
    tiles.on('loading', () => { errors = 0; successfulTiles = 0; });
    tiles.on('tileload', () => { successfulTiles += 1; setTileState('ready'); });
    tiles.on('tileerror', () => { errors += 1; });
    tiles.on('load', () => {
      setTileState(errors ? (successfulTiles ? 'partial' : 'unavailable') : 'ready');
    });
    fogRef.current = new FogLayer().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    pointsRef.current = L.layerGroup().addTo(map);
    positionRef.current = L.layerGroup().addTo(map);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      fogRef.current = null;
      markersRef.current = null;
      pointsRef.current = null;
      positionRef.current = null;
      tilesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) fitCity(mapRef.current, city, compact);
  }, [city.id, city.center[0], city.center[1], city.zoom]);

  useEffect(() => {
    fogRef.current?.setRegions(city.regions, unlockedRegionIds);
  }, [city.regions, unlockedRegionIds]);

  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    const unlocked = new Set(unlockedRegionIds);
    const regions = city.regions.filter(region => unlocked.has(region.id));
    for (const landmark of city.landmarks) {
      const revealed = visitedLandmarkIds
        ? visitedLandmarkIds.includes(landmark.id)
        : regions.some(region => containsPoint(landmark.coordinates, region.polygon));
      const selected = selectedLandmarkId === landmark.id;
      const marker = L.marker(toLatLng(landmark.coordinates), {
        icon: createLandmarkIcon(landmark.name, revealed, selected),
        title: landmark.name,
        keyboard: true,
        zIndexOffset: selected ? 500 : 0,
      });
      const label = document.createElement('span');
      label.textContent = landmark.name;
      marker.bindTooltip(label, {
        permanent: compact || mapZoom >= 14 || landmark.id === city.landmarks[0]?.id || selected,
        direction: 'bottom',
        offset: [0, 12],
        className: `vesluma-map-label${selected ? ' is-selected' : ''}`,
        opacity: 1,
      });
      marker.on('click', () => onSelectRef.current(landmark.id));
      marker.addTo(group);
      marker.getElement()?.classList.toggle('is-small', !compact && mapZoom < 14);
    }
  }, [city.landmarks, city.regions, unlockedRegionIds, selectedLandmarkId, visitedLandmarkIds, mapZoom, compact]);

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
      mapRef.current.setView([position.lat, position.lng], Math.max(city.zoom, mapRef.current.getZoom()), { animate: false });
    }
  }, [recenterKey]);

  useEffect(() => {
    if (fitKey && mapRef.current) fitCity(mapRef.current, city, compact);
  }, [fitKey]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    if (position) map.setView([position.lat, position.lng], Math.max(map.getZoom(), city.zoom), { animate: false });
    else map.setView(toLatLng(city.center), city.zoom, { animate: false });
  }

  function retryTiles() {
    setTileState('loading');
    tilesRef.current?.redraw();
  }

  return <div className={`vesluma-map${compact ? ' is-compact' : ''}`} data-map-provider={provider}>
    <div ref={containerRef} className="vesluma-map-surface" aria-label={`${city.name}探索地图，可拖动和缩放`} />
    <div className="vesluma-map-controls" aria-label="地图操作">
      <button type="button" aria-label="查看城市试验范围" title="查看城市试验范围" onClick={() => mapRef.current && fitCity(mapRef.current, city, compact)}><MapControlIcon kind="fit" /></button>
      <div className="vesluma-zoom-controls">
        <button type="button" aria-label="放大地图" title="放大地图" onClick={() => mapRef.current?.zoomIn()}><MapControlIcon kind="plus" /></button>
        <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => mapRef.current?.zoomOut()}><MapControlIcon kind="minus" /></button>
      </div>
      <button type="button" className="vesluma-locate-control" aria-label={position ? '回到最近位置' : '回到城市中心'} title={position ? '回到最近位置' : '回到城市中心'} onClick={recenter}><MapControlIcon kind="locate" /></button>
    </div>
    {tileState === 'unavailable' || tileState === 'partial' ? <div className="vesluma-map-error" role="status">
      <span>{tileState === 'partial' ? '部分底图暂未加载' : '底图暂未加载'} · 地标与记录可查看</span>
      <button type="button" onClick={retryTiles}>重试</button>
    </div> : null}
  </div>;
});

export default ExploreMap;
