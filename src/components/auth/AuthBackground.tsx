import React from 'react';
import { View, StyleSheet, Image, ImageBackground, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { authTheme } from '../../styles/authTheme';
import ScreenGloss from './ScreenGloss';

type AuthBackgroundProps = {
  children: React.ReactNode;
  safeTop?: boolean;
  contentPadding?: number;
};

const AuthBackground: React.FC<AuthBackgroundProps> = ({ children, safeTop = true, contentPadding = 24 }) => {
  return (
    <View style={styles.root}>
      {/* Full-screen PNG background image (with @2x/@3x support) */}
      <ImageBackground
        source={require('../../../assets/images/auth/auth-bg.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        {/* Multi-layer red gradient overlays the PNG for tinting */}
        <LinearGradient
          colors={[
            authTheme.colors.bgRedTop,
            authTheme.colors.bgRedMid,
            authTheme.colors.bgRedBright,
            authTheme.colors.bgRedBottom,
          ]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Diagonal spotlight beam (top-right to bottom-left) */}
        <View style={styles.spotlightWrap} pointerEvents="none">
          <LinearGradient
            colors={[
              'rgba(255,214,120,0)',
              'rgba(255,214,120,0.12)',
              'rgba(255,214,120,0.28)',
              'rgba(255,214,120,0.12)',
              'rgba(255,214,120,0)',
            ]}
            locations={[0, 0.3, 0.5, 0.7, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.spotlightBeam}
          />
          <LinearGradient
            colors={[
              'rgba(255,214,120,0)',
              'rgba(255,214,120,0.08)',
              'rgba(255,214,120,0.18)',
              'rgba(255,214,120,0.08)',
              'rgba(255,214,120,0)',
            ]}
            locations={[0, 0.35, 0.5, 0.65, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.spotlightBeamSoft}
          />
        </View>
        <ScreenGloss />
        {/* Main content area (children) */}
        <SafeAreaView
          style={[styles.safe, { paddingTop: safeTop ? authTheme.spacing.xl : 0 }]}
          edges={['top', 'left', 'right', 'bottom']}
        >
          <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { padding: contentPadding },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: authTheme.colors.bgRedTop, position: 'relative' },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    transform: [{ rotate: '12deg' }],
    top: -80,
    left: -120,
  },
  spotlightBeam: {
    width: '52%',
    height: '140%',
    opacity: 0.45,
  },
  spotlightBeamSoft: {
    position: 'absolute',
    width: '62%',
    height: '140%',
    opacity: 0.3,
  },
});

export default AuthBackground;
