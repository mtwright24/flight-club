// NOTE: These imports require expo-notifications and expo-device to be installed in your project.
// If your linter complains before those packages are added, you can temporarily disable the rule.
// eslint-disable-next-line import/no-unresolved
import * as Device from 'expo-device';
// eslint-disable-next-line import/no-unresolved
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session?.user?.id) return;

    let isMounted = true;

    const registerAsync = async () => {
      try {
        if (!Device.isDevice) {
          console.log('[Push] Must use physical device for Push Notifications');
          return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('[Push] Permission not granted');
          return;
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenResponse.data;
        if (!pushToken) return;

        if (!isMounted) return;

        await supabase.from('user_push_tokens').upsert({
          user_id: session.user.id,
          push_token: pushToken,
          platform: Platform.OS,
        });
      } catch (err) {
        console.log('[Push] Registration error', err);
      }
    };

    registerAsync();

    const responseSub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data: any = response.notification.request.content.data || {};
      if (data.route) {
        try {
          router.push(data.route as any);
        } catch (err) {
          console.log('[Push] Failed to route from notification', err);
        }
      }
    });

    return () => {
      isMounted = false;
      responseSub.remove();
    };
  }, [session?.user?.id, router]);
}
