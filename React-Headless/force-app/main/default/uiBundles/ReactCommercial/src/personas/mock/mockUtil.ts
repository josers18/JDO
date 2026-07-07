/**
 * Mock-phase utilities. Every persona fetcher returns via `mockResolve` so the
 * cockpits exercise real async/loading states. When wiring live data, each
 * fetcher body is swapped for executeGraphQL / queryDataCloud and this helper
 * simply disappears from that fetcher — call sites (useAsyncData) never change.
 */
export function mockResolve<T>(value: T, delayMs = 450): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), delayMs));
}

/** Deterministic pseudo-random series for sparklines (no Math.random in build). */
export function series(seed: number, length = 12, base = 100, spread = 30): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push(Math.round(base + ((x / 0x7fffffff) - 0.5) * spread));
  }
  return out;
}
