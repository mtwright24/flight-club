import { useEffect } from 'react';

import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from '../../lib/push/expoNotificationsApi';

/**
 * Dev-only: extra console visibility for foreground delivery and tray taps (in addition to `PushNotificationRoot`).
 */
export function LocalNotificationDebugListeners() {
  useEffect(() => {
    const received = addNotificationReceivedListener((event) => {
      const { request } = event;
      const content = request.content;
      console.log('[LocalNotifTest] received while app active', {
        identifier: request.identifier,
        title: content.title,
        body: content.body,
        data: content.data,
      });
    });

    const response = addNotificationResponseReceivedListener((res) => {
      const req = res.notification.request;
      const content = req.content;
      console.log('[LocalNotifTest] user interacted with notification (tap/action)', {
        identifier: req.identifier,
        title: content.title,
        body: content.body,
        data: content.data,
      });
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, []);

  return null;
}
