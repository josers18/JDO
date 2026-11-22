import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared', () => ({ executeGraphQL: vi.fn(), queryDataCloud: vi.fn(), generateText: vi.fn(), crmWrite: vi.fn() }));

import { crmWrite, executeGraphQL, queryDataCloud } from '@shared';
import { approveAfterCall, composeAfterCall, fetchAfterCallContext, mergeAiDraft, hasOwnershipChange, parseActionItems, type AfterCallContext } from './afterCall';

// Seeded Supercharge Bankers transcript (Demo_Seeds/supercharge_bankers, 2026-11-15 call).
const TRANSCRIPT = "Attendees: Allen Carter (Relationship Manager), Marisol Rodriguez (CEO), Daniel Okafor (CFO)\nDuration: 41 min\n\n---\n\nAllen Carter: Thanks for making time, both of you. I wanted to walk through the Treasury Services proposal we sent on the 3rd and hear where you've landed.\n\nDaniel Okafor: Honestly, we're not there yet. The pricing on the sweep and the per-item ACH fees came in higher than we expected. We've had another bank in this month and their number was lower.\n\nAllen Carter: Understood. Can you share which pieces were the gap?\n\nDaniel Okafor: Mainly the ACH per-item fee and the monthly account analysis charge. The liquidity sweep itself we like.\n\nMarisol Rodriguez: The bigger issue for me is timing. We're restructuring. As of October 30 we set up Rodriguez Holdings LLC as a parent, and Tomas Vega came in as a 30 percent owner. So whatever we sign, it has to be with the new structure.\n\nAllen Carter: That's helpful to know now. We'll need to update ownership on file before we can open anything under the new entity.\n\nDaniel Okafor: What do you need from us?\n\nAllen Carter: A beneficial ownership certification covering Mr. Vega, the formation documents for the holdings company, and an updated org chart. I'll send the list today.\n\nMarisol Rodriguez: Fine. And we'd like to see the sweep working before we commit. Can your team do a demo?\n\nAllen Carter: Yes. Let me set up a working session with our treasury specialist.\n\nDaniel Okafor: If you can get us revised pricing by the 22nd, we can take it to the board in December.\n\nAllen Carter: I'll have it to you by the 22nd. So, to recap: revised pricing by November 22, the ownership document list today, and a sweep demo before our next call.\n\nMarisol Rodriguez: And let's keep the January 4 check-in.\n\nAllen Carter: January 4 it is. Thank you both.\n\n---\n\nAction items (as spoken):\n1. Revised pricing on ACH per-item and account analysis fees — due 2026-11-22\n2. Send beneficial ownership / entity document checklist for Rodriguez Holdings LLC and Tomas Vega — due 2026-11-15\n3. Schedule liquidity sweep demo with treasury specialist — before 2027-01-04";

const ctx: AfterCallContext = {
  accountId: '001am00002A9jm4AAB',
  accountName: 'Rodriguez Industries',
  kycStatus: 'Expired',
  note: { title: 'Treasury Services proposal review — call transcript', date: '2026-11-15', body: TRANSCRIPT },
  contacts: [
    { id: '003a', name: 'Marisol Rodriguez', title: 'CEO', email: 'mrodriguez@rodriguezindustries.example' },
    { id: '003b', name: 'Daniel Okafor', title: 'CFO', email: 'dokafor@rodriguezindustries.example' },
  ],
  gong: { sentiment: 'Negative', trend: 'Declining', topics: ['Pricing', 'Competitor'], actionItems: 3, nextCall: '2027-01-04', rm: 'Allen Carter' },
  sanctions: false, adverseMedia: false,
};

describe('hasOwnershipChange', () => {
  it('spots a new parent entity or owner in the transcript', () => {
    expect(hasOwnershipChange(TRANSCRIPT)).toBe(true);
    expect(hasOwnershipChange('Talked about pricing only.')).toBe(false);
  });
});

describe('parseActionItems', () => {
  it('reads the three dated commitments under "Action items"', () => {
    expect(parseActionItems(TRANSCRIPT)).toEqual([
      { subject: 'Revised pricing on ACH per-item and account analysis fees', dueDate: '2026-11-22' },
      { subject: 'Send beneficial ownership / entity document checklist for Rodriguez Holdings LLC and Tomas Vega', dueDate: '2026-11-15' },
      { subject: 'Schedule liquidity sweep demo with treasury specialist', dueDate: '2027-01-04' },
    ]);
  });
  it('is empty without an action-items section', () => {
    expect(parseActionItems('Just chatted.')).toEqual([]);
  });
});

describe('follow-up due dates', () => {
  it('never lands in the past', () => {
    const late = composeAfterCall(ctx, '2026-11-21');
    expect(late.tasks.map(t => t.dueDate)).toEqual(['2026-11-22', '2026-11-21', '2027-01-04']);
    expect(late.email.body).toMatch(/Tomas Vega — November 21/);
    const out = mergeAiDraft(late, '{"tasks":[{"subject":"A","dueDate":"2026-11-15"},{"subject":"B","dueDate":"2026-11-22"},{"subject":"C","dueDate":"2026-12-01"}]}', '2026-11-21');
    expect(out.tasks.map(t => t.dueDate)).toEqual(['2026-11-21', '2026-11-22', '2026-12-01']);
  });
});

