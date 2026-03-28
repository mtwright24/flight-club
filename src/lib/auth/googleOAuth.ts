import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabaseClient';
import { getAuthRedirectUri } from './redirectUri';

WebBrowser.maybeCompleteAuthSession();

export const signInWithGoogle = async () => {
  const redirectUri = getAuthRedirectUri();
  console.log('[AUTH][Google] redirectUri', redirectUri);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    console.error('[AUTH][Google] signInWithOAuth error', error.message);
    return { error };
  }
  console.log('[AUTH][Google] authUrl created', data.url);

  // Revert to plain browser launch in Expo Go.
  // This is more reliable for reaching Google auth on iOS than openAuthSessionAsync here.
  try {
    const result = await WebBrowser.openBrowserAsync(data.url);
    console.log('[AUTH][Google] browser opened result', result);
    return { error: null } as const;
  } catch (openErr: any) {
    console.error('[AUTH][Google] openBrowser error', openErr?.message || String(openErr));
    return { error: { message: openErr?.message || 'Could not open browser auth session.' } } as const;
  }
};
