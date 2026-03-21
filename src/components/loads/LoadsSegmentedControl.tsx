import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

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
    backgroundColor: '#fff',
    borderBottomWidth: 3,
    borderBottomColor: '#DC3545',
    shadowColor: '#DC3545',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    zIndex: 2,
  },
  tabText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: '#DC3545',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
