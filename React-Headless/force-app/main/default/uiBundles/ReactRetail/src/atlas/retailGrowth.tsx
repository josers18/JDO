import { atlasChartColors, atlasProbabilityBand } from '@shared/components/atlas/atlasChartColors';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCrmAction } from '@shared/components/home/useCrmAction';
import { Modal } from '@shared/components/Modal';
import { WHITESPACE_LEAD_SOURCE, whitespaceOpportunityName } from '@shared/data/whitespace';
import { bookNames, field, numeric, label, readHoldings, readOfferHistory, readSource, type Row } from './retailData';
import { AccountLink, CardIcon, Choices, compact, count, date, Facts, Header, money, Paging, SourceNotice, SourcePeriod, text, Title, useCrmList, useFilters, useSource, useWorkspace } from './retailUi';

const products = [
  ['CHK-ACQ','Checking', /checking/i], ['HYS-ACQ','High-Yield Savings', /savings/i],
  ['CRC-ACQ','Credit Card', /credit card/i], ['AUTO-ACQ','Auto Loan', /auto loan/i],
  ['MTG-30','Mortgage', /mortgage/i], ['HEL-ACQ','Home Equity', /home equity|heloc/i],
  ['PL-ACQ','Personal Loan', /personal loan/i], ['INV-ACQ','Investing', /investment|brokerage/i],
] as const;
const productLabel = (code: unknown) => products.find(([key]) => key === code)?.[1] ?? text(code);
const offerKey = (row: Row) => `${text(row.acct)}:${text(row.code)}`;
const pct = (value: unknown) => numeric(value) == null ? '—' : `${Number(value).toFixed(1)}%`;

