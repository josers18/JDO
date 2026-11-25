import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CustomerGoalModal, LifeEventModal, fetchCrmKpis, fetchServiceNowDrag, fetchOwnerWealthHandoffs, type OwnerHandoffRow } from '@shared';
import { lexRecordUrl } from '@shared/data/orgEnv';
import { useStageDrafts } from '@shared/components/atlas/atlasDrafts';
import { readServiceAccounts, type Signal } from './signals';
import { nodes, readPersonalPlanning, readWork, recordKey, str, verifyAccounts, type RecordNode, type WorkKind, type WorkScope } from './commercialData';
import { Badge, Button, cash, day, Heading, Inspect, Panel, Pending, RouteLink, Tabs, useLive } from './controls';
import type { Draft, DraftEditor } from './drafts';

const choices = [['tasks', 'Tasks'], ['meetings', 'Recorded meetings'], ['cases', 'Service'], ['drafts', 'Local proposals']] as const;
const kindLabel = { tasks: 'Source Task', meetings: 'Recorded Event', cases: 'CRM Case' };
const recordDate = (row: RecordNode) => str(row, 'ActivityDate') || str(row, 'ActivityDateTime') || str(row, 'CreatedDate');
type WorkRow = { row: RecordNode; kind: WorkKind; accountId: string; company: string };
async function workRows(owner: string, kind: WorkKind, month?: string, companyId?: string, scope: WorkScope = 'company') {
  const result = await readWork(owner, kind, month, companyId, scope);
  const records = nodes(result.Records);
  const accountId = (row: RecordNode) => str(row, kind === 'cases' ? 'AccountId' : 'WhatId');
  if (companyId) {
    const rows = records.filter(row => recordKey(accountId(row)) === recordKey(companyId)).map(row => ({
      row, kind, accountId: companyId, company: String(row.Account?.Name?.value || 'Account'),
    }));
    return { rows, total: result.Records?.totalCount };
  }
  const accounts = await verifyAccounts(owner, records.map(accountId));
  const rows: WorkRow[] = records.flatMap(row => {
    const a = accounts.get(recordKey(accountId(row)));
    if (a) return [{ row, kind, accountId: a.Id, company: str(a, 'Name') }];
    if (scope === 'company') return [];
    return [{ row, kind, accountId: '', company: String(row.Account?.Name?.value || 'No linked account') }];
  });
  return { rows, total: result.Records?.totalCount };
}
export function RecordedAgendaPreview({ owner, expanded = false }: { owner: string; expanded?: boolean }) {
  const [picked,setPicked] = useState<WorkRow>();
  const [filter,setFilter] = useState("all");
  const [all,setAll] = useState(false);
  const records = useLive(async () => {
    const [tasks,meetings] = await Promise.all([workRows(owner,'tasks'),workRows(owner,'meetings')]);
    const sorted = [...tasks.rows,...meetings.rows].sort((a,b) => recordDate(b.row).localeCompare(recordDate(a.row)));
    return sorted;
  }, owner);
  const rows = (records.value ?? []).filter((r,i,list) => expanded ? filter === 'all' || filter === r.kind : list.findIndex(item => item.accountId === r.accountId) === i);
  const renderRow = (item: WorkRow) => <button className="cr-agenda-row" key={item.row.Id} onClick={() => setPicked(item)}>
    <time dateTime={recordDate(item.row)}><small>{day(recordDate(item.row)).split(' ')[0]}</small>{Number(recordDate(item.row).slice(8,10)) || '—'}</time><span><strong>{str(item.row,'Subject')}</strong><small>{item.company} · {item.kind === 'tasks' ? 'Task' : 'Meeting'}</small></span><b aria-hidden="true">↗</b>
  </button>;
  return <>{expanded && <div className="cr-switch">{[['all','All records'],['tasks','Tasks'],['meetings','Meetings']].map(([key,label]) => <button key={key} aria-pressed={filter===key} onClick={() => setFilter(key)}>{label}</button>)}</div>}
    <Pending state={records}>{rows.slice(0,expanded ? 4 : 3).map(renderRow)}{rows.length === 0 && <p>No recorded tasks or meetings in this book.</p>}</Pending>
    {expanded ? <Button style="text-button" onClick={() => setAll(true)}>Review all {rows.length} records</Button> : <RouteLink to="/journey">Open activity &amp; plans →</RouteLink>}
    {all && !picked && <Inspect title="Recorded agenda" onClose={() => setAll(false)}>{rows.map(renderRow)}</Inspect>}
    {picked && <Inspect title={str(picked.row,'Subject')} onClose={() => setPicked(undefined)}><Badge>{kindLabel[picked.kind]}</Badge><h2>{picked.company}</h2><p>{day(recordDate(picked.row))}</p><p>{str(picked.row,'Description')}</p><RouteLink to={`/client/${picked.accountId}`}>Open company</RouteLink></Inspect>}
  </>;
}

