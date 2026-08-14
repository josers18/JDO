/**
 * Module-level "display size" store (per-user font/UI scale).
 *
 * The app's type sizes are hardcoded in pixels (e.g. `text-[12.5px]`), so
 * bumping a root rem base does nothing. Instead each preset carries a CSS
 * `zoom` factor that `ThemeProvider` applies to its single wrapper `<div>`,
 * scaling text, spacing and boxes together (and — unlike transform:scale —
 * reflowing layout correctly).
 *
 * Same external-store shape as `activeBrand.ts`: a module snapshot plus a
 * `useSyncExternalStore` subscription so React consumers (via
 * `useDisplaySize`) re-render when the size changes.
 */
import { useSyncExternalStore } from 'react';

/** A named display-size preset. `scale` is the CSS `zoom` factor. */
export interface DisplaySizePreset {
  id: string;
  label: string;
  /** Short description of who it's for (shown under the label). */
  hint: string;
  scale: number;
}

/**
 * The presets, smallest → largest. `default` (100%) is the baseline the app
 * shipped with; the rest step up for presentation / readability. Keep this
 * list the single source of truth — the UI, the store and the boot applier
 * all resolve ids against it.
 */
export const DISPLAY_SIZE_PRESETS: DisplaySizePreset[] = [
  { id: 'default', label: 'Default', hint: '100%', scale: 1.0 },
  { id: 'comfortable', label: 'Comfortable', hint: '110%', scale: 1.1 },
  { id: 'large', label: 'Large', hint: '125%', scale: 1.25 },
  { id: 'xlarge', label: 'Extra large', hint: '140%', scale: 1.4 },
];

/** The baseline preset id — byte-identical to the pre-feature rendering. */
export const DEFAULT_DISPLAY_SIZE_ID = 'default';

/** Resolve a preset id to its `zoom` factor; unknown/blank ids → 1 (baseline). */
export function scaleForDisplaySize(id: string | null | undefined): number {
  const preset = DISPLAY_SIZE_PRESETS.find((p) => p.id === id);
  return preset ? preset.scale : 1.0;
}

let current: string = DEFAULT_DISPLAY_SIZE_ID;
const listeners = new Set<() => void>();

/** Set the active display-size preset id and notify subscribers. A blank/unknown
 *  id falls back to the baseline so the store never holds a size the UI can't
 *  resolve. Does NOT persist — callers pair this with `saveDisplaySize`
 *  (same split as setBrandOverride vs setActiveTheme). */
export function setDisplaySize(id: string | null | undefined): void {
  const next = DISPLAY_SIZE_PRESETS.some((p) => p.id === id)
    ? (id as string)
    : DEFAULT_DISPLAY_SIZE_ID;
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** Current display-size preset id. Stable reference (a plain string) across
 *  calls when unchanged — satisfies useSyncExternalStore's snapshot contract. */
export function getDisplaySize(): string {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: the active display-size preset id, via the external store. */
export function useDisplaySize(): string {
  return useSyncExternalStore(subscribe, getDisplaySize, getDisplaySize);
}
