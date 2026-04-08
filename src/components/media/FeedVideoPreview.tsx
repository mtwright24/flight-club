import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

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
  const [posterHidden, setPosterHidden] = useState(!posterUri);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const boxStyle: StyleProp<ViewStyle> = [styles.wrap, height != null ? { height } : null, style];
  const showPosterLayer = Boolean(posterUri) && !posterHidden;

  const core = (
    <View style={boxStyle}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => {
          if (posterUri) setPosterHidden(true);
        }}
      />
      {showPosterLayer ? (
        <View style={[StyleSheet.absoluteFillObject, styles.posterOverlay]} pointerEvents="none">
          <Image source={{ uri: posterUri! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        </View>
      ) : null}
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
  posterOverlay: {
    zIndex: 1,
  },
  playBadge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  playCircle: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
