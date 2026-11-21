import { useState } from 'react';
import { Shield } from 'lucide-react';
import { RelationshipFacts, RelationshipPacket, RelationshipProfile, type PacketSection } from '@shared/components/atlas/AtlasRelationshipScenes';
import '../../../../../../../docs/design-studies/2026-11-12-directions/retail-context.css';
import { Link, useParams } from 'react-router';
import { ScheduleDetailModal } from '@shared/components/home/ScheduleDetailModal';
import { AGENTFORCE_FLOWS } from '../personas/customer/agentforceFlows';
import { accountId, field, label, numeric, readBook, readOfferHistory, type BookNode, type Row } from './retailData';
import { readCustomerCrm, readCustomerHoldings, readCustomerSource } from './retailCustomerData';
import { Choices, compact, count, date, Facts, money, Paging, RecordLink, SourceNotice, text, Title, useFilters, useSource, useWorkspace } from './retailUi';

const tabs = [
  ['overview','Overview'], ['profile','Profile'], ['finances','Finances'], ['journey','Journey & goals'],
  ['engagement','Engagement & service'], ['growth','Opportunities'], ['tools','Notes & tools'], ['notebook','Notebook'], ['screening','Screening'],
] as const;
const returnPaths = new Set(['/', '/relationships', '/pipeline', '/journey', '/prospecting', '/growth', '/intelligence', '/health', '/work']);

export default function RetailCustomer({ ownerId }: { ownerId: string }) {
  const { id } = useParams();
  const source = useSource(`relationship:${ownerId}:${id ?? ''}`, async () => {
    if (!id || !accountId.test(id)) throw new Error('The relationship link is invalid.');
    const result = await readBook('Account', ownerId, { record: id, count: 1 });
    return result.rows[0] ?? null;
  });
  const { params } = useFilters();
  const rawReturn = params.get('returnTo');
  const back = rawReturn && returnPaths.has(rawReturn.split('?')[0]) && !rawReturn.includes('#') ? rawReturn : '/relationships';
  if (!source.data) return <>
    <Link className="text-button" to={back}>Relationships</Link>
    <SourceNotice source={source} />
    {!source.loading && <section className="surface"><Title title="Relationship unavailable" description="This account could not be verified in the current book." /></section>}
  </>;
  return <Dossier key={`${ownerId}:${source.data.Id}`} customer={source.data} ownerId={ownerId} back={back} />;
}

type Props = { customer: BookNode; ownerId: string };
type Tab = typeof tabs[number][0];
function Dossier({ customer, ownerId, back }: Props & { back: string }) {
  const { params, update, choice } = useFilters();
  const { open, drafts, pins, togglePin } = useWorkspace();
  const tab = choice('tab', tabs.map(([value]) => value), 'overview');
  const changeTab = (value: Tab) => update({ tab: value, transaction: null, conversation: null, record: null });
  const name = label(customer, 'Name');
  const summary = [label(customer, 'Type', ''), label(customer, 'Industry', ''), label(customer, 'BillingCity', '')].filter(Boolean).join(' · ');
  const compare = params.get('tab');
  const preparation = drafts.find(item => item.id === `relationship-note:${customer.Id}`);
  const isPinned = pins.includes(customer.Id);
  return <>
    <div className="breadcrumb"><Link to={back}>Relationships</Link><span aria-hidden="true">/</span><span>{name}</span></div>
    <header className="dossier-header"><div><h1>{name}</h1><p>{summary || 'Salesforce relationship'}</p></div>
      <div className="dossier-actions"><button className="secondary" aria-pressed={isPinned} onClick={() => togglePin(customer.Id)}>{isPinned ? 'Unpin relationship' : 'Pin relationship'}</button>
        <button className="primary" onClick={() => open({ kind: 'prep', id: customer.Id, name, context: [summary, preparation?.note].filter(Boolean).join(' · '), promptFlow: AGENTFORCE_FLOWS.account })}>Prepare conversation <span aria-hidden="true">→</span></button>
        <button className="secondary" onClick={() => open({ kind: 'task', id: customer.Id, name,
          whoId: label(customer,'PersonContactId','') || undefined })}>Create task</button>
      </div></header>
    <nav className="dossier-tabs" aria-label="Relationship views">
      {tabs.map(([value, display]) => <button type="button" aria-current={value === tab ? 'page' : undefined}
        aria-pressed={value === tab} key={value} onClick={() => changeTab(value)}>{display}</button>)}
    </nav>
    {compare && compare !== tab && <p className="source-note">That relationship view is unavailable. Showing Overview.</p>}
    <section className="cx-dossier" data-relationship-tab={tab} aria-label={tabs.find(([value]) => value === tab)?.[1]}>
      {tab === 'overview' && <CustomerOverview customer={customer} ownerId={ownerId} changeTab={changeTab} />}
      {tab === 'profile' && <Profile customer={customer} ownerId={ownerId} changeTab={changeTab} />}
      {tab === 'finances' && <Finances customer={customer} ownerId={ownerId} />}
      {tab === 'journey' && <CustomerJourney customer={customer} ownerId={ownerId} />}
      {tab === 'engagement' && <CustomerEngagement customer={customer} ownerId={ownerId} />}
      {tab === 'notebook' && <Notebook customer={customer} ownerId={ownerId} />}
      {tab === 'growth' && <CustomerGrowth customer={customer} ownerId={ownerId} />}
      {tab === 'tools' && <Tools customer={customer} ownerId={ownerId} goNotebook={() => changeTab('notebook')} />}
      {tab === 'screening' && <Screening customer={customer} ownerId={ownerId} />}
    </section>
  </>;
}

