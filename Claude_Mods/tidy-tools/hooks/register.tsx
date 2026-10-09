import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PlanItem } from '../types'
import { card, meter } from './laya.ts'
import { createTask, elapsed, fromProgress, fromTodos, isFresh, labels, ramp, runs, standing, updateTask } from './plan.ts'
import type { ProgressPlan } from './plan.ts'
import { ORANGE, bead, changedLines, foldsToLine, groupWords, isInteractive, isLaya, resultLine, row, spark } from './rows.ts'
import type { Part } from './rows.ts'

const isOff = atom({ plugin: 'tidy-tools', key: 'isOff' } as const, false)
// Ticks while any tool runs: running rows read it, so only they redraw.
const frame = atom({ plugin: 'tidy-tools', key: 'frame' } as const, 0)
const plan = atom({ plugin: 'tidy-tools', key: 'plan' } as const, [] as PlanItem[])
const goal = atom({ plugin: 'tidy-tools', key: 'goal' } as const, '')
const startedAt = atom({ plugin: 'tidy-tools', key: 'startedAt' } as const, 0)
const bars = atom({ plugin: 'plan-progress', key: 'plans' } as const, [] as ProgressPlan[])

const STORE_KEY = 'isOff'
const TICK_MS = 110
const RED = '#f85149'
const TEAL = '#2ac3de'
const TRACK = '#2b3045'
const LAYA_BAR = ramp('#2ac3de', '#7dcfff', 4)
const STEP_BAR = ramp('#e0af68', ORANGE, 8)
const DONE_BAR = ramp('#238636', '#3fb950', 4)
const WORK_BAR = ramp('#c15f3c', ORANGE, 3)
// Rows hidden under their tool row, which already says what came of the call.
const SAID_IN_ROW = new Set(['Read', 'Write', 'Agent', 'Task', 'Skill', 'WebFetch', 'WebSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])
const SMALL_DIFF = 20

let cwd = ''
let home = ''
let lastPrompt = ''
let running = 0
let ticker: Timer | undefined

// The plan, from whichever tool Claude keeps it with.
async function trackPlan($: EngineInterface, e: any, result: any) {
  try {
    if ('deny' in result && result.deny !== undefined) return
    const isNew = (e.tool === 'TodoWrite' || e.tool === 'TaskCreate') && isFresh(await read($, plan))
    if (e.tool === 'TodoWrite') await update($, plan, () => fromTodos(e.todos))
    else if (e.tool === 'TaskCreate') {
      const id = (result.result as { task?: { id?: string } } | undefined)?.task?.id
      if (id) await update($, plan, p => createTask(p, id, e.subject, e.activeForm))
    } else if (e.tool === 'TaskUpdate') await update($, plan, p => updateTask(p, e.taskId, e))
    if (isNew) {
      await update($, goal, () => lastPrompt)
      const now = await $.clock.now()
      await update($, startedAt, () => now)
    }
  } catch {
    // the panel misses this change; the call already ran
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cwd = await $.session.cwd()
    home = (await $.env.get('HOME')) ?? ''
    await $.command.register({ name: 'tidy', description: 'Toggle tidy tool rows, laya cards and the plan panel (off shows full commands and output)' })
    if ((await $.store.get(STORE_KEY)) === true) await update($, isOff, () => true)
    return result
  })

  on('command.run', { command: 'tidy' }, async $ => {
    const off = !(await read($, isOff))
    await update($, isOff, () => off)
    await $.store.set(STORE_KEY, off)
    return { text: off ? 'Tidy off: full commands and output.' : 'Tidy on: one-line tool rows, laya cards and the plan panel.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const line = e.text.trim().split('\n')[0] ?? ''
    if (line && !line.startsWith('/')) lastPrompt = line
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    running += 1
    ticker ??= $.clock.every(TICK_MS, () => void update($, frame, n => (n + 1) % 10_000))
    try {
      const result = await next(e)
      await trackPlan($, e, result)
      return result
    } finally {
      running -= 1
      if (running === 0) {
        ticker?.cancel()
        ticker = undefined
      }
    }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, output, isRunning, isErrored, isInterrupted } = e.props
    if (isInteractive(tool) || (await read($, isOff))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const tick = isRunning ? await read($, frame) : 0
    const cols = e.viewport?.columns ?? 100

    if (isLaya(tool)) {
      const c = card(tool, input, isRunning ? undefined : output)
      if (isRunning || (!c.answers.length && !c.error)) {
        return (
          <Text wrap="truncate-end">
            <Text color={TEAL}>{isRunning ? spark(tick) : '◆'} </Text>
            <Text bold color={TEAL}>{`laya ${c.op}`}</Text>
            <Text dimColor>{c.asked.length ? `  ${isRunning ? 'deciding' : 'asked'} ${c.asked.join(', ')}` : ''}</Text>
          </Text>
        )
      }
      const width = Math.max(30, Math.min(cols - 2, 78))
      const nameW = Math.min(18, Math.max(...c.answers.map(a => a.name.length), 4))
      const valueW = Math.min(22, Math.max(...c.answers.map(a => a.value.length), 3))
      const barW = Math.max(0, Math.min(16, width - nameW - valueW - 14))
      const border = c.error || isErrored ? RED : TEAL
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} width={width}>
          <Box>
            <Box flexGrow={1}>
              <Text wrap="truncate-end">
                <Text color={border}>{'◆ '}</Text>
                <Text bold color={border}>{`laya · ${c.op}`}</Text>
              </Text>
            </Box>
            <Text dimColor>{c.meta.join(' · ')}</Text>
          </Box>
          {c.error ? (
            <Text color={RED} wrap="truncate-end">{c.error}</Text>
          ) : (
            c.answers.map(a => {
              const m = a.confidence !== undefined && barW > 0 ? meter(a.confidence, barW) : undefined
              return (
                <Box key={a.name}>
                  <Box width={nameW + 2}>
                    <Text dimColor wrap="truncate-end">{a.name}</Text>
                  </Box>
                  <Box width={valueW + 2}>
                    <Text bold wrap="truncate-end">{a.value}</Text>
                  </Box>
                  {m && <Text color={LAYA_BAR[Math.min(LAYA_BAR.length - 1, Math.floor((a.confidence ?? 0) * LAYA_BAR.length))]}>{m.full}</Text>}
                  {m && <Text color={TRACK}>{m.rest}</Text>}
                  {a.confidence !== undefined && <Text color={TEAL}>{` ${Math.round(a.confidence * 100)}%`.padStart(5)}</Text>}
                </Box>
              )
            })
          )}
        </Box>
      )
    }

    const r = row(tool, input, isRunning ? undefined : output, cwd, home)
    const icon = isRunning ? spark(tick) : isErrored ? '✗' : isInterrupted ? '⊘' : r.icon
    const color = isRunning ? ORANGE : isErrored ? RED : isInterrupted ? 'subtle' : r.color
    const isSentence = tool === 'Bash'
    return (
      <Text wrap="truncate-end">
        <Text color={color} bold>{`${icon} `}</Text>
        <Text bold={!isSentence} color={isErrored ? RED : undefined}>{r.verb}</Text>
        {r.target !== undefined ? <Text>{' '}<Text dimColor>{r.dir ?? ''}</Text>{r.target}</Text> : ''}
        {parts(Text, r.meta)}
        {isInterrupted ? <Text dimColor>{'  interrupted'}</Text> : ''}
      </Text>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, output, isErrored } = e.props
    if (isErrored || isInteractive(tool) || (await read($, isOff))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return changedLines(output) <= SMALL_DIFF ? next(e) : <Box />
    if (isLaya(tool) || SAID_IN_ROW.has(tool)) return <Box />
    if (foldsToLine(tool)) return <Text dimColor wrap="truncate-end">{`  ⎿  ${resultLine(output)}`}</Text>
    return next(e)
  })

  // A group draws as a track of beads, one per call in order, then what it did in words.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded || (await read($, isOff))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { calls, isActive } = e.props
    const tick = isActive ? await read($, frame) : 0
    const failed = calls.filter(c => c.isErrored).length
    const shown = calls.slice(0, 32)
    const laya = calls.filter(c => isLaya(c.tool))
    const head = (
      <Text wrap="truncate-end">
        <Text color={isActive ? ORANGE : '#8b949e'} bold>{isActive ? `${spark(tick)} ` : '◈ '}</Text>
        <Text bold>{isActive ? 'Working ' : 'Explored '}</Text>
        {shown.map((c, k) => {
          const b = bead(c.tool, c.input)
          if (c.isRunning) return <Text key={`c${k}`} color={ORANGE}>{spark(tick + k)}</Text>
          if (c.isErrored) return <Text key={`c${k}`} color={RED}>✗</Text>
          return <Text key={`c${k}`} color={b.color}>{b.icon}</Text>
        })}
        {calls.length > shown.length ? <Text dimColor>{` +${calls.length - shown.length}`}</Text> : ''}
        <Text dimColor>{`  ${groupWords(calls)}`}</Text>
        {failed ? <Text color={RED}>{` · ${failed} failed`}</Text> : ''}
      </Text>
    )
    if (!laya.length) return head
    return (
      <Box flexDirection="column">
        {head}
        {laya.map((c, k) => {
          const d = card(c.tool, c.input, c.isRunning ? undefined : c.output)
          const said = d.answers.map(a => `${a.name} → ${a.value}${a.confidence !== undefined ? ` ${Math.round(a.confidence * 100)}%` : ''}`).join(' · ')
          return (
            <Text key={`l${k}`} wrap="truncate-end">
              <Text color={TEAL}>{c.isRunning ? `  ${spark(tick)} ` : '  ◆ '}</Text>
              <Text bold color={TEAL}>{`laya ${d.op}`}</Text>
              <Text dimColor>{`  ${d.error ?? (said || d.asked.join(', '))}`}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })

  // The plan panel stacks above what the plugins beneath drew, and drops off once its plan is complete.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    let items = await read($, plan)
    let title = await read($, goal)
    let started = await read($, startedAt)
    const latest = isFresh(items) ? (await read($, bars)).filter(b => b.state !== 'done').at(-1) : undefined
    if (latest) [items, title, started] = [fromProgress(latest), latest.title, latest.startedAt]
    if (e.props.hasSurvey || isFresh(items) || (await read($, isOff))) return next(e)
    const room = Math.max(0, Math.min(items.length, e.props.maxRows - 7))
    // the plugins beneath (image thumbnails, bars) get the rows the panel leaves
    const below = await next({ ...e, props: { ...e.props, maxRows: Math.max(0, e.props.maxRows - room - 5) } })
    const { Box, Text } = $.ui.resolve(e)
    const tick = running > 0 ? await read($, frame) : 0
    const width = e.props.bodyColumns
    const inner = Math.max(10, width - 4)
    const bar = (key: string, cells: number, colors: readonly string[]) =>
      runs(cells, colors).map((r, k) => <Text key={`${key}${k}`} color={r.color}>{'█'.repeat(r.cells)}</Text>)

    const { step, total, pct } = standing(items)
    const clock = started ? elapsed((await $.clock.now()) - started) : ''
    const stepText = `Step ${step} of ${total} `
    const stepCells = Math.max(0, inner - stepText.length - 5)
    const filled = Math.round((stepCells * pct) / 100)
    const barW = inner >= 60 ? Math.min(20, Math.floor(inner * 0.18)) : 0
    const labelW = inner - barW - (barW ? 10 : 9)
    const words = labels(items)
    const at = Math.max(0, items.findIndex(p => p.status === 'in_progress'))
    const first = Math.max(0, Math.min(at - 1, items.length - room))

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor={ORANGE} paddingX={1}>
          <Box>
            <Text color={ORANGE}>{`${running > 0 ? spark(tick) : '✻'} `}</Text>
            <Box flexGrow={1}>
              <Text bold wrap="truncate-end">{title || 'Plan'}</Text>
            </Box>
            <Text dimColor>{clock}</Text>
          </Box>
          <Box>
            <Text>{stepText}</Text>
            {bar('s', filled, STEP_BAR)}
            <Text color={TRACK}>{'█'.repeat(stepCells - filled)}</Text>
            <Text color={ORANGE}>{` ${pct}%`.padStart(5)}</Text>
          </Box>
          {items.slice(first, first + room).map((p, k) => {
            const word = words[first + k]!
            const isWorking = p.status === 'in_progress'
            const workCells = Math.max(1, Math.round(barW / 4))
            const mark = p.status === 'completed' ? '✓' : isWorking ? (running > 0 ? spark(tick) : '●') : '○'
            return (
              <Box key={p.id}>
                <Box width={labelW}>
                  <Text bold={isWorking} color={p.status === 'completed' ? 'green' : isWorking ? ORANGE : undefined} dimColor={p.status === 'pending'}>
                    {`${mark} `}
                  </Text>
                  <Text bold={isWorking} dimColor={p.status === 'pending'} wrap="truncate-end">{p.subject}</Text>
                </Box>
                {barW > 0 && (
                  <Box width={barW + 1}>
                    {p.status === 'completed' && bar(p.id, barW, DONE_BAR)}
                    {isWorking && <Text color={TRACK}>{'█'.repeat(barW - workCells)}</Text>}
                    {isWorking && bar(p.id, workCells, WORK_BAR)}
                    {p.status === 'pending' && <Text color={TRACK}>{'█'.repeat(barW)}</Text>}
                  </Box>
                )}
                <Text bold={isWorking} color={isWorking ? ORANGE : undefined} dimColor={p.status === 'pending'}>{` ${word}`}</Text>
              </Box>
            )
          })}
        </Box>
        <Text dimColor>{`${'─'.repeat(Math.max(0, width - 8))} Tidy ─`}</Text>
        {below}
      </Box>
    )
  })
}

function parts(Text: any, list: Part[]) {
  return list.map((p, k) => (
    <Text key={`m${k}`} color={p.color} dimColor={p.dim} bold={p.bold}>{p.text}</Text>
  ))
}
