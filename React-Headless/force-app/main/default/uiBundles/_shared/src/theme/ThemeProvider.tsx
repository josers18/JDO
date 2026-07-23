import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { PERSONA_THEMES, type PersonaKey, type PersonaTheme } from './themes';
import { buildGradient, buildGlow, buildAurora, buildAiFamily } from './brandThemes';
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
  // A CUSTOM brand override (one with no explicit `mode` — the fixed Dark/Light
  // defaults set `mode`) makes the theme HOLISTIC: it retints not just the
  // accent but the AI/agentic family and the ambient aurora wash, so agentic
  // surfaces (the "Prep me" AI button, the Agentforce FAB) and the page
  // background all move with the brand. The fixed defaults deliberately keep
  // the constant violet→blue AI family and the mode's own aurora — baseline
  // stays baseline. All derived, never stored (D1).
  const isCustomBrand = !!override && !override.mode;
  // An explicit aiAccent gives agentic surfaces their own hue ("AI acts");
  // otherwise the AI family derives from the primary accent (shares the brand
  // color). Only custom brands carry an AI family — the fixed defaults keep the
  // constant violet→blue.
  const ai = isCustomBrand ? buildAiFamily(override!.aiAccent?.trim() || theme.accent) : null;
  // Persona accent tokens are injected in BOTH modes, so light mode is
  // persona-themed too (not fixed to the Aurora blue→violet default).
  const style = {
    fontFamily: 'var(--font-sans)',
    '--wp-accent': theme.accent,
    '--wp-accent-2': theme.accentSoft,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-gradient': theme.gradient,
    '--wp-glow': theme.glow,
    // --wp-accent-bg / --wp-accent-border are color-mix()es of --wp-accent
    // declared at :root, so they too froze against the root default. Re-derive
    // them here against this wrapper's accent so accent-tinted fills/borders
    // (Pills, chips, active states) track the persona/brand.
    '--wp-accent-bg': `color-mix(in srgb, ${theme.accent} 14%, transparent)`,
    '--wp-accent-border': `color-mix(in srgb, ${theme.accent} 38%, transparent)`,
    // Tailwind's @theme block declares `--color-accent: var(--wp-accent)` ONLY
    // at :root, so that var() resolves against :root's --wp-accent (the fixed
    // mode default) and FREEZES there — descendants inherit the frozen default,
    // never this wrapper's overridden --wp-accent. That's why solid `bg-accent`
    // buttons ("Schedule call", "Approve & execute") stayed the default blue
    // while `bg-gradient-ai` buttons (which read var(--wp-ai-grad) directly on
    // the element) tracked the brand. Re-emit the --color-* accent tokens HERE
    // so they re-resolve against THIS wrapper's --wp-* and inherit the themed
    // value down to every bg-accent / text-accent / *-accent consumer. This
    // also finally themes the persona defaults (teal/amber), which had the same
    // frozen-blue accent buttons.
    '--color-accent': 'var(--wp-accent)',
    '--color-accent-2': 'var(--wp-accent-2)',
    '--color-accent-bg': 'var(--wp-accent-bg)',
    '--color-accent-border': 'var(--wp-accent-border)',
    ...(isCustomBrand
      ? {
          // Background wash: an explicit bgAccent seeds the aurora from that
          // single color; otherwise it derives from accent+accentSoft.
          '--wp-aurora': override!.bgAccent?.trim()
            ? buildAurora(override!.bgAccent.trim(), theme.accentSoft)
            : buildAurora(theme.accent, theme.accentSoft),
          '--wp-ai': ai!.ai,
          '--wp-ai-2': ai!.ai2,
          '--wp-ai-grad': ai!.aiGrad,
          '--wp-ai-bg': ai!.aiBg,
          '--wp-ai-border': ai!.aiBorder,
          // Same frozen-at-:root problem for the AI --color-* family — rebind
          // so text-ai / bg-ai / border-ai track the brand's derived AI family.
          '--color-ai': 'var(--wp-ai)',
          '--color-ai-2': 'var(--wp-ai-2)',
          '--color-ai-bg': 'var(--wp-ai-bg)',
          '--color-ai-border': 'var(--wp-ai-border)',
          // Per-role overrides. Each --wp-* is only overridden when the brand
          // set that color; the paired --color-* rebind lifts it out of the
          // frozen-at-:root default so text-ok / text-risk / text-link track it.
          ...(override!.posColor?.trim()
            ? { '--wp-pos': override!.posColor.trim(), '--color-ok': 'var(--wp-pos)' }
            : {}),
          ...(override!.negColor?.trim()
            ? { '--wp-neg': override!.negColor.trim(), '--color-risk': 'var(--wp-neg)' }
            : {}),
          // Link defaults to the accent when the brand didn't set one, so a
          // custom brand's links track its accent rather than the mode default.
          '--wp-link': override!.linkColor?.trim() || theme.accent,
          '--color-link': 'var(--wp-link)',
        }
      : {}),
  } as CSSProperties;

  return (
    <ThemeContext.Provider value={{ ...theme, mode: effectiveMode }}>
      <div data-theme={persona} data-mode={effectiveMode} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
