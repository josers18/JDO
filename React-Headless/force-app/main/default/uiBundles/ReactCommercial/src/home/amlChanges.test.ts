import { describe, expect, it } from 'vitest';
import { amlChangeQueueItems, type AmlChange, type TxSignalResult } from '@shared';

// Real BT_WorldCheck_AML__dlm escalations from the 2026-11-11 run. Terry Builders is in
// Allen Carter's book; Steven Y Morrison's PEP escalation is org-wide. No first
// screening landed High or Severe that day, so the "(new)" case reuses Terry's row.
const terry: AmlChange = {
  accountId: '001am00002AYRgIAAX', rating: 'High', prevRating: 'Medium', pep: false, sanctions: true,
  adverseMedia: true, mediaCategory: 'Sanctions Evasion', caseRef: 'WC-2026-73904', jurisdiction: 'US', screened: '2026-11-11',
};
const morrison: AmlChange = {
  accountId: '001am00002AYQ2SAAX', rating: 'Medium', prevRating: 'Low', pep: true, sanctions: false,
  adverseMedia: false, mediaCategory: '', caseRef: '', jurisdiction: 'US', screened: '2026-11-11',
};
const names = { '001am00002AYRgIAAX': 'Terry Builders', '001am00002AYQ2SAAX': 'Steven Y Morrison' };
const opts = { segment: 'Commercial', now: new Date('2026-11-11T18:00:00Z') };
const res = (rows: AmlChange[], scope: 'book' | 'org' = 'book'): TxSignalResult<AmlChange> => ({ rows, scope });

describe('amlChangeQueueItems (S2)', () => {
  it('sends a High escalation with sanctions and adverse media to enhanced due diligence today', () => {
    const [item] = amlChangeQueueItems(res([terry]), names, opts);
    expect(item).toMatchObject({
      id: 'wc0',
      clientName: 'Terry Builders',
      segment: 'Commercial',
      reason: 'AML rating Medium → High · sanctions, adverse media (Sanctions Evasion) · US · case WC-2026-73904',
      action: 'Compliance review — enhanced due diligence',
      score: 0.91,
      severity: 'high',
      source: 'World-Check screening',
      relationshipValue: 0,
      dueDate: '2026-11-11',
    });
  });

  it('gives a Medium PEP escalation a review due tomorrow', () => {
    const [item] = amlChangeQueueItems(res([morrison], 'org'), names, opts);
    expect(item).toMatchObject({
      clientName: 'Steven Y Morrison',
      reason: 'AML rating Low → Medium · PEP · US',
      action: 'Review screening change',
      score: 0.7,
      severity: 'medium',
      source: 'World-Check screening · org-wide',
      dueDate: '2026-11-12',
    });
  });

  it('marks a first screening as new and scores Severe highest', () => {
    const [item] = amlChangeQueueItems(res([{ ...terry, rating: 'Severe', prevRating: null }]), names, opts);
    expect(item.reason.startsWith('AML rating Severe (new) · ')).toBe(true);
    expect(item.score).toBeCloseTo(0.98);
  });
});
