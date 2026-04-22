import { Stack } from 'expo-router';

export default function CrewScheduleStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="trip-detail" />
      <Stack.Screen name="import-schedule" />
      <Stack.Screen name="import-jetblue-source" />
      <Stack.Screen name="import-flica-direct" />
      <Stack.Screen name="import-jetblue-upload" />
      <Stack.Screen name="import-jetblue-review/[importId]" />
      <Stack.Screen name="import-jetblue-pairing/[pairingId]" />
    </Stack>
  );
}
