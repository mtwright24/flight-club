import * as Linking from 'expo-linking';
import { createNotification } from './notifications';

/**
 * Deep link / share URL for opening a crew room in-app (Expo Router path).
 */
export function buildRoomDeepLink(roomId: string, roomName?: string): string {
  return Linking.createURL('/(tabs)/crew-rooms/room-home', {
    queryParams: {
      roomId,
      ...(roomName ? { roomName } : {}),
    },
  });
}

/**
 * Human-readable text for the system Share sheet (SMS, email, etc.).
 */
export function buildRoomSharePayload(roomName: string, roomId: string): { title?: string; message: string } {
  const url = buildRoomDeepLink(roomId, roomName);
  const message = `Join "${roomName}" on Flight Club — open this link in the app:\n\n${url}`;
  return {
    title: `Invite: ${roomName}`,
    message,
  };
}

/**
 * Sends an in-app notification the recipient can tap to open the crew room.
 */
export async function sendRoomInviteNotification(params: {
  recipientUserId: string;
  roomId: string;
  roomName: string;
  inviterUserId: string;
}): Promise<{ error: string | null }> {
  try {
    const route = `/(tabs)/crew-rooms/room-home?roomId=${encodeURIComponent(params.roomId)}&roomName=${encodeURIComponent(params.roomName)}`;
    await createNotification({
      user_id: params.recipientUserId,
      actor_id: params.inviterUserId,
      type: 'room_post',
      entity_type: 'room',
      entity_id: params.roomId,
      title: 'Crew room invite',
      body: `You're invited to "${params.roomName}". Tap to view the group.`,
      data: {
        route,
        room_id: params.roomId,
        room_name: params.roomName,
        room_invite: true,
      },
    });
    return { error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not send invite';
    return { error: msg };
  }
}
