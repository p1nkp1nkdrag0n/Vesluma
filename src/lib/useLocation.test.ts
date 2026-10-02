import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position as DevicePosition, WatchPositionCallback } from '@capacitor/geolocation';
import { LOCATION_TIMEOUT_MS, watchDeviceLocation } from './useLocation';

const geolocation = vi.hoisted(() => ({ watchPosition: vi.fn(), clearWatch: vi.fn() }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: geolocation }));
let callback: WatchPositionCallback;
const sample = (): DevicePosition => ({ timestamp: Date.now(), coords: {
  latitude: 32.0232, longitude: 118.7888, accuracy: 5, altitude: null, altitudeAccuracy: null, speed: 0, heading: null,
  magneticHeading: null, trueHeading: null, headingAccuracy: null, course: null,
} });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  geolocation.watchPosition.mockReset().mockImplementation((_options, listener: WatchPositionCallback) => {
    callback = listener;
    return Promise.resolve('watch-1');
  });
  geolocation.clearWatch.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe('device positioning failures and cancellation', () => {
  it('invalidates previous evidence while requesting, then accepts an actual sample', async () => {
    const position = vi.fn(); const status = vi.fn();
    const stop = watchDeviceLocation(position, status);
    expect(position).toHaveBeenLastCalledWith(null);
    expect(status).toHaveBeenLastCalledWith('', true);
    callback(sample());
    expect(position).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 32.0232, source: 'device' }));
    await Promise.resolve(); stop();
    expect(geolocation.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' });
  });

  it.each([[1, '权限'], [3, '超时'], [2, '无法获取'], ['OS-PLUG-GLOC-0003', '权限'], ['OS-PLUG-GLOC-0010', '超时']])('clears a previous successful fix when error %s arrives', (code, message) => {
    const position = vi.fn(); const status = vi.fn();
    const stop = watchDeviceLocation(position, status);
    callback(sample());
    callback(null, { code });
    expect(position).toHaveBeenLastCalledWith(null);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining(message), false);
    // A subsequent actual fix can recover without fabricating any coordinates.
    callback(sample());
    expect(position).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'device' }));
    expect(status).toHaveBeenLastCalledWith('', true);
    stop();
  });

  it('reports a deadline even if the platform never calls back or resolves its watch id', () => {
    geolocation.watchPosition.mockImplementation(() => new Promise(() => {}));
    const position = vi.fn(); const status = vi.fn();
    const stop = watchDeviceLocation(position, status);
    vi.advanceTimersByTime(LOCATION_TIMEOUT_MS);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('超时'), false);
    expect(position).toHaveBeenLastCalledWith(null);
    stop();
  });

  it('reports promise rejection and rejects malformed sample coordinates', async () => {
    geolocation.watchPosition.mockRejectedValueOnce({ code: 1 });
    const position = vi.fn(); const status = vi.fn();
    const stop = watchDeviceLocation(position, status);
    await Promise.resolve(); await Promise.resolve();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('权限'), false);
    stop();
    const stopAgain = watchDeviceLocation(position, status);
    const broken = sample(); broken.coords.latitude = NaN;
    callback(broken);
    expect(position).toHaveBeenLastCalledWith(null);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('无法获取'), false);
    stopAgain();
  });

  it('ignores late callbacks after leaving and clears a watch id that resolves after cleanup', async () => {
    let resolveId!: (id: string) => void;
    geolocation.watchPosition.mockImplementation((_options, listener: WatchPositionCallback) => {
      callback = listener;
      return new Promise<string>(resolve => { resolveId = resolve; });
    });
    const position = vi.fn(); const status = vi.fn();
    const stop = watchDeviceLocation(position, status);
    stop();
    const count = position.mock.calls.length;
    callback(sample()); callback(null, { code: 1 });
    vi.advanceTimersByTime(LOCATION_TIMEOUT_MS * 2);
    expect(position).toHaveBeenCalledTimes(count);
    resolveId('late-watch'); await Promise.resolve();
    expect(geolocation.clearWatch).toHaveBeenCalledWith({ id: 'late-watch' });
  });

  it('keeps an old watcher from overwriting a retried position', () => {
    const position = vi.fn(); const status = vi.fn();
    const stopOld = watchDeviceLocation(position, status);
    const oldCallback = callback;
    callback(sample()); stopOld();
    const stopNew = watchDeviceLocation(position, status);
    oldCallback(sample());
    expect(position).toHaveBeenLastCalledWith(null);
    callback(sample());
    expect(position).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'device' }));
    stopNew();
  });
});
