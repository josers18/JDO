import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AnnounceDraft } from '../types'
import { canPost, componentOf, draftRequest, hashOf, permalinkOf, skillRules, stageOf } from './model.ts'

const PANE = 'announce'
const draft = atom({ plugin: 'jdo-announce', key: 'draft' } as const, null)
const isBusy = atom({ plugin: 'jdo-announce', key: 'isBusy' } as const, false)
const error = atom({ plugin: 'jdo-announce', key: 'error' } as const, null)

type Cfg = { repoDir: string; draftModel: string; channelId: string; dmUserId: string; slackServer: string }

async function home($: EngineInterface, path: string) {
  return path.startsWith('~') ? `${(await $.env.get('HOME')) ?? ''}${path.slice(1)}` : path
}

// Drafts (or, with feedback, revises) the post from the component's README,
// under the announce-jdo-component skill's own tone and template rules.
async function generate($: EngineInterface, cfg: Cfg, path: string, feedback?: string) {
  if (await read($, isBusy)) return
  await update($, isBusy, () => true)
  await update($, error, () => null)
  try {
    const repo = await home($, cfg.repoDir)
    const readme = await $.fs.read(`${repo}/${path}/README.md`)
    const skill = await $.fs.read(await home($, '~/.claude/skills/announce-jdo-component/SKILL.md')).catch(() => undefined)
    const held = await read($, draft)
    const component = componentOf(path)
    const ask = draftRequest({
      component,
      path,
      readme,
      rules: skill === undefined ? undefined : skillRules(skill),
      feedback,
      previous: feedback ? held?.text : undefined,
    })
    const r = await $.model.complete({ model: cfg.draftModel, ...ask, maxTokens: 2000 })
    if (!r.isAnswered) throw new Error(`draft model: ${r.reason}`)
    const kept: Partial<AnnounceDraft> = held?.component === component ? { dm: held.dm, posted: held.posted } : {}
    await update($, draft, () => ({ component, path, text: r.text.trim(), ...kept }))
  } catch (err) {
    await update($, error, () => String(err))
  } finally {
    await update($, isBusy, () => false)
  }
}

// Sends the current draft. The channel post re-checks the gate at press time:
// only the exact text already DM'd for review may go out.
async function send($: EngineInterface, cfg: Cfg, to: 'dm' | 'channel') {
  const held = await read($, draft)
  if (!held || (await read($, isBusy))) return
  if (to === 'channel' && !canPost(held)) {
    await update($, error, () => 'Post is locked: DM this exact draft for review first.')
    return
  }
  await update($, isBusy, () => true)
  await update($, error, () => null)
  try {
    const target = to === 'dm' ? cfg.dmUserId : cfg.channelId
    const r = await $.mcp.call(cfg.slackServer, 'slack_send_message', { channel_id: target, message: held.text })
    const text = r.content.map(b => ('text' in b ? String(b.text) : '')).join('\n')
    if (r.isError) throw new Error(text.slice(0, 300) || 'slack_send_message failed')
    const sent = { hash: hashOf(held.text), link: permalinkOf(r.content.map(b => ({ type: b.type, text: 'text' in b ? String(b.text) : '' }))) ?? '(sent; no link returned)' }
    await update($, draft, d => (d ? { ...d, ...(to === 'dm' ? { dm: sent } : { posted: sent }) } : d))
    $.ui.toast(to === 'dm' ? 'Draft sent to your DM for review' : `Posted to the JDO channel`)
  } catch (err) {
    await update($, error, () => String(err))
  } finally {
    await update($, isBusy, () => false)
  }
}

export const register: Register = (on, options) => {
  const cfg: Cfg = {
    repoDir: String(options.repoDir ?? '~/Documents/Git/JDO'),
    draftModel: String(options.draftModel ?? 'sonnet'),
    channelId: String(options.channelId ?? 'C08R0EM8PAS'),
    dmUserId: String(options.dmUserId ?? 'U02LZ7EM0BS'),
    slackServer: String(options.slackServer ?? 'slack'),
  }
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'announce',
      description: 'Draft a JDO launch post for a component; DM-first review, then post',
      argumentHint: '<component path in the JDO repo>',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'announce' }, async ($, e) => {
    const arg = e.args.trim()
    const held = await read($, draft)
    if (!arg && !held) return { text: 'Usage: /announce <component path in the JDO repo>, e.g. /announce Claude_Mods/jdo-cost-router' }
    await $.ui.open({ id: PANE, title: 'Announce', focus: true, closeOnEscape: true })
    if (arg) $.clock.after(0, () => void generate($, cfg, arg.replace(/\/+$/, '')))
    return { text: arg ? `Drafting an announcement for ${componentOf(arg)}…` : `Announcement pane reopened for ${held!.component}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const held = await read($, draft)
    const busy = await read($, isBusy)
    const err = await read($, error)
    const stage = held ? stageOf(held) : 'draft'
    // a free-text revision box; mobile draws no Input
    const tweak =
      e.surface === 'mobile' || !held ? null : (() => {
        const { Input } = $.ui.resolve(e)
        return (
          <Input
            key="tweak"
            label="Tweak"
            placeholder="e.g. shorter, lead with the A/B result"
            submitLabel="Revise"
            onSubmit={(value: string) => void (value.trim() && generate($, cfg, held.path, value.trim()))}
          />
        )
      })()
    const label = { draft: 'draft · not sent', 'dm-sent': 'in your DM for review', posted: 'posted' }[stage]

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2}>
          <Text bold>{held ? held.component : 'Announcement'}</Text>
          <Text color={stage === 'posted' ? '#3fb950' : stage === 'dm-sent' ? '#d29922' : undefined} dimColor={stage === 'draft'}>
            {busy ? 'working…' : label}
          </Text>
        </Box>
        {held ? <Markdown key="draft" text={held.text} /> : <Text dimColor>{busy ? 'Drafting from the README…' : 'No draft yet.'}</Text>}
        {held?.dm && <Text dimColor wrap="truncate">DM: {held.dm.link}</Text>}
        {held?.posted && <Text dimColor wrap="truncate">Channel: {held.posted.link}</Text>}
        {held && stage !== 'posted' && (
          <Box flexDirection="row" gap={1}>
            <Button key="dm" hotkey="d" variant={stage === 'draft' ? 'primary' : 'secondary'} onPress={() => void send($, cfg, 'dm')}>
              {stage === 'dm-sent' ? 'Re-send to my DM' : 'Send to my DM'}
            </Button>
            {canPost(held) ? (
              <Button key="post" hotkey="p" variant="primary" onPress={() => void send($, cfg, 'channel')}>
                Post to #JDO
              </Button>
            ) : (
              <Text dimColor>Post unlocks once this exact draft is in your DM</Text>
            )}
            <Button key="regen" hotkey="g" dimColor onPress={() => void generate($, cfg, held.path)}>
              Regenerate
            </Button>
          </Box>
        )}
        {held && stage !== 'posted' && tweak}
        {stage === 'posted' && <Text dimColor>Next: add the canvas section (announce-jdo-component skill, Phase 7).</Text>}
        {err && <Text color="#f85149" wrap="truncate">{err}</Text>}
      </Box>
    )
  })
}
