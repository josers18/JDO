/**
 * Mock ⇄ Real data-source switch.
 *
 * Every fetcher wraps its two implementations in `resolve(mockFn, realFn)`.
 * While MODE is 'mock' the UI runs on the representative fixtures; flip to
 * 'real' (globally, or per-domain) to hit executeGraphQL / queryDataCloud.
 *
 * The real implementations depend on the LIVE org schema — GraphQL field names
 * verified via graphql-search.sh and Data Cloud DMO columns confirmed via a
 * `SELECT ... LIMIT 5` probe. Until that's done they are marked
 * `// TODO(verify)` and MODE stays 'mock' so nothing fails silently.
 */
export type DataMode = 'mock' | 'real';

/** Domains can be flipped independently as each is verified against the org. */
export type DataDomain = 'core' | 'dataCloud' | 'agentforce';

interface DataConfig {
  mode: DataMode;
  /** per-domain override; falls back to `mode` */
  overrides: Partial<Record<DataDomain, DataMode>>;
}

// ReactCommercial runs LIVE. Core (GraphQL: Opportunity/Case/Task/Event/
// FinancialGoal) + Data Cloud (business credit via CumulusDnBBusinessCredit__dlm)
// are verified against jdo-1lrnov, so both are 'real'. Agentforce summaries stay
// 'mock' until the Agentforce prompt path is wired.
const config: DataConfig = {
  mode: 'mock',
  overrides: {
    core: 'real',
    dataCloud: 'real',
    // Live Agentforce prompt flows via the Flow Actions REST API; slots with no
    // runnable org flow fall back to the composed summary (see agentforceFlows.ts).
    agentforce: 'real',
  },
};

export function modeFor(domain: DataDomain): DataMode {
  return config.overrides[domain] ?? config.mode;
}

/** Runtime switches (e.g. from a dev toggle or env) — safe to call anytime. */
export function setDataMode(mode: DataMode): void {
  config.mode = mode;
}
export function setDomainMode(domain: DataDomain, mode: DataMode): void {
  config.overrides[domain] = mode;
}

/**
 * Resolve a fetcher: returns the real impl when its domain is 'real', else mock.
 * Both are thunks so the unused one is never invoked.
 */
export function resolve<T>(domain: DataDomain, mockFn: () => Promise<T>, realFn: () => Promise<T>): Promise<T> {
  return modeFor(domain) === 'real' ? realFn() : mockFn();
}
