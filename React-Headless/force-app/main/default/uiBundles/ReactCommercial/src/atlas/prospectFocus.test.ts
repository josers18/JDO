import { describe, expect, it } from 'vitest';
import { prospectFocus } from './signals';
import { sourceText } from './drafts';

const hero = {
  champion: { contactName: 'Elizabeth Smith', fromAccountId: '001am00002AYRj0AAH', opportunityScore: 98, newTitle: 'CFO', detectedDate: '2026-11-08' },
  intent: { topic: 'Equipment Finance', score: 94, stage: 'Purchase', researchers: 6, signalDate: '2026-11-22' },
  funding: { stage: 'Series B', roundUsd: 48_000_000 },
} as never;

describe('prospectFocus', () => {
  it('leads with the champion and names every source', () => {
    const { focus, evidence } = prospectFocus('001am00002KsgljAAB', 'Northgate Point Group', hero, 'Sandoval-Jordan Industries');
    expect(focus?.title).toBe('Call Elizabeth Smith, new CFO');
    expect(focus?.detail).toContain('Former champion at Sandoval-Jordan Industries');
    expect(focus?.detail).toContain('Equipment Finance intent 94');
    expect(focus?.source).toBe('UserGems · Demandbase · Harmonic');
    expect(evidence.map(e => e.title)).toEqual(['Elizabeth Smith joined as CFO', 'Equipment Finance intent']);
    expect(evidence[1].detail).toBe('Purchase stage · 94 intent score');
    expect(evidence[0].date).toBe('2026-11-08');
  });
  it('returns nothing without signals', () => {
    expect(prospectFocus('001am00002KsgljAAB', 'X', undefined)).toEqual({ focus: undefined, evidence: [] });
  });
});

describe('sourceText', () => {
  it('drops record ids from a signal reference', () => {
    expect(sourceText(JSON.stringify(['Prospect signals', 'UserGems · Demandbase', '001am00002KsgljAAB']))).toBe('Prospect signals · UserGems · Demandbase');
  });
  it('keeps a plain reference', () => { expect(sourceText('priority:abc')).toBe('priority:abc'); });
});
