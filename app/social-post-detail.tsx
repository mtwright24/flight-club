import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SocialPostDetailScreen from '../src/screens/SocialPostDetailScreen';

export default function SocialPostDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const postId = params.postId as string;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  if (!postId) return null;

  return (
    <SocialPostDetailScreen
      postId={postId}
      onClose={handleClose}
    />
  );
}
