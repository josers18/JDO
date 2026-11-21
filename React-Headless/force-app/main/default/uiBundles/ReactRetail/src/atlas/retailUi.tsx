import { AtlasActionReview } from '@shared/components/atlas/AtlasActionReview';
import { useToast } from '@shared/components/Toast';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Modal } from '@shared/components/Modal';
import { publishWorkspaceDrafts } from '@shared/components/atlas/atlasDrafts';
import { Icon } from '@shared/components/iconMap';
import { TaskModal } from '@shared/components/home/TaskModal';
import { EmailModal } from '@shared/components/home/EmailModal';
import { Button } from '@shared/components/Button';
import { Field, TextArea, TextInput } from '@shared/components/home/fields';
import { ScheduleModal } from '@shared/components/home/ScheduleModal';
import { CaseModal } from '@shared/components/home/CaseModal';
import { LeadModal } from '@shared/components/home/LeadModal';
import { PrepModal } from '@shared/components/home/PrepModal';
import { CustomerGoalModal } from '@shared/components/home/CustomerGoalModal';
import { useCrmAction } from '@shared/components/home/useCrmAction';
import { LifeEventModal } from '@shared/components/home/LifeEventModal';
import { lexRecordUrl } from '@shared/data/orgEnv';
import { accountId, field, label, numeric, readBook, relation, type BookNode, type ObjectName, type Row } from './retailData';
import type { PromptFlow } from '@shared/data/promptClient';
import { readWorkspaceState, workspaceStateKey, writeWorkspaceState, type Draft } from './retailWorkspaceState';
export type { Draft } from './retailWorkspaceState';

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
export const money = (n: unknown) => numeric(n) == null ? '—' : moneyFormat.format(Number(n));
export const compact = (n: unknown) => numeric(n) == null ? '—' : compactFormat.format(Number(n));
export const count = (n: unknown) => numeric(n) == null ? '—' : Number(n).toLocaleString();
export const text = (n: unknown, fallback = '—') => typeof n === 'string' && n ? n : numeric(n) != null ? String(n) : fallback;
const formatDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function date(value: unknown) {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  const dt = new Date(day + 'T12:00:00Z');
  return Number.isNaN(dt.getTime()) ? '—' : formatDate.format(dt);
}
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');

type Source<T> = { data: T | null; loading: boolean; error: string | null; retry: () => void };
export function useSource<T>(key: string, read: () => Promise<T>): Source<T> {
  const [stored, setStored] = useState<{ key: string; attempt: number; data: T | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(value => value + 1);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(read).then(
      data => { if (!cancelled) setStored({ key, attempt, data, error: null }); },
      error => {
        if (!cancelled) setStored(previous => ({
          key,
          attempt,
          data: previous?.key === key ? previous.data : null,
          error: error instanceof Error ? error.message : 'Source request failed.',
        }));
      },
    );
    return () => { cancelled = true; };
    // The key captures all semantic inputs to this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = stored?.key === key ? stored : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current?.attempt !== attempt, retry };
}

export function SourceNotice({ source, empty, warning }: { source: Source<unknown>; empty?: boolean; warning?: string | null }) {
  if (source.error) return <div className="source-note atlas-retail-source" role="alert">
    {source.data == null ? 'Source unavailable.' : 'Showing the last successful results.'} {source.error}
    <button className="text-button" type="button" onClick={source.retry}>Retry</button>
  </div>;
  if (source.loading) return <p className="source-note atlas-retail-source" role="status">{source.data == null ? 'Loading source records…' : 'Refreshing source records…'}</p>;
  if (warning) return <p className="source-note atlas-retail-source" role="status">{warning}</p>;
  if (empty) return <p className="source-note atlas-retail-source">No records match this view.</p>;
  return null;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  function update(patch: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next, { replace, preventScrollReset: true });
  }
  function choice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
    return choices.find(choice => choice === params.get(key)) ?? fallback;
  }
  return { params, update, choice };
}

export function useCrmList(root: ObjectName, ownerId: string, options: Parameters<typeof readBook>[2] = {}) {
  return useSource(JSON.stringify([root, ownerId, options]), () => readBook(root, ownerId, options));
}

