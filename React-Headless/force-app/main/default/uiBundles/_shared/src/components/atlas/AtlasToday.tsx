import { AtlasBookBrief } from './AtlasBookBrief';
import { fetchLiquidityEvents, liquidityQueueItems } from '../../data/jobChangeSignals';
import { localIsoDate } from '../../data/localDate';
import { AtlasActionReview } from './AtlasActionReview';
import { useState, type ReactNode } from 'react';
import { fetchPipeline } from './atlasPipelineData';
import { atlasAccountPath, type AtlasLink } from './AtlasShell';
import { PrepModal } from '../home/PrepModal';
import { ScheduleModal } from '../home/ScheduleModal';
import { TaskModal } from '../home/TaskModal';
import { Icon } from '../iconMap';
import { fetchWealthWhoToCall, wealthWhoToCallItems } from '../../data/wealthWhoToCall';
import { fetchTradingPulse } from '../../data/tradingPulse';
import { fetchAtlasPlanReviews, fetchPlanHealth } from '../../data/planSignals';
import { fetchNetFlow } from '../../data/kpiTrend';
import { queryDataCloudForBook } from '../../data/dataCloudClient';
import { buildPriorityQueue } from '../../data/priorityQueue';
import { DataFreshnessMeter } from '../home/DataFreshnessMeter';
import { executeGraphQL } from '../../data/graphqlClient';
import type { CurrentUser } from '../../data/crmWriteClient';
import { fetchDataFreshness, type FreshnessSource } from '../../data/dataFreshness';
import { lexRecordUrl } from '../../data/orgEnv';
import { ownerScopedQuery } from '../../data/viewAs';
import { useAsyncData } from '../../hooks/useAsyncData';
import type { PersonaKey } from '../../theme/themes';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/atlas-day-hero.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/wealth-atlas.css';
import './atlasToday.css';

const PAGE_SIZE = 8;
const USER_ID = /^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;

const commonSources: FreshnessSource[] = ['transactions', 'worldCheck', 'marketing', 'serviceNow', 'gong', 'graph', 'offers'];
const personaSources: Record<PersonaKey, FreshnessSource[]> = {
  wealth: ['plaid', 'moneyGuidePro', 'trades', 'claritas'],
  commercial: ['bizOffers', 'dnb', 'moodys', 'boardex', 'msci', 'zoominfo', 'claritas', 'esri'],
  retail: ['csat', 'corelogic', 'claritas', 'plaid'],
};

const TODAY_QUERY = `query AtlasToday {
  uiapi {
    query {
      Task(first: 8, where: { IsClosed: { eq: false } }, orderBy: { ActivityDate: { order: ASC, nulls: LAST } }) {
        totalCount
        edges { node { Id Subject @optional { value } ActivityDate @optional { value } Priority @optional { value } Status @optional { value } WhatId @optional { value } } }
      }
      Opportunity(first: 8, where: { IsClosed: { eq: false } }, orderBy: { CloseDate: { order: ASC } }) {
        totalCount
        edges { node { Id Name @optional { value } AccountId @optional { value } Amount @optional { value } Probability @optional { value } StageName @optional { value } CloseDate @optional { value } } }
      }
      Case(first: 8, where: { IsClosed: { eq: false } }, orderBy: { CreatedDate: { order: DESC } }) {
        totalCount
        edges { node { Id Subject @optional { value } Status @optional { value } Account @optional { Id Name @optional { value } } } }
      }
    }
  }
}`;

type Field = { value?: string | null };
type Task = { Id: string; Subject?: Field; ActivityDate?: Field; Priority?: Field; Status?: Field; WhatId?: Field };
type Opportunity = { Id: string; AccountId?: Field; Amount?: Field; Probability?: Field; Name?: Field; StageName?: Field; CloseDate?: Field };
type Case = { Id: string; Subject?: Field; Status?: Field; Account?: { Id: string; Name?: Field } };
type Connection<T> = { totalCount: number; edges: { node: T }[] };
type Book = { Task: Connection<Task>; Opportunity: Connection<Opportunity>; Case: Connection<Case> };

