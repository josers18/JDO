// Pure pieces of /announce: the drafting prompt, the gate, and Slack replies.
import type { AnnounceDraft } from '../types'

// FNV-1a over the text: which exact draft a send covered.
export const hashOf = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export type Stage = 'draft' | 'dm-sent' | 'posted'

export const stageOf = (d: AnnounceDraft): Stage => {
  const h = hashOf(d.text)
  if (d.posted?.hash === h) return 'posted'
  if (d.dm?.hash === h) return 'dm-sent'
  return 'draft'
}

// The skill's DM-first rule, as a gate: only the exact text already DM'd posts.
export const canPost = (d: AnnounceDraft): boolean => stageOf(d) === 'dm-sent'

// `Claude_Mods/jdo-cost-router` → `jdo-cost-router`; trailing slashes dropped.
export const componentOf = (arg: string): string => arg.trim().replace(/\/+$/, '').split('/').pop() ?? ''

// The skill's tone and template sections (Phase 2 + Phase 3), the rules the
// draft must follow; the whole file when the headings are not found.
export const skillRules = (skill: string): string => {
  const start = skill.indexOf('### Phase 2')
  const end = skill.indexOf('### Phase 4')
  return start >= 0 && end > start ? skill.slice(start, end).trim() : skill
}

const FALLBACK_RULES = [
  'Lead with value, not implementation. Pitch tone, not release notes: no version bumps or bug fixes.',
  'Say "JDO", never an org alias. No admin-only theming mentions. No screenshot asks.',
  'Shape: 🚀 *New on JDO: <Name>*, a 2-3 sentence pitch, *What it shows* (3-4 bullets), *Why it\'s nicer* (3-4 bullets), *See it now*, *Resources* with GitHub links under https://github.com/josers18/JDO/tree/main/<path>.',
].join('\n')

export const draftRequest = (o: { component: string; path: string; readme: string; rules: string | undefined; feedback?: string; previous?: string }) => ({
  system: [
    'You write JDO launch announcements for the JDO Slack channel. Follow these rules exactly.',
    o.rules ?? FALLBACK_RULES,
    'Reply with the Slack message only: no preamble, no code fence, no notes.',
  ].join('\n\n'),
  prompt: [
    `Component: ${o.component} (repo path: ${o.path})`,
    `README:\n${o.readme.slice(0, 12_000)}`,
    o.previous ? `Current draft:\n${o.previous}` : '',
    o.feedback ? `Revise the current draft per this feedback, keeping everything else: ${o.feedback}` : '',
  ]
    .filter(Boolean)
    .join('\n\n'),
})

// slack_send_message answers with text holding the message's permalink.
export const permalinkOf = (blocks: readonly { type: string; text?: string }[]): string | undefined => {
  const text = blocks.map(b => b.text ?? '').join('\n')
  return text.match(/https:\/\/[^\s"')]+\/archives\/[A-Z0-9]+\/p\d+[^\s"')]*/)?.[0]
}
