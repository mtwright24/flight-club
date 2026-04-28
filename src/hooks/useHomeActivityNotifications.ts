import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  enrichNotificationsWithActors,
  type Notification,
} from '../../lib/notifications';
import { notifyAllBadgeCachesRefresh } from '../../lib/notificationUnreadSync';
import {
  getRecentNotifications,
  subscribeToNotifications,
  type NotificationPreview,
} from '../../lib/notifications-preview';
import type { NotificationItem } from '../../components/ActivityPreview';

type MapPreview = (p: NotificationPreview, userId: string) => NotificationItem & { user_id: string };

/**
 * Single source of truth for Home Activity + top-tile / shortcut unread dots.
 */
export function useHomeActivityNotifications(
  userId: string | null | undefined,
  refreshToken: number,
  mapPreviewToItem: MapPreview,
): {
  items: NotificationItem[];
  setItems: Dispatch<SetStateAction<NotificationItem[]>>;
  loading: boolean;
} {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const subRef = useRef<ReturnType<typeof subscribeToNotifications> | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    getRecentNotifications(userId, 80)
      .then(async (rows) => {
        if (!mounted) return;
        try {
          const enriched = await enrichNotificationsWithActors(rows as Notification[]);
          setItems(enriched.map((p) => mapPreviewToItem(p as NotificationPreview, userId)));
        } catch {
          setItems(rows.map((p) => mapPreviewToItem(p, userId)));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    if (subRef.current) {
      try {
        subRef.current.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    subRef.current = subscribeToNotifications(userId, async (n) => {
      try {
        const [enriched] = await enrichNotificationsWithActors([{ ...n } as Notification]);
        const row = (enriched ?? n) as NotificationPreview;
        setItems((prev) => [mapPreviewToItem(row, userId), ...prev].slice(0, 80));
      } catch {
        setItems((prev) => [mapPreviewToItem(n, userId), ...prev].slice(0, 80));
      }
      notifyAllBadgeCachesRefresh();
    }, 'tabs-dashboard');

    return () => {
      mounted = false;
      if (subRef.current) {
        try {
          subRef.current.unsubscribe();
        } catch {
          /* ignore */
        }
      }
    };
  }, [userId, refreshToken, mapPreviewToItem]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void getRecentNotifications(userId, 80)
        .then(async (rows) => {
          try {
            const enriched = await enrichNotificationsWithActors(rows as Notification[]);
            setItems(enriched.map((p) => mapPreviewToItem(p as NotificationPreview, userId)));
          } catch {
            setItems(rows.map((p) => mapPreviewToItem(p, userId)));
          }
        })
        .catch(() => {});
    }, [userId, mapPreviewToItem]),
  );

  return { items, setItems, loading };
}
