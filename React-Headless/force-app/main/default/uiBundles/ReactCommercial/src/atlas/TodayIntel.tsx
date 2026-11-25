import { AtlasGreeting } from '@shared/components/atlas/AtlasGreeting';
import { AtlasActionReview } from '@shared/components/atlas/AtlasActionReview';
import { Link, useSearchParams } from 'react-router';
import { TodayOffers, type Offer } from './Growth';
import { RecordedAgendaPreview } from './Work';
import { generateBookBrief } from './bookBrief';
import { BookReview, OverviewPulse } from './BookReview';
import { useRef, useState } from 'react';
import { fetchNetFlow, generateText, loadCenterConfig, type NetFlowWeek } from '@shared';
import { fetchPipeline } from '@shared/components/atlas/atlasPipelineData';
import { nodes, readPipeline, readWork, recordKey, str, verifyAccounts } from './commercialData';
import { Badge, Button, cash, day, Heading, Inspect, Panel, Pending, RouteLink, Tabs, useLive } from './controls';
import { Bot, CalendarCheck, FileSearch, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import { readPriorities, readSignals, type Signal } from './signals';
import { SourceMark } from './sources';

export type Followup = (item: Signal) => void;
/** Agentforce preparation text: **bold** spans render as <strong> (no raw asterisks), line breaks kept. */
export function PrepText({ text }: { text: string }) {
  return <p style={{ whiteSpace: 'pre-wrap' }}>{text.trim().split(/(\*\*[^*]+\*\*)/).map((part, i) => /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/\*\*/g, ''))}</p>;
}
function DriverBreakdown({ drivers }: { drivers: NonNullable<Signal['drivers']> }) {
  return <div className="ca-drivers">{drivers.map(d => <div key={d.driver} data-driver={d.driver}><span>{d.driver}</span><i><b style={{ width: `${Math.min(100, d.points / .3 * 100)}%` }} /></i><strong>{(d.points * 100).toFixed(1)} pts</strong></div>)}</div>;
}

export function SignalDetail({ row, followup, closeCompany, firstMove, ownerId }: { ownerId?: string; row: Signal; followup: Followup; closeCompany?: boolean; firstMove?: boolean }) {
  const [view, setView] = useState<'prep' | 'evidence' | ''>('');
  const [generated, setGenerated] = useState('');
  const [busy, setBusy] = useState(false);
  const prepare = () => {
    setView('prep');
    setBusy(true);
    void loadCenterConfig('commercial').then(config => generateText({ modelName: config.models.queue_rationale, ...config.params, task: 'queue_rationale', prompt: 'Prepare for a commercial banker conversation. Use this observation as a question and suggest a next step. Do not invent facts or make a credit determination.', context: JSON.stringify({ company: row.company, source: row.source, observation: row.title, evidence: row.detail, date: row.date }) }))
      .then(r => setGenerated(r.text)).catch(() => setGenerated('')).finally(() => setBusy(false));
  };
  const review = <AtlasActionReview ownerId={ownerId} key={row.id} name={row.company} accountId={row.accountId} subject={row.title} note={row.detail} />;
  return <>
    {firstMove ? <div className="ca-priority-actions">
      <Button onClick={prepare} style="primary">Prepare me</Button>
      <RouteLink to={`/client/${row.accountId}`} style="secondary">Open company</RouteLink>
      {review}
    </div> : <>
      <div className="ca-actions"><Button onClick={prepare} style="primary">Prepare conversation</Button><Button onClick={() => followup(row)}>Draft follow-up</Button>
      {!closeCompany && <RouteLink to={`/client/${row.accountId}`}>Open company</RouteLink>}<Button style="text-button" onClick={() => setView('evidence')}>Source evidence</Button>
    </div>
    {review}</>}
    {view && <Inspect title={view === 'prep' ? `Prepare · ${row.company}` : `${row.company} · ${row.source}`} subtitle={view === 'prep' ? 'Agentforce conversation prep, grounded in Data 360 evidence' : row.family} icon={view === 'prep' ? <Sparkles size={20} /> : <SourceMark source={row.source} size={20} />} size="md" onClose={() => setView('')}>
      <div className={view === 'prep' ? 'ca-prep' : 'ca-evidence'}>{view === 'prep' ? <div className="ca-prep-signal"><span className="ca-prep-signal-head"><Badge>{row.source}</Badge><time>{day(row.date)}</time></span><h2>{row.title}</h2><p>{row.detail}</p></div> : <><Badge>{row.source}</Badge><h2>{row.title}</h2><p>{row.detail}</p><p>{day(row.date)}</p></>}
        {view === 'prep' ? <>
        <section className="ca-prep-answer" aria-live="polite"><header><Bot size={18} /><strong>Agentforce suggests</strong></header>{busy ? <p role="status" className="ca-prep-loading"><Loader2 size={16} className="ca-spin" />Preparing with Agentforce…</p> : generated ? <PrepText text={generated} /> : <p>No preparation returned. Use the evidence below.</p>}</section>
        <div className="ca-conversation ca-prep-tips">
          <div><MessageCircle size={18} /><span><strong>Start with their business</strong><p>Confirm what changed and how it affects day-to-day operations.</p></span></div>
          <div><FileSearch size={18} /><span><strong>Bring the evidence</strong><p>Review the source date and confirm the observation with the company.</p></span></div>
          <div><CalendarCheck size={18} /><span><strong>Agree a useful next step</strong><p>Capture the company’s need and the right owner for the next conversation.</p></span></div>
        </div>
        <div className="ca-actions">
          <Button onClick={() => { setView(''); followup(row); }} style="primary">Keep preparation as a task proposal</Button>
          <Button onClick={() => setView('evidence')}>Inspect source</Button>
        </div></> : <>
          {row.drivers?.length ? <DriverBreakdown drivers={row.drivers} /> : null}
          <dl className="ca-fields"><div><dt>Source</dt><dd>{row.source}</dd></div><div><dt>Company Account</dt><dd>{row.accountId}</dd></div></dl>
          <div className="ca-actions"><Button onClick={() => { setView(''); followup(row); }}>Draft follow-up</Button>
            {!closeCompany && <RouteLink to={`/client/${row.accountId}`}>Open company</RouteLink>}</div>
        </>}
      </div>
    </Inspect>}
  </>;
}

