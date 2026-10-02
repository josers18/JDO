// git-safety: parses a Bash command for the git operations that have cost
// work here: broad discards over changes this session didn't make, and a push
// under the wrong active gh account (403 on josers18/JDO).

// Shell words of one segment, quotes stripped; good enough for flag reading.
const words = (segment: string): string[] =>
  [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

export type GitCall = { cwd: string | undefined; args: string[] }

// Each `git …` segment (after optional VAR=1 prefixes), with the cwd a
// preceding `cd X &&` or a `git -C X` gives it.
export const gitCalls = (command: string): GitCall[] => {
  let cwd: string | undefined
  const calls: GitCall[] = []
  for (const segment of command.split(/&&|\|\||;|\n|\|/)) {
    const w = words(segment.trim())
    while (w[0] && /^\w+=/.test(w[0])) w.shift()
    if (w[0] === 'cd' && w[1] && w[1] !== '-') cwd = w[1]
    if (w[0] !== 'git') continue
    const args = w.slice(1)
    let at = cwd
    while (args[0] === '-C' && args[1]) {
      at = args[1]
      args.splice(0, 2)
    }
    calls.push({ cwd: at, args })
  }
  return calls
}

const BROAD = new Set(['.', ':/', ':/*', '*', './', ':'])

// The discards that reach past named files, and which changes each destroys:
// `clean` removes untracked files, the rest reset tracked ones.
export type Discard = { kind: string; untracked: boolean }

export const broadDiscard = ({ args }: GitCall): Discard | undefined => {
  const tracked = (kind: string): Discard => ({ kind, untracked: false })
  const [verb, ...rest] = args
  const paths = rest.includes('--') ? rest.slice(rest.indexOf('--') + 1) : rest.filter(a => !a.startsWith('-'))
  const touchesAll = paths.some(p => BROAD.has(p))
  if (verb === 'reset' && rest.includes('--hard')) return tracked('git reset --hard')
  if (verb === 'clean' && rest.some(a => /^-[a-zA-Z]*f/.test(a) || a === '--force')) return { kind: 'git clean -f', untracked: true }
  if (verb === 'checkout' && (touchesAll || rest.includes('-f') || rest.includes('--force'))) return tracked('git checkout over the whole tree')
  const unstageOnly = (rest.includes('--staged') || rest.includes('-S')) && !rest.includes('--worktree') && !rest.includes('-W')
  if (verb === 'restore' && touchesAll && !unstageOnly) return tracked('git restore over the whole tree')
  if (verb === 'switch' && (rest.includes('-f') || rest.includes('--force') || rest.includes('--discard-changes')))
    return tracked('git switch --discard-changes')
  return undefined
}

// Paths `git status --porcelain` lists, repo-relative (a rename's new side),
// keeping only untracked (`??`) ones or only tracked ones.
export const dirtyPaths = (porcelain: string, untracked: boolean): string[] =>
  porcelain
    .split('\n')
    .filter(l => l.length > 3 && l.startsWith('??') === untracked)
    .map(l => l.slice(3).split(' -> ').pop()!.replace(/^"(.*)"$/, '$1'))

export const foreignPaths = (root: string, dirty: readonly string[], touched: readonly string[]): string[] => {
  const mine = new Set(touched)
  return dirty.filter(p => !mine.has(`${root}/${p}`))
}

// The remote a `git push` names: the first bare word after push, else origin.
export const pushRemote = ({ args }: GitCall): string | undefined => {
  if (args[0] !== 'push') return undefined
  return args.slice(1).find(a => !a.startsWith('-')) ?? 'origin'
}

export const remoteOwner = (url: string): { host: string; owner: string } | undefined => {
  const m = url.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)([^/:]+)[/:]([^/]+)\//)
  return m ? { host: m[1]!, owner: m[2]! } : undefined
}

type GhAccount = { login: string; active: boolean }

// Denies when the repo's owner is one of the logged-in gh accounts but not the
// active one on that host; an org-owned repo or an unknown owner passes.
export const accountMismatch = (ghJson: string, host: string, owner: string): { active: string } | undefined => {
  const accounts = (JSON.parse(ghJson) as { hosts?: Record<string, GhAccount[]> }).hosts?.[host] ?? []
  const active = accounts.find(a => a.active)?.login
  const ownerIsAccount = accounts.some(a => a.login.toLowerCase() === owner.toLowerCase())
  return active && ownerIsAccount && active.toLowerCase() !== owner.toLowerCase() ? { active } : undefined
}