function CustomerOverview({ customer, ownerId, changeTab }: Props & { changeTab: (value: Tab) => void }) {
  const holdings = useSource(`holdings:${customer.Id}`, () => readCustomerHoldings(customer));
  const goals = useSource(`customer-goals:${ownerId}:${customer.Id}`, () => readCustomerCrm('FinancialGoal', ownerId, customer, 1));
  const tasks = useSource(`customer-tasks:${ownerId}:${customer.Id}`, () => readCustomerCrm('Task', ownerId, customer, 1));
  const events = useSource(`customer-events:${ownerId}:${customer.Id}`, () => readCustomerCrm('Event', ownerId, customer, 1));
  return <section className="cx-overview">
    <div className="cx-overview-main"><span className="badge">Your relationship review</span><h2>Customer overview</h2>
      <p>{label(customer,'Name')} · {[label(customer,'BillingCity',''),label(customer,'BillingState','')].filter(Boolean).join(', ')}</p>
      <div className="cx-actions"><button className="primary" onClick={() => changeTab('finances')}>Review finances</button>
        <button className="secondary" onClick={() => changeTab('engagement')}>Read conversation history</button></div>
    </div>
    <div className="cx-bookmarks">
      <button className="cx-bookmark" onClick={() => changeTab('finances')}><strong>{count(holdings.data?.total)} financial accounts</strong><span>Balances and recent transactions</span></button>
      <button className="cx-bookmark" onClick={() => changeTab('journey')}><strong>{count(goals.data?.totalCount)} financial goals</strong><span>Plan-linked targets and progress</span></button>
      <button className="cx-bookmark" onClick={() => changeTab('engagement')}><strong>Recorded follow-through</strong><span>{count(tasks.data?.totalCount)} tasks · {count(events.data?.totalCount)} meetings with original assignees</span></button>
      <button className="cx-bookmark" onClick={() => changeTab('notebook')}><strong>Prepare your next contact</strong><span>Private notes beside recorded meeting context</span></button>
    </div>
  </section>;
}

function Profile({ customer, ownerId, changeTab }: Props & { changeTab: (value: Tab) => void }) {
  const { open } = useWorkspace();
  const name = label(customer, 'Name');
  const fields = customerProfileFields(customer);
  const property = useCustomerSource('property', ownerId, customer);
  const values = property.data?.rows[0];
  const owned = [true,'true',1,'1'].includes(values?.is_owner as boolean | string | number);
  return <>
    <RelationshipProfile name={name} type={label(customer,'Type','')} recordId={customer.Id}
      location={[label(customer,'BillingCity',''), label(customer,'BillingState','')].filter(Boolean).join(', ')}
      fields={fields} prepare={() => open({ kind: 'prep', id: customer.Id, name,
        context: fields.map(([key, value]) => `${key}: ${value}`).join(' · '), promptFlow: AGENTFORCE_FLOWS.account })}>
      <h3>Work attached to this relationship</h3>
      <div className="ax-context-links">
        <button className="secondary" onClick={() => changeTab('engagement')}>Review tasks and cases</button>
        <button className="secondary" onClick={() => changeTab('tools')}>Notes &amp; review packet</button>
      </div>
    </RelationshipProfile>
    <section className="surface"><Title title="Property context" description="CoreLogic’s latest available source period." />
      <SourceNotice source={property} empty={!values} warning={property.data?.warning} />
      {values && <Facts values={[[ 'Source quarter', date(values.dt) ], ['Property type', text(values.property_type)], ['Estimated property value', owned ? money(values.val) : '—'],
        ['Estimated equity', owned ? money(values.eq) : '—'], ['Mortgage balance', owned ? money(values.mortgage) : '—']]} />}
    </section>
  </>;
}
function customerProfileFields(customer: BookNode) {
  return [
    ['Industry', label(customer,'Industry')], ['Annual revenue', money(field(customer,'AnnualRevenue'))],
    ['Employees', count(field(customer,'NumberOfEmployees'))], ['Phone', label(customer,'Phone')],
    ['Email', label(customer,'PersonEmail')], ['Website', label(customer,'Website')],
  ] as const;
}
function useCustomerSource(source: Parameters<typeof readCustomerSource>[2], ownerId: string, customer: BookNode) {
  return useSource(`customer-source:${source}:${ownerId}:${customer.Id}`, () => readCustomerSource(customer, ownerId, source));
}

