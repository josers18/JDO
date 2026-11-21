import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Flame, Layers, Waves } from 'lucide-react';
import { bookNames, label, numeric, readSource, type Row } from './retailData';
import { AccountLink, Choices, compact, count, date, Facts, Header, initials, money, Paging, relationship, Search, SourceNotice, SourcePeriod, text, Title, useCrmList, useFilters, useSource, useWorkspace } from './retailUi';
import type { RetailSource } from './retailSourceQueries';

const families = {
  aml: { name: 'Screening changes', source: 'World-Check', mark: '◇', date: 'screened', account: 'account_id' },
  gong: { name: 'Call sentiment', source: 'Gong', mark: '〰', date: 'period', account: 'account_id' },
  inflows: { name: 'Recent inflows', source: 'Transactions', mark: '↙', date: 'tx_date', account: 'account_id' },
  campaigns: { name: 'Campaign engagement', source: 'Marketing engagement', mark: '↗', date: 'last_at', account: 'account_id' },
  liquidity: { name: 'Liquidity events', source: 'UserGems', mark: '⤴', date: 'detected_date__c', account: 'person_account_id__c' },
} as const;
type Family = keyof typeof families;

const keys = Object.keys(families) as Family[];
function useNamedSource(key: RetailSource, ownerId: string, accountKey = 'account_id') {
  return useSource(`${key}:${ownerId}`, async () => {
    const result = await readSource(key, ownerId);
    try { return { ...result, names: await bookNames(ownerId, result.rows, accountKey) }; }
    catch { return { ...result, names: new Map<string,string>(), warning: result.warning ?? 'CRM relationship lookup is unavailable.' }; }
  });
}

function useInbox(ownerId: string) {
  const aml = useNamedSource('aml', ownerId);
  const gong = useNamedSource('gong', ownerId);
  const inflows = useNamedSource('inflows', ownerId);
  const campaigns = useNamedSource('campaigns', ownerId);
  const liquidity = useNamedSource('liquidity', ownerId, 'person_account_id__c');
  return { aml, gong, inflows, campaigns, liquidity };
}
function headline(family: Family, row: Row) {
  switch (family) {
    case 'aml': return `${text(row.risk_rating)} screening rating`;
    case 'gong': return `${text(row.sentiment)} and ${text(row.trend).toLowerCase()} call sentiment`;
    case 'inflows': return `${money(row.amount)} qualifying inflow`;
    case 'campaigns': return text(row.campaign);
    case 'liquidity': return 'Employer departure · liquidity flag';
  }
}
function signalFacts(family: Family, row: Row) {
  switch (family) {
    case 'aml': return [['Latest rating', text(row.risk_rating)], ['Previous rating', text(row.prev_rating)], ['Change', text(row.change_type)], ['Case reference', text(row.case_ref)], ['Jurisdiction', text(row.jur)]];
    case 'gong': return [['Recorded sentiment', text(row.sentiment)], ['Trend', text(row.trend)], ['Deal-risk index', count(row.deal_risk)], ['Latest call', date(row.last_call)], ['Next call in source', date(row.next_call)], ['Topics', text(row.topics)]];
    case 'inflows': return [['Recorded credit', money(row.amount)], ['Description', text(row.description)], ['Transaction date', date(row.tx_date)]];
    case 'campaigns': return [['Campaign', text(row.campaign)], ['Product', text(row.product)], ['Clicked events', count(row.clicks)], ['Opened events', count(row.opens)], ['Latest engagement', date(row.last_at)]];
    case 'liquidity': return [['Detected', date(row.detected_date__c)], ['Reported person', text(row.contact_name__c)], ['Previous title', text(row.old_title__c)], ['New employer', text(row.new_employer_name__c)]];
  }
}
const interpretation: Record<Family, string> = {
  aml: 'Use the recorded screening change to guide a review of source evidence.',
  gong: 'Review the call context and confirm the current relationship concerns.',
  inflows: 'This is the largest qualifying recent bonus or refund credit shown for the customer.',
  campaigns: 'Clicks and opens show recorded engagement. Confirm contact permission before outreach.',
  liquidity: 'Verify whether any proceeds are available and ask about the customer’s plans.',
};

