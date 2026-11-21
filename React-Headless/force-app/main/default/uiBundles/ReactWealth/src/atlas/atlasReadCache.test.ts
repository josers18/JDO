import { afterEach, expect, it, vi } from 'vitest';
import { atlasRead, invalidateAtlasReads, readStatistics, setAtlasReadScope } from '@shared/data/atlasReadCache';

afterEach(() => { setAtlasReadScope(''); vi.useRealTimers(); });

it('joins exact reads, isolates cached values, and expires them by source', async () => {
  vi.useFakeTimers();
  setAtlasReadScope('wealth/actor/book');
  const load = vi.fn(async () => ({value: 1}));
  const [a, b] = await Promise.all([atlasRead('Salesforce CRM', 'query', load), atlasRead('Salesforce CRM', 'query', load)]);
  a.value = 0;
  expect(b.value).toBe(1);
  expect((await atlasRead('Salesforce CRM', 'query', load)).value).toBe(1);
  await atlasRead('Data 360', 'query', load);
  vi.advanceTimersByTime(15_001);
  await atlasRead('Salesforce CRM', 'query', load);
  await atlasRead('Data 360', 'query', load);
  expect(load).toHaveBeenCalledTimes(3);
  expect(readStatistics()[0]).toMatchObject({requests:2, joined:1, hits:1});
});

it('does not restore invalidated in-flight reads after a write or book switch', async () => {
  setAtlasReadScope('retail/actor/a');
  let resolve!: (result:string) => void;
  const old = atlasRead('Data 360','query', () => new Promise<string>(done => { resolve=done; }));
  invalidateAtlasReads();
  setAtlasReadScope('retail/actor/b');
  const fresh = vi.fn(async () => 'book B');
  expect(await atlasRead('Data 360','query',fresh)).toBe('book B');
  resolve('book A');
  await old;
  expect(await atlasRead('Data 360','query',fresh)).toBe('book B');
  expect(fresh).toHaveBeenCalledTimes(1);
});

it('retries failures and warning results and bypasses storage outside the verified shell', async () => {
  const load = vi.fn(async () => 'ok');
  await atlasRead('Data 360','query',load);
  await atlasRead('Data 360','query',load);
  setAtlasReadScope('commercial/actor/book');
  await expect(atlasRead('Data 360','query', async () => { throw Error('offline'); })).rejects.toThrow('offline');
  await atlasRead('Data 360','query',load, () => false);
  await atlasRead('Data 360','query',load);
  expect(load).toHaveBeenCalledTimes(4);
});
