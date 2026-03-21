import React from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../../styles/theme';
import ReactionTray from './ReactionTray';
import { ReactionType } from '../../lib/supabase/reactions';

interface ReactionTrayOverlayProps {
  visible: boolean;
  anchorLayout?: { x: number; y: number; width: number; height: number };
  selectedReaction?: ReactionType;
  reactionCounts?: Record<ReactionType, number>;
  onSelect: (reaction: ReactionType) => void;
  onClose: () => void;
}

const HORIZONTAL_PADDING = 12;
const TRAY_HEIGHT = 64;

export default function ReactionTrayOverlay({
  visible,
  anchorLayout,
  selectedReaction,
  reactionCounts,
  onSelect,
  onClose,
}: ReactionTrayOverlayProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!visible || !anchorLayout) return null;

  const trayWidth = Math.min(screenWidth - HORIZONTAL_PADDING * 2, 360);
  const anchorCenterX = anchorLayout.x + anchorLayout.width / 2;

  let trayX = anchorCenterX - trayWidth / 2;
  trayX = Math.max(HORIZONTAL_PADDING, Math.min(trayX, screenWidth - trayWidth - HORIZONTAL_PADDING));

  const minY = insets.top + 8;
  const maxY = screenHeight - TRAY_HEIGHT - insets.bottom - 8;
  let trayY = anchorLayout.y - TRAY_HEIGHT - 10;

  if (trayY < minY) {
    trayY = Math.min(anchorLayout.y + anchorLayout.height + 10, maxY);
  } else if (trayY > maxY) {
    trayY = maxY;
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.trayContainer,
            {
              left: trayX,
              top: trayY,
              width: trayWidth,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <ReactionTray
            selectedReaction={selectedReaction}
            reactionCounts={reactionCounts}
            onSelect={(reaction) => {
              onSelect(reaction);
              onClose();
            }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  trayContainer: {
    position: 'absolute',
    backgroundColor: colors.cardBg,
    borderRadius: radius.xl,
    paddingHorizontal: 4,
    paddingVertical: 4,
    ...shadow.cardShadow,
  },
});