export default function Growth({ ownerId }: { ownerId: string }) {
  const { params, update, choice } = useFilters();
  const view = choice('view', ['needs', 'coverage', 'map', 'movers', 'planning'], 'needs');
  const stage = params.get('cohort') ?? 'all';
  const life = useSource(`lifeMix:${ownerId}`, () => readSource('lifeMix', ownerId));
  const cohorts = life.data?.rows ?? [];
  const cohort = cohorts.find(row => row.life_stage === stage);
  const coverage = useSource(`offerwork:${ownerId}`, async () => {
    const result = await readSource('whitespace', ownerId);
    const names = await bookNames(ownerId, result.rows, 'acct');
    return { ...result, names };
  });
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  const profiles = cohorts.reduce((total, row) => total + (numeric(row.n) ?? 0), 0);
  const eligibles = coverage.data?.rows.filter(row => numeric(row.action_rank) != null && (numeric(row.ev) ?? 0) > 0 && (stage === 'all' || row.stage === stage));
  return <>
    <Header title="Customer growth opportunities" description="Review product eligibility and changes in offer value by customer." />
    <div className="r3-growth-shell rv-page" data-retail-growth="cohorts">
      <aside className="r3-cohort-rail">
        <header><span>Your customer book</span><h2>Growth opportunities</h2><p>{life.data ? count(profiles) : '—'} source profiles</p></header>
        <SourceNotice source={life} empty={!cohorts.length} warning={life.data?.warning} />
        <button className="r3-cohort" aria-pressed={stage === 'all'} onClick={() => update({ cohort: null, offer: null, page: null })}><span>All life stages</span><strong>{life.data ? count(profiles) : '—'}</strong><small>Explore the selected offer sample</small></button>
        <div className="r3-cohort-list">
          {cohorts.map((row, i) => <button className="r3-cohort" key={text(row.life_stage)} aria-pressed={row === cohort} onClick={() => update({ cohort: text(row.life_stage), offer: null, page: null })}>
            <i aria-hidden="true" style={{ background: atlasChartColors[i % atlasChartColors.length] }} />
            <span>{text(row.life_stage)}</span><strong>{count(row.n)}</strong>
            <div><b style={{ width: `${profiles ? (numeric(row.n) ?? 0) / profiles * 100 : 0}%`, background: atlasChartColors[i % atlasChartColors.length] }} /></div>
          </button>)}
        </div>
      </aside>
      <section className="r3-growth-main">
        <Outcomes key={revision} ownerId={ownerId} />
        <div className="r3-growth-context"><div><span>Existing-customer development</span>
          <h2>{cohort ? text(cohort.life_stage) : 'Opportunities across your book'}</h2>
          <p>{eligibles ? `${count(new Set(eligibles.map(row => row.acct)).size)} sampled customers · ${count(eligibles.length)} scored product relationships` : 'Selected customer opportunity evidence'}</p></div>
          <div className="r3-growth-purpose"><strong>Book mix → customer need → next step</strong><span>Cohort context and per-customer scores stay distinct.</span></div>
        </div>
        <div className="r3-growth-toolbar"><Choices className="r3-product-controls" items={[[ 'needs','Needs explorer' ], ['map','Probability map'], ['movers','Book movers'], ['planning','Home & investing needs']]}
          selected={view} update={value => update({ view: value, offer: null, page: null })} /><Link to="/prospecting" className="r3-text-link">Work leads & referrals</Link></div>
        {view === 'needs' && <>
          <div className="ps-growth-tools"><button className="secondary" onClick={() => update({ view: 'movers', direction: 'rising', page: null, offer: null })}>Explore rising offers</button>
            <button className="secondary" onClick={() => update({ view: 'movers', direction: 'falling', page: null, offer: null })}>Explore falling offers</button>
            <span className="r3-movement-note">Book movers extend beyond this selected sample.</span></div>
          <SourceNotice source={coverage} empty={!eligibles?.length} warning={coverage.data?.warning} />
          <NeedsExplorer ownerId={ownerId} rows={eligibles ?? []} names={coverage.data?.names} onSaved={refresh} />
        </>}
        {view === 'map' && <Offers ownerId={ownerId} view="coverage" stage={stage} onSaved={refresh} />}
        {(view === 'movers' || view === 'coverage') && <Offers ownerId={ownerId} view={view} stage={stage} onSaved={refresh} />}
        {view === 'planning' && <Needs ownerId={ownerId} stage={stage} rows={cohorts} />}
      </section>
    </div>
    <p className="source-note">Life-stage averages and individual model probabilities are separate measures. The coverage and needs tables show selected relationships.</p>
  </>;
}

function Outcomes({ ownerId }: { ownerId: string }) {
  const { open, ownerName } = useWorkspace();
  const day = new Date();
  day.setDate(day.getDate() - 30);
  const since = day.toISOString().slice(0,10);
  const active = useCrmList('Opportunity', ownerId, { count: 15, leadSource: WHITESPACE_LEAD_SOURCE });
  const won = useCrmList('Opportunity', ownerId, { count: 15, leadSource: WHITESPACE_LEAD_SOURCE, wonSince: since });
  return <section className="biz-outcomes" aria-label="Cross-sell outcomes">
    <div><span className="biz-eyebrow">Your cross-sell follow-through</span><h3>Customer opportunities</h3><span>{ownerName ? `${ownerName} · ` : ''}CRM source “Cross-sell grid”</span></div>
    <div><strong>{count(active.data?.totalCount)}</strong><span>Open opportunities</span></div>
    <div><strong>{count(won.data?.totalCount)}</strong><span>Closed Won · 30 days</span></div>
    <button className="secondary" onClick={() => open({ kind: 'detail', title: 'Cross-sell outcomes', children: <div className="pr-evidence">
      <Title title="Open opportunities" /><SourceNotice source={active} empty={!active.data?.rows.length} />
      {active.data?.rows.map(row => <p key={row.Id}>{label(row, 'Name')} · {compact(field(row,'Amount'))}</p>)}
      <Title title="Closed Won · 30 days" /><SourceNotice source={won} empty={!won.data?.rows.length} />
      {won.data?.rows.map(row => <p key={row.Id}>{label(row, 'Name')} · {compact(field(row,'Amount'))}</p>)}
    </div> })}>Review outcomes</button>
  </section>;
}

