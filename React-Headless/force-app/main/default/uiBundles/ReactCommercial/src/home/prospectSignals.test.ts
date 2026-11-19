import { describe, expect, it } from 'vitest';
import { prospectBadges, prospectScore, rankProspectLeads, type ProspectSignalMap } from '@shared';

// Seeded Identify & Acquire prospects (Demo_Seeds/acquire_prospects, 2026-11-19).
const HERO = '001am00002KsgljAAB';
const CRESCENT = '001am00002KsniPAAR';
const signals: ProspectSignalMap = {
  [HERO]: {
    champion: { contactName: 'Elizabeth Smith', fromAccountId: '001am00002AYRj0AAH', opportunityScore: 98 },
    intent: { topic: 'Equipment Finance', score: 94, stage: 'Purchase', researchers: 7 },
    funding: { stage: 'Series B', roundUsd: 48_000_000 },
  },
  [CRESCENT]: { champion: { contactName: 'Aisha Kim', fromAccountId: '001x', opportunityScore: 70 } },
};
const names = { '001am00002AYRj0AAH': 'Harborview Logistics' };

describe('prospectBadges', () => {
  it('lists champion, intent and funding chips, strongest first', () => {
    expect(prospectBadges(signals[HERO], names)).toEqual([
      'Champion joined from Harborview Logistics',
      'Intent 94 · Equipment Finance',
      'Raised $48M Series B',
    ]);
  });

  it('drops the "from" when the former employer name is unknown', () => {
    expect(prospectBadges(signals[CRESCENT])).toEqual(['Champion joined']);
  });

  it('is empty for an account with no signals', () => {
    expect(prospectBadges(undefined)).toEqual([]);
  });
});

describe('prospectScore', () => {
  it('adds champion opportunity, intent score and a flat 25 for funding', () => {
    expect(prospectScore(signals[HERO])).toBe(98 + 94 + 25);
    expect(prospectScore(undefined)).toBe(0);
  });
});

describe('rankProspectLeads', () => {
  const leads = [
    { id: 'a', name: 'Unlinked lead' },
    { id: 'b', name: 'Crescent', accountId: CRESCENT },
    { id: 'c', name: 'Quiet prospect', accountId: '001none' },
    { id: 'd', name: 'Northgate', accountId: HERO },
  ];

  it('puts signalled leads first by score and keeps the rest in CRM order', () => {
    expect(rankProspectLeads(leads, signals, names).map(l => l.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('attaches badges and score to each lead', () => {
    const [top, , unlinked] = rankProspectLeads(leads, signals, names);
    expect(top.signals).toHaveLength(3);
    expect(top.signalScore).toBe(217);
    expect(unlinked).toMatchObject({ signals: [], signalScore: 0 });
  });
});