const balanceBand = (row: BookNode) => {
  const type = label(row, 'FinServ__FinancialAccountType__c', '') + ' ' + label(row, 'Name', '');
  return /credit.card|loan|mortgage|heloc/i.test(type) ? 'debt' : /checking|saving|deposit|certificate/i.test(type) ? 'deposits' : 'other';
};

function Finances({ customer, ownerId }: Props) {
  const { open } = useWorkspace();
  const holdings = useSource(`holdings:${customer.Id}`, () => readCustomerHoldings(customer));
  const ledger = useCustomerSource('transactions', ownerId, customer);
  const { params, update, choice } = useFilters();
  const filter = choice('transaction', ['all','Credit','Debit'], 'all');
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0));
  const filtered = ledger.data?.rows.filter(row => filter === 'all' || row.typ === filter) ?? [];
  const shown = filtered.slice(page * 6, page * 6 + 6);
  const bands = [['deposits','Recorded deposit balances','Checking, savings and deposit products'],
    ['debt','Recorded loan & card balances','Separate from deposits'], ['other','Other financial-account balances','Other recorded financial-account products']] as const;
  const bandTotal = (band: typeof bands[number][0]) => {
    if (!holdings.data) return null;
    const rows = holdings.data.rows.filter(row => balanceBand(row) === band);
    const values = rows.flatMap(row => numeric(field(row, 'FinServ__Balance__c')) ?? []);
    return rows.length && !values.length ? null : values.reduce((sum,n) => sum + n, 0);
  };
  return <>
    <section className="cx-finances">
      <SourceNotice source={holdings} empty={!holdings.data?.rows.length} />
      <div className="cx-balance-spread">{bands.map(([key,name,description]) => <div key={key}><span>{name}</span><strong>{money(bandTotal(key))}</strong><small>{description}</small></div>)}</div>
      <div className="cx-account-stack">{holdings.data?.rows.map(row => <button className="cx-account" key={row.Id}
        onClick={() => open({ kind: 'detail', title: label(row,'Name'), children: <Facts values={[[ 'Account ID', row.Id ], ['Primary relationship', label(customer,'Name')],
          ['Recorded balance', money(field(row,'FinServ__Balance__c'))], ['Status', label(row,'FinServ__Status__c')]]} /> })}>
        <span className="cx-account-mark">{balanceBand(row) === 'debt' ? '↗' : '◎'}</span><span><strong>{label(row,'Name')}</strong>
          <small>{label(row,'FinServ__FinancialAccountType__c')} · {label(row,'FinServ__Status__c')}</small></span><b>{money(field(row,'FinServ__Balance__c'))}</b>
      </button>)}</div>
    </section>
    <section className="cx-ledger"><header className="cx-section-head"><div><h2>Account activity</h2><p>Latest selected Data 360 transactions for this relationship.</p></div>
      <Choices className="cx-modes" items={[[ 'all','All transactions' ], ['Credit','Money in'], ['Debit','Money out']]} selected={filter} update={value => update({ transaction: value, page: null })} /></header>
      <SourceNotice source={ledger} empty={!filtered.length} warning={ledger.data?.warning} />
      {shown.map((row, index) => <div className="cx-transaction" data-direction={text(row.typ)} key={`${text(row.dt)}:${index}`}><span className="cx-account-mark">{row.typ === 'Debit' ? '↗' : '↙'}</span>
        <span><strong>{text(row.cat)}</strong><small>{date(row.dt)} · {text(row.typ)}</small></span><b>{money(row.amt)}</b></div>)}
      <Paging total={filtered.length} shown={shown.length} offset={page * 6} previous={page > 0 ? () => update({ page: String(page - 1) }) : undefined}
        next={(page + 1) * 6 < filtered.length ? () => update({ page: String(page + 1) }) : undefined} />
    </section>
  </>;
}

