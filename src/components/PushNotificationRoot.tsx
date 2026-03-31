import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  setNotificationHandler,
} from '../../lib/push/expoNotificationsApi';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  deactivatePushTokensForUser,
  registerPushTokenForSignedInUser,
  resolveNotificationHrefFromPayload,
  subscribePushTokenPresenceOnForeground,
} from '../../lib/push';
import { refreshAllBadgeCountsFromServer } from '../../lib/notificationUnreadSync';
import { useAuth } from '../hooks/useAuth';
import ForegroundNotificationBanner, { type ForegroundBannerPayload } from './ForegroundNotificationBanner';

const NAV_DEBOUNCE_MS = 900;

/** Avoid importing `expo-notifications` types package (keeps optional native path clean). */
type PushNotificationLike = {
  request: { content: { data?: unknown; title?: unknown; body?: unknown }; identifier: string };
};
type PushResponseLike = { notification: PushNotificationLike };

function pushDataRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/**
 * Global push registration, foreground in-app banner queue, tap routing, and badge refresh hooks.
 * Mount once under the root navigator (e.g. `app/_layout.tsx`).
 */
export function PushNotificationRoot() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const [bannerQueue, setBannerQueue] = useState<ForegroundBannerPayload[]>([]);
  const currentBanner = bannerQueue[0] ?? null;

  const prevUserRef = useRef<string | null>(null);
  const lastPushNavAt = useRef(0);
  const coldStartHandledRef = useRef(false);

  const dequeueBanner = useCallback(() => {
    setBannerQueue((q) => q.slice(1));
  }, []);

  const navigateFromPushData = useCallback(
    (data: Record<string, unknown>) => {
      const now = Date.now();
      if (now - lastPushNavAt.current < NAV_DEBOUNCE_MS) return;
      lastPushNavAt.current = now;
      const href = resolveNotificationHrefFromPayload(data);
      try {
        router.push(href);
      } catch {
        router.push('/notifications');
      }
    },
    [router]
  );

  const onBannerPress = useCallback(
    (item: ForegroundBannerPayload) => {
      dequeueBanner();
      navigateFromPushData(item.data);
    },
    [dequeueBanner, navigateFromPushData]
  );

  /** High-visibility: Metro sometimes hides console.log; warn shows reliably when JS is connected. */
  useEffect(() => {
    if (!__DEV__) return;
    console.warn('[Push] PushNotificationRoot mounted — if you never see this, the phone is not running JS from this Metro session.');
  }, []);

  /** Register token + deactivate on logout */
  useEffect(() => {
    const prev = prevUserRef.current;
    if (prev && !userId) {
      void deactivatePushTokensForUser(prev);
    }
    prevUserRef.current = userId;

    if (authLoading || !userId) return;

    void (async () => {
      console.warn('[Push] register attempt for user', userId.slice(0, 8) + '…');
      const res = await registerPushTokenForSignedInUser(userId);
      if (res.ok) {
        console.warn('[Push] register result', res.skipped ? { ok: true, skipped: true } : { ok: true });
      } else {
        console.warn('[Push] register failed', res.error);
      }
    })();
  }, [authLoading, userId]);

  /** Refresh last_seen when returning from background (debounced). */
  useEffect(() => subscribePushTokenPresenceOnForeground(userId), [userId]);

  /** OS banner off; must run after module load so stub/native impl is ready. */
  useEffect(() => {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  /**
   * Foreground pushes: in-app banner + immediate DB recount (bell + DM — no fake push counts).
   */
  useEffect(() => {
    const receivedSub = addNotificationReceivedListener((event: PushNotificationLike) => {
      const content = event.request.content;
      const data = pushDataRecord(content.data);
      const title = typeof content.title === 'string' ? content.title : '';
      const body = typeof content.body === 'string' ? content.body : '';
      const avatarUrl =
        typeof data.avatar_url === 'string'
          ? data.avatar_url
          : typeof data.actor_avatar_url === 'string'
            ? data.actor_avatar_url
            : undefined;
      const iconUrl =
        typeof data.icon_url === 'string'
          ? data.icon_url
          : typeof data.notification_icon_url === 'string'
            ? data.notification_icon_url
            : undefined;

      void refreshAllBadgeCountsFromServer();

      if (AppState.currentState !== 'active') return;

      const id = `${event.request.identifier}-${Date.now()}`;
      setBannerQueue((q) => [
        ...q,
        {
          id,
          title,
          body,
          avatarUrl,
          iconUrl,
          data,
        },
      ]);
    });

    return () => receivedSub.remove();
  }, []);

  /** User tapped a notification (background / foreground tray) */
  useEffect(() => {
    const responseSub = addNotificationResponseReceivedListener((response: PushResponseLike) => {
      const data = pushDataRecord(response.notification.request.content.data);
      void refreshAllBadgeCountsFromServer();
      navigateFromPushData(data);
    });
    return () => responseSub.remove();
  }, [navigateFromPushData]);

  /** Cold start: open from tray + recount */
  useEffect(() => {
    if (!userId || coldStartHandledRef.current) return;
    let cancelled = false;
    void getLastNotificationResponseAsync().then((response: PushResponseLike | null) => {
      if (cancelled) return;
      coldStartHandledRef.current = true;
      if (!response) return;
      const data = pushDataRecord(response.notification.request.content.data);
      navigateFromPushData(data);
      void refreshAllBadgeCountsFromServer();
    });
    return () => {
      cancelled = true;
    };
  }, [userId, navigateFromPushData]);

  return (
    <ForegroundNotificationBanner
      item={currentBanner}
      onDismiss={dequeueBanner}
      onPress={onBannerPress}
    />
  );
}
