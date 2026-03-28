import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../src/styles/theme';

export type InboxSummaryItem = {
  key: string;
  title: string;
  subtitle: string;
  count: number;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  onPress: () => void;
};

type Props = {
  items: InboxSummaryItem[];
};

export default function NotificationInboxSummary({ items }: Props) {
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.key}>
          <Pressable
            onPress={item.onPress}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.92 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={17} color={item.iconColor} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </View>
            <View style={styles.rightCol}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.count > 99 ? '99+' : String(item.count)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C4C8CE" />
            </View>
          </Pressable>
          {i < items.length - 1 ? <View style={styles.rowSep} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.cardBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.headerRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.cardBg,
    fontSize: 12,
    fontWeight: '800',
  },
  rowSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 38 + 12,
  },
});