function CustomerJourney({ customer, ownerId }: Props) {
  const { open } = useWorkspace();
  const events = useSource(`customer-life:${ownerId}:${customer.Id}`, () => readCustomerCrm('PersonLifeEvent', ownerId, customer));
  const goals = useSource(`customer-goals:${ownerId}:${customer.Id}`, () => readCustomerCrm('FinancialGoal', ownerId, customer));
  return <>
    <section className="surface"><Title title="Life events" description="Recorded events linked to this exact account.">
      <button className="secondary" onClick={() => open({ kind: 'life', onSaved: events.retry })}>Log life event</button></Title>
      <SourceNotice source={events} empty={!events.data?.rows.length} />
      {events.data?.rows.map(row => <div key={row.Id} className="list-row"><div><strong>{label(row,'Name')}</strong><p>{label(row,'EventType')} · {date(field(row,'EventDate'))}</p></div>
        <button className="secondary" onClick={() => open({ kind: 'life', row, onSaved: events.retry })}>Review milestone</button></div>)}
    </section>
    <section className="cx-goals"><header className="cx-section-head"><div><h2>What {label(customer,'Name').split(' ')[0]} is working toward.</h2><p>Goals stay linked through the customer’s financial plan.</p></div>
      <button className="primary" onClick={() => open({ kind: 'goal', onSaved: goals.retry })}>New financial goal</button></header>
      <SourceNotice source={goals} empty={!goals.data?.rows.length} />
      <div className="cx-goal-tracks">{goals.data?.rows.map(row => {
        const actual = numeric(field(row,'ActualAmount'));
        const target = numeric(field(row,'TargetAmount'));
        const pct = actual != null && target != null && target > 0 ? Math.max(0,Math.min(100,Math.round(actual / target * 100))) : null;
        return <article key={row.Id}><div className="cx-section-head"><span className="badge">{label(row,'Type')} · {label(row,'Priority')}</span><span>{label(row,'Status').replace(/_/g,' ')}</span></div>
          <h3>{label(row,'Name')}</h3><div className="cx-goal-progress"><strong>{pct == null ? '—' : `${pct}%`}</strong>
            <span>{money(actual)}<br />of {money(target)}</span></div>
          {pct != null && <div className="cx-goal-track"><i style={{ width: `${pct}%` }} /></div>}<p>Target {date(field(row,'TargetDate'))}</p>
          <button className="secondary" onClick={() => open({ kind: 'goal', row, onSaved: goals.retry })}>Review goal</button>
        </article>;
      })}</div>
    </section>
  </>;
}

function CustomerEngagement({ customer, ownerId }: Props) {
  const { open } = useWorkspace();
  const { params, update } = useFilters();
  const source = useCustomerSource('interactions', ownerId, customer);
  const scores = useCustomerSource('satisfaction', ownerId, customer);
  const campaigns = useCustomerSource('campaigns', ownerId, customer);
  const [campaignPage, setCampaignPage] = useState(0);
  const campaignSize = 8;
  const campaignRows = campaigns.data?.rows ?? [];
  const campaignOffset = campaignPage * campaignSize;
  const visibleCampaigns = campaignRows.slice(campaignOffset, campaignOffset + campaignSize);
  const rows = source.data?.rows ?? [];
  const key = (row: Row, index: number) => `${text(row.dt)}-${index}`;
  const selectedId = params.get('conversation');
  const selected = selectedId ? rows.find((row,index) => key(row,index) === selectedId) : rows[0];
  const scoreRows = scores.data?.rows.slice().reverse() ?? [];
  const last = scoreRows[scoreRows.length - 1];
  return <>
    <div className="cx-engagement">
      <section className="cx-conversations"><header className="cx-section-head"><div><h2>Customer interactions</h2><p>Recent summaries from this exact relationship.</p></div></header>
        <SourceNotice source={source} empty={!rows.length} warning={source.data?.warning} />
        <div className="cx-conversation-list">{rows.map((row,index) => <button className="cx-conversation" key={key(row,index)} aria-pressed={row === selected}
          onClick={() => update({ conversation: key(row,index) })}><time>{date(row.dt)}</time><strong>{text(row.purp ?? row.nm)}</strong><span>{text(row.notes)}</span></button>)}</div>
      </section>
      <aside className="cx-conversation-focus">{selected && <><span className="badge">Recorded interaction summary</span><h2>{text(selected.purp ?? selected.nm)}</h2>
        <time>{date(selected.dt)}</time><p>{text(selected.notes)}</p><h3>Recorded next steps</h3><p>{text(selected.nxt)}</p>
        <button className="primary" onClick={() => open({ kind: 'task', id: customer.Id, name: label(customer,'Name'), whoId: label(customer,'PersonContactId','') || undefined,
          subject: `Follow up: ${text(selected.purp ?? selected.nm)}`, context: text(selected.nxt,'') })}>Prepare follow-up</button></>}
        <section className="cx-satisfaction"><h3>Satisfaction over time</h3><SourceNotice source={scores} empty={!scoreRows.length} warning={scores.data?.warning} />
          {scoreRows.length > 0 && <svg viewBox="0 0 300 130" role="img" aria-label="Recorded satisfaction scores">
            <line x1="15" y1="110" x2="285" y2="110" stroke="var(--tone-wash)" />
            <polyline points={scoreRows.flatMap((row,i) => numeric(row.csat) == null ? [] : [`${15 + i / Math.max(1,scoreRows.length - 1) * 270},${110 - Number(row.csat)}`]).join(' ')}
              fill="none" stroke="var(--tone-accent)" strokeWidth="3" />
            {scoreRows.map((row,i) => numeric(row.csat) != null && <circle key={i} cx={15 + i / Math.max(1,scoreRows.length - 1) * 270} cy={110 - Number(row.csat)} r="4" fill="var(--tone-accent)">
              <title>{date(row.dt)} · {count(row.csat)}/100</title></circle>)}
          </svg>}
          <Facts values={[[ 'Latest CSAT', count(last?.csat) ], ['Reported NPS', count(last?.nps)]]} />
        </section>
      </aside>
    </div>
    <Activities customer={customer} ownerId={ownerId} />
    <section className="cx-campaigns"><Title title="Campaign touchpoints" description="Outreach context from the linked marketing source." />
      <SourceNotice source={campaigns} empty={!campaigns.data?.rows.length} warning={campaigns.data?.warning} />
      {visibleCampaigns.map((row,i) => <article key={`${text(row.dt)}:${campaignOffset+i}`}><h3>{text(row.nm)}</h3><p>{text(row.prod)} · {text(row.act)} · {date(row.dt)}</p></article>)}
      {campaignRows.length > campaignSize && <Paging total={campaignRows.length} shown={visibleCampaigns.length} offset={campaignOffset}
        previous={campaignPage === 0 ? undefined : () => setCampaignPage(page => page - 1)}
        next={campaignOffset + campaignSize >= campaignRows.length ? undefined : () => setCampaignPage(page => page + 1)} />}
    </section>
  </>;
}

