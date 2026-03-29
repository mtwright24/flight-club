import { useEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { refreshAllBadgeCountsFromServer } from '../../lib/notificationUnreadSync';

/**
 * Refreshes shared header badges (DM cloud + notifications bell) when the route
 * changes (pathname or tab segments), e.g. after stack pops or tab switches.
 */
export function DmBadgeNavigationSync() {
  const pathname = usePathname();
  const segments = useSegments();
  const routeKey = `${pathname}#${segments.join('/')}`;
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => {
      void refreshAllBadgeCountsFromServer();
    }, 50);
    return () => clearTimeout(t);
  }, [routeKey]);

  return null;
}
