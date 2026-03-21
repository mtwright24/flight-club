import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';

export default function RoomDetail() {
  const params = useLocalSearchParams();
  const { id: roomId } = params as { id: string };
  const router = useRouter();

  useEffect(() => {
    if (roomId) {
      router.replace({
        pathname: '/room-home',
        params: { roomId },
      });
    }
  }, [roomId, router]);

  return null;
}
