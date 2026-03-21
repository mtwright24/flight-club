import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { authTheme } from '../../styles/authTheme';

const activeStreak = require('../../../assets/images/auth/A_PNG_digital_graphic_showcases_a_horizontal_light.png');

type AuthTabsProps = {
  active: 'sign-in' | 'sign-up';
  onChange: (next: 'sign-in' | 'sign-up') => void;
};

const AuthTabs: React.FC<AuthTabsProps> = ({ active, onChange }) => {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width - 48);
  const streakLeft = active === 'sign-in' ? '0%' : '50%';
  return (
    <View style={[styles.wrap, { width: panelWidth, alignSelf: 'center' }]}>
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.tab, active === 'sign-in' && styles.activeTab]}
          onPress={() => onChange('sign-in')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, active === 'sign-in' && styles.activeTabText]}>Sign In</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={[styles.tab, active === 'sign-up' && styles.activeTab]}
          onPress={() => onChange('sign-up')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, active === 'sign-up' && styles.activeTabText]}>Sign Up</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.underlineOverlay} pointerEvents="none">
        <Image source={activeStreak} style={[styles.activeStreak, { left: streakLeft }]} resizeMode="contain" />
      </View>
      <View style={styles.bottomDivider} />
    </View>
  );
}

export default AuthTabs;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: authTheme.spacing.lg,
    alignSelf: 'center',
    position: 'relative',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    paddingVertical: authTheme.spacing.md,
    paddingHorizontal: authTheme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeTab: {
    backgroundColor: 'transparent',
  },
  tabText: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  underlineOverlay: {
    position: 'absolute',
    bottom: -14,
    left: 0,
    right: 0,
    height: 28,
    flexDirection: 'row',
    zIndex: 10,
  },
  activeStreak: {
    width: 175,
    height: 28,
    opacity: 0.95,
    shadowColor: '#FFB35C',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: authTheme.spacing.md,
  },
  bottomDivider: {
    height: 1.2,
    backgroundColor: 'rgba(255,255,255,0.30)',
    marginHorizontal: -authTheme.spacing.xl,
  },
});
