import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  useAsyncData,
  ToastProvider,
  useToast,
  Button,
  RightNowCard,
  PriorityQueueRow,
  RecommendationCard,
  TaskModal,
  ScheduleModal,
  CaseModal,
  EmailModal,
  PrepModal,
  QuickViewModal,
  WhyModal,
  Icon,
  formatValue,
  crmWrite,
  AiResultModal,
  DraftFollowupsModal,
  useSpeech,
  generateText,
  type ClientProfile,
  type CrmWriteInput,
  type DraftRow,
  type AiGenerateResult,
} from '@shared';
import { fetchHomeDashboard } from './homeData';
import type { CallItem, PipelineItem, LeadReferral, LifeEventSignal, AlertSignal, Recommendation } from './homeTypes';
import { AGENTFORCE_FLOWS } from '../personas/customer/agentforceFlows';
import { modeFor } from '../data/dataSource';

/* ── Rich mock profiles for prep / quick view (retail book) ───────── */
const PROFILES: Record<string, ClientProfile> = {
  'Julie E Morris': {
    initials: 'JM',
    descriptor: 'Retail household',
    since: '2016',
    csat: 'Poor · 62',
    value: '$1.24M',
    openCases: '5',
    facts: [
      ['Open opp', '$150K personal loan'],
      ['Overdue task', '270 days'],
      ['Open cases', '5'],
      ['Last contact', '9 mo ago'],
    ],
    recap:
      'Julie has banked with Cumulus for 9 years across a mortgage, two deposit accounts, and a brokerage link. Engagement dropped after a branch closure near her; CSAT slid to Poor over the last three surveys. A 401k rollover conversation started in 2024 was never closed, and a $150K personal-loan opportunity is sitting in Interested. Five open cases — most notably a lost debit card — are the likely CSAT driver.',
    talk:
      'Lead by resolving the lost-card case live on the call — that rebuilds trust before any product talk. Then reframe the idle rollover as a simple, guided next step and connect it to the personal-loan need she already raised.',
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
    facts: [
      ['Deal', '$3.0M CRE term loan'],
      ['Stage', 'Closing/Funding'],
      ['Probability', '80%'],
      ['Idle', '12 days'],
    ],
    recap:
      'AJC is a commercial real-estate borrower with a $3M term loan at the funding stage. Everything is verbally agreed but no activity has been logged in 12 days, and no funding date is set — the classic way an 80% deal slips a quarter.',
    talk:
      'Keep it operational and short: confirm the final documents received, name any open blocker, and put a funding date on the calendar before you hang up.',
    nba: ['Confirm final docs & appraisal received', 'Set a hard funding date', 'Send DocuSign package for signatures'],
  },
};