function Flow({ weeks }: { weeks: NetFlowWeek[] }) {
  const max = Math.max(1, ...weeks.map(r => Math.abs(r.net)));
  return <div className="ca-flow" role="img" aria-label="Business weekly net flow, credits minus debits"><span className="ca-zero">0</span>
    {weeks.map(r => <div key={r.week} title={`${r.week} · ${cash(r.net)}`}><div className="ca-flow-track"><b className={r.net < 0 ? 'negative' : ''} style={{ height: `${Math.max(2, Math.abs(r.net) / max * 45)}%`, [r.net < 0 ? 'top' : 'bottom']: '50%' }} /></div><small>{r.week.slice(5)}</small></div>)}
  </div>;
}
function DailyBrief({ evidence }: { evidence: string }) {
  const [params] = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(params.get('brief') === 'open');
  const request = useRef<{ key: string; result: Promise<string> } | null>(null);
  const key = JSON.stringify([evidence, attempt]);
  const brief = useLive(() => {
    if (request.current?.key === key) return request.current.result;
    const result = generateBookBrief(evidence);
    request.current = { key, result };
    return result;
  }, key);
  const paragraphs = brief.value?.split(/\n\s*\n/);
  const preview = paragraphs?.find(p => p.trim().split(/\s+/).length >= 25) ?? brief.value;
  return <section className="ca-brief-band"><h2>Daily brief</h2>
    {brief.pending ? <p role="status">Preparing your book briefing with Agentforce…</p> :
      brief.error ? <><p role="status">A complete AI brief is unavailable.</p><Button onClick={() => setAttempt(n => n + 1)}>Try again</Button></> :
      <p>{preview}</p>}
    {paragraphs && <Button onClick={() => setOpen(true)}>Read daily brief</Button>}
    {open && paragraphs && <Inspect title="Daily brief" onClose={() => setOpen(false)}><Badge>Generated by Agentforce</Badge>{paragraphs.map((p,i) => <p key={i}>{p}</p>)}</Inspect>}
  </section>;
}

