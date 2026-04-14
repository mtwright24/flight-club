import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type Props = {
  uri: string;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  /** When set, container gets this height (feed hero slot). */
  height?: number;
  onPress?: () => void;
  showPlayBadge?: boolean;
  /**
   * Single full-width feed video: muted autoplay when active, tap = pause/play, corner actions for sound + open detail.
   * Omit for grid / non-feed usage (static preview + optional wrap tap).
   */
  feedHero?: FeedHeroConfig;
};

export type FeedHeroConfig = {
  isActive: boolean;
  feedAutoplayEnabled: boolean;
  screenFocused: boolean;
  appForeground: boolean;
  onOpenDetail: () => void;
};

/**
 * Feed grid/attachment preview (muted, paused) or full-width feed hero with optional autoplay.
 * Autoplay: see {@link FeedHeroConfig} — plays only when active, screen focused, and app foreground; always starts muted.
 */
export function FeedVideoPreview({
  uri,
  posterUri,
  style,
  height,
  onPress,
  showPlayBadge = true,
  feedHero,
}: Props) {
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
  });

  useEffect(() => {
    setHasRenderedFrame(false);
  }, [uri]);

  const shouldAutoplay =
    !!feedHero &&
    feedHero.feedAutoplayEnabled &&
    feedHero.isActive &&
    feedHero.screenFocused &&
    feedHero.appForeground &&
    !userPaused;

  // Autoplay policy: one visible hero at a time; pause when inactive, unfocused, or background.
  useEffect(() => {
    if (!player) return;
    if (shouldAutoplay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldAutoplay]);

  useEffect(() => {
    if (!player) return;
    player.muted = isMuted;
  }, [player, isMuted]);

  // When leaving the active slot, reset so re-entering autoplays muted (Instagram-style).
  useEffect(() => {
    if (!feedHero?.isActive) {
      setUserPaused(false);
      setIsMuted(true);
    }
  }, [feedHero?.isActive]);

  /**
   * Keep poster/thumbnail on top whenever we're not actively playing the autoplay hero:
   * paused `VideoView` often shows a grey/blank surface — hiding the poster after one frame
   * made off-screen or inactive cells look like a "flashing grey blob".
   */
  const showPosterLayer =
    Boolean(posterUri) && (!hasRenderedFrame || !shouldAutoplay || userPaused);

  const handleHeroTap = useCallback(() => {
    setUserPaused((p) => !p);
  }, []);

  const boxStyle: StyleProp<ViewStyle> = [styles.wrap, height != null ? { height } : null, style];
  /** When not autoplaying, show the old centre play so the slot never looks like an empty grey block. */
  const showCenterPlayAffordance =
    !!feedHero && !shouldAutoplay && !(Boolean(posterUri) && showPosterLayer);
  const showLoadingOnActive =
    !!feedHero && shouldAutoplay && !hasRenderedFrame && !posterUri;

  const core = (
    <View style={boxStyle}>
      {/* Native video surfaces often draw above RN views on Android; keep the player behind overlays. */}
      <View style={styles.videoUnderlay} collapsable={false}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={() => setHasRenderedFrame(true)}
        />
      </View>
      {showPosterLayer ? (
        <View style={[StyleSheet.absoluteFillObject, styles.posterOverlay]} pointerEvents="none">
          <Image source={{ uri: posterUri! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        </View>
      ) : null}

      {showLoadingOnActive ? (
        <View style={styles.playBadge} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}

      {!feedHero && showPlayBadge ? (
        <View style={styles.playBadge} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        </View>
      ) : null}

      {feedHero && feedHero.isActive && userPaused ? (
        <View style={styles.playBadge} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        </View>
      ) : null}

      {showCenterPlayAffordance ? (
        <View style={styles.playBadge} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        </View>
      ) : null}

      {feedHero ? (
        <>
          {/* Tap target for pause/play — below chrome so corner controls stay tappable */}
          <Pressable
            style={[StyleSheet.absoluteFill, styles.heroTapLayer]}
            onPress={handleHeroTap}
            accessibilityRole="button"
            accessibilityLabel={userPaused ? 'Play video' : 'Pause video'}
          />
          <View style={styles.feedHeroChrome} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
              onPress={() => setIsMuted((m) => !m)}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
            >
              <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, styles.expandButton, pressed && styles.iconPressed]}
              onPress={feedHero.onOpenDetail}
              accessibilityRole="button"
              accessibilityLabel="Open full screen"
            >
              <Ionicons name="expand-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );

  if (feedHero) {
    return core;
  }

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
  videoUnderlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  posterOverlay: {
    zIndex: 2,
    elevation: 2,
  },
  playBadge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    elevation: 3,
  },
  playCircle: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedHeroChrome: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    elevation: 6,
    pointerEvents: 'box-none',
  },
  iconButton: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
    elevation: 7,
  },
  expandButton: {
    left: undefined,
    right: 10,
  },
  iconPressed: {
    opacity: 0.7,
  },
  heroTapLayer: {
    zIndex: 5,
    elevation: 5,
  },
});
