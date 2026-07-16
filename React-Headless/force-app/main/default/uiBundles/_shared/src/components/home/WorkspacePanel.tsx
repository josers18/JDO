import { type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '../Button';
import { Icon, type IconKey } from '../iconMap';

/* ── Data contract ────────────────────────────────────────────────
   The right context panel is purely presentational: the page builds a
   render-ready payload (it owns the data + CRM wiring) and drops it in.
   Mirrors how DetailModal is driven by a structured slot. All five
   selection shapes plus the default "brief" state live here so the panel
   is the single source of the contract every persona renders against. */

/** A colored key/value tile in a panel fact grid. */
export interface WorkspaceFact {
  label: string;
  value: ReactNode;
  tone?: 'risk' | 'warn' | 'ok' | 'accent';
}

/** A compact list row (a signal, a stakeholder, a focus item). */
export interface WorkspaceListItem {
  label: string;
  sub?: string;
  meta?: string;
}

/** One row in the default-state "today's agenda" list. */
export interface WorkspaceAgendaItem {
  id: string;
  time: string;
  title: string;
  kind: 'call' | 'meeting' | 'task' | 'event';
  client?: string;
}

/** The default (nothing-selected) state: AI brief + pulse + agenda + focus + prompts. */
export interface WorkspaceBrief {
  greeting: string;
  headline: string;
  narrative: string;
  confidencePct: number;
  pulse: WorkspaceFact[];
  agenda: WorkspaceAgendaItem[];
  focus: WorkspaceListItem[];
  prompts: { key: string; label: string }[];
}

export interface ClientSelection {
  kind: 'client';
  id?: string;
  name: string;
  subtitle?: string;
  initials?: string;
  facts: WorkspaceFact[];
  summary: string;
  signals: WorkspaceListItem[];
  nba: string[];
}

export interface TaskSelection {
  kind: 'task';
  title: string;
  client?: string;
  clientId?: string;
  facts: WorkspaceFact[];
  reason?: string;
  steps: string[];
}

export interface OpportunitySelection {
  kind: 'opportunity';
  title: string;
  client?: string;
  clientId?: string;
  facts: WorkspaceFact[];
  signals: WorkspaceListItem[];
  risks?: string;
  nextAction?: string;
}

export interface MeetingSelection {
  kind: 'meeting';
  title: string;
  client?: string;
  clientId?: string;
  facts: WorkspaceFact[];
  agenda: string[];
  talkingPoints: string[];
  questions: string[];
}

export type WorkspaceSelection =
  | { kind: 'none' }
  | ClientSelection
  | TaskSelection
  | OpportunitySelection
  | MeetingSelection;

export type WorkspaceSelectionKind = WorkspaceSelection['kind'];

/** Callbacks the panel raises; the page wires these to its CRM modals / AI flows. */
export interface WorkspacePanelHandlers {
  onClear: () => void;
  onOpenClient: (id?: string, name?: string) => void;
  onPrep: (name: string, id?: string) => void;
  onSchedule: (name: string, id?: string, subject?: string) => void;
  onTask: (name: string, id?: string, subject?: string) => void;
  onEmail: (name: string, id?: string) => void;
  onAsk: (key: string) => void;
  /** A default-state agenda row was clicked — page re-selects the schedule item by id. */
  onAgenda: (id: string) => void;
  /** Soft actions with no CRM write yet (complete / snooze / assign) — page toasts. */
  onSoft: (title: string, message: string) => void;
}

/* ── Presentational primitives ──────────────────────────────────── */

const FACT_TONE: Record<NonNullable<WorkspaceFact['tone']>, string> = {
  risk: 'text-risk',
  warn: 'text-warn',
  ok: 'text-ok',
  accent: 'text-accent',
};

function PanelFact({ fact }: { fact: WorkspaceFact }) {
  return (
    <div className="rounded-[11px] border border-line bg-bg px-3 py-2.5">
      <span className="mb-1 block truncate font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">{fact.label}</span>
      <b className={clsx('block truncate text-[14px] font-semibold', fact.tone ? FACT_TONE[fact.tone] : 'text-fg')} title={typeof fact.value === 'string' ? fact.value : undefined}>
        {fact.value}
      </b>
    </div>
  );
}

function FactGrid({ facts }: { facts: WorkspaceFact[] }) {
  if (!facts.length) return null;
  return (
    <div className={clsx('grid gap-2', facts.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {facts.map(f => (
        <PanelFact key={f.label} fact={f} />
      ))}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h4 className="mb-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">{title}</h4>
      {children}
    </div>
  );
}

/** A marked list (recommended actions, suggested steps, talking points, questions). */
function MarkedList({ items, marker = '•' }: { items: string[]; marker?: string }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-fg">
          <span aria-hidden="true" className="mt-[3px] flex-none font-mono text-[11px] text-accent">{marker}</span>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalList({ items }: { items: WorkspaceListItem[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-[12px] border border-line">
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
          <span aria-hidden="true" className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-fg">{s.label}</span>
            {s.sub && <span className="mt-0.5 block text-[11.5px] text-muted">{s.sub}</span>}
          </span>
          {s.meta && <span className="flex-none font-mono text-[10px] uppercase text-faint">{s.meta}</span>}
        </div>
      ))}
    </div>
  );
}

function PromptChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center gap-2 rounded-[11px] border border-ai-border bg-ai-bg/40 px-3 py-2.5 text-left text-[12.5px] text-ai transition hover:bg-ai-bg"
    >
      <span aria-hidden="true">✦</span>
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden="true" className="flex-none text-faint">›</span>
    </button>
  );
}