const bookViews = [['overview', 'Overview'], ['portfolio', 'Portfolio pulse'], ['agenda', 'Agenda & pipeline'], ['actions', 'Action workspace'], ['offers','Offer opportunities']] as const;
type TodayProps = { owner: string; ownerName: string; actor?: string; actorName?: string; saveBatch: (rows: Signal[]) => void; followup: Followup };
export function Today({ draft, ...props }: TodayProps & { draft: (offer: Offer) => void }) {
  const [params] = useSearchParams();
  const [review,label] = bookViews.find(([key]) => key === params.get('review')) ?? bookViews[0];
  return <>
    <div className="cr-today-header"><nav className="cr-today-nav" aria-label="Today views">{bookViews.map(([key,title]) => {
      const next = new URLSearchParams(params);
      next.delete('flow');
      if (key === 'overview') next.delete('review'); else next.set('review',key);
      return <Link key={key} to={{ pathname:'/', search:next.toString() }} aria-current={key === review ? 'page' : undefined}>{title}</Link>;
    })}</nav><AtlasGreeting name={props.actorName} /></div>
    {review === 'overview' ? <TodayOverview {...props} /> : <>
      <header className="cr-view-heading"><p>{props.ownerName} · Commercial banking</p><h1>{label}</h1></header>
      {review === 'offers' ? <TodayOffers owner={props.owner} draft={draft} /> : review === 'actions' ? <TodayOverview {...props} actionsOnly /> : <BookReview tab={review} owner={props.owner} name={props.ownerName} />}
    </>}
  </>;
}

