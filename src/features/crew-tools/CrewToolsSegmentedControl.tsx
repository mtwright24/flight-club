import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';
import type { CrewToolsMode } from './types';

const TABS: { key: CrewToolsMode; label: string }[] = [
  { key: 'my', label: 'My Tools' },
  { key: 'explore', label: 'Explore' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'saved', label: 'Saved' },
];

type Props = {
  mode: CrewToolsMode;
  onChange: (mode: CrewToolsMode) => void;
};

export default function CrewToolsSegmentedControl({ mode, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TABS.map((t) => {
          const active = mode === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 6,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  tabActive: {
    backgroundColor: colors.headerRed,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.02,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
});
