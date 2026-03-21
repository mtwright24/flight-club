import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PostMediaViewerScreen from '../src/screens/PostMediaViewerScreen';

export default function PostMediaViewerRoute() {
  const router = useRouter();

  return <PostMediaViewerScreen />;
}
