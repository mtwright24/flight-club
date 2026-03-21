import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabaseClient';

WebBrowser.maybeCompleteAuthSession();

const extractParams = (url: string) => {
  const parsed = new URL(url);
  const hash = parsed.hash?.replace(/^#/, '') ?? '';
  const hashParams = new URLSearchParams(hash);
  const searchParams = parsed.searchParams;

  const access_token = hashParams.get('access_token') || searchParams.get('access_token');
  const refresh_token = hashParams.get('refresh_token') || searchParams.get('refresh_token');
  const error = hashParams.get('error') || searchParams.get('error');
  const error_description =
    hashParams.get('error_description') || searchParams.get('error_description');

  return { access_token, refresh_token, error, error_description };
};

export const signInWithGoogle = async () => {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'flightclub' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri },
  });

  if (error) {
    return { error };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type !== 'success' || !result.url) {
    return { error: { message: 'Authentication cancelled or failed.' } } as const;
  }

  const { access_token, refresh_token, error: oauthError, error_description } = extractParams(
    result.url
  );

  if (oauthError || !access_token || !refresh_token) {
    return {
      error: {
        message: error_description || oauthError || 'Missing tokens from OAuth response.',
      },
    } as const;
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (sessionError) {
    return { error: sessionError };
  }

  return { error: null } as const;
};
