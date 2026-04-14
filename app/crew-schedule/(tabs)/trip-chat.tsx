import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import TripChatScreen from '../../../src/features/crew-schedule/screens/TripChatScreen';

export default function TripChatTabRoute() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = typeof tripId === 'string' ? tripId : Array.isArray(tripId) ? tripId[0] : undefined;
  return <TripChatScreen tripId={id} />;
}
