import { Stack } from 'expo-router';
import React from 'react';

export default function StaffLoadRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { flex: 1, backgroundColor: '#f8fafc' },
      }}
    />
  );
}
