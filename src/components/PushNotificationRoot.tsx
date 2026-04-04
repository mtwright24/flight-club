import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  setNotificationHandler,
} from '../../lib/push/expoNotificationsApi';
import { markNotificationReadFromPushPayload } from '../../lib/push/notificationTapSideEffects';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  deactivatePushTokensForUser,
  registerPushTokenForSignedInUser,
  resolveNotificationHrefFromPayload,
  subscribePushTokenPresenceOnForeground,
} from '../../lib/push';
import { refreshAllBadgeCountsFromServer } from '../../lib/notificationUnreadSync';
import { useAuth } from '../hooks/useAuth';

const NAV_DEBOUNCE_MS = 900;

/** Avoid importing `expo-notifications` types package (keeps optional native path clean). */
type PushNotificationLike = {
  request: { content: { data?: unknown; title?: unknown; body?: unknown }; identifier: string };
};
type PushResponseLike = { notification: PushNotificationLike };

type HandlerNotification = {
  request: { content: { data?: unknown } };
};

function pushDataRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/**
 * Global push registration, OS foreground presentation, tap routing, badge refresh.
 * Foreground alerts use the system banner + Notification Center (no duplicate in-app banner).
 */
export function PushNotificationRoot() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const lastPushNavAt = useRef(0);
  const coldStartHandledRef = useRef(false);
  const prevUserRef = useRef<string | null>(null);

  const navigateFromPushData = useCallback(
    async (data: Record<string, unknown>) => {
      if (data.flightClubLocalTest === true) {
        console.log('[LocalNotifTest] skipping navigation for local test notification');
        return;
      }
      const now = Date.now();
      if (now - lastPushNavAt.current < NAV_DEBOUNCE_MS) return;
      lastPushNavAt.current = now;

      await markNotificationReadFromPushPayload(data);

      const href = resolveNotificationHrefFromPayload(data);
      try {
        router.push(href);
      } catch {
        router.push('/notifications');
      }
    },
    [router]
  );

  /** High-visibility: Metro sometimes hides console.log; warn shows reliably when JS is connected. */
  useEffect(() => {
    if (!__DEV__) return;
    console.log('[Push] PushNotificationRoot mounted — if you never see this, the phone is not running JS from this Metro session.');
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
      console.log('[Push] register attempt for user', userId.slice(0, 8) + '…');
      const res = await registerPushTokenForSignedInUser(userId);
      if (res.ok) {
        console.log('[Push] register result', res.skipped ? { ok: true, skipped: true } : { ok: true });
      } else {
        console.log('[Push] register failed', res.error);
      }
    })();
  }, [authLoading, userId]);

  /** Refresh last_seen when returning from background (debounced). */
  useEffect(() => subscribePushTokenPresenceOnForeground(userId), [userId]);

  /** OS presents banner / list / sound / badge while app is open. */
  useEffect(() => {
    setNotificationHandler({
      handleNotification: async (_notification: HandlerNotification) => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }, []);

  /** Foreground delivery: recount bell + DM badges (real DB counts). */
  useEffect(() => {
    const receivedSub = addNotificationReceivedListener((event: PushNotificationLike) => {
      const data = pushDataRecord(event.request.content.data);
      if (data.flightClubLocalTest === true) {
        return;
      }
      void refreshAllBadgeCountsFromServer();
    });

    return () => receivedSub.remove();
  }, []);

  /** User tapped a notification (background / foreground tray) */
  useEffect(() => {
    const responseSub = addNotificationResponseReceivedListener((response: PushResponseLike) => {
      const data = pushDataRecord(response.notification.request.content.data);
      if (data.flightClubLocalTest === true) {
        console.log('[LocalNotifTest] notification response — deep link disabled for local test');
        return;
      }
      void refreshAllBadgeCountsFromServer();
      void navigateFromPushData(data);
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
      if (data.flightClubLocalTest === true) {
        console.log('[LocalNotifTest] cold start from local test tray — skipping navigation');
        return;
      }
      void navigateFromPushData(data);
      void refreshAllBadgeCountsFromServer();
    });
    return () => {
      cancelled = true;
    };
  }, [userId, navigateFromPushData]);

  return null;
}
