import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../../styles/theme';

interface LoadsSegmentedControlProps {
  tabs: string[];
  selectedIndex: number;
  onTabPress: (index: number) => void;
}

export default function LoadsSegmentedControl({ tabs, selectedIndex, onTabPress }: LoadsSegmentedControlProps) {
  return (
    <View style={styles.shadowWrap}>
      <View style={styles.row}>
        {tabs.map((tab, i) => (
          <Pressable
            key={tab}
            style={[styles.tab, i === selectedIndex && styles.tabActive, i === 0 && styles.firstTab, i === tabs.length - 1 && styles.lastTab]}
            onPress={() => onTabPress(i)}
          >
            <Text style={[styles.tabText, i === selectedIndex && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  firstTab: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  lastTab: {
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  tabActive: {
    backgroundColor: 'transparent',
    borderBottomWidth: 3,
    borderBottomColor: colors.headerRed,
    zIndex: 2,
  },
  tabText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: colors.headerRed,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
