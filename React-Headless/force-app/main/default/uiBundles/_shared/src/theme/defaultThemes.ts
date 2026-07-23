/**
 * Fixed, always-available baseline themes — the "standard" Aurora Dark and
 * Light looks that predate custom brand theming. Unlike a `BrandTheme`, these
 * are NOT stored in the org theme library: they are constants shipped with the
 * bundle and can always be re-activated to return to baseline.
 *
 * Each default also carries a structural `mode` (dark|light) so activating it
 * switches the surface palette, not just the accent (see ThemeProvider). The
 * accent values intentionally match the `[data-mode]` blocks in tokens.css, so
 * the result is visually identical to the untinted design-system baseline.
 *
 * Their ids are sentinels the Apex active-theme resolver
 * (`activeThemeIdForUser`) recognises as permanently valid even though they
 * never appear in the saved library.
 */
import type { ThemeMode } from './ThemeProvider';

export interface DefaultTheme {
  /** Sentinel id, e.g. '__default_dark__' — recognised server-side. */
  id: string;
  /** Display name shown in the pinned row. */
  name: string;
  /** Structural surface palette this default switches to. */
  mode: ThemeMode;
  accent: string; // #rrggbb — matches tokens.css [data-mode] base accent
  accentSoft: string; // #rrggbb
}

export const DEFAULT_LIGHT_ID = '__default_light__';
export const DEFAULT_DARK_ID = '__default_dark__';

export const DEFAULT_THEMES: DefaultTheme[] = [
  { id: DEFAULT_LIGHT_ID, name: 'Light', mode: 'light', accent: '#5b8def', accentSoft: '#a9c4fb' },
  { id: DEFAULT_DARK_ID, name: 'Dark', mode: 'dark', accent: '#14b8a6', accentSoft: '#5eead4' },
];

/** The default theme matching `id`, or null when `id` is not a default sentinel. */
export function findDefaultTheme(id: string | null): DefaultTheme | null {
  if (!id) return null;
  return DEFAULT_THEMES.find((t) => t.id === id) ?? null;
}
