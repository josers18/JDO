export type OrgInfo = { alias: string; username: string; instanceUrl: string; status: string; apiVersion: string }
// `dir` is the local folder under uiBundles/ when there is one (the org may spell the name differently)
export type BundleRow = { name: string; dir?: string; deployedAt: string | null; dist: 'fresh' | 'stale' | 'missing' | 'unknown' }
export type StreamRow = { name: string; run: string; status: string; lastRefresh: string | null }
export type DeployRow = { startedAt: string; status: string; components: number; errors: number; isCheckOnly: boolean; by: string }
export type Snapshot = {
  at: number
  org: OrgInfo | null
  bundles: BundleRow[]
  streams: StreamRow[]
  deploys: DeployRow[]
  errors: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'jdo-org-cockpit': { snapshot: Snapshot | null; isLoading: boolean }
  }
}
