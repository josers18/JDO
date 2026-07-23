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
  /**
   * The brand display name shown in the app chrome (sidebar wordmark) in place
   * of "Cumulus". Optional — falls back to `name` (then "Cumulus") when blank,
   * so pre-existing saved themes keep working.
   */
  brandName?: string;
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

/** Mixes `hex` toward white by `amt` (0..1) and returns a fresh `#rrggbb`. */
function lightenHex(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Full-app "aurora" background wash derived from the brand's two colors, so a
 * custom brand retints the ambient page gradient (not just the accent). Mirrors
 * the three-blob shape of `--wp-aurora` in tokens.css. Derived, never stored
 * (D1) — `accent`/`accentSoft` remain the only persisted color state.
 */
export function buildAurora(accent: string, accentSoft: string): string {
  const a = hexToRgb(accent);
  const s = hexToRgb(accentSoft);
  return [
    `radial-gradient(50% 45% at 12% 8%, rgba(${a.r},${a.g},${a.b},0.30), transparent 60%)`,
    `radial-gradient(45% 40% at 90% 10%, rgba(${s.r},${s.g},${s.b},0.26), transparent 55%)`,
    `radial-gradient(60% 50% at 70% 100%, rgba(${a.r},${a.g},${a.b},0.16), transparent 60%)`,
  ].join(', ');
}

/**
 * The "AI / agentic" accent family, derived from the brand accent so agentic
 * surfaces (the "Prep me" button, the Agentforce FAB + bubble) move with the
 * brand. Returns the `--wp-ai*` token set plus the flat `bubble` hex the
 * Agentforce Conversation Client's `styleTokens` needs (it can't read a CSS
 * var). `ai2` is a lightened accent so the AI gradient still reads as a sweep.
 */
export function buildAiFamily(accent: string): {
  ai: string;
  ai2: string;
  aiGrad: string;
  aiBg: string;
  aiBorder: string;
  bubble: string;
} {
  const { r, g, b } = hexToRgb(accent);
  const ai2 = lightenHex(accent, 0.3);
  return {
    ai: accent,
    ai2,
    aiGrad: `linear-gradient(120deg, ${accent} 0%, ${ai2} 100%)`,
    aiBg: `rgba(${r},${g},${b},0.12)`,
    aiBorder: `rgba(${r},${g},${b},0.36)`,
    bubble: accent,
  };
}

/**
 * Maps a `BrandTheme` to the `--wp-*` custom properties ThemeProvider
 * consumes. Gradient/glow are always computed from `theme.accent` — there is
 * no stored gradient/glow field to read (see D1 above).
 */
export function brandThemeToVars(theme: BrandTheme): CSSProperties {
  const ai = buildAiFamily(theme.accent);
  return {
    '--wp-accent': theme.accent,
    '--wp-accent-2': theme.accentSoft,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-gradient': buildGradient(theme.accent),
    '--wp-glow': buildGlow(theme.accent),
    '--wp-aurora': buildAurora(theme.accent, theme.accentSoft),
    '--wp-ai': ai.ai,
    '--wp-ai-2': ai.ai2,
    '--wp-ai-grad': ai.aiGrad,
    '--wp-ai-bg': ai.aiBg,
    '--wp-ai-border': ai.aiBorder,
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
