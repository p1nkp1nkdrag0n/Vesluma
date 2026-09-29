import L from 'leaflet';
import type { MapSkeleton, SkeletonRoad } from '../data/map';
import { chooseRoadLabels, clipSegment, containsPoint, polygonIntersectsBox, roadLabelBox, roadRestriction } from './mapGeometry';
import type { LabelBox, MapCoordinates, MapRegion, MapTheme, PixelPoint, RoadLabelCandidate } from './mapGeometry';

const MARGIN = 192;
const THEMES = {
  paper: { land: '#f4f0e7', road: '#819186', roadFill: '#fcfaf3', label: '#59665d', water: '#c1dce2',
    waterEdge: '#a4c6cc', waterLabel: '#668f98', boundary: '#c6c7b8', outside: '#8b8c7e', textureAlpha: 0.26 },
  treasure: { land: '#f2e6cc', road: '#795f41', roadFill: '#f7edd8', label: '#67543c', water: '#bdd2cb',
    waterEdge: '#99b8ad', waterLabel: '#608b85', boundary: '#c9b38f', outside: '#9b8261', textureAlpha: 0.56 },
} as const;

interface Content {
  regions: MapRegion[];
  unlockedRegionIds: string[];
  skeleton: MapSkeleton | null;
  dataStatus?: 'loading' | 'ready' | 'error';
  theme: MapTheme;
  landmarks: { coordinates: MapCoordinates }[];
  compact: boolean;
}

function toLatLng([lng, lat]: MapCoordinates): L.LatLngTuple { return [lat, lng]; }

function roadPriority(road: SkeletonRoad): number {
  if (road.highway.startsWith('motorway') || road.highway.startsWith('trunk')) return 8;
  if (road.highway.startsWith('primary')) return 7;
  return 6;
}

function roadLevel(road: SkeletonRoad): number {
  const layer = road.layer ?? (road.tunnel ? -1 : road.bridge ? 1 : 0);
  return layer * 10 + (road.tunnel ? -1 : road.bridge ? 1 : 0);
}

/** Midpoint of the longest continuous visible part, following its actual tangent. */
function lineLabelAnchor(points: PixelPoint[], box: LabelBox): { point: PixelPoint; angle: number; length: number } | null {
  const runs: { segments: [PixelPoint, PixelPoint][]; length: number }[] = [];
  let current: typeof runs[number] | null = null;
  let lastEnd: PixelPoint | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const segment = clipSegment(points[i - 1], points[i], box);
    if (!segment) { current = null; lastEnd = null; continue; }
    const length = Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y);
    if (length < 0.01) continue;
    if (!current || !lastEnd || Math.hypot(lastEnd.x - segment[0].x, lastEnd.y - segment[0].y) > 0.5) {
      current = { segments: [], length: 0 };
      runs.push(current);
    }
    current.segments.push(segment);
    current.length += length;
    lastEnd = segment[1];
  }
  const best = runs.reduce<typeof runs[number] | null>((a, b) => !a || b.length > a.length ? b : a, null);
  if (!best) return null;
  let remaining = best.length / 2;
  for (const [a, b] of best.segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length) {
      let angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      return { point: { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length }, angle, length: best.length };
    }
    remaining -= length;
  }
  return null;
}

/**
 * The entire theme is one opaque canvas above the true raster tiles. The final
 * operation erases each unlocked polygon: overlapping rights form a UNION, and
 * no texture, road, water, label or boundary can cover the detailed map holes.
 */
export class SkeletonLayer extends L.Layer {
  private leafletMap: L.Map | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private content: Content = { regions: [], unlockedRegionIds: [], skeleton: null, theme: 'paper', landmarks: [], compact: false };
  private textures: Partial<Record<MapTheme, HTMLImageElement>> = {};
  private orderedRoads: SkeletonRoad[] = [];

