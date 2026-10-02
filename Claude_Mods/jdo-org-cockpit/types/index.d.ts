export type OrgInfo = { alias: string; username: string; instanceUrl: string; status: string; apiVersion: string }
export type BundleRow = { name: string; deployedAt: string | null; dist: 'fresh' | 'stale' | 'missing' | 'unknown' }
export type StreamRow = { name: string; run: string; status: string; lastRefresh: string | null }
export type Snapshot = {
  at: number
  org: OrgInfo | null
  bundles: BundleRow[]
  streams: StreamRow[]
  errors: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'jdo-org-cockpit': { snapshot: Snapshot | null; isLoading: boolean }
  }
}
