/**
 * Web: no `expo-notifications` native module — stubs so the bundle loads without
 * `NotificationsServerRegistrationModule` / native registration.
 */

export enum AndroidImportance {
  UNKNOWN = 0,
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7,
}

export enum AndroidNotificationVisibility {
  UNKNOWN = 0,
  PUBLIC = 1,
  PRIVATE = 2,
  SECRET = 3,
}

/** Subset of `Notifications.types` used in-app (keeps `typeof webStub` compatible with native impl). */
export enum SchedulableTriggerInputTypes {
  CALENDAR = 'calendar',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  DATE = 'date',
  TIME_INTERVAL = 'timeInterval',
}

export const getExpoPushTokenAsync = async (_options?: {
  projectId?: string;
}): Promise<{ data: string; type?: string }> => ({
  data: '',
});

export const scheduleNotificationAsync = async (_request: unknown): Promise<string> => '';

export const setNotificationChannelAsync = async (
  _id: string,
  _channel: Record<string, unknown>
): Promise<void> => {};

export function addNotificationReceivedListener(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _listener: (event: any) => void
): { remove: () => void } {
  return { remove: () => {} };
}

export function addNotificationResponseReceivedListener(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _listener: (response: any) => void
): { remove: () => void } {
  return { remove: () => {} };
}

export async function getLastNotificationResponseAsync(): Promise<null> {
  return null;
}

export function setNotificationHandler(_handler: unknown): void {}

export async function getPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export async function requestPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}
