import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../src/lib/supabaseClient";

export default function CreateProfileScreen() {
  const params = useLocalSearchParams();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [airline, setAirline] = useState("");
  const [base, setBase] = useState("");
  const [fleet, setFleet] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();

  const save = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const authedUser = data.user;
      const profileId = authedUser?.id ?? (params.userId as string | undefined);
      if (!profileId) {
        Alert.alert('Error', 'Could not determine user ID. Please sign in again.');
        return;
      }
      const { error } = await supabase.from("profiles").upsert({
        id: profileId,
        handle: handle.trim(),
        display_name: displayName.trim(),
        role: role.trim(),
        airline: airline.trim(),
        base: base.trim(),
        fleet: fleet.trim(),
      }).select().single();
      if (error) throw error;
      setShowSuccess(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.successInner}>
          <Text style={styles.h1}>Check your email</Text>
          <Text style={styles.successBody}>
            We sent a verification link to your email. Verify it to finish setup.
          </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            style={[styles.btn, { marginTop: 24 }]}
          >
            <Text style={styles.btnText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.h1}>Create Profile</Text>

          <Text style={styles.label}>Handle <Text style={{ color: 'red' }}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={handle}
            onChangeText={setHandle}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. flyguy123"
          />

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Marcus Wright"
          />

          <Text style={styles.label}>Role</Text>
          <TextInput
            style={styles.input}
            value={role}
            onChangeText={setRole}
            placeholder="e.g. Pilot, FA, Gate, etc."
          />

          <Text style={styles.label}>Airline</Text>
          <TextInput
            style={styles.input}
            value={airline}
            onChangeText={setAirline}
            placeholder="e.g. JetBlue, United, etc."
          />

          <Text style={styles.label}>Base</Text>
          <TextInput
            style={styles.input}
            value={base}
            onChangeText={setBase}
            placeholder="e.g. JFK, EWR, etc."
          />

          <Text style={styles.label}>Fleet <Text style={{ color: '#888' }}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            value={fleet}
            onChangeText={setFleet}
            placeholder="e.g. A320, 737, etc."
          />

          <Pressable
            onPress={save}
            disabled={loading || !handle.trim()}
            style={[styles.btn, (!handle.trim() || loading) && { opacity: 0.5 }]}
          >
            <Text style={styles.btnText}>{loading ? 'Saving...' : 'Save Profile'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  kav: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 32 },
  successInner: { flex: 1, padding: 20, justifyContent: 'center' },
  successBody: { fontSize: 18, marginVertical: 16, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 2, marginTop: 8 },
  h1: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  btn: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  btnText: { fontSize: 18, fontWeight: '700' },
});