export async function fetchAtlasBook(ownerId: string): Promise<Book> {
  if (!USER_ID.test(ownerId)) throw new Error('The selected banker could not be verified.');
  const result = await executeGraphQL<{ uiapi?: { query?: Book } }>(ownerScopedQuery(TODAY_QUERY, ownerId));
  const book = result.uiapi?.query;
  if (!book?.Task || !book.Opportunity || !book.Case) throw new Error('The Salesforce book is unavailable.');
  return book;
}

function dateLabel(date?: string | null) {
  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  }) : undefined;
}

type AccountLink = (id: string, label: string, className?: string) => ReactNode;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const wealthCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
}

async function fetchHouseholdNames(ownerId: string, accounts: string[]) {
  const ids = [...new Set(accounts)].filter(id => /^001[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(id));
  if (!ids.length) return new Map<string, string | null | undefined>();
  type Names = { uiapi?: { query?: { Account?: { edges: { node: { Id: string; Name?: Field } }[] } } } };
  const result = await executeGraphQL<Names>(`query AtlasReviewHouseholds {
    uiapi { query {
      Account(first: ${ids.length}, where: { OwnerId: { eq: "${ownerId}" }, Id: { in: ${JSON.stringify(ids)} } }) {
        edges { node { Id Name @optional { value } } }
      }
    } }
  }`);
  return new Map(result.uiapi?.query?.Account?.edges.map(({ node }) => [node.Id, node.Name?.value]));
}

async function fetchReviewHouseholds(ownerId: string, lens: 'due' | 'critical' | 'stale') {
  const reviews = await fetchAtlasPlanReviews(ownerId, lens);
  const names = await fetchHouseholdNames(ownerId, reviews.map(row => row.accountId));
  return reviews.flatMap(row => {
    const name = names.get(row.accountId);
    return name ? [{ ...row, name }] : [];
  });
}

type OutreachMode = 'prep' | 'schedule' | 'task';
type Outreach = { id: string; name: string; context: string; mode: OutreachMode; subject?: string; date?: string };

function OutreachDialog({ item, change, close }: {
  item: Outreach; change: (item: Outreach) => void; close: () => void;
}) {
  if (item.mode === 'prep') return <PrepModal open onClose={close} clientId={item.id} clientName={item.name}
    profile={{ recap: item.context }}
    onSchedule={() => change({ ...item, mode: 'schedule' })}
    onMakeTask={subject => change({ ...item, mode: 'task', subject })} />;
  if (item.mode === 'schedule') return <ScheduleModal open onClose={close} clientId={item.id} clientName={item.name} subjectDefault={item.subject} />;
  return <TaskModal open onClose={close} clientId={item.id} clientName={item.name} subjectDefault={item.subject}
    dueDateDefault={item.date} commentsDefault={item.context} />;
}

async function fetchWealthOutreach(ownerId: string, book: Book | null) {
  const [outreach, events] = await Promise.allSettled([fetchWealthWhoToCall(ownerId, true), fetchLiquidityEvents(ownerId, true)]);
  const risks = outreach.status === 'fulfilled' ? outreach.value : null;
  const liquidity = events.status === 'fulfilled' ? events.value : null;
  if (!book && !risks && !liquidity) throw new Error('Priority sources unavailable.');
  const due = localIsoDate(new Date());
  const tasks = (book?.Task.edges ?? []).map(e => e.node).filter(t => t.Subject?.value && t.ActivityDate?.value && t.ActivityDate.value <= due);
  const deals = (book?.Opportunity.edges ?? []).map(e => e.node).filter(o => o.Name?.value);
  const accounts = [...(risks?.rows ?? []), ...(liquidity?.rows ?? [])].map(r => r.accountId)
    .concat(tasks.map(t => t.WhatId?.value || ''), deals.map(o => o.AccountId?.value || ''));
  const names = await fetchHouseholdNames(ownerId, accounts);
  const visible = Object.fromEntries([...names].flatMap(([id,name]) => name ? [[id,name]] : []));
  const riskItems = risks ? wealthWhoToCallItems(risks, visible, {segment:'Wealth'}).filter(r => visible[r.clientId]) : [];
  const eventItems = liquidity ? liquidityQueueItems(liquidity, visible, {segment:'Wealth'}).filter(r => visible[r.clientId]) : [];
  const records = new Map<string,{id:string; account:string; type:'Task'|'Opportunity'}>();
  const opportunities = deals.map((o,index) => {
    const account = o.AccountId?.value || '';
    records.set('qo'+index, {id:o.Id, account, type:'Opportunity'});
    return { name:o.Name!.value!, clientName:visible[account] || o.Name!.value!, stage:o.StageName?.value || '',
      amount:Number(o.Amount?.value || 0), closeDate:o.CloseDate?.value || '', propensity:Number(o.Probability?.value || 0)/100 };
  });
  const work = tasks.map((t,index) => {
    const account = t.WhatId?.value || '';
    records.set('qt'+index, {id:t.Id, account, type:'Task'});
    return { title:t.Subject!.value!, time:t.ActivityDate!.value!, priority:t.Priority?.value || '', whatId:account, clientName:visible[account] };
  });
  const evidence = new Map((risks?.rows ?? []).map(r => [r.accountId,r]));
  const rows = buildPriorityQueue({primary:[...riskItems,...eventItems], opportunities, tasks:work, includeSources:['Overdue task','Open opportunity'], limit:8}).map(item => {
    const record = records.get(item.id);
    return {...item, record, clientId:record ? (visible[record.account] ? record.account : '') : item.clientId,
      evidence: riskItems.some(r => r.id === item.id) ? evidence.get(item.clientId) : undefined};
  });
  const unavailable = [!risks && 'relationship signals', !liquidity && 'liquidity events', !book && 'CRM activities'].filter(Boolean).join(', ');
  return {rows, unavailable};
}

async function fetchInvestableAssets(ownerId: string) {
  const { rows } = await queryDataCloudForBook<{ balance: string | number | null }>(filter => `
    SELECT SUM(balance_usd__c) AS balance FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0
      AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c ${filter}
  `, ownerId, 1, true);
  return rows[0] ? Number(rows[0].balance ?? 0) : null;
}

const fullDate = (date?: string | null) => date
  ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
  : '—';

function WealthMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="wa-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export type WealthTodayActions = {
  prepare: (draft: {
    kind: 'Task';
    accountId: string;
    title: string;
    description: string;
    date?: string;
    details: Record<string, string>;
  }) => void;
  dialog: (title: string, close: () => void, content: ReactNode) => ReactNode;
};

