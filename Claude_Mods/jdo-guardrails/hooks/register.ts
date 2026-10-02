import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { CHECK_SCRIPT, parseDeploy, readFindings, summarize, withJson } from './deploy.ts'
import type { Discard, GitCall } from './git.ts'
import { accountMismatch, broadDiscard, dirtyPaths, foreignPaths, gitCalls, pushRemote, remoteOwner } from './git.ts'
import { lint } from './lint.ts'

const touched = atom({ plugin: 'jdo-guardrails', key: 'touched' } as const, [])
const RUN_ANYWAY = 'Run anyway'

async function git($: EngineInterface, call: GitCall, args: string[]) {
  const r = await $.process.run(['git', ...(call.cwd ? ['-C', call.cwd] : []), ...args], { timeoutMs: 8000 })
  return r.exitCode === 0 ? r.stdout : ''
}

// Asks before a broad discard of changes this session's Edit/Write didn't make.
async function checkDiscard($: EngineInterface, call: GitCall, discard: Discard) {
  const root = (await git($, call, ['rev-parse', '--show-toplevel'])).trim()
  if (!root) return undefined
  const dirty = dirtyPaths(await git($, call, ['status', '--porcelain']), discard.untracked)
  const foreign = foreignPaths(root, dirty, await read($, touched))
  if (foreign.length === 0) return undefined
  const shown = foreign.slice(0, 8).join(', ') + (foreign.length > 8 ? `, +${foreign.length - 8} more` : '')
  // nobody to ask (a plain -p run): $.ui.ask would wait forever, so refuse
  const canAsk = (await $.session.surfaces()).length > 0
  const question = `${discard.kind} would discard ${foreign.length} change(s) this session didn't make (${shown}). Run it anyway?`
  const answer = canAsk
    ? await $.ui.ask(question, { header: 'git-safety', options: ['Cancel', RUN_ANYWAY] }).catch(() => 'Cancel')
    : 'Cancel'
  if (answer === RUN_ANYWAY) return undefined
  return {
    deny: `${$.plugin.name}: ${discard.kind} would discard ${foreign.length} change(s) this session didn't make (${shown}), and the person did not approve (or no one could be asked). Scope it to the files you changed (\`git restore <file>\`, \`git checkout -- <file>\`) instead.`,
  }
}

// Denies a push to a repo owned by a logged-in gh account that isn't the active one.
async function checkPush($: EngineInterface, call: GitCall, remote: string) {
  const at = remoteOwner(await git($, call, ['remote', 'get-url', remote]))
  if (!at) return undefined
  const gh = await $.process.run(['gh', 'auth', 'status', '--json', 'hosts'], { timeoutMs: 8000 }).catch(() => undefined)
  let mismatch: { active: string } | undefined
  try {
    mismatch = gh ? accountMismatch(gh.stdout, at.host, at.owner) : undefined
  } catch {
    return undefined
  }
  if (!mismatch) return undefined
  return {
    deny: `${$.plugin.name}: '${remote}' is ${at.owner}'s repo on ${at.host}, but the active gh account is ${mismatch.active}, so this push would 403. Run \`gh auth switch --hostname ${at.host} --user ${at.owner}\` first.`,
  }
}

