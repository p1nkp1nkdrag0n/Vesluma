import { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import type { AppState, Action, Position } from './model';
import { createId } from './model';
import type { Dispatch } from 'react';
export function useLocation(state: AppState, dispatch: Dispatch<Action>) {
  const latest = useRef(state); latest.current = state;
  const [error, setError] = useState('');
  const [watching, setWatching] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => setRetryKey(key => key + 1), []);
  const lastPoint = useRef<{ at: number; lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (state.locationMode !== 'device') return;
    let stopped = false; let id: string | undefined;
    setError(''); setWatching(true);
    Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0, minimumUpdateInterval: 5000 }, (sample, err) => {
      if (stopped) return;
      if (err || !sample) { setError('暂时没有获取到位置。检查定位权限后重试，照片草稿会保留。'); setWatching(false); return; }
      const position: Position = { lat: sample.coords.latitude, lng: sample.coords.longitude, accuracy: sample.coords.accuracy, at: sample.timestamp, speed: sample.coords.speed, heading: sample.coords.heading, source: 'device' };
      dispatch({ type: 'set-position', position }); setError(''); setWatching(true);
      const current = latest.current; const trip = current.trips.find(t => t.id === current.activeTripId);
      if (!trip || trip.status !== 'active' || document.visibilityState !== 'visible' || position.accuracy > 100) return;
      const interval = (position.speed ?? 0) > 5 ? 5000 : (position.speed ?? 0) > 0.5 ? 10000 : 30000;
      if (!lastPoint.current || position.at - lastPoint.current.at >= interval) { dispatch({ type: 'add-point', point: { ...position, id: createId('point'), cityId: trip.cityId, tripId: trip.id, userId: current.profile.id } }); lastPoint.current = position; }
    }).then(watchId => { if (stopped) void Geolocation.clearWatch({ id: watchId }); else id = watchId; }).catch(() => { if (!stopped) { setError('无法使用设备定位。浏览器需 HTTPS 或 localhost，并允许定位。'); setWatching(false); } });
    return () => { stopped = true; setWatching(false); if (id) void Geolocation.clearWatch({ id }); lastPoint.current = null; };
  }, [state.locationMode, state.profile.id, dispatch, retryKey]);
  return { error, watching, retry };
}
