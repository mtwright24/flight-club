/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '../constants/theme';
import { useColorScheme } from './use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  let theme = useColorScheme() ?? 'light';
  const themeMode: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';
  const colorFromProps = props[themeMode];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[themeMode][colorName];
  }
}
