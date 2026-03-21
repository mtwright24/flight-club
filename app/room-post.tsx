import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CreatePostScreen from '../src/screens/CreatePostScreen';

export default function RoomPostRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const roomId = params.roomId as string;
  const startMode = (params.startMode as 'text' | 'photo') || 'text';

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handlePosted = useCallback(() => {
    router.replace({
      pathname: '/(tabs)/crew-rooms/room-home',
      params: { roomId, posted: '1' },
    });
  }, [router, roomId]);

  if (!roomId) return null;

  return (
    <CreatePostScreen
      roomId={roomId}
      onClose={handleClose}
      onPosted={handlePosted}
      startMode={startMode}
    />
  );
}
