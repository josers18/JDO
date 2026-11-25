import { WHITESPACE_LEAD_SOURCE } from '@shared/data/whitespace';
import { accountId } from './retailData';

const draftKinds = ['Task', 'Preparation', 'Meeting', 'Email', 'Case', 'Lead', 'Opportunity'] as const;
const readinessLevels = ['Working', 'Review', 'Ready'] as const;
const recordIdPattern = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const leadIdPattern = /^00Q[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;

type OpportunityDraftPayload = {
  action: 'opportunity';
  accountId: string;
  ownerId: string;
  name: string;
  leadSource: typeof WHITESPACE_LEAD_SOURCE;
  amount?: number;
  description?: string;
};

export type Draft = {
  id: string;
  kind: typeof draftKinds[number];
  title: string;
  note: string;
  readiness: typeof readinessLevels[number];
  account?: { id: string; name: string };
  recordId?: string;
  payload?: OpportunityDraftPayload;
  product?: string;
  checklist?: readonly string[];
  recipient?: string;
  requestId?: string;
  meetingAt?: string;
  meetingRelationship?: string;
};

type WorkspaceState = { drafts: Draft[]; pins: string[] };
const fallback = new Map<string, WorkspaceState>();

export function workspaceStateKey(actor: string | undefined, owner: string) {
  return actor && owner ? `cumulus.atlas.retail.workspace.v1.${JSON.stringify([actor, owner])}` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreDraft(value: unknown, owner: string): Draft | null {
  if (!isRecord(value)) return null;
  const { id, title, note, account, recordId, payload, product, checklist, recipient } = value;
  const kind = draftKinds.find(kind => kind === value.kind);
  const readiness = readinessLevels.find(level => level === value.readiness);
  if (typeof id !== 'string' || !id || typeof title !== 'string' || typeof note !== 'string' || !kind || !readiness) return null;

  const draft: Draft = { id, title, note, kind, readiness };
  if (isRecord(account) && typeof account.id === 'string' && accountId.test(account.id) && typeof account.name === 'string') {
    draft.account = { id: account.id, name: account.name };
  }
  if (typeof recordId === 'string' && recordIdPattern.test(recordId)) draft.recordId = recordId;
  if (typeof product === 'string') draft.product = product;
  if (kind === 'Meeting' && typeof value.meetingAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.meetingAt) &&
      Number.isFinite(Date.parse(value.meetingAt))) draft.meetingAt = value.meetingAt;
  if (kind === 'Meeting' && typeof value.meetingRelationship === 'string') draft.meetingRelationship = value.meetingRelationship;
  if (Array.isArray(checklist)) draft.checklist = checklist.filter((item: unknown): item is string => typeof item === 'string');
  if (kind === 'Email') {
    if (typeof recordId !== 'string' || !leadIdPattern.test(recordId) || id !== `lead-email:${recordId}` || typeof recipient !== 'string') return null;
    draft.recipient = recipient;
    if (typeof value.requestId === "string") draft.requestId = value.requestId;
  }
  // The only stored proposal that can be submitted is an opportunity for the
  // original account in this book. Restore only fields the draft flow uses.
  if (kind === 'Opportunity' && draft.account && draft.product?.trim() && isRecord(payload)
      && payload.action === 'opportunity' && payload.accountId === draft.account.id
      && payload.ownerId === owner && payload.leadSource === WHITESPACE_LEAD_SOURCE
      && typeof payload.name === 'string' && payload.name.trim()
      && typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0) {
    draft.payload = {
      action: 'opportunity', accountId: draft.account.id, ownerId: owner, leadSource: WHITESPACE_LEAD_SOURCE,
      name: payload.name, amount: payload.amount,
    };
  }
  return draft;
}

export function readWorkspaceState(key: string, owner: string): WorkspaceState {
  const empty = { drafts: [], pins: [] };
  if (!key) return empty;
  const pending = fallback.get(key);
  if (pending) return pending;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
    if (!isRecord(parsed)) return empty;
    const drafts = new Map<string, Draft>();
    if (Array.isArray(parsed.drafts)) {
      parsed.drafts.forEach((value: unknown) => {
        const draft = restoreDraft(value, owner);
        if (draft) drafts.set(draft.id, draft);
      });
    }
    const pins = Array.isArray(parsed.pins)
      ? [...new Set(parsed.pins.filter((value: unknown): value is string => typeof value === 'string' && accountId.test(value)))]
      : [];
    return { drafts: [...drafts.values()], pins };
  } catch {
    return empty;
  }
}

export function writeWorkspaceState(key: string, state: WorkspaceState) {
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
    fallback.delete(key);
  } catch {
    fallback.set(key, state);
  }
}
