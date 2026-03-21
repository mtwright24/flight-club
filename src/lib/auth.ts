import { supabase } from './supabaseClient';

export const signInWithGoogle = () => {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'flightclub://auth/callback',
    },
  });
};