export function Header({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  const { ownerName } = useWorkspace();
  return <header className="page-heading">
    <div><p className="scope-line">{ownerName ? `${ownerName} · ` : ''}Retail banking</p><h1>{title}</h1><p>{description}</p></div>
    {children && <div className="heading-actions">{children}</div>}
  </header>;
}
export function Title({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="rv-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</header>;
}
export function Choices({ items, selected, update, className = 'rw-switches', label: ariaLabel = 'View filter' }: {
  items: readonly (readonly [string, string])[]; selected: string; update: (value: string) => void; className?: string; label?: string;
}) {
  return <div className={className} role="group" aria-label={ariaLabel}>
    {items.map(([value, name]) => <button type="button" key={value} aria-pressed={selected === value} onClick={() => update(value)}>{name}</button>)}
  </div>;
}
export function Facts({ values }: { values: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="atlas-retail-facts">{values.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

export function AccountLink({ id, children = 'Open 360', className = 'secondary' }: { id: string; children?: ReactNode; className?: string }) {
  const location = useLocation();
  if (!accountId.test(id)) return null;
  const query = new URLSearchParams({ returnTo: location.pathname + location.search });
  return <Link className={className} to={`/client/${id}?${query}`}>{children}</Link>;
}
export function RecordLink({ object, id, title }: { object: ObjectName; id: string; title?: string }) {
  const url = lexRecordUrl(object, id);
  return url ? <a className="secondary" href={url} target="_blank" rel="noreferrer">{title ?? 'Open Salesforce record'}</a> : null;
}

type Action =
  | { kind: 'prep' | 'task' | 'meeting' | 'email' | 'case'; id?: string; name: string; context?: string; subject?: string; day?: string; promptFlow?: PromptFlow; whoId?: string; onSaved?: () => void }
  | { kind: 'lead' | 'goal' | 'life'; row?: BookNode; onSaved?: () => void; leadDefaults?: { lastName: string; firstName?: string } }
  | { kind: 'leadEmail'; row: BookNode; note: string }
  | { kind: 'detail'; title: string; children: ReactNode };
type Context = { ownerName?: string; pins: string[]; togglePin: (id: string) => void; open: (action: Action) => void; drafts: Draft[]; saveDraft: (draft: Draft) => void; removeDraft: (id: string) => void };
const RetailContext = createContext<Context | null>(null);
export function useWorkspace() {
  const context = useContext(RetailContext);
  if (!context) throw new Error('Retail Atlas workspace context is missing.');
  return context;
}

export function RetailActions({ children, actor, owner, ownerName }: { children: ReactNode; actor?: string; owner: string; ownerName?: string }) {
  const [action, setAction] = useState<Action | null>(null);
  const key = workspaceStateKey(actor, owner);
  const [state, setState] = useState(() => readWorkspaceState(key, owner));
  const { drafts, pins } = state;
  const togglePin = (id: string) => {
    if (!accountId.test(id)) return;
    setState(state => ({ ...state, pins: state.pins.includes(id) ? state.pins.filter(value => value !== id) : [...state.pins, id] }));
  };
  useEffect(() => writeWorkspaceState(key, state), [key, state]);
  useEffect(() => {
    if (actor && owner) publishWorkspaceDrafts('retail', actor, owner, drafts);
  }, [actor, owner, drafts]);
  const close = () => setAction(null);
  const saveDraft = (draft: Draft) => setState(state => ({ ...state, drafts: [...state.drafts.filter(value => value.id !== draft.id), draft] }));
  const removeDraft = (id: string) => setState(state => ({ ...state, drafts: state.drafts.filter(value => value.id !== id) }));
  return <RetailContext.Provider value={{ open: setAction, drafts, saveDraft, removeDraft, ownerName, pins, togglePin }}>
    {children}
    {action && <ActionDialog action={action} ownerId={owner} close={close} open={setAction} />}
  </RetailContext.Provider>;
}

export function relationship(row?: Row) {
  const target = relation(row, 'Account') ?? relation(relation(row, 'FinancialPlan'), 'Account')
    ?? relation(relation(row, 'PrimaryPerson'), 'Account');
  const link = target?.Id ?? field(row, 'WhatId');
  return { id: typeof link === 'string' && accountId.test(link) ? link : '', name: label(target, 'Name', '') };
}

function ActionDialog({ action, ownerId, close, open }: { action: Action; ownerId: string; close: () => void; open: (action: Action) => void }) {
  if (action.kind === 'detail') return <Modal open onClose={close} title={action.title}>{action.children}</Modal>;
  if (action.kind === 'leadEmail') return <LeadEmailDraft ownerId={ownerId} key={action.row.Id} row={action.row} note={action.note} close={close} />;
  if (action.kind === 'lead') {
    const r = action.row;
    return <LeadModal open onClose={close} lead={r ? {
      recordId: r.Id, firstName: label(r, 'FirstName', ''), lastName: label(r, 'LastName', ''),
      company: label(r, 'Company', ''), status: label(r, 'Status', ''), leadSource: label(r, 'LeadSource', ''),
      email: label(r, 'Email', ''), annualRevenue: numeric(field(r, 'AnnualRevenue')) ?? undefined,
    } : { create: true, ...action.leadDefaults }} onSaved={action.onSaved} />;
  }
  if (action.kind === 'goal') {
    const r = action.row;
    return <CustomerGoalModal open onClose={close} ownerId={ownerId} goal={r ? {
      recordId: r.Id, name: label(r, 'Name'), clientName: relationship(r).name, planName: label(relation(r, 'FinancialPlan'), 'Name', ''),
      status: label(r, 'Status', ''), priority: label(r, 'Priority', ''), type: label(r, 'Type', ''), description: label(r, 'Description', ''),
      targetDate: label(r, 'TargetDate', '').slice(0, 10), target: numeric(field(r, 'TargetAmount')) ?? undefined,
      current: numeric(field(r, 'ActualAmount')) ?? undefined,
    } : { create: true, name: '' }} onSaved={action.onSaved} />;
  }
  if (action.kind === 'life') {
    const r = action.row;
    return <LifeEventModal open onClose={close} ownerId={ownerId} event={r ? {
      recordId: r.Id, name: label(r, 'Name'), eventType: label(r, 'EventType', ''), clientName: relationship(r).name,
      eventDate: label(r, 'EventDate', '').slice(0, 10), contactId: label(r, 'PrimaryPersonId', ''),
    } : { create: true, name: '' }} onSaved={action.onSaved} />;
  }
  if (!('name' in action)) return null;
  const props = { open: true, onClose: close, clientId: action.id, clientName: action.name };
  if (action.kind === 'prep') return <PrepModal {...props} profile={{ recap: action.context }} promptFlow={action.promptFlow}
    onSchedule={() => open({ ...action, kind: 'meeting' })}
    onMakeTask={subject => open({ ...action, kind: 'task', subject })} />;
  if (action.kind === 'task' && action.whoId) return <CustomerTask action={action} close={close} />;
  if (action.kind === 'task') return <TaskModal {...props} subjectDefault={action.subject} commentsDefault={action.context} onSaved={action.onSaved} />;
  if (action.kind === 'meeting') return action.day || action.whoId ? <BookedMeeting day={action.day ?? new Date().toLocaleDateString('en-CA')} action={action} close={close} /> :
    <ScheduleModal {...props} subjectDefault={action.subject} onSaved={action.onSaved} />;
  if (action.kind === 'email') return <EmailModal {...props} promptFlow={action.promptFlow} />;
  return <CaseModal {...props} subjectDefault={action.subject} />;
}

function LeadEmailDraft({ row, note, close, ownerId }: { ownerId: string; row: BookNode; note: string; close: () => void }) {
  const { drafts, saveDraft, removeDraft } = useWorkspace();
  const id = `lead-email:${row.Id}`;
  const existing = drafts.find(draft => draft.id === id);
  const [requestId] = useState(() => existing?.requestId || crypto.randomUUID());
  const { toast } = useToast();
  const name = label(row, 'Name');
  const recipient = label(row, 'Email', '');
  const [subject, setSubject] = useState(existing?.title ?? `Following up with ${label(row, 'Company', name)}`);
  const [body, setBody] = useState(existing?.note ?? note);

  return <Modal open onClose={close} title="Draft email" subtitle={name}>
    <form onSubmit={event => {
      event.preventDefault();
      if (!subject.trim()) return;
      saveDraft({ id, kind: 'Email', title: subject.trim(), note: body, readiness: existing?.readiness ?? 'Working', recordId: row.Id, recipient, requestId });
      close();
    }}>
      <Facts values={[[ 'Recipient from Lead', recipient || 'No email recorded' ]]} />
      <Field label="Subject"><TextInput required value={subject} onChange={event => setSubject(event.target.value)} /></Field>
      <Field label="Body"><TextArea value={body} onChange={event => setBody(event.target.value)} /></Field>
      <p className="source-note">Keep the unsent draft in this tab’s Workbench.</p>
      <Button variant="accent" type="submit">Keep email draft</Button>
    </form>
    {recipient && <AtlasActionReview lead={{id:row.Id,email:recipient}} ownerId={ownerId} name={name} subject={subject} note={body} requestId={requestId}
      onReviewSubmit={(title,note) => saveDraft({id,kind:'Email',title,note,recordId:row.Id,recipient,requestId,readiness:'Review'})}
      onSaved={() => { removeDraft(id); toast('Email accepted by Salesforce', name); close(); }} />}
  </Modal>;
}

function CustomerTask({ action, close }: { action: Extract<Action, { name: string }>; close: () => void }) {
  const [subject, setSubject] = useState(action.subject ?? `Follow up — ${action.name}`);
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [description, setDescription] = useState(action.context ?? '');
  const { submit, error, loading } = useCrmAction(() => { action.onSaved?.(); close(); });
  return <Modal open onClose={close} title="Create follow-up task" subtitle={action.name}>
    <form className="atlas-retail-prep" onSubmit={event => {
      event.preventDefault();
      if (!subject.trim()) return;
      void submit({ action: 'task', subject, description, priority, dueDate: date || undefined, whatId: action.id, whoId: action.whoId }, 'Task created', subject);
    }}>
      <label>Subject<input required value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label>Due date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}><option>Normal</option><option>High</option><option>Low</option></select></label>
      <label>Comments<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
      <button className="primary" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create task in Salesforce'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </Modal>;
}

function BookedMeeting({ day, action, close }: { day: string; action: Extract<Action, { name: string }>; close: () => void }) {
  const [subject, setSubject] = useState('');
  const [start, setStart] = useState(`${day}T09:00`);
  const [duration, setDuration] = useState(30);
  const [description, setDescription] = useState('');
  const { submit, error, loading } = useCrmAction(() => { action.onSaved?.(); close(); });
  return <Modal open onClose={close} title="Schedule meeting">
    <form className="atlas-retail-prep" onSubmit={event => {
      event.preventDefault();
      const activityDateTime = new Date(start);
      if (!subject.trim() || Number.isNaN(activityDateTime.getTime()) || duration <= 0) return;
      void submit({ action: 'event', subject, description, whatId: action.id, whoId: action.whoId, activityDateTime: activityDateTime.toISOString(), durationMinutes: duration }, 'Meeting scheduled', subject);
    }}>
      <label>Subject<input required value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label>Start ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Duration in minutes<input required type="number" min={1} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
      <label>Agenda<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
      <button className="primary" type="submit" disabled={loading}>{loading ? 'Scheduling…' : 'Schedule in Salesforce'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </Modal>;
}

export function Search({ value, change, title, placeholder }: { value: string; change: (value: string) => void; title: string; placeholder?: string }) {
  return <label>{title}<input type="search" value={value} aria-label={title} placeholder={placeholder} autoComplete="off" onChange={event => change(event.target.value)} /></label>;
}

export function Paging({ total, shown, offset = 0, previous, next, className = 'rv-pager' }: { className?: string; total: number; shown: number; offset?: number; previous?: () => void; next?: () => void }) {
  return <div className={`atlas-retail-pagination ${className}`}>
    <span>{shown ? `${count(offset + 1)}–${count(offset + shown)}` : '0'} of {count(total)}</span>
    <button className="secondary" type="button" disabled={!previous} onClick={previous}>Previous</button>
    <button className="secondary" type="button" disabled={!next} onClick={next}>Next</button>
  </div>;
}

export function CardIcon({ name }: { name: 'clients' | 'lifeEvent' | 'tasks' | 'goal' | 'sparkle' | 'alerts' }) {
  return <Icon name={name} size={20} />;
}

export function SourcePeriod({ date: period, source }: { date?: unknown; source: string }) {
  return <small className="rw-recency">{source}{period ? ` · ${date(period)}` : ''}</small>;
}
