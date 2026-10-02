import { describe, expect, test } from 'claude-code/testing'
import { addUsage, parseTypes, report, shouldRoute } from '../hooks/model.ts'

const TYPES = parseTypes(' Explore, claude-code-guide ,,')
const spawnOf = (subagentType: string, model?: string) =>
  ({
    tool_use_id: `t-${subagentType}-${model ?? 'none'}`,
    prompt: 'find the deploy scripts',
    description: 'Find scripts',
    subagentType,
    model,
    parentModel: 'opus',
    provider: { plugin: 'engine', tier: 'core' },
  }) as never

describe('model', () => {
  test('routes only allowlisted types the caller left unpinned', () => {
    expect([...TYPES]).toEqual(['Explore', 'claude-code-guide'])
    expect(shouldRoute({ subagentType: 'Explore' }, TYPES)).toBe(true)
    expect(shouldRoute({ subagentType: 'Explore', model: 'sonnet' }, TYPES)).toBe(false)
    expect(shouldRoute({ subagentType: 'code-review' }, TYPES)).toBe(false)
  })
  test('accumulates usage per model and reports it', () => {
    const one = { model: 'haiku-x', input_tokens: 1500, output_tokens: 200, cache_read_input_tokens: 12000 }
    const u = addUsage(addUsage({}, one), one)
    expect(u['haiku-x']).toEqual({ turns: 2, input: 3000, output: 400, cacheRead: 24000 })
    const text = report({ routed: { byType: { Explore: 2 }, agentIds: [] }, usage: u, isOff: false, cheapModel: 'haiku', types: TYPES })
    expect(text).toContain('Explore ×2')
    expect(text).toContain('haiku-x: 2 turns, 3k in (+24k cached) / 400 out')
  })
})

describe('through the engine', () => {
  test('rewrites the model for Explore, leaves pinned and other types alone, and reports', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.model)
      return { model: e.model ?? 'opus', agentId: `a${seen.length}` }
    })
    on('turn.complete', () => ({ text: '' }))

    await $.agent.spawn(spawnOf('Explore'))
    await $.agent.spawn(spawnOf('Explore', 'sonnet'))
    await $.agent.spawn(spawnOf('code-review'))
    expect(seen).toEqual(['haiku', 'sonnet', undefined])

    await $.turn.complete({
      turnId: 't1',
      agentId: 'a1',
      answer: 'done',
      durationMs: 10,
      isAborted: false,
      reason: 'answered',
      usage: { model: 'haiku', input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as never)

    const shown = await $.command.run({ command: 'cost-router', args: '' } as never)
    expect('text' in shown ? shown.text : '').toContain('Explore ×1')
    expect('text' in shown ? shown.text : '').toContain('haiku: 1 turn, 1k in (+0 cached) / 100 out')
  })

  test('/cost-router off stops routing for the session', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.model)
      return { model: e.model ?? 'opus' }
    })
    const shown = await $.command.run({ command: 'cost-router', args: 'off' } as never)
    expect('text' in shown ? shown.text : '').toContain('OFF')
    await $.agent.spawn(spawnOf('Explore'))
    expect(seen).toEqual([undefined])
  })
})
