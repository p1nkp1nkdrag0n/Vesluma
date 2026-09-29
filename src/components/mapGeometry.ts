/** Pure geometry shared by the opaque map mask and its label layout. */
export type MapCoordinates = [lng: number, lat: number];
export type { MapTheme } from '../lib/mapTheme';
export interface PixelPoint { x: number; y: number }
export interface LabelBox { left: number; top: number; right: number; bottom: number }
export interface RoadLabelCandidate {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  priority: number;
}
export interface MapRegion { id: string; polygon: MapCoordinates[] }

/** Only explicit source restrictions; absence of tags is never walking advice. */
export function roadRestriction(road: { foot?: string; access?: string }): 'no-foot' | 'restricted' | null {
  if (road.foot === 'no' || road.foot === 'use_sidepath') return 'no-foot';
  if (road.foot === 'private') return 'restricted';
  if (['yes', 'designated', 'permissive'].includes(road.foot ?? '')) return null;
  return road.access === 'no' || road.access === 'private' ? 'restricted' : null;
}

function finiteCoordinate(point: MapCoordinates): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

/** Boundary-inclusive ray casting: the rights mask is a union, never XOR. */
export function containsPoint(point: MapCoordinates, polygon: MapCoordinates[]): boolean {
  if (polygon.length < 3 || !finiteCoordinate(point) || polygon.some(p => !finiteCoordinate(p))) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[j];
    const [x2, y2] = polygon[i];
    const cross = (point[0] - x1) * (y2 - y1) - (point[1] - y1) * (x2 - x1);
    const tolerance = 1e-10 * Math.max(1, Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (Math.abs(cross) <= tolerance && point[0] >= Math.min(x1, x2) - tolerance
      && point[0] <= Math.max(x1, x2) + tolerance && point[1] >= Math.min(y1, y2) - tolerance
      && point[1] <= Math.max(y1, y2) + tolerance) return true;
    if ((y1 > point[1]) !== (y2 > point[1])
      && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export function isPointUnlocked(point: MapCoordinates, regions: MapRegion[], unlockedIds: ReadonlySet<string>): boolean {
  return regions.some(region => unlockedIds.has(region.id) && containsPoint(point, region.polygon));
}

/** Liang–Barsky clipping, used only to find visible label anchors, not to redraw roads. */
export function clipSegment(a: PixelPoint, b: PixelPoint, box: LabelBox): [PixelPoint, PixelPoint] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - box.left, box.right - a.x, a.y - box.top, box.bottom - a.y];
  let enter = 0;
  let leave = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return null;
  }
  return [{ x: a.x + enter * dx, y: a.y + enter * dy }, { x: a.x + leave * dx, y: a.y + leave * dy }];
}

function pointInBox(point: PixelPoint, box: LabelBox): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

export function polygonIntersectsBox(box: LabelBox, polygon: PixelPoint[]): boolean {
  if (polygon.length < 3) return false;
  if (polygon.some(point => pointInBox(point, box))) return true;
  const coordinates: MapCoordinates[] = polygon.map(point => [point.x, point.y]);
  if ([[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]
    .some(point => containsPoint(point as MapCoordinates, coordinates))) return true;
  for (let i = 0; i < polygon.length; i += 1) {
    if (clipSegment(polygon[i], polygon[(i + 1) % polygon.length], box)) return true;
  }
  return false;
}

export function roadLabelBox(label: RoadLabelCandidate, padding = 5): LabelBox {
  const width = Math.abs(Math.cos(label.angle)) * label.width + Math.abs(Math.sin(label.angle)) * label.height;
  const height = Math.abs(Math.sin(label.angle)) * label.width + Math.abs(Math.cos(label.angle)) * label.height;
  return { left: label.x - width / 2 - padding, right: label.x + width / 2 + padding,
    top: label.y - height / 2 - padding, bottom: label.y + height / 2 + padding };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** One visible label per name, prioritizing major roads and avoiding marker text. */
export function chooseRoadLabels(candidates: RoadLabelCandidate[], obstacles: LabelBox[] = []): RoadLabelCandidate[] {
  const occupied = [...obstacles];
  const names = new Set<string>();
  const accepted: RoadLabelCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (!candidate.name || names.has(candidate.name)) continue;
    const box = roadLabelBox(candidate);
    if (occupied.some(other => boxesOverlap(box, other))) continue;
    accepted.push(candidate);
    names.add(candidate.name);
    occupied.push(box);
  }
  return accepted;
}
