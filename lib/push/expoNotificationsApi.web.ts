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

export const getExpoPushTokenAsync = async (_options?: {
  projectId?: string;
}): Promise<{ data: string; type?: string }> => ({
  data: '',
});

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
