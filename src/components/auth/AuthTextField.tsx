import React from 'react';
import { View, TextInput, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { authTheme } from '../../styles/authTheme';

type AuthTextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightPress?: () => void;
  secureTextEntry?: boolean;
};

export default function AuthTextField({ value, onChangeText, placeholder, leftIcon, rightIcon, onRightPress, secureTextEntry }: AuthTextFieldProps) {
  return (
    <View style={styles.outerWrap}>
      <View style={styles.blur}>
        <View style={styles.innerHighlight} pointerEvents="none" />
        <View style={styles.innerStroke} pointerEvents="none" />
        <View style={styles.bottomShade} pointerEvents="none" />
        <View style={styles.inputWrap}>
          {leftIcon && (
            <Ionicons name={leftIcon as any} size={20} color="#888888" style={styles.leftIcon} />
          )}
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#999999"
            secureTextEntry={secureTextEntry}
            autoCapitalize="none"
          />
          {rightIcon && (
            <TouchableOpacity onPress={onRightPress} style={styles.rightIconBtn} hitSlop={8}>
              <Ionicons name={rightIcon as any} size={20} color="#888888" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    marginBottom: authTheme.spacing.md,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  blur: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1.6,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: authTheme.spacing.lg,
    height: 54,
    position: 'relative',
  },
  leftIcon: {
    marginRight: 10,
    opacity: 0.85,
  },
  rightIconBtn: {
    marginLeft: 10,
    opacity: 0.85,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#222222',
    fontWeight: '500',
    letterSpacing: 0.2,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderRadius: 12,
    height: 54,
    minWidth: 0,
    maxWidth: 360,
    textAlign: 'left',
    flexShrink: 0,
  },
  innerHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 14,
    borderTopLeftRadius: authTheme.radius.input,
    borderTopRightRadius: authTheme.radius.input,
    backgroundColor: 'rgba(255,255,255,0.65)',
    opacity: 0.18,
    zIndex: 1,
  },
  innerStroke: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    opacity: 0.6,
    zIndex: 1,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.10)',
    opacity: 0.35,
    zIndex: 1,
  },
});
