import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

/**
 * Redirect URI used by Supabase OAuth + email auth callbacks.
 * - Expo Go: use AuthSession proxy (https://auth.expo.io/...) for reliable iOS handoff.
 * - Standalone/dev build: use app scheme callback.
 */
export function getAuthRedirectUri() {
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    return AuthSession.makeRedirectUri({
      path: 'auth/callback',
    });
  }

  return AuthSession.makeRedirectUri({
    path: 'auth/callback',
    scheme: 'flightclub',
  });
}

