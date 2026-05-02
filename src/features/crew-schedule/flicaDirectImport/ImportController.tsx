/**
 * Import session shell: keeps the WebView layer and Flight Club overlay as stable siblings.
 * Owns mount/unmount lifecycle only — all FLICA/session logic stays in the screen.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export type ImportControllerProps = {
  /** WebView + chrome (lower z-index). */
  webLayer: React.ReactNode;
  /** Full-screen or split overlay (higher z-index), e.g. ImportWrapperOverlay. */
  overlayLayer: React.ReactNode;
};

export function ImportController({ webLayer, overlayLayer }: ImportControllerProps) {
  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    console.log('[IMPORT_CONTROLLER_MOUNT]');
    return () => {
      console.log('[IMPORT_CONTROLLER_UNMOUNT]');
    };
  }, []);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {webLayer}
      {overlayLayer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 20, elevation: 20 },
});
