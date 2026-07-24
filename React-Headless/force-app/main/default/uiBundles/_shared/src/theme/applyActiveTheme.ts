/**
 * Load-time application of the org's active custom brand theme.
 *
 * Fetches the saved themes + active-theme id, resolves which (if any) theme
 * is active, and pushes its color tokens into the `activeBrand` store so
 * `ThemeProvider` re-renders with the brand override. Persona default
 * renders first (this only fires from an effect); a brand swap-in is a
 * re-render, not a remount — never blocks initial paint.
 *
 * Degrades silently on any failure: the persona default stays in effect.
 */
import { listThemes } from '../data/brandThemeClient';
import { resolveActiveTheme } from './brandThemes';
import { setBrandOverride } from './activeBrand';
import { setDisplaySize } from './displaySize';
import { findDefaultTheme } from './defaultThemes';

export async function applyActiveThemeOnLoad(): Promise<void> {
  try {
    const { themes, activeThemeId, displaySize } = await listThemes();
    // Per-user display size (font/UI scale). Set FIRST so it applies regardless
    // of which theme branch below runs. Unknown/blank → baseline (setDisplaySize
    // guards this), so a user who never picked one renders at 100%.
    setDisplaySize(displaySize);
    // A fixed default (Dark/Light) is a sentinel id that never appears in the
    // saved library — resolve it first so it survives reloads with its mode.
    const dflt = findDefaultTheme(activeThemeId);
    if (dflt) {
      setBrandOverride({
        accent: dflt.accent,
        accentSoft: dflt.accentSoft,
        logoBase64: null,
        mode: dflt.mode,
      });
      return;
    }
    const active = resolveActiveTheme(themes, activeThemeId);
    if (active) {
      setBrandOverride({
        accent: active.accent,
        accentSoft: active.accentSoft,
        aiAccent: active.aiAccent?.trim() || undefined,
        logoBase64: active.logoBase64,
        brandName: active.brandName?.trim() || active.name,
      });
    } else {
      setBrandOverride(null);
    }
  } catch {
    // Swallow: never throw to the caller, leave persona default in place.
  }
}
