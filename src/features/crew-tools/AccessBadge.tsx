import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../styles/theme';
import type { ToolAccess } from './types';

const LABEL: Record<ToolAccess, string> = {
  free: 'FREE',
  pro: 'PRO',
  included: 'INCLUDED',
  addon: 'ADD-ON',
  bundle: 'BUNDLE',
  owned: 'OWNED',
  beta: 'BETA',
  new: 'NEW',
};

const PRO_GOLD = '#B45309';

export default function AccessBadge({ access, variant = 'default' }: { access: ToolAccess; variant?: 'default' | 'goldPro' }) {
  if (access === 'pro' && variant === 'goldPro') {
    return (
      <View style={[styles.pill, styles.goldPill]}>
        <Text style={styles.goldText}>PRO</Text>
      </View>
    );
  }

  const isLight =
    access === 'free' || access === 'pro' || access === 'new' || access === 'beta' || access === 'included';

  return (
    <View style={[styles.pill, isLight ? styles.redTint : styles.neutralPill]}>
      <Text style={[styles.text, isLight ? styles.redText : styles.neutralText]}>{LABEL[access]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  redTint: {
    backgroundColor: 'rgba(181, 22, 30, 0.12)',
  },
  neutralPill: {
    backgroundColor: '#EEF2FF',
  },
  goldPill: {
    backgroundColor: 'rgba(180, 83, 9, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.35)',
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  redText: {
    color: colors.headerRed,
  },
  neutralText: {
    color: '#3730A3',
  },
  goldText: {
    color: PRO_GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
