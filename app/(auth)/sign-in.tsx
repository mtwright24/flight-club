// app/(auth)/sign-in.tsx
import React, { useRef, useState } from 'react';
import { Text, TouchableOpacity, Alert, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { authTheme } from '../../src/styles/authTheme';
import { supabase } from '../../src/lib/supabaseClient';
import { signInWithGoogle } from '../../src/lib/auth/googleOAuth';
import {
  AuthBackground,
  AuthBrandHeader,
  GlassPanel,
  AuthTabs,
  AuthTextField,
  PrimaryAuthButton,
  SocialAuthButtons,
} from '../../src/components/auth';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const onSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter email and password.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        Alert.alert('Sign in failed', error.message);
        return;
      }
      // Let auth gate/root layout handle navigation
    } finally {
      setLoading(false);
    }
  };

  const onPressApple = () => {
    // TODO: Wire Apple OAuth
  };

  const onPressGoogle = async () => {
    console.log('[AUTH][UI] Google pressed on Sign In');
    const { error } = await signInWithGoogle();
    if (error) {
      console.error('[AUTH][UI] Google sign in failed', error.message);
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
          active="sign-in"
          onChange={(next) =>
            router.replace(next === 'sign-in' ? '/(auth)/sign-in' : '/(auth)/sign-up')
          }
        />
        <AuthTextField
          placeholder="Email"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <AuthTextField
          ref={passwordRef}
          placeholder="Password (6+ characters)"
          leftIcon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
          onRightPress={() => setShowPassword((v) => !v)}
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={() => {
            void onSignIn();
          }}
        />
        <PrimaryAuthButton
          label={loading ? 'SIGNING IN...' : 'SIGN IN'}
          onPress={onSignIn}
          disabled={loading}
        />
        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>
        <SocialAuthButtons onPressApple={onPressApple} onPressGoogle={onPressGoogle} />
      </GlassPanel>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  forgot: {
    color: authTheme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: authTheme.spacing.s8,
    marginBottom: authTheme.spacing.s16,
    fontWeight: '500',
  },
});