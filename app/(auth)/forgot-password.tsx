// app/(auth)/forgot-password.tsx
import React, { useState } from 'react';
import { Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabaseClient';
import { authTheme } from '../../src/styles/authTheme';
import {
  AuthBackground,
  AuthBrandHeader,
  GlassPanel,
  AuthTextField,
  PrimaryAuthButton,
} from '../../src/components/auth';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const onSendReset = async () => {
    if (!email) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    try {
      setLoading(true);
      setStatus(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'flightclub://auth-callback',
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      setStatus('Check your email for a password reset link.');
      setEmail('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground>
      <AuthBrandHeader />
      <GlassPanel>
        <Text style={styles.title}>Forgot Password?</Text>
        <AuthTextField
          placeholder="Email"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
        />
        <PrimaryAuthButton
          label={loading ? 'SENDING...' : 'SEND RESET LINK'}
          onPress={onSendReset}
          disabled={loading}
        />
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.back}>Back to Sign In</Text>
        </TouchableOpacity>
      </GlassPanel>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  title: {
    color: authTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: authTheme.spacing.s16,
  },
  status: {
    color: authTheme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: authTheme.spacing.s8,
    marginBottom: authTheme.spacing.s8,
    fontWeight: '500',
  },
  back: {
    color: authTheme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: authTheme.spacing.s12,
    fontWeight: '600',
  },
});
