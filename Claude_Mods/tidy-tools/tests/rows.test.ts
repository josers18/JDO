import { expect, test } from 'claude-code/testing'
import { card, meter } from '../hooks/laya.ts'
import { bashKind, changedLines, commandHead, groupWords, resultLine, row, splitPath, spark } from '../hooks/rows.ts'

const CWD = '/Users/j/Git/JDO'
const HOME = '/Users/j'

test('Bash rows show the description, an icon by command kind and the command head', () => {
  const r = row('Bash', { command: 'cd x && git log --oneline -5', description: 'Show recent commits' }, undefined)
  expect(r.verb).toBe('Show recent commits')
  expect(r.icon).toBe('⎇')
  expect(r.meta[0]?.text).toBe('  git log')
  expect(bashKind('FOO=1 rg pattern src').icon).toBe('⌕')
  expect(bashKind('sf project deploy start').icon).toBe('☁')
  expect(commandHead('/usr/bin/npx -y tsc')).toEqual(['npx'])
})

test('paths split into a dim folder and a file name, relative to the session folder or ~', () => {
  expect(splitPath(`${CWD}/hooks/rows.ts`, CWD, HOME)).toEqual({ dir: 'hooks/', name: 'rows.ts' })
  expect(splitPath(`${HOME}/.claude/settings.json`, CWD, HOME)).toEqual({ dir: '~/.claude/', name: 'settings.json' })
})

test('Read shows the range it read; Edit and Write their diff stats', () => {
  const read = row('Read', { file_path: `${CWD}/a.ts` }, { type: 'text', file: { numLines: 20, startLine: 1, totalLines: 400 } }, CWD)
  expect(read.meta[0]?.text).toBe('  lines 1–20 of 400')
  const patch = [{ lines: [' a', '+b', '+c', '-d'] }]
  const edit = row('Edit', { file_path: `${CWD}/a.ts` }, { structuredPatch: patch }, CWD)
  expect(edit.meta.map(p => p.text)).toEqual([' +2', ' −1'])
  expect(changedLines({ structuredPatch: patch })).toBe(3)
  const write = row('Write', { file_path: `${CWD}/n.ts`, content: 'a\nb' }, { type: 'create' }, CWD)
  expect(write.meta.map(p => p.text)).toEqual(['  new', ' · 2 lines'])
})

test('MCP rows show server, tool and the first argument', () => {
  const r = row('mcp__datacloud__query_data_cloud', { sql: 'SELECT 1\nFROM x' }, undefined)
  expect([r.verb, r.target, r.meta[0]?.text]).toEqual(['datacloud', 'query_data_cloud', '  SELECT 1'])
})

test('output folds to a line count and its first line', () => {
  expect(resultLine({ stdout: 'a\nb\nc\n', stderr: '' })).toBe('3 lines · a')
  expect(resultLine({ stdout: '', stderr: '' })).toBe('done')
  expect(resultLine({ stdout: '', stderr: '', backgroundTaskId: 'b1' })).toBe('running in background')
})

test('a group says what it did in words', () => {
  const calls = [
    { tool: 'Read', input: {} },
    { tool: 'Read', input: {} },
    { tool: 'Bash', input: { command: 'rg x' } },
    { tool: 'Bash', input: { command: 'ls' } },
    { tool: 'mcp__laya__laya_predict', input: {} },
  ]
  expect(groupWords(calls)).toBe('read 2 files · ran 1 search · ran 1 command')
})

test('laya cards read answers, confidence and routing from the wrapped result', () => {
  const result = JSON.stringify({
    answers: {
      kind: { type: 'choice', choice: 'feature', confidence: 0.75, answer_confidence: 0.92 },
      is_ui: { type: 'noul', noul: 0.87, confidence: 0.87, answer_confidence: 0.87 },
    },
    routing: { model: 'english' },
    latency_ms: 975.8,
    device: 'mps',
  })
  const c = card('mcp__laya__laya_predict', { questions: { kind: {}, is_ui: {} } }, [{ type: 'text', text: JSON.stringify({ result }) }])
  expect(c.op).toBe('predict')
  expect(c.asked).toEqual(['kind', 'is_ui'])
  expect(c.answers).toEqual([
    { name: 'kind', value: 'feature', confidence: 0.92 },
    { name: 'is_ui', value: 'yes', confidence: 0.87 },
  ])
  expect(c.meta).toEqual(['english', 'mps', '976ms'])
  expect(card('mcp__laya__laya_predict', {}, '{"error":"invalid_questions","message":"bad criteria"}').error).toBe('bad criteria')
})

test('meters fill by half cells; the sparkle cycles', () => {
  expect(meter(0.5, 4)).toEqual({ full: '██', rest: '░░' })
  expect(meter(0.3, 5)).toEqual({ full: '█▌', rest: '░░░' })
  expect(spark(0)).toBe('·')
  expect(spark(10)).toBe('·')
})
