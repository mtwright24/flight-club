import { Stack } from 'expo-router';
import React from 'react';

export default function LoadsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /** Default stack background is white; match Staff Loads surfaces so no slab shows at bottom. */
        contentStyle: { flex: 1, backgroundColor: '#f8fafc' },
      }}
    />
  );
}
