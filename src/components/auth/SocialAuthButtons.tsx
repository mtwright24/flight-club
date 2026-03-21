import React from 'react';
import { View, StyleSheet } from 'react-native';
import { authTheme } from '../../styles/authTheme';
import SocialAuthButton from './SocialAuthButton';

type SocialAuthButtonsProps = {
  onPressApple: () => void;
  onPressGoogle: () => void;
};

const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({ onPressApple, onPressGoogle }) => {
  return (
    <View style={styles.stack}>
      <SocialAuthButton variant="apple" brand="Apple" onPress={onPressApple} />
      <SocialAuthButton variant="google" brand="Google" onPress={onPressGoogle} />
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    width: '100%',
    gap: authTheme.spacing.s12,
    marginTop: authTheme.spacing.s12,
  },
});

export default SocialAuthButtons;
