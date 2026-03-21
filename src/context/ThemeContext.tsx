import { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextProps {
  theme: string;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext({
  theme: 'light',
  mode: 'system' as ThemeMode,
  setMode: (() => {}) as (mode: ThemeMode) => void,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const cs = Appearance.getColorScheme();
    return cs === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    if (mode === 'system') {
      const listener = Appearance.addChangeListener((preferences) => {
        setTheme(preferences.colorScheme === 'dark' ? 'dark' : 'light');
      });
      setTheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
      return () => listener.remove();
    } else {
      setTheme(mode);
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
