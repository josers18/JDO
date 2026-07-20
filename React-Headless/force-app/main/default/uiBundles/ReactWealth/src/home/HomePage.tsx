import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  useAsyncData,
  ToastProvider,
  useToast,
  Button,
  Sparkline,
  ScoreRing,
  RightNowCard,
  PriorityQueueRow,
  PriorityQueueCard,
  buildPriorityQueue,
  RecommendationCard,
  TaskModal,
  ScheduleModal,
  ScheduleTable,
  ScheduleDetailModal,
  tagSchedule,
  useHomeView,
  useReveal,
  RevealFooter,
  CaseModal,
  EmailModal,
  PrepModal,
  QuickViewModal,
  WhyModal,
  DetailModal,
  type DetailModalData,
  DataExplorerModal,
  Pill,
  WorkspacePanel,
  useWorkspaceSelection,
  type WorkspaceSelection,
  type WorkspaceBrief,
  type WorkspacePanelHandlers,
  Icon,
  formatValue,
  crmWrite,
  AiResultModal,
  DraftFollowupsModal,
  useSpeech,
  generateText,
  loadCenterConfig,
  DEFAULT_CONFIG,
  type ClientProfile,
  type CrmWriteInput,
  type DraftRow,
  type AiGenerateResult,
  type AiActionKey,
  type CommandCenterConfig,
} from '@shared';
import { fetchHomeDashboard } from './homeData';
import type { CallItem, PipelineItem, LeadReferral, LifeEventSignal, AlertSignal, Recommendation, ScheduleItem, ActivityItem, PipelineMovement } from './homeTypes';
import { AGENTFORCE_FLOWS } from '../personas/customer/agentforceFlows';
import { modeFor } from '../data/dataSource';
import { APP_PERSONA } from '../shell/appChrome';

/* ── Rich mock profiles for prep / quick view (retail book) ───────── */
const PROFILES: Record<string, ClientProfile> = {
  'Julie E Morris': {
    initials: 'JM',
    descriptor: 'Retail household',
    since: '2016',
    csat: 'Poor · 62',
    value: '$1.24M',
    openCases: '5',
    tier: 'Platinum',
    priorityLabel: 'High Priority',
    healthScore: 62,
    healthLabel: 'Fair',
    healthDeltaPts: -8,
    valueDeltaPct: 6,
    facts: [
      ['Open opp', '$150K personal loan'],
      ['Overdue task', '270 days'],
      ['Open cases', '5'],
      ['Last contact', '9 mo ago'],
    ],
    signals: [
      { label: 'CSAT dropped below threshold', when: 'Today', tone: 'risk' },
      { label: 'Complaint ticket opened', when: 'Yesterday', tone: 'risk' },
      { label: 'Digital banking login', when: 'Yesterday', tone: 'ok' },
    ],
    timeline: [
      { when: 'Yesterday', title: 'Complaint opened', detail: 'Service issue logged by client', tone: 'risk' },
      { when: '3 days ago', title: 'Wire completed', detail: '$250,000 outgoing wire', tone: 'neutral' },
      { when: '7 days ago', title: 'Rollover discussion', detail: 'Exploring 401k options', tone: 'neutral' },
      { when: '2 wks ago', title: 'Login detected', detail: 'Digital banking login', tone: 'ok' },
    ],
    recap:
      'Julie has banked with Cumulus for 9 years across a mortgage, two deposit accounts, and a brokerage link. Engagement dropped after a branch closure near her; CSAT slid to Poor over the last three surveys. A 401k rollover conversation started in 2024 was never closed, and a $150K personal-loan opportunity is sitting in Interested. Five open cases — most notably a lost debit card — are the likely CSAT driver.',
    talk:
      'Lead by resolving the lost-card case live on the call — that rebuilds trust before any product talk. Then reframe the idle rollover as a simple, guided next step and connect it to the personal-loan need she already raised.',
    nbaHeadline: 'Schedule service recovery call',
    nba: [
      'Resolve lost-card case & confirm replacement shipped',
      'Walk the 401k rollover, offer to e-sign on the call',
      "Re-open the $150K personal-loan quote at today's rate",
    ],
  },
  'AJC Corporation': {
    initials: 'AJ',
    descriptor: 'Commercial',
    since: '2021',
    csat: 'Good · 81',
    value: '$3.0M deal',
    openCases: '—',
    tier: 'Commercial',
    healthScore: 81,
    healthLabel: 'Good',
    healthDeltaPts: 2,
    valueDeltaPct: 12,
    facts: [
      ['Deal', '$3.0M CRE term loan'],
      ['Stage', 'Closing/Funding'],
      ['Probability', '80%'],
      ['Idle', '12 days'],
    ],
    signals: [
      { label: 'Deal stalled 12 days', when: '12d', tone: 'warn' },
      { label: 'Appraisal received', when: '2 wks', tone: 'ok' },
    ],
    timeline: [
      { when: '12 days ago', title: 'Terms agreed', detail: 'Verbal agreement on rate', tone: 'ok' },
      { when: '2 wks ago', title: 'Appraisal received', detail: 'Collateral valued', tone: 'ok' },
      { when: '3 wks ago', title: 'Application submitted', detail: '$3M CRE term loan', tone: 'neutral' },
    ],
    recap:
      'AJC is a commercial real-estate borrower with a $3M term loan at the funding stage. Everything is verbally agreed but no activity has been logged in 12 days, and no funding date is set — the classic way an 80% deal slips a quarter.',
    talk:
      'Keep it operational and short: confirm the final documents received, name any open blocker, and put a funding date on the calendar before you hang up.',
    nbaHeadline: 'Confirm docs & set funding date',
    nba: ['Confirm final docs & appraisal received', 'Set a hard funding date', 'Send DocuSign package for signatures'],
  },
};

/* ── Modal state ──────────────────────────────────────────────────── */
type ModalKind = 'task' | 'schedule' | 'case' | 'email' | 'prep' | 'quickview' | 'why' | 'airesult' | 'drafts';
type ModalState =
  | { type: 'none' }
  | { type: ModalKind; name: string; id?: string; subject?: string; toAddress?: string };

const KIND_TO_ACTION: Record<Recommendation['kind'], CrmWriteInput['action']> = {
  task: 'task',
  email: 'email',
  call: 'event',
  case: 'case',
};

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * HOME — the banker's relationship command center. Composes the redesigned
 * sections (daily brief, priority queue, recommended actions, life events,
 * pipeline, leads, portfolio pulse) over the same HomeDashboard view model,
 * with modals that perform real CRM writes. Wrapped in a ToastProvider so any
 * child (including the write modals) can raise a toast.
 */
export default function HomePage() {
  return (
    <ToastProvider>
      <HomeContent />
    </ToastProvider>
  );
}

function HomeContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, refetch } = useAsyncData(fetchHomeDashboard, []);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const speech = useSpeech();
  const [aiModal, setAiModal] = useState<{
    open: boolean;
    title: string;
    task: 'queue_rationale' | 'pipeline_summary';
    prompt: string;
    context: string;
    fallback: string;
  } | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  // Cockpit "Show more / Show less" — the mockup's footer toggle. Defaults to
  // EXPANDED so the five-column supporting band is visible on load (matching the
  // design's "Show less" state); collapsing hides the band. The detail modules
  // below (pipeline table, life events, leads, portfolio pulse) always render so
  // the CommandRail nav anchors (#pipeline / #events / #leads / #pulse) stay live.
  const [bandExpanded, setBandExpanded] = useState(true);
  // Which supporting-band module is drilled into (its "View all →" was clicked).
  // Null = no explorer open. One <DataExplorerModal> renders per key below.
  const [explorer, setExplorer] = useState<'activity' | 'pipelineMovement' | 'atRisk' | 'agenda' | 'opportunities' | null>(null);
  const [detailItem, setDetailItem] = useState<ScheduleItem | null>(null);
  // Read-only detail popup for non-CRM-editable list rows (pipeline
  // opportunities, life events, alerts). Structured content lives in the
  // slot, so one <DetailModal> at the page root serves every list.
  const [detailView, setDetailView] = useState<DetailModalData | null>(null);

  // Right context panel selection for the cockpit workspace. Clicking any
  // center row (client / task / opportunity / meeting) sets this; the panel
  // renders the matching state, and `{ kind: 'none' }` shows the default brief.
  const [selection, setSelection] = useState<WorkspaceSelection>({ kind: 'none' });
  // Bridge to the left sidebar's pinned-accounts block (lives in the layout,
  // outside this component). A pin click bumps `pinnedRequest`; we resolve it
  // into a full client selection below.
  const { pinnedRequest } = useWorkspaceSelection();

  // Home layout mode. "current" = the classic stacked sections; "cockpit" = a
  // compact, column-dense grid. The selection lives in the app chrome (top-bar
  // segmented control) and is shared down through HomeViewProvider — see
  // HomeLayout — persisted per-persona in sessionStorage there.
  const { view } = useHomeView();

  // Org-level command-center config (model per AI action + generation params).
  // Cached module-side; failures degrade to DEFAULT_CONFIG so an AI action is
  // never blocked by a config hiccup.
  const [config, setConfig] = useState<CommandCenterConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    let alive = true;
    loadCenterConfig(APP_PERSONA).then(cfg => {
      if (alive) setConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A pinned-account click in the sidebar selects that client into the right
  // panel. We resolve the name against the book here (the page owns the data)
  // and build the compact-360 payload. Keyed on the request nonce so clicking
  // the same account twice re-fires. Runs before the loading guard as a hook.
  useEffect(() => {
    if (!pinnedRequest || !data) return;
    const call = data.callList.find(c => c.clientName === pinnedRequest.name);
    setSelection(buildClientSelection(pinnedRequest.name, pinnedRequest.id ?? call?.clientId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedRequest?.nonce, data]);

  // Merge the configured model + params into an AI request for a given action.
  const withConfig = (
    action: AiActionKey,
    input: { task: AiActionKey; prompt: string; context: string }
  ) => ({
    ...input,
    modelName: config.models[action] || undefined,
    temperature: config.params.temperature,
    maxTokens: config.params.maxTokens,
  });

  const callByName = useMemo(() => {
    const map = new Map<string, CallItem>();
    (data?.callList ?? []).forEach(c => map.set(c.clientName, c));
    return map;
  }, [data]);

  // Blended, dated priority queue (Request C): the signature risk feed
  // (`callList`) merged with opportunity- and overdue-task-derived items, each
  // carrying a signal-native `dueDate`. Decouples due date from severity so the
  // "Due date" sort interleaves severities instead of clustering them. Only the
  // PriorityQueueCard reads this; callList stays intact for the rest of the page.
  const queueItems = useMemo(
    () =>
      buildPriorityQueue({
        primary: data?.callList ?? [],
        opportunities: data?.pipeline ?? [],
        tasks: (data?.schedule ?? []).filter(it => it.bucket === 'overdue' || it.kind === 'task'),
      }) as CallItem[],
    [data],
  );

  // Progressive reveal for the long lists — hooks must run before the loading
  // guard, so they read the data optionally and settle once it lands. The queue
  // and recommended-actions reveals also serve a layout goal: capping the two
  // tall cockpit columns near the height of the shorter schedule column keeps
  // the 3-up grid from stranding a large void under the short cell. Nothing is
  // hidden — every capped row is one "Show more" click away.
  const pipelineReveal = useReveal(data?.pipeline ?? [], 6);
  const leadsReveal = useReveal(data?.leads ?? [], 6);
  const visibleRecs = useMemo(
    () => (data?.recommendations ?? []).filter(r => !dismissed.has(r.id)),
    [data, dismissed],
  );
  const recsReveal = useReveal(visibleRecs, 3);

  if (loading || !data) {
    return <div className="animate-pulse p-8 text-muted">Loading your book…</div>;
  }

  const open = (type: ModalKind, name: string, id?: string, subject?: string, toAddress?: string) => setModal({ type, name, id, subject, toAddress });
  const close = () => setModal({ type: 'none' });
  const flowFor = (id?: string) => (modeFor('agentforce') === 'real' && id ? AGENTFORCE_FLOWS.account : undefined);
  const profileFor = (name: string) => PROFILES[name];
  const openFull = (id?: string) => {
    if (id) navigate(`/client/${id}`);
    else toast('Full 360', 'Open the client record for the complete view');
  };

  // ── Right context panel: build a selection payload for each entity kind.
  //    The panel is presentational; these builders turn a clicked row into the
  //    render-ready shape the panel expects.
  function buildClientSelection(name: string, id?: string): WorkspaceSelection {
    const p = PROFILES[name];
    // May be invoked from the pinnedRequest effect (which runs before the
    // loading guard), so re-narrow the book optionally rather than assuming it.
    const call = data?.callList.find(c => c.clientName === name);
    const opps = data?.pipeline.filter(o => o.clientName === name) ?? [];
    const events = data?.lifeEvents.filter(e => e.clientName === name) ?? [];
    const signals = [
      ...events.map(e => ({ label: e.event, sub: e.opportunity, meta: e.when })),
      ...opps.map(o => ({ label: o.name, sub: `${o.stage} · ${Math.round(o.propensity * 100)}%`, meta: formatValue(o.amount, 'currencyCompact') })),
    ].slice(0, 5);
    const subtitleBits = [p?.descriptor ?? call?.segment ?? 'Client'];
    if (p?.since) subtitleBits.push(`Since ${p.since}`);
    if (p?.tier) subtitleBits.push(p.tier);
    return {
      kind: 'client',
      id: id ?? call?.clientId,
      name,
      subtitle: subtitleBits.join(' · '),
      initials: p?.initials,
      priorityLabel: p?.priorityLabel ?? (call?.severity === 'high' ? 'High Priority' : undefined),
      tier: p?.tier,
      healthScore: p?.healthScore,
      healthLabel: p?.healthLabel,
      healthDeltaPts: p?.healthDeltaPts,
      relationshipValue: p?.value ?? (call && call.relationshipValue ? formatValue(call.relationshipValue, 'currencyCompact') : undefined),
      valueDeltaPct: p?.valueDeltaPct,
      facts: [
        { label: 'CSAT', value: p?.csat ?? '—', tone: (p?.csat ?? '').startsWith('Poor') ? 'risk' : undefined },
        { label: 'Value', value: p?.value ?? (call ? formatValue(call.relationshipValue, 'currencyCompact') : '—') },
        { label: 'Open cases', value: p?.openCases ?? '—' },
      ],
      summary: p?.recap ?? call?.reason ?? 'AI relationship summary generates on open from CRM, Data Cloud signals, and recent activity.',
      signalRows: p?.signals,
      signals,
      nbaHeadline: p?.nbaHeadline,
      nba: p?.nba ?? (call ? [call.action] : []),
      timeline: p?.timeline,
    };
  }

  const selectClientPanel = (name: string, id?: string) => setSelection(buildClientSelection(name, id));

  const selectTaskPanel = (item: ScheduleItem) => {
    const call = item.clientName ? data.callList.find(c => c.clientName === item.clientName) : undefined;
    setSelection({
      kind: 'task',
      title: item.title,
      client: item.clientName,
      clientId: item.whatId ?? call?.clientId,
      facts: [
        { label: 'Type', value: item.kind[0].toUpperCase() + item.kind.slice(1) },
        { label: 'Due', value: item.time || '—', tone: item.bucket === 'overdue' ? 'risk' : undefined },
        { label: 'Priority', value: item.priority ?? (call?.severity === 'high' ? 'High' : 'Normal'), tone: (item.priority === 'High' || call?.severity === 'high') ? 'warn' : undefined },
      ],
      reason: call?.reason ?? item.description ?? 'Scheduled item on your book — no additional signal attached.',
      steps: call ? [call.action, `Log the outcome against ${item.clientName}.`] : ['Review the record.', 'Log the outcome.'],
    });
  };

  const selectOpportunityPanel = (o: PipelineItem) => {
    const call = data.callList.find(c => c.clientName === o.clientName);
    const events = data.lifeEvents.filter(e => e.clientName === o.clientName);
    const hot = o.propensity >= 0.7;
    setSelection({
      kind: 'opportunity',
      title: o.name,
      client: o.clientName,
      clientId: call?.clientId,
      facts: [
        { label: 'Amount', value: formatValue(o.amount, 'currencyCompact') },
        { label: 'Propensity', value: `${Math.round(o.propensity * 100)}%`, tone: hot ? 'ok' : 'warn' },
        { label: 'Stage', value: o.stage || '—' },
      ],
      signals: [
        { label: 'Close date', sub: o.closeDate || 'Not set', meta: hot ? 'On track' : 'Watch' },
        ...events.map(e => ({ label: e.event, sub: e.opportunity, meta: e.when })),
      ].slice(0, 5),
      risks: hot ? undefined : `Propensity is ${Math.round(o.propensity * 100)}% — below the 70% confidence line. This deal is at risk of aging out without a next touch.`,
      nextAction: call?.action ?? `Advance ${o.clientName} from ${o.stage}: confirm the next milestone and set a firm date.`,
    });
  };

  const selectMeetingPanel = (item: ScheduleItem) => {
    const call = item.clientName ? data.callList.find(c => c.clientName === item.clientName) : undefined;
    const p = item.clientName ? PROFILES[item.clientName] : undefined;
    setSelection({
      kind: 'meeting',
      title: item.title,
      client: item.clientName,
      clientId: item.whatId ?? call?.clientId,
      facts: [
        { label: 'Time', value: item.time || '—' },
        { label: 'Type', value: item.kind[0].toUpperCase() + item.kind.slice(1) },
        { label: 'Client', value: item.clientName ?? 'Internal' },
      ],
      agenda: p?.nba ?? (call ? [call.action] : ['Review relationship status', 'Confirm next steps']),
      talkingPoints: p?.talk ? [p.talk] : (call ? [call.reason] : ['Open with the client’s most recent signal.']),
      questions: [
        'What has changed since we last spoke?',
        call ? `How can we help with ${call.action.toLowerCase()}?` : 'What are your priorities this quarter?',
      ],
    });
  };

  // ── Read-only detail popups for list rows. Each builds a structured
  //    DetailModalData and drops it into the detailView slot; the single
  //    <DetailModal> at the page root renders it.
  const showPipelineDetail = (p: PipelineItem) => {
    setDetailView({
      title: p.name || 'Opportunity',
      subtitle: p.clientName,
      icon: <Icon name="pipeline" size={17} />,
      tone: 'accent',
      facts: [
        { label: 'Amount', value: formatValue(p.amount, 'currencyCompact') },
        { label: 'Propensity', value: `${Math.round(p.propensity * 100)}%` },
        { label: 'Stage', value: p.stage || '—' },
      ],
      sectionTitle: 'Opportunity',
      fields: [
        { label: 'Client', value: p.clientName },
        { label: 'Opportunity', value: p.name },
        { label: 'Stage', value: p.stage },
        { label: 'Close Date', value: p.closeDate || '—' },
      ],
      actions: [{ label: 'View client →', variant: 'accent', onClick: () => { setDetailView(null); open('quickview', p.clientName); } }],
    });
  };

  const showActivityDetail = (a: ActivityItem) => {
    setDetailView({
      title: a.title,
      subtitle: `${a.clientName} · ${a.when}`,
      icon: <Icon name={a.icon} size={17} />,
      tone: a.tone === 'risk' ? 'accent' : 'ai',
      sectionTitle: 'Activity',
      fields: [
        { label: 'Client', value: a.clientName },
        { label: 'Activity', value: a.title },
        { label: 'When', value: a.when },
        { label: 'Channel', value: a.icon[0].toUpperCase() + a.icon.slice(1) },
      ],
      actions: (a.clientId || a.clientName)
        ? [{ label: 'Open client 360 →', variant: 'accent', onClick: () => { setDetailView(null); setExplorer(null); a.clientId ? openFull(a.clientId) : open('quickview', a.clientName); } }]
        : [],
    });
  };

  const showClientDetail = (c: CallItem) => {
    const h = healthFor(c);
    setDetailView({
      title: c.clientName,
      subtitle: c.segment,
      icon: <Icon name="alerts" size={17} />,
      tone: 'accent',
      facts: [
        { label: 'Health', value: `${h}` },
        { label: 'Severity', value: c.severity[0].toUpperCase() + c.severity.slice(1) },
        { label: 'Relationship', value: formatValue(c.relationshipValue, 'currencyCompact') },
      ],
      note: c.reason,
      sectionTitle: 'Client',
      fields: [
        { label: 'Client', value: c.clientName },
        { label: 'Segment', value: c.segment },
        { label: 'Driver', value: c.reason },
        { label: 'Recommended action', value: c.action },
        { label: 'Source', value: c.source },
      ],
      actions: [{ label: 'Open client 360 →', variant: 'accent', onClick: () => { setDetailView(null); setExplorer(null); openFull(c.clientId); } }],
    });
  };

  const showPipelineMovementDetail = (m: PipelineMovement) => {
    const up = m.deltaPct >= 0;
    const pct = Math.abs(Math.round(m.deltaPct * 100));
    setDetailView({
      title: m.label,
      subtitle: 'Pipeline movement · week over week',
      icon: <Icon name="metrics" size={17} />,
      tone: 'accent',
      facts: [
        { label: 'Value', value: formatValue(m.amount, 'currencyCompact') },
        { label: 'Change', value: <span className={up ? 'text-ok' : 'text-risk'}>{up ? '↑' : '↓'} {pct}%</span> },
        { label: 'Trend', value: <Sparkline points={m.trend} width={80} height={24} stroke={up ? 'var(--wp-pos)' : 'var(--wp-neg)'} /> },
      ],
      note: `${m.label} pipeline ${up ? 'grew' : 'declined'} ${pct}% week over week, now at ${formatValue(m.amount, 'currencyCompact')}.`,
      sectionTitle: 'Product line',
      fields: [
        { label: 'Product line', value: m.label },
        { label: 'Current value', value: formatValue(m.amount, 'currencyCompact') },
        { label: 'WoW change', value: `${up ? '+' : '−'}${pct}%` },
      ],
    });
  };

  const showLifeEventDetail = (e: LifeEventSignal) => {
    setDetailView({
      title: e.event,
      subtitle: `${e.clientName} · ${e.when}`,
      icon: <span>{e.icon}</span>,
      tone: 'accent',
      sectionTitle: 'Signal',
      fields: [
        { label: 'Client', value: e.clientName },
        { label: 'Event', value: e.event },
        { label: 'When', value: e.when },
        { label: 'Opportunity', value: e.opportunity },
      ],
      actions: [{ label: 'Open client 360 →', variant: 'accent', onClick: () => { setDetailView(null); openFull(e.clientId); } }],
    });
  };

  const showAlertDetail = (a: AlertSignal) => {
    setDetailView({
      title: a.title,
      subtitle: a.when,
      icon: <Icon name="alerts" size={17} />,
      tone: a.tone === 'risk' ? 'accent' : 'ai',
      facts: [
        { label: 'Severity', value: a.severity },
        { label: 'When', value: a.when },
      ],
      note: a.detail,
      actions: [{ label: 'View client →', variant: 'accent', onClick: () => { setDetailView(null); open('quickview', clientFromAlert(a.title)); } }],
    });
  };

  const today = data.callList.filter(c => c.tier === 'today');
  const week = data.callList.filter(c => c.tier === 'week');
  const watch = data.callList.filter(c => (c.tier ?? 'watch') === 'watch');
  // 1-based rank across the whole ranked queue (callList is score-ordered), so
  // each grouped row can show its global position and the #1 item gets emphasis.
  const rankOf = (c: CallItem) => data.callList.indexOf(c) + 1;

  const approveRec = async (rec: Recommendation) => {
    // Email has no unattended path: CrmWriteRest requires a recipient address
    // and a Recommendation carries none, so a blind send always 400s. Route to
    // the EmailModal (same as Edit) where the banker enters the recipient and
    // sends — the card is dismissed there on a successful send, not here.
    if (rec.kind === 'email') {
      open('email', rec.clientName, rec.clientId, rec.title);
      return;
    }
    try {
      await crmWrite({
        action: KIND_TO_ACTION[rec.kind],
        subject: rec.title,
        description: rec.body,
        whatId: rec.clientId || undefined,
        accountId: rec.kind === 'case' ? rec.clientId || undefined : undefined,
      });
      // Dismiss only AFTER the write lands, so a failed write leaves the card
      // in place to retry rather than silently vanishing.
      setDismissed(s => new Set(s).add(rec.id));
      toast('Executed', `${rec.clientName} · ${rec.objectLabel}`);
    } catch (e) {
      toast('Could not execute', e instanceof Error ? e.message : 'CRM write failed');
    }
  };

  const editRec = (rec: Recommendation) => {
    const kind: ModalKind = rec.kind === 'call' ? 'schedule' : rec.kind;
    open(kind, rec.clientName, rec.clientId, rec.title);
  };

  const pipelineNarrative = () => {
    const pipe = data.kpis.find(k => k.key === 'pipeline');
    const opps = data.kpis.find(k => k.key === 'openOpps');
    const pipeStr = pipe ? formatValue(pipe.value, pipe.format) : '—';
    const oppStr = opps ? formatValue(opps.value, opps.format) : '—';
    return `Your book holds ${pipeStr} open pipeline across ${oppStr} opportunities. Recent client touchpoints are running light — schedule outreach to keep relationships warm and move stalled deals this quarter.`;
  };

  // ── Generative-chip helpers ──────────────────────────────────
  const speakOrToast = (text: string) => {
    if (!speech.supported) {
      toast('Not supported', 'This browser has no speech synthesis');
      return;
    }
    speech.toggle(text);
  };

  const queueContext = () =>
    data.callList
      .map(c => `${c.clientName} · ${c.tier ?? 'watch'} · ${Math.round((c.score ?? 0) * 100)}% · ${c.reason}`)
      .join('\n');

  const queueFallback = () => {
    const top = data.callList.slice(0, 4);
    const lines = top.map(
      (c, i) => `${i + 1}. ${c.clientName} — ${c.reason} (priority ${Math.round((c.score ?? 0) * 100)}%).`,
    );
    return `Your queue is ranked by AI priority score, blending relationship value, urgency, and recent signals.\n\n${lines.join('\n')}\n\nHighest-scoring clients surface first so your earliest hours go to the accounts most likely to move today.`;
  };

  const stalledContext = () =>
    data.pipeline
      .filter(p => p.propensity < 0.7)
      .map(p => `${p.clientName} · ${p.name} · ${p.stage} · ${Math.round(p.propensity * 100)}% · $${p.amount}`)
      .join('\n');

  const stalledFallback = () => {
    const stalled = data.pipeline.filter(p => p.propensity < 0.7).sort((a, b) => b.amount - a.amount).slice(0, 4);
    if (!stalled.length) return 'No stalled deals — every open opportunity is above a 70% propensity to close.';
    const lines = stalled.map(
      p => `• ${p.clientName} — ${p.name} (${p.stage}), ${formatValue(p.amount, 'currencyCompact')} at ${Math.round(p.propensity * 100)}% propensity.`,
    );
    return `${pipelineNarrative()}\n\nLargest at-risk deals:\n${lines.join('\n')}\n\nEach has slipped below a 70% close propensity — prioritize a next touch to keep them from aging out.`;
  };

  const draftRows = (): DraftRow[] =>
    [...today, ...week].map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      subject: `Follow up: ${c.clientName}`,
      body: `Reach out to ${c.clientName} — ${c.reason}. Suggested next step: ${c.action}.`,
    }));

  const draftsContext = () => draftRows().map(d => `${d.clientName}: ${d.body}`).join('\n');

  const openAi = (task: 'queue_rationale' | 'pipeline_summary', title: string, prompt: string, context: string, fallback: string) =>
    setAiModal({ open: true, title, task, prompt, context, fallback });

  // ── Row-click routing. In the cockpit view every center row drives the
  //    right context panel; in the classic stacked view it opens the existing
  //    modal/popup. Keeping both behaviors behind these helpers lets the body
  //    fragments below stay single-sourced across the two layouts.
  const onScheduleOpen = (item: ScheduleItem) => {
    if (view === 'cockpit') {
      if (item.kind === 'meeting' || item.kind === 'call') selectMeetingPanel(item);
      else selectTaskPanel(item);
      return;
    }
    setDetailItem(item);
  };

  // Intercept the queue row's "open quick view" in cockpit mode → select the
  // client into the panel instead of opening the modal. The action-rail buttons
  // (why/prep/call/email/task) still flow through `open` as normal.
  const queueOpen = (type: ModalKind, name: string, id?: string, subject?: string, toAddress?: string) => {
    if (view === 'cockpit' && type === 'quickview') {
      selectClientPanel(name, id);
      return;
    }
    open(type, name, id, subject, toAddress);
  };

  // Quick-prompt routing for the panel's default-state "Ask Agentforce" chips.
  const askPrompt = (key: string) => {
    if (key === 'overnight') {
      openAi('queue_rationale', 'What changed overnight',
        'Summarize what changed across this book overnight in 3-4 sentences: new signals, emerging risks, and fresh opportunities.',
        queueContext(), queueFallback());
    } else if (key === 'prep') {
      openAi('pipeline_summary', 'Meetings needing prep',
        'Which of today’s meetings and deals need the most preparation, and what should I focus on for each? 3-4 sentences.',
        stalledContext(), stalledFallback());
    } else {
      openAi('queue_rationale', 'Which accounts need attention',
        'Which accounts need attention today and why? List the top 3-4 with the single most important reason for each.',
        queueContext(), queueFallback());
    }
  };

  const panelHandlers: WorkspacePanelHandlers = {
    onClear: () => setSelection({ kind: 'none' }),
    onOpenClient: id => openFull(id),
    onPrep: (name, id) => open('prep', name, id),
    onSchedule: (name, id, subject) => open('schedule', name, id, subject ?? 'Call'),
    onTask: (name, id, subject) => open('task', name, id, subject),
    onEmail: (name, id) => open('email', name, id),
    onAsk: askPrompt,
    onAgenda: id => {
      const item = data.schedule.find(s => s.id === id);
      if (item) onScheduleOpen(item);
    },
    onSoft: (title, message) => toast(title, message),
  };

  // Default-state payload for the right panel — AI brief + pulse + agenda +
  // top focus + quick prompts. Rebuilt each render from the live dashboard.
  const workspaceBrief: WorkspaceBrief = {
    greeting: `Today · ${data.dateLabel}`,
    headline: data.aiBriefHeadline,
    narrative: data.aiBrief,
    confidencePct: data.confidencePct,
    pulse: [
      { label: 'Wins · 30d', value: '$0', tone: 'warn' },
      { label: 'Activity · 7d', value: String(data.schedule.length) },
    ],
    agenda: data.schedule.map(s => ({ id: s.id, time: s.time, title: s.title, kind: s.kind, client: s.clientName })),
    focus: data.callList.slice(0, 4).map(c => ({
      label: c.clientName,
      sub: c.reason,
      meta: `${Math.round((c.score ?? 0) * 100)}%`,
    })),
    prompts: [
      { key: 'overnight', label: 'What changed overnight?' },
      { key: 'attention', label: 'Which accounts need attention?' },
      { key: 'prep', label: 'What meetings need prep?' },
    ],
  };

  /* ── Section bodies (defined once, arranged differently per view) ──
     Each body is the section's content WITHOUT its heading, so the two
     layout branches below can wrap it in either a full-width <SectionHead>
     block (current) or a compact column card (cockpit) without duplicating
     any markup. */

  const kpiGrid = (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
      {data.kpis.map(k => (
        <KpiCard
          key={k.key}
          label={k.label}
          value={formatValue(k.value, k.format)}
          note={k.note}
          risk={k.key === 'atRisk'}
          onClick={() => scrollToId(KPI_TARGET[k.key] ?? 'pipeline')}
        />
      ))}
    </div>
  );

  // Cockpit vitals: the four headline metrics as sparkline cards (mockup order:
  // Pipeline · Opportunities · At-Risk · Active Goals). Chosen from data.kpis by
  // key so it survives a KPI-set change; falls back to the first four.
  const VITAL_KEYS = ['pipeline', 'openOpps', 'atRisk', 'goals'];
  const vitalKpis = VITAL_KEYS.map(key => data.kpis.find(k => k.key === key)).filter(Boolean) as typeof data.kpis;
  const kpiGridVitals = (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      {(vitalKpis.length ? vitalKpis : data.kpis.slice(0, 4)).map(k => (
        <VitalCard
          key={k.key}
          label={k.label}
          value={formatValue(k.value, k.format)}
          note={k.note}
          deltaPct={k.deltaPct}
          trend={k.trend}
          risk={k.key === 'atRisk'}
          onClick={() => scrollToId(KPI_TARGET[k.key] ?? 'pipeline')}
        />
      ))}
    </div>
  );

  const scheduleControls = (
    <>
      <Button size="sm" variant="ghost" onClick={() => open('task', data.bankerName)}>+ Task</Button>
      <Button size="sm" variant="ghost" onClick={() => open('schedule', data.bankerName, undefined, 'Meeting')}>+ Meeting</Button>
    </>
  );
  const scheduleBody = <ScheduleTable items={tagSchedule(data.schedule)} onOpen={onScheduleOpen} />;

  const queueControls = <AskChip onClick={() => setDraftsOpen(true)}>Draft all follow-ups</AskChip>;
  const queueBody = (
    <>
      <QueueGroup label="Today" count={today.length} tier="Critical" tierClass="text-risk">
        {today.map(c => (
          <QRow key={c.id} item={c} rank={rankOf(c)} onOpen={queueOpen} />
        ))}
      </QueueGroup>
      {week.length > 0 && (
        <QueueGroup
          label="This week"
          count={week.length}
          tier="Important"
          tierClass="text-warn"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => week[0] && open('prep', week[0].clientName, week[0].clientId)}
            >
              Prep all {week.length}
            </Button>
          }
        >
          {week.map(c => (
            <QRow key={c.id} item={c} rank={rankOf(c)} onOpen={queueOpen} />
          ))}
        </QueueGroup>
      )}
      {watch.length > 0 && (
        <QueueGroup label="Watch" count={watch.length} tier="Lower urgency" tierClass="text-muted">
          {watch.map(c => (
            <QRow key={c.id} item={c} rank={rankOf(c)} onOpen={queueOpen} />
          ))}
        </QueueGroup>
      )}
    </>
  );

  const actionsControls = (
    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{visibleRecs.length} pending</span>
  );
  // `capped` trims the card list to the reveal window and appends a footer — used
  // in the cockpit column to hold its height; the classic view passes all cards.
  const buildActionsBody = (capped: boolean) => {
    const recs = capped ? recsReveal.visible : visibleRecs;
    return (
      <div className="grid gap-3.5">
        {recs.map(rec => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            onOpenClient={() => open('quickview', rec.clientName, rec.clientId)}
            onDismiss={() => {
              setDismissed(s => new Set(s).add(rec.id));
              toast('Dismissed', 'Recommendation removed — model will learn from this');
            }}
            onEdit={() => editRec(rec)}
            onApprove={() => void approveRec(rec)}
          />
        ))}
        {!visibleRecs.length && <p className="rounded-card border border-line bg-surface p-6 text-[13px] text-muted">All recommendations handled. Nice work.</p>}
        {capped && (recsReveal.hasMore || recsReveal.expanded) && (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <RevealFooter reveal={recsReveal} noun="actions" />
          </div>
        )}
      </div>
    );
  };
  const actionsBody = buildActionsBody(false);

  const lifeEventsBody = (
    <SectionPanel icon="lifeEvent" label="Life events across your book" right={<LinkBtn>Next 30 days</LinkBtn>}>
      {data.lifeEvents.map(e => (
        <LifeRow key={e.id} event={e} onClick={() => (view === 'cockpit' ? selectClientPanel(e.clientName, e.clientId) : showLifeEventDetail(e))} />
      ))}
    </SectionPanel>
  );

  const alertsBody = (
    <SectionPanel icon="alerts" label="Alerts & signals" right={<LinkBtn>{data.alerts.length} open</LinkBtn>}>
      {data.alerts.map(a => (
        <AlertRow key={a.id} alert={a} onClick={() => (view === 'cockpit' ? selectClientPanel(clientFromAlert(a.title)) : showAlertDetail(a))} />
      ))}
    </SectionPanel>
  );

  const pipelineControls = (
    <AskChip
      onClick={() =>
        openAi(
          'pipeline_summary',
          'Stalled deals',
          'Summarize the largest stalled deals below in 3-4 sentences and suggest the single next move for each.',
          stalledContext(),
          stalledFallback(),
        )
      }
    >
      Summarize stalled deals
    </AskChip>
  );
  const pipelineBody = (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[30%]" />
          <col className="w-[18%]" />
          <col className="w-[16%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Opportunity</Th>
            <Th>Stage</Th>
            <Th>Propensity</Th>
            <Th align="right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {pipelineReveal.visible.map(p => (
            <PipeRow key={p.id} item={p} onClick={() => (view === 'cockpit' ? selectOpportunityPanel(p) : showPipelineDetail(p))} />
          ))}
        </tbody>
      </table>
      <RevealFooter reveal={pipelineReveal} noun="deals" />
    </div>
  );

  const leadsBody = (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[28%]" />
          <col className="w-[22%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Source</Th>
            <Th>Status</Th>
            <Th align="right">Value</Th>
          </tr>
        </thead>
        <tbody>
          {leadsReveal.visible.map(l => (
            <LeadRow key={l.id} lead={l} onClick={() => open('email', l.name, undefined, undefined, l.email)} />
          ))}
        </tbody>
      </table>
      <RevealFooter reveal={leadsReveal} noun="leads" />
    </div>
  );

  const pulseBody = (
    <SectionPanel
      icon="pulse"
      label="Portfolio pulse"
      right={
        <button
          type="button"
          onClick={() => speakOrToast(pipelineNarrative())}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted transition hover:text-fg"
        >
          {speech.speaking ? '❚❚ Stop' : '▷ Listen'}
        </button>
      }
      padded
    >
      <p className="mb-4 max-w-[80ch] text-[14.5px] leading-relaxed text-fg">{pipelineNarrative()}</p>
      <div className="grid grid-cols-2 gap-3.5">
        <PulseCard label="Wins · 30d" value="$0" note="Nothing closed this period." tone="warn" />
        <PulseCard label="Activity · 7d" value={String(data.schedule.length)} note="Low volume — schedule touchpoints." />
      </div>
    </SectionPanel>
  );

  // Slim full-width variant for the cockpit vitals row — narrative on the left,
  // the two pulse stats inline on the right, so it reads as a single strip
  // under the KPI cards instead of a tall side panel.
  const pulseStrip = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
      <div className="flex items-center gap-2 flex-none">
        <Icon name="pulse" size={15} className="text-muted" />
        <b className="font-mono text-[11px] uppercase tracking-[0.14em]">Portfolio pulse</b>
      </div>
      <p className="min-w-[280px] flex-1 text-[13.5px] leading-snug text-muted">{pipelineNarrative()}</p>
      <div className="flex flex-none items-center gap-5">
        <PulseStat label="Wins · 30d" value="$0" tone="warn" />
        <span className="h-8 w-px bg-line" />
        <PulseStat label="Activity · 7d" value={String(data.schedule.length)} />
        <button
          type="button"
          onClick={() => speakOrToast(pipelineNarrative())}
          className="ml-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted transition hover:text-fg"
        >
          {speech.speaking ? '❚❚ Stop' : '▷ Listen'}
        </button>
      </div>
    </div>
  );

  // ── Compact AI Daily Brief strip (cockpit only) ──
  // The mockup's brief is a single dense line — icon + "AI Daily Brief" +
  // "Updated" chip + one sentence + "View full insights →" — NOT the tall hero
  // headline. It opens with the personalized welcome greeting restored from the
  // classic hero, then the dense brief line below it.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const briefStrip = (
    <div className="rounded-card border border-line bg-surface-glass px-5 py-4 shadow-card">
      {/* Welcome greeting — the personalized hero that anchored the classic
          view, restored here so the cockpit still opens with a named welcome
          before the dense AI brief line. */}
      <div className="mb-3.5 border-b border-line pb-3">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          <Icon name="sparkle" size={13} className="text-ai" /> Today · {data.dateLabel}
        </div>
        <h1 className="mt-2 font-display text-[26px] font-semibold leading-[1.1] tracking-tight">
          {greeting}, {data.bankerName}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon name="sparkle" size={15} className="text-ai" />
        <b className="text-[14px] font-semibold">AI Daily Brief</b>
        <span className="rounded-full bg-track px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Updated {data.dateLabel}
        </span>
        <button
          type="button"
          onClick={() =>
            openAi(
              'queue_rationale',
              'Full insights',
              "Give the banker a full morning briefing on this book in 4-6 sentences: the clients needing attention today, the emerging risks, and the opportunities worth acting on now.",
              queueContext(),
              queueFallback(),
            )
          }
          className="ml-auto inline-flex items-center gap-1 font-mono text-[11.5px] text-accent transition hover:opacity-80"
        >
          View full insights →
        </button>
      </div>
      <p className="mt-2.5 max-w-[92ch] text-[13.5px] leading-relaxed text-fg">
        <b className="font-semibold">{data.aiBriefHeadline}.</b> {data.aiBrief}
      </p>
    </div>
  );

  // ── Full-width supporting band (cockpit only) ──
  // The five secondary modules from the mockup, in a single responsive row:
  // Recent Activity · Pipeline Movement · At-Risk Clients · Today's Agenda ·
  // Top Opportunities. Each is a slim card with a "View all →" head and clickable
  // rows that drive the right context panel. Health scores for at-risk clients
  // are derived deterministically from severity + rank (no CallItem field yet).
  const atRiskClients = data.callList.filter(c => (c.tier ?? 'watch') === 'watch' || c.severity !== 'low').slice(0, 3);
  const healthFor = (c: CallItem) => {
    // High severity → low score; medium → mid; low → higher. Nudge by rank so
    // rows differ. Clamped to a plausible 40..82 "needs attention" band.
    const base = c.severity === 'high' ? 60 : c.severity === 'medium' ? 68 : 78;
    return Math.max(40, Math.min(82, base - (rankOf(c) - 1) * 3));
  };
  // Week-over-week health drop shown as a red "↓ N" beside the score (mockup).
  // Derived deterministically from severity + rank — no CallItem field yet.
  const healthDropFor = (c: CallItem) => {
    const base = c.severity === 'high' ? 8 : c.severity === 'medium' ? 5 : 6;
    return base + (rankOf(c) % 3);
  };
  const supportingBand = (
    <div className="@container/band">
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line-strong bg-line-strong shadow-card @[560px]/band:grid-cols-3 @[900px]/band:grid-cols-5">
      {/* Recent Activity */}
      <BandCard title="Recent Activity" onViewAll={() => setExplorer('activity')}>
        {data.activity.slice(0, 4).map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => (a.clientId || a.clientName ? selectClientPanel(a.clientName, a.clientId) : undefined)}
            className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-2.5 rounded-[9px] px-2 py-2.5 text-left transition hover:bg-surface-muted"
          >
            <span className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-[8px] ${ACTIVITY_CHIP[a.tone]}`}>
              <Icon name={a.icon} size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-fg">{a.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-faint">{a.clientName} · {a.when}</span>
            </span>
          </button>
        ))}
      </BandCard>

      {/* Pipeline Movement */}
      <BandCard title="Pipeline Movement" onViewAll={() => setExplorer('pipelineMovement')}>
        {data.pipelineMovement.slice(0, 4).map(m => {
          const up = m.deltaPct >= 0;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setExplorer('pipelineMovement')}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[9px] px-2 py-2.5 text-left transition hover:bg-surface-muted"
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{m.label}</span>
              <span className="flex-none text-right font-semibold text-[12.5px] text-fg">{formatValue(m.amount, 'currencyCompact')}</span>
              <span className={`flex-none font-mono text-[11px] ${up ? 'text-ok' : 'text-risk'}`}>
                {up ? '↑' : '↓'} {Math.abs(Math.round(m.deltaPct * 100))}%
              </span>
              <Sparkline points={m.trend} width={44} height={20} stroke={up ? 'var(--wp-pos)' : 'var(--wp-neg)'} className="flex-none opacity-90" />
            </button>
          );
        })}
      </BandCard>

      {/* At-Risk Clients */}
      <BandCard title="At-Risk Clients" onViewAll={() => setExplorer('atRisk')}>
        {atRiskClients.map(c => {
          const h = healthFor(c);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => selectClientPanel(c.clientName, c.clientId)}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[9px] px-2 py-2.5 text-left transition hover:bg-surface-muted"
            >
              <ScoreRing value={h} tone={h < 55 ? 'risk' : h < 70 ? 'warn' : 'ok'} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-fg">{c.clientName}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                  Health score <b className="font-semibold text-fg">{h}</b>
                  <span className="font-mono text-risk">↓ {healthDropFor(c)}</span>
                </span>
              </span>
              <Icon name="arrow" size={14} className="flex-none text-faint" />
            </button>
          );
        })}
      </BandCard>

      {/* Today's Agenda — a timeline rail (dots + connector), matching the 360
          panel's Activity idiom. Header carries a calendar glyph; footer links
          to the full calendar. */}
      <BandCard
        title="Today's Agenda"
        onViewAll={() => setExplorer('agenda')}
        headerIcon={<Icon name="event" size={14} />}
        divided={false}
        footer={
          <button
            type="button"
            onClick={() => setExplorer('agenda')}
            className="font-mono text-[11px] font-medium text-accent transition hover:opacity-80"
          >
            View full calendar →
          </button>
        }
      >
        <ol className="relative ml-[6px] mt-1 border-l border-line">
          {tagSchedule(data.schedule).slice(0, 5).map(s => (
            <li key={s.id} className="relative pl-3.5 pb-3.5 last:pb-0">
              <span
                aria-hidden="true"
                className={`absolute -left-[5px] top-[5px] h-2.5 w-2.5 rounded-full ring-2 ring-surface ${AGENDA_DOT[s.bucket ?? 'upcoming']}`}
              />
              <button
                type="button"
                onClick={() => onScheduleOpen(s)}
                className="-mr-2 flex w-[calc(100%+0.5rem)] items-start gap-2.5 rounded-[9px] px-2 py-1 text-left transition hover:bg-surface-muted"
              >
                <span className="mt-px w-[54px] flex-none font-mono text-[11px] text-muted">{s.time === 'done' ? '✓' : s.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-fg">{s.title}</span>
                  {s.clientName && <span className="mt-0.5 block truncate text-[11px] text-faint">{s.clientName}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </BandCard>

      {/* Top Opportunities — leading colored icon chip, "client – opp name",
          value + probability, and a Hot/Warm/Cool heat pill. */}
      <BandCard title="Top Opportunities" onViewAll={() => setExplorer('opportunities')}>
        {data.pipeline.slice(0, 4).map(p => {
          const heat = p.propensity >= 0.7 ? 'Hot' : p.propensity >= 0.45 ? 'Warm' : 'Cool';
          const heatClass = p.propensity >= 0.7 ? 'bg-risk-bg text-risk' : p.propensity >= 0.45 ? 'bg-warn-bg text-warn' : 'bg-accent-bg text-accent';
          const chipClass = p.propensity >= 0.7 ? 'bg-ok-bg text-ok' : p.propensity >= 0.45 ? 'bg-warn-bg text-warn' : 'bg-accent-bg text-accent';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => selectOpportunityPanel(p)}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-[9px] px-2 py-2.5 text-left transition hover:bg-surface-muted"
            >
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-[8px] ${chipClass}`}>
                <Icon name="pipeline" size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-fg">{p.clientName} – {p.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-faint">{formatValue(p.amount, 'currencyCompact')} · {Math.round(p.propensity * 100)}% probability</span>
              </span>
              <span className={`flex-none rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] ${heatClass}`}>{heat}</span>
            </button>
          );
        })}
      </BandCard>
    </div>
    </div>
  );

  return (
    <div className="pb-24">
      {/* ---------- DAILY BRIEF (classic view only — the cockpit uses a compact
           strip inside its left column so the context panel can align to the top) ---------- */}
      {view !== 'cockpit' && (
        <section id="brief" className="scroll-mt-[82px]">
          <div className="relative overflow-hidden rounded-[26px] border border-line bg-surface-glass p-8 shadow-card">
            <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
              <div>
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                  <Icon name="sparkle" size={13} className="text-ai" /> Today · AI daily brief
                </div>
                <h1 className="mb-4 mt-3.5 font-display text-[40px] font-semibold leading-[1.08] tracking-tight">
                  Good afternoon, {data.bankerName} — <span className="text-gradient-ai">{data.aiBriefHeadline}</span>.
                </h1>
                <p className="mb-6 max-w-[56ch] text-[15.5px] leading-relaxed text-fg">{data.aiBrief}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-[5px] w-[120px] overflow-hidden rounded-full bg-track">
                      <span className="block h-full rounded-full bg-gradient-ai" style={{ width: `${data.confidencePct}%` }} />
                    </div>
                    <small className="font-mono text-[11px] text-muted">AI confidence {data.confidencePct}%</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakOrToast(`${data.aiBriefHeadline}. ${data.aiBrief}`)}
                    className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-[12.5px] text-muted transition hover:border-accent-border hover:text-fg"
                  >
                    {speech.speaking ? '❚❚ Stop' : '▷ Listen to brief'}
                  </button>
                  <AskChip
                    onClick={() =>
                      openAi(
                        'queue_rationale',
                        'Why this order',
                        "Explain in 3-4 sentences why these clients are ranked in this order for a banker's day. Reference the priority scores.",
                        queueContext(),
                        queueFallback(),
                      )
                    }
                  >
                    Ask why this order
                  </AskChip>
                </div>
              </div>
              {data.rightNow && !dismissed.has('rightNow') && (
                <RightNowCard
                  item={data.rightNow}
                  onPrep={() => open('prep', data.rightNow!.clientName, data.rightNow!.clientId)}
                  onSchedule={() => open('schedule', data.rightNow!.clientName, data.rightNow!.clientId, data.rightNow!.taskSubject)}
                  onSnooze={() => {
                    setDismissed(s => new Set(s).add('rightNow'));
                    toast('Snoozed', 'Right Now item hidden for this session');
                  }}
                  onQuickView={() => open('quickview', data.rightNow!.clientName, data.rightNow!.clientId)}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {view === 'cockpit' ? (
        /* ==================== COCKPIT WORKSPACE ====================
           Master-detail command center matching the design mockup:
             • left column: compact AI brief → 4 KPI vitals → Priority Queue +
               Recommended Actions side-by-side
             • right column: a sticky context panel (AI brief until a row is
               clicked, then a tabbed Client-360)
             • full-width supporting band (5 glance modules) with a
               "Customize widgets / Show less" footer
             • always-rendered detail modules below carry the CommandRail nav
               anchors (#pipeline / #events / #leads / #pulse / #schedule).
           Left nav + pinned accounts live in the CommandRail (see HomeLayout). */
        <>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_384px]">
            {/* ---- LEFT: the primary workflow ---- */}
            <div className="min-w-0">
              {/* Compact AI Daily Brief strip */}
              <section id="brief" className="scroll-mt-[82px]">
                {briefStrip}
              </section>

              {/* Vitals: four sparkline KPI cards */}
              <section id="kpis" className="mt-4 scroll-mt-[82px]">
                {kpiGridVitals}
              </section>

              {/* Priority Queue + Recommended Actions, side by side */}
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
                <section id="queue" className="min-w-0 scroll-mt-[82px]">
                  <PriorityQueueCard
                    items={queueItems}
                    controls={queueControls}
                    onOpen={c => queueOpen('quickview', c.clientName, c.clientId)}
                    onViewAll={() => setExplorer('atRisk')}
                  />
                </section>

                <ColumnCard id="actions" eyebrow="Agentforce · pre-drafted" title="Recommended Actions" controls={actionsControls}>
                  {buildActionsBody(true)}
                </ColumnCard>
              </div>
            </div>

            {/* ---- RIGHT: the dynamic context panel (sticky) ---- */}
            <div className="sticky top-[92px] min-w-0">
              <WorkspacePanel selection={selection} brief={workspaceBrief} handlers={panelHandlers} />
            </div>
          </div>

          {/* ---- Full-width supporting band + footer ---- */}
          {bandExpanded && <div className="mt-4">{supportingBand}</div>}
          <div className="mt-3 flex items-center">
            <button
              type="button"
              onClick={() => toast('Customize widgets', 'Widget customization is coming soon')}
              className="inline-flex items-center gap-2 font-mono text-[11.5px] text-muted transition hover:text-fg"
            >
              <Icon name="metrics" size={14} /> Customize widgets
            </button>
            <button
              type="button"
              onClick={() => setBandExpanded(v => !v)}
              className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-1.5 text-[12px] text-muted transition hover:border-accent-border hover:text-fg"
            >
              {bandExpanded ? '⌃ Show less' : '⌄ Show more'}
            </button>
            <span className="w-[140px]" aria-hidden="true" />
          </div>

          {/* ---- Detail modules — full-fidelity, and the home of the remaining
               CommandRail nav anchors. Always rendered so #schedule / #pipeline /
               #events / #leads / #pulse always resolve. ---- */}
          <div className="mt-6 grid items-start gap-3.5 lg:grid-cols-2">
            <ColumnCard id="schedule" eyebrow="Tasks & meetings · book-wide" title="Tasks & schedule" controls={scheduleControls}>
              {scheduleBody}
            </ColumnCard>
            <ColumnCard id="pipeline" eyebrow="Open opportunities · by value" title="Pipeline" controls={pipelineControls}>
              {pipelineBody}
            </ColumnCard>
            <div id="events" className="min-w-0 scroll-mt-[82px]">
              <ColumnCard eyebrow="Data Cloud signals → opportunities" title="Life events">
                {lifeEventsBody}
                <div id="alerts" className="mt-3.5 scroll-mt-[82px]">{alertsBody}</div>
              </ColumnCard>
            </div>
            <ColumnCard id="leads" eyebrow="Inbound · routed to you" title="Leads & referrals">
              {leadsBody}
            </ColumnCard>
          </div>
          <section id="pulse" className="mt-3.5 scroll-mt-[82px]">{pulseStrip}</section>
        </>
      ) : (
        /* ==================== CURRENT VIEW (classic stacked) ==================== */
        <>
          {/* ---------- KPI PULSE ---------- */}
          <section id="kpis" className="mt-8 scroll-mt-[82px]">
            {kpiGrid}
          </section>

          {/* ---------- TASKS & SCHEDULE ---------- */}
          <section id="schedule" className="mt-8 scroll-mt-[82px]">
            <SectionHead eyebrow="Your tasks & meetings · book-wide" title="Tasks & schedule">
              {scheduleControls}
            </SectionHead>
            {scheduleBody}
          </section>

          {/* ---------- PRIORITY QUEUE ---------- */}
          <section id="queue" className="scroll-mt-[82px]">
            <SectionHead eyebrow="Ranked · click to open 360" title="Who to act on today">
              {queueControls}
            </SectionHead>
            {queueBody}
          </section>

          {/* ---------- RECOMMENDED ACTIONS ---------- */}
          <section id="actions" className="scroll-mt-[82px]">
            <SectionHead eyebrow="Agentforce · pre-drafted · you approve" title="Recommended actions">
              {actionsControls}
            </SectionHead>
            {actionsBody}
          </section>

          {/* ---------- LIFE EVENTS + ALERTS ---------- */}
          <section id="events" className="scroll-mt-[82px]">
            <SectionHead eyebrow="Data Cloud signals → opportunities" title="Life events & live signals" />
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="min-w-0">{lifeEventsBody}</div>
              <div id="alerts" className="min-w-0 scroll-mt-[82px]">{alertsBody}</div>
            </div>
          </section>

          {/* ---------- PIPELINE ---------- */}
          <section id="pipeline" className="scroll-mt-[82px]">
            <SectionHead eyebrow="Open opportunities · sorted by value" title="Pipeline">
              {pipelineControls}
            </SectionHead>
            {pipelineBody}
          </section>

          {/* ---------- LEADS + PORTFOLIO PULSE ---------- */}
          <section id="leads" className="scroll-mt-[82px]">
            <SectionHead eyebrow="Inbound · routed to you" title="Leads & referrals" />
            <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="min-w-0">{leadsBody}</div>
              <div id="pulse" className="min-w-0 scroll-mt-[82px]">{pulseBody}</div>
            </div>
          </section>
        </>
      )}

      {/* ---------- MODALS ---------- */}
      {modal.type === 'task' && (
        <TaskModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject} onSaved={refetch} />
      )}
      {modal.type === 'schedule' && (
        <ScheduleModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject ?? 'Call'} onSaved={refetch} />
      )}

      {/* ---- Supporting-band drill-in explorers (one per "View all →") ---- */}
      <DataExplorerModal<ActivityItem>
        open={explorer === 'activity'}
        onClose={() => setExplorer(null)}
        title="Recent Activity"
        subtitle="All account activity across your book"
        icon={<Icon name="pulse" size={17} />}
        rows={data.activity}
        searchPlaceholder="Search activity, clients…"
        searchText={a => `${a.title} ${a.clientName} ${a.tone}`}
        rowKey={a => a.id}
        onRowClick={a => showActivityDetail(a)}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'risk', label: 'Risk', test: a => a.tone === 'risk' },
          { key: 'opportunity', label: 'Opportunity', test: a => a.tone === 'opportunity' },
          { key: 'positive', label: 'Positive', test: a => a.tone === 'positive' },
        ]}
        columns={[
          { key: 'act', label: 'Activity', render: a => (
            <span className="flex items-center gap-2.5">
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-[8px] ${ACTIVITY_CHIP[a.tone]}`}><Icon name={a.icon} size={13} /></span>
              <span className="font-medium text-fg">{a.title}</span>
            </span>
          ) },
          { key: 'client', label: 'Client', render: a => a.clientName, hideBelow: 'sm' },
          { key: 'when', label: 'When', align: 'right', render: a => <span className="font-mono text-[11px] text-faint">{a.when}</span> },
        ]}
        footNote="Source · Data Cloud"
      />

      <DataExplorerModal<PipelineMovement>
        open={explorer === 'pipelineMovement'}
        onClose={() => setExplorer(null)}
        title="Pipeline Movement"
        subtitle="Week-over-week change by product line"
        icon={<Icon name="metrics" size={17} />}
        rows={data.pipelineMovement}
        searchPlaceholder="Search product lines…"
        searchText={m => m.label}
        rowKey={m => m.id}
        onRowClick={m => showPipelineMovementDetail(m)}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'up', label: 'Gaining', test: m => m.deltaPct >= 0 },
          { key: 'down', label: 'Declining', test: m => m.deltaPct < 0 },
        ]}
        columns={[
          { key: 'label', label: 'Product line', render: m => <span className="font-medium text-fg">{m.label}</span> },
          { key: 'amount', label: 'Value', align: 'right', render: m => <span className="font-semibold">{formatValue(m.amount, 'currencyCompact')}</span> },
          { key: 'delta', label: 'Change', align: 'right', render: m => (
            <span className={`font-mono ${m.deltaPct >= 0 ? 'text-ok' : 'text-risk'}`}>{m.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(Math.round(m.deltaPct * 100))}%</span>
          ) },
          { key: 'trend', label: 'Trend', align: 'right', hideBelow: 'sm', render: m => (
            <Sparkline points={m.trend} width={70} height={22} stroke={m.deltaPct >= 0 ? 'var(--wp-pos)' : 'var(--wp-neg)'} className="ml-auto" />
          ) },
        ]}
        footNote="Source · CRM pipeline"
      />

      <DataExplorerModal<CallItem>
        open={explorer === 'atRisk'}
        onClose={() => setExplorer(null)}
        title="At-Risk Clients"
        subtitle="Health scores and attention drivers"
        icon={<Icon name="alerts" size={17} />}
        rows={data.callList}
        searchPlaceholder="Search clients, reasons…"
        searchText={c => `${c.clientName} ${c.segment} ${c.reason} ${c.severity}`}
        rowKey={c => c.id}
        onRowClick={c => showClientDetail(c)}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'high', label: 'High', test: c => c.severity === 'high' },
          { key: 'medium', label: 'Medium', test: c => c.severity === 'medium' },
          { key: 'low', label: 'Low', test: c => c.severity === 'low' },
        ]}
        columns={[
          { key: 'health', label: 'Health', render: c => { const h = healthFor(c); return <ScoreRing value={h} tone={h < 55 ? 'risk' : h < 70 ? 'warn' : 'ok'} size={34} />; }, className: 'w-[70px]' },
          { key: 'client', label: 'Client', render: c => (
            <span className="min-w-0"><span className="block font-semibold text-fg">{c.clientName}</span><span className="block text-[11px] text-faint">{c.segment}</span></span>
          ) },
          { key: 'reason', label: 'Driver', render: c => <span className="text-muted">{c.reason}</span>, hideBelow: 'md' },
          { key: 'sev', label: 'Severity', align: 'right', render: c => (
            <Pill tone={c.severity === 'high' ? 'risk' : c.severity === 'medium' ? 'warn' : 'neutral'}>{c.severity}</Pill>
          ) },
        ]}
        footNote="Source · CSAT + Data Cloud signals"
      />

      <DataExplorerModal<ScheduleItem>
        open={explorer === 'agenda'}
        onClose={() => setExplorer(null)}
        title="Calendar & Agenda"
        subtitle="Tasks and meetings across your book"
        icon={<Icon name="event" size={17} />}
        rows={tagSchedule(data.schedule)}
        searchPlaceholder="Search tasks, meetings…"
        searchText={s => `${s.title} ${s.clientName ?? ''} ${s.kind} ${s.bucket ?? ''}`}
        rowKey={(s, i) => s.id ?? String(i)}
        onRowClick={s => setDetailItem(s)}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'overdue', label: 'Overdue', test: s => s.bucket === 'overdue' },
          { key: 'today', label: 'Today', test: s => s.bucket === 'today' },
          { key: 'upcoming', label: 'Upcoming', test: s => s.bucket === 'upcoming' },
        ]}
        columns={[
          { key: 'when', label: 'When', render: s => <span className="font-mono text-[11px] text-muted">{s.time === 'done' ? '✓' : s.time}</span>, className: 'w-[110px]' },
          { key: 'title', label: 'Item', render: s => (
            <span className="min-w-0"><span className="block font-semibold text-fg">{s.title}</span>{s.clientName && <span className="block text-[11px] text-faint">{s.clientName}</span>}</span>
          ) },
          { key: 'kind', label: 'Type', align: 'right', hideBelow: 'sm', render: s => <Pill tone="accent">{s.kind}</Pill> },
          { key: 'bucket', label: 'Status', align: 'right', render: s => (
            <Pill tone={s.bucket === 'overdue' ? 'risk' : s.bucket === 'today' ? 'accent' : 'neutral'}>{s.bucket ?? 'upcoming'}</Pill>
          ) },
        ]}
        footNote="Source · CRM tasks & events"
      />

      <DataExplorerModal<PipelineItem>
        open={explorer === 'opportunities'}
        onClose={() => setExplorer(null)}
        title="Top Opportunities"
        subtitle="Open pipeline by value and propensity"
        icon={<Icon name="pipeline" size={17} />}
        rows={data.pipeline}
        searchPlaceholder="Search opportunities, clients…"
        searchText={p => `${p.clientName} ${p.name} ${p.stage}`}
        rowKey={p => p.id}
        onRowClick={p => showPipelineDetail(p)}
        filters={[
          { key: 'all', label: 'All' },
          { key: 'hot', label: 'Hot', test: p => p.propensity >= 0.7 },
          { key: 'warm', label: 'Warm', test: p => p.propensity >= 0.45 && p.propensity < 0.7 },
          { key: 'cool', label: 'Cool', test: p => p.propensity < 0.45 },
        ]}
        columns={[
          { key: 'client', label: 'Client', render: p => <span className="font-semibold text-fg">{p.clientName}</span> },
          { key: 'opp', label: 'Opportunity', render: p => <span className="text-muted">{p.name}</span>, hideBelow: 'sm' },
          { key: 'stage', label: 'Stage', render: p => <Pill tone="neutral">{p.stage || '—'}</Pill>, hideBelow: 'md' },
          { key: 'prop', label: 'Propensity', align: 'right', render: p => (
            <Pill tone={p.propensity >= 0.7 ? 'ok' : p.propensity >= 0.45 ? 'warn' : 'accent'}>{Math.round(p.propensity * 100)}%</Pill>
          ) },
          { key: 'amount', label: 'Amount', align: 'right', render: p => <span className="font-semibold">{formatValue(p.amount, 'currencyCompact')}</span> },
        ]}
        footNote="Source · CRM pipeline"
      />

      {/* Row-detail popups render AFTER the explorers so they stack on top of
          the open list (both use the z-[100] Modal; later-in-DOM wins). Closing
          the detail returns the user to the list behind it. */}
      <ScheduleDetailModal
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        onSaved={refetch}
      />
      <DetailModal data={detailView} onClose={() => setDetailView(null)} />

      {modal.type === 'case' && (
        <CaseModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject} />
      )}
      {modal.type === 'email' && (
        <EmailModal open onClose={close} clientName={modal.name} clientId={modal.id} toAddress={modal.toAddress} promptFlow={flowFor(modal.id)} />
      )}
      {modal.type === 'prep' && (
        <PrepModal
          open
          onClose={close}
          clientName={modal.name}
          clientId={modal.id}
          profile={profileFor(modal.name)}
          promptFlow={flowFor(modal.id)}
          onSchedule={() => open('schedule', modal.name, modal.id, 'Call')}
          onMakeTask={n => open('task', modal.name, modal.id, n)}
        />
      )}
      {modal.type === 'quickview' && (
        <QuickViewModal
          open
          onClose={close}
          clientName={modal.name}
          clientId={modal.id}
          profile={profileFor(modal.name)}
          promptFlow={flowFor(modal.id)}
          onPrep={() => open('prep', modal.name, modal.id)}
          onSchedule={() => open('schedule', modal.name, modal.id, 'Call')}
          onTask={() => open('task', modal.name, modal.id)}
          onEmail={() => open('email', modal.name, modal.id)}
          onOpenFull={() => openFull(modal.id)}
        />
      )}
      {modal.type === 'why' && (
        <WhyModal
          open
          onClose={close}
          clientName={modal.name}
          reason={callByName.get(modal.name)?.reason ?? ''}
          scorePct={Math.round((callByName.get(modal.name)?.score ?? 0.8) * 100)}
          source={callByName.get(modal.name)?.source ?? 'SALESFORCE_CRM'}
          onPrep={() => open('prep', modal.name, modal.id)}
        />
      )}
      {aiModal?.open && (
        <AiResultModal
          open
          onClose={() => setAiModal(null)}
          title={aiModal.title}
          generate={(): Promise<AiGenerateResult> =>
            generateText(
              withConfig(aiModal.task, { task: aiModal.task, prompt: aiModal.prompt, context: aiModal.context })
            )
          }
          fallbackText={aiModal.fallback}
        />
      )}
      {draftsOpen && (
        <DraftFollowupsModal
          open
          onClose={() => setDraftsOpen(false)}
          drafts={draftRows()}
          enrich={(): Promise<AiGenerateResult> =>
            generateText(
              withConfig('followups', {
                task: 'followups',
                prompt:
                  'Rewrite each follow-up below as one concise, warm sentence. Return one line per client, in the same order, no numbering.',
                context: draftsContext(),
              })
            )
          }
        />
      )}
    </div>
  );
}

/* ── KPI → scroll-target section ─────────────────────────────────── */
const KPI_TARGET: Record<string, string> = {
  pipeline: 'pipeline',
  openOpps: 'pipeline',
  openCases: 'events',
  goals: 'pulse',
  atRisk: 'events',
};

/* ── Small local presentational helpers ──────────────────────────── */
function AskChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-ai-border px-3.5 py-2 text-[12.5px] text-ai transition hover:bg-ai-bg"
    >
      <span>✦</span>
      {children}
    </button>
  );
}

function LinkBtn({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{children}</span>;
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 mt-11 flex items-end gap-3.5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">{eyebrow}</div>
        <h2 className="mt-0.5 font-display text-[25px] font-semibold tracking-tight">{title}</h2>
      </div>
      {children && <div className="ml-auto flex items-center gap-2.5">{children}</div>}
    </div>
  );
}

/**
 * Cockpit-view column wrapper: a compact heading (eyebrow + title + optional
 * controls) over the section body, sized to sit in a ⅓-width grid track.
 * `min-w-0` lets a wide table shrink to the column instead of blowing out the
 * grid — the project's canonical grid-child rule.
 */
function ColumnCard({
  id,
  eyebrow,
  title,
  controls,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="min-w-0 scroll-mt-[82px]">
      <div className="mb-3 flex items-end gap-2.5">
        <div className="min-w-0">
          <div className="truncate font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">{eyebrow}</div>
          <h2 className="mt-0.5 font-display text-[19px] font-semibold tracking-tight">{title}</h2>
        </div>
        {controls && <div className="ml-auto flex flex-none items-center gap-2">{controls}</div>}
      </div>
      {children}
    </section>
  );
}

function KpiCard({ label, value, note, risk, onClick }: { label: string; value: string; note?: string; risk?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden rounded-[16px] border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent-border"
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${risk ? 'bg-risk' : 'bg-accent'}`} />
      <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <div className={`font-display text-[29px] font-semibold leading-none tracking-tight ${risk ? 'text-risk' : ''}`}>{value}</div>
      {note && <div className="mt-1.5 font-mono text-[11px] text-muted">{note}</div>}
    </button>
  );
}

/**
 * Cockpit vitals card — matches the mockup: label, big value, a sub-note, a
 * signed delta row (green up / red down; red arrow for a risk metric even when
 * the count rose), and a sparkline pinned to the card's foot. Trend/delta come
 * from the KPI view model; both are optional so a bare metric still renders.
 */
function VitalCard({
  label,
  value,
  note,
  deltaPct,
  trend,
  risk,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  deltaPct?: number;
  trend?: number[];
  risk?: boolean;
  onClick: () => void;
}) {
  const up = (deltaPct ?? 0) >= 0;
  // For a risk metric a rise is bad, so tint the delta red regardless of sign.
  const deltaClass = risk ? 'text-risk' : up ? 'text-ok' : 'text-risk';
  const stroke = risk ? 'var(--wp-neg)' : 'var(--wp-accent)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent-border"
    >
      <span className={`mb-2 block font-mono text-[10.5px] uppercase tracking-[0.14em] ${risk ? 'text-risk' : 'text-faint'}`}>{label}</span>
      <div className={`font-display text-[27px] font-semibold leading-none tracking-tight ${risk ? 'text-risk' : 'text-fg'}`}>{value}</div>
      {note && <div className="mt-1.5 text-[11.5px] text-muted">{note}</div>}
      <div className="mt-2.5 flex items-end justify-between gap-2">
        {deltaPct != null ? (
          <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${deltaClass}`}>
            {up ? '▲' : '▼'} {Math.abs(Math.round(deltaPct * 1000) / 10)}% <span className="text-faint">vs last</span>
          </span>
        ) : <span />}
        {trend && trend.length > 0 && (
          <Sparkline points={trend} width={68} height={26} stroke={stroke} fill className="flex-none opacity-90" />
        )}
      </div>
    </button>
  );
}

function QueueGroup({
  label,
  count,
  tier,
  tierClass,
  action,
  children,
}: {
  label: string;
  count: number;
  tier: string;
  tierClass: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-5 py-3.5">
        <b className="font-mono text-[11px] uppercase tracking-[0.14em]">{label}</b>
        <span className="grid h-5 w-5 place-items-center rounded-full bg-track font-mono text-[11px] text-muted">{count}</span>
        <span className={`ml-auto font-mono text-[10.5px] uppercase tracking-[0.14em] ${tierClass}`}>{tier}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function QRow({ item, rank, onOpen }: { item: CallItem; rank?: number; onOpen: (t: ModalKind, name: string, id?: string, subject?: string) => void }) {
  return (
    <PriorityQueueRow
      item={item}
      rank={rank}
      onOpenQuickView={() => onOpen('quickview', item.clientName, item.clientId)}
      onWhy={() => onOpen('why', item.clientName, item.clientId)}
      onPrep={() => onOpen('prep', item.clientName, item.clientId)}
      onCall={() => onOpen('schedule', item.clientName, item.clientId, 'Call')}
      onEmail={() => onOpen('email', item.clientName, item.clientId)}
      onTask={() => onOpen('task', item.clientName, item.clientId)}
    />
  );
}

function SectionPanel({
  icon,
  label,
  right,
  padded,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  right?: ReactNode;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <Icon name={icon} size={15} className="text-muted" />
        <b className="font-mono text-[11px] uppercase tracking-[0.14em]">{label}</b>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

function LifeRow({ event, onClick }: { event: LifeEventSignal; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 border-b border-line px-5 py-3.5 text-left transition last:border-b-0 hover:bg-surface-muted"
    >
      <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-warn-bg text-[16px]">{event.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{event.clientName}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted">{event.opportunity}</span>
      </span>
      <span className="flex-none text-right">
        <span className="block font-mono text-[11px] text-muted">{event.when}</span>
        <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{event.event}</span>
      </span>
    </button>
  );
}

function AlertRow({ alert, onClick }: { alert: AlertSignal; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 border-b border-line px-5 py-3.5 text-left transition last:border-b-0 hover:bg-surface-muted"
    >
      <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-risk" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{alert.title}</span>
        <span className="mt-0.5 block text-[12px] text-faint">{alert.detail}</span>
      </span>
      <span className="ml-auto flex-none font-mono text-[10px] uppercase text-faint">{alert.when}</span>
    </button>
  );
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`border-b border-line px-5 py-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function PipeRow({ item, onClick }: { item: PipelineItem; onClick: () => void }) {
  const hot = item.propensity >= 0.7;
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-line transition last:border-b-0 hover:bg-surface-muted">
      <td className="truncate px-5 py-3 font-semibold text-fg" title={item.clientName}>{item.clientName}</td>
      <td className="truncate px-5 py-3 text-muted" title={item.name}>{item.name}</td>
      <td className="px-5 py-3">
        <span className={`inline-block max-w-full truncate rounded-[6px] px-2.5 py-1 align-middle font-mono text-[10.5px] ${hot ? 'bg-accent-bg text-accent' : 'bg-track text-muted'}`} title={item.stage}>
          {item.stage}
        </span>
      </td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-2 text-muted">
          <span className="h-[5px] w-[46px] flex-none overflow-hidden rounded-full bg-track">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(item.propensity * 100)}%` }} />
          </span>
          {Math.round(item.propensity * 100)}%
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-fg">{formatValue(item.amount, 'currencyCompact')}</td>
    </tr>
  );
}

const LEAD_STATUS: Record<string, string> = {
  New: 'bg-ai-bg text-ai',
  Working: 'bg-warn-bg text-warn',
  Unqualified: 'bg-track text-faint',
  Qualified: 'bg-accent-bg text-accent',
};

function LeadRow({ lead, onClick }: { lead: LeadReferral; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-line transition last:border-b-0 hover:bg-surface-muted">
      <td className="truncate px-5 py-3 font-semibold text-fg" title={lead.name}>{lead.name}</td>
      <td className="truncate px-5 py-3 text-muted" title={lead.source}>{lead.source}</td>
      <td className="px-5 py-3">
        <span className={`inline-block max-w-full truncate rounded-full px-2.5 py-1 align-middle font-mono text-[10px] uppercase tracking-[0.06em] ${LEAD_STATUS[lead.status] ?? 'bg-track text-muted'}`} title={lead.status}>
          {lead.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right text-fg">{formatValue(lead.value, 'currencyCompact')}</td>
    </tr>
  );
}

/** Compact label-over-value stat for the slim Portfolio-pulse strip. */
function PulseStat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex-none text-right">
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className={`font-display text-[22px] font-semibold leading-tight ${tone === 'warn' ? 'text-warn' : 'text-fg'}`}>{value}</span>
    </div>
  );
}

function PulseCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'warn' }) {
  return (
    <div className="rounded-[16px] border border-line bg-surface p-5">
      <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <div className={`font-display text-[30px] font-semibold ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      <div className="mt-2 text-[12.5px] text-muted">{note}</div>
    </div>
  );
}

/** Tone → chip color for the Recent Activity glyphs in the supporting band. */
const ACTIVITY_CHIP: Record<'positive' | 'opportunity' | 'risk' | 'neutral', string> = {
  positive: 'bg-ok-bg text-ok',
  opportunity: 'bg-accent-bg text-accent',
  risk: 'bg-risk-bg text-risk',
  neutral: 'bg-track text-muted',
};

/** Schedule bucket → dot color for the Today's Agenda timeline rail. */
const AGENDA_DOT: Record<'overdue' | 'today' | 'upcoming', string> = {
  overdue: 'bg-risk',
  today: 'bg-accent',
  upcoming: 'bg-muted',
};

/**
 * A single column of the full-width supporting band — a titled card with a
 * "View all →" link and divided rows. The band renders five of these side by
 * side (2-up on md, 5-up on xl); the outer grid's `gap-px` on a `bg-line`
 * background draws the hairline separators between columns.
 */
function BandCard({
  title, onViewAll, children, headerIcon, footer, divided = true,
}: {
  title: string;
  onViewAll: () => void;
  children: ReactNode;
  /** Optional glyph rendered to the right of the "View all →" link (e.g. a calendar). */
  headerIcon?: ReactNode;
  /** Optional footer row below the rows (e.g. "View full calendar →"). */
  footer?: ReactNode;
  /** Hairline dividers between rows. Off for the timeline-rail columns. */
  divided?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col bg-surface px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <b className="truncate text-[12.5px] font-semibold">{title}</b>
        <button type="button" onClick={onViewAll} className="ml-auto flex-none font-mono text-[10.5px] text-accent transition hover:opacity-80">
          View all →
        </button>
        {headerIcon && <span className="flex-none text-faint">{headerIcon}</span>}
      </div>
      <div className={divided ? 'divide-y divide-line' : ''}>{children}</div>
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </section>
  );
}

/** "Low CSAT — Cooper Household" → "Cooper Household". */
function clientFromAlert(title: string): string {
  const idx = title.indexOf('— ');
  return idx >= 0 ? title.slice(idx + 2) : title;
}
