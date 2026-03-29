/**
 * Push-specific re-exports. All routing resolves through `lib/notificationRouting.ts`.
 */
export {
  buildNotificationRouteContextFromPayload,
  normalizeNotificationTypeForRouting,
  normalizeNotificationTypeForRouting as normalizePushNotificationType,
  notificationRecordToRoutingPayload,
  resolveNotificationHrefFromPayload,
  resolveNotificationHrefFromPayload as resolveHrefFromPushNotificationData,
  resolveNotificationPathFromPayload,
} from '../notificationRouting';
