/**
 * Account notes from native ContentNote (the Notes related list), read over
 * GraphQL. ContentDocumentLink only reads when filtered by LinkedEntityId, so
 * the account's links come first, then the ContentNotes by id.
 *
 * Bodies come back as base64 HTML. Notes written by CrmWriteRest / StoryFeed
 * escape &, <, > and turn newlines into <br>; notes typed in Lightning use
 * <p> paragraphs. decodeNoteBody turns both back into plain text.
 */
import { executeGraphQL } from './graphqlClient';
import { localDay } from './localDate';

export interface AccountNote { id: string; title: string; date: string; body: string }

const NOTE_LIMIT = 100;

interface LinkShape { uiapi?: { query?: { ContentDocumentLink?: { edges?: { node: { ContentDocumentId?: { value?: string | null } } }[] } } } }
interface NoteShape {
  uiapi?: { query?: { ContentNote?: { edges?: { node: {
    Id: string;
    Title?: { value?: string | null };
    ContentModifiedDate?: { value?: string | null };
    Content?: { value?: string | null };
  } }[] } } };
}

const fromBase64 = (b64: string): string => {
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  } catch {
    return b64;
  }
};

/** base64 note HTML → plain text (exact inverse of the Apex escapeHtml for app-written notes). */
export function decodeNoteBody(b64: string): string {
  return fromBase64(b64)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/** The account's ContentNotes, newest first (by ContentModifiedDate). */
export async function fetchNotes(accountId: string): Promise<AccountNote[]> {
  const acct = accountId.replace(/[^A-Za-z0-9]/g, '');
  if (!acct) return [];
  const links = await executeGraphQL<LinkShape>(`query AccountNoteLinks {
  uiapi { query {
    ContentDocumentLink(first: ${NOTE_LIMIT}, where: { LinkedEntityId: { eq: "${acct}" } }) {
      edges { node { ContentDocumentId { value } } }
    }
  } }
}`);
  const ids = [...new Set((links.uiapi?.query?.ContentDocumentLink?.edges ?? [])
    .map(e => (e.node.ContentDocumentId?.value ?? '').replace(/[^A-Za-z0-9]/g, '')).filter(Boolean))];
  if (!ids.length) return [];
  const data = await executeGraphQL<NoteShape>(`query AccountNotes {
  uiapi { query {
    ContentNote(first: ${NOTE_LIMIT}, where: { Id: { in: [${ids.map(id => `"${id}"`).join(', ')}] } }, orderBy: { ContentModifiedDate: { order: DESC } }) {
      edges { node { Id Title @optional { value } ContentModifiedDate @optional { value } Content @optional { value } } }
    }
  } }
}`);
  return (data.uiapi?.query?.ContentNote?.edges ?? [])
    .map(({ node }) => ({ modified: node.ContentModifiedDate?.value ?? '', note: {
      id: String(node.Id ?? ''),
      title: node.Title?.value ?? '',
      date: node.ContentModifiedDate?.value ? localDay(node.ContentModifiedDate.value) : '',
      body: node.Content?.value ? decodeNoteBody(node.Content.value) : '',
    } }))
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .map(r => r.note);
}