describe('composeAfterCall', () => {
  const d = composeAfterCall(ctx, '2026-11-01');
  it('addresses the email to the CFO and signs it as the RM', () => {
    expect(d.email.to).toBe('dokafor@rodriguezindustries.example');
    expect(d.email.body).toMatch(/^Hi Daniel,/);
    expect(d.email.body).toContain('Allen Carter');
    expect(d.email.subject).toBe('Follow-up: Treasury Services proposal review');
  });
  it('lists the KYC gaps: expired review, new entity and new owner', () => {
    expect(d.kycGaps).toHaveLength(3);
    expect(d.kycGaps.join(' ')).toMatch(/expired/);
    expect(d.kycGaps.join(' ')).toContain('Rodriguez Holdings LLC');
    expect(d.kycGaps.join(' ')).toContain('Tomas Vega (30% owner)');
  });
  it('summarises sentiment, pricing pushback and the next check-in', () => {
    expect(d.summary).toMatch(/negative and declining/);
    expect(d.summary).toMatch(/pricing/);
    expect(d.summary).toContain('January 4');
    expect(d.tasks).toHaveLength(3);
  });
});

describe('mergeAiDraft', () => {
  const base = composeAfterCall(ctx, '2026-11-01');
  it('keeps the composed draft when the model reply is not JSON', () => {
    expect(mergeAiDraft(base, 'Sorry, I cannot help')).toBe(base);
  });
  it('takes model fields but keeps composed tasks when a date is malformed', () => {
    const out = mergeAiDraft(base, 'Here: {"summary":"Model summary","tasks":[{"subject":"A","dueDate":"soon"},{"subject":"B","dueDate":"2026-11-22"},{"subject":"C","dueDate":"2026-12-01"}]}');
    expect(out.summary).toBe('Model summary');
    expect(out.tasks).toEqual(base.tasks);
    expect(out.source).toBe('model');
  });
});

describe('approveAfterCall', () => {
  it('writes 3 tasks, a logged email, a meeting note and the KYC update', async () => {
    vi.mocked(crmWrite).mockResolvedValue({ success: true, id: 'x' });
    const n = await approveAfterCall(ctx, composeAfterCall(ctx, '2026-11-01'));
    expect(n).toBe(6);
    const actions = vi.mocked(crmWrite).mock.calls.map(c => c[0]);
    expect(actions.filter(a => a.action === 'task' && a.type === 'To Do')).toHaveLength(3);
    expect(actions.find(a => a.type === 'Email')).toMatchObject({ status: 'Completed', whoId: '003b' });
    expect(actions.find(a => a.action === 'kyc')).toMatchObject({ status: 'Required', accountId: ctx.accountId });
    expect(actions.find(a => a.action === 'meetingNote')).toMatchObject({ accountId: ctx.accountId });
  });
  it('reports partial failures', async () => {
    vi.mocked(crmWrite).mockReset().mockResolvedValue({ success: true, id: 'x' }).mockRejectedValueOnce(new Error('boom'));
    await expect(approveAfterCall(ctx, composeAfterCall(ctx, '2026-11-01'))).rejects.toThrow('1 of 6 writes failed: boom');
  });
});

describe('fetchAfterCallContext', () => {
  const note = (id: string, title: string, date: string, body: string) => ({ node: { Id: id, Title__c: { value: title }, Date__c: { value: date }, Notes__c: { value: body } } });
  it('drafts from the call transcript, skipping newer "Call summary —" notes', async () => {
    vi.mocked(queryDataCloud).mockResolvedValue({ rows: [] } as never);
    vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: {
      Account: { edges: [{ node: { Id: '001', Name: { value: 'Rodriguez Industries' }, FinServ__KYCStatus__c: { value: 'Required' } } }] },
      Meeting_Note__c: { edges: [
        note('n3', 'Call summary — Treasury Services proposal review', '2026-11-21', 'Model summary'),
        note('n2', 'Treasury Services proposal review — call transcript', '2026-11-15', 'Transcript body'),
        note('n1', 'Proposal walkthrough', '2026-11-03', 'Older'),
      ] },
      Contact: { edges: [] },
    } } } as never);
    const c = await fetchAfterCallContext('001');
    expect(c?.note).toEqual({ title: 'Treasury Services proposal review — call transcript', date: '2026-11-15', body: 'Transcript body' });
  });
  it('has no note when only summaries exist', async () => {
    vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: {
      Account: { edges: [{ node: { Id: '001' } }] },
      Meeting_Note__c: { edges: [note('n3', 'Call summary - X', '2026-11-21', 'S')] },
    } } } as never);
    expect((await fetchAfterCallContext('001'))?.note).toBeNull();
  });
});