function TodayOverview({ owner, ownerName, actor, followup, saveBatch, actionsOnly = false }: TodayProps & {actionsOnly?: boolean}) {
  const [params, setParams] = useSearchParams();
  const [ledger, setLedger] = useState<'agenda' | 'deals'>('agenda');
  const [tier, setTier] = useState('all');
  const [selected, setSelected] = useState('');
  const showFlow = params.get('flow') === 'weekly';
  const setShowFlow = (open: boolean) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (open) next.set('flow', 'weekly'); else next.delete('flow');
    return next;
  });
  const snoozeKey = `atlas-commercial-snoozed:${owner}`;
  const [snoozed, setSnoozed] = useState<string[]>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(snoozeKey) ?? '[]'); return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : []; } catch { return []; }
  });
  const snooze = (ids: string[]) => { setSnoozed(ids); try { localStorage.setItem(snoozeKey, JSON.stringify(ids)); } catch { /* storage may be unavailable */ } };
  const priorities = useLive(() => readPriorities(owner), owner);
  const signals = useLive(() => readSignals(owner), owner);
  const pipeline = useLive(() => readPipeline(owner), owner);
  const amount = useLive(() => fetchPipeline(owner), owner);
  const flow = useLive(() => fetchNetFlow(owner, 'Business', true), owner);
  const activity = useLive(async (): Promise<Signal[]> => {
    const [deals, tasks] = await Promise.all([readPipeline(owner), readWork(owner, 'tasks')]);
    const opportunities = nodes(deals.Opportunity);
    const pending = nodes(tasks.Records).filter(task => {
      const due = str(task, 'ActivityDate');
      return due && due < new Date().toISOString().slice(0, 10) && str(task, 'Status') !== 'Completed';
    });
    const accounts = await verifyAccounts(owner, [...opportunities.map(r => str(r, 'AccountId')), ...pending.map(r => str(r, 'WhatId'))]);
    return [...opportunities.flatMap(deal => {
      const a = accounts.get(recordKey(str(deal, 'AccountId')));
      return a ? [{ id: deal.Id, accountId: a.Id, company: str(a, 'Name'), family: 'Open opportunity', source: 'Salesforce Opportunity',
        title: str(deal, 'Name'), detail: `${str(deal, 'StageName')} · ${cash(str(deal, 'Amount'))}`, date: str(deal, 'CloseDate'), tier: 'watch' }] : [];
    }), ...pending.flatMap(task => {
      const a = accounts.get(recordKey(str(task, 'WhatId')));
      return a ? [{ id: task.Id, accountId: a.Id, company: str(a, 'Name'), family: 'Overdue task', source: 'Salesforce Task',
        title: str(task, 'Subject'), detail: str(task, 'Description'), date: str(task, 'ActivityDate'), tier: 'today' }] : [];
    })] satisfies Signal[];
  }, owner);
  const ranked = priorities.value?.rows ?? [];
  const covered = new Set(ranked.map(r => recordKey(r.accountId)));
  const market = signals.value?.rows.find(r => ['Competitor research', 'Champion departure', 'Funding', 'Intent surge'].includes(r.family)
    && !covered.has(recordKey(r.accountId)) && !snoozed.includes(r.id));
  const rows = [...ranked, ...(activity.value ?? [])].filter(r => !snoozed.includes(r.id)).slice(0, market ? 7 : 8);
  if (market) rows.push({ ...market, tier: 'week' });
  const shown = rows.filter(r => tier === 'all' || r.tier === tier);
  const first = rows[0];
  const row = shown.find(r => r.id === selected) ?? shown[0];
  const observations = ['ACH receipts', 'Fee pressure', 'Call sentiment', 'Screening change'].flatMap(f => signals.value?.rows.find(r => r.family === f) ?? []);
  const [observation, setObservation] = useState<Signal>();
  const pinKey = 'atlas.review.pins.' + (actor ?? '') + '.' + owner;
  const [pins,setPins] = useState<Signal[]>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(pinKey) ?? '[]'); return Array.isArray(saved) ? saved.filter(p => p?.id && p.accountId && p.title) : []; } catch { return []; }
  });
  const storePins = (next: Signal[]) => { setPins(next); try { sessionStorage.setItem(pinKey,JSON.stringify(next)); } catch { /* tab storage unavailable */ } };
  const [batch,setBatch] = useState<string[]>();
  const reviewPins = () => setBatch(pins.map(p => p.id));
  const batchDialog = batch && <Inspect title="Review pinned follow-ups" onClose={() => setBatch(undefined)}>
    {pins.length ? <p>Choose the company follow-ups to keep as local task proposals.</p> : <p>Pin a recommendation in the action workspace to prepare its follow-up here.</p>}
    {pins.map(p => <label className="cr-pinned-row" key={p.id}><input type="checkbox" checked={batch.includes(p.id)} onChange={e => setBatch(e.target.checked ? [...batch,p.id] : batch.filter(id => id !== p.id))} /><span><strong>{p.company}</strong><small>{p.title}</small></span></label>)}
    <div className="ca-actions">{batch.length > 0 && <Button style="primary" onClick={() => { saveBatch(pins.filter(p => batch.includes(p.id))); storePins(pins.filter(p => !batch.includes(p.id))); setBatch(undefined); }}>Draft selected follow-ups</Button>}
    <RouteLink to="/work?sub=drafts">Open local proposals</RouteLink></div></Inspect>;
  const queuePanel = <Panel title={actionsOnly ? "Ranked company work" : "Action workspace"} action={snoozed.length > 0 && <Button style="text-button" onClick={() => snooze([])}>Restore snoozed</Button>}>
      <Tabs choices={[[ 'all', 'All work' ], [ 'today', 'Act today' ], [ 'week', 'This week' ], [ 'watch', 'Watch' ]]} value={tier} onChange={setTier} />
      <Pending state={priorities}><div className="ca-master-detail"><div className="ca-queue">
        {shown.map((item, i) => <button key={item.id} aria-pressed={row?.id === item.id} onClick={() => setSelected(item.id)}><span className="ca-rank">{i + 1}</span><span><strong>{item.company}</strong><small>{item.title}</small><small>{item.source}{item.date ? ` · ${day(item.date)}` : ''}</small></span><em>{item.score == null ? 'Signal' : Math.round(item.score * 100)}</em></button>)}
      </div><article data-agent-record={row?.accountId} data-agent-label={row?.company} data-agent-observation={row && [row.source,row.title,row.detail,row.date].filter(Boolean).join(' · ')} className="ca-detail">{row ? <><button className="cr-pin" aria-pressed={pins.some(p => p.id === row.id)} onClick={() => storePins(pins.some(p => p.id === row.id) ? pins.filter(p => p.id !== row.id) : [...pins,row])}>{pins.some(p => p.id === row.id) ? 'Pinned' : 'Pin for follow-up'}</button><Badge>{row.source}</Badge><h3>{row.company}</h3><p>{row.detail}</p>
        {row.source === 'Salesforce Opportunity' && <RouteLink to={`/pipeline?deal=${row.id}`}>Open exact opportunity</RouteLink>}
        {row.drivers?.length ? <DriverBreakdown drivers={row.drivers} /> : null}
        <SignalDetail ownerId={owner} key={row.id} row={row} followup={followup} /><Button style="text-button" onClick={() => snooze([...snoozed, row.id])}>Snooze this recommendation</Button>
      </> : <p>No recommendations in this view.</p>}</article></div></Pending>
    <div className="cr-work-footer"><span>Pinned follow-ups <strong>{pins.length}</strong></span><Button style="text-button" onClick={reviewPins}>Review follow-ups →</Button></div></Panel>;
  if (actionsOnly) return <>{queuePanel}<div className="cr-focus-grid"><Panel title="Prepared actions"><Pending state={priorities}>{shown.slice(0,3).map(p => <article className="cr-prepared" key={p.id}><strong>{p.company}</strong><p>{p.title}</p><div className="ca-actions"><Button onClick={() => followup(p)}>Review follow-up</Button><Button style="text-button" onClick={() => snooze([...snoozed,p.id])}>Snooze</Button></div></article>)}{!shown.length && <p>No recommendations match this queue filter.</p>}</Pending></Panel>
    <Panel title="Pinned follow-ups" action={<Button style="text-button" onClick={reviewPins}>Review batch</Button>}>{pins.length ? pins.map(p => <div key={p.id} className="cr-source"><strong>{p.company}</strong><RouteLink to={'/client/'+p.accountId}>Open company</RouteLink></div>) : <p>Pin a company recommendation above to include it in a batch of follow-ups.</p>}</Panel></div>{batchDialog}</>;
  return <>{batchDialog}
    <section className="ca-hero ca-overview-hero"><div><h1>Commercial portfolio overview</h1>
      {priorities.value && <p>{`${priorities.value.clients.toLocaleString()} companies scored. ${priorities.value.multi.toLocaleString()} have multiple risk drivers.`}</p>}
      <div className="ca-pulse"><RouteLink style="" to="/health"><strong>{priorities.value?.multi.toLocaleString() ?? '—'}</strong><span>Multiple risk drivers</span></RouteLink><RouteLink style="" to="/pipeline"><strong>{cash(amount.value?.amount)}</strong><span>{pipeline.value?.Opportunity?.totalCount?.toLocaleString() ?? '—'} open opportunities</span></RouteLink><button onClick={() => setShowFlow(true)}><strong>{cash(flow.value?.last?.net)}</strong><span>Business net flow · latest full week</span></button></div>
    {(priorities.pending || amount.pending || flow.pending || signals.pending
      ? <section className="ca-brief-band"><h2>Daily brief</h2><p role="status">Gathering your book data…</p></section>
      : priorities.value || amount.value || flow.value?.last || observations.length
        ? <DailyBrief key={owner} evidence={JSON.stringify({
          banker: ownerName, asOf: new Date().toLocaleDateString('en-CA'), companiesScored: priorities.value?.clients,
          companiesWithMultipleRiskDrivers: priorities.value?.multi, openPipeline: amount.value?.amount == null ? undefined : cash(amount.value.amount),
          latestCompletedBusinessWeek: flow.value?.last && {
            week: flow.value.last.week, credits: cash(flow.value.last.credits), debits: cash(flow.value.last.debits),
            netFlow: cash(flow.value.last.net), transactions: flow.value.last.transactions, accounts: flow.value.last.accounts,
          }, signals: [...ranked.slice(0,2), ...observations].map(
            ({ company, source, title, detail, date }) => ({ company, source, title, detail, date })),
        })} />
        : <section className="ca-brief-band"><h2>Daily brief</h2><p>Book data is unavailable for this briefing.</p></section>)}
    </div><aside><Pending state={priorities}>{first ? <><Badge>Priority company</Badge><h2>{first.company}</h2><h3>{first.title}</h3><p>{first.detail}</p><SignalDetail ownerId={owner} key={first.id} row={first} followup={followup} firstMove /></> : <><h2>No active company recommendations</h2>{snoozed.length > 0 && <Button onClick={() => snooze([])}>Restore recommendations</Button>}</>}</Pending></aside>
    </section>
    <OverviewPulse owner={owner} name={ownerName} />
    <div className="ca-today-grid">{queuePanel}<Panel title="Agenda & pipeline">
      <div className="cr-switch" role="group">{([['agenda','Recorded agenda'],['deals','Open deals']] as const).map(([id,label]) => <button key={id} aria-pressed={ledger===id} onClick={() => setLedger(id)}>{label}</button>)}</div>
      {ledger === 'agenda' ? <RecordedAgendaPreview owner={owner} /> : <>
      <Pending state={pipeline}><div className="ca-deal-strip">{nodes(pipeline.value?.Opportunity).slice(0, 3).map(deal => <RouteLink style="" key={deal.Id} to={`/pipeline?deal=${deal.Id}`}><span>{str(deal, 'StageName')}</span><strong>{deal.Account?.Name?.value}</strong><em>{cash(str(deal, 'Amount'))}</em><small>{str(deal, 'Name')} · {day(str(deal, 'CloseDate'))}</small></RouteLink>)}</div></Pending><RouteLink to="/pipeline">Open deal room →</RouteLink></>}
    </Panel></div>
    <div className="ca-bottom-band"><Panel title="Business money movement"><Pending state={flow}><Flow weeks={flow.value?.weeks ?? []} /><Button style="text-button" onClick={() => setShowFlow(true)}>Inspect weekly credits and debits</Button></Pending></Panel>
    <Panel title="Signals outside the score"><Pending state={signals}><div className="ca-signal-tiles">{observations.map(s => <button key={s.id} onClick={() => setObservation(s)}><Badge>{s.family}</Badge><strong>{s.company}</strong><span>{s.title}</span></button>)}</div>{observations.length === 0 && <p>No qualifying observations returned.</p>}</Pending></Panel></div>
    {showFlow && <Inspect title="Business cash movement" onClose={() => setShowFlow(false)}><Pending state={flow}><p>Credits minus debits across business financial accounts in your book.</p><Flow weeks={flow.value?.weeks ?? []} /><div className="ca-ledger">{flow.value?.weeks.map(r => <div key={r.week}><strong>{day(r.week)}</strong><span>{cash(r.net)}</span><small>{cash(r.credits)} credits / {cash(r.debits)} debits · {r.accounts} accounts · {r.transactions} transactions</small></div>)}</div></Pending></Inspect>}
    {observation && <Inspect title={observation.company} onClose={() => setObservation(undefined)}><Badge>{observation.source}</Badge><h2>{observation.title}</h2><p>{observation.detail}</p><p>{day(observation.date)}</p><SignalDetail ownerId={owner} row={observation} followup={followup} /></Inspect>}
  </>;
}

