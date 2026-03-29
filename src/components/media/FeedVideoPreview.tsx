import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import React, { useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  uri: string;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  /** When set, container gets this height (feed hero slot). */
  height?: number;
  onPress?: () => void;
  showPlayBadge?: boolean;
};

/**
 * Muted paused preview for feed grids — use full viewer for playback with controls.
 */
export function FeedVideoPreview({
  uri,
  posterUri,
  style,
  height,
  onPress,
  showPlayBadge = true,
}: Props) {
  const ref = useRef<Video>(null);
  const boxStyle: StyleProp<ViewStyle> = [styles.wrap, height != null ? { height } : null, style];

  const core = (
    <View style={boxStyle}>
      <Video
        ref={ref}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isMuted
        shouldPlay={false}
        isLooping={false}
        useNativeControls={false}
        posterSource={posterUri ? { uri: posterUri } : undefined}
        posterStyle={StyleSheet.absoluteFill}
      />
      {showPlayBadge ? (
        <View style={styles.playBadge} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{core}</Pressable>;
  }
  return core;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  playBadge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
