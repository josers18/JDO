import { useSyncExternalStore } from 'react';
import type { PersonaKey } from '../../theme/themes';

export interface StageDraft {
  id: string;
  recordId: string;
  label: string;
  recorded: string;
  proposed: string;
}
const updated = 'cumulus:atlas-stage-drafts';

function storageKey(persona: PersonaKey, actor: string, owner: string) {
  return `cumulus.atlas.stage-drafts.${persona}.${actor}.${owner}`;
}

function raw(key: string) {
  try { return sessionStorage.getItem(key) ?? '[]'; } catch { return '[]'; }
}

function drafts(source: string): StageDraft[] {
  try {
    const value: unknown = JSON.parse(source);
    if (!Array.isArray(value)) return [];
    return value.filter((draft): draft is StageDraft => draft && typeof draft.id === 'string'
      && /^006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(draft.recordId)
      && typeof draft.label === 'string' && typeof draft.recorded === 'string' && typeof draft.proposed === 'string');
  } catch {
    return [];
  }
}

function persist(key: string, values: StageDraft[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(values));
    window.dispatchEvent(new Event(updated));
    return true;
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(updated, listener);
  return () => window.removeEventListener(updated, listener);
}

export function useStageDrafts(persona: PersonaKey, actor?: string, owner?: string) {
  const key = actor && owner ? storageKey(persona, actor, owner) : '';
  const stored = useSyncExternalStore(subscribe, () => key ? raw(key) : '[]', () => '[]');
  const rows = drafts(stored);
  return {
    rows,
    save: (draft: StageDraft) => !!key && persist(key, [...rows.filter(row => row.id !== draft.id), draft]),
    remove: (id: string) => !!key && persist(key, rows.filter(row => row.id !== id)),
  };
}

interface WorkspaceDraftLabel { id: string; title: string; kind: string }
const draftLabels = new Map<string,string>();

export function publishWorkspaceDrafts(persona: PersonaKey, actor: string, owner: string, rows: WorkspaceDraftLabel[]) {
  if (!actor || !owner) return;
  const key = `cumulus.atlas.proposals.${persona}.${actor}.${owner}`;
  const next = JSON.stringify(rows.map(({id,title,kind})=>({id,title,kind})));
  if (draftLabels.get(key) !== next) {
    draftLabels.set(key,next);
    try { sessionStorage.setItem(`${key}.labels`, next); } catch { /* Labels remain available in this page. */ }
    window.dispatchEvent(new Event(updated));
  }
}

export function useWorkspaceDrafts(persona: PersonaKey, actor?: string, owner?: string) {
  const key = actor && owner ? `cumulus.atlas.proposals.${persona}.${actor}.${owner}` : '';
  const stored = useSyncExternalStore(subscribe, () => key
    ? draftLabels.get(key) ?? (persona === 'retail' ? raw(`${key}.labels`) : raw(key))
    : '[]', () => '[]');
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { id, title, kind } = item as Record<string, unknown>;
      return typeof id === 'string' && typeof title === 'string' && typeof kind === 'string' ? [{id,title,kind}] : [];
    });
  } catch {
    return [];
  }
}