  onAdd(map: L.Map): this {
    this.leafletMap = map;
    this.canvas = L.DomUtil.create('canvas', 'vesluma-fog-canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    map.getPane('fogPane')!.appendChild(this.canvas);
    // Paint within the same move event. Deferring a frame can expose tile edges
    // during a fast drag, before the overscan canvas has been repositioned.
    map.on('move zoom resize viewreset', this.draw, this);
    for (const theme of ['paper', 'treasure'] as const) {
      const texture = new Image();
      texture.onload = () => { this.textures[theme] = texture; this.draw(); };
      texture.src = `${import.meta.env.BASE_URL}images/map-${theme}-texture.webp`;
    }
    this.draw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off('move zoom resize viewreset', this.draw, this);
    this.canvas?.remove();
    this.canvas = null;
    this.leafletMap = null;
    return this;
  }

  setContent(content: Content): void {
    if (content.skeleton !== this.content.skeleton) {
      this.orderedRoads = [...content.skeleton?.roads ?? []].sort((a, b) => roadLevel(a) - roadLevel(b));
    }
    this.content = content;
    this.draw();
  }

  private project(coordinate: MapCoordinates): PixelPoint {
    const point = this.leafletMap!.latLngToContainerPoint(toLatLng(coordinate));
    return { x: point.x + MARGIN, y: point.y + MARGIN };
  }

  private trace(context: CanvasRenderingContext2D, coordinates: MapCoordinates[], close: boolean, begin = true): void {
    if (begin) context.beginPath();
    coordinates.forEach((coordinate, index) => {
      const point = this.project(coordinate);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    if (close) context.closePath();
  }

  private draw(): void {
    const map = this.leafletMap;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const width = size.x + MARGIN * 2;
    const height = size.y + MARGIN * 2;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.ceil(width * ratio) || canvas.height !== Math.ceil(height * ratio)) {
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([-MARGIN, -MARGIN]));
    const context = canvas.getContext('2d')!;
    const { regions, unlockedRegionIds, skeleton, dataStatus, theme, landmarks, compact } = this.content;
    const palette = THEMES[theme];
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
    context.fillStyle = palette.land;
    context.fillRect(0, 0, width, height);
    const texture = this.textures[theme];
    if (texture) {
      const pattern = context.createPattern(texture, 'repeat');
      if (pattern) {
        // Keep paper grain stable with respect to map panning; roads remain
        // exactly projected WGS84 geometry, regardless of the texture.
        const origin = map.project(map.containerPointToLatLng([0, 0]), map.getZoom());
        pattern.setTransform(new DOMMatrix().translate(MARGIN - origin.x % texture.width, MARGIN - origin.y % texture.height));
        context.fillStyle = pattern;
        context.globalAlpha = palette.textureAlpha;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
      }
    }

    const viewport: LabelBox = { left: MARGIN + 25, top: MARGIN + 74, right: MARGIN + size.x - 50, bottom: MARGIN + size.y - (compact ? 25 : 145) };
    const labels: RoadLabelCandidate[] = [];
    const unlocked = new Set(unlockedRegionIds);
    const unlockedPolygons = regions.filter(region => unlocked.has(region.id)).map(region => region.polygon.map(p => this.project(p)));
    const obstacles = landmarks.map(landmark => {
      const point = this.project(landmark.coordinates);
      return { left: point.x - 40, right: point.x + 40, top: point.y - 22, bottom: point.y + 41 };
    });

    if (skeleton) {
      const [west, south, east, north] = skeleton.bounds;
      const nw = this.project([west, north]);
      const se = this.project([east, south]);
      context.save();
      context.beginPath();
      context.rect(nw.x, nw.y, se.x - nw.x, se.y - nw.y);
      context.clip();
      // Trial boundaries live under the skeleton and are also erased by rights.
      context.strokeStyle = palette.boundary;
      context.lineWidth = 0.8;
      context.setLineDash([2, 8]);
      for (const region of regions) {
        if (region.polygon.length < 3 || unlocked.has(region.id)) continue;
        this.trace(context, region.polygon, true);
        context.stroke();
      }
      context.setLineDash([]);

      for (const water of skeleton.water) {
        context.beginPath();
        water.rings.forEach(ring => this.trace(context, ring, true, false));
        context.fillStyle = palette.water;
        context.fill('evenodd');
        context.strokeStyle = palette.waterEdge;
        context.lineWidth = 0.8;
        context.stroke();
        const ring = water.rings[0];
        if (water.name && ring?.length > 2) {
          const longitudes = ring.map(p => p[0]);
          const latitudes = ring.map(p => p[1]);
          const center: MapCoordinates = [(Math.min(...longitudes) + Math.max(...longitudes)) / 2, (Math.min(...latitudes) + Math.max(...latitudes)) / 2];
          if (containsPoint(center, ring) && !water.rings.slice(1).some(hole => containsPoint(center, hole))) {
            const point = this.project(center);
            const extent = ring.map(p => this.project(p));
            const waterWidth = Math.max(...extent.map(p => p.x)) - Math.min(...extent.map(p => p.x));
            if (waterWidth > 80) labels.push({ id: `water:${water.id}`, name: water.name, ...point, angle: 0, width: water.name.length * 13, height: 14, priority: 100 });
          }
        }
      }
      const metresPerPixel = map.distance(map.getCenter(), map.containerPointToLatLng([size.x / 2 + 1, size.y / 2]));
      for (const river of skeleton.waterLines ?? []) {
        this.trace(context, river.coordinates, false);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = palette.water;
        context.lineWidth = river.widthMetres ? Math.max(1.5, Math.min(24, river.widthMetres / metresPerPixel)) : 2.4;
        context.stroke();
      }

      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.font = '500 11px "KaiTi", "STKaiti", "Songti SC", serif';
      const zoomScale = Math.min(1.7, Math.max(0.8, Math.pow(1.12, map.getZoom() - 13)));
      for (const road of this.orderedRoads) {
        const priority = roadPriority(road);
        const restriction = roadRestriction(road);
        const roadWidth = (priority === 8 ? 5.1 : priority === 7 ? 4.3 : 3.5) * zoomScale;
        this.trace(context, road.coordinates, false);
        if (road.bridge) {
          context.strokeStyle = palette.land;
          context.lineWidth = roadWidth + 3;
          context.stroke();
        }
        context.setLineDash(road.tunnel ? [5, 4] : []);
        context.strokeStyle = restriction ? (theme === 'paper' ? '#a38368' : '#9d7951') : palette.road;
        context.globalAlpha = road.tunnel ? 0.62 : 0.91;
        context.lineWidth = roadWidth;
        context.stroke();
        context.strokeStyle = palette.roadFill;
        context.lineWidth = Math.max(1.2, roadWidth - 1.4);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
        if (road.name && !road.highway.endsWith('_link') && !compact) {
          const anchor = lineLabelAnchor(road.coordinates.map(p => this.project(p)), viewport);
          const name = restriction && map.getZoom() >= 14 ? `${road.name} · ${restriction === 'no-foot' ? '非步行' : '通行受限'}` : road.name;
          const labelWidth = context.measureText(name).width + 9;
          if (anchor && anchor.length >= labelWidth * 1.1) labels.push({ id: road.id, name,
            x: anchor.point.x, y: anchor.point.y, angle: anchor.angle, width: labelWidth, height: 13,
            priority: priority * 10 + Math.min(anchor.length / 100, 9) });
        }
      }
      context.restore();
    }

    // Coverage and trial rights are different. Outside coverage stays opaque;
    // within coverage, non-trial streets are still readable but cannot activate.
    if (!compact && skeleton && dataStatus !== 'loading') {
      for (let y = MARGIN + 110; y < MARGIN + size.y - 145; y += 235) {
        for (let x = MARGIN + 100; x < MARGIN + size.x - 45; x += 275) {
          const position = map.containerPointToLatLng([x - MARGIN, y - MARGIN]);
          const coordinate: MapCoordinates = [position.lng, position.lat];
          const covered = skeleton && coordinate[0] >= skeleton.bounds[0] && coordinate[0] <= skeleton.bounds[2]
            && coordinate[1] >= skeleton.bounds[1] && coordinate[1] <= skeleton.bounds[3];
          let name = '';
          if (!covered) name = '主干道数据未覆盖';
          else if (!regions.some(region => containsPoint(coordinate, region.polygon))) name = '未开放地标开图';
          if (name) labels.push({ id: `status:${x}:${y}`, name, x, y, angle: 0, width: name.length * 10, height: 12, priority: 1 });
        }
      }
    }
    const safeLabels = labels.filter(label => {
      const box = roadLabelBox(label);
      return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
        && !unlockedPolygons.some(polygon => polygonIntersectsBox(box, polygon));
    });
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const label of chooseRoadLabels(safeLabels, obstacles)) {
      context.save();
      context.translate(label.x, label.y);
      context.rotate(label.angle);
      const water = label.id.startsWith('water:');
      const status = label.id.startsWith('status:');
      context.font = water ? '500 13px "KaiTi", "STKaiti", serif' : status ? '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : '500 11px "KaiTi", "STKaiti", "Songti SC", serif';
      context.lineWidth = water ? 2 : 4;
      context.strokeStyle = water ? palette.water : palette.land;
      context.strokeText(label.name, 0, 0);
      context.fillStyle = water ? palette.waterLabel : status ? palette.outside : palette.label;
      context.fillText(label.name, 0, 0);
      context.restore();
    }

    // This MUST be the last paint operation; no border or paper may follow it.
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000';
    context.globalAlpha = 1;
    for (const region of regions) {
      if (!unlocked.has(region.id) || region.polygon.length < 3) continue;
      this.trace(context, region.polygon, true);
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';
  }
}
