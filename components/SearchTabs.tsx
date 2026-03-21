import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

export type SearchTabKey = 'all' | 'people' | 'posts' | 'rooms' | 'tools';

type Props = {
  activeTab: SearchTabKey;
  onChange: (tab: SearchTabKey) => void;
};

const TABS: { key: SearchTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'People' },
  { key: 'posts', label: 'Posts' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'tools', label: 'Tools' },
];

export default function SearchTabs({ activeTab, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsScrollContent}
    >
      <View style={styles.tabsRow}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                !active && pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabsScrollContent: {
    paddingHorizontal: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    marginHorizontal: 6,
    marginVertical: 4,
  },
  tabActive: {
    backgroundColor: '#B5161E',
    borderColor: '#B5161E',
  },
  tabPressed: {
    backgroundColor: '#E5E7EB',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});
