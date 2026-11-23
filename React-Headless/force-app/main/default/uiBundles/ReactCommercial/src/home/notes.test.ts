import { beforeEach, expect, it, vi } from 'vitest';

const { executeGraphQL } = vi.hoisted(() => ({ executeGraphQL: vi.fn() }));
vi.mock('@shared/data/graphqlClient', () => ({ executeGraphQL }));
import { decodeNoteBody, fetchNotes } from '@shared/data/notes';

/** Mirror of StoryFeed.escapeHtml / CrmWriteRest.escapeNoteHtml (Apex). */
const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const noteNode = (id: string, title: string, modified: string, body: string) =>
  ({ node: { Id: id, Title: { value: title }, ContentModifiedDate: { value: modified }, Content: { value: b64(body) } } });

beforeEach(() => executeGraphQL.mockReset());

it('round-trips the Apex note escaping back to plain text', () => {
  const text = 'Fees < 5% & rates > 2% — "ok"\nLine two &amp; literal\n\nAction items:\n1. Pricing — due 2026-11-22';
  expect(decodeNoteBody(b64(escapeHtml(text)))).toBe(text);
});

it('reads Lightning-authored paragraph notes as lines', () => {
  expect(decodeNoteBody(b64('<p>Phone Call</p><p>Julie &amp; Sam</p>'))).toBe('Phone Call\nJulie & Sam');
});

it('resolves notes through the account links and returns them newest first', async () => {
  executeGraphQL
    .mockResolvedValueOnce({ uiapi: { query: { ContentDocumentLink: { edges: [
      { node: { ContentDocumentId: { value: '069a' } } },
      { node: { ContentDocumentId: { value: '069b' } } },
      { node: { ContentDocumentId: { value: '069c' } } },
    ] } } } })
    .mockResolvedValueOnce({ uiapi: { query: { ContentNote: { edges: [
      noteNode('069a', 'Older', '2026-11-03T00:00:00.000Z', 'Old body'),
      noteNode('069c', 'Call summary — X', '2026-11-21T15:30:00.000Z', 'Summary'),
      noteNode('069b', 'Transcript', '2026-11-15T00:00:00.000Z', 'Line 1<br>Line 2'),
    ] } } } });
  const notes = await fetchNotes('001am00002A9jm4AAB');
  expect(notes.map(n => n.id)).toEqual(['069c', '069b', '069a']);
  expect(notes[1]).toEqual({ id: '069b', title: 'Transcript', date: '2026-11-15', body: 'Line 1\nLine 2' });
  expect(executeGraphQL.mock.calls[0][0]).toContain('LinkedEntityId: { eq: "001am00002A9jm4AAB" }');
  expect(executeGraphQL.mock.calls[1][0]).toContain('Id: { in: ["069a", "069b", "069c"] }');
});

it('skips the note query when the account has no links', async () => {
  executeGraphQL.mockResolvedValueOnce({ uiapi: { query: { ContentDocumentLink: { edges: [] } } } });
  expect(await fetchNotes('001')).toEqual([]);
  expect(executeGraphQL).toHaveBeenCalledTimes(1);
});
