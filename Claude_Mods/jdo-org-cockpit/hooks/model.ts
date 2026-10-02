// Pure pieces of the cockpit: parsing sf --json output, the App Domain URL,
// stream severity, and the heat map's packed Raster cells.
import type { BundleRow, DeployRow, OrgInfo, StreamRow } from '../types'

export const DC_SETUP_PATH = '/lightning/setup/SetupOneHome/home?setupApp=audience360'

type SfJson = { status?: number; message?: string; result?: unknown }

// sf --json prints one JSON document; a non-zero status carries `message`.
export const sfResult = <T>(stdout: string): T => {
  const doc = JSON.parse(stdout) as SfJson
  if (doc.status !== 0) throw new Error(doc.message ?? `sf status ${doc.status}`)
  return doc.result as T
}

export const parseOrg = (stdout: string, alias: string): OrgInfo => {
  const r = sfResult<Record<string, string | undefined>>(stdout)
  return {
    alias,
    username: r.username ?? '?',
    instanceUrl: r.instanceUrl ?? '',
    status: r.connectedStatus ?? '?',
    apiVersion: r.apiVersion ?? '?',
  }
}

type Records<T> = { records: T[] }

export const parseBundles = (stdout: string): { name: string; deployedAt: string }[] =>
  sfResult<Records<{ DeveloperName: string; LastModifiedDate: string }>>(stdout).records.map(r => ({
    name: r.DeveloperName,
    deployedAt: r.LastModifiedDate,
  }))

export const parseStreams = (stdout: string): StreamRow[] =>
  sfResult<
    Records<{ Name: string; ImportRunStatus: string | null; DataStreamStatus: string | null; LastRefreshDate: string | null }>
  >(stdout).records.map(r => ({
    name: r.Name,
    run: r.ImportRunStatus ?? 'NONE',
    status: r.DataStreamStatus ?? '?',
    lastRefresh: r.LastRefreshDate,
  }))

// `name<TAB>fresh|stale|missing` per local bundle, from DIST_SCRIPT; keyed by
// the lowercased name (the org spells `reactRecipes`, the folder may not).
type Dist = BundleRow['dist']
export const parseDist = (stdout: string): Map<string, { name: string; dist: Dist }> =>
  new Map(
    stdout
      .split('\n')
      .map(l => l.split('\t'))
      .filter((p): p is [string, Dist] => p.length === 2 && p[0] !== '')
      .map(([name, dist]) => [name.toLowerCase(), { name, dist }]),
  )