function WorkActions({ selected, onEdit }: { selected: WorkRow; onEdit: DraftEditor }) {
  const { kind, company, accountId, row } = selected;
  if (!accountId) return <a className="secondary" href={lexRecordUrl({ tasks: 'Task', meetings: 'Event', cases: 'Case' }[kind], row.Id)} target="_top">Open Salesforce record</a>;
  return <div className="ca-actions">
    <Button onClick={() => onEdit({
      kind: kind === 'meetings' ? 'meeting' : 'task',
      accountId, company,
      title: kind === 'cases' ? `Follow up on Case ${str(row, 'CaseNumber') || row.Id}` : str(row, 'Subject'),
      detail: str(row, 'Description'), sourceRef: row.Id, status: str(row, 'Status'), priority: str(row, 'Priority'), location: str(row, 'Location'),
      original: kind === 'cases' ? undefined : row.Id,
      date: recordDate(row).slice(0, 10),
      time: kind === 'meetings' ? str(row, 'ActivityDateTime').slice(11, 16) : undefined,
    })}>{kind === 'cases' ? 'Draft case follow-up' : 'Review change proposal'}</Button>
    {kind !== 'cases' && <Button style="text-button" onClick={() => onEdit({ kind: kind === 'meetings' ? 'meeting' : 'task', operation: 'delete', accountId, company, title: str(row, 'Subject'), original: row.Id, sourceRef: row.Id })}>Propose deleting activity</Button>}
    <RouteLink to={`/client/${accountId}`}>Open company</RouteLink>
  </div>;
}
function WorkDetail({ selection, onEdit }: { selection: WorkRow; onEdit: DraftEditor }) {
  const { kind, company, row } = selection;
  return <div className="ca-activity-inspector"><Badge>{kindLabel[kind]}</Badge><h2>{str(row, 'Subject')}</h2>
    <p>{company} · {day(recordDate(row))} · {str(row, 'Status') || str(row, 'Location')}</p><p>{str(row, 'Description') || 'No source description supplied.'}</p>
    <dl className="ca-fields">{(['Id', 'AccountId', 'WhatId', 'WhoId', 'OwnerId'] as const).map(key => <div key={key}><dt>{key}</dt><dd>{key === 'Id' ? row.Id : str(row, key) || '—'}</dd></div>)}</dl>
    <WorkActions selected={selection} onEdit={onEdit} />
  </div>;
}

