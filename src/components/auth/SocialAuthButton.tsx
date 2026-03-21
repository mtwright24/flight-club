
import React from 'react';
import { Pressable, Text, StyleSheet, View, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { authTheme } from '../../styles/authTheme';

type SocialAuthButtonProps = {
  variant: 'apple' | 'google';
  brand: string;
  labelPrefix?: string;
  onPress: () => void;
};

const SocialAuthButton: React.FC<SocialAuthButtonProps> = ({
  variant,
  brand,
  labelPrefix = 'Continue with ',
  onPress,
}) => {
  const isApple = variant === 'apple';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={10}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <BlurView
        intensity={20}
        tint="light"
        style={[styles.blur, isApple ? styles.appleBlur : styles.googleBlur]}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.innerHighlight}
          pointerEvents="none"
        />
        {!isApple && (
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.16)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.innerShadow}
            pointerEvents="none"
          />
        )}
        <View style={styles.content}>
          <View style={styles.iconSlot}>
            {isApple ? (
              <Ionicons name="logo-apple" size={20} color="#fff" />
            ) : (
              <Image
                source={require('../../../assets/images/auth/google-g.png')}
                style={styles.googleIcon}
                resizeMode="contain"
              />
            )}
          </View>
          <Text
            style={styles.label}
            numberOfLines={1}
            allowFontScaling={false}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {labelPrefix}
            <Text style={styles.labelStrong}>{brand}</Text>
          </Text>
          <View style={styles.iconSpacer} />
        </View>
      </BlurView>
    </Pressable>
  );
};

export default SocialAuthButton;

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
    alignSelf: 'center',
    marginHorizontal: -32,
    shadowColor: 'rgba(0,0,0,0.55)',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  blur: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    height: 60,
    justifyContent: 'center',
  },
  appleBlur: {
    backgroundColor: 'rgba(8,8,8,0.85)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  googleBlur: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.24)',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 26,
  },
  innerShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 26,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    paddingHorizontal: 22,
  },
  iconSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconSpacer: {
    width: 22,
    height: 22,
    marginLeft: 10,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  label: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
    flex: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingVertical: 0,
    letterSpacing: 0.2,
  },
  labelStrong: {
    fontWeight: '800',
    fontSize: 17.5,
  },
});
