import React, { useCallback, useEffect } from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * Full-screen import screenshot: pinch to zoom, drag when zoomed (read small FLICA text on device).
 */
export default function ZoomableImportImage({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
  }, [scale, savedScale, translateX, translateY]);

  useEffect(() => {
    if (!visible) {
      resetTransform();
    }
  }, [visible, resetTransform]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = savedScale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = clamp(next, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        savedScale.value = MIN_SCALE;
      } else if (scale.value > MAX_SCALE) {
        scale.value = withTiming(MAX_SCALE);
        savedScale.value = MAX_SCALE;
      }
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startTx.value = translateX.value;
      startTy.value = translateY.value;
    })
    .onUpdate((e) => {
      if (savedScale.value > 1.02) {
        translateX.value = startTx.value + e.translationX;
        translateY.value = startTy.value + e.translationY;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const imgW = SCREEN_W - 24;
  const imgH = SCREEN_H * 0.72;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.hint}>Pinch to zoom · drag when zoomed</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          {uri ? (
            <GestureDetector gesture={composed}>
              <Animated.View style={[styles.zoomBox, animatedStyle]}>
                <Image source={{ uri }} style={{ width: imgW, height: imgH }} resizeMode="contain" />
              </Animated.View>
            </GestureDetector>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  hint: { color: '#94A3B8', fontSize: 13, flex: 1, marginRight: 8 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  closeText: { color: '#38BDF8', fontSize: 16, fontWeight: '800' },
  zoomBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
