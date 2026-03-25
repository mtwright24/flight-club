import { AppState, type AppStateStatus } from 'react-native';
import { getUnreadCounts } from './home';
import { supabase } from '../src/lib/supabaseClient';

type SnapshotListener = () => void;
const snapshotListeners = new Set<SnapshotListener>();

let count = 0;

let activeUserId: string | null = null;
let registerRefCount = 0;

let refreshInFlight: Promise<void> | null = null;

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

export function subscribeDmUnreadBadgeCount(listener: SnapshotListener) {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

export function getDmUnreadBadgeCountSnapshot() {
  return count;
}

/** Call when auth user is gone (e.g. logout). */
export function resetDmUnreadBadgeCount() {
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
    void refreshDmUnreadBadgeCount();
  }, 45000);

  appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') void refreshDmUnreadBadgeCount();
  });
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase
    .channel(`dm-unread-badge-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dm_messages' },
      () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          void refreshDmUnreadBadgeCount();
        }, 350);
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
 * Single-flight refresh: all callers share one network round-trip.
 * Always resolves the viewer from Supabase session so refreshes still run when
 * tab headers unmount under stack screens (activeUserId would otherwise be null).
 */
export function refreshDmUnreadBadgeCount(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) {
        setCount(0);
        return;
      }
      const { messages } = await getUnreadCounts(uid);
      setCount(messages);
    } catch {
      // Keep last good count on transient errors
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

let notifyFollowUpTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Call after opening a thread (messages marked read), swipe read/unread, or inbox focus.
 * Schedules a quick follow-up refresh to beat read-receipt / single-flight timing races.
 */
export function notifyDmUnreadBadgeRefresh(): void {
  void refreshDmUnreadBadgeCount();
  if (notifyFollowUpTimer) clearTimeout(notifyFollowUpTimer);
  notifyFollowUpTimer = setTimeout(() => {
    notifyFollowUpTimer = null;
    void refreshDmUnreadBadgeCount();
  }, 280);
}

export function registerDmUnreadBadgeUser(userId: string | null): () => void {
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
      // Do not setCount(0) here — avoids flashing 0 when lazy tabs unmount one header.
    }
  };
}
