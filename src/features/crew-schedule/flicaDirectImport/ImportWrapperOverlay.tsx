/**
 * Presentational layout for FLICA direct import: Flight Club UI above a live WebView.
 * Z-order and pointer events only — no session or FLICA logic.
 *
 * Split mode: opaque presentation on top; lower half is touch-transparent so the WebView
 * mounted beneath this overlay receives gestures (captcha / login).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { scheduleTheme as T } from '../scheduleTheme';

export type ImportWrapperOverlayProps = {
  /** When false, renders nothing. */
  visible: boolean;
  /**
   * True: solid full-screen overlay (WebView should be concealed beneath).
   * False: top branded region only; bottom of screen passes touches through to WebView.
   */
  fullScreenCover: boolean;
  topInset: number;
  /** Branded + progress slot (e.g. FlicaSyncPresentationLayer). */
  presentation: React.ReactNode;
  onClosePress: () => void;
  /** When in split mode, cap the presentation column height (captcha layout). */
  splitPresentationMaxHeight?: number;
};

export function ImportWrapperOverlay({
  visible,
  fullScreenCover,
  topInset,
  presentation,
  onClosePress,
  splitPresentationMaxHeight,
}: ImportWrapperOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {fullScreenCover ? (
        <View style={styles.fullBleed} pointerEvents="auto">
          <View style={styles.fullBleedInner}>{presentation}</View>
        </View>
      ) : (
        <View style={styles.splitColumn} pointerEvents="box-none">
          <View
            style={[
              styles.splitTop,
              splitPresentationMaxHeight != null ? { maxHeight: splitPresentationMaxHeight } : null,
            ]}
            pointerEvents="auto"
          >
            {presentation}
          </View>
          <View style={styles.splitPassthrough} pointerEvents="none" />
        </View>
      )}
      <View style={[styles.closeBar, { paddingTop: topInset, paddingRight: 12 }]} pointerEvents="box-none">
        <Pressable onPress={onClosePress} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close FLICA">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  fullBleed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.bg,
  },
  fullBleedInner: {
    flex: 1,
  },
  splitColumn: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    backgroundColor: 'transparent',
  },
  splitTop: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    backgroundColor: T.bg,
  },
  splitPassthrough: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  closeBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 120,
  },
  closeBtn: { alignSelf: 'flex-end', padding: 6 },
});
