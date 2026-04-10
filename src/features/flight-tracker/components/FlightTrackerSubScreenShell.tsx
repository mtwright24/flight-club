import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../../styles/theme';

type Props = {
  title: string;
  children: React.ReactNode;
  /** Optional right control (e.g. refresh). Replaces the layout spacer. */
  headerRight?: React.ReactNode;
};

/**
 * Stack screens under Flight Tracker: red bar touches the status area (no white gap above),
 * same pattern as the hub and AppHeader.
 */
export function FlightTrackerSubScreenShell({ title, children, headerRight }: Props) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerWrap}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.cardBg} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text
              style={styles.headerTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              {...(Platform.OS === 'ios'
                ? { adjustsFontSizeToMinimumFontScale: true, minimumFontScale: 0.82 }
                : {})}
            >
              {title}
            </Text>
          </View>
          {headerRight != null ? (
            <View style={styles.headerRightSlot}>{headerRight}</View>
          ) : (
            <View style={styles.headerRightSpacer} />
          )}
        </View>
      </SafeAreaView>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cardBg },
  headerSafe: { backgroundColor: colors.headerRed },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.headerRed,
    height: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: 8,
    marginHorizontal: 2,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  headerTitle: {
    color: colors.cardBg,
    fontSize: 18,
    fontWeight: '800',
    textAlignVertical: 'center',
  },
  headerRightSpacer: { width: 24, height: 24 },
  headerRightSlot: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
