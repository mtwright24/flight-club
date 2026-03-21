import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FlightClubHeader from '../src/components/FlightClubHeader';
import { supabase } from '../src/lib/supabaseClient';
import { colors, spacing, radius } from '../src/styles/theme';

export default function MenuScreen() {
  const router = useRouter();

  const handleAccountSettings = () => {
    router.dismiss();
    setTimeout(() => router.push('/account-settings'), 300);
  };

  const handleEditProfile = () => {
    router.dismiss();
    setTimeout(() => router.push('/edit-profile'), 300);
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            router.dismiss();
            await supabase.auth.signOut();
            router.replace('/(auth)/sign-in');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.wrap} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Menu</Text>
        <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Pressable style={styles.menuItem} onPress={() => {
          router.push('/account-settings');
        }}>
          <Ionicons name="person-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Account & Settings</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/edit-profile')}>
          <Ionicons name="create-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/privacy-safety')}>
          <Ionicons name="shield-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Privacy & Safety</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/complete-setup')}>
          <Ionicons name="star-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Complete Your Setup</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/notifications-settings')}>
          <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Notification Settings</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/help-support')}>
          <Ionicons name="help-circle-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/about-flight-club')}>
          <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.menuText}>About Flight Club</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.menuItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#E63946" />
          <Text style={[styles.menuText, { color: '#E63946' }]}>Log Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  content: { 
    flex: 1, 
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  divider: {
    height: spacing.md,
  },
});
