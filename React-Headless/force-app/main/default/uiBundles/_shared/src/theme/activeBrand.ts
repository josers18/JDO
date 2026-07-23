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
  logoBase64: string | null;
  /**
   * Structural surface palette to force (dark|light). Set by the fixed
   * default themes so activating "Dark"/"Light" switches the whole surface,
   * not just the accent. Custom brand themes leave this undefined — they only
   * retint the accent and inherit the app's own mode.
   */
  mode?: 'dark' | 'light';
}

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
