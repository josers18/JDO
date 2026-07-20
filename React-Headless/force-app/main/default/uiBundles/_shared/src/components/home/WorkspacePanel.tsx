import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '../Button';
import { HealthRing } from '../HealthRing';
import { ScoreRing, type RingTone } from '../ScoreRing';
import { Icon, type IconKey } from '../iconMap';
import { useWorkspaceSelection } from './WorkspaceSelection';

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
  /** Leading glyph. Falls back to a tinted dot when absent. */
  icon?: IconKey;
  /** Row tone — tints the icon chip / dot and (for focus rows) the meta chip. */
  tone?: 'risk' | 'warn' | 'ok' | 'accent' | 'ai';
  /** Leading health ScoreRing (0..100). Takes precedence over `icon` — used by
   *  the "Top risks & opportunities" list so its rows match the bottom-band
   *  At-Risk Clients card. When set, the row leads with the ring instead of an
   *  icon chip / dot. */
  ring?: { value: number; tone: RingTone };
  /** When set, the row becomes a button that opens a drill-in. */
  onClick?: () => void;
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
  /** Life-event signals across the book (job change, graduation, retirement…). */
  lifeEvents: WorkspaceListItem[];
  prompts: { key: string; label: string }[];
}

/** A signal row in the 360 panel (tinted dot + label + timestamp). */
export interface PanelSignal {
  label: string;
  when: string;
  tone: 'risk' | 'warn' | 'ok' | 'neutral';
}

/** A relationship-timeline entry in the 360 panel. */
export interface PanelTimelineEntry {
  when: string;
  title: string;
  detail?: string;
  tone: 'risk' | 'warn' | 'ok' | 'neutral';
}