function ServiceTotals({ owner }: { owner: string }) {
  const crm = useLive(() => fetchCrmKpis(owner,new Date(),true),owner);
  const external = useLive(() => fetchServiceNowDrag(owner),owner);
  return <dl className="cr-facts cr-service" aria-label="Open cases across the company book">
    <div><dt>Open CRM cases</dt><dd>{crm.value?.openCases.value.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Open ServiceNow cases</dt><dd>{external.value?.open.toLocaleString() ?? '—'}</dd></div>
  </dl>;
}

export function Workbench({ owner, actorScope, drafts, onEdit, revision }: { owner: string; actorScope?: string; drafts: Draft[]; onEdit: DraftEditor; revision: number }) {
  const [search, setSearch] = useSearchParams();
  const view = choices.find(([id]) => id === (search.get('sub') ?? search.get('tab')))?.[0] ?? 'tasks';
  const stageDrafts = useStageDrafts('commercial', actorScope, owner);
  const setView = (value: typeof view) => setSearch(previous => {
    const next = new URLSearchParams(previous);
    next.delete('tab');
    if (value === 'tasks') next.delete('sub'); else next.set('sub', value);
    return next;
  });
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<WorkScope>(owner === actorScope ? 'assigned' : 'company');
  const [inspected, setInspected] = useState<WorkRow>();
  const [external, setExternal] = useState<Signal>();
  const service = useLive(() => view === 'cases' ? readServiceAccounts(owner) : Promise.resolve([]), JSON.stringify([owner, view]));
  const db = useLive(() => view === 'drafts' ? Promise.resolve({ rows: [], total: 0 }) : workRows(owner, view, undefined, undefined, scope), JSON.stringify([owner, view, revision, scope]));
  const rows = (db.value?.rows ?? []).filter(r => [str(r.row, 'Subject'), r.company, str(r.row, 'Status'), str(r.row, 'CaseNumber')].join(' ').toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  const groups = new Map<string, WorkRow[]>();
  for (const item of rows) {
    const group = view === 'meetings'
      ? recordDate(item.row).slice(0, 10) || 'Date unavailable'
      : str(item.row, view === 'cases' ? 'Status' : 'Priority') || 'Unspecified';
    const items = groups.get(group);
    if (items) items.push(item);
    else groups.set(group, [item]);
  }
  const active = rows.find(r => r.row.Id === selected) ?? rows[0];
  const draft = drafts.find(r => r.id === selected) ?? drafts[0];
  return <><Heading title="Commercial workbench" action={<Button style="primary" onClick={() => onEdit({ kind: view === 'cases' ? 'case' : view === 'meetings' ? 'meeting' : 'task' })}>{view === 'cases' ? 'New service case' : view === 'meetings' ? 'Plan company meeting' : 'New company task'}</Button>}>Company work, source ownership and clear handoffs. Review proposals before recording changes in Salesforce.</Heading>
    <Tabs choices={choices} value={view} onChange={next => { setView(next); setSelected(''); setQuery(''); }} />
    {view === 'drafts' ? <div className="cs-execution-desk"><section className="cs-triage-ledger"><header><span className="cs-eyebrow">LOCAL PROPOSALS / REVIEW DESK</span><h2>Ready for your review</h2><p>{drafts.length} local proposals</p></header>
      <section className="cs-triage-group"><h3>Proposed work <span>{drafts.length}</span></h3>{drafts.map(item => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={draft?.id === item.id}><span className="cs-triage-marker" aria-hidden="true">↳</span><span><strong>{item.title}</strong><small>{item.company || item.kind}</small><em>Local review required</em></span><b aria-hidden="true">↗</b></button>)}</section></section>
      <article className="cs-triage-detail"><div className="cs-triage-detail-label"><span className="cs-eyebrow">Local proposal / original editor</span><span>Review → refine → retain locally</span></div>{draft ? <div className="ca-proposal"><Badge>{draft.kind}</Badge><h2>{draft.title}</h2><p>{draft.company}</p><p>{draft.detail}</p>{draft.sourceRef && <p>Source {draft.sourceRef}</p>}<Button onClick={() => onEdit(draft)}>Review & edit</Button>{draft.accountId && <RouteLink to={`/client/${draft.accountId}`}>Return to company</RouteLink>}</div> : <div className="ca-source-empty"><h2>Start a local proposal</h2><p>Save a draft here and link a company when you’re ready to submit it.</p><div className="ca-actions">
          <Button style="primary" onClick={() => onEdit({ kind: 'task' })}>Draft a task</Button>
          <Button onClick={() => onEdit({ kind: 'meeting' })}>Plan a meeting</Button>
          <Button onClick={() => onEdit({ kind: 'case' })}>Draft a case</Button></div></div>}</article>
    </div> : <>
      {view === 'cases' && <ServiceTotals owner={owner} />}
      <div className="ca-work-filter"><label>Work scope<select value={scope} onChange={e => { setScope(e.target.value as WorkScope); setSelected(''); setQuery(''); }}>
        <option value="assigned">{owner === actorScope ? 'Assigned to me' : 'Assigned to this banker'}</option><option value="company">Company book</option></select></label><label>Find company work<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Company, subject, status or case number…" /></label><span>{db.pending ? 'Loading work…' : `${rows.length} shown · ${db.value?.total?.toLocaleString() ?? '—'} in scope`}</span></div>
      <Pending state={db}><div className="cs-execution-desk"><section className="cs-triage-ledger"><header><span className="cs-eyebrow">{view.toUpperCase()} / SALESFORCE</span><h2>Work queue</h2><p>{rows.length} shown · source dates and status retained</p></header>
        {[...groups].map(([group, items]) => <section className="cs-triage-group" key={group}><h3>{group}<span>{items.length}</span></h3>{items.map(({ row, company }) =>
          <button key={row.Id} aria-pressed={active?.row.Id === row.Id} onClick={() => setSelected(row.Id)}>
            <span className="cs-triage-marker" aria-hidden="true">{view === 'meetings' ? '◷' : view === 'cases' ? '◇' : '↳'}</span><span><strong>{str(row, 'Subject')}</strong><small>{company}</small>
              <em>{str(row, 'Status') || 'Recorded Event'} · {day(recordDate(row))}</em></span><b aria-hidden="true">↗</b>
          </button>)}</section>)}
        {rows.length === 0 && <div className="ca-source-empty"><p>{query ? 'No matches in the loaded records.' : 'No records in this scope.'}</p>
          <Button onClick={() => { if (query) setQuery(''); else setScope(scope === 'company' ? 'assigned' : 'company'); }}>{query ? 'Clear search' : scope === 'company' ? 'Show assigned work' : 'Show company book'}</Button></div>}
      </section><article className="cs-triage-detail"><div className="cs-triage-detail-label"><span className="cs-eyebrow">Exact source record / {kindLabel[view]}</span><span>Inspect → propose → review</span></div>{active ? <div className="ca-work-ticket"><div><Badge>{kindLabel[active.kind]}</Badge><span className="ca-badge" data-priority={str(active.row, 'Priority')}>{str(active.row, 'Priority') || str(active.row, 'Status') || 'Recorded'}</span></div><h2>{str(active.row, 'Subject')}</h2><p>{active.company}</p><div className="ca-work-time"><span>◷</span><strong>{day(recordDate(active.row))}</strong></div><p>{str(active.row, 'Description') || 'No source description supplied.'}</p><div className="ca-ticket-footer"><Button onClick={() => setInspected(active)}>Inspect & propose</Button>{active.accountId ? <RouteLink to={`/client/${active.accountId}`}>Open company</RouteLink> : <WorkActions selected={active} onEdit={onEdit} />}</div></div> : <h2>No record selected</h2>}<div className="cs-handoff-note"><span aria-hidden="true">↳</span><div><h3>Make the handoff specific.</h3><p>The inspector retains the owner, linked company and source record. Proposed changes remain local until reviewed.</p></div></div></article></div></Pending>
    </>}
    {view === 'drafts' && stageDrafts.rows.length > 0 && <Panel title="Opportunity stage plans"><div className="ca-watch-list">{stageDrafts.rows.map(plan =>
      <article key={plan.id}><strong>{plan.label}</strong><p>{plan.recorded} → {plan.proposed}</p><RouteLink to={`/pipeline?deal=${plan.recordId}`}>Open opportunity</RouteLink></article>)}</div></Panel>}
    {view === 'cases' && <Panel title="External service requests"><Pending state={service}><div className="ca-watch-list">{service.value?.map(row =>
      <button className="ca-source-row" key={row.id} onClick={() => setExternal(row)}><Badge>{row.source}</Badge><strong>{row.company}</strong><span>{row.title}</span></button>)}</div>{!service.value?.length && <p>No external service requests returned.</p>}</Pending></Panel>}
    {external && <Inspect title={external.title} onClose={() => setExternal(undefined)}><Badge>{external.source}</Badge><p>{external.company} · {day(external.date)}</p><p>{external.detail}</p><RouteLink to={`/client/${external.accountId}`}>Open company</RouteLink></Inspect>}
    {inspected && <Inspect title={str(inspected.row, 'Subject')} onClose={() => setInspected(undefined)}><WorkDetail selection={inspected} onEdit={item => { setInspected(undefined); onEdit(item); }} /></Inspect>}
  </>;
}

type ActivityProps = { owner: string; accountId?: string; onEdit: DraftEditor; revision: number };
function useMeetings({ owner, accountId, revision }: ActivityProps) {
  return useLive(() => workRows(owner, 'meetings', undefined, accountId), JSON.stringify([owner, accountId, revision]));
}
export function ActivityContent(props: ActivityProps) {
  const meetings = useMeetings(props);
  return <ActivityTimeline {...props} meetings={meetings} />;
}
function ActivityTimeline({ owner, accountId, onEdit, revision, meetings }: ActivityProps & { meetings: ReturnType<typeof useMeetings> }) {
  const tasks = useLive(() => workRows(owner, 'tasks', undefined, accountId), JSON.stringify([owner, accountId, revision]));
  const cases = useLive(() => workRows(owner, 'cases', undefined, accountId), JSON.stringify([owner, accountId, revision]));
  const [selected, setSelected] = useState<WorkRow>();
  const rows = [...(tasks.value?.rows ?? []), ...(meetings.value?.rows ?? [])].sort((a, b) => recordDate(b.row).localeCompare(recordDate(a.row))).slice(0, 18);
  return <><div className="ca-activity-layout"><Panel title="Company activity"><div className="ca-activity-timeline">
    {rows.map(item => <article key={item.row.Id}><div className="ca-timeline-date"><strong>{recordDate(item.row).slice(8, 10) || '—'}</strong><span>{day(recordDate(item.row))}</span></div>
      <div><Badge>{kindLabel[item.kind]}</Badge><h3>{str(item.row, 'Subject')}</h3><p>{item.company} · {str(item.row, 'Status') || str(item.row, 'Location') || 'Company activity'}</p><small>{str(item.row, 'OwnerId')}</small></div>
      <Button onClick={() => setSelected(item)}>Inspect</Button></article>)}
    {(tasks.pending || meetings.pending) && <p role="status">Loading recorded activities…</p>}{(tasks.error || meetings.error) && <p role="alert">Some activity sources are unavailable.</p>}
    {!rows.length && tasks.value && meetings.value && <p>No company Tasks or Events returned.</p>}
  </div></Panel><div><Panel title="Service context"><Pending state={cases}>{cases.value?.rows.map(r => <article className="ca-service-card" key={r.row.Id}><Badge>CRM Case {str(r.row, 'CaseNumber')}</Badge><h3>{str(r.row, 'Subject')}</h3><p>{str(r.row, 'Status')} · {str(r.row, 'Priority')}</p><Button onClick={() => setSelected(r)}>Review case</Button></article>)}{!cases.value?.rows.length && <p>No company Cases returned.</p>}</Pending></Panel>
  <Panel title="Company planning context"><p>Company financing needs stay separate from the owner’s personal milestones.</p></Panel></div></div>
  {selected && <Inspect title={str(selected.row, 'Subject')} onClose={() => setSelected(undefined)}><WorkDetail selection={selected} onEdit={item => { setSelected(undefined); onEdit(item); }} /></Inspect>}</>;
}

function PersonalPlanning({ owner }: { owner: string }) {
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<'goal' | 'milestone'>();
  const data = useLive(() => readPersonalPlanning(owner), JSON.stringify([owner, revision]));
  const [picked, setPicked] = useState<{ row: RecordNode; kind: 'goal' | 'milestone' }>();
  const goals = nodes(data.value?.FinancialGoal);
  const life = nodes(data.value?.PersonLifeEvent);
  const accounts = new Map<string, string>();
  for (const goal of goals) if (goal.FinancialPlan?.Account) accounts.set(goal.FinancialPlan.Account.Id, String(goal.FinancialPlan.Account.Name?.value ?? ''));
  for (const event of life) if (event.PrimaryPerson?.Account) accounts.set(event.PrimaryPerson.Account.Id, String(event.PrimaryPerson.Account.Name?.value ?? ''));
  return <Panel title="Personal planning records also assigned to your book" action={<div className="ca-actions"><Button onClick={() => setCreating('goal')}>New financial goal</Button><Button onClick={() => setCreating('milestone')}>New life event</Button></div>}><Pending state={data}>
    <div className="ca-personal-context">{[...accounts].map(([account, name]) => <section key={account}>
      <div className="ca-personal-heading"><span className="ca-person-symbol">{name.slice(0, 1)}</span><h3>{name}</h3></div>
      {goals.filter(goal => goal.FinancialPlan?.Account?.Id === account).map(row => <button className="ca-source-row" key={row.Id} onClick={() => setPicked({ row, kind: 'goal' })}><strong>{str(row, 'Name')}</strong><span>{cash(str(row, 'ActualAmount'))} / {cash(str(row, 'TargetAmount'))}</span><small>{day(str(row, 'TargetDate'))}</small></button>)}
      {life.filter(event => event.PrimaryPerson?.Account?.Id === account).map(row => <div className="ca-personal-milestone" key={row.Id}><span>{str(row, 'EventType')}</span><strong>{str(row, 'Name')}</strong><time>{day(str(row, 'EventDate'))}</time><Button style="text-button" onClick={() => setPicked({ row, kind: 'milestone' })}>Review personal milestone</Button></div>)}
    </section>)}</div>
    {!accounts.size && <p>No personal plans or milestones returned.</p>}
  </Pending>{picked && !editing && <Inspect title={str(picked.row, 'Name')} onClose={() => setPicked(undefined)}><Badge>{picked.kind === 'goal' ? 'Financial goal' : str(picked.row, 'EventType')}</Badge>
    <p>{day(str(picked.row, picked.kind === 'goal' ? 'TargetDate' : 'EventDate'))}</p>
    {picked.kind === 'goal' && <><p>{picked.row.FinancialPlan?.Name?.value}</p><p>{cash(str(picked.row, 'ActualAmount'))} / {cash(str(picked.row, 'TargetAmount'))}</p></>}
    <Button style="primary" onClick={() => setEditing(true)}>Review changes</Button>
  </Inspect>}
    {creating === 'goal' && <CustomerGoalModal open ownerId={owner} onClose={() => setCreating(undefined)} onSaved={() => setRevision(r => r + 1)} goal={{ create: true, name: '' }} />}
    {creating === 'milestone' && <LifeEventModal open ownerId={owner} onClose={() => setCreating(undefined)} onSaved={() => setRevision(r => r + 1)} event={{ create: true, name: '' }} />}
    {picked?.kind === 'goal' && editing && <CustomerGoalModal open onClose={() => { setEditing(false); setPicked(undefined); }} onSaved={() => setRevision(r => r + 1)} goal={{
      recordId: picked.row.Id, name: str(picked.row, 'Name'), clientName: String(picked.row.FinancialPlan?.Account?.Name?.value ?? ''),
      planName: String(picked.row.FinancialPlan?.Name?.value ?? ''), description: str(picked.row, 'Description'), status: str(picked.row, 'Status'),
      priority: str(picked.row, 'Priority'), type: str(picked.row, 'Type'), targetDate: str(picked.row, 'TargetDate').slice(0, 10),
      target: str(picked.row, 'TargetAmount') ? Number(str(picked.row, 'TargetAmount')) : undefined,
      current: str(picked.row, 'ActualAmount') ? Number(str(picked.row, 'ActualAmount')) : undefined,
    }} />}
    {picked?.kind === 'milestone' && editing && <LifeEventModal open onClose={() => { setEditing(false); setPicked(undefined); }} onSaved={() => setRevision(r => r + 1)} event={{
      recordId: picked.row.Id, name: str(picked.row, 'Name'), clientName: String(picked.row.PrimaryPerson?.Account?.Name?.value ?? ''),
      contactId: picked.row.PrimaryPerson?.Id, eventType: str(picked.row, 'EventType'), eventDate: str(picked.row, 'EventDate').slice(0, 10),
    }} />}
  </Panel>;
}

function BusinessPlanning({ owner, onEdit }: { owner: string; onEdit: DraftEditor }) {
  const owners = useLive(async () => {
    const { rows } = await fetchOwnerWealthHandoffs(owner, true);
    const companies = await verifyAccounts(owner, rows.map(row => row.businessId));
    return rows.flatMap(row => {
      const business = companies.get(recordKey(row.businessId));
      return business ? [{ ...row, company: str(business, 'Name'), businessId: business.Id }] : [];
    }).slice(0, 2);
  }, owner);
  const [selected, setSelected] = useState<OwnerHandoffRow & { company: string }>();
  return <Panel title="Business and owner planning"><div className="ca-planning-graph"><span>Company needs</span><i>↔</i><span>Owner goals</span></div>
    <p>Succession, liquidity and business benefits may need an owner conversation.</p>
    <Pending state={owners}>{owners.value?.map(row => <button className="ca-source-row" key={row.ownerId + row.businessId} onClick={() => setSelected(row)}>
      <strong>{row.ownerName}</strong><span>{row.company}</span></button>)}</Pending>
    <RouteLink to="/growth?view=development">Open all owner introductions</RouteLink>
    {selected && <Inspect title={selected.ownerName} onClose={() => setSelected(undefined)}><Badge>Owner introduction</Badge>
      <h3>{selected.company}</h3><p>{selected.netWorthBand} · {selected.wealthScore} Wealth propensity</p>
      <p>{selected.confidencePct}% ownership confidence</p><Button onClick={() => {
        onEdit({ kind: 'task', accountId: selected.businessId, company: selected.company, sourceRef: selected.ownerId, title: 'Review Wealth introduction for ' + selected.ownerName });
        setSelected(undefined);
      }}>Review introduction proposal</Button></Inspect>}
  </Panel>;
}
function monthStart(delta = 0, current = new Date()) {
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1));
}
export function Planning({ owner, onEdit, drafts, revision }: { owner: string; onEdit: DraftEditor; drafts: Draft[]; revision: number }) {
  const meetings = useMeetings({ owner, onEdit, revision });
  const [monthOverride, setMonth] = useState<Date>();
  const [mode, setMode] = useState<'recorded' | 'planned'>('recorded');
  const [selected, setSelected] = useState('');
  const [inspect, setInspect] = useState<WorkRow>();
  const planned = drafts.filter(r => r.kind === 'meeting' && !r.original && r.operation !== 'delete').map(r => ({ id: r.id, date: r.date, title: r.title, company: r.company, draft: r }));
  const latest = meetings.value?.rows[0];
  const anchor = mode === 'recorded' ? latest && recordDate(latest.row) : planned.map(p => p.date).filter(Boolean).sort()[0];
  const month = monthOverride ?? monthStart(0, anchor ? new Date(anchor) : new Date());
  const key = month.toISOString().slice(0, 7);
  const events = useLive(() => workRows(owner, 'meetings', key), JSON.stringify([owner, key, revision]));
  const recorded = events.value?.rows.map(r => ({ id: r.row.Id, date: recordDate(r.row).slice(0, 10), title: str(r.row, 'Subject'), company: r.company, source: r })) ?? [];
  const entries = mode === 'recorded' ? recorded : planned;
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (month.getUTCDay() + 6) % 7;
  return <><Heading title="Company meetings and plans" action={<Button style="primary" onClick={() => onEdit({ kind: 'meeting' })}>Plan a company meeting</Button>}>Recorded activities, reviewable proposals and business context. Keep company work separate from personal milestones.</Heading>
    <section className="ca-panel cr-agenda"><header><h2>Recorded agenda</h2></header><RecordedAgendaPreview owner={owner} expanded key={revision} /></section>
    <div className="ca-planning-top cs-planning-layout"><section className="ca-calendar"><header><h2>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div><Button onClick={() => setMonth(monthStart(-1, month))}>Previous month</Button><Button onClick={() => setMonth(monthStart(1, month))}>Next month</Button></div></header>
      <Tabs choices={[[ 'recorded', 'Recorded Events' ], [ 'planned', 'Local meeting proposals' ]]} value={mode} onChange={next => { setMode(next); setMonth(undefined); setSelected(''); }} />
      <p>{mode === 'planned' ? 'Unsubmitted new meeting proposals.' : 'Recorded company Events. Open a day for its agenda.'}</p>
      {mode === 'recorded' && events.pending && <p role="status">Loading Events…</p>}{mode === 'recorded' && events.error && <p role="alert">{events.error}</p>}
      {mode === 'recorded' && (events.value?.total ?? 0) > 200 && <p>Showing up to 200 Events this month.</p>}
      <div className="ca-calendar-week">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <span key={w}>{w}</span>)}</div>
      <div className="ca-calendar-grid">{Array.from({ length: pad }, (_, i) => <div key={`pad${i}`} className="ca-calendar-pad" />)}
        {Array.from({ length: days }, (_, i) => { const d = `${key}-${String(i + 1).padStart(2, '0')}`; const found = entries.filter(r => r.date === d); return <div key={d}><time>{i + 1}</time>{found.length > 0 && <><button onClick={() => setSelected(d)} aria-label={`${day(d)}, ${found.length} events`}><strong>{found.length}</strong> {found.length === 1 ? 'event' : 'events'}</button><span className="ca-calendar-preview">{found[0].title}</span></>}</div>; })}
      </div>
    </section><BusinessPlanning owner={owner} onEdit={onEdit} /></div>
    <ActivityTimeline meetings={meetings} owner={owner} onEdit={onEdit} revision={revision} />
    <PersonalPlanning owner={owner} />
    {selected && <Inspect title={day(selected)} onClose={() => setSelected('')}>{entries.filter(r => r.date === selected).map(r => <button className="ca-source-row" key={r.id} onClick={() => { setSelected(''); if ('source' in r) setInspect(r.source); else onEdit(r.draft); }}><strong>{r.title}</strong><span>{r.company}</span></button>)}</Inspect>}
    {inspect && <Inspect title={str(inspect.row, 'Subject')} onClose={() => setInspect(undefined)}><WorkDetail selection={inspect} onEdit={item => { setInspect(undefined); onEdit(item); }} /></Inspect>}
  </>;
}
