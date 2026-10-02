import type { CityId } from '../data/cities';

export type View = 'regions' | 'explore' | 'trips' | 'profile' | 'landmark' | 'checkin';
export type Dialog = null | 'cities' | 'start' | 'manage' | 'account' | 'location' | 'join' | 'photo' | 'gallery' | 'success' | 'restore' | 'map-theme';
export interface AppRoute { view: View; dialog: Dialog; landmarkId: string | null; cityId: CityId }
interface Entry { session: string; index: number; route: AppRoute }
export interface NavigationHistory {
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  go(delta: number): void;
}

export const leavesCheckIn = (current: AppRoute, next: AppRoute) => current.view === 'checkin'
  && (next.view !== 'checkin' || next.landmarkId !== current.landmarkId || next.cityId !== current.cityId);

/** A small in-memory route stack mirrored in browser history; progress lives separately in storage. */
export class AppNavigation {
  private entry: Entry;
  private entries: Entry[];
  private restoringIndex: number | null = null;
  checkInVersion = 0;

  constructor(cityId: CityId, private history: NavigationHistory,
    private changed: (route: AppRoute) => void,
    private canLeave: (current: AppRoute, next: AppRoute) => boolean,
    session = `vesluma-${Date.now()}-${Math.random()}`) {
    this.entry = { session, index: 0, route: { view: 'explore', dialog: null, landmarkId: null, cityId } };
    this.entries = [this.entry];
  }

  get route() { return this.entry.route; }
  start() { this.history.replaceState({ veslumaNavigation: this.entry }, ''); }

  navigate(patch: Partial<AppRoute>, mode: 'push' | 'replace' = 'push', force = false) {
    const route = { ...this.route, ...patch };
    if (Object.keys(route).every(key => route[key as keyof AppRoute] === this.route[key as keyof AppRoute])) return true;
    if (!force && !this.canLeave(this.route, route)) return false;
    const index = this.entry.index + (mode === 'push' ? 1 : 0);
    const next = { ...this.entry, index, route };
    this.entries = this.entries.slice(0, index + 1);
    this.entries[index] = next;
    this.history[mode === 'push' ? 'pushState' : 'replaceState']({ veslumaNavigation: next }, '');
    this.apply(next);
    return true;
  }

  back() {
    if (this.entry.index > 0) this.history.go(-1);
    else this.navigate({ view: 'explore', dialog: null, landmarkId: null }, 'replace');
  }

  pop(state: unknown) {
    const stored = (state as { veslumaNavigation?: Entry } | null)?.veslumaNavigation;
    if (!stored || stored.session !== this.entry.session) return;
    const next = this.entries[stored.index];
    if (!next) return;
    if (this.restoringIndex === stored.index) { this.restoringIndex = null; return; }
    if (!this.canLeave(this.route, next.route)) {
      this.restoringIndex = this.entry.index;
      this.history.go(this.entry.index - next.index);
      return;
    }
    this.apply(next);
  }

  private apply(next: Entry) {
    if (leavesCheckIn(this.route, next.route) || (next.route.view === 'checkin' && this.route.view !== 'checkin')) this.checkInVersion++;
    this.entry = next;
    this.changed(next.route);
  }
}
