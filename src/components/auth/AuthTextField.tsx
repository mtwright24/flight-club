import React, { forwardRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authTheme } from '../../styles/authTheme';

export type AuthTextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightPress?: () => void;
  secureTextEntry?: boolean;
  /** Default false — email/password stay one line like standard sign-in fields */
  multiline?: boolean;
  /** Primary / return key label (Next, Go, Send, Done, …) */
  returnKeyType?: TextInputProps['returnKeyType'];
  /** Fires when user presses the keyboard submit/enter key — use for same action as primary button or focus next field */
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  blurOnSubmit?: TextInputProps['blurOnSubmit'];
  keyboardType?: TextInputProps['keyboardType'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
};

const AuthTextField = forwardRef<TextInput, AuthTextFieldProps>(function AuthTextField(
  {
    value,
    onChangeText,
    placeholder,
    leftIcon,
    rightIcon,
    onRightPress,
    secureTextEntry,
    multiline = false,
    returnKeyType = 'default',
    onSubmitEditing,
    blurOnSubmit,
    keyboardType,
    autoComplete,
    textContentType,
  },
  ref,
) {
  const handleChange = (t: string) => {
    if (multiline) {
      onChangeText(t);
      return;
    }
    onChangeText(t.replace(/\r\n|\n|\r/g, ''));
  };

  return (
    <View style={styles.outerWrap}>
      <View style={styles.blur}>
        <View style={styles.innerHighlight} pointerEvents="none" />
        <View style={styles.innerStroke} pointerEvents="none" />
        <View style={styles.bottomShade} pointerEvents="none" />
        <View style={styles.inputWrap}>
          {leftIcon && (
            <Ionicons name={leftIcon as never} size={20} color="#888888" style={styles.leftIcon} />
          )}
          <View style={[styles.inputClip, !multiline && styles.inputClipSingle]}>
            <TextInput
              ref={ref}
              style={[styles.input, !multiline && styles.inputSingleLine]}
              value={value}
              onChangeText={handleChange}
              placeholder={placeholder}
              placeholderTextColor="#999999"
              secureTextEntry={secureTextEntry}
              multiline={multiline}
              scrollEnabled
              autoCapitalize="none"
              returnKeyType={returnKeyType}
              onSubmitEditing={onSubmitEditing}
              blurOnSubmit={blurOnSubmit}
              keyboardType={keyboardType}
              autoComplete={autoComplete}
              textContentType={textContentType}
              {...Platform.select({
                android: {
                  textAlignVertical: 'center' as const,
                  includeFontPadding: false,
                },
                default: {},
              })}
            />
          </View>
          {rightIcon && (
            <TouchableOpacity onPress={onRightPress} style={styles.rightIconBtn} hitSlop={8}>
              <Ionicons name={rightIcon as never} size={20} color="#888888" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

export default AuthTextField;

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
    /** Must sit above innerHighlight / innerStroke / bottomShade (they use zIndex 1) or text looks stacked when blurred */
    zIndex: 3,
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  inputClip: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  inputClipSingle: {
    height: 54,
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
    alignSelf: 'stretch',
    fontSize: 16,
    color: '#222222',
    fontWeight: '500',
    letterSpacing: 0.2,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderRadius: 12,
    width: '100%',
    minWidth: 0,
    textAlign: 'left',
  },
  inputSingleLine: {
    maxHeight: 54,
    lineHeight: 22,
    paddingTop: Platform.OS === 'ios' ? 16 : 0,
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
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
