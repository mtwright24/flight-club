import React, { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import CreateSocialPostScreen from '../src/screens/CreateSocialPostScreen';

export default function SocialPostRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const type = (params.type as string | undefined) || 'text';

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handlePosted = useCallback(() => {
    router.replace('/(tabs)/feed');
  }, [router]);

  return (
    <CreateSocialPostScreen
      onClose={handleClose}
      onPosted={handlePosted}
      initialType={type as any}
    />
  );
}
