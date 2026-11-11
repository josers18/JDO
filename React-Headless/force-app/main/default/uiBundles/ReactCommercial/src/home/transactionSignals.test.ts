import { describe, expect, it } from 'vitest';
import { feeSpikeQueueItems, inflowQueueItems, type FeeSpike, type LargeInflow, type TxSignalResult } from '@shared';

// Real ssot__FinancialAccountTransaction__dlm rows pulled 2026-11-11: Allen Carter's
// book for the ACH receipts and business fee spikes, Jose Sifontes' book for the
// household roll-up (member fees reported against the household).
const oneillHenry: LargeInflow = {
  accountId: '001am00002AYRlsAAH', amount: 650750.28, kind: 'Customer receipt', date: '2026-11-04', payer: 'Globex Inc',
};
const aguilarKent: LargeInflow = {
  accountId: '001am00002A9jmYAAR', amount: 310805.15, kind: 'Customer receipt', date: '2026-11-11', payer: 'Stark Supply',
};
const coxDavis: FeeSpike = { accountId: '001am00002AYRk3AAH', fees: 9, feeTotal: 527, lastFee: '2026-11-02', household: false };
const oliverLeonard: FeeSpike = { accountId: '001am00002AYRm2AAH', fees: 5, feeTotal: 297, lastFee: '2026-11-01', household: false };
const hammond: FeeSpike = { accountId: '001am00002AYOaZAAX', fees: 6, feeTotal: 210, lastFee: '2026-10-21', household: true };

const names = {
  '001am00002AYRlsAAH': 'Oneill-Henry Industries',
  '001am00002A9jmYAAR': 'Aguilar-Kent Holdings',
  '001am00002AYRk3AAH': 'Cox-Davis Holdings',
  '001am00002AYRm2AAH': 'Oliver-Leonard Industries',
  '001am00002AYOaZAAX': 'Hammond Household',
};
const now = new Date('2026-11-11T18:00:00Z');
const receiptOpts = { segment: 'Commercial', action: 'Excess-cash conversation — sweep / money market', idPrefix: 'rx', now };
const tx = <T,>(rows: T[], scope: 'book' | 'org' = 'book'): TxSignalResult<T> => ({ rows, scope });

describe('inflowQueueItems (S5 business receipts)', () => {
  it('names the payer and the amount, and carries the receipt as relationship value', () => {
    const [item] = inflowQueueItems(tx([oneillHenry]), names, receiptOpts);
    expect(item).toMatchObject({
      id: 'rx0',
      clientId: '001am00002AYRlsAAH',
      clientName: 'Oneill-Henry Industries',
      segment: 'Commercial',
      reason: '$650.8K ACH receipt from Globex Inc on 2026-11-04',
      action: 'Excess-cash conversation — sweep / money market',
      score: 0.95,
      severity: 'high',
      source: 'Transactions',
      relationshipValue: 650750.28,
    });
  });

  it('is due two days after the receipt posted, never before today', () => {
    const [older, fresh] = inflowQueueItems(tx([oneillHenry, aguilarKent]), names, receiptOpts);
    expect(older.dueDate).toBe('2026-11-11'); // Nov 4 + 2 is past, so today
    expect(fresh).toMatchObject({ id: 'rx1', reason: '$310.8K ACH receipt from Stark Supply on 2026-11-11', dueDate: '2026-11-13' });
  });

  it('grades severity by amount', () => {
    const sized = (amount: number) => inflowQueueItems(tx([{ ...aguilarKent, amount }]), names, receiptOpts)[0];
    expect(sized(20_000).severity).toBe('high');
    expect(sized(12_500)).toMatchObject({ severity: 'medium', score: 0.625 });
  });

  it('labels an org-wide fallback and falls back to the account id for an unknown name', () => {
    const [item] = inflowQueueItems(tx([oneillHenry], 'org'), {}, receiptOpts);
    expect(item.source).toBe('Transactions · org-wide');
    expect(item.clientName).toBe('001am00002AYRlsAAH');
  });
});

describe('feeSpikeQueueItems (C9)', () => {
  it('turns 6+ business fees into a high, due-today cash-flow check-in', () => {
    const [item] = feeSpikeQueueItems(tx([coxDavis]), names, { segment: 'Commercial', now });
    expect(item).toMatchObject({
      id: 'tx0',
      clientName: 'Cox-Davis Holdings',
      reason: '9 NSF / overdraft / late fees in 30d ($527)',
      action: 'Cash-flow check-in — line of credit / sweep',
      score: 0.95,
      severity: 'high',
      source: 'Transactions',
      relationshipValue: 0,
      dueDate: '2026-11-11',
    });
  });

  it('keeps 3–5 fees at medium and scores 5 cents per fee', () => {
    const [item] = feeSpikeQueueItems(tx([oliverLeonard]), names, { segment: 'Commercial', now });
    expect(item.severity).toBe('medium');
    expect(item.score).toBeCloseTo(0.8);
    expect(item.reason).toBe('5 NSF / overdraft / late fees in 30d ($297)');
  });

  it('gives a household roll-up the budgeting ask, not a credit line', () => {
    const [item] = feeSpikeQueueItems(tx([hammond]), names, { segment: 'Commercial', now });
    expect(item).toMatchObject({
      clientName: 'Hammond Household',
      reason: '6 NSF / overdraft / late fees in 30d ($210)',
      action: 'Household check-in — overdraft protection / budgeting',
      severity: 'high',
    });
  });
});
