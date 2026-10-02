import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { addUsage, parseTypes, report, shouldRoute } from './model.ts'

const usage = atom({ plugin: 'jdo-cost-router', key: 'usage' } as const, {})
const routed = atom({ plugin: 'jdo-cost-router', key: 'routed' } as const, { byType: {}, agentIds: [] })
const isOff = atom({ plugin: 'jdo-cost-router', key: 'isOff' } as const, false)

export const register: Register = (on, options) => {
  const cheapModel = String(options.cheapModel ?? 'haiku')
  const types = parseTypes(String(options.routeTypes ?? ''))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cost-router',
      description: 'Subagent model routing: report, or `on` / `off` for this session',
      argumentHint: '[on|off]',
      immediate: true,
    })
    return next(e)
  })

  // Pick the cheap model for an allowlisted type once, at spawn: the subagent
  // keeps one model for its whole run, so its prompt cache stays warm.
  on('agent.spawn', async ($, e, next) => {
    if ((await read($, isOff)) || !shouldRoute(e, types)) return next(e)
    const spawned = await next({ ...e, model: cheapModel })
    if (spawned.deny === undefined) {
      await update($, routed, r => ({
        byType: { ...r.byType, [e.subagentType]: (r.byType[e.subagentType] ?? 0) + 1 },
        agentIds: spawned.agentId ? [...r.agentIds, spawned.agentId].slice(-200) : r.agentIds,
      }))
      const n = Object.values((await read($, routed)).byType).reduce((a, b) => a + b, 0)
      $.ui.status(`cost-router: ${n} subagent${n > 1 ? 's' : ''} → ${cheapModel}`)
    }
    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId && e.usage) await update($, usage, u => addUsage(u, e.usage!))
    return done
  })

  on('command.run', { command: 'cost-router' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await update($, isOff, () => arg === 'off')
    const text = report({
      routed: await read($, routed),
      usage: await read($, usage),
      isOff: await read($, isOff),
      cheapModel,
      types,
    })
    return { text }
  })
}
