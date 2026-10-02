import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import {
  DC_SETUP_PATH,
  DIST_SCRIPT,
  HEX,
  SEVERITIES,
  ago,
  appDomainUrl,
  bySeverity,
  deployColor,
  deployPrompt,
  heatCells,
  joinBundles,
  parseBundles,
  parseDeploys,
  parseDist,
  parseOrg,
  parseStreams,
  severity,
} from './model.ts'

const PANE = 'org'
const STALE_MS = 5 * 60_000
const snapshot = atom({ plugin: 'jdo-org-cockpit', key: 'snapshot' } as const, null)
const isLoading = atom({ plugin: 'jdo-org-cockpit', key: 'isLoading' } as const, false)

const BUNDLES_SOQL = 'SELECT DeveloperName, LastModifiedDate FROM UIBundle WITH USER_MODE'
const DEPLOYS_SOQL =
  'SELECT StartDate, Status, NumberComponentsDeployed, NumberComponentErrors, CheckOnly, CreatedBy.Name FROM DeployRequest WITH USER_MODE ORDER BY StartDate DESC LIMIT 5'
const STREAMS_SOQL =
  'SELECT Name, ImportRunStatus, DataStreamStatus, LastRefreshDate FROM DataStream WITH USER_MODE LIMIT 2000'

type Cfg = { alias: string; projectDir: string }

async function projectDir($: EngineInterface, cfg: Cfg) {
  return cfg.projectDir.startsWith('~') ? `${(await $.env.get('HOME')) ?? ''}${cfg.projectDir.slice(1)}` : cfg.projectDir
}

async function sf($: EngineInterface, cfg: Cfg, args: string[]) {
  const r = await $.process.run(['sf', ...args, '-o', cfg.alias, '--json'], { timeoutMs: 90_000 })
  return r.stdout
}

async function localDist($: EngineInterface, cfg: Cfg) {
  const r = await $.process.run(['sh', '-c', DIST_SCRIPT, 'sh', await projectDir($, cfg)], { timeoutMs: 20_000 })
  return parseDist(r.stdout)
}

async function refresh($: EngineInterface, cfg: Cfg) {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  try {
    const [org, bundles, streams, dist, deploys] = await Promise.allSettled([
      sf($, cfg, ['org', 'display']).then(out => parseOrg(out, cfg.alias)),
      sf($, cfg, ['data', 'query', '--use-tooling-api', '-q', BUNDLES_SOQL]).then(parseBundles),
      sf($, cfg, ['data', 'query', '-q', STREAMS_SOQL]).then(parseStreams),
      localDist($, cfg),
      sf($, cfg, ['data', 'query', '--use-tooling-api', '-q', DEPLOYS_SOQL]).then(parseDeploys),
    ])
    const errors = [
      org.status === 'rejected' ? `org: ${String(org.reason)}` : '',
      bundles.status === 'rejected' ? `UI bundles: ${String(bundles.reason)}` : '',
      streams.status === 'rejected' ? `streams: ${String(streams.reason)}` : '',
      deploys.status === 'rejected' ? `deploys: ${String(deploys.reason)}` : '',
    ].filter(Boolean)
    const next: Snapshot = {
      at: await $.clock.now(),
      org: org.status === 'fulfilled' ? org.value : null,
      bundles: joinBundles(bundles.status === 'fulfilled' ? bundles.value : [], dist.status === 'fulfilled' ? dist.value : new Map()),
      streams: streams.status === 'fulfilled' ? streams.value : [],
      deploys: deploys.status === 'fulfilled' ? deploys.value : [],
      errors,
    }
    await update($, snapshot, () => next)
    await $.store.set('snapshot', next)
  } finally {
    await update($, isLoading, () => false)
  }
}

async function openPane($: EngineInterface, cfg: Cfg) {
  await $.ui.open({ id: PANE, title: `Org · ${cfg.alias}`, focus: true, closeOnEscape: true })
  const held = await read($, snapshot)
  if (!held || (await $.clock.now()) - held.at > STALE_MS) $.clock.after(0, () => void refresh($, cfg))
}

async function queueDeploy($: EngineInterface, cfg: Cfg, bundle: string, dir: string, dist: string) {
  await $.prompt.submit({ text: deployPrompt(bundle, dir, cfg.alias, await projectDir($, cfg), dist) })
  $.ui.toast(`Queued: build + deploy ${bundle}`)
}