export interface ClientSelection {
  kind: 'client';
  id?: string;
  name: string;
  subtitle?: string;
  initials?: string;
  /** Header chip, e.g. "High Priority". */
  priorityLabel?: string;
  /** Segment/tier chip, e.g. "Platinum". */
  tier?: string;
  /** 0..100 relationship-health score for the ring; omit to hide the ring. */
  healthScore?: number;
  healthLabel?: string;
  healthDeltaPts?: number;
  /** Total relationship value string, e.g. "$4.2M". */
  relationshipValue?: string;
  valueDeltaPct?: number;
  facts: WorkspaceFact[];
  summary: string;
  /** Tinted recent-signals list (preferred). Falls back to `signalItems`. */
  signalRows?: PanelSignal[];
  /** Legacy plain signal list (used when signalRows is absent). */
  signals: WorkspaceListItem[];
  nba: string[];
  /** The single headline Next Best Action (primary button label). */
  nbaHeadline?: string;
  /** Relationship timeline for the Timeline section. */
  timeline?: PanelTimelineEntry[];
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
  /** "+ Add → Task" from the agenda header — page opens the TaskModal (no client). */
  onNewTask: () => void;
  /** "+ Add → Schedule item" from the agenda header — page opens the ScheduleModal. */
  onNewSchedule: () => void;
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

function PanelSection({ title, children, first, action }: { title: string; children: ReactNode; first?: boolean; action?: ReactNode }) {
  return (
    <div className={first ? '' : 'mt-5'}>
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">{title}</h4>
        {action && <span className="ml-auto flex-none">{action}</span>}
      </div>
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

/** Tone → tinted icon-chip / meta-chip classes for the SignalList rows. */
const LIST_TONE: Record<NonNullable<WorkspaceListItem['tone']>, { chip: string; meta: string; dot: string }> = {
  risk: { chip: 'bg-risk-bg text-risk', meta: 'bg-risk-bg text-risk', dot: 'bg-risk' },
  warn: { chip: 'bg-warn-bg text-warn', meta: 'bg-warn-bg text-warn', dot: 'bg-warn' },
  ok: { chip: 'bg-ok-bg text-ok', meta: 'bg-ok-bg text-ok', dot: 'bg-ok' },
  accent: { chip: 'bg-accent-bg text-accent', meta: 'bg-accent-bg text-accent', dot: 'bg-accent' },
  ai: { chip: 'bg-ai-bg text-ai', meta: 'bg-ai-bg text-ai', dot: 'bg-ai' },
};

function SignalList({ items }: { items: WorkspaceListItem[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-[12px] border border-line">
      {items.map((s, i) => {
        const tone = LIST_TONE[s.tone ?? 'accent'];
        // Lead priority: a health ring (at-risk rows) > an icon chip > a tinted
        // dot. The ring mirrors the bottom-band At-Risk Clients card.
        const lead = s.ring ? (
          <span className="mt-0.5 flex-none">
            <ScoreRing value={s.ring.value} tone={s.ring.tone} size={34} />
          </span>
        ) : s.icon ? (
          <span className={clsx('mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-[8px]', tone.chip)}>
            <Icon name={s.icon} size={13} />
          </span>
        ) : (
          <span aria-hidden="true" className={clsx('mt-[7px] h-2 w-2 flex-none rounded-full', tone.dot)} />
        );
        const inner = (
          <>
            {lead}
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-fg">{s.label}</span>
              {s.sub && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{s.sub}</span>}
            </span>
            {s.meta && (
              <span className={clsx('mt-0.5 flex-none rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]', tone.meta)}>
                {s.meta}
              </span>
            )}
          </>
        );
        return s.onClick ? (
          <button
            key={i}
            type="button"
            onClick={s.onClick}
            className="flex w-full items-start gap-3 border-b border-line px-3.5 py-3 text-left transition last:border-b-0 hover:bg-surface-muted"
          >
            {inner}
          </button>
        ) : (
          <div key={i} className="flex items-start gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
            {inner}
          </div>
        );
      })}
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

/** Agenda item kind → tinted icon-chip classes, so each activity type reads at
 *  a glance (call = accent, meeting = ai, task = warn, event = ok). */
const KIND_CHIP: Record<WorkspaceAgendaItem['kind'], string> = {
  call: 'bg-accent-bg text-accent',
  meeting: 'bg-ai-bg text-ai',
  task: 'bg-warn-bg text-warn',
  event: 'bg-ok-bg text-ok',
};

/**
 * The "+ Add" control beside the Today's-agenda header — a tiny popover that
 * lets the banker choose whether the new item is a Task or a Schedule item,
 * routing to the matching modal. Closes on either choice or an outside click.
 */
function AddMenu({ onTask, onSchedule }: { onTask: () => void; onSchedule: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted transition hover:border-accent-border hover:text-fg"
      >
        + Add
      </button>
      {open && (
        <>
          {/* Click-away scrim (transparent) so a click anywhere closes the menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-[61] w-40 overflow-hidden rounded-[10px] border border-line bg-surface shadow-card"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onTask(); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] text-fg transition hover:bg-surface-muted"
            >
              <span className={clsx('grid h-6 w-6 flex-none place-items-center rounded-[7px]', KIND_CHIP.task)}>
                <Icon name="task" size={12} />
              </span>
              New task
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSchedule(); }}
              className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left text-[12.5px] text-fg transition hover:bg-surface-muted"
            >
              <span className={clsx('grid h-6 w-6 flex-none place-items-center rounded-[7px]', KIND_CHIP.meeting)}>
                <Icon name="event" size={12} />
              </span>
              Schedule item
            </button>
          </div>
        </>
      )}
    </span>
  );
}

/** Signal / timeline tone → dot color class. */
const DOT_TONE: Record<PanelSignal['tone'], string> = {
  risk: 'bg-risk',
  warn: 'bg-warn',
  ok: 'bg-ok',
  neutral: 'bg-accent',
};

/** Map a 0..100 health score to a ring tone + label fallback. */
function healthTone(score: number): { color: string; label: string } {
  if (score >= 80) return { color: 'var(--wp-pos)', label: 'Excellent' };
  if (score >= 65) return { color: 'var(--wp-accent)', label: 'Good' };
  if (score >= 50) return { color: 'var(--wp-warn)', label: 'Fair' };
  return { color: 'var(--wp-neg)', label: 'At risk' };
}

/** A tinted list of signals — dot + label + timestamp (Client-360 "Recent Signals"). */
function PanelSignalList({ items }: { items: PanelSignal[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-[12px] border border-line">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
          <span aria-hidden="true" className={clsx('h-2 w-2 flex-none rounded-full', DOT_TONE[s.tone])} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{s.label}</span>
          <span className="flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{s.when}</span>
        </div>
      ))}
    </div>
  );
}

/** The relationship timeline — a dotted rail of dated entries. */
function PanelTimeline({ items }: { items: PanelTimelineEntry[] }) {
  if (!items.length) return null;
  return (
    <ol className="relative ml-1 border-l border-line">
      {items.map((t, i) => (
        <li key={i} className="relative pl-4 pb-3.5 last:pb-0">
          <span
            aria-hidden="true"
            className={clsx('absolute -left-[5px] top-[3px] h-2.5 w-2.5 rounded-full ring-2 ring-surface', DOT_TONE[t.tone])}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-[12.5px] font-semibold text-fg">{t.title}</span>
            <span className="ml-auto flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{t.when}</span>
          </div>
          {t.detail && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{t.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

/** The Client-360 tab bar. */
const CLIENT_TABS = ['Overview', 'Signals', 'Activity', 'Relationship'] as const;
type ClientTab = (typeof CLIENT_TABS)[number];

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
      ? 'Your day'
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
  // The greeting / headline / narrative / confidence + pulse that used to head
  // this panel duplicated the top-banner AI Daily Brief verbatim, so they're
  // gone. The panel now leads straight into the signals the banner doesn't show:
  // top risks & opportunities, today's agenda, and the Ask Agentforce prompts.
  return (
    <div>
      {brief.focus.length > 0 && (
        <PanelSection title="Top risks & opportunities" first>
          <SignalList items={brief.focus} />
        </PanelSection>
      )}

      {brief.lifeEvents.length > 0 && (
        <PanelSection title="Life events across your book">
          <SignalList items={brief.lifeEvents} />
        </PanelSection>
      )}

      {brief.agenda.length > 0 && (
        <PanelSection
          title="Today's agenda"
          action={<AddMenu onTask={handlers.onNewTask} onSchedule={handlers.onNewSchedule} />}
        >
          <div className="overflow-hidden rounded-[12px] border border-line">
            {brief.agenda.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => handlers.onAgenda(a.id)}
                className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-surface-muted"
              >
                {/* Per-type colored chip so the activity kind reads at a glance. */}
                <span className={clsx('grid h-7 w-7 flex-none place-items-center rounded-[8px]', KIND_CHIP[a.kind])}>
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

/** A pushpin glyph — outline when unpinned, filled when pinned. */
function PinGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" />
      <line x1="12" y1="13" x2="12" y2="20" />
    </svg>
  );
}

/* ── State 2: client selected (tabbed Client 360) ───────────────── */
function ClientState({ sel, handlers }: { sel: ClientSelection; handlers: WorkspacePanelHandlers }) {
  const [tab, setTab] = useState<ClientTab>('Overview');
  const { isPinned, togglePin } = useWorkspaceSelection();
  const pinned = isPinned({ id: sel.id, name: sel.name });
  const health = sel.healthScore;
  const tone = health != null ? healthTone(health) : null;
  const signalRows = sel.signalRows ?? [];
  const nbaHeadline = sel.nbaHeadline ?? sel.nba[0];
  const restNba = sel.nbaHeadline ? sel.nba : sel.nba.slice(1);

  return (
    <div>
      {/* Identity row: avatar · name · priority chip · pin toggle */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-[13px] bg-gradient-ai text-[15px] font-bold text-white">
          {sel.initials ?? sel.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[18px] font-semibold leading-tight tracking-tight" title={sel.name}>{sel.name}</h3>
            {sel.priorityLabel && (
              <span className="flex-none rounded-full bg-risk-bg px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-risk">
                {sel.priorityLabel}
              </span>
            )}
          </div>
          {sel.subtitle && <div className="mt-0.5 truncate text-[12px] text-muted">{sel.subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={() => togglePin({ id: sel.id, name: sel.name, sub: sel.subtitle ?? sel.tier })}
          title={pinned ? `Unpin ${sel.name} from sidebar` : `Pin ${sel.name} to sidebar`}
          aria-label={pinned ? `Unpin ${sel.name}` : `Pin ${sel.name}`}
          aria-pressed={pinned}
          className={clsx(
            'grid h-8 w-8 flex-none place-items-center rounded-[9px] border transition',
            pinned
              ? 'border-accent-border bg-accent-bg text-accent'
              : 'border-line text-muted hover:border-accent-border hover:text-fg',
          )}
        >
          <PinGlyph filled={pinned} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="mt-3.5 flex gap-4 border-b border-line">
        {CLIENT_TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              'relative -mb-px pb-2 text-[12.5px] font-medium transition',
              tab === t ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t}
            {tab === t && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'Overview' && (
        <div>
          {/* Health ring + relationship value */}
          {(health != null || sel.relationshipValue) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {health != null && tone && (
                <div className="rounded-[13px] border border-line bg-bg px-3.5 py-3">
                  <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">Health score</span>
                  <div className="flex items-center gap-2.5">
                    <HealthRing score={health} size={52} label="" segments={[{ value: health, color: tone.color }]} />
                    <div className="min-w-0">
                      <b className="block text-[13px] font-semibold text-fg">{sel.healthLabel ?? tone.label}</b>
                      {sel.healthDeltaPts != null && (
                        <span className={clsx('font-mono text-[10.5px]', sel.healthDeltaPts < 0 ? 'text-risk' : 'text-ok')}>
                          {sel.healthDeltaPts < 0 ? '▼' : '▲'} {Math.abs(sel.healthDeltaPts)} pts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {sel.relationshipValue && (
                <div className="rounded-[13px] border border-line bg-bg px-3.5 py-3">
                  <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">Relationship value</span>
                  <b className="block font-display text-[22px] font-semibold leading-none tracking-tight text-fg">{sel.relationshipValue}</b>
                  {sel.valueDeltaPct != null && (
                    <span className={clsx('mt-1.5 block font-mono text-[10.5px]', sel.valueDeltaPct < 0 ? 'text-risk' : 'text-ok')}>
                      {sel.valueDeltaPct < 0 ? '▼' : '▲'} {Math.abs(sel.valueDeltaPct)}% vs last quarter
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-3">
            <FactGrid facts={sel.facts} />
          </div>

          {/* Next Best Action */}
          {(nbaHeadline || restNba.length > 0) && (
            <PanelSection title="Next best action">
              {nbaHeadline && (
                <Button size="sm" variant="accent" className="w-full justify-center" onClick={() => handlers.onSchedule(sel.name, sel.id, nbaHeadline)}>
                  {nbaHeadline}
                </Button>
              )}
              {restNba.length > 0 && (
                <div className="mt-2">
                  <MarkedList items={restNba} marker="✦" />
                </div>
              )}
              <button
                type="button"
                onClick={() => handlers.onAsk('nba_rationale')}
                className="mt-2 text-[11.5px] text-ai transition hover:underline"
              >
                Why this action? →
              </button>
            </PanelSection>
          )}

          {/* AI summary */}
          <PanelSection title="AI summary">
            <div className="rounded-[12px] border border-ai-border bg-ai-bg/30 px-3.5 py-3">
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg">{sel.summary}</p>
              <button
                type="button"
                onClick={() => handlers.onAsk('client_summary')}
                className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-ai transition hover:underline"
              >
                <span aria-hidden="true">✦</span> View explanation →
              </button>
            </div>
          </PanelSection>
        </div>
      )}

      {/* ── SIGNALS ── */}
      {tab === 'Signals' && (
        <div className="mt-4">
          {signalRows.length > 0 ? (
            <PanelSignalList items={signalRows} />
          ) : sel.signals.length > 0 ? (
            <SignalList items={sel.signals} />
          ) : (
            <p className="rounded-[12px] border border-line bg-bg px-3.5 py-4 text-[12.5px] text-muted">No recent signals on this relationship.</p>
          )}
        </div>
      )}

      {/* ── ACTIVITY (timeline) ── */}
      {tab === 'Activity' && (
        <div className="mt-4">
          {sel.timeline && sel.timeline.length > 0 ? (
            <PanelTimeline items={sel.timeline} />
          ) : (
            <p className="rounded-[12px] border border-line bg-bg px-3.5 py-4 text-[12.5px] text-muted">No recent activity recorded.</p>
          )}
        </div>
      )}

      {/* ── RELATIONSHIP (facts + summary) ── */}
      {tab === 'Relationship' && (
        <div className="mt-4">
          <FactGrid facts={sel.facts} />
          <PanelSection title="Overview">
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg">{sel.summary}</p>
          </PanelSection>
        </div>
      )}

      {/* Quick actions (persistent under every tab) */}
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
      <h3 className="font-display text-[18px] font-semibold leading-snug tracking-tight">{sel.title}</h3>
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
      <h3 className="font-display text-[18px] font-semibold leading-snug tracking-tight">{sel.title}</h3>
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
      <h3 className="font-display text-[18px] font-semibold leading-snug tracking-tight">{sel.title}</h3>
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
