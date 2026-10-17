import { describe, expect, test } from 'claude-code/testing'

import { fromProgress, nextFold, showing } from '../hooks/plan.ts'

const bar = {
  id: 'p',
  title: 'Release',
  startedAt: 5_000,
  stages: [{ steps: [{ title: 'Spec', status: 'done' }, { title: 'Write it', status: 'done', doneAt: 9_000 }, { title: 'Test it', status: 'done', doneAt: 10_000 }, { title: 'Ship it', status: 'active' }] }],
}

describe('finished plan-progress steps', () => {
  test('carry their finish time; one sent already finished counts from the bar start', () => {
    expect(fromProgress(bar).map(p => p.doneAt)).toEqual([5_000, 9_000, 10_000, undefined])
  })

  test('drop off 8 seconds after they finish, the open steps staying', () => {
    const plan = fromProgress(bar)
    expect(showing(plan, 10_000, 8_000).map(p => p.subject)).toEqual(['Spec', 'Write it', 'Test it', 'Ship it'])
    expect(showing(plan, 13_000, 8_000).map(p => p.subject)).toEqual(['Write it', 'Test it', 'Ship it'])
    expect(showing(plan, 17_000, 8_000).map(p => p.subject)).toEqual(['Test it', 'Ship it'])
    expect(showing(plan, 18_000, 8_000).map(p => p.subject)).toEqual(['Ship it'])
  })

  test('the next drop-off is the earliest finished step still shown', () => {
    const plan = fromProgress(bar)
    expect(nextFold(plan, 10_000, 8_000)).toBe(13_000)
    expect(nextFold(plan, 13_000, 8_000)).toBe(17_000)
    expect(nextFold(plan, 17_000, 8_000)).toBe(18_000)
    expect(nextFold(plan, 18_000, 8_000)).toBeUndefined()
  })

  test('a finished step with no time of its own stays', () => {
    const plan = [{ id: 't', subject: 'Rows', status: 'completed' as const }]
    expect(showing(plan, 1e12, 8_000)).toHaveLength(1)
    expect(nextFold(plan, 1e12, 8_000)).toBeUndefined()
  })
})
