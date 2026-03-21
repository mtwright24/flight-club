import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RoomHomeScreen from '../../../src/screens/RoomHomeScreen';

export default function RoomHomePage() {
  const params = useLocalSearchParams();
  const roomId = params.roomId as string;
  const posted = params.posted as string | undefined;

  if (!roomId) return null;

  return <RoomHomeScreen roomId={roomId} posted={posted} />;
}
