// app/(auth)/sign-up.tsx
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabaseClient';
import { signInWithGoogle } from '../../src/lib/auth/googleOAuth';
import { getAuthRedirectUri } from '../../src/lib/auth/redirectUri';
import { authTheme } from '../../src/styles/authTheme';
import {
  AuthBackground,
  AuthBrandHeader,
  GlassPanel,
  AuthTabs,
  AuthTextField,
  PrimaryAuthButton,
  SocialAuthButtons,
} from '../../src/components/auth';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const authRedirectUri = getAuthRedirectUri();

  const onSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUri,
        },
      });
      if (error) {
        Alert.alert('Sign up failed', error.message);
        return;
      }
      const userId = data.user?.id;
      router.replace({ pathname: '/(auth)/CreateProfileScreen', params: { email: email.trim(), userId } });
    } finally {
      setLoading(false);
    }
  };

  const onMagicLink = async () => {
    if (!email) {
      Alert.alert('Missing email', 'Please enter your email.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authRedirectUri,
        },
      });
      if (error) {
        Alert.alert('Magic link failed', error.message);
        return;
      }
      Alert.alert('Check your email', 'We sent a magic link to ' + email);
    } finally {
      setLoading(false);
    }
  };

  const onPressApple = () => {
    // TODO: Wire Apple OAuth
  };

  const onPressGoogle = async () => {
    console.log('[AUTH][UI] Google pressed on Sign Up');
    const { error } = await signInWithGoogle();
    if (error) {
      console.error('[AUTH][UI] Google sign up failed', error.message);
      Alert.alert('Google sign in failed', error.message);
    } else {
      console.log('[AUTH][UI] Google auth flow launched; waiting for callback');
    }
  };

  return (
    <AuthBackground>
      <AuthBrandHeader />
      <GlassPanel>
        <AuthTabs
          active="sign-up"
          onChange={(next) =>
            router.replace(next === 'sign-in' ? '/(auth)/sign-in' : '/(auth)/sign-up')
          }
        />
        <AuthTextField
          placeholder="Email"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
        />
        <AuthTextField
          placeholder="Password (6+ characters)"
          leftIcon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <PrimaryAuthButton
          label={loading ? 'CREATING...' : 'CREATE ACCOUNT'}
          onPress={onSignUp}
          disabled={loading}
        />
        <SocialAuthButtons onPressApple={onPressApple} onPressGoogle={onPressGoogle} />
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.divider} />
        </View>
        <TouchableOpacity
          style={styles.magicBtn}
          onPress={onMagicLink}
          disabled={loading || !email}
        >
          <Text style={styles.magicBtnText}>Send Magic Link</Text>
        </TouchableOpacity>
      </GlassPanel>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: authTheme.spacing.s16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: authTheme.colors.glassBorder,
  },
  dividerText: {
    color: authTheme.colors.textMuted,
    marginHorizontal: authTheme.spacing.s12,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  magicBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    height: 60,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: authTheme.spacing.s8,
    shadowColor: 'rgba(0,0,0,0.55)',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  magicBtnText: {
    color: authTheme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.2,
  },
});