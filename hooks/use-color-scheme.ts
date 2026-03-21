import { useContext } from 'react';
import { ThemeContext } from '../src/context/ThemeContext';

export function useColorScheme() {
	const { theme } = useContext(ThemeContext);
	return theme;
}
