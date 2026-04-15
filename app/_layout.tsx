import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, LogBox, View } from "react-native";
import 'react-native-url-polyfill/auto';
import { DmBadgeNavigationSync } from '../src/components/DmBadgeNavigationSync';
import FloatingBackButton from '../src/components/FloatingBackButton';
import { LocalNotificationDebugListeners } from '../src/components/LocalNotificationDebugListeners';
import { PushNotificationRoot } from '../src/components/PushNotificationRoot';
import { ThemeProvider } from '../src/context/ThemeContext';
import {
  ensureAuthSessionStarted,
  getAuthSessionSnapshot,
  subscribeAuthSession,
} from '../src/lib/authSessionStore';
import { clearProfileDraft, getProfileDraft } from '../src/lib/profileDraft';
import { supabase } from "../src/lib/supabaseClient";

export default function RootLayout() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Extract access_token and refresh_token from deep-link URL
  const handleDeepLink = async (url: string) => {
    try {
      console.log('[AUTH][DeepLink] received', url);
      // Check for tokens in query params (works for exp:// and flightclub:// callbacks).
      const urlObj = new URL(url);
      const accessToken = urlObj.searchParams.get("access_token");
      const refreshToken = urlObj.searchParams.get("refresh_token");
      const hash = urlObj.hash?.replace(/^#/, '') ?? '';
      const hashParams = new URLSearchParams(hash);
      const accessTokenFromHash = hashParams.get('access_token');
      const refreshTokenFromHash = hashParams.get('refresh_token');
      const finalAccessToken = accessToken ?? accessTokenFromHash;
      const finalRefreshToken = refreshToken ?? refreshTokenFromHash;
      console.log('[AUTH][DeepLink] token parse', {
        hasAccessToken: !!finalAccessToken,
        hasRefreshToken: !!finalRefreshToken,
      });

      if (finalAccessToken && finalRefreshToken) {
        // @ts-ignore
        const { error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });
        if (error) {
          console.log("[AUTH][DeepLink] setSession error:", error);
        } else {
          console.log("[AUTH][DeepLink] Session set from deep-link");
        }
      }
    } catch (err) {
      console.log("[AUTH][DeepLink] handleDeepLink error:", err);
    }
  };

  useEffect(() => {
    let mounted = true;
    LogBox.ignoreLogs([
      "SafeAreaView has been deprecated and will be removed in a future release.",
    ]);

    (async () => {
      try {
        // Handle deep link redirect from magic link.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl != null) {
          handleDeepLink(initialUrl);
        }
      } catch {
        /* ignore */
      }
    })();

    ensureAuthSessionStarted();
    const syncFromStore = () => {
      if (!mounted) return;
      const snap = getAuthSessionSnapshot();
      setSession(snap.session);
      setLoading(snap.loading);
    };
    syncFromStore();
    const unsubscribeStore = subscribeAuthSession(syncFromStore);

    // Listen for runtime deep-links while the app is open.
    const urlHandler = async ({ url }: { url: string }) => {
      handleDeepLink(url);
    };
    const linkingSub = Linking.addEventListener("url", urlHandler as any);

    return () => {
      mounted = false;
      unsubscribeStore();
      linkingSub.remove();
    };
  }, []);

  // decide route after initial load
  useEffect(() => {
    if (loading) return;

    (async () => {
      // 1. If session exists, check for local profile draft and upsert if present
      if (session && session.user) {
        const draft = await getProfileDraft();
        if (draft) {
          try {
            const { error } = await supabase.from("profiles").upsert({
              id: session.user.id,
              email: session.user.email,
              handle: draft.handle,
              display_name: draft.displayName,
              role: draft.role,
              airline: draft.airline,
              base: draft.base,
              fleet: draft.fleet,
            }).select().single();
            if (!error) {
              await clearProfileDraft();
              console.log("Draft profile upserted and cleared");
            } else {
              console.log("Draft upsert error:", error);
            }
          } catch (err) {
            console.log("Draft upsert exception:", err);
          }
        }
      }

      // 2. Routing logic
      try {
        if (!session || !session.user) {
          router.replace("/(auth)/sign-in");
          return;
        }
        const userId = session.user.id;
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("handle")
          .eq("id", userId)
          .maybeSingle();
        if (error) {
          router.replace("/(tabs)");
          return;
        }
        if (!profile || !profile.handle) {
          router.replace("/(auth)/CreateProfileScreen");
        } else {
          router.replace("/(tabs)");
        }
      } catch (err) {
        router.replace("/(tabs)");
      }
    })();
  }, [loading, session, router]);

  // Always render a navigator immediately so the router is mounted.
  // Show a simple loading overlay while initial session is being resolved.
  return (
    <ThemeProvider>
      <>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen
            name="menu"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="account-settings"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="messages-inbox"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="new-message"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="dm-thread"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
        </Stack>
        <DmBadgeNavigationSync />
        {__DEV__ ? <LocalNotificationDebugListeners /> : null}
        <PushNotificationRoot />
        <FloatingBackButton />
        {loading && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" />
          </View>
        )}
      </>
    </ThemeProvider>
  );
}