const KIND_ICON: Record<WorkspaceAgendaItem['kind'], IconKey> = {
  call: 'call',
  meeting: 'meeting',
  task: 'task',
  event: 'event',
};

/* ── The panel ──────────────────────────────────────────────────── */

/**
 * The dynamic right context panel of the adaptive workspace. Renders one of
 * five states driven entirely by `selection`: a rich default brief when
 * nothing is selected, and a focused detail view for a client, task,
 * opportunity, or meeting. Sticky + independently scrollable; the page keeps
 * ownership of every action via `handlers`.
 */
export function WorkspacePanel({
  selection,
  brief,
  handlers,
}: {
  selection: WorkspaceSelection;
  brief: WorkspaceBrief;
  handlers: WorkspacePanelHandlers;
}) {
  const eyebrow =
    selection.kind === 'none'
      ? 'AI daily brief'
      : selection.kind === 'client'
        ? 'Client 360'
        : selection.kind === 'task'
          ? 'Task detail'
          : selection.kind === 'opportunity'
            ? 'Deal context'
            : 'Meeting prep';

  return (
    <div className="flex max-h-[calc(100vh-104px)] flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-card">
      {/* Header — eyebrow + a back-to-brief control when a selection is active. */}
      <header className="flex items-center gap-2.5 border-b border-line bg-surface-glass px-4 py-3">
        <Icon name={selection.kind === 'none' ? 'sparkle' : 'clients'} size={14} className={selection.kind === 'none' ? 'text-ai' : 'text-accent'} />
        <b className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{eyebrow}</b>
        {selection.kind !== 'none' && (
          <button
            type="button"
            onClick={handlers.onClear}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition hover:border-accent-border hover:text-fg"
          >
            ‹ Brief
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {selection.kind === 'none' && <DefaultState brief={brief} handlers={handlers} />}
        {selection.kind === 'client' && <ClientState sel={selection} handlers={handlers} />}
        {selection.kind === 'task' && <TaskState sel={selection} handlers={handlers} />}
        {selection.kind === 'opportunity' && <OpportunityState sel={selection} handlers={handlers} />}
        {selection.kind === 'meeting' && <MeetingState sel={selection} handlers={handlers} />}
      </div>
    </div>
  );
}

/* ── State 1: default (nothing selected) ────────────────────────── */
function DefaultState({ brief, handlers }: { brief: WorkspaceBrief; handlers: WorkspacePanelHandlers }) {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{brief.greeting}</div>
      <h3 className="mt-1.5 font-display text-[19px] font-medium leading-snug tracking-tight">
        <span className="text-gradient-ai">{brief.headline}</span>
      </h3>
      <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{brief.narrative}</p>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-[5px] w-[110px] overflow-hidden rounded-full bg-track">
          <span className="block h-full rounded-full bg-gradient-ai" style={{ width: `${brief.confidencePct}%` }} />
        </div>
        <small className="font-mono text-[10.5px] text-muted">AI confidence {brief.confidencePct}%</small>
      </div>

      <PanelSection title="Portfolio pulse">
        <FactGrid facts={brief.pulse} />
      </PanelSection>

      {brief.focus.length > 0 && (
        <PanelSection title="Top risks & opportunities">
          <SignalList items={brief.focus} />
        </PanelSection>
      )}

      {brief.agenda.length > 0 && (
        <PanelSection title="Today's agenda">
          <div className="overflow-hidden rounded-[12px] border border-line">
            {brief.agenda.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => handlers.onAgenda(a.id)}
                className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-surface-muted"
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-track text-muted">
                  <Icon name={KIND_ICON[a.kind]} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-fg">{a.title}</span>
                  {a.client && <span className="block truncate text-[11px] text-muted">{a.client}</span>}
                </span>
                <span className="flex-none font-mono text-[10.5px] text-faint">{a.time}</span>
              </button>
            ))}
          </div>
        </PanelSection>
      )}

      <PanelSection title="Ask Agentforce">
        <div className="flex flex-col gap-2">
          {brief.prompts.map(p => (
            <PromptChip key={p.key} onClick={() => handlers.onAsk(p.key)}>
              {p.label}
            </PromptChip>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

/* ── State 2: client selected (compact 360) ─────────────────────── */
function ClientState({ sel, handlers }: { sel: ClientSelection; handlers: WorkspacePanelHandlers }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-[13px] bg-gradient-ai text-[15px] font-bold text-white">
          {sel.initials ?? sel.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-display text-[18px] font-medium leading-tight tracking-tight" title={sel.name}>{sel.name}</h3>
          {sel.subtitle && <div className="mt-0.5 truncate text-[12px] text-muted">{sel.subtitle}</div>}
        </div>
      </div>

      <div className="mt-4">
        <FactGrid facts={sel.facts} />
      </div>

      <PanelSection title="AI summary">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg">{sel.summary}</p>
      </PanelSection>

      {sel.signals.length > 0 && (
        <PanelSection title="Recent signals">
          <SignalList items={sel.signals} />
        </PanelSection>
      )}

      {sel.nba.length > 0 && (
        <PanelSection title="Recommended next actions">
          <MarkedList items={sel.nba} marker="✦" />
        </PanelSection>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="sm" variant="accent" onClick={() => handlers.onSchedule(sel.name, sel.id, 'Call')}>Call</Button>
        <Button size="sm" variant="ghost" onClick={() => handlers.onEmail(sel.name, sel.id)}>Email</Button>
        <Button size="sm" variant="ghost" onClick={() => handlers.onTask(sel.name, sel.id)}>New task</Button>
        <Button size="sm" variant="ai" onClick={() => handlers.onPrep(sel.name, sel.id)}>✦ Prep me</Button>
      </div>
      <button
        type="button"
        onClick={() => handlers.onOpenClient(sel.id, sel.name)}
        className="mt-2.5 w-full rounded-[11px] border border-line-strong py-2.5 text-center text-[12.5px] font-semibold text-muted transition hover:border-accent-border hover:text-fg"
      >
        Open full 360 →
      </button>
    </div>
  );
}

/* ── State 3: task selected ─────────────────────────────────────── */
function TaskState({ sel, handlers }: { sel: TaskSelection; handlers: WorkspacePanelHandlers }) {
  return (
    <div>
      <h3 className="font-display text-[18px] font-medium leading-snug tracking-tight">{sel.title}</h3>
      {sel.client && (
        <button
          type="button"
          onClick={() => handlers.onOpenClient(sel.clientId, sel.client)}
          className="mt-1 text-[12.5px] text-accent transition hover:underline"
        >
          {sel.client}
        </button>
      )}

      <div className="mt-4">
        <FactGrid facts={sel.facts} />
      </div>

      {sel.reason && (
        <PanelSection title="Why it matters">
          <p className="text-[13px] leading-relaxed text-fg">{sel.reason}</p>
        </PanelSection>
      )}

      {sel.steps.length > 0 && (
        <PanelSection title="Suggested steps">
          <MarkedList items={sel.steps} marker="→" />
        </PanelSection>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="sm" variant="accent" onClick={() => handlers.onSoft('Marked complete', `${sel.title} — closed`)}>Mark complete</Button>
        <Button size="sm" variant="ghost" onClick={() => handlers.onSoft('Snoozed', `${sel.title} — hidden for today`)}>Snooze</Button>
        <Button size="sm" variant="ghost" onClick={() => handlers.onSoft('Reassigned', `${sel.title} — pick an owner`)}>Assign</Button>
        {sel.client && (
          <Button size="sm" variant="ai" onClick={() => handlers.onPrep(sel.client!, sel.clientId)}>✦ Prep me</Button>
        )}
      </div>
    </div>
  );
}

/* ── State 4: opportunity selected ──────────────────────────────── */
function OpportunityState({ sel, handlers }: { sel: OpportunitySelection; handlers: WorkspacePanelHandlers }) {
  return (
    <div>
      <h3 className="font-display text-[18px] font-medium leading-snug tracking-tight">{sel.title}</h3>
      {sel.client && (
        <button
          type="button"
          onClick={() => handlers.onOpenClient(sel.clientId, sel.client)}
          className="mt-1 text-[12.5px] text-accent transition hover:underline"
        >
          {sel.client}
        </button>
      )}

      <div className="mt-4">
        <FactGrid facts={sel.facts} />
      </div>

      {sel.signals.length > 0 && (
        <PanelSection title="Stakeholders & signals">
          <SignalList items={sel.signals} />
        </PanelSection>
      )}

      {sel.risks && (
        <PanelSection title="Risks & blockers">
          <p className="rounded-[11px] border border-risk/40 bg-risk-bg/40 px-3.5 py-3 text-[13px] leading-relaxed text-fg">{sel.risks}</p>
        </PanelSection>
      )}

      {sel.nextAction && (
        <PanelSection title="Next best action">
          <p className="text-[13px] leading-relaxed text-fg">{sel.nextAction}</p>
        </PanelSection>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        {sel.client && (
          <>
            <Button size="sm" variant="accent" onClick={() => handlers.onSchedule(sel.client!, sel.clientId, sel.title)}>Schedule</Button>
            <Button size="sm" variant="ghost" onClick={() => handlers.onTask(sel.client!, sel.clientId, sel.title)}>New task</Button>
            <Button size="sm" variant="ghost" onClick={() => handlers.onEmail(sel.client!, sel.clientId)}>Email</Button>
            <Button size="sm" variant="ai" onClick={() => handlers.onPrep(sel.client!, sel.clientId)}>✦ Prep me</Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── State 5: meeting selected (prep) ───────────────────────────── */
function MeetingState({ sel, handlers }: { sel: MeetingSelection; handlers: WorkspacePanelHandlers }) {
  return (
    <div>
      <h3 className="font-display text-[18px] font-medium leading-snug tracking-tight">{sel.title}</h3>
      {sel.client && (
        <button
          type="button"
          onClick={() => handlers.onOpenClient(sel.clientId, sel.client)}
          className="mt-1 text-[12.5px] text-accent transition hover:underline"
        >
          {sel.client}
        </button>
      )}

      <div className="mt-4">
        <FactGrid facts={sel.facts} />
      </div>

      {sel.agenda.length > 0 && (
        <PanelSection title="Agenda">
          <MarkedList items={sel.agenda} marker="•" />
        </PanelSection>
      )}

      {sel.talkingPoints.length > 0 && (
        <PanelSection title="Talking points">
          <MarkedList items={sel.talkingPoints} marker="✦" />
        </PanelSection>
      )}

      {sel.questions.length > 0 && (
        <PanelSection title="Suggested questions">
          <MarkedList items={sel.questions} marker="?" />
        </PanelSection>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        {sel.client && (
          <>
            <Button size="sm" variant="ai" onClick={() => handlers.onPrep(sel.client!, sel.clientId)}>✦ Full prep</Button>
            <Button size="sm" variant="ghost" onClick={() => handlers.onTask(sel.client!, sel.clientId, `Prep: ${sel.title}`)}>Prep task</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => handlers.onSoft('Notes', 'Meeting notes opened')}>Notes</Button>
      </div>
    </div>
  );
}
