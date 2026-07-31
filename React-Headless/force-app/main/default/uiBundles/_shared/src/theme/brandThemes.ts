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
import type { ThemeMode } from './ThemeProvider';

/**
 * A structural surface palette — the page/card surfaces, text ink, and border
 * hairlines that live per-mode in tokens.css. Every field is an OPTIONAL
 * `#rrggbb`; an absent field inherits that mode's tokens.css baseline (the
 * same "unset → derive default" contract the per-role accent colors use). This
 * lets a theme override only the surfaces it cares about without freezing the
 * rest. Used both app-wide (`BrandTheme.structural`) and, with two extra accent
 * fields, scoped to the sidebar (`SidebarPalette`).
 */
export interface StructuralPalette {
  surface?: string; // --wp-surface       (page background)
  surfaceRaised?: string; // --wp-surface-raised (cards / raised panels)
  surfaceMuted?: string; // --wp-surface-muted  (inset wells, hover fills)
  text?: string; // --wp-text            (primary ink)
  textMuted?: string; // --wp-text-muted     (secondary ink)
  textFaint?: string; // --wp-text-faint     (metadata ink)
  border?: string; // --wp-border         (raised-edge highlight)
  borderStrong?: string; // --wp-border-strong  (internal dividers)
}

/**
 * The sidebar's own palette — a full structural set PLUS its own accent, so a
 * theme can pair (say) a dark rail with a light workspace and keep a distinct
 * active-item color. Carried per-theme (travels when a theme is switched).
 */
export interface SidebarPalette extends StructuralPalette {
  accent?: string; // --wp-accent      (active nav item, pin initials)
  accentSoft?: string; // --wp-accent-2
}