// Org bundles joined with local dist state; a local-only bundle shows undeployed.
export const joinBundles = (org: { name: string; deployedAt: string }[], dist: Map<string, { name: string; dist: Dist }>): BundleRow[] => {
  const rows: BundleRow[] = org.map(b => {
    const local = dist.get(b.name.toLowerCase())
    return { name: b.name, dir: local?.name, deployedAt: b.deployedAt, dist: local?.dist ?? 'unknown' }
  })
  for (const [key, local] of dist)
    if (!rows.some(r => r.name.toLowerCase() === key)) rows.push({ name: local.name, dir: local.name, deployedAt: null, dist: local.dist })
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export const parseDeploys = (stdout: string): DeployRow[] =>
  sfResult<
    Records<{
      StartDate: string
      Status: string
      NumberComponentsDeployed: number | null
      NumberComponentErrors: number | null
      CheckOnly: boolean
      CreatedBy: { Name: string } | null
    }>
  >(stdout).records.map(r => ({
    startedAt: r.StartDate,
    status: r.Status,
    components: r.NumberComponentsDeployed ?? 0,
    errors: r.NumberComponentErrors ?? 0,
    isCheckOnly: r.CheckOnly,
    by: r.CreatedBy?.Name ?? '?',
  }))

// The prompt the Deploy button queues: Claude runs the build and the deploy as
// ordinary visible steps, through the person's permissions and jdo-guardrails.
export const deployPrompt = (bundle: string, dir: string, alias: string, projectDir: string, dist: string): string => {
  const path = `force-app/main/default/uiBundles/${dir}`
  return [
    `Build and deploy the ${bundle} UI bundle to ${alias}; its local dist/ is ${dist}.`,
    `From ${projectDir}/${path} run \`npm run build\`, then from ${projectDir} run`,
    `\`sf project deploy start --source-dir ${path} -o ${alias} --json\` and report status and numberComponentErrors.`,
  ].join(' ')
}

export const deployColor = (status: string): string =>
  status === 'Succeeded' ? '#3fb950' : status === 'InProgress' || status === 'Pending' ? '#d29922' : status === 'Canceled' ? '#6e7681' : '#f85149'

// https://<myDomain>.<sub>.my.salesforce.com → https://<myDomain>--c.<sub>.my.salesforce.app/app/c__<Name>
export const appDomainUrl = (instanceUrl: string, bundle: string): string | undefined => {
  const host = instanceUrl.replace(/^https:\/\//, '').replace(/\/.*$/, '')
  const m = host.match(/^([^.]+)\.(.*)my\.salesforce\.com$/)
  return m ? `https://${m[1]}--c.${m[2]}my.salesforce.app/app/c__${bundle}` : undefined
}

export type Severity = 'fail' | 'running' | 'none' | 'ok'
export const SEVERITIES: readonly Severity[] = ['fail', 'running', 'none', 'ok']
export const COLORS: Record<Severity, number> = { fail: 0xf85149, running: 0xd29922, none: 0x484f58, ok: 0x3fb950 }
export const HEX: Record<Severity, string> = { fail: '#f85149', running: '#d29922', none: '#6e7681', ok: '#3fb950' }

export const severity = (s: StreamRow): Severity =>
  s.status === 'ERROR' || s.run === 'ERROR' || s.run === 'FAILURE'
    ? 'fail'
    : s.run === 'IN_PROGRESS'
      ? 'running'
      : s.run === 'SUCCESS'
        ? 'ok'
        : 'none'

export const bySeverity = (streams: readonly StreamRow[]): StreamRow[] =>
  [...streams].sort((a, b) => SEVERITIES.indexOf(severity(a)) - SEVERITIES.indexOf(severity(b)) || a.name.localeCompare(b.name))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export const base64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

const UPPER_HALF = 0x2580
const DEFAULT = 0x01000000

// Two streams per cell: the upper half block's fg is one, its bg the next.
export const heatCells = (streams: readonly StreamRow[], columns: number): { rows: number; cells: string } => {
  const sorted = bySeverity(streams)
  const rows = Math.max(1, Math.ceil(sorted.length / 2 / columns))
  const words = new Uint32Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) {
    const top = sorted[2 * i]
    const bottom = sorted[2 * i + 1]
    words[3 * i] = top ? UPPER_HALF : 0x20
    words[3 * i + 1] = top ? COLORS[severity(top)] : DEFAULT
    words[3 * i + 2] = bottom ? COLORS[severity(bottom)] : DEFAULT
  }
  return { rows, cells: base64(new Uint8Array(words.buffer)) }
}

export const ago = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
}

// Local dist freshness per bundle (same 2 s tolerance as jdo-guardrails).
// argv: $1 = the SFDX project dir.
export const DIST_SCRIPT = `
cd "$1" 2>/dev/null || exit 0
for b in force-app/main/default/uiBundles/*/; do
  b="\${b%/}"; n="\${b##*/}"
  [ "$n" = "_shared" ] && continue
  [ -d "$b/src" ] || continue
  if [ ! -f "$b/dist/index.html" ]; then printf '%s\\tmissing\\n' "$n"; continue; fi
  dm=$(stat -f %m "$b/dist/index.html")
  roots="$b/src"; [ -d "$b/../_shared/src" ] && roots="$roots $b/../_shared/src"
  newest=$(find $roots -type f -newer "$b/dist/index.html" -exec stat -f '%m' {} + 2>/dev/null | sort -n | tail -n 1)
  if [ -n "$newest" ] && [ "$newest" -gt $((dm + 2)) ]; then printf '%s\\tstale\\n' "$n"; else printf '%s\\tfresh\\n' "$n"; fi
done
`
