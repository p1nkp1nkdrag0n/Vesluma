import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getLandmark } from '../data/cities';
import { createInitialState, reducer, type AppState } from '../lib/model';
import { applySyncSnapshot, projectSyncState } from '../lib/syncProtocol';
import { clockLabel, dateLabel } from '../lib/format';
import { TripsScreen } from './TripsScreen';

// Exercise the actual trip list/replay rendering without constructing Leaflet
// or opening IndexedDB; neither is involved in the replay time boundary.
vi.mock('../components/ExploreMap', () => ({ default: () => null }));
vi.mock('./LandmarkScreen', () => ({ VisitPhoto: () => null }));

const startedAt = Date.UTC(2026, 9, 2, 10, 0);
const endedAt = startedAt + 60_000;
const lateAt = startedAt + 180_000;
const noop = () => {};

function visit(state: AppState, id: string, at: number): AppState {
  const landmark = getLandmark('nj-confucius')!;
  const arrived = reducer(state, { type: 'set-position', position: {
    lat: landmark.lat, lng: landmark.lng, accuracy: 5, source: 'demo', at,
  } });
  return reducer(arrived, { type: 'check-in', id, photoId: `photo-${id}`, landmarkId: landmark.id, at });
}

function endedTripWithLateArrival(): AppState {
  const started = reducer(createInitialState(startedAt), { type: 'start-trip', id: 'offline-trip', at: startedAt });
  const common = visit(started, 'early-arrival', startedAt + 30_000);
  const ended = reducer(common, { type: 'end-trip', at: endedAt });
  const offline = visit(common, 'late-arrival', lateAt);
  return applySyncSnapshot(ended, projectSyncState(offline));
}

function render(state: AppState, replayProgress = 1000) {
  return renderToStaticMarkup(createElement(TripsScreen, {
    state, onStart: noop, onManage: noop, onLandmark: noop, onVisit: noop,
    initialContext: { selectedId: 'offline-trip', tab: 'timeline', replayProgress, scrollTop: 0 },
  }));
}

describe('ended trip replay after offline synchronization', () => {
  it('shows every merged arrival in the full replay while retaining the original end label', () => {
    const state = endedTripWithLateArrival();
    expect(state.trips[0]).toMatchObject({ status: 'ended', endedAt });
    expect(state.activeTripId).toBeNull();
    const html = render(state);
    expect(html.match(/class="trip-timeline-event"/g)).toHaveLength(2);
    expect(html).toContain(`${clockLabel(endedAt)} 结束`);
    expect(html).toContain(`aria-valuetext="${dateLabel(lateAt)} ${clockLabel(lateAt)}"`);
    expect(html).toContain('稍后同步的离线记录已纳入回放');
  });

  it('keeps the late arrival hidden until the replay reaches its actual timestamp', () => {
    const state = endedTripWithLateArrival();
    const beforeArrival = render(state, 500);
    expect(beforeArrival.match(/class="trip-timeline-event"/g)).toHaveLength(1);
    expect(render(state).match(/class="trip-timeline-event"/g)).toHaveLength(2);
    expect(state.visits).toHaveLength(2);
    expect(state.trips[0].endedAt).toBe(endedAt);
  });
});
