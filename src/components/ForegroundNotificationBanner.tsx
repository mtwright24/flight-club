import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOW, colors } from '../styles/theme';

export type ForegroundBannerPayload = {
  id: string;
  title: string;
  body: string;
  /** Actor / sender avatar when present */
  avatarUrl?: string;
  /** Optional small image (e.g. app or entity icon) when no avatar */
  iconUrl?: string;
  data: Record<string, unknown>;
};

type Props = {
  item: ForegroundBannerPayload | null;
  onDismiss: () => void;
  /** Uses centralized `resolveNotificationHrefFromPayload` (same as tray / push response taps). */
  onPress: (item: ForegroundBannerPayload) => void;
  /** Auto-dismiss delay (ms). */
  autoDismissMs?: number;
};

const DEFAULT_DISMISS_MS = 4500;

/**
 * Flight Club branded in-app banner for foreground push: slides from top, safe-area aware,
 * queues handled by parent (`PushNotificationRoot`).
 */
export default function ForegroundNotificationBanner({
  item,
  onDismiss,
  onPress,
  autoDismissMs = DEFAULT_DISMISS_MS,
}: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-28)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDismissAnimation = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -18, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [onDismiss, opacity, translateY]);

  useEffect(() => {
    if (!item) return;

    opacity.setValue(0);
    translateY.setValue(-28);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();

    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      runDismissAnimation();
    }, autoDismissMs);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [item?.id, autoDismissMs, opacity, translateY, runDismissAnimation]);

  const handleBannerPress = useCallback(() => {
    if (!item) return;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    onPress(item);
  }, [item, onPress]);

  if (!item) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden={false}
      importantForAccessibility="yes"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 10,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.card, SHADOW.card]} accessibilityRole="none">
        <View style={styles.accentStripe} accessibilityElementsHidden />
        <Pressable
          onPress={handleBannerPress}
          style={({ pressed }) => [styles.mainTap, pressed && styles.mainTapPressed]}
          accessibilityRole="button"
          accessibilityLabel={
            item.title
              ? `Open notification: ${item.title}`
              : 'Open notification'
          }
        >
          <View style={styles.row}>
            <BannerArt avatarUrl={item.avatarUrl} iconUrl={item.iconUrl} />
            <View style={styles.textCol}>
              <View style={styles.titleRow}>
                <View style={styles.blueAccent} accessibilityElementsHidden />
                {item.title ? (
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                ) : (
                  <Text style={styles.titleFallback} numberOfLines={1}>
                    Flight Club
                  </Text>
                )}
              </View>
              {item.body ? (
                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={runDismissAnimation}
          hitSlop={12}
          style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissPressed]}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function BannerArt({ avatarUrl, iconUrl }: { avatarUrl?: string; iconUrl?: string }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />;
  }
  if (iconUrl) {
    return <Image source={{ uri: iconUrl }} style={styles.avatar} contentFit="contain" />;
  }
  return (
    <View style={styles.avatarPlaceholder}>
      <Ionicons name="notifications" size={22} color={colors.headerRed} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 14,
  },
  card: {
    position: 'relative',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.red,
  },
  mainTap: {
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 44,
  },
  mainTapPressed: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.tint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(181, 22, 30, 0.15)',
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  blueAccent: {
    width: 3,
    height: 18,
    marginTop: 2,
    borderRadius: 2,
    backgroundColor: colors.accentBlue,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  titleFallback: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.red,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 19,
  },
  dismissBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    padding: 4,
    borderRadius: 8,
  },
  dismissPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
});
