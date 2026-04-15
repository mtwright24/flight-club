import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CrewHonorReactionType, CrewHonorWinner } from '../../../lib/crewHonors';
import { CH } from './crewHonorsTheme';

/** MVP reaction set (positive only) — matches DB enum subset. */
export const CREW_HONOR_REACTION_ORDER: CrewHonorReactionType[] = ['heart', 'trophy', 'clap', 'fire', 'salute'];

const reactionIcon: Record<CrewHonorReactionType, keyof typeof Ionicons.glyphMap> = {
  clap: 'hand-left-outline',
  trophy: 'trophy-outline',
  heart: 'heart-outline',
  fire: 'flame-outline',
  salute: 'shield-checkmark-outline',
  airplane_star: 'airplane-outline',
};

type Props = {
  winner: CrewHonorWinner;
  compact?: boolean;
  /** Tighter pills + icons for modal / hero strip. */
  dense?: boolean;
  busy?: boolean;
  onToggle: (reaction: CrewHonorReactionType) => void;
};

export default function CrewHonorReactionBar({ winner, compact, dense, busy, onToggle }: Props) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, dense && styles.rowDense]}>
      {busy ? <ActivityIndicator color={CH.red} size="small" style={{ marginRight: 8 }} /> : null}
      {CREW_HONOR_REACTION_ORDER.map((r) => {
        const active = winner.my_reactions.includes(r);
        const count = winner.reaction_counts[r] || 0;
        const showCount = count > 0 || active;
        const iconSize = dense ? 15 : compact ? 16 : 18;
        return (
          <Pressable
            key={r}
            onPress={() => onToggle(r)}
            disabled={busy}
            style={[styles.pill, compact && styles.pillCompact, dense && styles.pillDense, active && styles.pillActive]}
            hitSlop={4}
          >
            <Ionicons name={reactionIcon[r]} size={iconSize} color={active ? '#fff' : CH.navy} />
            {showCount ? (
              <Text style={[styles.count, dense && styles.countDense, active && styles.countActive]}>{count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  rowCompact: { gap: 6 },
  rowDense: { gap: 5, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CH.line,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pillCompact: { paddingHorizontal: 8, paddingVertical: 6 },
  pillDense: { paddingHorizontal: 7, paddingVertical: 5, gap: 3 },
  pillActive: { backgroundColor: CH.red, borderColor: CH.red },
  count: { color: CH.navySoft, fontWeight: '800', fontSize: 12, minWidth: 10 },
  countDense: { fontSize: 11 },
  countActive: { color: '#fff' },
});
