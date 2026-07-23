import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { PERSONA_THEMES, type PersonaKey, type PersonaTheme } from './themes';
import { buildGradient, buildGlow } from './brandThemes';
import { useBrandOverride } from './activeBrand';
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
  const base = PERSONA_THEMES[persona];
  const override = useBrandOverride();
  // When a custom brand override is active, swap in its accent tokens and
  // RE-DERIVE gradient/glow from that accent (D1 — gradient/glow are never
  // stored/read as fields). With no override, this is byte-identical to the
  // persona default that rendered before brand theming existed.
  const theme = override
    ? {
        ...base,
        accent: override.accent,
        accentSoft: override.accentSoft,
        gradient: buildGradient(override.accent),
        glow: buildGlow(override.accent),
      }
    : base;
  // A fixed default theme (Dark/Light) carries an explicit `mode` that
  // switches the structural surface palette; a custom brand override has no
  // mode and inherits the app's own `mode` prop. With no override at all this
  // is byte-identical to the persona default that rendered before theming.
  const effectiveMode: ThemeMode = override?.mode ?? mode;
  // Persona accent tokens are injected in BOTH modes, so light mode is
  // persona-themed too (not fixed to the Aurora blue→violet default).
  const style = {
    fontFamily: 'var(--font-sans)',
    '--wp-accent': theme.accent,
    '--wp-accent-2': theme.accentSoft,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-gradient': theme.gradient,
    '--wp-glow': theme.glow,
  } as CSSProperties;

  return (
    <ThemeContext.Provider value={{ ...theme, mode: effectiveMode }}>
      <div data-theme={persona} data-mode={effectiveMode} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