export function Intelligence({ ownerId }: { ownerId: string }) {
  const { update, choice } = useFilters();
  const view = choice('view', ['inbox','browsing'], 'inbox');
  return <>
    <Header title={view === 'inbox' ? 'Customer signals' : 'Recognized website visitors'}
      description={view === 'inbox' ? 'Keep customer opportunity, relationship support and source evidence in one working inbox.' : 'Product browsing keeps its own evidence and working view.'} />
    <div className="rw-switches"><button aria-pressed={view === 'inbox'} onClick={() => update({ view: 'inbox', signal: null, page: null })}>Signal inbox</button>
      <button aria-pressed={view === 'browsing'} onClick={() => update({ view: 'browsing', signal: null, page: null })}>Recognized visitors</button>
      <Link className="secondary" to="/health?view=engagement">Review relationship health</Link></div>
    {view === 'inbox' ? <Inbox ownerId={ownerId} /> : <Browsing ownerId={ownerId} />}
    <p className="source-note">Data 360 uses the current book’s ingested Account ownership. Signals below are bounded source records.</p>
  </>;
}

function Inbox({ ownerId }: { ownerId: string }) {
  const { open, saveDraft, drafts } = useWorkspace();
  const { params, update, choice } = useFilters();
  const selectedFamily = choice('family', ['all', ...keys], 'all');
  const selectedKey = params.get('signal');
  const q = params.get('q') ?? '';
  const source = useInbox(ownerId);
  const all = keys.flatMap(family => (source[family].data?.rows ?? []).map(row => {
    const config = families[family];
    const id = text(row[config.account]);
    const name = source[family].data?.names.get(id);
    const period = row[config.date];
    return { family, row, id, name, period, key: [family, id, period, row.case_ref ?? row.campaign ?? row.tx_date ?? ''].join(':') };
  }));
  const matched = all.filter(item => (selectedFamily === 'all' || item.family === selectedFamily) &&
    [item.name ?? item.id, families[item.family].source, headline(item.family, item.row)].some(value => value.toLowerCase().includes(q.toLowerCase())));
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0));
  const displayed = matched.slice(page * 8, page * 8 + 8);
  const selected = selectedKey ? all.find(item => item.key === selectedKey) : displayed[0];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const selectedNote = selected ? notes[selected.key] ?? drafts.find(draft => draft.id === selected.key)?.note ?? '' : '';
  const sources = () => open({ kind: 'detail', title: 'Source dates & scope', children: <>{keys.map(family => <div className="list-row" key={family}>
    <div><strong>{families[family].source}</strong><p>{count(source[family].data?.rows.length)} selected records</p>
      <SourceNotice source={source[family]} warning={source[family].data?.warning} /></div>
    </div>)}</> });
  return <section className="rw-inbox">
    <aside className="rw-source-rail">
      <h2>Signal sources</h2>
      <button className="rw-source" aria-pressed={selectedFamily === 'all'} onClick={() => update({ family: null, signal: null, page: null })}><span>All signals</span><strong>{all.length}</strong></button>
      {keys.map(family => <button className="rw-source" data-signal-source={family} key={family} aria-pressed={selectedFamily === family} onClick={() => update({ family, signal: null, page: null })}>
        <span>{families[family].name}<small>{source[family].error ? 'Source unavailable' : source[family].loading ? 'Loading source' : 'Selected source records'}</small></span>
        <strong>{count(source[family].data?.rows.length)}</strong></button>)}
      <p className="rw-note">Counts describe this inbox sample. A relationship can have multiple source signals.</p>
      <button className="secondary" onClick={sources}>Source dates & scope</button>
    </aside>
    <div className="rw-worklist">
      <header><h2>{selectedFamily === 'all' ? 'Your signal inbox' : families[selectedFamily].name}</h2>
        <Search title="Find a customer or signal" value={q} change={value => update({ q: value, signal: null, page: null }, true)} placeholder="Name, source, product, or reason" /></header>
      {(selectedFamily === 'all' ? keys : [selectedFamily]).map(family => <SourceNotice key={family} source={source[family]} warning={source[family].data?.warning} />)}
      <div className="rw-signal-list">{displayed.map(item => <button className="rw-signal-row" key={item.key} aria-pressed={item.key === selected?.key}
        onClick={() => update({ signal: item.key })}><span className={`rw-signal-marker ${item.family}`}>{families[item.family].mark}</span>
        <span><small>{families[item.family].source} · {date(item.period)}</small><strong>{item.name ?? item.id}</strong><span>{item.name ? headline(item.family,item.row) : 'Relationship lookup pending'}</span></span><b>›</b>
      </button>)}
      {!displayed.length && <div className="rw-empty"><h3>No signals match.</h3><p>Choose another source or clear your search.</p></div>}</div>
      <Paging total={matched.length} shown={displayed.length} offset={page * 8} previous={page > 0 ? () => update({ page: String(page - 1), signal: null }) : undefined}
        next={(page + 1) * 8 < matched.length ? () => update({ page: String(page + 1), signal: null }) : undefined} />
    </div>
    {selected && selected.name ? <article className="rw-inspector" data-signal-source={selected.family}>
      <header><span className="badge">{families[selected.family].source}</span><SourcePeriod date={selected.period} source="Recorded period" /></header>
      <h2>{selected.name ?? selected.id}</h2><h3>{headline(selected.family, selected.row)}</h3>
      <Facts values={signalFacts(selected.family, selected.row).map(([key,value]) => [key,value] as const)} />
      <p className="rw-note">{interpretation[selected.family]}</p>
      <label className="rw-preparation">Prepare your next step<textarea value={selectedNote}
        placeholder="What do you want to confirm?" onChange={event => { const value = event.target.value; setNotes(all => ({ ...all, [selected.key]: value })); }} /></label>
      <div className="rw-actions">
        <button className="primary" onClick={() => open({ kind: 'task', id: selected.id, name: selected.name ?? selected.id,
          subject: `Follow up — ${headline(selected.family, selected.row)}`,
          context: [selectedNote, `Source: ${families[selected.family].source} · ${date(selected.period)}`,
            ...signalFacts(selected.family, selected.row).map(([name, value]) => `${name}: ${value}`)].filter(Boolean).join('\n') })}>Prepare follow-up task</button>
        <AccountLink id={selected.id}>Open customer</AccountLink>
        <button className="secondary" onClick={() => saveDraft({ id: selected.key, kind: 'Preparation', title: headline(selected.family, selected.row), note: selectedNote, readiness: 'Working', account: { id: selected.id, name: selected.name ?? selected.id } })}>Keep draft</button>
      </div>
    </article> : <p className="rw-note">{selected && !selected.name ? 'The linked CRM relationship could not be verified.' : selectedKey ? 'The selected signal is unavailable in this book.' : 'Choose a signal to review its source evidence.'}</p>}
  </section>;
}