/* ── Modal state ──────────────────────────────────────────────────── */
type ModalKind = 'task' | 'schedule' | 'case' | 'email' | 'prep' | 'quickview' | 'why' | 'airesult' | 'drafts';
type ModalState =
  | { type: 'none' }
  | { type: ModalKind; name: string; id?: string; subject?: string };

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
  const { data, loading } = useAsyncData(fetchHomeDashboard, []);
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

  const callByName = useMemo(() => {
    const map = new Map<string, CallItem>();
    (data?.callList ?? []).forEach(c => map.set(c.clientName, c));
    return map;
  }, [data]);

  if (loading || !data) {
    return <div className="animate-pulse p-8 text-muted">Loading your book…</div>;
  }

  const open = (type: ModalKind, name: string, id?: string, subject?: string) => setModal({ type, name, id, subject });
  const close = () => setModal({ type: 'none' });
  const flowFor = (id?: string) => (modeFor('agentforce') === 'real' && id ? AGENTFORCE_FLOWS.account : undefined);
  const profileFor = (name: string) => PROFILES[name];
  const openFull = (id?: string) => {
    if (id) navigate(`/client/${id}`);
    else toast('Full 360', 'Open the client record for the complete view');
  };

  const today = data.callList.filter(c => c.tier === 'today');
  const week = data.callList.filter(c => c.tier === 'week');
  const watch = data.callList.filter(c => (c.tier ?? 'watch') === 'watch');
  const visibleRecs = data.recommendations.filter(r => !dismissed.has(r.id));

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

  return (
    <div className="pb-24">
      {/* ---------- DAILY BRIEF ---------- */}
      <section id="brief" className="scroll-mt-[82px]">
        <div className="relative overflow-hidden rounded-[26px] border border-line bg-surface-glass p-8 shadow-card">
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                <Icon name="sparkle" size={13} className="text-ai" /> Today · AI daily brief
              </div>
              <h1 className="mb-4 mt-3.5 font-display text-[40px] font-medium leading-[1.08] tracking-tight">
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

      {/* ---------- KPI PULSE ---------- */}
      <section id="kpis" className="mt-8 scroll-mt-[82px]">
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
      </section>

      {/* ---------- PRIORITY QUEUE ---------- */}
      <section id="queue" className="scroll-mt-[82px]">
        <SectionHead eyebrow="Ranked · click to open 360" title="Who to act on today">
          <AskChip onClick={() => setDraftsOpen(true)}>Draft all follow-ups</AskChip>
        </SectionHead>

        <QueueGroup label="Today" count={today.length} tier="Critical" tierClass="text-risk">
          {today.map(c => (
            <QRow key={c.id} item={c} onOpen={open} />
          ))}
        </QueueGroup>
        <QueueGroup
          label="This week"
          count={week.length}
          tier="Important"
          tierClass="text-warn"
          action={
            <Button
              size="sm"
              variant="ghost"
              disabled={!week.length}
              onClick={() => week[0] && open('prep', week[0].clientName, week[0].clientId)}
            >
              Prep all {week.length}
            </Button>
          }
        >
          {week.map(c => (
            <QRow key={c.id} item={c} onOpen={open} />
          ))}
        </QueueGroup>
        <QueueGroup label="Watch" count={watch.length} tier="Lower urgency" tierClass="text-muted">
          {watch.map(c => (
            <QRow key={c.id} item={c} onOpen={open} />
          ))}
        </QueueGroup>
      </section>

      {/* ---------- RECOMMENDED ACTIONS ---------- */}
      <section id="actions" className="scroll-mt-[82px]">
        <SectionHead eyebrow="Agentforce · pre-drafted · you approve" title="Recommended actions">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{visibleRecs.length} pending</span>
        </SectionHead>
        <div className="grid gap-3.5">
          {visibleRecs.map(rec => (
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
        </div>
      </section>

      {/* ---------- LIFE EVENTS + ALERTS ---------- */}
      <section id="events" className="scroll-mt-[82px]">
        <SectionHead eyebrow="Data Cloud signals → opportunities" title="Life events & live signals" />
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <SectionPanel icon="lifeEvent" label="Life events across your book" right={<LinkBtn>Next 30 days</LinkBtn>}>
            {data.lifeEvents.map(e => (
              <LifeRow key={e.id} event={e} onClick={() => open('quickview', e.clientName, e.clientId)} />
            ))}
          </SectionPanel>
          <div id="alerts" className="scroll-mt-[82px]">
            <SectionPanel icon="alerts" label="Alerts & signals" right={<LinkBtn>{data.alerts.length} open</LinkBtn>}>
              {data.alerts.map(a => (
                <AlertRow key={a.id} alert={a} onClick={() => open('quickview', clientFromAlert(a.title))} />
              ))}
            </SectionPanel>
          </div>
        </div>
      </section>

      {/* ---------- PIPELINE ---------- */}
      <section id="pipeline" className="scroll-mt-[82px]">
        <SectionHead eyebrow="Open opportunities · sorted by value" title="Pipeline">
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
        </SectionHead>
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <table className="w-full text-[13px]">
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
              {data.pipeline.map(p => (
                <PipeRow key={p.id} item={p} onClick={() => open('quickview', p.clientName)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- LEADS + PORTFOLIO PULSE ---------- */}
      <section id="leads" className="scroll-mt-[82px]">
        <SectionHead eyebrow="Inbound · routed to you" title="Leads & referrals" />
        <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map(l => (
                  <LeadRow key={l.id} lead={l} onClick={() => open('email', l.name)} />
                ))}
              </tbody>
            </table>
          </div>
          <div id="pulse" className="scroll-mt-[82px]">
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
          </div>
        </div>
      </section>

      {/* ---------- MODALS ---------- */}
      {modal.type === 'task' && (
        <TaskModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject} />
      )}
      {modal.type === 'schedule' && (
        <ScheduleModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject ?? 'Call'} />
      )}
      {modal.type === 'case' && (
        <CaseModal open onClose={close} clientName={modal.name} clientId={modal.id} subjectDefault={modal.subject} />
      )}
      {modal.type === 'email' && (
        <EmailModal open onClose={close} clientName={modal.name} clientId={modal.id} promptFlow={flowFor(modal.id)} />
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
            generateText({ task: aiModal.task, prompt: aiModal.prompt, context: aiModal.context })
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
            generateText({
              task: 'followups',
              prompt:
                'Rewrite each follow-up below as one concise, warm sentence. Return one line per client, in the same order, no numbering.',
              context: draftsContext(),
            })
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
        <h2 className="mt-0.5 font-display text-[25px] font-medium tracking-tight">{title}</h2>
      </div>
      {children && <div className="ml-auto flex items-center gap-2.5">{children}</div>}
    </div>
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
      <div className={`font-display text-[29px] font-medium leading-none tracking-tight ${risk ? 'text-risk' : ''}`}>{value}</div>
      {note && <div className="mt-1.5 font-mono text-[11px] text-muted">{note}</div>}
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

function QRow({ item, onOpen }: { item: CallItem; onOpen: (t: ModalKind, name: string, id?: string, subject?: string) => void }) {
  return (
    <PriorityQueueRow
      item={item}
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
      <td className="px-5 py-3 font-semibold text-fg">{item.clientName}</td>
      <td className="px-5 py-3 text-muted">{item.name}</td>
      <td className="px-5 py-3">
        <span className={`rounded-[6px] px-2.5 py-1 font-mono text-[10.5px] ${hot ? 'bg-accent-bg text-accent' : 'bg-track text-muted'}`}>
          {item.stage}
        </span>
      </td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-2 text-muted">
          <span className="h-[5px] w-[46px] overflow-hidden rounded-full bg-track">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(item.propensity * 100)}%` }} />
          </span>
          {Math.round(item.propensity * 100)}%
        </span>
      </td>
      <td className="px-5 py-3 text-right font-semibold text-fg">{formatValue(item.amount, 'currencyCompact')}</td>
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
      <td className="px-5 py-3 font-semibold text-fg">{lead.name}</td>
      <td className="px-5 py-3 text-muted">{lead.source}</td>
      <td className="px-5 py-3">
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${LEAD_STATUS[lead.status] ?? 'bg-track text-muted'}`}>
          {lead.status}
        </span>
      </td>
      <td className="px-5 py-3 text-right text-fg">{formatValue(lead.value, 'currencyCompact')}</td>
    </tr>
  );
}

function PulseCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'warn' }) {
  return (
    <div className="rounded-[16px] border border-line bg-surface p-5">
      <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <div className={`font-display text-[30px] font-medium ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      <div className="mt-2 text-[12.5px] text-muted">{note}</div>
    </div>
  );
}

/** "Low CSAT — Cooper Household" → "Cooper Household". */
function clientFromAlert(title: string): string {
  const idx = title.indexOf('— ');
  return idx >= 0 ? title.slice(idx + 2) : title;
}
