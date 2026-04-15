import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type Listener = () => void;

const listeners = new Set<Listener>();

let session: Session | null = null;
/** False after the first getSession attempt finishes (success or failure). */
let loading = true;
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

export function getAuthSessionSnapshot(): { session: Session | null; loading: boolean } {
  return { session, loading };
}

export function subscribeAuthSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Single Supabase auth subscription for the whole app (avoids dozens of parallel
 * getSession / onAuthStateChange calls from every `useAuth()` consumer).
 */
export function ensureAuthSessionStarted(): void {
  if (started) return;
  started = true;

  supabase.auth
    .getSession()
    .then(({ data: { session: s } }) => {
      session = s ?? null;
      loading = false;
      emit();
    })
    .catch(() => {
      session = null;
      loading = false;
      emit();
    });

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession ?? null;
    loading = false;
    emit();
  });
}
