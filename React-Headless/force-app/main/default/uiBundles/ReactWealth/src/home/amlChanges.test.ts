import { describe, expect, it } from 'vitest';
import { amlChangeQueueItems, type AmlChange, type TxSignalResult } from '@shared';

// Real BT_WorldCheck_AML__dlm escalations in Jose Sifontes' book from the 2026-11-11 run.
const reese: AmlChange = {
  accountId: '001am00002AYOzJAAX', rating: 'High', prevRating: 'Low', pep: false, sanctions: true,
  adverseMedia: false, mediaCategory: '', caseRef: 'WC-2026-35210', jurisdiction: 'AE', screened: '2026-11-11',
};
const jennings: AmlChange = {
  accountId: '001am00002AYORYAA5', rating: 'High', prevRating: 'Medium', pep: true, sanctions: false,
  adverseMedia: true, mediaCategory: 'Fraud', caseRef: 'WC-2026-26458', jurisdiction: 'US', screened: '2026-11-11',
};
const names = { '001am00002AYOzJAAX': 'Reese Household', '001am00002AYORYAA5': 'Jennings Household' };
const opts = { segment: 'Wealth', now: new Date('2026-11-11T18:00:00Z') };
const res = (rows: AmlChange[], scope: 'book' | 'org' = 'book'): TxSignalResult<AmlChange> => ({ rows, scope });

describe('amlChangeQueueItems (S2, Wealth)', () => {
  it('sends an offshore sanctions hit to enhanced due diligence today', () => {
    const [item] = amlChangeQueueItems(res([reese]), names, opts);
    expect(item).toMatchObject({
      id: 'wc0',
      clientName: 'Reese Household',
      segment: 'Wealth',
      reason: 'AML rating Low → High · sanctions · AE · case WC-2026-35210',
      action: 'Compliance review — enhanced due diligence',
      severity: 'high',
      source: 'World-Check screening',
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.91);
  });

  it('lists PEP and adverse media together, without the sanctions bump', () => {
    const [, item] = amlChangeQueueItems(res([reese, jennings]), names, opts);
    expect(item).toMatchObject({
      id: 'wc1',
      clientName: 'Jennings Household',
      reason: 'AML rating Medium → High · PEP, adverse media (Fraud) · US · case WC-2026-26458',
      severity: 'high',
    });
    expect(item.score).toBeCloseTo(0.88);
  });
});
