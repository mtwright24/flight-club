// app/(auth)/auth/reset.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabaseClient';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    // Check if we have a recovery token from the URL
    const token = searchParams.token;

    if (token) {
      setTokenValid(true);
    } else {
      Alert.alert('Invalid reset link', 'This password reset link is invalid or expired.');
      router.replace('/(auth)/sign-in');
    }
  }, [searchParams, router]);

  const onUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing password', 'Please enter and confirm your new password.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both passwords are the same.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert('Password update failed', error.message);
        return;
      }

      Alert.alert('Success', 'Your password has been updated. Please sign in again.');
      router.replace('/(auth)/sign-in');
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      console.log('Password update error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!tokenValid) {
    return (
      <View style={styles.page}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Set New Password</Text>

      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New Password"
        secureTextEntry
        style={styles.input}
        editable={!loading}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm Password"
        secureTextEntry
        style={styles.input}
        editable={!loading}
      />

      <Pressable onPress={onUpdatePassword} disabled={loading} style={styles.button}>
        <Text style={styles.buttonText}>{loading ? 'Updating...' : 'Update Password'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 42, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  button: { borderWidth: 1, borderRadius: 10, padding: 16 },
  buttonText: { textAlign: 'center', fontSize: 18, fontWeight: '700' },
});
