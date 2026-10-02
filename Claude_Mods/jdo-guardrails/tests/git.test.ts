import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { accountMismatch, broadDiscard, dirtyPaths, foreignPaths, gitCalls, pushRemote, remoteOwner } from '../hooks/git.ts'

const ROOT = '/repo'
const PORCELAIN = ' M src/mine.ts\n M src/theirs.ts\n?? notes.md\nR  old.ts -> new.ts\n'
const GH = JSON.stringify({
  hosts: {
    'github.com': [
      { login: 'jsifontes_sfemu', active: true },
      { login: 'josers18', active: false },
    ],
  },
})
const run = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const refusal = (r: { deny?: string; isError?: true; text?: string }) => r.deny ?? (r.isError ? r.text : undefined) ?? ''
const discard = (c: string) => broadDiscard(gitCalls(c)[0]!)?.kind

describe('parsing', () => {
  test('git segments, cwd and -C', () => {
    expect(gitCalls('cd a && git status && X=1 git -C b push origin main')).toEqual([
      { cwd: 'a', args: ['status'] },
      { cwd: 'b', args: ['push', 'origin', 'main'] },
    ])
    expect(gitCalls('echo "git reset --hard"')).toEqual([])
  })
  test('broad discards only', () => {
    expect(discard('git reset --hard')).toBe('git reset --hard')
    expect(discard('git checkout -- .')).toContain('whole tree')
    expect(discard('git restore .')).toContain('whole tree')
    expect(discard('git clean -fd')).toBe('git clean -f')
    expect(discard('git switch --discard-changes main')).toBeDefined()
    expect(discard('git checkout -- src/a.ts')).toBeUndefined()
    expect(discard('git restore --staged .')).toBeUndefined()
    expect(discard('git checkout main')).toBeUndefined()
    expect(broadDiscard(gitCalls('git clean -n')[0]!)).toBeUndefined()
  })
  test('dirty paths split tracked from untracked; mine are excluded', () => {
    expect(dirtyPaths(PORCELAIN, false)).toEqual(['src/mine.ts', 'src/theirs.ts', 'new.ts'])
    expect(dirtyPaths(PORCELAIN, true)).toEqual(['notes.md'])
    expect(foreignPaths(ROOT, ['src/mine.ts', 'src/theirs.ts'], ['/repo/src/mine.ts'])).toEqual(['src/theirs.ts'])
  })
  test('push remote, owner and account', () => {
    expect(pushRemote(gitCalls('git push -u origin feat')[0]!)).toBe('origin')
    expect(pushRemote(gitCalls('git push')[0]!)).toBe('origin')
    expect(remoteOwner('https://github.com/josers18/JDO.git')).toEqual({ host: 'github.com', owner: 'josers18' })
    expect(remoteOwner('git@github.com:josers18/JDO.git')).toEqual({ host: 'github.com', owner: 'josers18' })
    expect(accountMismatch(GH, 'github.com', 'josers18')).toEqual({ active: 'jsifontes_sfemu' })
    expect(accountMismatch(GH, 'github.com', 'salesforce')).toBeUndefined()
    expect(accountMismatch(GH, 'github.com', 'jsifontes_sfemu')).toBeUndefined()
  })
})

// A repo at /repo with one change of this session's and one of someone else's.
const fakeGit = (on: On) =>
  on('process.run', (_$, e) => {
    const argv = e.argv.join(' ')
    if (argv.endsWith('rev-parse --show-toplevel')) return run(`${ROOT}\n`)
    if (argv.endsWith('status --porcelain')) return run(PORCELAIN)
    if (argv.includes('remote get-url')) return run('https://github.com/josers18/JDO.git\n')
    if (argv.startsWith('gh auth status')) return run(GH)
    return run('')
  })

const surfaces = (on: On, list: string[]) => on('session.surfaces', () => ({ value: list as never }))

const answering = (on: On, label: string) =>
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = e.tool === 'AskUserQuestion' ? (e.questions[0]?.question ?? '') : ''
    return { result: { questions: [], answers: { [q]: label } } as never }
  })

describe('through the engine', () => {
  test('a declined broad discard is denied, naming the foreign files', async ($, on) => {
    fakeGit(on)
    surfaces(on, ['terminal'])
    answering(on, 'Cancel')
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(refusal(r)).toContain('src/theirs.ts')
  })

  test('an approved one runs', async ($, on) => {
    fakeGit(on)
    surfaces(on, ['terminal'])
    answering(on, 'Run anyway')
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'HEAD is now at abc' } as never, text: 'HEAD is now at abc' }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(refusal(r)).toBe('')
  })

  test('clean only weighs untracked files', async ($, on) => {
    fakeGit(on)
    surfaces(on, ['terminal'])
    answering(on, 'Cancel')
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })
    expect(refusal(r)).toContain('notes.md')
    expect(refusal(r)).not.toContain('theirs')
  })

  test('with no one to ask (-p) it refuses without opening a dialog', async ($, on) => {
    fakeGit(on)
    surfaces(on, [])
    let asked = false
    on('tool.call', { tool: 'AskUserQuestion' }, () => {
      asked = true
      return { result: { questions: [], answers: {} } as never }
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(refusal(r)).toContain('no one could be asked')
    expect(asked).toBe(false)
  })

  test('a check that cannot run fails closed', async ($, on) => {
    on('process.run', () => {
      throw new Error('git missing')
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(refusal(r)).toContain('refusing')
  })

  test('a push under the wrong active gh account is denied', async ($, on) => {
    fakeGit(on)
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' } as never }))
    const r = await $.tool.call({ tool: 'Bash', command: 'git push -u origin feat' })
    expect(refusal(r)).toContain('gh auth switch --hostname github.com --user josers18')
  })
})