const needGroups = [
  ['borrow','Borrowing','clients',/MTG|HEL|PL-|AUTO/],
  ['save','Saving','goal',/HYS|CHK/],
  ['spend','Everyday banking','tasks',/CRC/],
  ['invest','Investing','sparkle',/INV/],
] as const;
function NeedsExplorer({ ownerId, rows, names, onSaved }: { ownerId: string; rows: Row[]; names?: Map<string,string>; onSaved: () => void }) {
  const { params, update, choice } = useFilters();
  const initial = needGroups.find(([, , , pattern]) => rows.some(row => pattern.test(text(row.code))))?.[0] ?? 'borrow';
  const category = choice('category', needGroups.map(([key]) => key), initial);
  const matches = rows.filter(row => needGroups.find(([key]) => key === category)?.[3].test(text(row.code)));
  const selectedKey = params.get('offer');
  const chosen = selectedKey ? matches.find(row => offerKey(row) === selectedKey) : matches[0];
  const score = numeric(chosen?.conv);
  const clamped = score == null ? null : Math.max(0, Math.min(100, score));
  const name = chosen ? names?.get(text(chosen.acct)) : undefined;
  return <>
    <section className="ps-retail-needs" data-persona-scene="retail-growth">
      <div className="ps-needs-map"><div className="ps-section-title"><div><h2>Eligible offers</h2><p>Choose a need to explore its eligible opportunities.</p></div></div>
        <div className="ps-needs-tree">
          <svg viewBox="0 0 600 480" preserveAspectRatio="none" aria-hidden="true">{needGroups.map(([key], i) => <path key={key}
            d={`M130 240 C300 240 275 ${70 + i * 105} 430 ${70 + i * 105}`} className={key === category ? 'active' : undefined} />)}</svg>
          <div className="ps-needs-root"><span><CardIcon name="clients" /></span><strong>Customer<br />needs</strong></div>
          <div className="ps-need-branches">{needGroups.map(([key, display, icon, pattern]) => {
            const count = rows.filter(row => pattern.test(text(row.code))).length;
            return <button className="ps-need-branch" data-need={key} key={key} aria-pressed={category === key} disabled={!count}
              onClick={() => update({ category: key, offer: null })}><span><CardIcon name={icon} /></span><strong>{display}</strong><small>{count} eligible examples</small></button>;
          })}</div>
        </div><p className="ps-source-note">Need categories organize eligible offers. Confirm the customer’s plans before following up.</p>
      </div>
      <div className="ps-need-conversation">{chosen && name ? <>
        <span className="badge">{productLabel(chosen.code)}</span><h2>{name}</h2><p>Start by understanding what the customer is planning.</p>
        <div className="ps-customer-offer">
          <svg className="viz-ring" width="150" height="150" viewBox="0 0 120 120" role="img" aria-label={`Modeled conversion ${pct(score)}`}>
            <circle cx="60" cy="60" r="48" fill="none" stroke="var(--m-soft)" strokeWidth="9" />
            {clamped != null && <circle cx="60" cy="60" r="48" fill="none" stroke="var(--m-accent)" strokeWidth="9" strokeLinecap="round"
              pathLength="100" strokeDasharray={`${clamped} ${100 - clamped}`} transform="rotate(-90 60 60)" />}
            <text x="60" y="67" textAnchor="middle">{pct(score)}</text>
          </svg>
          <div><strong>{compact(chosen.ev)}</strong><span>Modeled expected-value uplift</span><small>Offer rank {count(chosen.action_rank)} · {text(chosen.channels)}</small></div>
        </div>
        <OfferDetail key={offerKey(chosen)} row={chosen} ownerId={ownerId} customer={name} onSaved={onSaved} compactMode />
      </> : <div className="empty-state"><h3>{selectedKey ? 'This offer is unavailable in the selected source.' : 'No eligible examples match this view.'}</h3><p>Choose another need or cohort.</p></div>}</div>
    </section>
    {matches.length > 0 && <label className="r3-offer-picker">Choose a customer opportunity<select aria-label="Customer opportunity" value={chosen ? offerKey(chosen) : ''}
      onChange={event => update({ offer: event.target.value })}>
      {!chosen && <option value="">Choose an opportunity</option>}
      {matches.map(row => <option key={offerKey(row)} value={offerKey(row)}>{names?.get(text(row.acct)) ?? text(row.acct)} · {productLabel(row.code)} · {pct(row.conv)}</option>)}
    </select><span>{matches.length} eligible examples for this need</span></label>}
  </>;
}

