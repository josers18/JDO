import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { canPost, componentOf, draftRequest, hashOf, permalinkOf, skillRules, stageOf } from '../hooks/model.ts'

const SKILL = '# Announce\n### Phase 1 — shape\nx\n### Phase 2 — Tone\nLead with value.\n### Phase 3 — Draft\n🚀 template\n### Phase 4 — DM\nsend'
const LINK = 'https://salesforce-internal.slack.com/archives/D02L9LXCEAX/p1780000000000001'

describe('model', () => {
  test('gate: only the exact DM-ed text may post', () => {
    const d = { component: 'x', path: 'x', text: 'hello' }
    expect(stageOf(d)).toBe('draft')
    expect(canPost(d)).toBe(false)
    const dmed = { ...d, dm: { hash: hashOf('hello'), link: LINK } }
    expect(canPost(dmed)).toBe(true)
    expect(canPost({ ...dmed, text: 'hello!' })).toBe(false)
    expect(stageOf({ ...dmed, posted: { hash: hashOf('hello'), link: LINK } })).toBe('posted')
  })
  test('prompt pieces', () => {
    expect(componentOf('Claude_Mods/jdo-cost-router/')).toBe('jdo-cost-router')
    expect(skillRules(SKILL)).toBe('### Phase 2 — Tone\nLead with value.\n### Phase 3 — Draft\n🚀 template')
    const ask = draftRequest({ component: 'c', path: 'p', readme: 'R', rules: 'RULES', feedback: 'shorter', previous: 'old' })
    expect(ask.system).toContain('RULES')
    expect(ask.prompt).toContain('Current draft:\nold')
    expect(ask.prompt).toContain('per this feedback, keeping everything else: shorter')
    expect(permalinkOf([{ type: 'text', text: `Message sent: ${LINK}` }])).toBe(LINK)
  })
})

const world = (on: On, sent: { channel: string; message: string }[]) => {
  mock.env(on, { HOME: '/Users/test' })
  on('ui.open', () => ({ value: {} }) as never)
  on('fs.read', (_$, e) =>
    e.path.endsWith('SKILL.md') ? { value: SKILL } : e.path === '/Users/test/Documents/Git/JDO/Claude_Mods/jdo-x/README.md' ? { value: '# jdo-x\nDoes x.' } : { deny: 'ENOENT' },
  )
  let n = 0
  on('model.complete', (_$, e) => {
    n++
    return { value: { isAnswered: true, text: `🚀 *New on JDO: jdo-x* v${n}${e.prompt.includes('feedback') ? ' (revised)' : ''}`, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
  on('mcp.call', (_$, e) => {
    sent.push({ channel: String(e.args.channel_id), message: String(e.args.message) })
    return { value: { content: [{ type: 'text', text: `Message sent: ${LINK}` }], isError: false } } as never
  })
}

describe('pane', () => {
  test('DM first, then post; a tweak re-locks posting', async ($, on) => {
    const clock = mock.clock(on)
    const sent: { channel: string; message: string }[] = []
    world(on, sent)

    await $.command.run({ command: 'announce', args: 'Claude_Mods/jdo-x' } as never)
    await clock.settle()
    const ui = await $.ui.mount({
      plugin: 'jdo-announce',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'announce',
      props: { title: 'Announce', isFocused: true, bodyColumns: 80, placement: 'dock' } as never,
    })
    expect(await ui.find({ text: /New on JDO: jdo-x\* v1/ })).toBeDefined()
    expect(await ui.find({ key: 'post' })).toBeUndefined()
    expect(await ui.find({ text: /Post unlocks once this exact draft is in your DM/ })).toBeDefined()

    await ui.press({ key: 'dm' })
    expect(sent).toEqual([{ channel: 'U02LZ7EM0BS', message: '🚀 *New on JDO: jdo-x* v1' }])
    expect(await ui.find({ key: 'post' })).toBeDefined()

    await ui.input({ key: 'tweak', text: 'shorter' })
    expect(await ui.find({ text: /v2 \(revised\)/ })).toBeDefined()
    expect(await ui.find({ key: 'post' })).toBeUndefined()

    await ui.press({ key: 'dm' })
    await ui.press({ key: 'post' })
    expect(sent.map(s => s.channel)).toEqual(['U02LZ7EM0BS', 'U02LZ7EM0BS', 'C08R0EM8PAS'])
    expect(sent[2]?.message).toBe('🚀 *New on JDO: jdo-x* v2 (revised)')
    expect(await ui.find({ text: /posted/ })).toBeDefined()
    await ui.unmount()
  })
})