export const register: Register = on => {
  // ── git-safety ─────────────────────────────────────────────────────
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    for (const call of gitCalls(e.command)) {
      const discard = broadDiscard(call)
      // fail closed: a check that cannot run must not let a discard through
      const verdict = discard
        ? await checkDiscard($, call, discard).catch((err: unknown) => ({
            deny: `${$.plugin.name}: could not check what ${discard.kind} would discard (${String(err)}); refusing. Scope it to named files.`,
          }))
        : undefined
      if (verdict) return verdict
      const remote = pushRemote(call)
      const refusal = remote ? await checkPush($, call, remote) : undefined
      if (refusal) return refusal
    }
    return next(e)
  })

  // ── sf-deploy-guard ────────────────────────────────────────────────
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const call = parseDeploy(e.command)
    if (!call) return next(e)
    const tag = $.plugin.name

    if (call.hasIgnoreConflicts && !call.allowIgnoreConflicts)
      return {
        deny: `${tag}: --ignore-conflicts has masked a hard deploy failure as exit 0 here. Drop it and resolve the conflict, or prefix JDO_ALLOW_IGNORE_CONFLICTS=1 if the person explicitly asked for it.`,
      }

    const notes: string[] = []
    if (call.sourceDirs.length > 0) {
      // fail closed: a check that cannot run must not let an unchecked deploy through
      const checked = await $.process
        .run(['sh', '-c', CHECK_SCRIPT, 'sh', call.cwd ?? '.', ...call.sourceDirs], { timeoutMs: 8000 })
        .catch((err: unknown) => ({ failure: String(err) }))
      if ('failure' in checked && !call.allowStaleDist)
        return {
          deny: `${tag}: could not run the dist/ and --source-dir casing checks (${checked.failure}); refusing an unchecked deploy. Fix that, or prefix JDO_ALLOW_STALE_DIST=1 to deploy without them.`,
        }
      const found = readFindings('stdout' in checked ? checked.stdout : '')
      if (found.casing.length > 0)
        return {
          deny: `${tag}: --source-dir casing differs from git (macOS case collision → "duplicate value found: <unknown>"): ${found.casing.join('; ')}. Use the tracked casing.`,
        }
      if (found.stale.length > 0 && !call.allowStaleDist)
        return {
          deny: `${tag}: UI bundle dist/ is older than its sources, so the deploy would ship stale code: ${found.stale.join('; ')}. Run \`npm run build\` in the bundle first (or prefix JDO_ALLOW_STALE_DIST=1 if the mtimes are only from a checkout).`,
        }
      notes.push(...found.notes)
    }

    const command = call.hasJson ? e.command : withJson(e.command)
    if (!call.hasJson) notes.push('appended --json so the result can be read for status/numberComponentErrors')

    const ran = await next({ ...e, command })
    if (ran.deny !== undefined || e.run_in_background) return ran

    const { status, deployed, errors } = summarize(ran.text ?? '')
    const failed = ran.isError === true || (status !== undefined && status !== 'Succeeded') || (errors ?? 0) > 0
    $.ui.toast(`deploy ${status ?? (ran.isError ? 'errored' : 'finished')} · ${deployed ?? '?'} deployed · ${errors ?? '?'} errors`)
    if (failed && deployed === undefined && errors === undefined)
      notes.push('sf exited before any deploy ran (no deploy result in the output); fix the CLI error above, nothing reached the org')
    else if (failed)
      notes.push(
        `deploy did NOT cleanly succeed (status ${status ?? 'unknown'}, ${errors ?? '?'} component errors) regardless of exit code; read result.details.componentFailures before claiming success`,
      )
    if (notes.length === 0) return ran
    return { ...ran, context: [...(ran.context ?? []), notes.map(n => `${tag}: ${n}`).join('\n')] }
  })

  // ── gotcha-lint ────────────────────────────────────────────────────
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    await update($, touched, paths => (paths.includes(e.file_path) ? paths : [...paths, e.file_path]))
    const whole = await $.fs.read(e.file_path).catch(() => e.new_string)
    return withWarnings($, ran, e.file_path, lint(e.file_path, e.new_string, whole))
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    await update($, touched, paths => (paths.includes(e.file_path) ? paths : [...paths, e.file_path]))
    return withWarnings($, ran, e.file_path, lint(e.file_path, e.content, e.content))
  })
}

type Ran = { context?: readonly string[] }
type Ui = { ui: { status: (t: string | undefined) => void }; plugin: { name: string } }

const withWarnings = <R extends Ran>($: Ui, ran: R, path: string, warnings: string[]): R => {
  if (warnings.length === 0) return ran
  const file = path.split('/').pop()
  $.ui.status(`${$.plugin.name}: ${warnings.length} gotcha${warnings.length > 1 ? 's' : ''} in ${file}`)
  const text = `${$.plugin.name} flagged ${path}:\n${warnings.map(w => `- ${w}`).join('\n')}\nFix these unless intentional.`
  return { ...ran, context: [...(ran.context ?? []), text] }
}