function Offers({ ownerId, view, stage, onSaved }: { ownerId: string; view: 'coverage' | 'movers'; stage: string; onSaved: () => void }) {
  const { params, update, choice } = useFilters();
  const direction = choice('direction', ['rising','falling'], 'rising');
  const sourceKey = view === 'movers' ? direction : 'whitespace';
  const source = useSource(`${sourceKey}:${ownerId}`, async () => {
    const result = await readSource(sourceKey, ownerId);
    const names = await bookNames(ownerId, result.rows, 'acct');
    return { ...result, names };
  });
  const rows = source.data?.rows ?? [];
  const names = source.data?.names;
  const ids = [...new Set(rows.map(row => text(row.acct)).filter(id => names?.has(id)))];
  const holdingsKey = view === 'coverage' ? ids.join(',') : '';
  const holdings = useSource(`holdings:${ownerId}:${holdingsKey}`, () => readHoldings(holdingsKey ? ids : []));
  const productGroup = choice('products', ['everyday', 'home'], 'everyday');
  const page = Math.max(0, Number(params.get('page')) || 0);
  const matches = rows.filter(row => stage === 'all' || row.stage === stage);
  const matchedIds = [...new Set(matches.map(row => text(row.acct)))];
  const shownIds = matchedIds.slice(page * 6, page * 6 + 6);
  const shownRows = matches.slice(page * 6, page * 6 + 6);
  const selectedKey = params.get('offer');
  const selected = selectedKey ? matches.find(row => offerKey(row) === selectedKey) : null;
  const heatTable = (columns: ReadonlyArray<(typeof products)[number]>) => (
    <table className="biz-coverage-table"><thead><tr><th scope="col">Customer</th>{columns.map(([key, name]) => <th key={key} scope="col">{name}</th>)}</tr></thead>
      <tbody>{shownIds.map(id => <tr key={id}>
        <th scope="row">{names?.get(id) ?? id}</th>{columns.map(([key, name, pattern]) => {
          const owned = holdings.data?.some(holding => field(holding, 'FinServ__PrimaryOwner__c') === id && pattern.test(text(field(holding, 'Name'), '')));
          const offer = matches.find(row => row.acct === id && row.code === key);
          const score = numeric(offer?.conv);
          return <td key={key}>{owned ? <span className="rv-owned" aria-label={`${name} owned`}>✓ <small>Owned</small></span> : offer && score != null ?
            <button className="biz-score" data-score-band={atlasProbabilityBand(score)}
              aria-pressed={selectedKey === offerKey(offer)} aria-label={`${names?.get(id) ?? id}, ${name}: ${pct(score)}`} onClick={() => update({ offer: offerKey(offer) })}>
              {score.toFixed(1)}<small>%</small>
            </button> : <span className="rv-unavailable">—</span>}</td>;
        })}
      </tr>)}</tbody>
    </table>
  );
  return <section className={view === 'movers' ? 'biz-movers' : 'biz-coverage'}>
    <header className="biz-section-head">
      <div>
        {view === 'movers' ? <><span className="biz-eyebrow">Six-month movement</span><h2>Changes in offer value</h2>
          <p>Find conversations beyond the customers in the coverage map.</p></>
          : <><span className="biz-eyebrow">Probability &amp; ownership</span><h2>Product coverage and eligibility</h2><p>The selected cohort, shown by product probability and recorded ownership.</p></>}
      </div>
      {view === 'movers' ? <Choices className="biz-modes" items={[[ 'rising','Rising' ], ['falling','Falling']]} selected={direction}
        update={value => update({ direction: value, page: null, offer: null })} />
        : <Choices className="biz-modes retail-map-products" items={[[ 'everyday','Everyday & lending' ], ['home','Home & investing']]}
          selected={productGroup} update={value => update({ products: value })} />}
    </header>
    <SourceNotice source={source} empty={!matches.length} warning={source.data?.warning} />
    {view === 'coverage' ? <>
      <SourceNotice source={holdings} />
      <div className="retail-map-wide">{heatTable(products)}</div>
      <div className="retail-map-small">{heatTable(productGroup === 'everyday' ? products.slice(0, 4) : products.slice(4))}</div>
    </> : <>
      <div className="biz-mover-legend"><span>Customer &amp; opportunity</span><span>Score change · points</span><span>Expected-value change</span></div>
      {shownRows.map(row => {
        const movement = numeric(row.moved);
        const value = numeric(row.ev_moved);
        return <button className="biz-mover" key={offerKey(row)} aria-pressed={selectedKey === offerKey(row)} onClick={() => update({ offer: offerKey(row) })}>
          <span><strong>{names?.get(text(row.acct)) ?? text(row.acct)}</strong><small>{productLabel(row.code)} · {pct(row.conv)} now · {date(row.mo)}</small></span>
          <span className={movement == null ? undefined : movement < 0 ? 'negative' : 'positive'}>
            {movement != null && <i style={{ '--move': `${Math.min(100, Math.abs(movement) * 4)}%` } as CSSProperties} />}
            <b>{movement == null ? '—' : `${movement > 0 ? '+' : ''}${movement.toFixed(1)} pts`}</b></span>
          <strong className={value == null ? undefined : value < 0 ? 'negative' : 'positive'}>{value != null && value > 0 ? '+' : ''}{money(value)}</strong>
        </button>;
      })}
    </>}
    <Paging className="biz-pager" total={view === 'coverage' ? matchedIds.length : matches.length} shown={view === 'coverage' ? shownIds.length : shownRows.length} offset={page * 6}
      previous={page > 0 ? () => update({ page: String(page - 1), offer: null }) : undefined}
      next={(page + 1) * 6 < (view === 'coverage' ? matchedIds.length : matches.length) ? () => update({ page: String(page + 1), offer: null }) : undefined} />
    {view === 'coverage' && <p className="biz-note">Percentages are modeled conversion probabilities. Owned indicates a recorded open financial account. A dash marks an unavailable score.</p>}
    {selected ? <Modal open wide title={`Review ${productLabel(selected.code)} opportunity`} onClose={() => update({ offer: null })}>
      <div className="atlas-retail-workspace">
        <OfferDetail key={offerKey(selected)} row={selected} ownerId={ownerId} customer={names?.get(text(selected.acct))}
          onSaved={() => { source.retry(); onSaved(); }} onPrepare={() => update({ offer: null })} />
      </div>
    </Modal> : selectedKey && !source.loading && <p className="source-note">The selected offer is unavailable in these source records.</p>}
  </section>;
}

