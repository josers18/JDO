// The plan panel's model, ported from clean-view: a plan from TodoWrite, Tasks or plan-progress.

import type { PlanItem, Status } from '../types'

type Todo = { content: string; status: Status; activeForm?: string }

/** TodoWrite replaces the whole list. */
export const fromTodos = (todos: readonly Todo[]): PlanItem[] =>
  todos.map((t, i) => ({ id: `todo-${i}`, subject: t.content, status: t.status, activeForm: t.activeForm }))

export function createTask(plan: PlanItem[], id: string, subject: string, activeForm?: string): PlanItem[] {
  return [...plan.filter(p => p.id !== id), { id, subject, status: 'pending', activeForm }]
}

export function updateTask(plan: PlanItem[], id: string, u: { subject?: string; status?: Status | 'deleted'; activeForm?: string }): PlanItem[] {
  if (u.status === 'deleted') return plan.filter(p => p.id !== id)
  const status = u.status
  return plan.map(p =>
    p.id === id ? { ...p, subject: u.subject ?? p.subject, activeForm: u.activeForm ?? p.activeForm, status: status ?? p.status } : p,
  )
}

/** The fields read off a plan-progress bar: its stages' steps, flattened into one list. */
export type ProgressPlan = { id: string; title: string; startedAt: number; state?: string; stages: { steps: { title: string; status: string; doneAt?: number }[] }[] }

export const fromProgress = (p: ProgressPlan): PlanItem[] =>
  p.stages.flatMap(st => st.steps).map((s, i) => ({
    id: `${p.id}-${i}`,
    subject: s.title,
    status: s.status === 'done' || s.status === 'skipped' ? 'completed' : s.status === 'active' || s.status === 'error' ? 'in_progress' : 'pending',
    // a step sent already finished has no time of its own: it counts from the bar's start
    ...(s.status === 'done' || s.status === 'skipped' ? { doneAt: s.doneAt ?? p.startedAt } : {}),
  }))

/** The rows still shown: a step finished `ms` ago or longer drops off; one with no finish time stays. */
export const showing = (plan: PlanItem[], now: number, ms: number) =>
  plan.filter(p => p.status !== 'completed' || p.doneAt === undefined || now - p.doneAt < ms)

/** When the next shown step drops off, if any does. */
export const nextFold = (plan: PlanItem[], now: number, ms: number) => {
  const due = showing(plan, now, ms).flatMap(p => (p.status === 'completed' && p.doneAt !== undefined ? [p.doneAt + ms] : []))
  return due.length ? Math.min(...due) : undefined
}

/** Each completed step keeps the time it was first seen completed (now for one just finished); an open one has none. */
export const stamp = (before: PlanItem[], after: PlanItem[], now: number): PlanItem[] =>
  after.map(p => {
    if (p.status !== 'completed') {
      const { doneAt: _, ...open } = p
      return open
    }
    const was = before.find(b => b.subject === p.subject && b.status === 'completed')
    return { ...p, doneAt: was?.doneAt ?? p.doneAt ?? now }
  })

/** A new plan starts once the last one is empty or finished. */
export const isFresh = (plan: PlanItem[]) => plan.every(p => p.status === 'completed')

/** `Step 2 of 4`, 25%: the step in progress, else the next one, else the last. */
export function standing(plan: PlanItem[]) {
  const done = plan.filter(p => p.status === 'completed').length
  const now = plan.findIndex(p => p.status === 'in_progress')
  const next = plan.findIndex(p => p.status === 'pending')
  const at = now >= 0 ? now : next >= 0 ? next : plan.length - 1
  return { step: at + 1, total: plan.length, pct: plan.length ? Math.round((done / plan.length) * 100) : 0 }
}

/** Done, Working, then Next for the first step waiting and Up next for the rest. */
export function labels(plan: PlanItem[]): string[] {
  let isNextTaken = false
  return plan.map(p => {
    if (p.status === 'completed') return 'Done'
    if (p.status === 'in_progress') return 'Working'
    if (isNextTaken) return 'Up next'
    isNextTaken = true
    return 'Next'
  })
}

export const mark = (s: Status) => (s === 'completed' ? '✓' : s === 'in_progress' ? '●' : '○')

/** `n` hex colors from `from` to `to`. */
export function ramp(from: string, to: string, n: number): string[] {
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [rgb(from), rgb(to)]
  return Array.from({ length: n }, (_, k) => {
    const m = n === 1 ? 0 : k / (n - 1)
    return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * m).toString(16).padStart(2, '0')).join('')}`
  })
}

/** Splits `width` cells into runs, one per color, widest first. */
export function runs(width: number, colors: readonly string[]): { color: string; cells: number }[] {
  const n = Math.min(colors.length, Math.max(0, width))
  return Array.from({ length: n }, (_, k) => ({ color: colors[k]!, cells: Math.floor(width / n) + (k < width % n ? 1 : 0) }))
}

/** `9s`, `2m 05s`, `1h 02m`. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
}



