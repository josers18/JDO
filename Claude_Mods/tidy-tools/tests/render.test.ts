import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const setup = (on: Parameters<TestBody>[1]) => {
  const stored = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: stored.get(e.key) ?? null }) as never)
  on('store.set', (_$, e) => {
    stored.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('session.start', (_$, e) => e as never)
  on('session.cwd', () => ({ value: '/repo' }))
  on('env.get', () => ({ value: '/home/j' }) as never)
  on('prompt.submit', (_$, e) => e as never)
  on('clock.now', () => ({ value: 1_000 }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 1 }) as never)
  on('ui.render', { component: 'ToolResult' }, $ => {
    const { Text } = $.ui.resolve({ surface: 'terminal', component: 'ToolResult' } as never) as { Text: (p: object) => never }
    return Text({ key: 'engine-output', children: 'full output' })
  })
  return stored
}

const toolUse = (props: object) => ({ plugin: 'tidy-tools', component: 'ToolUse', requestId: 'tu1', props: { tool_use_id: 'tu1', isRunning: false, isErrored: false, isInterrupted: false, ...props } }) as object
const toolResult = (props: object) => ({ plugin: 'tidy-tools', component: 'ToolResult', requestId: 'tu1', props: { tool_use_id: 'tu1', isErrored: false, ...props } }) as object
const done = { input: {}, isRunning: false, isErrored: false, isInterrupted: false }
const layaOut = [{ type: 'text', text: JSON.stringify({ result: JSON.stringify({ answers: { kind: { type: 'choice', choice: 'feature', answer_confidence: 0.92 } }, routing: { model: 'english' }, latency_ms: 12, device: 'mps' }) }) }]

describe('through the engine', () => {
  test('rows, laya card, groups, folded results and the plan panel draw on every surface', async ($, on) => {
    const stored = setup(on)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const mount = (o: object) => $.ui.mount({ ...o, surface } as never)

      let ui = await mount(toolUse({ tool: 'Read', input: { file_path: '/repo/hooks/a.ts' }, output: { type: 'text', file: { numLines: 5, startLine: 1, totalLines: 5 } } }))
      expect(await ui.find({ text: 'Read' })).toBeDefined()
      expect(await ui.find({ text: 'hooks/' })).toBeDefined()
      expect(await ui.find({ text: '  5 lines' })).toBeDefined()
      await ui.unmount()

      ui = await mount(toolUse({ tool: 'Bash', input: { command: 'git status', description: 'Show status' }, isErrored: true }))
      expect(await ui.find({ text: '✗ ' })).toBeDefined()
      expect(await ui.find({ text: 'Show status' })).toBeDefined()
      await ui.unmount()

      ui = await mount(toolUse({ tool: 'Edit', input: { file_path: '/repo/a.ts' }, output: { structuredPatch: [{ lines: ['+a', '-b'] }] } }))
      expect(await ui.find({ text: ' +1' })).toBeDefined()
      expect(await ui.find({ text: ' −1' })).toBeDefined()
      await ui.unmount()

      ui = await mount(toolUse({ tool: 'mcp__laya__laya_predict', input: { questions: { kind: {} } }, output: layaOut }))
      expect(await ui.find({ text: 'laya · predict' })).toBeDefined()
      expect(await ui.find({ text: 'feature' })).toBeDefined()
      expect(await ui.find({ text: '  92%' })).toBeDefined()
      expect(await ui.find({ text: 'english · mps · 12ms' })).toBeDefined()
      await ui.unmount()

      ui = await mount(toolUse({ tool: 'mcp__laya__laya_predict', input: { questions: { kind: {} } }, isRunning: true }))
      expect(await ui.find({ text: '  deciding kind' })).toBeDefined()
      await ui.unmount()

      ui = await mount(toolResult({ tool: 'Bash', output: { stdout: 'a\nb\n', stderr: '' } }))
      expect(await ui.find({ text: '  ⎿  2 lines · a' })).toBeDefined()
      expect(await ui.find({ text: 'full output' })).toBeUndefined()
      await ui.unmount()

      ui = await mount(toolResult({ tool: 'Read', output: 'x' }))
      expect(await ui.find({ text: 'full output' })).toBeUndefined()
      await ui.unmount()

      const calls = [
        { ...done, tool: 'Read' },
        { ...done, tool: 'Bash', input: { command: 'rg x' }, isErrored: true },
        { ...done, tool: 'mcp__laya__laya_predict', input: { questions: { kind: {} } }, output: layaOut },
      ]
      ui = await mount({ plugin: 'tidy-tools', component: 'ToolGroup', requestId: 'g', props: { calls, isActive: false, isExpanded: false } })
      expect(await ui.find({ text: 'Explored ' })).toBeDefined()
      expect(await ui.find({ text: '  read 1 file · ran 1 search' })).toBeDefined()
      expect(await ui.find({ text: ' · 1 failed' })).toBeDefined()
      expect(await ui.find({ text: '  kind → feature 92%' })).toBeDefined()
      await ui.unmount()
    }

    await $.prompt.submit({ text: 'Make tidy nicer' } as never)
    await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'c1', todos: [{ content: 'Rows', status: 'completed', activeForm: 'Doing rows' }, { content: 'Panel', status: 'in_progress', activeForm: 'Doing panel' }] } as never)
    const band = { plugin: 'tidy-tools', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 } }
    let ui = await $.ui.mount({ ...band, surface: 'terminal' } as never)
    expect(await ui.find({ text: 'Make tidy nicer' })).toBeDefined()
    expect(await ui.find({ text: 'Step 2 of 2 ' })).toBeDefined()
    expect(await ui.find({ text: 'Panel' })).toBeDefined()
    expect(await ui.find({ text: /─ Tidy ─$/ })).toBeDefined()
    await ui.unmount()

    await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'c2', todos: [{ content: 'Rows', status: 'completed', activeForm: 'Doing rows' }, { content: 'Panel', status: 'completed', activeForm: 'Doing panel' }] } as never)
    ui = await $.ui.mount({ ...band, surface: 'terminal' } as never)
    expect(await ui.find({ text: /─ Tidy ─$/ })).toBeUndefined()
    await ui.unmount()

    const off = await $.command.run({ command: 'tidy', args: '' } as never)
    expect('text' in off ? off.text : '').toContain('off')
    expect(stored.get('isOff')).toBe(true)
    ui = await $.ui.mount({ ...toolResult({ tool: 'Read', output: 'x' }), surface: 'terminal' } as never)
    expect(await ui.find({ text: 'full output' })).toBeDefined()
    await ui.unmount()
  })
})
