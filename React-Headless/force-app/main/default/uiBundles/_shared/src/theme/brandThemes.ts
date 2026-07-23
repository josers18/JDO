/**
 * Custom brand themes — the user-configurable counterpart to the persona
 * presets in `themes.ts`. A `BrandTheme` persists ONLY `accent`/`accentSoft`
 * as colors; gradient/glow are NEVER stored (design decision D1). They are
 * derived from `accent` at apply time by `buildGradient`/`buildGlow`, which
 * keeps `accent` the single validated source of truth and closes a
 * CSS-injection surface (no stored `background: ...` string ever reaches a
 * style tag).
 */
import type { CSSProperties } from 'react';

export interface BrandTheme {
  id: string;
  name: string;
  sourceUrl: string;
  logoBase64: string | null; // data-URL body, no prefix
  logoContentType: string; // e.g. 'image/png'
  accent: string; // #rrggbb — the ONLY color state persisted
  accentSoft: string; // #rrggbb
}

/** Parses a `#rrggbb` hex string into its `{ r, g, b }` byte components. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

/** Mirrors the persona `gradient` shape (135deg, accent → lightened accent). */
export function buildGradient(accent: string): string {
  const { r, g, b } = hexToRgb(accent);
  // Lighten by mixing toward white ~35%, matching accent -> accentSoft feel.
  const lighten = (channel: number) => Math.round(channel + (255 - channel) * 0.35);
  const lightHex = `#${[lighten(r), lighten(g), lighten(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
  return `linear-gradient(135deg, ${accent} 0%, ${lightHex} 100%)`;
}

/** Mirrors the persona `glow` shape (60% 120% radial at top-left, low-alpha accent). */
export function buildGlow(accent: string): string {
  const { r, g, b } = hexToRgb(accent);
  return `radial-gradient(60% 120% at 15% 0%, rgba(${r},${g},${b},0.35) 0%, rgba(${r},${g},${b},0) 60%)`;
}

/**
 * Maps a `BrandTheme` to the `--wp-*` custom properties ThemeProvider
 * consumes. Gradient/glow are always computed from `theme.accent` — there is
 * no stored gradient/glow field to read (see D1 above).
 */
export function brandThemeToVars(theme: BrandTheme): CSSProperties {
  return {
    '--wp-accent': theme.accent,
    '--wp-accent-2': theme.accentSoft,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-gradient': buildGradient(theme.accent),
    '--wp-glow': buildGlow(theme.accent),
  } as CSSProperties;
}

/**
 * Returns the theme whose `id` matches `activeThemeId`, or `null` when
 * `activeThemeId` is null/undefined or no theme matches (caller falls back
 * to the persona default). Never throws.
 */
export function resolveActiveTheme(themes: BrandTheme[], activeThemeId: string | null): BrandTheme | null {
  if (!activeThemeId) return null;
  return themes.find((t) => t.id === activeThemeId) ?? null;
}
