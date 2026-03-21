declare module 'expo-notifications' {
	export type NotificationResponse = any;

	export function setNotificationHandler(handler: any): void;
	export function getPermissionsAsync(): Promise<{ status: string }>;
	export function requestPermissionsAsync(): Promise<{ status: string }>;
	export function getExpoPushTokenAsync(): Promise<{ data: string }>;
	export function addNotificationResponseReceivedListener(
		listener: (response: NotificationResponse) => void,
	): { remove(): void };
}

declare module 'expo-device' {
	export const isDevice: boolean;
}