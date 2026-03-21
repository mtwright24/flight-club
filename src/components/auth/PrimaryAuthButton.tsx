import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { authTheme } from '../../styles/authTheme';

interface PrimaryAuthButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const PrimaryAuthButton: React.FC<PrimaryAuthButtonProps> = ({ label, onPress, disabled, loading }) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        disabled && { opacity: 0.6 },
        isPressed && { opacity: 0.88, transform: [{ translateY: 1 }] },
      ]}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      disabled={disabled || loading}
      activeOpacity={1}
    >
      <View style={styles.topSheen} pointerEvents="none" />
      <View style={styles.bottomShade} pointerEvents="none" />
      {/* Content */}
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    marginBottom: authTheme.spacing.s16,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#C91616',
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    opacity: 0.65,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    opacity: 0.55,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.4,
    textAlign: 'center',
    width: '100%',
  },
});

export default PrimaryAuthButton;
