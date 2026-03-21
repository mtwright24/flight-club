import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RoomPostDetailScreen from '../src/screens/RoomPostDetailScreen';

export default function RoomPostDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const postId = params.postId as string;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  if (!postId) return null;

  return <RoomPostDetailScreen postId={postId} onClose={handleClose} />;
}
