import { useCallback, useEffect, useRef, useState } from 'react';

export type CompassStatus = 'unavailable' | 'idle' | 'active' | 'denied';
type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<'granted' | 'denied'>;
};
type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

const STALE_AFTER_MS = 15_000;
const EMIT_INTERVAL_MS = 100;
const normalize = (value: number) => ((value % 360) + 360) % 360;

function supported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
    && typeof window.DeviceOrientationEvent !== 'undefined';
}

/**
 * Absolute sensor bearing, rather than the direction of GPS travel.
 * The alpha conversion is the W3C's horizontal-device compass reference:
 * https://www.w3.org/TR/orientation-event/#deviceorientation
 * WebKit's own compass reading takes precedence when available.
 */
function sensorHeading(event: CompassEvent): number | null {
  const webkit = event.webkitCompassHeading;
  if (typeof webkit === 'number' && Number.isFinite(webkit) && webkit >= 0) {
    if (typeof event.webkitCompassAccuracy === 'number' && event.webkitCompassAccuracy < 0) return null;
    return normalize(webkit);
  }
  if (!(event.absolute || event.type === 'deviceorientationabsolute')) return null;
  if (typeof event.alpha !== 'number' || !Number.isFinite(event.alpha) || event.alpha < 0) return null;
  return normalize(360 - event.alpha);
}

export function useCompass(): {
  heading: number | null;
  status: CompassStatus;
  enable: () => Promise<void>;
} {
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<CompassStatus>(() => supported() ? 'idle' : 'unavailable');
  const mounted = useRef(true);
  const requestSequence = useRef(0);
  const pending = useRef(false);
  const removeListeners = useRef<(() => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      pending.current = false;
      removeListeners.current?.();
      removeListeners.current = null;
    };
  }, []);

  // Invoke enable directly from a click. Permission requests require user activation:
  // https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
  const enable = useCallback(async () => {
    if (!mounted.current || pending.current) return;
    removeListeners.current?.();
    removeListeners.current = null;
    setHeading(null);
    if (!supported()) {
      setStatus('unavailable');
      return;
    }

    const sequence = ++requestSequence.current;
    const Orientation = window.DeviceOrientationEvent as OrientationConstructor;
    pending.current = true;
    setStatus('idle');
    try {
      // This call occurs synchronously before the first await in the click handler.
      const permission = Orientation.requestPermission
        ? await Orientation.requestPermission.call(Orientation, true)
        : 'granted';
      if (!mounted.current || sequence !== requestSequence.current) return;
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      let lastValidAt = Date.now();
      let lastEmittedAt = 0;
      let fresh = false;
      let expiry: number | undefined;
      const expire = () => {
        const remaining = STALE_AFTER_MS - (Date.now() - lastValidAt);
        if (remaining > 0) {
          expiry = window.setTimeout(expire, remaining);
          return;
        }
        fresh = false;
        setHeading(null);
        setStatus('unavailable');
      };
      const armExpiry = () => {
        if (expiry !== undefined) window.clearTimeout(expiry);
        expiry = window.setTimeout(expire, STALE_AFTER_MS);
      };
      const onOrientation = (event: DeviceOrientationEvent) => {
        if (document.visibilityState === 'hidden') return;
        const next = sensorHeading(event as CompassEvent);
        if (next === null) return;
        const now = Date.now();
        lastValidAt = now;
        if (fresh && now - lastEmittedAt < EMIT_INTERVAL_MS) return;
        lastEmittedAt = now;
        setHeading(next);
        if (!fresh) {
          fresh = true;
          setStatus('active');
          armExpiry();
        }
      };
      const onVisibility = () => {
        if (document.visibilityState !== 'hidden') {
          lastValidAt = Date.now();
          armExpiry();
          return;
        }
        fresh = false;
        setHeading(null);
        setStatus('idle');
        if (expiry !== undefined) window.clearTimeout(expiry);
      };

      window.addEventListener('deviceorientationabsolute', onOrientation, { passive: true });
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      armExpiry();
      removeListeners.current = () => {
        window.removeEventListener('deviceorientationabsolute', onOrientation);
        window.removeEventListener('deviceorientation', onOrientation);
        document.removeEventListener('visibilitychange', onVisibility);
        if (expiry !== undefined) window.clearTimeout(expiry);
      };
    } catch (error) {
      if (!mounted.current || sequence !== requestSequence.current) return;
      const name = error instanceof Error ? error.name : '';
      setHeading(null);
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    } finally {
      if (sequence === requestSequence.current) pending.current = false;
    }
  }, []);

  return { heading, status, enable };
}
