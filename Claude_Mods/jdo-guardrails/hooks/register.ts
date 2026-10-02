import type { Register } from 'claude-code'
import { CHECK_SCRIPT, parseDeploy, readFindings, summarize, withJson } from './deploy.ts'
import { lint } from './lint.ts'

export const register: Register = on => {
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
      const { stdout } = await $.process.run(['sh', '-c', CHECK_SCRIPT, 'sh', call.cwd ?? '.', ...call.sourceDirs], {
        timeoutMs: 8000,
      })
      const found = readFindings(stdout)
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
    const whole = await $.fs.read(e.file_path).catch(() => e.new_string)
    return withWarnings($, ran, e.file_path, lint(e.file_path, e.new_string, whole))
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
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
