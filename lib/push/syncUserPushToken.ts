/**
 * @deprecated Prefer `pushTokenRegistration.ts` — kept for stable import paths.
 */
export {
  deactivatePushTokensForUser,
  getLastRegisteredPushTokenSnapshot as getLastSyncedPushTokenSnapshot,
  registerPushTokenForSignedInUser as syncPushTokenForCurrentUser,
} from './pushTokenRegistration';
