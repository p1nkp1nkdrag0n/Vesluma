import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityId } from '../data/cities';
import { AppNavigation, leavesCheckIn } from './navigation';

export function useAppNavigation(cityId: CityId, onCityChange: (cityId: CityId) => void) {
  const draftDirty = useRef(false);
  const onCityChangeRef = useRef(onCityChange);
  onCityChangeRef.current = onCityChange;
  const [, refresh] = useState(0);
  const [navigation] = useState(() => new AppNavigation(cityId, window.history, route => {
    if (route.view !== 'checkin') draftDirty.current = false;
    onCityChangeRef.current(route.cityId);
    refresh(value => value + 1);
  }, (current, next) => !leavesCheckIn(current, next) || !draftDirty.current
    || window.confirm('这次打卡还有未保存的照片或文字。离开后草稿不会保留，确定离开吗？')));
  const onDraftChange = useCallback((dirty: boolean) => { draftDirty.current = dirty; }, []);
  useEffect(() => {
    navigation.start();
    const pop = (event: PopStateEvent) => navigation.pop(event.state);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!draftDirty.current || navigation.route.view !== 'checkin') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('popstate', pop);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [navigation]);
  return { navigation, ...navigation.route, onDraftChange };
}