function Activities({ customer, ownerId }: Props) {
  const tasks = useSource(`customer-tasks:${ownerId}:${customer.Id}`, () => readCustomerCrm('Task', ownerId, customer));
  const cases = useSource(`customer-cases:${ownerId}:${customer.Id}`, () => readCustomerCrm('Case', ownerId, customer));
  const [selected, setSelected] = useState<BookNode | null>(null);
  return <section className="cx-commitments"><header className="cx-section-head"><div><h2>Commitments and service cases</h2><p>Original assignees stay attached. Historical dates are not presented as today’s agenda.</p></div>
      <Link className="secondary" to={`/work?view=meetings&account=${encodeURIComponent(customer.Id)}`}>Review recorded meetings</Link></header>
    <SourceNotice source={tasks} empty={!tasks.data?.rows.length} />
    <div className="cx-task-grid">{tasks.data?.rows.slice(0,6).map(row => <article key={row.Id}><span className="badge">{label(row,'Status')}</span><h3>{label(row,'Subject')}</h3>
      <p>{date(field(row,'ActivityDate'))} · {label(row,'Type')}</p><p>Assigned to {label(row,'OwnerId')}</p>
      <button className="secondary" onClick={() => setSelected(row)}>Review task</button></article>)}</div>
    <details><summary>{tasks.data && !tasks.data.next ? `All ${tasks.data.rows.length} recorded tasks` : `${count(tasks.data?.rows.length)} recorded tasks shown`}</summary>
      {tasks.data?.rows.map(row => <div key={row.Id} className="cx-compact-row"><strong>{label(row,'Subject')}</strong>
        <span>{label(row,'Status')} · {label(row,'OwnerId')}</span>
        <button className="secondary" onClick={() => setSelected(row)}>Review</button>
      </div>)}</details>
    <details><summary>{count(cases.data?.totalCount)} recorded service cases</summary><SourceNotice source={cases} empty={!cases.data?.rows.length} />
      {cases.data?.rows.map(row => <article key={row.Id}><h3>{label(row,'Subject')}</h3><p>{label(row,'Status')} · {label(row,'Priority')}</p>
        <p>{label(row,'Description','No description recorded.')}</p><RecordLink object="Case" id={row.Id} /></article>)}</details>
    {selected && <ScheduleDetailModal open onClose={() => setSelected(null)} onSaved={tasks.retry}
      item={{ id: selected.Id, recordId: selected.Id, sobjectType: 'Task', kind: 'task',
        title: label(selected,'Subject'), clientName: label(customer,'Name'), whatId: label(selected,'WhatId','') || undefined,
        time: label(selected,'ActivityDate','').slice(0,10), status: label(selected,'Status','') || undefined,
        priority: label(selected,'Priority','') || undefined, type: label(selected,'Type','') || undefined,
        ownerId: label(selected,'OwnerId','') || undefined, description: label(selected,'Description','') || undefined }} />}
  </section>;
}