type WealthRow = {
  id: string;
  name: string;
  detail: string;
  context: string;
  title: string;
  date?: string;
  record?: {id:string; type:string};
  sourceDate?: string;
  source: string;
  facts: [string, string][];
};

const numberLabel = (value: number | null, suffix = '') =>
  value == null ? 'Unavailable' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
const balanceLabel = (value: number | null) => value == null ? 'Unavailable' : wealthCurrency.format(value);

function WealthRowView({ row, review, linkAccount }: { row: WealthRow; review: () => void; linkAccount: AccountLink }) {
  return <article className="wa-workrow">
    <button className="wa-person" type="button" onClick={review}>
      <span className="wa-avatar">{initials(row.name)}</span><span><strong>{row.name}</strong><small>{row.detail}</small></span>
    </button>
    <div className="wa-rowactions"><button type="button" className="secondary" onClick={review}>Review</button>{row.id && linkAccount(row.id, '360', 'secondary')}{row.record && <a href={lexRecordUrl(row.record.type,row.record.id)} target="_blank" rel="noreferrer">Open {row.record.type.toLowerCase()}</a>}</div>
  </article>;
}

function WealthToday({ ownerId, pipeline, book, freshness, linkAccount, open, link, actions }: {
  ownerId:string; pipeline:Awaited<ReturnType<typeof fetchPipeline>> | null; book:Book | null;
  freshness:ReactNode; linkAccount:AccountLink; open:(item:Outreach)=>void; link:AtlasLink;
  actions: WealthTodayActions;
}) {
  const [lens, setLens] = useState<'due'|'critical'|'stale'>('due');
  const [inspecting, setInspecting] = useState<WealthRow | null>(null);
  const agenda = useAsyncData(() => fetchWealthOutreach(ownerId, book), [ownerId, book]);
  const investable = useAsyncData(() => fetchInvestableAssets(ownerId), [ownerId]);
  const plans = useAsyncData(() => fetchPlanHealth(ownerId, true), [ownerId]);
  const flow = useAsyncData(() => fetchNetFlow(ownerId, undefined, true), [ownerId]);
  const trading = useAsyncData(() => fetchTradingPulse(ownerId, true), [ownerId]);
  const reviews = useAsyncData(() => fetchReviewHouseholds(ownerId, lens), [ownerId,lens]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const agendaRows: WealthRow[] = (agenda.data?.rows ?? []).filter(row => !dismissed.includes(row.record?.id || row.clientId+row.action)).map(row => {
    const source = row.evidence;
    if (!source) return {
      id:row.clientId, name:row.clientName, title:row.action, context:row.reason, date:row.dueDate,
      source:row.source, detail:row.reason, record:row.record, facts:[['Source',row.source],['Action date',fullDate(row.dueDate)]] as WealthRow['facts'],
    };
    const facts: WealthRow['facts'] = [
      ['Blended score', numberLabel(source.score)],
      ['Weighted drivers', row.drivers?.map(driver => `${driver.label} (${numberLabel(driver.points)})`).join(' · ') || 'Unavailable'],
    ];
    if (source.heldAway != null) facts.push(
      ['Held-away investment balance', balanceLabel(source.heldAway)],
      ['Outside accounts', numberLabel(source.heldAccounts)],
      ['Largest outside institution', source.institution || 'Unavailable'],
    );
    if (source.monthlyFlow != null) facts.push(['Monthly flow to outside investments', balanceLabel(source.monthlyFlow)]);
    if (source.planSuccess != null) facts.push(
      ['Modeled plan success', numberLabel(source.planSuccess, '%')],
      ['Plan goal value', balanceLabel(source.goalUsd)],
    );
    if (source.dealRisk != null) facts.push(
      ['Gong deal risk score', numberLabel(source.dealRisk)],
      ['Recorded sentiment', source.sentiment || 'Unavailable'],
    );
    if (source.concentration != null) facts.push(
      ['Most concentrated holding', source.ticker || 'Unavailable'],
      ['Share of holdings', numberLabel(source.concentration * 100, '%')],
    );
    return {
      id: row.clientId, name: row.clientName, title: row.action, context: row.reason, date: row.dueDate,
      source: row.source, detail: `${row.action} · act by ${fullDate(row.dueDate)}`, facts,
    };
  });
  const first = agendaRows[0];
  const reviewRows: WealthRow[] = (reviews.data ?? []).slice(0, 4).map(row => ({
    id: row.accountId, name: row.name, title: 'Review household plan', date: row.nextReview || undefined,
    sourceDate: row.updated,
    context: `Provider review date ${fullDate(row.nextReview)}. Last updated ${fullDate(row.updated)}.`,
    source: 'MoneyGuidePro',
    detail: `${fullDate(row.nextReview)} · ${numberLabel(row.successPct, '%')} success`,
    facts: [
      ['Provider review date', fullDate(row.nextReview)],
      ['Provider last updated', fullDate(row.updated)],
      ['Modeled plan success', numberLabel(row.successPct, '%')],
      ['Plan goal value', balanceLabel(row.goalUsd)],
      ['Goals on plan', numberLabel(row.goals)],
      ['Plan freshness', row.stale ? 'Stale' : 'Current'],
    ],
  }));
  const stage = pipeline?.stages ?? [];
  const p = plans.data;
  const counters = p ? [
    {color:'critical', count:p.critical, label:'below 50%'},
    {color:'watch', count:Math.max(0,p.atRisk-p.critical), label:'50–69%'},
    {color:'steady', count:Math.max(0,p.plans-p.atRisk), label:'≥70%'},
  ] : [];
  const net = flow.data?.last;
  const trades = trading.data?.weeks[trading.data.weeks.length - 1];
  const asCash = (value?:number|null) => value == null ? '—' : wealthCurrency.format(value);
  const prepare = (row: WealthRow) => {
    setInspecting(null);
    actions.prepare({
      kind: 'Task', title: row.title, accountId: row.id, description: row.context, date: row.date,
      details: {
        AccountName: row.name,
        EvidenceKind: row.source,
        EvidencePeriod: row.sourceDate ?? '',
        EvidenceSummary: row.facts.map(([label, value]) => `${label}: ${value}`).join('\n'),
      },
    });
  };

  return <div className="wa atlas-wealth-today">
    <section className="wa-hero">
      <div>
        <p className="wa-kicker">My advisory desk · {new Date().toISOString().slice(0, 10)}</p>
        <h1>Advisory portfolio overview</h1>
        <AtlasBookBrief persona="wealth" ownerId={ownerId} facts={[
          p && `${p.atRisk} plans have modeled success below 70%.`, book && `${book.Opportunity.totalCount} open opportunities.`,
          pipeline?.amount != null && `Open pipeline totals ${asCash(pipeline.amount)}.`,
          net?.net != null && `Net flow for the week of ${fullDate(net.week)} was ${asCash(net.net)}.`,
        ].filter(Boolean).join(' ')} />
        <div className="wa-pulse">
          <WealthMetric label="Outside investable assets" value={asCash(investable.data)} detail="Active brokerage + robo" />
          <WealthMetric label="Plans below 70%" value={p?.atRisk.toLocaleString() ?? '—'} detail="Modeled plan success" />
          <WealthMetric label="Latest full-week net flow" value={asCash(net?.net)} detail={`Credits − debits · ${fullDate(net?.week)}`} />
        </div>
      </div>
      <aside data-agent-record={first?.id || undefined} data-agent-label={first?.name} data-agent-observation={first?.context}>
        <span className="wa-pill">My first move</span>
        {first ? <>
          <h2>{first.name}</h2><p>{first.title}</p>
          <small>Act by {fullDate(first.date)} · {first.source}</small>
          <div className="wa-actions">
            <button type="button" className="primary" onClick={() => prepare(first)}>Prepare my first move</button>
            {first.id && linkAccount(first.id, 'Open 360', 'secondary')}
          </div>
          <button type="button" className="text-button" onClick={() => setInspecting(first)}>Why this household?</button>
        </> : <p>{agenda.loading ? 'Loading priority households…' : agenda.error ? 'Advisor priorities are unavailable.' : 'No eligible priority households in this book.'}</p>}
      </aside>
    </section>
    <section className="wa-pipelineband atlas-anchor" id="pipeline-overview">
      <div><span>My open pipeline</span><strong>{asCash(pipeline?.amount)}</strong><small>{book?.Opportunity.totalCount.toLocaleString() ?? '—'} open opportunities · CRM aggregate</small></div>
      <div className="wa-stageview">
        <div className="wa-stageline" role="img" aria-label="Pipeline by recorded opportunity stage">
          {stage.map((row,i) => <i key={row.name} style={{flex:Math.max(0,row.amount),background:`hsl(${250+i*7} ${35+i%3*8}% ${37+i%5*6}%)`}}
            title={`${row.name} · ${asCash(row.amount)}`} />)}
        </div>
        <div>{stage.slice(0,3).map(row => <span key={row.name}>{row.name} <b>{asCash(row.amount)}</b></span>)}</div>
      </div>
      {link('/pipeline', 'Open pipeline', 'secondary')}
    </section>
    <div className="wa-two">
      <div>
        <section className="wa-panel atlas-anchor" id="commitments">
          <header><div><h2>My advisor agenda</h2><p>Native queue ranking, source action and due date; inspect the evidence before acting.</p></div></header>
          {agendaRows.map(row => <WealthRowView key={row.record?.id || row.id+row.title} row={row} review={() => setInspecting(row)} linkAccount={linkAccount} />)}
          {!!dismissed.length && <button type="button" onClick={() => setDismissed([])}>Restore dismissed recommendations</button>}
          {agenda.loading && <p role="status">Loading the advisor agenda…</p>}
          {agenda.error && <p role="alert">Advisor agenda unavailable.</p>}{agenda.data?.unavailable && <p role="status">Unavailable sources: {agenda.data.unavailable}.</p>}
          {!agenda.loading && !agenda.error && !agenda.data?.rows.length && <p>No eligible advisor agenda rows in this book.</p>}
          <details className="wa-source">
            <summary>Advisor priorities · Wealth book · source freshness</summary>
            {freshness}
          </details>
        </section>
      </div>
      <div>
        <section className="wa-panel atlas-anchor" id="reviews">
          <header><div><h2>The review horizon</h2><p>Provider reviews and planning signals, separate from booked appointments.</p></div></header>
          <div className="wa-attention">
            <div className="wa-attentionbar" role="img" aria-label="Provider plans by modeled success">
              {counters.map(c => <i key={c.color} className={c.color} style={{flex:c.count}} />)}
            </div>
            <div>{counters.map(c => <span key={c.color}><i className={c.color} />{c.count.toLocaleString()} {c.label}</span>)}</div>
          </div>
          <div className="wa-tabs" role="group" aria-label="Review horizon">
            {([['due','Due soon'],['critical','Plan rescue'],['stale','Refresh']] as const).map(([value,label]) =>
              <button type="button" className={lens === value ? 'selected' : undefined} key={value} aria-pressed={lens === value} onClick={() => setLens(value)}>{label}</button>)}
          </div>
          {!reviews.loading && reviewRows.map(row => <WealthRowView key={row.id}
            row={row} review={() => setInspecting(row)} linkAccount={linkAccount} />)}
          {reviews.loading && <p role="status">Loading reviews…</p>}
          {reviews.error && <p role="alert">Review rows unavailable.</p>}
          {!reviews.loading && !reviews.error && !reviews.data?.length && <p>No accessible reviews match this lens.</p>}
          {link('/health', 'Open review horizon', 'secondary')}
        </section>
        <section className="wa-panel atlas-anchor" id="intelligence">
          <header><div><h2>Trading conversations</h2><p>Confirmed USD executions; gross activity is not net flow.</p></div></header>
          {trades ? <div className="wa-pair">
            <WealthMetric label="Latest-week buys" value={asCash(trades.buys)} detail={fullDate(trades.date)} />
            <WealthMetric label="Latest-week sells" value={asCash(trades.sells)} detail={fullDate(trades.lastDate)} />
          </div> : <p>{trading.loading ? 'Loading trading activity…' : 'Trading activity unavailable for this book.'}</p>}
          {link('/intelligence?intelligenceView=trading', 'Explore trading pulse', 'secondary')}
        </section>
      </div>
    </div>
    {inspecting && actions.dialog(`${inspecting.name} · source evidence`, () => setInspecting(null),
      <div className="wa" data-agent-record={inspecting.id || undefined} data-agent-label={inspecting.name} data-agent-observation={inspecting.context}>
        <p className="wa-source">{inspecting.source} · Selected advisory book</p>
        <p>{inspecting.context}</p>
        <AtlasActionReview key={inspecting.id} accountId={inspecting.id} ownerId={ownerId} name={inspecting.name} subject={inspecting.title} note={inspecting.context} />
        <dl className="wa-evidence">
          <div><dt>Household account</dt><dd>{inspecting.id}</dd></div>
          {inspecting.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="wa-actions">
          <button type="button" className="primary" onClick={() => prepare(inspecting)}>Prepare follow-up</button>
          {inspecting.id && linkAccount(inspecting.id, 'Open 360', 'secondary')}
          {inspecting.record && <a href={lexRecordUrl(inspecting.record.type,inspecting.record.id)} target="_blank" rel="noreferrer">Open source record</a>}
          {agendaRows.includes(inspecting) || agendaRows.some(r => r.title === inspecting.title && r.id === inspecting.id) ? <button type="button" onClick={() => {
            setDismissed(values => [...values, inspecting.record?.id || inspecting.id+inspecting.title]); setInspecting(null);
          }}>Dismiss recommendation</button> : null}
          <button type="button" className="secondary" onClick={() => {
            open({ id: inspecting.id, name: inspecting.name, subject: inspecting.title,
              context: inspecting.context, date: inspecting.date, mode: 'task' });
            setInspecting(null);
          }}>Create Salesforce task</button>
        </div>
      </div>
    )}
  </div>;
}

function DayHero({ persona, firstName, book, amount, linkAccount, freshness, open }: {
  persona: PersonaKey; firstName: string; book: Book | null; amount?: number | null; linkAccount: AccountLink; freshness: ReactNode; open: (item: Outreach) => void;
}) {
  const [pick, setPick] = useState(0);
  const cases = book?.Case.edges.map(({ node }) => node) ?? [];
  const current = cases.length ? cases[pick % cases.length] : undefined;
  const name = current?.Account?.Name?.value;
  const accountId = current?.Account?.Id;
  const subject = current?.Subject?.value ?? 'Review an open case';
  const context = current?.Status?.value ? `Current case status: ${current.Status.value}.` : 'Review the case before reaching out.';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const pulse = {
    wealth: 'Confidence, commitments, and the next household conversation.',
    retail: 'Service first. Keep the next customer conversation close.',
    commercial: 'Relationship care and disciplined deal follow-through.',
  };
  return (
    <section className="day-hero" aria-label="Your book at a glance" data-day-persona={persona}>
      <div className="day-overview">
        <div className="day-greeting"><span>{greeting}{firstName ? `, ${firstName}` : ''}.</span><h1>Retail portfolio overview</h1></div>
        <div className="day-brief">
          <div className="day-brief-label"><Icon name="sparkle" /><h2>Your daily brief</h2><span>Live Salesforce book</span></div>
          {book ? <p>You have <strong>{book.Opportunity.totalCount.toLocaleString()} open opportunities</strong>{amount != null && <> worth <strong>{currency.format(amount)}</strong></>}, with <strong>{book.Task.totalCount.toLocaleString()} open tasks</strong>. {pulse[persona]}</p>
            : <p>{pulse[persona]}</p>}
        </div>
        <div className="day-pulse">
          <div className="day-pulse-intro">
            <h2><Icon name="metrics" /> Portfolio pulse</h2><p>{pulse[persona]}</p>
            <a className="day-inline" href={persona === 'wealth' ? '#reviews' : '#cases'}>Review book health <Icon name="arrow" /></a>
          </div>
          <div className="day-pulse-numbers">
            <a href="#pipeline"><strong>{amount != null ? currency.format(amount) : book?.Opportunity.totalCount.toLocaleString() ?? '—'}</strong><span>{amount != null ? 'Pipeline' : 'Open opportunities'}</span></a>
            <a href="#tasks"><strong>{book?.Task.totalCount.toLocaleString() ?? '—'}</strong><span>Open tasks</span></a>
            <a href="#cases"><strong>{book?.Case.totalCount.toLocaleString() ?? '—'}</strong><span>Open cases</span></a>
          </div>
        </div>
        {freshness}
      </div>
      <aside className="day-first-move" aria-label="Suggested first outreach">
        <div className="day-now"><i />Your first move <span>Relationship care</span></div>
        {current ? <>
          <div className="day-outreach-person">
            <span>{name ? initials(name) : <Icon name="alerts" />}</span>
            <div><small>{name ? 'Reach out to' : 'Review the source case'}</small><h2>{name || 'Open service case'}</h2></div>
          </div>
          <h3>{subject}</h3>
          <p>{context}</p>
          <div className="day-outreach-links">
            {accountId && linkAccount(accountId, 'Open 360', 'secondary')}
            <a className="secondary" href={lexRecordUrl('Case', current.Id)} target="_top">Why this outreach</a>
          </div>
          <div className="day-outreach-actions">
            {accountId && name ? <>
              <button type="button" className="primary" onClick={() => open({
                id: accountId, name, context, mode: 'prep',
              })}><Icon name="sparkle" size={16} /> Prep me</button>
              <button type="button" className="secondary" onClick={() => open({
                id: accountId, name, context, mode: 'schedule',
              })}>Plan a call</button>
            </> : current && <a className="primary" href={lexRecordUrl('Case', current.Id)} target="_top">Review case <Icon name="arrow" size={15} /></a>}
            {cases.length > 1 && <button type="button" className="day-inline" onClick={() => setPick(pick + 1)}>Next priority</button>}
          </div>
          <small className="day-priority-source">Salesforce CRM · Recent open service case</small>
        </> : <p>{book ? 'No open CRM cases in this book.' : 'Your book’s service priorities will appear here.'}</p>}
      </aside>
    </section>
  );
}

function Records({ id, title, total, object, rows }: {
  id: string; title: string; total: number; object: keyof Book;
  rows: { id: string; title?: string | null; detail: (string | null | undefined)[] }[];
}) {
  return (
    <section id={id} className="atlas-ledger atlas-anchor">
      <h2 className="text-lg font-semibold">{title}</h2>
      {total > rows.length && <p className="mt-1 text-sm text-muted">Showing {rows.length} of {total.toLocaleString()}</p>}
      {rows.length === 0 ? <p className="mt-4 text-sm text-muted">No matching records in this book.</p> : (
        <ul className="mt-2 divide-y divide-[var(--wp-border)]">
          {rows.map(row => (
            <li key={row.id} className="py-3">
              <a className="atlas-text-link" href={lexRecordUrl(object, row.id)} target="_top">
                {row.title || `Open ${object.toLowerCase()}`}
              </a>
              {row.detail.some(Boolean) && <p className="mt-1 text-sm text-muted">{row.detail.filter(Boolean).join(' · ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveBook({ ownerId, firstName, persona, freshness, linkAccount, link, wealthActions }: {
  ownerId: string; firstName: string; persona: PersonaKey; freshness: ReactNode; linkAccount: AccountLink; link: AtlasLink;
  wealthActions?: WealthTodayActions;
}) {
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useAsyncData(() => fetchAtlasBook(ownerId), [ownerId, attempt]);
  const { data: pipeline } = useAsyncData(() => fetchPipeline(ownerId), [ownerId, attempt]);
  const book = !loading && !error ? data : null;
  const [outreach, setOutreach] = useState<Outreach | null>(null);
  return (
    <>
      {persona === 'wealth' && wealthActions
        ? <WealthToday ownerId={ownerId} pipeline={pipeline} book={book} freshness={freshness}
            linkAccount={linkAccount} open={setOutreach} link={link} actions={wealthActions} />
        : <DayHero persona={persona} firstName={firstName} book={book} amount={pipeline?.amount} freshness={freshness} linkAccount={linkAccount} open={setOutreach} />}
      {loading && <p role="status">Loading the selected book…</p>}
      {error && (
        <div role="alert">
          <p>The selected book couldn’t be loaded.</p>
          <button type="button" className="atlas-text-link" onClick={() => setAttempt(attempt + 1)}>Retry</button>
        </div>
      )}
      {outreach && <OutreachDialog key={outreach.mode} item={outreach} change={setOutreach} close={() => setOutreach(null)} />}
      {book && persona !== 'wealth' && (
        <>
          <div className="atlas-section-lead">
            <p className="atlas-kicker">Recorded commitments</p>
            <h2>Follow-up moving.</h2>
          </div>
          <div className="atlas-ledgers">
            <Records id="tasks" title="Open tasks" object="Task" total={book.Task.totalCount}
              rows={book.Task.edges.slice(0, PAGE_SIZE).map(({ node }) => ({ id: node.Id, title: node.Subject?.value, detail: [dateLabel(node.ActivityDate?.value), node.Priority?.value] }))} />
            <Records id="pipeline" title="Earliest close dates" object="Opportunity" total={book.Opportunity.totalCount}
              rows={book.Opportunity.edges.slice(0, PAGE_SIZE).map(({ node }) => ({ id: node.Id, title: node.Name?.value, detail: [node.StageName?.value, dateLabel(node.CloseDate?.value)] }))} />
            <Records id="cases" title="Recent open cases" object="Case" total={book.Case.totalCount}
              rows={book.Case.edges.slice(0, PAGE_SIZE).map(({ node }) => ({ id: node.Id, title: node.Subject?.value, detail: [node.Status?.value] }))} />
          </div>
        </>
      )}
    </>
  );
}

export default function AtlasToday({ persona, owner, link, wealthActions }: {
  persona: PersonaKey; owner: CurrentUser; link: AtlasLink; wealthActions?: WealthTodayActions;
}) {
  const [freshnessAttempt, setFreshnessAttempt] = useState(0);
  const { data: freshness, loading, error } =
    useAsyncData(() => fetchDataFreshness([...commonSources, ...personaSources[persona]]), [persona, freshnessAttempt]);
  const freshnessStatus = <div className="atlas-freshness">
    {loading && <small role="status">Checking source freshness…</small>}
    {!loading && freshness && !error && <DataFreshnessMeter freshness={freshness} />}
    {error && <button type="button" className="atlas-text-link" onClick={() => setFreshnessAttempt(attempt => attempt + 1)}>Source freshness unavailable · Retry</button>}
  </div>;

  return <LiveBook key={owner.userId} ownerId={owner.userId} firstName={owner.firstName || owner.name.split(' ')[0]}
    persona={persona} freshness={freshnessStatus} link={link} wealthActions={wealthActions}
    linkAccount={(id, label, className) => link(atlasAccountPath(persona,id), label, className)} />;
}
