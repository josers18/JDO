// Pure helpers: what a laya call asked and what it decided, for its card.

import { textOf } from './rows.ts'

export type Answer = { name: string; value: string; confidence?: number }
export type LayaCard = { op: string; asked: string[]; answers: Answer[]; meta: string[]; error?: string }

const pct = (n: unknown) => (typeof n === 'number' && n >= 0 && n <= 1 ? n : undefined)

/** The questions a call asks: its `questions` keys, a decide schema's properties, or a preset's name. */
export function asked(input: unknown): string[] {
  const i = (input ?? {}) as Record<string, any>
  if (i.questions && typeof i.questions === 'object') return Object.keys(i.questions)
  if (i.schema?.properties && typeof i.schema.properties === 'object') return Object.keys(i.schema.properties)
  if (typeof i.preset === 'string') return [i.preset]
  if (Array.isArray(i.requests)) return [`${i.requests.length} requests`]
  return []
}

/** Parses a result that may come wrapped as `{ result: "<json>" }` in text blocks. */
function parse(output: unknown): Record<string, any> | undefined {
  let v: unknown = typeof output === 'object' && output !== null && !Array.isArray(output) && !('content' in output) ? output : textOf(output)
  for (let k = 0; k < 3 && typeof v === 'string'; k++) {
    try {
      v = JSON.parse(v)
    } catch {
      return undefined
    }
    if (v && typeof v === 'object' && typeof (v as { result?: unknown }).result === 'string') v = (v as { result: string }).result
  }
  return v && typeof v === 'object' ? (v as Record<string, any>) : undefined
}

function answerOf(name: string, a: any): Answer {
  if (a && typeof a === 'object') {
    if (a.type === 'noul' || typeof a.noul === 'number') {
      const p = a.noul as number
      return { name, value: p >= 0.5 ? 'yes' : 'no', confidence: pct(a.answer_confidence ?? a.confidence) }
    }
    if (a.type === 'score' || a.score !== undefined) return { name, value: String(a.score), confidence: pct(a.answer_confidence ?? a.confidence) }
    if (a.choice !== undefined) return { name, value: String(a.choice), confidence: pct(a.answer_confidence ?? a.confidence) }
    if (a.value !== undefined) return { name, value: String(a.value), confidence: pct(a.confidence) }
  }
  return { name, value: typeof a === 'boolean' ? (a ? 'yes' : 'no') : String(a) }
}

export function card(tool: string, input: unknown, output: unknown): LayaCard {
  const op = tool.slice('mcp__laya__'.length).replace(/^laya_/, '')
  const base: LayaCard = { op, asked: asked(input), answers: [], meta: [] }
  if (output === undefined) return base
  const r = parse(output)
  if (!r) return { ...base, error: textOf(output).split('\n')[0] }
  if (r.error) return { ...base, error: String(r.message ?? r.error) }

  const answers = r.answers ?? r.decision ?? r.values ?? r.result?.answers
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    base.answers = Object.entries(answers).map(([k, a]) => answerOf(k, a))
  } else if (Array.isArray(r.results)) {
    base.answers = r.results.slice(0, 6).map((x: any, k: number) => {
      const first = x?.answers && Object.entries(x.answers)[0]
      return first ? answerOf(`#${k + 1} ${first[0]}`, first[1]) : { name: `#${k + 1}`, value: x?.routing?.model ?? '…' }
    })
    if (r.results.length > 6) base.answers.push({ name: '…', value: `${r.results.length - 6} more` })
  } else if (r.routing?.model || r.model) {
    base.answers = [{ name: 'route', value: `${r.routing?.model ?? r.model}${r.routing?.reason ? ` · ${r.routing.reason}` : ''}` }]
  }

  const model = r.routing?.model
  if (model) base.meta.push(String(model))
  if (typeof r.device === 'string') base.meta.push(r.device)
  if (typeof r.latency_ms === 'number') base.meta.push(`${Math.round(r.latency_ms)}ms`)
  if (base.answers.length === 0 && op === 'status') {
    base.answers = Object.entries(r).filter(([, v]) => typeof v !== 'object').slice(0, 4).map(([k, v]) => ({ name: k, value: String(v) }))
  }
  return base
}

/** `█████▌░░░` at `width` cells, with half cells. */
export function meter(p: number, width: number): { full: string; rest: string } {
  const halves = Math.round(Math.max(0, Math.min(1, p)) * width * 2)
  const full = '█'.repeat(Math.floor(halves / 2)) + (halves % 2 ? '▌' : '')
  return { full, rest: '░'.repeat(Math.max(0, width - Math.ceil(halves / 2))) }
}
