/**
 * Module-level cache for a center's command-center configuration.
 *
 * WHY: HomePage reads the configured model/params on every AI action, but the
 * config changes rarely (only when someone saves the Configuration page). A
 * per-call fetch would add a round-trip to every generative chip. This caches
 * the first successful load per center for the life of the page and degrades to
 * DEFAULT_CONFIG if the fetch fails — an AI action must never be blocked by a
 * config-service hiccup.
 *
 * The cache is intentionally page-lifetime (no TTL): the Configuration page and
 * the home page are separate routes in the same SPA, and saving config calls
 * `primeCenterConfig` so an in-session edit is reflected without a reload.
 */
import type { PersonaKey } from '../theme/themes';
import { fetchConfig, DEFAULT_CONFIG, type CommandCenterConfig } from './configClient';

const cache = new Map<PersonaKey, CommandCenterConfig>();
const inflight = new Map<PersonaKey, Promise<CommandCenterConfig>>();

/**
 * Load a center's config, cached. Never rejects: on any failure it resolves to
 * DEFAULT_CONFIG (and does not cache the failure, so a later call retries).
 */
export async function loadCenterConfig(center: PersonaKey): Promise<CommandCenterConfig> {
  const cached = cache.get(center);
  if (cached) return cached;

  const pending = inflight.get(center);
  if (pending) return pending;

  const p = fetchConfig(center)
    .then(cfg => {
      cache.set(center, cfg);
      inflight.delete(center);
      return cfg;
    })
    .catch(() => {
      inflight.delete(center);
      return DEFAULT_CONFIG;
    });

  inflight.set(center, p);
  return p;
}

/**
 * Seed/replace the cached config for a center. The Configuration page calls
 * this right after a successful save so the home page's next AI action uses the
 * new settings without a page reload.
 */
export function primeCenterConfig(center: PersonaKey, config: CommandCenterConfig): void {
  cache.set(center, config);
  inflight.delete(center);
}

/** Synchronous read of the cached config, or null if not yet loaded. Lets a
 *  synchronous caller (e.g. building an AI request inline) use the config when
 *  it's already warm and skip it otherwise. */
export function peekCenterConfig(center: PersonaKey): CommandCenterConfig | null {
  return cache.get(center) ?? null;
}

/** Clear the cache (test hygiene / explicit refresh). */
export function clearConfigCache(): void {
  cache.clear();
  inflight.clear();
}