function OfferDetail({ row, ownerId, customer, onSaved, onPrepare, compactMode = false }: { row: Row; ownerId: string; customer?: string; onSaved: () => void; onPrepare?: () => void; compactMode?: boolean }) {
  const { open, saveDraft } = useWorkspace();
  const [showEvidence, setShowEvidence] = useState(false);
  const id = text(row.acct);
  const code = text(row.code);
  const product = productLabel(code);
  const value = numeric(row.ev);
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const { submit, loading, error } = useCrmAction(() => { setSaved(true); onSaved(); });
  const history = useSource(`offer-history:${ownerId}:${id}:${code}`, () => customer ? readOfferHistory(ownerId, id, code) : Promise.resolve(null));
  const context = `Eligible model probability ${pct(row.conv)} · modeled value ${money(value)}`;
  const name = customer ? whitespaceOpportunityName(product, customer) : product;
  const existing = useCrmList('Opportunity', ownerId, { count: 1, customerId: id, exactName: name, leadSource: WHITESPACE_LEAD_SOURCE });
  const holdings = useSource(`offer-holdings:${ownerId}:${id}`, () => readHoldings(customer ? [id] : []));
  const productMatch = products.find(([key]) => key === code)?.[2];
  const held = holdings.data?.some(row => productMatch?.test(text(field(row, 'Name'),'') ?? ''));
  const eligible = numeric(row.action_rank) != null && (value ?? 0) > 0;
  const canCreate = customer && eligible && !held && !saved && existing.data?.totalCount === 0 && holdings.data != null && !existing.error && !holdings.error;
  const payload = { action: 'opportunity' as const, accountId: id, name, amount: value && value > 0 ? value : undefined,
    leadSource: WHITESPACE_LEAD_SOURCE, description: `${context} · Model code ${code}`, ownerId } as const;
  const evidence = <>
    <Facts values={[[ 'Probability', pct(row.conv) ], ['Modeled value', money(value)], ['Eligible rank', count(row.action_rank)], ['Suggested channels', text(row.channels)]]} />
    <SourceNotice source={history} empty={Boolean(customer) && !history.data?.rows.length} warning={history.data?.warning} />
    {Boolean(history.data?.rows.length) && <div className="biz-history"><h3>Offer history</h3>{history.data?.rows.slice().reverse().map(item =>
      <Facts key={text(item.period)} values={[[ 'Model period', date(item.period) ], ['Probability', pct(item.probability)], ['Modeled value', money(item.expected_value)]]} />)}</div>}
  </>;
  return <article className="r3-opportunity-context">
    {!compactMode && <><Title title={`${customer ?? id} · ${product}`} description="Review the record and offer evidence before following up." />{evidence}</>}
    <SourceNotice source={existing} /><SourceNotice source={holdings} />
    {Boolean(existing.data?.totalCount) && <p className="source-note">This account already has an open cross-sell opportunity for {product}.</p>}
    {held && <p className="source-note">This customer already has the product.</p>}
    {customer && <div className="atlas-retail-actions">
      <button className="primary" disabled={!canCreate} aria-expanded={review && Boolean(canCreate)} onClick={() => setReview(value => !value)}>Plan next step</button>
      {compactMode && <button className="text-button" aria-expanded={showEvidence} onClick={() => setShowEvidence(value => !value)}>Why this offer</button>}
      <AccountLink id={id} /><button className="secondary" onClick={() => { onPrepare?.(); open({ kind: 'prep', id, name: customer, context }); }}>Prepare conversation</button>
      <button className="secondary" disabled={!canCreate} onClick={() => saveDraft({ id: `offer:${offerKey(row)}`, kind: 'Opportunity', title: name, note: context, readiness: 'Working', payload, product, account: { id, name: customer } })}>Keep opportunity draft</button>
    </div>}
    {compactMode && showEvidence && evidence}
    {review && canCreate && <div className="r3-prepared-work">
      <h3>Create Salesforce Opportunity</h3><Facts values={[[ 'Opportunity', name ], ['Stage', 'Prospecting'], ['Amount', money(value)]]} />
      <button className="primary" disabled={loading} onClick={() => void submit(payload, 'Opportunity created', name)}>{loading ? 'Creating…' : 'Create opportunity'}</button>
    </div>}
    {saved && <p role="status">Opportunity created in Salesforce.</p>}{error && <p role="alert">{error}</p>}
  </article>;
}

