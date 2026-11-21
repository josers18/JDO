import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchAfterCallContext: vi.fn(),
  draftAfterCall: vi.fn(),
  approveAfterCall: vi.fn(),
  fetchCallRecord: vi.fn(),
}));
vi.mock('../personas/customer/afterCall', () => api);

import { AfterCall, CallRecord } from './AfterCall';

const ctx = {
  accountId: '001', accountName: 'Rodriguez Industries', kycStatus: 'Expired', pep: true, sanctions: false, adverseMedia: false,
  note: { title: 'Treasury Services proposal review — call transcript', date: '2026-11-15', body: '' }, contacts: [],
  gong: { sentiment: 'Negative', trend: 'Declining', topics: [], actionItems: 3, nextCall: '2027-01-04', rm: 'Allen Carter' },
};
const draft = {
  summary: 'Pricing pushback.', tasks: [{ subject: 'Send revised pricing', dueDate: '2026-11-22' }],
  email: { to: 'd@x.com', contactId: 'c1', subject: 'Follow-up', body: 'Hi' }, kycGaps: ['Formation documents'], source: 'composed',
};

beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); api.fetchAfterCallContext.mockResolvedValue(ctx); });

it('shows the call signals, drafts, approves and then reloads from CRM', async () => {
  api.draftAfterCall.mockResolvedValue(draft);
  api.approveAfterCall.mockResolvedValue(6);
  const user = userEvent.setup();
  render(<AfterCall accountId="001" />);
  expect(await screen.findByText('Sentiment negative')).toBeTruthy();
  expect(screen.getByText('3 action items')).toBeTruthy();
  expect(screen.getByText('KYC Expired')).toBeTruthy();
  expect(screen.getByText('PEP hit')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Draft follow-ups' }));
  expect(await screen.findByLabelText('Call summary')).toHaveProperty('value', 'Pricing pushback.');
  await user.click(screen.getByRole('button', { name: 'Approve' }));
  expect(await screen.findByText('Saved 6 records to Salesforce')).toBeTruthy();
  expect(screen.getByText('Task · Send revised pricing')).toBeTruthy();
  expect(screen.getByText('Email logged · Follow-up')).toBeTruthy();
  expect(screen.getByText('Call summary — Treasury Services proposal review')).toBeTruthy();
  expect(screen.getByText('KYC status · Expired → Required')).toBeTruthy();
  expect(api.approveAfterCall).toHaveBeenCalledWith(ctx, draft);
  await waitFor(() => expect(api.fetchAfterCallContext).toHaveBeenCalledTimes(2));
});

it('keeps the draft and reports the error when a write fails', async () => {
  api.draftAfterCall.mockResolvedValue(draft);
  api.approveAfterCall.mockRejectedValue(new Error('1 of 6 writes failed: boom'));
  const user = userEvent.setup();
  render(<AfterCall accountId="001" />);
  await user.click(await screen.findByRole('button', { name: 'Draft follow-ups' }));
  await user.click(await screen.findByRole('button', { name: 'Approve' }));
  expect((await screen.findByRole('alert')).textContent).toContain('boom');
  expect(screen.getByLabelText('Call summary')).toBeTruthy();
});

it('states plainly when no transcript is recorded', async () => {
  api.fetchAfterCallContext.mockResolvedValue({ ...ctx, note: null });
  render(<AfterCall accountId="001" />);
  expect(await screen.findByText('No call transcript has been recorded for this company.')).toBeTruthy();
});

it('shows the KYC status and latest notes read from CRM', async () => {
  api.fetchCallRecord.mockResolvedValue({ kycStatus: 'Required', kycSummary: '• Formation documents', notes: [{ id: 'n1', title: 'Call summary — Treasury', date: '2026-11-21', body: 'Pricing pushback.' }] });
  render(<CallRecord accountId="001" />);
  expect(await screen.findByText(/KYC status/)).toBeTruthy();
  expect(screen.getByText('Required', { exact: false })).toBeTruthy();
  expect(screen.getByText('Call summary — Treasury')).toBeTruthy();
});
