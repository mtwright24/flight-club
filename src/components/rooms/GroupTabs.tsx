import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../../styles/theme';

export type TabType = 'featured' | 'chat' | 'about' | 'members';

interface GroupTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'chat', label: 'Chat' },
  { key: 'about', label: 'About' },
  { key: 'members', label: 'Members' },
];

export default function GroupTabs({ activeTab, onTabChange }: GroupTabsProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => (
        <Pressable
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          onPress={() => onTabChange(tab.key)}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.headerRed,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.headerRed,
    fontWeight: '700',
  },
});
