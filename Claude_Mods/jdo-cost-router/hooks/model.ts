// Pure pieces of the router: which spawns to route, and the usage report.
import type { CostRouterRouted, CostRouterUsage } from '../types'

export const parseTypes = (csv: string): Set<string> =>
  new Set(
    csv
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
  )

// Route only when the caller named no model: an explicit `model` is a choice.
export const shouldRoute = (spawn: { subagentType: string; model?: string }, types: ReadonlySet<string>): boolean =>
  spawn.model === undefined && types.has(spawn.subagentType)

type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number }

export const addUsage = (usage: CostRouterUsage, u: Usage): CostRouterUsage => {
  const was = usage[u.model] ?? { turns: 0, input: 0, output: 0, cacheRead: 0 }
  return {
    ...usage,
    [u.model]: {
      turns: was.turns + 1,
      input: was.input + u.input_tokens,
      output: was.output + u.output_tokens,
      cacheRead: was.cacheRead + u.cache_read_input_tokens,
    },
  }
}

const k = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export const report = (o: { routed: CostRouterRouted; usage: CostRouterUsage; isOff: boolean; cheapModel: string; types: ReadonlySet<string> }): string => {
  const spawned = Object.entries(o.routed.byType)
  const rows = Object.entries(o.usage).sort(([, a], [, b]) => b.input + b.output - (a.input + a.output))
  return [
    `cost-router is ${o.isOff ? 'OFF' : 'on'} for this session: ${[...o.types].join(', ') || '(no types)'} → ${o.cheapModel} when the caller names no model.`,
    spawned.length > 0
      ? `Routed spawns: ${spawned.map(([t, n]) => `${t} ×${n}`).join(', ')}.`
      : 'No spawns routed yet.',
    rows.length > 0
      ? `Subagent tokens by model: ${rows.map(([m, u]) => `${m}: ${u.turns} turn${u.turns > 1 ? 's' : ''}, ${k(u.input)} in (+${k(u.cacheRead)} cached) / ${k(u.output)} out`).join('; ')}.`
      : 'No subagent turns finished yet.',
  ].join('\n')
}