function Notebook({ customer, ownerId }: Props) {
  const { drafts, saveDraft, open } = useWorkspace();
  const key = `relationship-note:${customer.Id}`;
  const saved = drafts.find(item => item.id === key);
  const [note,setNote] = useState(saved?.note ?? '');
  const source = useCustomerSource('notes', ownerId, customer);
  const meetings = useSource(`customer-events:${ownerId}:${customer.Id}`, () => readCustomerCrm('Event', ownerId, customer));
  const [record, setRecord] = useState('');
  const meeting = record ? meetings.data?.rows.find(row => row.Id === record) : meetings.data?.rows[0];
  return <section className="cx-notebook">
    <aside><h2>Meeting preparation</h2><SourceNotice source={source} empty={!source.data?.rows.length} warning={source.data?.warning} />
      {source.data?.rows.map((row,index) => <article className="cx-source-page" key={`${text(row.dt)}:${index}`}>
        <span className="badge">Meeting-note source</span><h3>{text(row.ttl)}</h3><time>{date(row.dt)}</time><p>{text(row.notes)}</p>
      </article>)}
      <SourceNotice source={meetings} empty={!meetings.data?.rows.length} />
      {meeting && <><label className="cx-field">Read a recorded meeting<select value={meeting.Id} onChange={event => setRecord(event.target.value)}>
        {meetings.data?.rows.map(row => <option key={row.Id} value={row.Id}>{label(row,'Subject')} · {date(field(row,'ActivityDateTime'))}</option>)}
      </select></label><article className="cx-source-page"><span className="badge">CRM Event description</span><h3>{label(meeting,'Subject')}</h3>
        <time>{date(field(meeting,'ActivityDateTime'))}</time><p>{label(meeting,'Description')}</p></article></>}
    </aside>
    <form onSubmit={event => { event.preventDefault(); saveDraft({ id: key, kind: 'Preparation', title: `Relationship notes for ${label(customer,'Name')}`,
      note, readiness: 'Working', account: { id: customer.Id, name: label(customer,'Name') } }); }}>
      <span className="badge">Private preparation</span><h2>Follow-up notes</h2>
      <label className="cx-field">Your relationship notes<textarea rows={12} value={note} placeholder="Your questions, context, and next steps…" onChange={event => setNote(event.target.value)} /></label>
      <div className="cx-actions"><button className="primary" type="submit">Keep private preparation</button>
        <button className="secondary" type="button" onClick={() => open({ kind: 'task', id: customer.Id, name: label(customer,'Name'),
          subject: 'Relationship follow-up', context: note, whoId: label(customer,'PersonContactId','') || undefined })}>Plan follow-up</button>
      </div>
      <p className="cx-note" role="status">{saved?.note === note ? 'Private preparation saved in this workspace session.' : 'Preparation stays in this workspace session.'}</p>
    </form>
  </section>;
}

const retailProductNames: Record<string, string> = {
  'CHK-ACQ': 'Checking', 'HYS-ACQ': 'High-yield savings', 'CRC-ACQ': 'Credit card', 'AUTO-ACQ': 'Auto loan',
  'MTG-30': 'Mortgage', 'HEL-ACQ': 'HELOC', 'PL-ACQ': 'Personal loan', 'INV-ACQ': 'Investing',
};

