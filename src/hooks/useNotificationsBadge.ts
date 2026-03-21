import { useEffect, useState } from 'react';
import { fetchUnreadNotificationsCount } from '../../lib/notifications';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';

export function useNotificationsBadge() {
  const { session } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) {
      setCount(0);
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        const value = await fetchUnreadNotificationsCount();
        if (isMounted) setCount(value);
      } catch (e) {
        if (isMounted) setCount(0);
      }
    };

    load();

    const channel = supabase
      .channel('notifications-badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        async () => {
          if (!isMounted) return;
          try {
            const value = await fetchUnreadNotificationsCount();
            if (isMounted) setCount(value);
          } catch {
            if (isMounted) setCount(0);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [session?.user?.id]);

  return count;
}
