// Token use of subagent turns, per model.
export type CostRouterUsage = Record<string, { turns: number; input: number; output: number; cacheRead: number }>
// Spawns this session routed, by agent type, and the agent ids they got.
export type CostRouterRouted = { byType: Record<string, number>; agentIds: string[] }

declare module 'claude-code' {
  interface PluginState {
    'jdo-cost-router': { usage: CostRouterUsage; routed: CostRouterRouted; isOff: boolean }
  }
}