function CustomerGrowth({ customer, ownerId }: Props) {
  const opportunities = useSource(`customer-opportunities:${ownerId}:${customer.Id}`, () => readCustomerCrm('Opportunity', ownerId, customer));
  const offers = useCustomerSource('offers', ownerId, customer);
  const { open } = useWorkspace();
  const [product, setProduct] = useState('');
  const rows = offers.data?.rows ?? [];
  const selected = rows.find(row => row.code === product) ?? rows[0];
  const name = label(customer,'Name');
  const productName = (row: Record<string, unknown>) => retailProductNames[text(row.code)] ?? text(row.code);
  const score = numeric(selected?.probability);
  const code = text(selected?.code, '');
  const history = useSource(`offer-history:${ownerId}:${customer.Id}:${code}`,
    () => code ? readOfferHistory(ownerId, customer.Id, code) : Promise.resolve(null));
  const points = (history.data?.rows ?? []).slice().reverse().flatMap(row => {
    const value = numeric(row.probability);
    return value == null ? [] : [{ month: text(row.period), value }];
  });
  const pointsOnChart = points.map((point, index) => ({
    ...point, x: 24 + index * 352 / Math.max(1, points.length - 1), y: 117 - point.value * 1.05,
  }));
  return <>
    <section className="rc-context">
      {selected ? <>
        <header><div><span>Customer opportunities</span><h2>Opportunities for {name}</h2>
          <p>{count(rows.length)} product scores · exact customer record</p></div>
          <label>Explore a product<select aria-label="Customer product" value={text(selected.code)} onChange={event => setProduct(event.target.value)}>
            {rows.map(row => <option key={text(row.code)} value={text(row.code)}>{productName(row)}{row.rank == null ? ' · score only' : ''}</option>)}
          </select></label></header>
        <div className="rc-opportunity-layout">
          <div className="rc-offer-focus">
            <span className="badge">{productName(selected)}</span>
            <h3>{score == null ? '—' : score.toFixed(1)}<small>% modeled conversion</small></h3>
            {score != null && <div className="rc-probability-track" role="img" aria-label={`${score.toFixed(1)} percent modeled conversion`}>
              <i style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
            </div>}
            <div className="rc-value-pair"><strong>{compact(selected.value)}</strong><span>Modeled expected-value uplift</span></div>
            <p>{selected.rank == null ? 'Recommendation rank unavailable' : `Recorded rank ${text(selected.rank)}`} · {text(selected.channels, 'Channels unavailable').replace(/\bCC\b/g, 'Call').replace(/\bEM\b/g, 'Email')}</p>
            <button className="secondary" onClick={() => open({ kind: 'prep', id: customer.Id, name,
              context: `${productName(selected)} · ${score == null ? 'Score unavailable' : score.toFixed(1) + '% modeled conversion'} · ${money(selected.value)} modeled value`,
              promptFlow: AGENTFORCE_FLOWS.account })}>Prepare follow-up</button>
          </div>
          <div className="rc-source-context"><h3>{points.length > 1 ? 'How this score has changed' : 'The evidence behind this conversation'}</h3>
            <SourceNotice source={history} warning={history.data?.warning} />
            {points.length > 1 && <>
              <svg className="score-history" viewBox="0 0 400 140" role="img" aria-label="Monthly modeled conversion score">
                <line x1="24" y1="117" x2="376" y2="117" stroke="var(--m-line)" />
                <polyline points={pointsOnChart.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--m-accent)" strokeWidth="3" />
                {pointsOnChart.map(point => <circle key={point.month} cx={point.x} cy={point.y} r="4" fill="var(--m-accent)">
                  <title>{date(point.month)} · {point.value.toFixed(1)}%</title>
                </circle>)}
              </svg>
              <p className="history-caption">{date(points[0].month)} – {date(points[points.length - 1].month)} · offer eligibility history</p>
            </>}
            {!history.loading && !history.error && points.length < 2 && <p>Fewer than two monthly scores returned for this selected product.</p>}
            <p>Data 360 offer eligibility for this relationship. Review the recorded score and rank in the context of the customer’s needs.</p>
            <SourceNotice source={offers} warning={offers.data?.warning} />
          </div>
        </div>
        <footer>Modeled probability and expected value describe the source score for this customer and product.</footer>
      </> : <><h2>Customer opportunities</h2><SourceNotice source={offers} empty warning={offers.data?.warning} /></>}
    </section>
    <section className="surface"><Title title="Recorded opportunities" /><SourceNotice source={opportunities} empty={!opportunities.data?.rows.length} />
      {opportunities.data?.rows.map(row => <article className="list-row" key={row.Id}><div><strong>{label(row,'Name')}</strong>
        <p>{label(row,'StageName')} · {compact(field(row,'Amount'))}</p></div><RecordLink object="Opportunity" id={row.Id} /></article>)}
    </section>
  </>;
}

