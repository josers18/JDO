import { afterEach, describe, expect, it, vi } from 'vitest';
import { WHITESPACE_LEAD_SOURCE } from '@shared/data/whitespace';
import { readWorkspaceState, workspaceStateKey, writeWorkspaceState, type Draft } from './retailWorkspaceState';

const actor = '005000000000001';
const owner = '005000000000002';
const anotherBook = '005000000000003';
const pin = '001000000000001';
const lead = '00Q000000000001';
const key = workspaceStateKey(actor, owner);
const empty = { drafts: [], pins: [] };
const email: Draft = {
  id: `lead-email:${lead}`, kind: 'Email', title: 'Follow-up subject', note: 'Keep this unsent.',
  readiness: 'Working', recordId: lead, recipient: 'contact@example.test',
};

afterEach(() => {
  vi.restoreAllMocks();
  writeWorkspaceState(key, empty);
  sessionStorage.clear();
});

describe('Retail Atlas tab state', () => {
  it('restores drafts and pins only for the original actor and book', () => {
    const saved = { drafts: [email], pins: [pin] };
    writeWorkspaceState(key, saved);

    expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual(saved);
    expect(readWorkspaceState(key, owner)).toEqual(saved);
    expect(readWorkspaceState(workspaceStateKey(actor, anotherBook), anotherBook)).toEqual(empty);
    expect(readWorkspaceState(workspaceStateKey(anotherBook, owner), owner)).toEqual(empty);
    expect(readWorkspaceState(workspaceStateKey(undefined, owner), owner)).toEqual(empty);
  });

  it('ignores malformed data and only restores an opportunity payload for this book', () => {
    const opportunity: Draft = {
      id: 'offer', kind: 'Opportunity', title: 'Offer', note: 'Model evidence', readiness: 'Working',
      account: { id: pin, name: 'Verified relationship' }, product: 'Managed savings',
    };
    const payload = { action: 'opportunity', accountId: pin, ownerId: owner, name: 'Offer', amount: 12, leadSource: WHITESPACE_LEAD_SOURCE };
    sessionStorage.setItem(key, JSON.stringify({
      drafts: [email, { ...email, recordId: pin }, null, { id: 'bad', checklist: true },
        { ...opportunity, payload: { ...payload, stageName: 'Closed Won' } },
        { ...opportunity, id: 'different-book', payload: { ...payload, ownerId: anotherBook } }],
      pins: [pin, pin, 7, lead],
    }));

    expect(readWorkspaceState(key, owner)).toEqual({
      drafts: [email, { ...opportunity, payload }, { ...opportunity, id: 'different-book' }],
      pins: [pin],
    });
    sessionStorage.setItem(key, '{');
    expect(readWorkspaceState(key, owner)).toEqual(empty);
  });

  it('keeps the current scoped state in memory when a write fails', () => {
    const saved = { drafts: [email], pins: [pin] };
    sessionStorage.setItem(key, JSON.stringify(empty));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });

    writeWorkspaceState(key, saved);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    expect(readWorkspaceState(key, owner)).toEqual(saved);
    expect(readWorkspaceState(workspaceStateKey(actor, anotherBook), anotherBook)).toEqual(empty);
    vi.restoreAllMocks();
    writeWorkspaceState(key, { drafts: [], pins: [pin] });
    expect(readWorkspaceState(key, owner)).toEqual({ drafts: [], pins: [pin] });
  });
});
