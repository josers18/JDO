// sf-deploy-guard: parses a Bash command for `sf project deploy start` and
// holds the checks the JDO deploys have been bitten by.

// `sf` must open its segment (after optional VAR=1 prefixes), so the words
// inside a quoted argument (a prompt, an echo) never count as a deploy.
export const DEPLOY = /^\s*(?:\w+=\S*\s+)*sf\s+project\s+deploy\s+start\b/
const DEPLOY_IN_COMMAND = /(^|&&|\|\||;|\n)(\s*(?:\w+=\S*\s+)*sf\s+project\s+deploy\s+start\b)/

export type DeployCall = {
  sourceDirs: string[]
  cwd: string | undefined
  hasJson: boolean
  hasIgnoreConflicts: boolean
  allowIgnoreConflicts: boolean
  allowStaleDist: boolean
}

// Shell words of one segment, quotes stripped; good enough for flag reading.
const words = (segment: string): string[] =>
  [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

export const parseDeploy = (command: string): DeployCall | undefined => {
  const segments = command.split(/&&|\|\||;|\n/)
  const at = segments.findIndex(s => DEPLOY.test(s))
  if (at < 0) return undefined

  let cwd: string | undefined
  for (const s of segments.slice(0, at)) {
    const w = words(s.trim())
    if (w[0] === 'cd' && w[1] && w[1] !== '-') cwd = w[1]
  }

  const w = words(segments[at] ?? '')
  const sourceDirs: string[] = []
  w.forEach((t, i) => {
    if ((t === '--source-dir' || t === '-d') && w[i + 1]) sourceDirs.push(w[i + 1]!)
    else if (t.startsWith('--source-dir=')) sourceDirs.push(t.slice('--source-dir='.length))
  })

  return {
    sourceDirs,
    cwd,
    hasJson: w.includes('--json'),
    hasIgnoreConflicts: w.includes('--ignore-conflicts') || w.includes('-c'),
    allowIgnoreConflicts: /\bJDO_ALLOW_IGNORE_CONFLICTS=1\b/.test(command),
    allowStaleDist: /\bJDO_ALLOW_STALE_DIST=1\b/.test(command),
  }
}

export const withJson = (command: string): string =>
  command.replace(DEPLOY_IN_COMMAND, (_m, lead: string, verb: string) => `${lead}${verb} --json`)

// One round-trip: for each source dir, report a git casing mismatch and every
// UI bundle under it whose dist/ is older than its src/ or ../_shared/src.
// argv: $1 = cwd, then the source dirs. Lines out: KIND<TAB>a<TAB>b.
export const CHECK_SCRIPT = `
cd "$1" 2>/dev/null || { printf 'NOCWD\\t%s\\n' "$1"; exit 0; }
shift
for d in "$@"; do
  d="\${d%/}"
  if [ ! -e "$d" ]; then printf 'MISSING\\t%s\\n' "$d"; continue; fi
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [ -z "$(git ls-files -- "$d" | head -n 1)" ]; then
      hit=$(git ls-files -- ":(icase)$d" | head -n 1)
      [ -n "$hit" ] && printf 'CASE\\t%s\\t%s\\n' "$d" "$hit"
    fi
  fi
  case "$d" in
    *uiBundles/*) bundles=$(printf '%s' "$d" | sed -E 's#(.*uiBundles/[^/]+).*#\\1#') ;;
    *) bundles=$(find "$d" -type d -name node_modules -prune -o -type d -path '*/uiBundles/*' ! -path '*/uiBundles/*/*' -print 2>/dev/null) ;;
  esac
  for b in $bundles; do
    case "$b" in */_shared) continue ;; esac
    [ -d "$b/src" ] || continue
    if [ ! -f "$b/dist/index.html" ]; then printf 'STALE\\t%s\\t%s\\n' "$b" "no dist/index.html"; continue; fi
    roots="$b/src"; [ -d "$b/../_shared/src" ] && roots="$roots $b/../_shared/src"
    # a checkout stamps src and dist in the same second: only a lead past 2 s is stale
    dm=$(stat -f %m "$b/dist/index.html")
    newest=$(find $roots -type f -newer "$b/dist/index.html" -exec stat -f '%m %N' {} + 2>/dev/null | sort -n | tail -n 1)
    [ -n "$newest" ] && [ "\${newest%% *}" -gt $((dm + 2)) ] && printf 'STALE\\t%s\\t%s\\n' "$b" "\${newest#* }"
  done
done
exit 0
`

export type CheckFindings = { stale: string[]; casing: string[]; notes: string[] }

export const readFindings = (stdout: string): CheckFindings => {
  const out: CheckFindings = { stale: [], casing: [], notes: [] }
  for (const line of stdout.split('\n')) {
    const [kind, a = '', b = ''] = line.split('\t')
    if (kind === 'STALE') out.stale.push(`${a} (newer: ${b})`)
    else if (kind === 'CASE') {
      // the tracked path's leading characters are the given dir, correctly cased
      const given = a.replace(/^\.\//, '')
      out.casing.push(`\`${a}\` → git tracks it as \`${b.slice(0, given.length)}\``)
    } else if (kind === 'NOCWD') out.notes.push(`could not cd to ${a}; dist/casing checks skipped`)
    else if (kind === 'MISSING') out.notes.push(`--source-dir ${a} not found from the session cwd; dist/casing checks skipped for it`)
  }
  return out
}

export type DeploySummary = { status?: string; deployed?: number; errors?: number }

export const summarize = (text: string): DeploySummary => {
  const num = (k: string) => {
    const m = new RegExp(`"${k}"\\s*:\\s*(\\d+)`).exec(text)
    return m ? Number(m[1]) : undefined
  }
  const status = /"status"\s*:\s*"(\w+)"/.exec(text)?.[1]
  return { status, deployed: num('numberComponentsDeployed'), errors: num('numberComponentErrors') }
}