function Tools({ customer, ownerId, goNotebook }: Props & { goNotebook: () => void }) {
  const { drafts, open, saveDraft } = useWorkspace();
  const noteId = `relationship-note:${customer.Id}`;
  const savedNote = drafts.find(draft => draft.id === noteId)?.note;
  const [note, setNote] = useState(savedNote ?? '');
  const [noteSaved, setNoteSaved] = useState(false);
  const goals = useSource(`customer-goals:${ownerId}:${customer.Id}`, () => readCustomerCrm('FinancialGoal', ownerId, customer));
  const holdings = useSource(`holdings:${customer.Id}`, () => readCustomerHoldings(customer));
  const evidence = useCustomerSource('interactions', ownerId, customer);
  const screening = useCustomerSource('screening', ownerId, customer);
  const renderSection = (section: PacketSection) => {
    switch (section) {
      case 'Profile': return <RelationshipFacts values={customerProfileFields(customer)} />;
      case 'Notebook': return <p>{savedNote || 'No local note has been kept.'}</p>;
      case 'Finances': return <><SourceNotice source={holdings} empty={!holdings.data?.rows.length} />{holdings.data?.rows.map(row =>
        <p key={row.Id}>{label(row,'Name')} · {money(field(row,'FinServ__Balance__c'))}</p>)}</>;
      case 'Goals': return <><SourceNotice source={goals} empty={!goals.data?.rows.length} />{goals.data?.rows.map(row =>
        <p key={row.Id}>{label(row,'Name')} · target {money(field(row,'TargetAmount'))}</p>)}</>;
      case 'Evidence': return <><SourceNotice source={evidence} empty={!evidence.data?.rows.length} />{evidence.data?.rows.map((row,index) =>
        <p key={index}>{text(row.purp ?? row.nm)} · {date(row.dt)}</p>)}</>;
      case 'Screening': return <><SourceNotice source={screening} empty={!screening.data?.rows[0]} />{screening.data?.rows[0] &&
        <p>{text(screening.data.rows[0].rating)} · {date(screening.data.rows[0].dt)}</p>}</>;
    }
  };
  const name = label(customer,'Name');
  const actions = ['task','meeting','email','case'] as const;
  const titles = ['Create task','Schedule meeting','Draft email','Create case'];
  return <div className="atlas-retail-layout">
    <section className="surface atlas-relationship-notes"><Title title="Notes that stay with the relationship" description="Your private preparation and drafts." />
      <form onSubmit={event => { event.preventDefault(); saveDraft({ id: noteId, kind: 'Preparation', title: `Relationship note · ${name}`, note, readiness: 'Working', account: { id: customer.Id, name } }); setNoteSaved(true); }}>
        <label className="ax-field">Relationship notes<textarea value={note} placeholder="Keep a thought for the next conversation…" onChange={event => { setNote(event.target.value); setNoteSaved(false); }} /></label>
        <button className="primary" type="submit">Keep notes in this tab</button>
        {noteSaved && <p role="status">Note kept for this browser session.</p>}
      </form>
      <h3>Action drafts for this relationship</h3>
      <button className="secondary" onClick={goNotebook}>Open notebook</button>
      {drafts.filter(draft => draft.account?.id === customer.Id).map(draft => <div className="list-row" key={draft.id}>
        <div><strong>{draft.title}</strong><p>{draft.kind} · {draft.readiness}</p></div>
        <Link className="secondary" to={`/work?view=drafts&draft=${encodeURIComponent(draft.id)}`}>Review draft</Link>
      </div>)}
    </section>
    <RelationshipPacket name={name} renderSection={renderSection} />
    <section className="surface"><Title title="Prepare a relationship tearsheet" description="Choose the sections to include for this customer." />
      <div className="atlas-retail-actions"><Link className="primary" to={`/cockpit/client/${customer.Id}?tab=tearsheet`}>Open tearsheet builder</Link></div>
      <div className="atlas-retail-actions">{actions.map((kind,i) => <button className="secondary" key={kind}
        onClick={() => open({ kind, id: customer.Id, name, whoId: label(customer,'PersonContactId','') || undefined })}>{titles[i]}</button>)}</div>
    </section>
  </div>;
}

function Screening({ customer, ownerId }: Props) {
  const source = useCustomerSource('screening', ownerId, customer);
  const row = source.data?.rows[0];
  const { open } = useWorkspace();
  const flag = (value: unknown) => value == null ? '—' : [true, 1, 'true', '1'].includes(value as boolean | number | string) ? 'Flagged' : 'No hit recorded';
  return <section className="ax-scene ax-screening atlas-relationship-scene">
    <div className="ax-screening-seal"><Shield className="ax-icon" aria-hidden="true" />
      <h2>{row ? 'Screening on file' : 'No screening result returned'}</h2><p>{row ? date(row.dt) : 'Unavailable'}</p></div>
    <div><h2>The recorded screening result</h2>
      <SourceNotice source={source} empty={!row} warning={source.data?.warning} />
      {row && <>
        <RelationshipFacts values={[[ 'Overall source risk', text(row.rating) ], ['Sanctions hit', flag(row.sanctions)],
          ['PEP hit', flag(row.pep)], ['Adverse media', flag(row.media)]]} />
        <p className="ax-muted">World-Check evidence · {date(row.dt)} · {text(row.change_type)} · {text(row.reference)}</p>
        <button className="secondary" onClick={() => open({ kind: 'task', id: customer.Id, name: label(customer,'Name'),
          subject: 'Review screening evidence', context: `World-Check · ${text(row.rating)} · ${date(row.dt)}` })}>Prepare screening follow-up</button>
      </>}
    </div>
  </section>;
}
