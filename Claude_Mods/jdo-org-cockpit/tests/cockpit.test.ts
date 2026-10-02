import { describe, expect, mock, test } from 'claude-code/testing'
import { appDomainUrl, base64, heatCells, joinBundles, parseDist, sfResult, severity } from '../hooks/model.ts'

const INSTANCE = 'https://storm-16a17dc388fbe6.demo.my.salesforce.com'
const ok = (result: unknown) => JSON.stringify({ status: 0, result })
const run = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

describe('model', () => {
  test('App Domain URL', () => {
    expect(appDomainUrl(INSTANCE, 'ReactRetail')).toBe('https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail')
    expect(appDomainUrl('https://acme.my.salesforce.com', 'X')).toBe('https://acme--c.my.salesforce.app/app/c__X')
    expect(appDomainUrl('https://example.com', 'X')).toBeUndefined()
  })
  test('severity', () => {
    expect(severity({ name: 'a', run: 'SUCCESS', status: 'ERROR', lastRefresh: null })).toBe('fail')
    expect(severity({ name: 'a', run: 'FAILURE', status: 'ACTIVE', lastRefresh: null })).toBe('fail')
    expect(severity({ name: 'a', run: 'IN_PROGRESS', status: 'ACTIVE', lastRefresh: null })).toBe('running')
    expect(severity({ name: 'a', run: 'NONE', status: 'ACTIVE', lastRefresh: null })).toBe('none')
  })
  test('base64 and heat map packing', () => {
    expect(base64(new TextEncoder().encode('hello!?'))).toBe('aGVsbG8hPw==')
    const streams = Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, run: 'SUCCESS', status: 'ACTIVE', lastRefresh: null }))
    const heat = heatCells(streams, 2) // 5 streams, 2 per cell → 3 cells → 2 rows of 2
    expect(heat.rows).toBe(2)
    expect(heat.cells.length).toBe(Math.ceil((2 * 2 * 12) / 3) * 4)
  })
  test('dist join and sf errors', () => {
    const rows = joinBundles([{ name: 'ReactRetail', deployedAt: '2026-09-03T20:53:48.000+0000' }], parseDist('ReactRetail\tstale\nLocalOnly\tfresh\n'))
    expect(rows.map(r => `${r.name}:${r.dist}:${r.deployedAt ? 'org' : 'local'}`)).toEqual(['LocalOnly:fresh:local', 'ReactRetail:stale:org'])
    expect(() => sfResult('{"status":1,"message":"No authorization information found"}')).toThrow('No authorization')
  })
})

describe('pane', () => {
  test('refreshes, draws and opens on every surface', async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 2) })
    mock.store(on)
    mock.env(on, { HOME: '/Users/test' })
    const opened: string[] = []
    on('process.run', (_$, e) => {
      const argv = e.argv.join(' ')
      if (argv.startsWith('sf org display'))
        return run(ok({ username: 'admin@finsdc3.demo', instanceUrl: INSTANCE, connectedStatus: 'Connected', apiVersion: '67.0' }))
      if (argv.includes('FROM UIBundle'))
        return run(ok({ records: [{ DeveloperName: 'ReactRetail', LastModifiedDate: '2026-09-03T20:53:48.000+0000' }] }))
      if (argv.includes('FROM DataStream'))
        return run(
          ok({
            records: [
              { Name: 'BT_Financial_Trades', ImportRunStatus: 'FAILURE', DataStreamStatus: 'ACTIVE', LastRefreshDate: null },
              { Name: 'Accounts', ImportRunStatus: 'SUCCESS', DataStreamStatus: 'ACTIVE', LastRefreshDate: '2026-10-02T00:00:00.000+0000' },
            ],
          }),
        )
      if (e.argv[0] === 'sh') return run('ReactRetail\tstale\n')
      if (e.argv[0] === 'open') opened.push(e.argv[1] ?? '')
      return run('')
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'jdo-org-cockpit',
        surface,
        component: 'Pane',
        requestId: 'org',
        props: { title: 'Org', isFocused: true, bodyColumns: 80, placement: 'dock' } as never,
      })
      await ui.press({ key: 'refresh' })
      expect(await ui.find({ text: 'Connected' })).toBeDefined()
      expect(await ui.find({ text: 'dist stale' })).toBeDefined()
      expect(await ui.find({ text: /1 failing/ })).toBeDefined()
      expect(await ui.find({ text: /BT_Financial_Trades · FAILURE · never refreshed/ })).toBeDefined()
      expect((await ui.find({ key: 'heat' })) !== undefined).toBe(surface === 'terminal')
      await ui.press({ key: 'open:ReactRetail' })
      await ui.unmount()
    }
    expect(opened).toEqual([
      'https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail',
      'https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail',
    ])
  })
})