function Browsing({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { params, update } = useFilters();
  const q = params.get('q') ?? '';
  const product = params.get('product') ?? '';
  const selectedId = params.get('visitor');
  const source = useNamedSource('browsing', ownerId);
  const rows = source.data?.rows ?? [];
  const productName = (row: Row) => text(row.url,'').split('?')[0].split('/').slice(-1)[0]?.replace(/-/g, ' ') || 'Product';
  const products = [...new Set(rows.map(productName))];
  const ids = [...new Set(rows.filter(row => (!product || productName(row) === product) &&
    [source.data?.names.get(text(row.account_id)) ?? text(row.account_id), productName(row)].some(value => value.toLowerCase().includes(q.toLowerCase())))
    .map(row => text(row.account_id)))];
  const id = selectedId && ids.includes(selectedId) ? selectedId : ids[0];
  const selected = rows.filter(row => row.account_id === id);
  const name = source.data?.names.get(id ?? '');
  const views = (entries: Row[]) => entries.reduce((total, row) => total + (numeric(row.views) ?? 0), 0);
  const allVisitors = new Set(rows.map(row => text(row.account_id)).filter(Boolean));
  const maxViews = Math.max(1, ...selected.map(row => numeric(row.views) ?? 0));
  const lastSeen = selected.map(row => text(row.last_ts, '')).filter(Boolean).sort().pop();
  return <section className="r2-visitor-workspace">
    <SourceNotice source={source} empty={!rows.length} warning={source.data?.warning} />
    <div className="r2-visitor-pulse">
      <div><strong>{count(allVisitors.size)}</strong><span>Recognized customers</span></div>
      <div><strong>{count(views(rows))}</strong><span>Product-page loads</span></div>
      <div><strong>{count(products.length)}</strong><span>Products explored</span></div>
    </div>
    <div className="r2-visitor-layout">
      <div>
        <h2>Customers researching products</h2>
        <label className="r2-field">Customer or product
          <input value={q} placeholder="Find a name or product…" onChange={event => update({ q: event.target.value, visitor: null }, true)} />
        </label>
        <label className="r2-field">Product interest
          <select value={product} onChange={event => update({ product: event.target.value, visitor: null })}>
            <option value="">All product pages</option>{products.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <div className="r2-visitor-list">
          {ids.map(visitorId => {
            const records = rows.filter(row => row.account_id === visitorId);
            const visitor = source.data?.names.get(visitorId) ?? visitorId;
            return <button className="r2-visitor-row" type="button" aria-pressed={visitorId === id} key={visitorId}
              onClick={() => update({ visitor: visitorId })}>
              <span>{initials(visitor)}</span>
              <div><strong>{visitor}</strong><small>{records.map(productName).join(', ')}</small></div>
              <b>{count(views(records))}<small>views</small></b>
            </button>;
          })}
          {!ids.length && <p>No recognized visitors match your search.</p>}
        </div>
      </div>
      <article className="r2-visitor-focus">
        {selected.length > 0 ? <>
          <div className="r2-browser-top"><i /><i /><i /><span>Recognized product browsing</span></div>
          <div className="r2-browser-body">
            <span className="badge">Last seen {date(lastSeen)}</span>
            <h2>{name ?? id}</h2>
            <p>Explore what caught the customer’s attention before planning your approach.</p>
            <div className="r2-product-evidence">
              {selected.map(row => <div key={text(row.url)}>
                <span>{productName(row)}</span>
                <div><i style={{ width: `${(numeric(row.views) ?? 0) / maxViews * 100}%` }} /></div>
                <strong>{count(numeric(row.views))}<small>page loads</small></strong>
              </div>)}
            </div>
            {name && id && <div className="r2-lead-actions">
              <button className="primary" onClick={() => open({ kind: 'prep', id, name,
                context: selected.map(row => `${productName(row)} · ${count(row.views)} recorded page loads`).join('; '),
              })}>Prepare browsing follow-up</button>
              <AccountLink id={id}>Open relationship</AccountLink>
            </div>}
            <p className="rv-note">Data 360 matches these product-page loads to customers in the current book. Confirm interest and permission before following up.</p>
          </div>
        </> : <div className="r2-browser-body"><h2>No matching customer selected.</h2><p>Clear the filters to browse recognized visitors.</p></div>}
      </article>
    </div>
  </section>;
}

export function Health({ ownerId }: { ownerId: string }) {
  const { update, choice } = useFilters();
  const view = choice('view', ['pulse', 'property', 'engagement', 'service'], 'pulse');
  return <>
    <Header title="Relationship health" description="Review financial stress, deposit retention, property exposure and service cases." />
    <Choices items={[[ 'pulse','Portfolio pulse' ], ['property','Property exposure'], ['engagement','Engagement watch'], ['service','Service watch']]} selected={view} update={value => update({ view: value, signal: null })} />
    {view === 'pulse' ? <HealthPulse ownerId={ownerId} /> : view === 'property' ? <Property ownerId={ownerId} /> :
      view === 'engagement' ? <Engagement ownerId={ownerId} /> : <Service ownerId={ownerId} />}
    <p className="source-note">Salesforce totals use current CRM ownership. Data 360 evidence uses the book’s matched ingested Account ownership.</p>
  </>;
}

function HealthPulse({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { params, update } = useFilters();
  const watchlist = useRef<HTMLElement>(null);
  function reviewWatchlist(cohort: 'deposits' | null) {
    update({ cohort, signal: null });
    watchlist.current?.scrollIntoView({ block: 'start' });
  }
  const deposit = params.get('cohort') === 'deposits';
  const totals = useSource(`stressTotal:${ownerId}`, () => readSource('stressTotal', ownerId));
  const stress = useNamedSource(deposit ? 'depositRows' : 'stressRows', ownerId);
  const depositTotal = useSource(`depositTotal:${ownerId}`, () => readSource('depositTotal', ownerId));
  const history = useSource(`stressHistory:${ownerId}`, () => readSource('stressHistory', ownerId));
  const crm = useCrmList('Case', ownerId, { count: 1, priority: 'Critical' });
  const critical = crm.data?.rows[0];
  const summary = totals.data?.rows[0];
  const depositStats = depositTotal.data?.rows[0];
  const historyRows = history.data?.rows ?? [];
  const max = Math.max(1, ...historyRows.map(row => numeric(row.high) ?? 0));
  const points = historyRows.flatMap((row, i) => {
    const value = numeric(row.high);
    return value == null ? [] : [{ x: 35 + i * (560 / Math.max(1, historyRows.length - 1)), y: 185 - value / max * 145, value, month: date(row.period).split(' ')[0] }];
  });
  const rows = stress.data?.rows ?? [];
  const selectedId = params.get('signal');
  const selected = selectedId ? rows.find(row => row.account_id === selectedId) : rows[0];
  return <div className="rv-page rv-health">
    <section className="rv-health-pulse">
      <Title title="Portfolio pulse" description="Latest Retail book signals." />
      <div className="rv-health-metrics">
        <button onClick={() => update({ cohort: null, signal: null })}><span>High stress now</span><strong>{count(summary?.high_now)}</strong></button>
        <button onClick={() => update({ cohort: null, signal: null })}><span>Persistent stress</span><strong>{count(summary?.persistent ?? (summary?.high_now === 0 ? 0 : null))}</strong></button>
        <button onClick={() => update({ cohort: null, signal: null })}><span>High stress + fees</span><strong>{count(summary?.with_fees ?? (summary?.high_now === 0 ? 0 : null))}</strong></button>
        <button onClick={() => update({ cohort: 'deposits', signal: null })}><span>Outside-deposit inflows</span><strong>{compact(depositTotal.data?.rows[0]?.outflow)}</strong></button>
      </div><SourceNotice source={totals} warning={totals.data?.warning} /><SourceNotice source={depositTotal} warning={depositTotal.data?.warning} />
    </section>
    <div className="rv-health-landscape">
      <section className="rv-stress-history"><Title title="Stress across the last six months" description="High-stress profiles by source month." />
        <SourceNotice source={history} empty={!historyRows.length} warning={history.data?.warning} />
        {!!points.length && <svg viewBox="0 0 640 230" role="img" aria-label="Monthly high-stress profile counts on a zero baseline">
          <path className="rv-stress-area" d={`M35 185 ${points.map(point => `L${point.x} ${point.y}`).join(' ')} L${points[points.length - 1].x} 185Z`} />
          <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} />
          <path className="rv-stress-baseline" d="M35 185H595" />
          {points.map(point => <g key={point.x}><circle cx={point.x} cy={point.y} r="5" />
            <text x={point.x} y={point.y - 15} textAnchor="middle">{point.value}</text>
            <text x={point.x} y="215" textAnchor="middle">{point.month}</text></g>)}
        </svg>}
        <div className="rv-stress-explainer"><strong>{count(summary?.persistent)}</strong><span>Persistent high-stress profiles</span>
          <strong>{count(summary?.both_)}</strong><span>Also has overdraft-fee evidence in the source window</span></div>
      </section>
      <section className="rv-deposit-flow"><Title title="Deposit retention" description="Observed money flowing into outside deposit accounts." />
        <strong className="rv-deposit-total">{compact(depositStats?.outflow)}</strong><p>Positive monthly net inflows across {count(depositStats?.leaving)} customers</p>
        <div className="rv-deposit-route"><span>Your customer relationships</span><i>→</i><strong>Outside banks & credit unions</strong></div>
        <div className="rv-deposit-facts"><div><strong>{compact(depositStats?.bal)}</strong><span>Held-away deposit balance</span></div>
          <div><strong>{count(depositStats?.retention)}</strong><span>Customers at $5K+/month</span></div></div>
        <p className="rv-note">Source covers checking and savings at banks and credit unions.</p>
      </section>
    </div>
    <section className="rv-health-alerts"><Title title="Risk & service alerts" description="Choose a source-backed next step." />
      <div className="rv-alert-grid">
        <article><span className="badge">Claritas + transaction evidence</span><h3>{count(summary?.both_)} persistent-stress customers with fees</h3>
          <p>High in the latest profile with overdraft-fee evidence in the source window.</p><button className="secondary" onClick={() => reviewWatchlist(null)}>Review stress watchlist</button></article>
        <article><span className="badge">Plaid · Deposit retention</span><h3>{count(depositStats?.retention)} customers at $5K+/month</h3>
          <p>Observed positive net inflows into outside deposit accounts.</p><button className="secondary" onClick={() => reviewWatchlist('deposits')}>Review deposit relationships</button></article>
        {critical && <article><span className="badge">Critical · CRM service</span><h3>{label(critical,'Subject')}</h3><p>{relationship(critical).name} · {label(critical,'Status')}</p>
          <Link to={`/work?view=cases&record=Case:${critical.Id}`} className="secondary">Review case</Link></article>}
      </div>
    </section>
      <section className="rv-watch-workspace" ref={watchlist}><Title title="Your watchlists" description="Review the source before deciding how to help." />
        <Choices className="rv-tabs" items={[[ 'stress','Financial stress watchlist' ], ['deposits','Deposit relationships']]} selected={deposit ? 'deposits' : 'stress'}
          update={cohort => update({ cohort: cohort === 'stress' ? null : cohort, signal: null })} />
        <SourceNotice source={stress} empty={!rows.length} warning={stress.data?.warning} />
        <div className="rv-watch-layout"><div>{rows.map(row => {
          const id = text(row.account_id);
          const name = stress.data?.names.get(id) ?? id;
          return <button className="rv-watch-row" key={id} aria-pressed={selected === row} onClick={() => update({ signal: id })}>
            <span>{initials(name)}</span><strong>{name}</strong><small>{deposit ? `${compact(row.flow)} monthly flow` : `${count(row.months_high)}/6 months High`}</small>
          </button>;
        })}</div>
        {selected && <article className="rv-watch-inspector">
          <button type="button" className="badge rv-watch-source" aria-label="View source details" onClick={() => open({
            kind: 'detail', title: deposit ? 'Plaid held-away' : 'Claritas',
            children: <Facts values={deposit ? [['Outside-deposit flow', money(selected.flow)], ['Institution', text(selected.inst)]] :
              [['Months with high stress', count(selected.months_high)], ['Overdraft fees in 30 days', count(selected.fees)], ['Fee amount', money(selected.fee_total)]]} />,
          })}>{deposit ? 'Plaid held-away' : 'Claritas'}</button>
          <h2>{stress.data?.names.has(text(selected.account_id))
            ? <AccountLink id={text(selected.account_id)} className="rv-watch-client">{stress.data.names.get(text(selected.account_id))}</AccountLink>
            : text(selected.account_id)}</h2>
          {deposit ? <>
            <h3>{money(selected.flow)} monthly outside-deposit flow</h3>
            <p>{money(selected.bal)} held away. Largest-inflow institution: {text(selected.inst)}.</p>
          </> : <>
            <div className="rv-stress-cells">{Array.from({ length: numeric(selected.months_high) ?? 0 }, (_, month) => <span key={month}>High</span>)}</div>
            <p>{(numeric(selected.months_high) ?? 0) >= 4 ? 'Persistent source signal.' : 'High stress in the latest profile.'} Start with a supportive conversation and confirm current circumstances.</p>
          </>}
          {stress.data?.names.has(text(selected.account_id)) && <button className="primary" onClick={() => open({ kind: 'task', id: text(selected.account_id), name: stress.data?.names.get(text(selected.account_id)) ?? '', subject: 'Relationship health check-in' })}>Prepare check-in</button>}
        </article>}</div>
      </section>
  </div>;
}

const hazards = [
  ['flood', 'Flood only', Waves, '#688cb3'],
  ['both', 'Both indicators', Layers, '#9c6385'],
  ['fire', 'Wildfire only', Flame, 'var(--tone-mid)'],
] as const;

function Property({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { choice, update } = useFilters();
  const cohort = choice('cohort', ['all','flood','fire','both'], 'all');
  const source = useNamedSource('propertyCohorts', ownerId);
  const summary = useSource(`propertySummary:${ownerId}`, () => readSource('propertySummary', ownerId));
  const totals = summary.data?.rows[0];
  const all = source.data?.rows ?? [];
  const rows = all.filter(row => cohort === 'all' || row.cohort === cohort);
  const maximum = Math.max(1, ...all.map(row => numeric(row.value) ?? 0));
  const both = numeric(totals?.both_hazards);
  const exclusive = (value: unknown) => {
    const total = numeric(value);
    return total != null && both != null && total >= both ? total - both : null;
  };
  const hazardCounts = { flood: exclusive(totals?.flood), both, fire: exclusive(totals?.wildfire) };
  const nameFor = (row: Row) => source.data?.names.get(text(row.account_id)) ?? text(row.account_id);
  const review = (row: Row) => open({ kind: 'detail', title: nameFor(row), children: <div className="atlas-retail-workspace">
    <SourcePeriod source="CoreLogic" date={row.period} />
    <Facts values={[[ 'Flood zone', text(row.flood_zone) ], ['Wildfire index', count(row.wildfire)], ['Property value', money(row.value)], ['Mortgage balance', money(row.mortgage)]]} />
    {source.data?.names.has(text(row.account_id)) && <AccountLink id={text(row.account_id)} />}
  </div> });
  return <section className="rw-property">
    <div className="rw-property-top"><div><h2>Flood and wildfire exposure</h2><p>Owner-only flood and wildfire indicators. Overlap is counted once.</p>
      <div className="rw-property-total"><strong>{count(totals?.homes)}</strong><span>Matched customer property profiles<br />with a source hazard indicator</span></div>
      <Facts values={[[ 'Estimated property value', compact(totals?.home_value) ], ['Mortgage balance', compact(totals?.mortgage)]]} /></div>
      <div className="rw-hazard-mix">{hazards.map(([code, label, Icon]) => <button className="rw-hazard" key={code} aria-pressed={cohort === code} onClick={() => update({ cohort: code })}>
        <span className={`rw-hazard-icon ${code}`}><Icon aria-hidden="true" /></span><strong>{count(hazardCounts[code])}</strong><span>{label}</span>
      </button>)}</div>
    </div>
    <SourceNotice source={summary} warning={summary.data?.warning} />
    <div className="rw-property-controls"><button className="secondary" aria-pressed={cohort === 'all'} onClick={() => update({ cohort: null })}>All selected exposure</button>
      <span>{rows.length} of {all.length} selected profiles · up to four per hazard cohort</span></div>
    <SourceNotice source={source} empty={!rows.length} warning={source.data?.warning} />
    <div className="rw-exposure-layout">
      <div className="rw-exposure-plot"><h3>Selected profiles, by value and wildfire index</h3>
        <svg viewBox="0 0 620 320" role="group" aria-label="Property value and wildfire index by customer">
          <path d="M65 30V260H570" fill="none" stroke="var(--tone-border)" />
          {[0,50,100].map(n => <text key={n} x={65+n*5} y="285" textAnchor="middle">{n}</text>)}
          <text x="210" y="312">Wildfire index /100</text><text x="68" y="20">Property value · 0 to {compact(maximum)}</text>
          {rows.map(row => {
            const value = numeric(row.value), risk = numeric(row.wildfire);
            if (value == null || value < 0 || risk == null || risk < 0 || risk > 100) return null;
            return <g key={text(row.account_id)} role="button" tabIndex={0} aria-label={`${nameFor(row)}, ${money(value)}, wildfire index ${risk}`}
              onClick={() => review(row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); review(row); } }}>
              <circle cx={65+risk*5} cy={260-value/maximum*210} r="9" fill={hazards.find(([key]) => row.cohort === key)?.[3] ?? 'var(--tone-mid)'} stroke="white" strokeWidth="2" />
            </g>;
          })}
        </svg>
        <p className="source-note">The list includes records with missing values. The chart plots available property values and wildfire indexes.</p>
      </div>
      <div className="rw-exposure-list">{rows.map(row => <button className="rw-property-row" key={text(row.account_id)} onClick={() => review(row)}>
        <span><strong>{nameFor(row)}</strong><small>{text(row.property_type)} · flood zone {text(row.flood_zone, 'unavailable')}</small></span>
        <b>{compact(row.value)}<small>Wildfire {count(row.wildfire)}/100</small></b>
      </button>)}</div>
    </div>
  </section>;
}

function Engagement({ ownerId }: { ownerId: string }) {
  const history = useSource(`gongWeekly:${ownerId}`, () => readSource('gongWeekly', ownerId));
  const summary = useSource(`engagementSummary:${ownerId}`, () => readSource('engagementSummary', ownerId));
  const gong = useNamedSource('gong', ownerId);
  const weeks = history.data?.rows ?? [];
  const max = Math.max(1, ...weeks.map(week => numeric(week.n) ?? 0));
  const points = weeks.flatMap((week, index) => {
    const value = numeric(week.n);
    return value == null ? [] : [{ x: 35 + index / Math.max(1, weeks.length - 1) * 480, y: 170 - value / max * 130, value }];
  });
  const mostRecent = weeks[weeks.length - 1];
  return <section className="rw-engagement"><div className="rw-engagement-top"><div>
    <h2>Call sentiment and satisfaction</h2><p>Recorded call sentiment and satisfaction are separate sources.</p>
    <div className="rw-engagement-stats"><div><strong>{count(mostRecent?.n)}</strong><span>Negative &amp; declining call profiles<br />{date(mostRecent?.week)}</span></div>
      <div><strong>{count(summary.data?.rows[0]?.low_csat)}</strong><span>Latest CSAT below 70<br />{count(summary.data?.rows[0]?.profiles)} matched profiles</span></div></div>
    <SourceNotice source={summary} warning={summary.data?.warning} />
  </div><div className="rw-engagement-history"><h3>Negative &amp; declining profiles by source week</h3>
    <SourceNotice source={history} empty={!points.length} warning={history.data?.warning} />
    {points.length > 0 && <><svg viewBox="0 0 560 210" role="img" aria-label="Weekly profiles with negative and declining call sentiment">
      <line x1="30" x2="530" y1="170" y2="170" stroke="var(--tone-border)" /><text x="10" y="173">0</text>
      <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="var(--tone-mid)" strokeWidth="3" />
      {points.map(({ x, y, value }) => <g key={x}><circle cx={x} cy={y} r="4" fill="var(--tone-mid)" /><text x={x} y={y-13} textAnchor="middle">{value}</text></g>)}
    </svg><p>{date(weeks[0]?.week)} → {date(mostRecent?.week)}</p></>}
    </div></div>
    <div className="rw-engagement-clients"><SourceNotice source={gong} empty={!gong.data?.rows.length} warning={gong.data?.warning} />
      {gong.data?.rows.map(row => <Link className="rw-engagement-row" key={text(row.account_id)}
        to={`/intelligence?family=gong&signal=${encodeURIComponent(['gong', row.account_id, row.period, ''].join(':'))}`}>
        <span className="rw-voice-mark" aria-hidden="true">〰</span><span><strong>{gong.data?.names.get(text(row.account_id)) ?? text(row.account_id)}</strong><small>{headline('gong',row)}</small></span>
        <span className="rw-risk-value">{count(row.deal_risk)}<small>source deal risk /100</small></span></Link>)}</div>
  </section>;
}

function Service({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { choice, update } = useFilters();
  const crm = useCrmList('Case', ownerId, { count: 1 });
  const service = useNamedSource('service', ownerId, 'account');
  const summary = useSource(`serviceSummary:${ownerId}`, () => readSource('serviceSummary', ownerId));
  const status = choice('status', ['all','open','in_progress'], 'all');
  const rows = service.data?.rows.filter(row => status === 'all' || row.status === status) ?? [];
  return <section className="rw-service">
    <header><h2>Open cases by source</h2><p>Keep external case references and CRM records distinct.</p></header>
    <div className="rw-service-systems"><article><span className="badge">Salesforce CRM</span><strong>{count(crm.data?.totalCount)}</strong><h3>Open CRM cases</h3>
      <p>Current CRM Account-owner scope. Review individual cases in Workbench.</p><SourceNotice source={crm} /><Link className="secondary" to="/work?view=cases">Open CRM service desk</Link></article>
      <article><span className="badge">ServiceNow</span><strong>{count(summary.data?.rows[0]?.open_n)}</strong><h3>Open external cases</h3>
        <p>{count(summary.data?.rows[0]?.aged_n)} created more than 30 days ago.</p><SourceNotice source={summary} warning={summary.data?.warning} /></article></div>
    <Choices className="rw-property-controls" items={[[ 'all','All selected cases' ], ['open','Open'], ['in_progress','In progress']]} selected={status} update={value => update({ status: value })} />
    <SourceNotice source={service} empty={!rows.length} warning={service.data?.warning} />
    <div className="rw-external-cases">{rows.map(row => <article key={text(row.case_id)}>
      <div className="rw-external-date"><span>{text(row.case_id)}</span><time>{date(row.created)}</time></div>
      <div><h3>{text(row.subject, 'External service case')}</h3>
        <p>{service.data?.names.get(text(row.account)) ?? 'Relationship unavailable'} · {text(row.priority)} · <b>{text(row.status)}</b></p>
        <small>Last modified {date(row.modified)} · external assignee {text(row.assignee, 'unavailable')}</small></div>
      <button className="secondary" onClick={() => open({ kind: 'detail', title: text(row.subject, 'External service case'), children: <div className="atlas-retail-workspace">
        <span className="badge">ServiceNow</span><p>{text(row.description)}</p>
        <Facts values={[[ 'External case', text(row.case_number) ], ['Status', text(row.status)], ['Priority', text(row.priority)], ['Modified', date(row.modified)]]} />
        {service.data?.names.has(text(row.account)) && <AccountLink id={text(row.account)} />}
      </div> })}>Review external case</button>
    </article>)}</div>
  </section>;
}

export function TodaySignalBand({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const inbox = useInbox(ownerId);
  const cards = keys.flatMap(family => {
    const source = inbox[family];
    const config = families[family];
    const row = source.data?.rows.find(row => source.data?.names.has(text(row[config.account])));
    if (!row) return [];
    const id = text(row[config.account]);
    return [{ row, id, name: source.data?.names.get(id) ?? id, family, config }];
  }).slice(0, 3);
  return <section className="rw-today">
    <header><div><h2>Customer signals for follow-up</h2><p>Selected signals from your inbox</p></div><Link className="secondary" to="/intelligence">Open signal inbox</Link></header>
    <div>{cards.map(({ row, id, name, family, config }) => <button key={`${family}:${id}`} className="rw-today-signal" onClick={() => open({
      kind: 'detail', title: headline(family, row), children: <div className="pr-evidence"><h3>{name}</h3>
        <SourcePeriod source={config.source} date={row[config.date]} /><Facts values={signalFacts(family, row).map(([key, value]) => [key, value] as const)} />
        <AccountLink id={id} /><Link className="secondary" to={`/intelligence?family=${family}`}>Open source inbox</Link>
      </div>,
    })}><small>{config.source} · {date(row[config.date])}</small><strong>{name}</strong><span>{headline(family, row)}</span></button>)}</div>
    {!cards.length && <p className="source-note">{keys.some(family => inbox[family].loading) ? 'Loading source evidence…' : 'There are no source signals with a verified CRM relationship in this view.'}</p>}
  </section>;
}
