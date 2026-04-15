import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ensureAuthSessionStarted,
  getAuthSessionSnapshot,
  subscribeAuthSession,
} from '../lib/authSessionStore';

/**
 * Hook to get the current user session.
 * Uses a shared store so many mounted components do not each open a Supabase auth channel.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => getAuthSessionSnapshot().session);
  const [loading, setLoading] = useState(() => getAuthSessionSnapshot().loading);

  useEffect(() => {
    ensureAuthSessionStarted();
    const sync = () => {
      const snap = getAuthSessionSnapshot();
      setSession(snap.session);
      setLoading(snap.loading);
    };
    sync();
    return subscribeAuthSession(sync);
  }, []);

  return { session, loading };
}
