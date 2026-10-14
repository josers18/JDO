// Pure helpers: what a tool row, its folded result and a group line say.

export type Part = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type Row = { icon: string; color: string; verb: string; dir?: string; target?: string; meta: Part[] }

export const ORANGE = '#e8875b'
const BLUE = '#7aa2f7'
const GREEN = '#3fb950'
const RED = '#f85149'
const VIOLET = '#bb9af7'
const TEAL = '#2ac3de'
const SKY = '#00a1e0'
const LIME = '#9ece6a'
const GOLD = '#e0af68'
const GREY = '#8b949e'

// Claude's spinner glyphs, out and back.
const SPARKS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
export const spark = (frame: number) => SPARKS[frame % SPARKS.length]!

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const firstLine = (s: string) => s.split('\n').find(l => l.trim())?.trim() ?? ''
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const isLaya = (tool: string) => tool.startsWith('mcp__laya__')

/** Tools whose rows stay the engine's: they ask the person something. */
export const isInteractive = (tool: string) => ['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'].includes(tool)

/** `dir/` and `name` of a path, relative to the session folder or ~. */
export function splitPath(path: string, cwd = '', home = ''): { dir: string; name: string } {
  let p = path
  if (cwd && p.startsWith(`${cwd}/`)) p = p.slice(cwd.length + 1)
  else if (home && p.startsWith(`${home}/`)) p = `~/${p.slice(home.length + 1)}`
  const at = p.lastIndexOf('/')
  return at < 0 ? { dir: '', name: p } : { dir: p.slice(0, at + 1), name: p.slice(at + 1) }
}

type Kind = { icon: string; color: string }
const KINDS: [RegExp, Kind][] = [
  [/^(grep|rg|ag|ack|find|fd)$/, { icon: '⌕', color: BLUE }],
  [/^(git|gh)$/, { icon: '⎇', color: ORANGE }],
  [/^(sf|sfdx)$/, { icon: '☁', color: SKY }],
  [/^(npm|npx|node|bun|pnpm|yarn|tsc|vitest|jest)$/, { icon: '⬢', color: LIME }],
  [/^(python3?|pip3?|uv|pytest)$/, { icon: 'λ', color: GOLD }],
  [/^(curl|wget|http)$/, { icon: '⇅', color: TEAL }],
  [/^(ls|cat|head|tail|sed|awk|wc|tree|stat)$/, { icon: '◇', color: VIOLET }],
  [/^(rm|mv|cp|mkdir|chmod|touch|ln)$/, { icon: '✚', color: GOLD }],
]

/** The words a Bash command starts with, past `cd x &&` and `VAR=` prefixes: `git log`. */
export function commandHead(command: string): string[] {
  const segments = command.split(/&&|;|\n/).map(s => s.trim()).filter(Boolean)
  const seg = segments.find(s => !/^cd\s/.test(s)) ?? segments[0] ?? ''
  const words = seg.split(/\s+/).filter(w => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
  const head = words[0]?.split('/').pop() ?? ''
  const sub = words[1] && /^[a-z][\w-]*$/.test(words[1]) ? words[1] : ''
  return sub ? [head, sub] : head ? [head] : []
}

export function bashKind(command: string): Kind {
  const head = commandHead(command)[0] ?? ''
  return KINDS.find(([re]) => re.test(head))?.[1] ?? { icon: '$', color: GREY }
}

function diffStat(patch: unknown): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const h of Array.isArray(patch) ? patch : []) {
    for (const l of (h as { lines?: unknown }).lines as string[] ?? []) {
      if (l.startsWith('+')) add++
      else if (l.startsWith('-')) del++
    }
  }
  return { add, del }
}

const statParts = ({ add, del }: { add: number; del: number }): Part[] => [
  ...(add ? [{ text: ` +${add}`, color: GREEN }] : []),
  ...(del ? [{ text: ` −${del}`, color: RED }] : []),
]

