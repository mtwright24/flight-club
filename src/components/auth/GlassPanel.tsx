import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { authTheme } from '../../styles/authTheme';

type GlassPanelProps = {
  children: React.ReactNode;
  style?: any;
};

const GlassPanel: React.FC<GlassPanelProps> = ({ children, style }) => {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width - 48);
  const panelRadius = authTheme.radius.panel;
  const innerRadius = Math.max(panelRadius - 2, 0);
  return (
    <View style={[styles.shadowWrap, { width: panelWidth, alignSelf: 'center' }]}> 
      <BlurView
        intensity={3}
        tint="light"
        style={[styles.glass, { width: panelWidth }, style]}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      >
        {/* Rim highlight (outer stroke) */}
        <View style={[styles.rimStroke, { borderRadius: panelRadius }]} pointerEvents="none" />
        {/* Edge highlights */}
        <LinearGradient
          colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.topEdgeHighlight}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.leftEdgeHighlight}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.14)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.bottomEdgeShadow}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.10)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.rightEdgeShadow}
          pointerEvents="none"
        />
        {/* Corner glints */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cornerGlintTL}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.cornerGlintTR}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.cornerGlintBL}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.cornerGlintBR}
          pointerEvents="none"
        />
        <View style={styles.inner}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: 'rgba(0,0,0,0.45)',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
    borderRadius: authTheme.radius.panel,
    marginBottom: authTheme.spacing.lg,
    backgroundColor: 'transparent',
  },
  glass: {
    borderRadius: authTheme.radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignSelf: 'center',
    position: 'relative',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  topEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    zIndex: 1,
  },
  rimStroke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 1,
  },
  leftEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 16,
    zIndex: 1,
  },
  bottomEdgeShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 22,
    zIndex: 1,
  },
  rightEdgeShadow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 16,
    zIndex: 1,
  },
  cornerGlintTL: {
    position: 'absolute',
    zIndex: 1,
    top: -6,
    left: -6,
    width: 90,
    height: 90,
    opacity: 0.35,
  },
  cornerGlintTR: {
    position: 'absolute',
    zIndex: 1,
    top: -6,
    right: -6,
    width: 90,
    height: 90,
    opacity: 0.35,
  },
  cornerGlintBL: {
    position: 'absolute',
    zIndex: 1,
    bottom: -6,
    left: -6,
    width: 90,
    height: 90,
    opacity: 0.35,
  },
  cornerGlintBR: {
    position: 'absolute',
    zIndex: 1,
    bottom: -6,
    right: -6,
    width: 90,
    height: 90,
    opacity: 0.35,
  },
  inner: {
    paddingVertical: authTheme.spacing.lg,
    paddingHorizontal: authTheme.spacing.xl,
    zIndex: 2,
  },
});

export default GlassPanel;