function Needs({ ownerId, stage, rows }: { ownerId: string; stage: string; rows: Row[] }) {
  const { open } = useWorkspace();
  const { params, update, choice } = useFilters();
  const need = choice('need', ['equity','mortgage','investing'], 'equity');
  const page = Math.max(0, Number(params.get('page')) || 0);
  const source = useSource(`${need}:${ownerId}`, async () => {
    const result = await readSource(need, ownerId);
    return { ...result, names: await bookNames(ownerId, result.rows) };
  });
  const equity = useSource(`equity-summary:${ownerId}`, () => readSource('equitySummary', ownerId));
  const summary = equity.data?.rows[0];
  const filter = source.data?.rows.filter(row => stage === 'all' || row.stage === stage) ?? [];
  const shown = filter.slice(page * 4, page * 4 + 4);
  const label = need === 'equity' ? 'Home equity' : need === 'mortgage' ? 'Mortgage planning' : 'Investing readiness';
  const total = (key: string) => rows.length ? count(rows.filter(row => stage === 'all' || row.life_stage === stage).reduce((sum, row) => sum + (numeric(row[key]) ?? 0), 0)) : '—';
  return <section className="biz-needs">
    <div className="biz-needs-summary"><span className="biz-eyebrow">Home &amp; future</span><h2>Customer follow-up</h2>
      <div><span><strong>{count(summary?.owners)}</strong> property owners</span>
        <span><strong>{compact(summary?.equity)}</strong> estimated home equity</span><span><strong>{count(summary?.refi)}</strong> refinance signals</span></div>
      <small>Bookwide CoreLogic signals · {date(summary?.quarter)} · Equity is not available credit.</small>
      <SourceNotice source={equity} warning={equity.data?.warning} />
    </div>
    <Choices className="biz-modes" items={[[ 'equity','Home equity & refinance' ], ['mortgage',`Mortgage planning · ${total('mortgage_ready')}`],
      ['investing',`Investing readiness · ${total('invest_ready')}`]]} selected={need} update={value => update({ need: value, page: null })} />
    <SourceNotice source={source} empty={!filter.length} warning={source.data?.warning} />
    <div className="biz-need-cards">{shown.map(row => {
      const id = text(row.account_id);
      const customer = source.data?.names.get(id);
      const angle = text(row.angle, label);
      return <button className="biz-need-card" type="button" key={id} disabled={!customer} onClick={() => {
        if (!customer) return;
        open({ kind: 'detail', title: `Prepare a conversation · ${customer}`, children: <>
          <SourcePeriod source={label} date={row.period ?? row.property_period} />
          <Facts values={[[ 'Signal score', count(row.score) ], ['Life stage', text(row.stage)], ...(need === 'equity' ? [[ 'Estimated equity', compact(row.equity) ], ['Loan to value', pct(row.ltv)]] as const : [])]} />
          <div className="atlas-retail-actions"><AccountLink id={id} />
            <button className="primary" onClick={() => open({ kind: 'prep', id, name: customer, context: `${label} · source score ${text(row.score)}` })}>Prepare conversation</button></div>
        </> });
      }}>
        <span className="biz-need-symbol" aria-hidden="true">{need === 'investing' ? '↗' : '⌂'}</span><small>{angle}</small><h3>{customer ?? id}</h3>
        <div className="biz-readiness"><strong>{count(row.score)}<small>/100</small></strong><span>Modeled propensity</span></div>
        <p>{need === 'equity' ? `${compact(row.equity)} property equity · ${pct(row.ltv)} loan to value` : text(row.stage, 'Life stage unavailable')}</p>
        {customer && <span className="biz-card-link">Prepare a conversation →</span>}
      </button>;
    })}</div>
    <Paging className="biz-pager" total={filter.length} shown={shown.length} offset={page * 4} previous={page > 0 ? () => update({ page: String(page - 1) }) : undefined}
      next={(page + 1) * 4 < filter.length ? () => update({ page: String(page + 1) }) : undefined} />
  </section>;
}
