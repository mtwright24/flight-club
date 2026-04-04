declare module 'expo-notifications' {
	export type NotificationResponse = any;

	export function setNotificationHandler(handler: any): void;
	export function getPermissionsAsync(): Promise<{ status: string }>;
	export function requestPermissionsAsync(): Promise<{ status: string }>;
	export function getExpoPushTokenAsync(): Promise<{ data: string }>;
	export function addNotificationResponseReceivedListener(
		listener: (response: NotificationResponse) => void,
	): { remove(): void };
	export function addNotificationReceivedListener(listener: (event: any) => void): { remove(): void };

	/** Local notification scheduling (see `lib/notifications/localNotificationTest.ts`). */
	export function scheduleNotificationAsync(request: unknown): Promise<string>;
	export function setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<void>;

	export enum AndroidImportance {
		MAX = 7,
	}

	export enum AndroidNotificationVisibility {
		PUBLIC = 1,
	}

	export enum SchedulableTriggerInputTypes {
		TIME_INTERVAL = 'timeInterval',
	}
}

declare module 'expo-device' {
	export const isDevice: boolean;
}