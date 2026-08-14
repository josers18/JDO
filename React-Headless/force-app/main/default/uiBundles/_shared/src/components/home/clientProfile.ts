import type { ClientSelection, WorkspaceFact } from './WorkspacePanel';
import type { ClientProfile, ClientSignal } from './types';

/** Pull a fact's value out of a panel fact grid as a plain string (facts carry
 *  ReactNode values; the client builders always set these as strings). '—'
 *  placeholders collapse to undefined so the modal's own fallback applies. */
function factValue(facts: WorkspaceFact[], label: string): string | undefined {
  const f = facts.find(x => x.label === label);
  const v = typeof f?.value === 'string' ? f.value : undefined;
  return v && v !== '—' ? v : undefined;
}

/**
 * Map a WorkspacePanel `ClientSelection` (the instant-then-enriched payload the
 * page already builds for the right context panel) onto the `ClientProfile`
 * shape the Prep sheet and 360 quick-view modals render. This lets the modals
 * reuse the exact same phase-1 (in-memory) → phase-2 (live Customer 360) data
 * the panel uses, instead of rendering empty '—' stat tiles.
 *
 * The stat tiles (CSAT / Value / Open cases), the descriptor/tier chip, initials
 * and the rich 360 fields are all carried across; the AI recap is driven by each
 * modal's own runPromptFlow enrichment, so `recap` here only seeds the initial
 * text before that lands.
 */
export function selectionToProfile(sel: ClientSelection): ClientProfile {
  const csat = factValue(sel.facts, 'CSAT');
  const value = sel.relationshipValue ?? factValue(sel.facts, 'Value');
  const openCases = factValue(sel.facts, 'Open cases');
  const descriptor = sel.tier ?? sel.subtitle;

  const signals: ClientSignal[] = sel.signalRows
    ? sel.signalRows.map(s => ({ label: s.label, when: s.when, tone: s.tone }))
    : sel.signals.map(s => ({
        label: s.label,
        when: s.meta ?? s.sub ?? '',
        tone: 'neutral' as const,
      }));

  return {
    initials: sel.initials,
    descriptor,
    csat,
    value,
    openCases,
    // Prep sheet fact grid ([label, value] pairs) — mirrors the tile trio plus
    // the segment/tier line, so the sheet shows the same live numbers.
    facts: [
      ['Segment', descriptor ?? '—'],
      ['CSAT', csat ?? '—'],
      ['Value', value ?? '—'],
      ['Open cases', openCases ?? '—'],
    ],
    recap: sel.summary,
    nba: sel.nba.length ? sel.nba : undefined,
    healthScore: sel.healthScore,
    healthLabel: sel.healthLabel,
    healthDeltaPts: sel.healthDeltaPts,
    tier: sel.tier,
    priorityLabel: sel.priorityLabel,
    valueDeltaPct: sel.valueDeltaPct,
    signals: signals.length ? signals : undefined,
    nbaHeadline: sel.nbaHeadline,
    timeline: sel.timeline?.map(t => ({
      when: t.when,
      title: t.title,
      detail: t.detail,
      tone: t.tone,
    })),
  };
}
