import { useEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { refreshDmUnreadBadgeCount } from '../../lib/dmUnreadBadgeStore';

/**
 * Refreshes the shared DM cloud badge whenever the route changes (pathname or
 * tab segments) so it updates after stack pops or tab switches without tapping the icon.
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
      void refreshDmUnreadBadgeCount();
    }, 50);
    return () => clearTimeout(t);
  }, [routeKey]);

  return null;
}
