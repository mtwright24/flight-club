import { AppState, type AppStateStatus } from 'react-native';
import { countUnreadNotificationsForUser } from './notifications';
import { supabase } from '../src/lib/supabaseClient';

type SnapshotListener = () => void;
const snapshotListeners = new Set<SnapshotListener>();

let count = 0;

let activeUserId: string | null = null;
let registerRefCount = 0;

let notifBadgeRefreshInFlight: Promise<void> | null = null;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let realtimeChannelCleanup: (() => void) | null = null;

function emitSnapshot() {
  snapshotListeners.forEach((l) => l());
}

function setCount(next: number) {
  if (count === next) return;
  count = next;
  emitSnapshot();
}

export function subscribeNotificationsBadgeCount(listener: SnapshotListener) {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

export function getNotificationsBadgeCountSnapshot() {
  return count;
}

export function resetNotificationsBadgeCount() {
  setCount(0);
}

function stopGlobalSideEffects() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
  realtimeChannelCleanup?.();
  realtimeChannelCleanup = null;
}

function startGlobalSideEffects(userId: string) {
  if (pollTimer) return;

  pollTimer = setInterval(() => {
    void refreshNotificationsBadgeCount();
  }, 45000);

  appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') void refreshNotificationsBadgeCount();
  });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase
    .channel(`notifications-badge-global-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          void refreshNotificationsBadgeCount();
        }, 200);
      }
    )
    .subscribe();

  realtimeChannelCleanup = () => {
    try {
      channel.unsubscribe();
    } catch {}
  };
}

/**
 * Single-flight refresh using session (works when tab headers unmount under stack).
 */
export function refreshNotificationsBadgeCount(): Promise<void> {
  if (notifBadgeRefreshInFlight) return notifBadgeRefreshInFlight;
  notifBadgeRefreshInFlight = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) {
        setCount(0);
        return;
      }
      const n = await countUnreadNotificationsForUser(uid);
      setCount(n);
    } catch {
      // keep last good count
    } finally {
      notifBadgeRefreshInFlight = null;
    }
  })();
  return notifBadgeRefreshInFlight;
}

let notifyNotifFollowUpTimer: ReturnType<typeof setTimeout> | null = null;

export function notifyNotificationsBadgeRefresh(): void {
  void refreshNotificationsBadgeCount();
  if (notifyNotifFollowUpTimer) clearTimeout(notifyNotifFollowUpTimer);
  notifyNotifFollowUpTimer = setTimeout(() => {
    notifyNotifFollowUpTimer = null;
    void refreshNotificationsBadgeCount();
  }, 280);
}

export function registerNotificationsBadgeUser(userId: string | null): () => void {
  registerRefCount += 1;
  if (userId) {
    activeUserId = userId;
  }

  if (registerRefCount === 1 && userId) {
    startGlobalSideEffects(userId);
  }

  return () => {
    registerRefCount -= 1;
    if (registerRefCount <= 0) {
      registerRefCount = 0;
      activeUserId = null;
      stopGlobalSideEffects();
    }
  };
}
