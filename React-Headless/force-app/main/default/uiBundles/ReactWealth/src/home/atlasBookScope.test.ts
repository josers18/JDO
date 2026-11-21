import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryDataCloudForBook } from '@shared/data/dataCloudClient';

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@salesforce/platform-sdk', () => ({ createDataSDK: async () => ({ fetch }) }));

const ownerId = '005am000003PbCLAA0';
const sql = (filter: string) => `SELECT Id FROM Account WHERE Id ${filter}`;
const empty = { rows: [], columns: [], rowCount: 0, warning: null };

describe('strict Atlas Data Cloud book scope', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns an empty book without falling back to org-wide data', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => empty });

    const result = await queryDataCloudForBook(sql, ownerId, 6, true);

    expect(result).toMatchObject({ scope: 'book', rows: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body).sql).toContain(ownerId);
  });

  it('rejects a missing owner before calling Data Cloud', async () => {
    await expect(queryDataCloudForBook(sql, null, 6, true)).rejects.toThrow('verified book owner');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains legacy org fallback when the caller uses the default', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => empty });

    await expect(queryDataCloudForBook(sql, ownerId, 6)).resolves.toMatchObject({ scope: 'org' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
