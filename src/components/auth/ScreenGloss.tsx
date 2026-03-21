import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { authTheme } from '../../styles/authTheme';

const GLOSS_OPACITY = 0.32;
const BAND_OPACITY = 0.22;
const NOISE_OPACITY = 0.06;

const ScreenGloss: React.FC = () => {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.16)',
          'rgba(255,255,255,0.06)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.diagonalGloss, { opacity: GLOSS_OPACITY }]}
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.05)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.verticalBand, { opacity: BAND_OPACITY }]}
      />
      {authTheme.noise?.base64 ? (
        <Image
          source={{ uri: authTheme.noise.base64 }}
          style={[styles.noise, { opacity: NOISE_OPACITY }]}
          resizeMode="repeat"
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  diagonalGloss: {
    ...StyleSheet.absoluteFillObject,
  },
  verticalBand: {
    ...StyleSheet.absoluteFillObject,
  },
  noise: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default ScreenGloss;