/** Lines an Edit's diff changed: small diffs stay drawn in full. */
export const changedLines = (output: unknown) => {
  const s = diffStat((output as { structuredPatch?: unknown } | undefined)?.structuredPatch)
  return s.add + s.del
}

const seconds = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`)
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`)
const tokens = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`)

/** One row for a tool call: an icon, a verb, a target and what came of it. */
export function row(tool: string, input: unknown, output: unknown, cwd = '', home = ''): Row {
  const i = (input ?? {}) as Record<string, unknown>
  const o = (output ?? undefined) as Record<string, any> | undefined
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const path = (p: string) => splitPath(p, cwd, home)

  if (tool === 'Bash') {
    const command = str('command')
    const kind = bashKind(command)
    const head = commandHead(command).join(' ')
    const verb = str('description').trim() || firstLine(command)
    return { ...kind, verb: clip(verb), meta: head && verb !== firstLine(command) ? [{ text: `  ${head}`, dim: true }] : [] }
  }
  if (tool === 'Read') {
    const { dir, name } = path(str('file_path'))
    const f = o?.file as { numLines?: number; startLine?: number; totalLines?: number } | undefined
    const range = f?.numLines && f.totalLines
      ? f.numLines >= f.totalLines ? `  ${plural(f.totalLines, 'line')}` : `  lines ${f.startLine}–${(f.startLine ?? 1) + f.numLines - 1} of ${f.totalLines}`
      : ''
    return { icon: '◇', color: VIOLET, verb: 'Read', dir, target: name, meta: range ? [{ text: range, dim: true }] : [] }
  }
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const { dir, name } = path(str('file_path') || str('notebook_path'))
    return { icon: '✎', color: GOLD, verb: 'Edit', dir, target: name, meta: o ? statParts(diffStat(o.structuredPatch)) : [] }
  }
  if (tool === 'Write') {
    const { dir, name } = path(str('file_path'))
    const isNew = o?.type === 'create'
    const lines = str('content').split('\n').length
    const meta: Part[] = !o ? [] : isNew ? [{ text: '  new', color: GREEN }, { text: ` · ${plural(lines, 'line')}`, dim: true }] : statParts(diffStat(o.structuredPatch))
    return { icon: '✚', color: GREEN, verb: 'Write', dir, target: name, meta }
  }
  if (tool === 'Agent' || tool === 'Task') {
    const type = str('subagent_type')
    const meta: Part[] = type ? [{ text: `  ${type}`, color: VIOLET }] : []
    if (o && typeof o.totalToolUseCount === 'number') {
      meta.push({ text: `  ${plural(o.totalToolUseCount, 'tool')} · ${seconds(o.totalDurationMs ?? 0)} · ${tokens(o.totalTokens ?? 0)} tok`, dim: true })
    }
    return { icon: '⧉', color: VIOLET, verb: 'Agent', target: clip(str('description') || type, 60), meta }
  }
  if (tool === 'Skill') {
    return { icon: '✦', color: ORANGE, verb: 'Skill', target: str('skill'), meta: str('args') ? [{ text: `  ${clip(str('args'), 50)}`, dim: true }] : [] }
  }
  if (tool === 'WebFetch') {
    const url = str('url').replace(/^https?:\/\//, '')
    const meta: Part[] = o && typeof o.code === 'number' ? [{ text: `  ${o.code}`, color: o.code < 400 ? GREEN : RED }, { text: ` · ${kb(o.bytes ?? 0)} · ${seconds(o.durationMs ?? 0)}`, dim: true }] : []
    return { icon: '⇣', color: TEAL, verb: 'Fetch', target: clip(url, 60), meta }
  }
  if (tool === 'WebSearch') {
    const hits = Array.isArray(o?.results) ? o.results.flatMap((r: any) => (typeof r === 'object' && Array.isArray(r?.content) ? r.content : [])).length : 0
    return { icon: '⌕', color: BLUE, verb: 'Search', target: `“${clip(str('query'), 60)}”`, meta: o ? [{ text: `  ${plural(hits, 'result')}`, dim: true }] : [] }
  }
  if (tool === 'TodoWrite' || tool.startsWith('Task')) {
    const todos = Array.isArray(i.todos) ? (i.todos as { status?: string }[]) : []
    const done = todos.filter(t => t.status === 'completed').length
    const target = tool === 'TodoWrite' ? `${done}/${todos.length} done` : str('subject') || str('taskId')
    return { icon: '☰', color: ORANGE, verb: tool === 'TodoWrite' ? 'Plan' : tool.replace(/^Task/, 'Task '), target: clip(target, 60), meta: [] }
  }
  const mcp = tool.match(/^mcp__(.+?)__(.+)$/)
  if (mcp) {
    const arg = Object.values(i).find((v): v is string => typeof v === 'string' && v.trim() !== '')
    return { icon: '⬡', color: TEAL, verb: mcp[1]!, target: mcp[2]!, meta: arg ? [{ text: `  ${clip(firstLine(arg), 70)}`, dim: true }] : [] }
  }
  const arg = Object.values(i).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return { icon: '•', color: GREY, verb: tool, meta: arg ? [{ text: `  ${clip(firstLine(arg), 70)}`, dim: true }] : [] }
}

export function textOf(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    return output.map(b => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : '')).join('\n')
  }
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.stdout === 'string') return [o.stdout, typeof o.stderr === 'string' ? o.stderr : ''].filter(Boolean).join('\n')
    if (Array.isArray(o.content)) return textOf(o.content)
    if (typeof o.result === 'string') return o.result
    return JSON.stringify(output, null, 2)
  }
  return ''
}

/** Tools whose result row folds to one line; the rest say it all in the row itself. */
export const foldsToLine = (tool: string) => tool === 'Bash' || (tool.startsWith('mcp__') && !isLaya(tool))

/** One line in place of the dump: "24 lines · <first line>", or "done" when there was nothing. */
export function resultLine(output: unknown): string {
  const o = output as { backgroundTaskId?: unknown } | null
  if (o && typeof o === 'object' && typeof o.backgroundTaskId === 'string') return 'running in background'
  const text = textOf(output).replace(/\s+$/, '')
  if (!text) return 'done'
  const lines = text.split('\n').length
  const first = firstLine(text)
  return lines === 1 ? first : `${lines} lines · ${first}`
}

const NOUNS: Record<string, [string, string, string]> = {
  Read: ['read', 'file', 'files'],
  search: ['ran', 'search', 'searches'],
  Bash: ['ran', 'command', 'commands'],
  WebFetch: ['fetched', 'page', 'pages'],
  WebSearch: ['searched', 'query', 'queries'],
  mcp: ['called', 'MCP tool', 'MCP tools'],
}

/** `read 3 files · ran 2 commands` for a group, in first-seen order. */
export function groupWords(calls: readonly { tool: string; input: unknown }[]): string {
  const counts = new Map<string, number>()
  for (const c of calls) {
    if (isLaya(c.tool)) continue
    const command = typeof (c.input as { command?: unknown })?.command === 'string' ? ((c.input as { command: string }).command) : ''
    const key = c.tool === 'Bash' && bashKind(command).icon === '⌕' ? 'search' : c.tool.startsWith('mcp__') ? 'mcp' : c.tool
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([k, n]) => {
    const [verb, one, many] = NOUNS[k] ?? [k, 'call', 'calls']
    return `${verb} ${plural(n, one, many)}`
  }).join(' · ')
}

/** The icon and color a call shows as one bead in a group's track. */
export function bead(tool: string, input: unknown): Kind {
  if (isLaya(tool)) return { icon: '◆', color: TEAL }
  const r = row(tool, input, undefined)
  return { icon: r.icon, color: r.color }
}
