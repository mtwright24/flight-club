import React from 'react';
import { Stack } from 'expo-router';

export default function CrewExchangeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-post" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
