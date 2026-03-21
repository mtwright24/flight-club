import { Stack } from 'expo-router';

export default function CrewRoomsLayout() {
  return (
    <Stack
      screenOptions={{
        // Use the parent tabs header (CrewRoomsHeaderNav) and avoid a second red header here.
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="room-home" />
    </Stack>
  );
}
