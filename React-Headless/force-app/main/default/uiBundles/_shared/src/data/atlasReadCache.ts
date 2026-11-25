// A verified V2 shell owns this tab-local cache. Keys are exact requests within
// the current persona, authenticated user and viewed book.
export type ReadSource = 'Salesforce CRM' | 'Data 360' | 'Record summary' | 'Commercial daily brief';
const ttl = { 'Salesforce CRM': 15_000, 'Data 360': 60_000, 'Record summary': 15_000, 'Commercial daily brief': 300_000 };
const limit = 96;
let scope = '';
const saved = new Map<string, {json: string; expires: number}>();
const pending = new Map<string, Promise<unknown>>();

function counters() {
  return {requests: 0, hits: 0, joined: 0, failures: 0, completed: 0, totalMs: 0};
}
const stats = new Map<ReadSource, ReturnType<typeof counters>>();

export function readStatistics() {
  return Object.keys(ttl).map(name => {
    const source = name as ReadSource;
    return {source, ...stats.get(source) ?? counters()};
  });
}

export function invalidateAtlasReads() {
  saved.clear();
  pending.clear();
}

export function setAtlasReadScope(next: string) {
  if (next === scope) return;
  scope = next;
  invalidateAtlasReads();
  stats.clear();
}

export async function atlasRead<T>(source: ReadSource, key: string, read: () => Promise<T>, canSave?: (result: T) => boolean): Promise<T> {
  if (!scope) return read();
  const id = source + ':' + key;
  const count = stats.get(source) ?? counters();
  stats.set(source, count);
  const cached = saved.get(id);
  if (cached && cached.expires > performance.now()) {
    count.hits++;
    return JSON.parse(cached.json) as T;
  }
  saved.delete(id);
  const running = pending.get(id);
  if (running) {
    count.joined++;
    return structuredClone(await running) as T;
  }
  const start = performance.now();
  count.requests++;
  const request = read();
  pending.set(id, request);
  try {
    const result = await request;
    count.completed++;
    count.totalMs += performance.now() - start;
    if (pending.get(id) === request && (!canSave || canSave(result))) {
      const json = JSON.stringify(result);
      // Bound retained payloads to 96 entries of at most 64K characters.
      if (json && json.length <= 65536) {
        if (saved.size >= limit) saved.delete(saved.keys().next().value!);
        saved.set(id, {json, expires: performance.now() + ttl[source]});
      }
    }
    return result;
  } catch (error) {
    count.failures++;
    throw error;
  } finally {
    if (pending.get(id) === request) pending.delete(id);
  }
}
