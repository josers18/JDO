import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { PERSONA_THEMES, type PersonaKey, type PersonaTheme } from './themes';
import './tokens.css';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue extends PersonaTheme {
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({ ...PERSONA_THEMES.retail, mode: 'dark' });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  persona: PersonaKey;
  mode?: ThemeMode;
  children: ReactNode;
}

/**
 * Provides the persona theme + mode via context AND injects the accent tokens
 * as CSS custom properties on a [data-theme][data-mode] wrapper, so any
 * descendant can reference var(--wp-accent) / var(--wp-surface) etc. without
 * prop-drilling. `mode` switches the structural token palette (dark|light).
 */
export function ThemeProvider({ persona, mode = 'dark', children }: ThemeProviderProps) {
  const theme = PERSONA_THEMES[persona];
  // Light mode IS the Aurora Glass system (blue→violet accent from tokens.css).
  // Only inject the per-persona accent overrides in dark mode, so Aurora wins
  // in light mode. Font is always applied.
  const style = {
    fontFamily: 'var(--wp-font)',
    ...(mode === 'dark'
      ? {
          '--wp-accent': theme.accent,
          '--wp-accent-soft': theme.accentSoft,
          '--wp-gradient': theme.gradient,
          '--wp-glow': theme.glow,
        }
      : {}),
  } as CSSProperties;

  return (
    <ThemeContext.Provider value={{ ...theme, mode }}>
      <div data-theme={persona} data-mode={mode} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