export function Intelligence({ owner, followup }: { owner: string; followup: Followup }) {
  const data = useLive(() => readSignals(owner), owner);
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [family, setFamily] = useState('');
  const [selected, setSelected] = useState('');
  const all = data.value?.rows ?? [];
  const shown = all.filter(r => (!family || r.family === family) && [r.company, r.title, r.source, r.detail].join(' ').toLowerCase().includes(query.toLowerCase()));
  const row = shown.find(r => r.id === selected) ?? shown[0];
  return <><Heading title="Company intelligence">Competitor research, people changes, funding and credit evidence in one company-first desk.</Heading>
    <div className="cr-signal-strip" aria-label="Book signal totals">{data.value?.totals.map(t =>
      <button key={t.family} aria-pressed={family===t.family} onClick={() => { setFamily(t.family); setQuery(''); setSelected(''); }}>
        <strong>{t.value?.toLocaleString() ?? '—'}</strong><span>{t.label}</span><i aria-hidden="true">↗</i></button>)}</div>
    <div className="ca-intel-toolbar">
      <label>Find a company or source<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search company, topic, source…" /></label>
      <label>Evidence family<select value={family} onChange={e => setFamily(e.target.value)}><option value="">All source families</option>{[...new Set([...all.map(r => r.family), ...(data.value?.totals.map(t => t.family) ?? [])])].map(f => <option key={f}>{f}</option>)}</select></label>
      <span>{shown.length} observations shown</span>
    </div>
    <Pending state={data}><div className="ca-intel-desk"><div className="ca-inbox">{shown.map(r => <button key={r.id} aria-pressed={r.id === row?.id} onClick={() => setSelected(r.id)}><span className="ca-source-dot" data-family={r.family} /><span><Badge>{r.family}</Badge><strong>{r.company}</strong><small>{r.title}</small><time>{day(r.date)}</time></span></button>)}{shown.length === 0 && <p>No observations match these filters.</p>}</div>
    <article data-agent-record={row?.accountId} data-agent-label={row?.company} data-agent-observation={row && [row.source,row.title,row.detail,row.date].filter(Boolean).join(' · ')} className="ca-intel-detail">{row ? <><Badge>{row.source}</Badge><h2>{row.company}</h2><h3>{row.title}</h3><p>{row.detail}</p><div className="ca-evidence-map"><span>{row.source}</span><i /><span>{row.company}</span><i /><span>Your next conversation</span></div><p className="ca-source-date">Source date {day(row.date)}</p><SignalDetail ownerId={owner} key={row.id} row={row} followup={followup} /><h3>Keep context separate</h3><p>Use the provider observation to open a conversation and verify what changed.</p></> : <h2>No observation selected</h2>}</article></div>
    <Panel title="Source coverage"><div className="ca-source-grid">{data.value?.coverage.map(s => <div key={s.name}><strong>{s.name}</strong><Badge>{s.count === null ? 'Unavailable' : 'Live'}</Badge>{s.count != null && <span>{s.count} observations shown</span>}</div>)}</div></Panel></Pending>
  </>;
}
