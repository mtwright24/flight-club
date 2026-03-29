import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../src/styles/theme';

/** Shared size + color for Home top tiles and shortcut chips (binary unread, no numbers). */
export const HOME_UNREAD_DOT_SIZE = 6;

const styles = StyleSheet.create({
  core: {
    width: HOME_UNREAD_DOT_SIZE,
    height: HOME_UNREAD_DOT_SIZE,
    borderRadius: HOME_UNREAD_DOT_SIZE / 2,
    backgroundColor: colors.accentBlue,
  },
  tileCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  inline: {
    marginLeft: 6,
  },
});

type Props = {
  visible: boolean;
  /** `tileCorner` — parent must be `position: 'relative'`; dot sits inside top-right. `inline` — same row as label, after text. */
  placement: 'tileCorner' | 'inline';
};

/**
 * Single shared blue dot for Home unread hints (top four tiles + shortcut chips).
 * Static; no number badge inside.
 */
export default function HomeUnreadDot({ visible, placement }: Props) {
  if (!visible) return null;
  if (placement === 'tileCorner') {
    return (
      <View style={styles.tileCorner} pointerEvents="none">
        <View style={styles.core} />
      </View>
    );
  }
  return <View style={[styles.core, styles.inline]} />;
}
