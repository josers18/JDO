/**
 * Module-level "active brand override" store.
 *
 * Holds the currently-applied custom brand theme's color tokens (derived
 * gradient/glow are computed by consumers via `buildGradient`/`buildGlow` —
 * see D1 in `brandThemes.ts`), plus an external-store subscription so React
 * consumers (via `useBrandOverride`) re-render when the override changes.
 *
 * `null` means "no custom brand active" — render the persona default.
 */
import { useSyncExternalStore } from 'react';

export interface BrandOverride {
  accent: string;
  accentSoft: string;
  /**
   * Optional dedicated AI/agentic accent (#rrggbb). When set, agentic surfaces
   * (Prep-me, Agentforce FAB/bubble) use it instead of deriving from `accent`,
   * restoring the "you act" vs "AI acts" color split for a custom brand.
   */
  aiAccent?: string;
  /**
   * Optional per-role brand colors (#rrggbb). Each falls back to a derived
   * default when absent (see BrandTheme): bgAccent→aurora wash base,
   * posColor→success, negColor→risk, linkColor→links/info.
   */
  bgAccent?: string;
  posColor?: string;
  negColor?: string;
  linkColor?: string;
  logoBase64: string | null;
  /**
   * Structural surface palette to force (dark|light). Set by the fixed
   * default themes so activating "Dark"/"Light" switches the whole surface,
   * not just the accent. Custom brand themes leave this undefined — they only
   * retint the accent and inherit the app's own mode.
   */
  mode?: 'dark' | 'light';
  /**
   * Brand wordmark shown in the app chrome in place of "Cumulus". Set by a
   * custom brand theme; the fixed defaults leave it undefined so baseline
   * always reads "Cumulus". Consumed via `useBrandName()`.
   */
  brandName?: string;
}

/** Default app wordmark used when no custom brand supplies one. */
export const DEFAULT_BRAND_NAME = 'Cumulus';

let current: BrandOverride | null = null;
const listeners = new Set<() => void>();

/** Replace the active brand override (or clear it with `null`) and notify subscribers. */
export function setBrandOverride(next: BrandOverride | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

/**
 * Current snapshot. Returns the SAME object reference across calls when
 * nothing has changed — required for `useSyncExternalStore`'s snapshot
 * stability contract (and safe for any non-React logo read too).
 */
export function getBrandOverride(): BrandOverride | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: subscribes to the active brand override via the external store. */
export function useBrandOverride(): BrandOverride | null {
  return useSyncExternalStore(subscribe, getBrandOverride, getBrandOverride);
}

/**
 * React hook: the active brand wordmark, or "Cumulus" when no custom brand
 * supplies one. Lets chrome components (sidebar, launcher) render the brand
 * name without each re-deriving the fallback.
 */
export function useBrandName(): string {
  const override = useBrandOverride();
  const name = override?.brandName?.trim();
  return name ? name : DEFAULT_BRAND_NAME;
}
