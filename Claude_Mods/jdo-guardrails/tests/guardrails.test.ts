import { describe, expect, test } from 'claude-code/testing'
import { parseDeploy, readFindings, summarize, withJson } from '../hooks/deploy.ts'
import { lint } from '../hooks/lint.ts'

const BUNDLE = 'force-app/main/default/uiBundles/ReactRetail'
const OK_JSON = '{"status":0,"result":{"status":"Succeeded","numberComponentsDeployed":12,"numberComponentErrors":0}}'
const FAIL_JSON = '{"status":1,"result":{"status":"Failed","numberComponentsDeployed":3,"numberComponentErrors":2}}'
const refusal = (r: { deny?: string; isError?: true; text?: string }) => r.deny ?? (r.isError ? r.text : undefined) ?? ''
const quiet = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

describe('parseDeploy', () => {
  test('reads flags, cd and bypasses', () => {
    const p = parseDeploy(`cd ~/x && JDO_ALLOW_STALE_DIST=1 sf project deploy start --source-dir "${BUNDLE}" -d other -o jdo --json`)
    expect(p?.sourceDirs).toEqual([BUNDLE, 'other'])
    expect(p?.cwd).toBe('~/x')
    expect(p?.hasJson).toBe(true)
    expect(p?.allowStaleDist).toBe(true)
    expect(p?.hasIgnoreConflicts).toBe(false)
  })
  test('ignores other commands and spots -c', () => {
    expect(parseDeploy('sf project retrieve start -d x')).toBeUndefined()
    expect(parseDeploy('sf project deploy start -c -d x')?.hasIgnoreConflicts).toBe(true)
    expect(parseDeploy('claude -p "run sf project deploy start -d x"')).toBeUndefined()
    expect(withJson('cd a && X=1 sf project deploy start -d x')).toBe('cd a && X=1 sf project deploy start --json -d x')
  })
  test('inserts --json after the verb, even mid-pipeline', () => {
    expect(withJson('sf project deploy start -d x | tail')).toBe('sf project deploy start --json -d x | tail')
  })
})

describe('readFindings / summarize', () => {
  test('derives tracked casing', () => {
    const f = readFindings(`CASE\tforce-app/main/default/uibundles/ReactRetail\t${BUNDLE}/.forceignore\n`)
    expect(f.casing[0]).toContain(`\`${BUNDLE}\``)
  })
  test('pulls status and counts', () => {
    expect(summarize(FAIL_JSON)).toEqual({ status: 'Failed', deployed: 3, errors: 2 })
  })
})

describe('lint', () => {
  test('apex', () => {
    expect(lint('a/classes/X.cls', 'Integer in = 0;', '')[0]).toContain('apex-in-keyword')
    expect(lint('a/classes/X.cls', '[SELECT Id FROM A WHERE Id in :ids]', '')).toEqual([])
    expect(lint('a/classes/X.cls', 'Decimal.valueOf((Double) o)', '')[0]).toContain('apex-decimal-double')
    expect(lint('a/X.cls', 'throw new AuraHandledException(m);', 'throw new AuraHandledException(m);')[0]).toContain('aura')
    expect(lint('a/X.cls', 'new AuraHandledException(m)', 'e.setMessage(m);')).toEqual([])
  })
  test('lwc and ui bundles', () => {
    expect(lint('a/lwc/card/card.js', '@api showHeader = true;', '')[0]).toContain('LWC1503')
    expect(lint(`${BUNDLE}/src/app.tsx`, '<link href="https://fonts.googleapis.com/x">', '')[0]).toContain('CSP')
    expect(lint(`${BUNDLE}/src/pages/Home.tsx`, 'className="grid lg:grid-cols-3"', '')[0]).toContain('container')
    const css = '@import "tailwindcss";\n'
    expect(lint(`${BUNDLE}/src/styles/global.css`, css, css)[0]).toContain('@source')
    expect(lint(`${BUNDLE}/src/styles/global.css`, css, `${css}@source '../../../_shared/src';`)).toEqual([])
    expect(lint('x/uiBundles/_shared/src/global.css', css, css)).toEqual([])
  })
  test('snow sql', () => {
    expect(lint('Snowflake_X/sql/load.sql', "-- D&B feed", '')[0]).toContain('snow-sql-ampersand')
    expect(lint('README.md', 'D&B', '')).toEqual([])
  })
})

describe('deploy guard through the engine', () => {
  test('denies --ignore-conflicts', async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: OK_JSON } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: `sf project deploy start -d ${BUNDLE} --ignore-conflicts` })
    expect(refusal(r)).toContain('--ignore-conflicts')
  })

  test('denies a stale dist', async ($, on) => {
    on('process.run', () => ({ value: { ...quiet, stdout: `STALE\t${BUNDLE}\t${BUNDLE}/src/app.tsx\n` } }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: OK_JSON } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: `sf project deploy start -d ${BUNDLE} --json` })
    expect(refusal(r)).toContain('npm run build')
  })

  test('denies a casing mismatch', async ($, on) => {
    on('process.run', () => ({ value: { ...quiet, stdout: `CASE\tforce-app/main/default/uibundles/ReactRetail\t${BUNDLE}/x\n` } }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: OK_JSON } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'sf project deploy start -d force-app/main/default/uibundles/ReactRetail' })
    expect(refusal(r)).toContain('casing')
  })

  test('appends --json and flags a failed deploy', async ($, on) => {
    let ran = ''
    on('process.run', () => ({ value: quiet }))
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      ran = e.tool === 'Bash' ? e.command : ''
      return { result: { stdout: FAIL_JSON } as never, text: FAIL_JSON }
    })
    const r = await $.tool.call({ tool: 'Bash', command: `sf project deploy start -d ${BUNDLE} -o jdo` })
    expect(ran).toContain('deploy start --json')
    expect(r.context?.join('\n') ?? '').toContain('did NOT cleanly succeed')
  })

  test('fails closed when its checks cannot run', async ($, on) => {
    on('process.run', () => {
      throw new Error('sh missing')
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: OK_JSON } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: `sf project deploy start -d ${BUNDLE} --json` })
    expect(refusal(r)).toContain('refusing an unchecked deploy')
  })

  test('leaves other commands alone', async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'hi' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' })
    expect(r.context).toBeUndefined()
  })
})
