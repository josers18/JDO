import { describe, expect, it } from 'vitest';
import { championQueueItems, type JobChangeResult, type JobChangeRow } from '@shared';

// Real UserGems departures from the last 30 days (BT_UserGems_Job_Changes__dlm, 2026-11-10).
const row = (over: Partial<JobChangeRow>): JobChangeRow => ({
  accountId: '', employerId: '', newEmployerId: null, newEmployerName: null, contactName: '', title: '',
  persona: '', wasChampion: true, riskScore: null, opportunityScore: null, detectedDate: '', ...over,
});
const sandoval = row({
  accountId: '001am00002AYRj0AAH', employerId: '001am00002AYRj0AAH', contactName: 'Elizabeth Smith', title: 'CFO',
  newEmployerName: 'Northgate Point Group', riskScore: 96, detectedDate: '2026-11-08',
});
const moore = row({
  accountId: '001am00002A9jJdAAJ', employerId: '001am00002A9jJdAAJ', contactName: "Chen O'Connor", title: 'Managing Partner',
  newEmployerId: '001am00002AAAvwAAH', newEmployerName: 'Meyers Group Shop', riskScore: 92, detectedDate: '2026-10-23',
});
const melendez = row({
  accountId: '001am00002AAAmpAAH', employerId: '001am00002AAAmpAAH', contactName: 'Jennifer Khan', title: 'Office Manager',
  wasChampion: false, newEmployerName: 'Silverline Valley Capital', riskScore: 30, detectedDate: '2026-10-13',
});
const names = {
  '001am00002AYRj0AAH': 'Sandoval-Jordan Industries',
  '001am00002A9jJdAAJ': 'Moore Outlet',
  '001am00002AAAmpAAH': 'Melendez LLC Medical',
  '001am00002AAAvwAAH': 'Meyers Group Shop (CRM)',
};
const result = (rows: JobChangeRow[], scope: JobChangeResult['scope'] = 'book'): JobChangeResult => ({ rows, total: rows.length, scope });
const opts = { segment: 'Commercial', now: new Date('2026-11-10T17:00:00Z') };

describe('championQueueItems', () => {
  it('turns a departed champion into a re-establish call a week after detection', () => {
    const [item] = championQueueItems(result([sandoval]), names, opts);
    expect(item).toMatchObject({
      id: 'ug0',
      clientId: '001am00002AYRj0AAH',
      clientName: 'Sandoval-Jordan Industries',
      segment: 'Commercial',
      reason: 'Champion Elizabeth Smith (CFO) left · now at Northgate Point Group',
      action: 'Re-establish the relationship',
      severity: 'high',
      source: 'UserGems job change',
      dueDate: '2026-11-15',
      reserveSlot: true,
    });
    expect(item.score).toBeCloseTo(0.82);
  });

  it('names the new employer from CRM when it is an account, and never dates before today', () => {
    const [item] = championQueueItems(result([moore]), names, opts);
    expect(item.reason).toBe("Champion Chen O'Connor (Managing Partner) left · now at Meyers Group Shop (CRM)");
    expect(item.dueDate).toBe('2026-11-10');
    expect(item.score).toBeCloseTo(0.8067, 3);
  });

  it('labels a primary contact and grades risk below 70 as medium', () => {
    const [item] = championQueueItems(result([melendez]), names, opts);
    expect(item.reason).toBe('Primary contact Jennifer Khan (Office Manager) left · now at Silverline Valley Capital');
    expect(item.severity).toBe('medium');
    expect(item.score).toBeCloseTo(0.6);
  });

  it('handles a missing risk score, title and new employer', () => {
    const bare = { ...sandoval, title: '', newEmployerName: null, riskScore: null };
    const [item] = championQueueItems(result([bare], 'org'), {}, opts);
    expect(item.reason).toBe('Champion Elizabeth Smith left');
    expect(item.score).toBe(0.5);
    expect(item.severity).toBe('medium');
    expect(item.source).toBe('UserGems job change · org-wide');
    expect(item.clientName).toBe('001am00002AYRj0AAH');
  });
});