export const register: Register = (on, options) => {
  const cfg: Cfg = { alias: String(options.orgAlias ?? 'jdo-oe0sdd'), projectDir: String(options.projectDir ?? '') }
  const alias = cfg.alias

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'org', description: 'JDO org cockpit: auth, UI Bundles, Data Cloud stream health', immediate: true })
    if (!(await read($, snapshot))) {
      const kept = (await $.store.get('snapshot')) as Snapshot | undefined
      if (kept) await update($, snapshot, () => kept)
    }
    return next(e)
  })

  on('command.run', { command: 'org' }, async $ => {
    await openPane($, cfg)
    return { text: `Org cockpit opened for ${alias}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const loading = await read($, isLoading)
    const now = await $.clock.now()
    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    const org = snap?.org

    const open = (url: string) => () => void $.process.run(['open', url])
    const openSetup = () => void $.process.run(['sf', 'org', 'open', '-o', alias, '-p', DC_SETUP_PATH])

    const counts = Object.fromEntries(SEVERITIES.map(s => [s, 0])) as Record<(typeof SEVERITIES)[number], number>
    for (const s of snap?.streams ?? []) counts[severity(s)]++
    const failing = bySeverity(snap?.streams ?? []).filter(s => severity(s) === 'fail')
    const heat = heatCells(snap?.streams ?? [], Math.min(width, 120))

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            <Text bold>{org ? org.alias : alias}</Text>
            {org && <Text color={org.status === 'Connected' ? HEX.ok : HEX.fail}>{org.status}</Text>}
            {org && <Text dimColor>API {org.apiVersion}</Text>}
          </Box>
          {org && <Text dimColor wrap="truncate">{org.username} · {org.instanceUrl.replace(/^https:\/\//, '')}</Text>}
          <Box flexDirection="row" gap={1}>
            <Button key="refresh" hotkey="r" variant="primary" onPress={() => void refresh($, cfg)}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button key="setup" hotkey="d" onPress={openSetup}>DC Setup</Button>
            <Text dimColor>{snap ? `as of ${ago(now - snap.at)}` : loading ? 'loading…' : 'no data yet'}</Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text bold>UI Bundles</Text>
          {(snap?.bundles ?? []).map((b, i) => {
            const url = org && appDomainUrl(org.instanceUrl, b.name)
            const distColor = b.dist === 'fresh' ? HEX.ok : b.dist === 'unknown' ? HEX.none : HEX.fail
            return (
              <Box key={`b:${b.name}`} flexDirection="row" gap={2}>
                <Box width={16}><Text wrap="truncate">{b.name}</Text></Box>
                <Box width={18}><Text dimColor>{b.deployedAt ? `deployed ${b.deployedAt.slice(0, 10)}` : 'not deployed'}</Text></Box>
                <Box width={13}><Text color={distColor}>dist {b.dist}</Text></Box>
                {url && b.deployedAt && (
                  <Button key={`open:${b.name}`} hotkey={i < 9 ? String(i + 1) : undefined} dimColor onPress={open(url)}>
                    Open
                  </Button>
                )}
                {b.dir && (b.dist === 'stale' || b.dist === 'missing') && (
                  <Button key={`deploy:${b.name}`} onPress={() => void queueDeploy($, cfg, b.name, b.dir!, b.dist)}>
                    Deploy
                  </Button>
                )}
              </Box>
            )
          })}
        </Box>

        {(snap?.deploys ?? []).length > 0 && (
          <Box flexDirection="column">
            <Text bold>Recent deploys</Text>
            {(snap?.deploys ?? []).map(d => (
              <Box key={`d:${d.startedAt}`} flexDirection="row" gap={2}>
                <Box width={17}><Text dimColor>{d.startedAt.slice(0, 16).replace('T', ' ')}</Text></Box>
                <Box width={11}><Text color={deployColor(d.status)}>{d.status}</Text></Box>
                <Text>{d.components} comp · {d.errors} err{d.isCheckOnly ? ' · validate-only' : ''}</Text>
                <Text dimColor wrap="truncate">{d.by}</Text>
              </Box>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Data Cloud streams · {snap?.streams.length ?? 0}</Text>
          {e.surface === 'terminal' && (snap?.streams.length ?? 0) > 0 && (() => {
            const { Raster } = $.ui.resolve(e)
            return <Raster key="heat" columns={Math.min(width, 120)} rows={heat.rows} cells={heat.cells} />
          })()}
          <Box flexDirection="row" gap={2}>
            <Text color={HEX.fail}>■ {counts.fail} failing</Text>
            <Text color={HEX.running}>■ {counts.running} running</Text>
            <Text color={HEX.none}>■ {counts.none} never run</Text>
            <Text color={HEX.ok}>■ {counts.ok} ok</Text>
          </Box>
          {failing.slice(0, 8).map(s => (
            <Text key={`f:${s.name}`} wrap="truncate">
              <Text color={HEX.fail}>✗ </Text>
              {s.name} <Text dimColor>· {s.status === 'ERROR' ? 'stream ERROR' : s.run} · {s.lastRefresh ? s.lastRefresh.slice(0, 10) : 'never refreshed'}</Text>
            </Text>
          ))}
          {failing.length > 8 && <Text dimColor>…and {failing.length - 8} more</Text>}
        </Box>

        {(snap?.errors ?? []).map(err => <Text key={`e:${err}`} color={HEX.fail} wrap="truncate">{err}</Text>)}
      </Box>
    )
  })
}
