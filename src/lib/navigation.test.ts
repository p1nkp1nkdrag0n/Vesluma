import { describe, expect, it } from 'vitest';
import { AppNavigation, leavesCheckIn, type AppRoute } from './navigation';

function setup(canLeave = (_current: AppRoute, _next: AppRoute) => true) {
  const states: unknown[] = [];
  let index = 0;
  const seen: AppRoute[] = [];
  const navigation = new AppNavigation('nanjing', {
    pushState: state => { states.splice(++index); states[index] = state; },
    replaceState: state => { states[index] = state; },
    go: delta => { index += delta; navigation.pop(states[index]); },
  }, route => seen.push(route), canLeave, 'test');
  navigation.start();
  return { navigation, seen, forward: () => { navigation.pop(states[++index]); } };
}

describe('page and browser history', () => {
  it('returns from check-in to landmark to its region source', () => {
    const { navigation } = setup();
    navigation.navigate({ view: 'regions' });
    navigation.navigate({ view: 'landmark', landmarkId: 'nj-confucius' });
    navigation.navigate({ view: 'checkin' });
    navigation.back();
    expect(navigation.route.view).toBe('landmark');
    navigation.back();
    expect(navigation.route.view).toBe('regions');
    navigation.back();
    expect(navigation.route.view).toBe('explore');
  });

  it('closes location dialog before leaving check-in and preserves its submission session', () => {
    const { navigation } = setup();
    navigation.navigate({ view: 'checkin', landmarkId: 'nj-confucius' });
    const session = navigation.checkInVersion;
    navigation.navigate({ dialog: 'location' });
    navigation.back();
    expect(navigation.route).toMatchObject({ view: 'checkin', dialog: null });
    expect(navigation.checkInVersion).toBe(session);
    navigation.back();
    expect(navigation.checkInVersion).toBeGreaterThan(session);
  });

  it('returns to the original city and trips page after a visit in another city', () => {
    const { navigation } = setup();
    navigation.navigate({ view: 'trips' });
    navigation.navigate({ view: 'landmark', cityId: 'xian', landmarkId: 'xa-bell' });
    navigation.back();
    expect(navigation.route).toMatchObject({ view: 'trips', cityId: 'nanjing', landmarkId: null });
  });

  it('keeps a dirty check-in mounted on cancelled browser back or tab change', () => {
    const { navigation } = setup((current, next) => !leavesCheckIn(current, next));
    navigation.navigate({ view: 'checkin', landmarkId: 'nj-confucius' });
    const session = navigation.checkInVersion;
    navigation.back();
    expect(navigation.route.view).toBe('checkin');
    expect(navigation.navigate({ view: 'trips' })).toBe(false);
    expect(navigation.checkInVersion).toBe(session);
    expect(navigation.navigate({ dialog: 'location' })).toBe(true);
    navigation.back();
    expect(navigation.route.dialog).toBeNull();
  });

  it('invalidates old submissions even when browser forward reopens the same check-in', () => {
    const { navigation, forward } = setup();
    navigation.navigate({ view: 'checkin', landmarkId: 'nj-confucius' });
    const session = navigation.checkInVersion;
    navigation.back();
    forward();
    expect(navigation.route.view).toBe('checkin');
    expect(navigation.checkInVersion).toBeGreaterThan(session);
  });
});
