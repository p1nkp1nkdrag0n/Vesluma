import { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import type { AppState, Action, Position } from './model';
import { createId, getActiveTrip, isValidPosition, MAX_POSITION_ACCURACY_METERS } from './model';
import type { Dispatch } from 'react';

export const LOCATION_TIMEOUT_MS = 15_000;

export function locationErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '1' || code === 'OS-PLUG-GLOC-0003') {
    return '定位权限未获允许。请在浏览器或系统设置中允许定位后重试；当前页面的照片会保留。';
  }
  if (code === '3' || code === 'OS-PLUG-GLOC-0010') {
    return '获取位置超时。请到开阔处重试；当前页面的照片会保留。';
  }
  return '暂时无法获取位置。请检查系统定位和网络，并使用 HTTPS 或 localhost 后重试；当前页面的照片会保留。';
}

/** One cancellable watch, including a deadline when the platform never replies. */
export function watchDeviceLocation(onPosition: (position: Position | null) => void, onStatus: (error: string, watching: boolean) => void): () => void {
  let stopped = false;
  let id: string | undefined;
  let deadline: ReturnType<typeof setTimeout>;
  const fail = (error: unknown) => {
    if (stopped) return;
    clearTimeout(deadline);
    onPosition(null);
    onStatus(locationErrorMessage(error), false);
  };
  const clearWatch = (watchId: string) => { void Geolocation.clearWatch({ id: watchId }).catch(() => {}); };
  onPosition(null);
  onStatus('', true);
  deadline = setTimeout(() => fail({ code: 3 }), LOCATION_TIMEOUT_MS);
  try {
    void Geolocation.watchPosition({ enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0, minimumUpdateInterval: 5000 }, (sample, error) => {
      if (stopped) return;
      clearTimeout(deadline);
      if (error || !sample) { fail(error); return; }
      const position: Position = { lat: sample.coords.latitude, lng: sample.coords.longitude, accuracy: sample.coords.accuracy,
        at: sample.timestamp, speed: sample.coords.speed, heading: sample.coords.heading, source: 'device' };
      if (!isValidPosition(position)) { fail(null); return; }
      onPosition(position);
      onStatus('', true);
    }).then(watchId => { if (stopped) clearWatch(watchId); else id = watchId; }).catch(fail);
  } catch (error) { fail(error); }
  return () => {
    stopped = true;
    clearTimeout(deadline);
    if (id !== undefined) clearWatch(id);
  };
}

export function useLocation(state: AppState, dispatch: Dispatch<Action>) {
  const latest = useRef(state); latest.current = state;
  const [error, setError] = useState('');
  const [watching, setWatching] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => {
    dispatch({ type: 'set-position', position: null });
    setRetryKey(key => key + 1);
  }, [dispatch]);
  const lastPoint = useRef<{ at: number; tripId: string } | null>(null);
  useEffect(() => {
    if (state.locationMode !== 'device') { setError(''); setWatching(false); return; }
    const stop = watchDeviceLocation(position => {
      dispatch({ type: 'set-position', position });
      if (!position) return;
      const current = latest.current;
      const trip = getActiveTrip(current);
      if (!trip || trip.status !== 'active' || document.visibilityState !== 'visible' || position.accuracy > MAX_POSITION_ACCURACY_METERS) return;
      const interval = (position.speed ?? 0) > 5 ? 5000 : (position.speed ?? 0) > 0.5 ? 10000 : 30000;
      if (!lastPoint.current || lastPoint.current.tripId !== trip.id || position.at - lastPoint.current.at >= interval) {
        dispatch({ type: 'add-point', point: { ...position, id: createId('point'), cityId: trip.cityId, tripId: trip.id, userId: current.profile.id } });
        lastPoint.current = { at: position.at, tripId: trip.id };
      }
    }, (message, active) => { setError(message); setWatching(active); });
    return () => { stop(); lastPoint.current = null; };
  }, [state.locationMode, state.profile.id, dispatch, retryKey]);
  return { error, watching, retry };
}
