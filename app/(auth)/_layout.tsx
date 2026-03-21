import { Stack } from "expo-router";

/*
  Stack for auth screens. Child route files in app/(auth) are:
  - sign-in.tsx
  - sign-up.tsx
  - CreateProfileScreen.tsx
  - forgot-password.tsx
  Reference them by their file names (no group prefix).
*/

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="CreateProfileScreen" />
    </Stack>
  );
}