export interface BrandTheme {
  id: string;
  name: string;
  sourceUrl: string;
  logoBase64: string | null; // data-URL body, no prefix
  logoContentType: string; // e.g. 'image/png'
  accent: string; // #rrggbb — the primary "you act" color
  accentSoft: string; // #rrggbb — the accent's soft/highlight partner
  /**
   * Structural surface palette this theme forces (dark|light). Set when a theme
   * is FORKED from a base Light/Dark preset (so it behaves structurally like a
   * base theme — mode-driven surfaces + constant AI family), left undefined for
   * a URL-extracted custom brand (which stays holistic and inherits the app's
   * own mode). See ThemeProvider's `isCustomBrand`.
   */
  mode?: ThemeMode;
  /**
   * App-wide structural overrides (surfaces / text / borders). Absent roles
   * inherit the mode's tokens.css baseline. Optional so existing saved themes
   * are byte-identical.
   */
  structural?: StructuralPalette;
  /**
   * Sidebar-scoped palette. Independent of `structural` so the rail can be a
   * different color from the workspace. Absent → the rail inherits the app
   * palette exactly as before.
   */
  sidebar?: SidebarPalette;
  /**
   * Optional dedicated "AI / agentic accent" (#rrggbb) — the "AI acts" color
   * that themes the Prep-me button, Agentforce FAB/bubble, and other agentic
   * surfaces. When omitted, the AI family is derived from `accent` (so agentic
   * surfaces share the brand hue). Set it to give AI its own color, restoring
   * the "you act" vs "AI acts" split for a custom brand.
   */
  aiAccent?: string;
  /**
   * Optional per-role brand colors (all #rrggbb), each derived from a sensible
   * default when absent so existing themes are unaffected:
   *  - bgAccent  → the ambient background/aurora wash base (else accent+soft)
   *  - posColor  → positive/success/up hue (else the mode default green)
   *  - negColor  → negative/risk/down hue (else the mode default red)
   *  - linkColor → links & informational chips (else the accent)
   */
  bgAccent?: string;
  posColor?: string;
  negColor?: string;
  linkColor?: string;
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

/**
 * Picks a foreground (near-black vs white) that meets WCAG contrast on a solid
 * `accent` fill — used for `--wp-on-accent` (primary-button text, avatar
 * initials, gauge center, tearsheet chips). A fixed `#fff` fails on light/mid
 * accents (white on the #5b8def default = 3.23:1; on teal #14b8a6 = 2.49:1),
 * so this flips to near-black when that reads better. Uses the sRGB relative
 * luminance formula (WCAG 2.x); returns whichever candidate wins the ratio,
 * which for every hue we ship clears AA on the fill.
 */
export function readableTextOn(bgHex: string): string {
  const { r, g, b } = hexToRgb(bgHex);
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  // Contrast of a candidate (its luminance L2) against the fill (lum).
  const ratio = (l2: number) => {
    const [hi, lo] = lum > l2 ? [lum, l2] : [l2, lum];
    return (hi + 0.05) / (lo + 0.05);
  };
  const white = 1; // luminance of #ffffff
  const nearBlack = 0.0114; // luminance of #0a0f1a (our on-dark ink)
  return ratio(white) >= ratio(nearBlack) ? '#ffffff' : '#0a0f1a';
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
  // An explicit aiAccent gives the agentic family its own hue; otherwise it is
  // derived from the primary accent (agentic surfaces share the brand color).
  const ai = buildAiFamily(theme.aiAccent?.trim() || theme.accent);
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
 * Emit the CSS custom properties for a partial STRUCTURAL palette (surfaces,
 * text, borders, and — for the sidebar — accent). This is the one shared
 * primitive for injecting a structural override into a scope; both the
 * app-wide ThemeProvider and the sidebar's own `<aside>` use it so the
 * "override --wp-* AND re-bind --color-* so it re-resolves" logic lives in ONE
 * place (see the frozen-at-:root note in ThemeProvider — the same trap applies
 * to any nested scope, so every --wp-* we set is paired with its --color-*
 * rebind).
 *
 * Only roles the palette actually sets are emitted, so an absent role inherits
 * the enclosing scope's value (the app palette, or tokens.css at the root). An
 * empty/undefined palette returns `{}` — a no-op scope, byte-identical to
 * having no override.
 *
 * `surface-glass` (the sidebar's frosted background, read directly by the
 * `.bg-surface-glass` utility) is derived from an overridden `surface` at ~85%
 * alpha so the rail's blur still reads against the page; when `surface` is
 * unset it is left to inherit.
 */
export function buildStructuralVars(palette: StructuralPalette | SidebarPalette | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  const set = (wp: string, color: string | null, value: string | undefined) => {
    if (!value || !value.trim()) return;
    const v = value.trim();
    vars[wp] = v;
    if (color) vars[color] = `var(${wp})`;
  };
  set('--wp-surface', '--color-bg', palette?.surface);
  set('--wp-surface-raised', '--color-surface', palette?.surfaceRaised);
  set('--wp-surface-muted', '--color-surface-muted', palette?.surfaceMuted);
  set('--wp-text', '--color-fg', palette?.text);
  set('--wp-text-muted', '--color-muted', palette?.textMuted);
  set('--wp-text-faint', '--color-faint', palette?.textFaint);
  set('--wp-border', '--color-line', palette?.border);
  set('--wp-border-strong', '--color-line-strong', palette?.borderStrong);
  // `.bg-surface-glass` reads --wp-surface-glass directly (no --color-* alias).
  // Derive it from an overridden surface so the frosted rail keeps a translucent
  // wash instead of falling back to the mode's default glass over a new surface.
  if (palette?.surface?.trim()) {
    vars['--wp-surface-glass'] = toGlass(palette.surface.trim());
  }
  // Sidebar-only: its own accent. Re-bind the same --color-* / derived accent
  // tokens ThemeProvider re-emits so bg-accent / accent-bg / accent-border track
  // the rail's accent, not the app's.
  const sb = palette as SidebarPalette | undefined;
  if (sb?.accent?.trim()) {
    const a = sb.accent.trim();
    vars['--wp-accent'] = a;
    vars['--color-accent'] = 'var(--wp-accent)';
    vars['--wp-on-accent'] = readableTextOn(a);
    vars['--wp-accent-bg'] = `color-mix(in srgb, ${a} 14%, transparent)`;
    vars['--wp-accent-border'] = `color-mix(in srgb, ${a} 38%, transparent)`;
    vars['--color-accent-bg'] = 'var(--wp-accent-bg)';
    vars['--color-accent-border'] = 'var(--wp-accent-border)';
  }
  if (sb?.accentSoft?.trim()) {
    vars['--wp-accent-2'] = sb.accentSoft.trim();
    vars['--wp-accent-soft'] = sb.accentSoft.trim();
    vars['--color-accent-2'] = 'var(--wp-accent-2)';
  }
  return vars as CSSProperties;
}

/** A `#rrggbb` surface → a translucent `rgba(...,0.85)` for the frosted glass
 *  rail. Keeps the sidebar's backdrop-blur legible over the page wash. */
function toGlass(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

/** True when a structural palette actually sets at least one role (so callers
 *  can skip mounting an override scope entirely when nothing is customized). */
export function hasStructural(palette: StructuralPalette | SidebarPalette | undefined): boolean {
  return !!palette && Object.values(palette).some(v => typeof v === 'string' && v.trim().length > 0);
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
