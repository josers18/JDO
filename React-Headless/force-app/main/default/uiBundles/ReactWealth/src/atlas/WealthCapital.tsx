import { atlasChartColors, atlasProbabilityBand } from '@shared/components/atlas/atlasChartColors';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Layers, ChartNoAxesCombined, Shield, Briefcase } from 'lucide-react';
import { Link } from 'react-router';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import { fetchWhitespace, type WhitespaceCell } from '@shared/data/whitespace';
import { fetchCampaignTouches } from '@shared/data/campaignTouches';
import { fetchDigitalLeakage } from '@shared/data/digitalLeakage';
import { fetchBusinessOwners, fetchOwnerWealthHandoffs } from '@shared/data/businessOwners';
import { fetchWealthUpgrades } from '@shared/data/wealthUpgrades';
import { fetchWarmIntros } from '@shared/data/relationshipGraph';
import { fetchHoldingsConcentration } from '@shared/data/holdingsConcentration';
import { fetchLargeInflows, fetchCallSentiment, fetchAmlChanges } from '@shared/data/transactionSignals';
import { fetchNetFlow } from '@shared/data/kpiTrend';
import { fetchLiquidityEvents } from '@shared/data/jobChangeSignals';
import { fetchTradingPulse } from '@shared/data/tradingPulse';
import {
  fetchCapitalAccountNames,
  fetchOutside,
  fetchPlanSummary,
  fetchProviderPlans,
  fetchRecords,
  type ProviderPlan,
  stringField,
} from './wealthAtlasData';
import {
  formatCount,
  formatDate,
  formatPct,
  HouseholdLink,
  initials,
  Metric,
  RecordDialog,
  SourceState,
  Tabs,
  type OpenProposal,
  useWorkspaceView,
} from './wealthAtlasUi';
import '../../../../../../../docs/design-studies/2026-11-12-directions/persona-workspaces.css';

const capitalTabs = [
  ['capital', 'Capital paths'],
  ['whitespace', 'White-space heat map'],
  ['outside', 'Held-away opportunities'],
  ['acquisition', 'Acquisition'],
] as const;
const intelTabs = [
  ['observatory', 'Household observatory'],
  ['signals', 'Relationship signals'],
  ['plans', 'Plan health'],
  ['concentration', 'Concentration'],
  ['liquidity', 'Liquidity & net flows'],
  ['trading', 'Trading pulse'],
] as const;

type Props = { ownerId: string; propose: OpenProposal };
async function bookOnly<T extends { scope?: string }>(request: Promise<T>): Promise<T> {
  const data = await request;
  if (data.scope !== 'book') throw new Error('Advisory-book source is unavailable.');
  return data;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="wcx-panel">
      <header><h2>{title}</h2>{description && <p>{description}</p>}</header>
      {children}
    </section>
  );
}

function CapitalStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="wcx-stat"><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>;
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  const value = Math.min(100, Math.max(0, score ?? 0));
  return (
    <svg
      className="ps-ring"
      viewBox="0 0 140 140"
      width="145"
      height="145"
      role="img"
      aria-label={`Modeled probability ${planProbability(score)}`}
    >
      <circle cx="70" cy="70" r="56" fill="none" stroke="var(--tone-wash)" strokeWidth="11" />
      <circle
        cx="70"
        cy="70"
        r="56"
        fill="none"
        stroke="var(--tone-mid)"
        strokeWidth="11"
        pathLength="100"
        strokeDasharray={`${value} ${100 - value}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="77" textAnchor="middle" fill="currentColor">
        {planProbability(score)}
      </text>
    </svg>
  );
}

export function ScoreHistory({ cell }: { cell: WhitespaceCell }) {
  const [selected, setSelected] = useState<number | null>(null);
  const history = cell.history ?? [];
  if (!history.length) return <p>No monthly score history returned for this product.</p>;
  const index = Math.min(history.length - 1, selected ?? history.length - 1);
  const min = Math.min(...history.map(point => point.score));
  const max = Math.max(...history.map(point => point.score));
  const x = (i: number) => 25 + (i / Math.max(1, history.length - 1)) * 450;
  const y = (score: number) => 130 - ((score - min) / Math.max(1, max - min)) * 100;
  return (
    <div className="ps-history wr-history">
      <div className="ps-history-heading">
        <span>{formatDate(history[index].month)}</span>
        <strong>
          {planProbability(history[index].score)}
          <small>modeled conversion</small>
        </strong>
      </div>
      <svg viewBox="0 0 500 160" role="img" aria-label="Monthly modeled conversion">
        <line x1="25" y1="135" x2="475" y2="135" stroke="var(--tone-border)" />
        <polyline
          points={history.map((point, i) => `${x(i)},${y(point.score)}`).join(' ')}
          fill="none"
          stroke="var(--tone-mid)"
          strokeWidth="3"
        />
        <line x1={x(index)} x2={x(index)} y1="15" y2="135" stroke="var(--tone-mid)" strokeDasharray="4 4" />
        {history.map((point, i) => (
          <circle key={point.month} cx={x(i)} cy={y(point.score)} r={index === i ? 7 : 4} fill="var(--tone-mid)">
            <title>
              {formatDate(point.month)} · {planProbability(point.score)}
            </title>
          </circle>
        ))}
      </svg>
      <label className="ps-scrubber">
        Explore monthly score
        <input
          type="range"
          min="0"
          max={history.length - 1}
          value={index}
          onChange={event => setSelected(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

function CapitalPath({ ownerId, mode, propose }: Props & { mode: string }) {
  const view = useWorkspaceView();
  const coverage = useAsyncData(() => bookOnly(fetchWhitespace('wealth', ownerId, true, true)), [ownerId]);
  const outside = useAsyncData(() => fetchOutside(ownerId), [ownerId]);
  const query = view.get('capitalSearch');
  const product = view.get('matrixProduct', 'all');
  const cohort = coverage.data?.clients ?? [];
  const term = query.trim().toLowerCase();
  const clients = cohort.filter(row => [row.name, row.email, row.id].some(value => value?.toLowerCase().includes(term)));
  const selected = cohort.find(row => row.id === view.get('capitalHousehold')) ?? clients[0] ?? cohort[0];
  const products = coverage.data?.products ?? [];
  const chosen =
    products.find(row => row.key === view.get('capitalProduct', product)) ??
    products.find(row => selected?.cells[row.key]?.recommendationRank != null) ??
    products.find(row => selected?.cells[row.key]?.score != null) ??
    products[0];
  const cell = chosen ? selected?.cells[chosen.key] : undefined;
  const held = outside.data?.rows.find(row => row.account_id === selected?.id);
  const stats = coverage.data?.stats;
  const moversMode = view.get('capitalMovers', 'coverage');
  const movers = coverage.data?.movers?.filter(row => {
    const change = Math.abs(row.evMoved) >= 250 ? row.evMoved : row.moved;
    return moversMode === 'rising' ? change > 0 : change < 0;
  }) ?? [];
  const [inspectingProduct, setInspectingProduct] = useState(false);
  const mayPrepareOpportunity = cell?.recommendationRank != null && !cell.owned && !cell.inPipeline;
  const hasProductEvidence = cell && (cell.owned || cell.score != null || cell.inPipeline);
  const prepareProduct = (kind: 'Task' | 'Opportunity') => {
    if (!cell || !chosen || !selected) return;
    const context = [
      cell.owned ? 'Held at Cumulus.' : cell.reason,
      cell.score != null ? `Modeled conversion ${planProbability(cell.score)}.` : '',
      cell.estValue != null ? `Modeled expected value ${providerMoney(cell.estValue)}.` : '',
      cell.inPipeline ? 'A grid opportunity is already open.' : '',
    ].filter(Boolean).join(' ');
    const title = `${chosen.label} · ${selected.name}`;
    setInspectingProduct(false);
    propose(kind, kind === 'Task' ? `Follow up on ${title}` : title, {
      Id: '',
      AccountName: { value: selected.name },
      Product: { value: chosen.label },
      ProductCode: { value: cell.code },
        Amount: { value: cell.estValue },
      EvidenceKind: { value: cell.owned ? 'Cumulus holdings' : 'Offer eligibility' },
      EvidenceSummary: { value: context },
      Description: { value: context },
    }, selected.id);
  };
  const productActions = (showInspect: boolean) => (
    <div className="wa-actions">
      {showInspect && (
        <button type="button" className="secondary" onClick={() => setInspectingProduct(true)}>
          Inspect product evidence
        </button>
      )}
      <button type="button" className="primary" onClick={() => prepareProduct('Task')}>
        Prepare follow-up
      </button>
      {mayPrepareOpportunity && (
        <button type="button" className="secondary" onClick={() => prepareProduct('Opportunity')}>
          Prepare opportunity
        </button>
      )}
    </div>
  );
  const productMetrics = (
    <div className="wa-pair">
      <Metric label="Modeled expected value" value={providerMoney(cell?.estValue)} detail="Modeled value, not opportunity amount" />
      <Metric label="Recommendation rank" value={cell?.owned ? 'Owned' : cell?.recommendationRank == null ? 'Not ranked' : formatCount(cell.recommendationRank)}
        detail={cell?.inPipeline ? 'A grid opportunity is open' : 'Confirm needs and ownership'} />
    </div>
  );
  const evidenceNote = cell?.owned
    ? 'This product is on file. Review service and planning needs before proposing an action.'
    : cell?.score == null
      ? 'No scored source row for this household and product. Missing eligibility does not establish ownership.'
      : 'The proposal stays linked to this household and product. Review the modeled evidence before taking action.';
  const select = (household: string, key: string) => view.set({ capitalHousehold: household, capitalProduct: key });
  const visibleProducts = products.filter(row => product === 'all' || row.key === product);
  const evidence = (
    <>
      <span className="wa-pill">{cell?.owned ? 'Product on file' : cell?.recommendationRank != null ? 'Eligible conversation' : 'Review eligibility'}</span>
      <h2>{chosen?.label ?? 'No product evidence'}</h2>
      {cell?.score != null && !cell.owned && <ScoreRing score={cell.score} />}
      {cell?.score != null && <p>{providerMoney(cell.estValue)} modeled expected value</p>}
    </>
  );
  return (
    <>
      {mode === 'whitespace' ? (
        <>
          <Panel title="The opportunity landscape" description={`${cohort.length} source-selected households · ${products.length} Wealth product groups. Select a cell for the household, history and next step.`}>
            <div className="wcx-controls">
              <label>Find a household<input value={query} placeholder="Search by household name or record ID"
                onChange={event => view.set({ capitalSearch: event.target.value }, true)} /></label>
              <label>Product lens<select value={product} onChange={event => view.set({ matrixProduct: event.target.value, capitalProduct: '' })}>
                <option value="all">All seven products</option>
                {products.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}
              </select></label>
            </div>
            <div className="wcx-matrix" style={{ '--columns': visibleProducts.length } as CSSProperties}>
              <div className="wcx-matrixhead"><strong>Household</strong>{visibleProducts.map(row => <span key={row.key}>{row.label}</span>)}</div>
              {clients.map(client => (
                <div className="wcx-matrixrow" key={client.id}>
                  <div className="wcx-rowname"><span className="wa-avatar">{initials(client.name)}</span><strong>{client.name}</strong></div>
                  <div className="wcx-matrixcells">{visibleProducts.map(row => {
                    const offer = client.cells[row.key];
                    const active = selected?.id === client.id && chosen?.key === row.key;
                    const label = offer?.owned ? '✓ Owned' : offer?.score != null ? planProbability(offer.score) : 'No score';
                    return (
                      <button key={row.key} type="button" aria-pressed={active} aria-label={`${client.name} · ${row.label} · ${label}`}
                        className={`wcx-cell ${offer?.owned ? 'owned' : offer?.score != null ? 'scored' : 'missing'}${active ? ' selected' : ''}`}
                        data-score-band={offer?.score == null ? undefined : atlasProbabilityBand(offer.score)}
                        style={{ '--score': Math.min(100, Math.max(0, offer?.score ?? 0)) / 100 } as CSSProperties}
                        onClick={() => select(client.id, row.key)}>
                        <span className="wcx-mobileproduct">{row.label}</span><strong>{label}</strong>
                        {!offer?.owned && offer?.score != null && <small>{offer.recommendationRank == null ? 'Review eligibility' : `${providerMoney(offer.estValue)} modeled EV`}</small>}
                      </button>
                    );
                  })}</div>
                </div>
              ))}
              {!clients.length && <SourceState source={coverage} empty="No matching household in this coverage cohort." />}
            </div>
            <div className="wcx-legend"><span>Modeled conversion probability</span><i aria-hidden="true" /><span>Under 15% · 15–&lt;30% · 30–&lt;50% · 50%+</span><span>✓ Recorded ownership</span><span>Dashed = no scored row</span></div>
          </Panel>
          {selected && chosen && (
            <section className="wcx-detail">
              <div><p className="wcx-kicker">Selected household × product</p><h2 data-agent-record={selected.id} data-agent-label={selected.name}>{selected.name}</h2><h3>{chosen.label}</h3></div>
              <div className="wa-offer">
                {cell?.score != null && !cell.owned && (
                  <div><span className="wa-pill">{chosen.label}</span><h3>{planProbability(cell.score)} <small>modeled conversion</small></h3>
                    <div className="wa-meter"><i style={{ width: `${Math.min(100, Math.max(0, cell.score))}%` }} /></div></div>
                )}
                {productMetrics}
                {cell?.history?.length ? <ScoreHistory key={`${selected.id}:${chosen.key}`} cell={cell} /> : null}
                {hasProductEvidence && productActions(true)}
                <p className="wa-source">{evidenceNote}</p>
              </div>
            </section>
          )}
          <p className="wcx-source">Eligibility model, CRM financial accounts and monthly score history for this advisory book.</p>
        </>
      ) : (
        <>
          <div className="wr-path-summary">
            <div className="wa-statstrip">
              <Metric label="Households in this lens" value={formatCount(coverage.data?.clients.length)} detail="Source-selected coverage" />
              <Metric label="Open grid opportunities" value={formatCount(stats?.open)} detail="Independent CRM count" />
              <Metric label="Won in 30 days" value={formatCount(stats?.won30)} detail="Independent CRM count" />
            </div>
            <Tabs className="wa-tabs" label="Offer movement" items={[
              ['coverage', 'Coverage'], ['rising', 'Rising outside this view'], ['falling', 'Falling outside this view'],
            ]} value={moversMode} onChange={value => view.set({ capitalMovers: value })} />
            {moversMode !== 'coverage' && (
              <section className="wa-panel">
                <header><h2>{moversMode === 'falling' ? 'Falling' : 'Rising'} beyond the coverage lens</h2></header>
                <p className="wa-source">At least 2 conversion points or $250 modeled expected-value change. Coverage households are excluded.</p>
                <div className="atlas-wealth-cards">{movers.map(row => (
                  <article key={`${row.clientId}:${row.productKey}`}>
                    <h3>{row.clientName}</h3>
                    <p>{row.productLabel} · {providerMoney(row.evMoved)} expected-value change · {row.moved.toFixed(2)} conversion points</p>
                    <HouseholdLink id={row.clientId} />
                  </article>
                ))}</div>
                {!movers.length && <SourceState source={coverage} empty="No qualifying movers outside this coverage cohort." />}
              </section>
            )}
          </div>
          <section className="ps-wealth-capital wr" data-retained-scene="wealth-growth">
            <div className="wr-path-controls">
              <label>Find a household<input value={query} onChange={event => view.set({ capitalSearch: event.target.value }, true)} placeholder="Name, email or exact record" /></label>
              <label>Household<select value={selected?.id ?? ''} onChange={event => select(event.target.value, '')}>
                {selected && !clients.includes(selected) && <option value={selected.id}>{selected.name} · current selection</option>}
                {clients.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
              </select></label>
              <label>Product<select value={chosen?.key ?? ''} onChange={event => view.set({ capitalProduct: event.target.value })}>
                {products.map(row => <option value={row.key} key={row.key}>{row.label}{selected?.cells[row.key]?.owned ? ' · owned' : ''}</option>)}
              </select></label>
              <p className="wr-search-status" role="status">
                {clients.length ? `${clients.length} matching households in this coverage cohort.` : 'No matching household in this coverage cohort.'}
                {query && <button type="button" className="secondary" onClick={() => view.set({ capitalSearch: '' })}>Clear search</button>}
              </p>
            </div>
            {selected ? (
              <>
                <div className="ps-capital-flow">
                  <div className="ps-capital-source">
                    <span className="ps-institution-mark"><Layers /></span>
                    <p>Outside investment assets</p><h2>{held?.institution || 'Household context'}</h2>
                    <strong>{providerMoney(held?.balance)}</strong>
                    <small>{held ? `${held.acct_type} · ${providerMoney(held.net_flow)} outside monthly activity` : 'No external investment balance returned for this household.'}</small>
                  </div>
                  <div className="ps-capital-bridge">
                    <svg viewBox="0 0 420 320" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M0 160 C110 160 90 65 210 65 S310 160 420 160" />
                      <path d="M0 160 C110 160 90 255 210 255 S310 160 420 160" />
                      <path d="M0 160 H420" />
                    </svg>
                    <div><span>{initials(selected.name)}</span><strong data-agent-record={selected.id} data-agent-label={selected.name}>{selected.name}</strong><small>Understand the purpose.<br />Then explore the fit.</small></div>
                  </div>
                  <div className="ps-capital-destination">{evidence}<div className="wr-path-actions">
                    {hasProductEvidence && productActions(false)}<HouseholdLink id={selected.id} />
                  </div></div>
                </div>
                <p className="ps-flow-caption">Use the outside balance to understand the household’s priorities before discussing a transfer.</p>
                <section className="wr-path-evidence">
                  <div><h3>Selected product evidence</h3><p>{selected.name} · {chosen?.label}</p></div>
                  {productMetrics}<p className="wa-source">{evidenceNote}</p>
                </section>
                <div className="ps-advisory-products">
                  {products.map(row => {
                    const offer = selected.cells[row.key];
                    return <button type="button" key={row.key} aria-pressed={chosen?.key === row.key}
                      onClick={() => select(selected.id, row.key)}>
                      <span>{/IRA|rollover/i.test(row.label) ? <Shield /> : <ChartNoAxesCombined />}</span>
                      <strong>{row.label}</strong>
                      <small>{offer?.owned ? 'Owned · service and planning context' : offer?.score != null
                        ? `${planProbability(offer.score)} conversion · ${providerMoney(offer.estValue)} modeled EV` : 'No scored row; ownership needs review'}</small>
                    </button>;
                  })}
                </div>
                <div className="ps-capital-history">
                  <div><h3>Opportunity history</h3><p>Explore monthly model scores for the selected household and product.</p>
                    {hasProductEvidence && <button type="button" className="secondary" onClick={() => setInspectingProduct(true)}>Inspect product evidence</button>}
                  </div>
                  {cell && <ScoreHistory key={`${selected.id}:${chosen?.key}`} cell={cell} />}
                </div>
              </>
            ) : <SourceState source={coverage} />}
          </section>
        </>
      )}
      {inspectingProduct && selected && chosen && cell && (
        <RecordDialog title="Household product evidence" close={() => setInspectingProduct(false)}>
          <div className="wa">
            <p>{selected.name} · {chosen.label}</p>
            {cell.code && <p className="wa-source">Offer model action code {cell.code}</p>}
            {evidence}{productMetrics}
            <ScoreHistory key={`${selected.id}:${chosen.key}`} cell={cell} />
            {productActions(false)}
            <HouseholdLink id={selected.id} />
          </div>
        </RecordDialog>
      )}
    </>
  );
}

function useCapitalNames(ids: string[]) {
  const key = Array.from(new Set(ids)).sort().join(',');
  const names = useAsyncData(() => fetchCapitalAccountNames(key ? key.split(',') : []), [key]);
  return (id: string) => names.data?.get(id) || `Linked record …${id.slice(-6)}`;
}

function Outside({ ownerId, propose }: Props) {
  const source = useAsyncData(() => fetchOutside(ownerId), [ownerId]);
  const digital = useAsyncData(() => bookOnly(fetchDigitalLeakage(ownerId, true)), [ownerId]);
  const rows = source.data?.rows ?? [];
  const platforms = digital.data?.rows ?? [];
  const name = useCapitalNames([...rows.map(row => row.account_id), ...platforms.map(row => row.accountId)]);
  const max = Math.max(1, ...rows.map(row => Number(row.balance)));
  const [inspected, setInspected] = useState<{ id: string; institution: string; kind: string; balance: number; flow: number; count: number } | null>(null);
  const actions = (item: NonNullable<typeof inspected>) => (
    <div className="wcx-actions">
      <button className="secondary" type="button" onClick={() => setInspected(item)}>Inspect evidence</button>
      <HouseholdLink id={item.id} className="secondary" />
      <button className="secondary" type="button"
        onClick={() => propose('Task', `Discuss ${item.kind} with ${name(item.id)}`, {
          Id: '', AccountName: { value: name(item.id) },
          Description: { value: `${item.institution} · ${providerMoney(item.balance)} balance · ${providerMoney(item.flow)} external monthly activity` },
        }, item.id)}>Prepare outreach</button>
    </div>
  );
  return (
    <>
      <section className="wcx-capitalbanner">
        <div>
          <p className="wcx-kicker">Capital beyond the bank</p>
          <h2>Assets held at other institutions</h2>
          <p>Bring institution, balance and outside activity into one consolidation conversation.</p>
        </div>
        <CapitalStat label="Investable held away" value={providerMoney(source.data?.total?.balance)}
          detail={`${formatCount(source.data?.total?.clients)} households · brokerage + robo`} />
      </section>
      <div className="wcx-two">
        <Panel title="Outside investment accounts">
          <div className="wcx-river">
            {rows.map(row => (
              <article key={row.account_id}>
                <div><h3>{name(row.account_id)}</h3><span>{row.institution} · {row.acct_type}</span></div>
                <div className="wcx-riverbar" data-kind={row.acct_type} style={{ '--width': `${Number(row.balance) / max * 100}%` } as CSSProperties}>
                  <i aria-hidden="true" /><strong>{providerMoney(row.balance)}</strong>
                </div>
                <p>{providerMoney(row.net_flow)} external monthly activity</p>
                {actions({ id: row.account_id, institution: row.institution, kind: row.acct_type, balance: row.balance, flow: row.net_flow, count: row.holdings })}
              </article>
            ))}
          </div>
          {!rows.length && <SourceState source={source} />}
        </Panel>
        <Panel title="Crypto and robo-advisor accounts"
          description="Crypto and robo balances are shown separately. External monthly activity measures flows at the observed platform.">
          {platforms.map(row => {
            const kind = row.kind === 'crypto' ? 'Crypto exchange' : 'Robo-advisor';
            return <article className="wcx-digital" data-kind={row.kind} key={`${row.accountId}:${row.kind}`}>
              <span className="wcx-orbit" aria-hidden="true">◉</span>
              <h3>{name(row.accountId)}</h3><p>{row.institution} · {kind}</p>
              <CapitalStat label="Observed platform balance" value={providerMoney(row.balance)}
                detail={`External monthly activity ${providerMoney(row.netFlow)}`} />
              {actions({ id: row.accountId, institution: row.institution, kind, balance: row.balance, flow: row.netFlow, count: row.accounts })}
            </article>;
          })}
          {!platforms.length && <SourceState source={digital} />}
        </Panel>
      </div>
      <p className="wcx-source">Plaid investable held-away and digital-platform evidence for this advisory book.</p>
      {inspected && <RecordDialog title={name(inspected.id)} close={() => setInspected(null)}>
        <div className="wa-pair">
          <Metric label={inspected.institution || 'External institution'} value={providerMoney(inspected.balance)} detail={inspected.kind} />
          <Metric label="External monthly activity" value={providerMoney(inspected.flow)} />
          <Metric label="Recorded external accounts" value={formatCount(inspected.count)} />
        </div>
        <HouseholdLink id={inspected.id} />
      </RecordDialog>}
    </>
  );
}

function Acquisition({ ownerId, propose }: Props) {
  const view = useWorkspaceView();
  const requested = view.get('acquisitionView', 'leads');
  const mode = requested === 'introductions' ? 'leads' : requested === 'business' ? 'owners' : requested;
  const leads = useAsyncData(() => fetchRecords(ownerId, 'Lead'), [ownerId]);
  const intros = useAsyncData(() => bookOnly(fetchWarmIntros(ownerId, true)), [ownerId]);
  const owners = useAsyncData(() => bookOnly(fetchOwnerWealthHandoffs(ownerId, true)), [ownerId]);
  const clients = useAsyncData(() => bookOnly(fetchBusinessOwners(ownerId, true)), [ownerId]);
  const upgrades = useAsyncData(() => bookOnly(fetchWealthUpgrades(ownerId, true)), [ownerId]);
  const name = useCapitalNames([
    ...(intros.data?.rows.map(row => row.referrerId) ?? []),
    ...(owners.data?.rows.map(row => row.businessId) ?? []),
    ...(clients.data?.rows.map(row => row.accountId) ?? []),
    ...(upgrades.data?.rows.map(row => row.accountId) ?? []),
  ]);
  const [intro, setIntro] = useState<NonNullable<typeof intros.data>['rows'][number] | null>(null);
  const rows = leads.data?.rows ?? [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = stringField(row, 'Status') || 'Unspecified';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return (
    <>
      <Tabs className="wcx-tabs" label="Acquisition source" items={[
        ['leads', 'Leads & introductions'], ['owners', 'Business owners'], ['upgrades', 'Wealth upgrade prospects'],
      ]} value={mode} onChange={value => view.set({ acquisitionView: value })} />
      {mode === 'leads' && (
        <>
          <div className="wcx-acquisitionpulse">
            {[...counts].map(([status, count]) => <CapitalStat key={status} label={status}
              value={formatCount(count)} detail={`Within ${rows.length} loaded CRM leads`} />)}
          </div>
          <div className="wcx-two">
            <Panel title="My acquisition desk" description="CRM leads are tracked separately from modeled prospects and introduction connections.">
              <div className="wcx-actions"><button className="secondary" onClick={() => propose('Lead', '')}>Create lead proposal</button></div>
              <div className="wcx-leadgrid">
                {rows.map(row => (
                  <article key={row.Id}>
                    <small>{stringField(row, 'LeadSource') || 'Source unavailable'}</small>
                    <h3>{stringField(row, 'Name')}</h3>
                    <p>{stringField(row, 'Company')}</p>
                    <span className="wa-pill">{stringField(row, 'Status') || 'Status unavailable'}</span>
                    <button className="secondary" onClick={() => propose('Lead', stringField(row, 'Name'), row)}>Review lead</button>
                  </article>
                ))}
              </div>
              {!rows.length && <SourceState source={leads} />}
            </Panel>
            <Panel title="A warmer way into the conversation" description="Graph confidence measures the strength of a detected relationship connection.">
              {intros.data?.rows.map(row => (
                <article className="wcx-intro" key={row.accountId}>
                  <div>
                    <span>{name(row.referrerId)}</span><i aria-hidden="true">↳</i><h3>{row.name}</h3>
                    <small>{formatPct(row.confidencePct)} source graph confidence · {row.owned ? 'Owned relationship' : 'Outside relationship'}</small>
                  </div>
                  <button className="secondary" onClick={() => setIntro(row)}>Review introduction</button>
                </article>
              ))}
              {!intros.data?.rows.length && <SourceState source={intros} />}
            </Panel>
          </div>
        </>
      )}
      {mode === 'owners' && (
        <div className="wcx-two">
          <Panel title="Business-owner clients">
            {clients.data?.rows.map(row => (
              <article className="wcx-intro" key={`${row.accountId}:${row.businessId}`}>
                <div><span>{row.businessName}</span><i aria-hidden="true">↳</i><h3>{row.clientName || name(row.accountId)}</h3>
                  <small>{row.revenueBand} · {formatPct(row.confidencePct)} ownership confidence</small></div>
                <HouseholdLink id={row.accountId} className="secondary" />
              </article>
            ))}
            {!clients.data?.rows.length && <SourceState source={clients} empty="No owner-client rows returned for this book." />}
          </Panel>
          <Panel title="Business → Wealth handoffs" description="Coordinate relationship ownership before outreach.">
            <div className="wcx-acquisitionpulse">
              <CapitalStat label="Source owner prospects" value={formatCount(owners.data?.owners)} detail="Broader handoff population" />
              <CapitalStat label="Millionaire band" value={formatCount(owners.data?.millionaires)} detail="Independent source aggregate" />
            </div>
            {owners.data?.rows.map(row => (
              <article className="wcx-intro" key={`${row.ownerId}:${row.businessId}`}>
                <div><span>{name(row.businessId)} · business in book</span><i aria-hidden="true">↳</i><h3>{row.ownerName}</h3>
                  <p>{row.netWorthBand} · {row.lifeStage}</p><small>{formatPct(row.confidencePct)} graph confidence</small></div>
                <button className="secondary" onClick={() => propose('Handoff', `Prepare handoff for ${row.ownerName}`, undefined, row.businessId)}>Coordinate handoff</button>
              </article>
            ))}
            {!owners.data?.rows.length && <SourceState source={owners} />}
          </Panel>
        </div>
      )}
      {mode === 'upgrades' && (
        <>
          <div className="wcx-acquisitionpulse">
            <CapitalStat label="Upgrade candidates" value={formatCount(upgrades.data?.candidates)} detail="Source-qualified population" />
            <CapitalStat label="Estimated $5M+ band" value={formatCount(upgrades.data?.fiveM)} detail="Modeled wealth estimate" />
            <CapitalStat label="High propensity" value={formatCount(upgrades.data?.highPropensity)} detail="Independent source count" />
          </div>
          <Panel title="The next advisory relationship" description="Claritas propensity scores measure interest by category.">
            <div className="wcx-upgrades">
              {upgrades.data?.rows.map(row => (
                <article key={row.accountId}>
                  <p className="wcx-kicker">{row.lifeStage}</p>
                  <h3>{row.clientName || name(row.accountId)}</h3>
                  <strong className="wcx-worth">{row.netWorthBand}</strong><p>{row.prizm}</p>
                  {[['Wealth', row.wealthScore], ['Investing', row.investScore]].map(([label, value]) => (
                    <div className="wcx-propensity" key={label}><span>{label} propensity</span><strong>{formatCount(Number(value))}/100</strong>
                      <i aria-hidden="true" style={{ '--width': `${Math.max(0, Math.min(100, Number(value)))}%` } as CSSProperties} /></div>
                  ))}
                  <div className="wcx-actions">
                    <HouseholdLink id={row.accountId} className="secondary" />
                    <button className="secondary" onClick={() => propose('Task', `Discuss advisory needs with ${name(row.accountId)}`, undefined, row.accountId)}>Prepare outreach</button>
                  </div>
                </article>
              ))}
            </div>
            {!upgrades.data?.rows.length && <SourceState source={upgrades} />}
          </Panel>
        </>
      )}
      <p className="wcx-source">CRM Leads, relationship graph and Wealth upgrade model for this advisory book.</p>
      {intro && <RecordDialog title="Review introduction" close={() => setIntro(null)}>
        <p>{name(intro.referrerId)} → {intro.name}</p>
        <div className="wa-pair">
          <Metric label="Graph confidence" value={formatPct(intro.confidencePct)} />
          <Metric label="Discovered" value={formatDate(intro.discovered)} />
        </div>
        <div className="wcx-actions">
          <HouseholdLink id={intro.referrerId} className="secondary" />
          <button className="primary" onClick={() => {
            setIntro(null);
            propose('Introduction', `Prepare introduction to ${intro.name}`, {
              Id: '', Description: { value: `Introducer: ${name(intro.referrerId)}. Prospect: ${intro.name}.` },
            }, intro.referrerId);
          }}>Prepare introduction</button>
        </div>
      </RecordDialog>}
    </>
  );
}

const planName = (row: ProviderPlan) => row.account_name || `Household …${row.account_id.slice(-6)}`;
const planProbability = (value: number | null | undefined) =>
  value == null
    ? 'Unavailable'
    : `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const providerMoney = (value: number | null | undefined) =>
  value == null
    ? 'Unavailable'
    : Number(value).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

function PlanObservatory({ ownerId }: { ownerId: string }) {
  const view = useWorkspaceView();
  const source = useAsyncData(() => fetchProviderPlans(ownerId, 'risk', undefined, false, 3), [ownerId]);
  const [inspected, setInspected] = useState<ProviderPlan | null>(null);
  const plans = source.data ?? [];
  const selected = plans.find(row => row.account_id === view.get('observatoryAccount')) ?? plans[0];
  if (source.loading || source.error || !selected) {
    return <SourceState source={source} empty="No plan-health rows returned for this advisory book." />;
  }
  const facts = [
    ['Modeled plan success', planProbability(selected.success)],
    ['Next provider review', formatDate(selected.next_review)],
    ['Provider goal exposure', providerMoney(selected.goal_usd)],
    ['Provider goals', formatCount(selected.goals)],
  ];
  return (
    <div className="ps-plan-observatory">
      <div className="ps-plan-orbits">
        <svg
          viewBox="0 0 450 450"
          role="img"
          aria-label={`${plans.length} modeled plan probabilities on independent zero to one hundred percent scales`}
        >
          {plans.map((row, index) => {
            const radius = 174 - index * 43;
            const progress = Math.min(100, Math.max(0, Number(row.success)));
            return (
              <g key={row.account_id}>
                <circle cx="225" cy="225" r={radius} fill="none" stroke="var(--tone-wash)" strokeWidth="17" />
                {row.success != null && (
                  <circle
                    cx="225"
                    cy="225"
                    r={radius}
                    fill="none"
                    stroke={atlasChartColors[index]}
                    strokeWidth="17"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray={`${progress} ${100 - progress}`}
                    transform="rotate(-90 225 225)"
                    opacity={row === selected ? 1 : 0.35}
                  />
                )}
              </g>
            );
          })}
          <text x="225" y="220" textAnchor="middle">
            {planProbability(selected.success)}
          </text>
          <text x="225" y="250" textAnchor="middle" className="ps-orbit-subtitle">
            modeled plan success
          </text>
        </svg>
        <div className="ps-orbit-legend" role="group" aria-label="Household plan">
          {plans.map((row, index) => (
            <button
              key={row.account_id}
              type="button"
              aria-pressed={row === selected}
              onClick={() => view.set({ observatoryAccount: row.account_id })}
            >
              <i style={{ background: atlasChartColors[index] }} />
              <span>{planName(row)}</span>
              <strong>{planProbability(row.success)}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="ps-advisory-reading">
        <span className="wa-pill">Financial plan + relationship</span>
        <h2>{planName(selected)}</h2>
        <p>Bring the plan, the next review and the household’s priorities into the same conversation.</p>
        <div className="wr-evidence">
          {facts.map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="wcx-actions">
          <Link className="secondary" to={`/health?reviewAccount=${selected.account_id}`}>
            Prepare this review
          </Link>
          <button type="button" className="secondary" onClick={() => setInspected(selected)}>
            Inspect source
          </button>
          <HouseholdLink id={selected.account_id} />
        </div>
        <p className="wr-source">
          Each ring uses an independent probability scale. Provider goals and CRM goals have separate source
          records.
        </p>
      </div>
      {inspected && (
        <RecordDialog title={`Provider source · ${planName(inspected)}`} close={() => setInspected(null)}>
          <div className="wr-evidence">
            <Metric label="Provider status" value={inspected.status || 'Unavailable'} />
            <Metric label="Modeled plan success" value={planProbability(inspected.success)} />
            <Metric label="Next provider review" value={formatDate(inspected.next_review)} />
            <Metric label="Last source update" value={formatDate(inspected.updated)} />
            <Metric label="Provider goal exposure" value={providerMoney(inspected.goal_usd)} />
            <Metric label="Provider goals" value={formatCount(inspected.goals)} />
          </div>
        </RecordDialog>
      )}
    </div>
  );
}

function Planning({ ownerId }: { ownerId: string }) {
  const summary = useAsyncData(() => fetchPlanSummary(ownerId), [ownerId]);
  const plans = useAsyncData(() => fetchProviderPlans(ownerId, 'risk'), [ownerId]);
  const rows = plans.data ?? [];
  const picks = rows.slice(0, 5);
  const totals = summary.data;
  const total = Number(totals?.plans) || 0;
  const critical = Number(totals?.critical) || 0;
  const risk = Number(totals?.at_risk) || 0;
  const a = total ? (critical / total) * 360 : 0;
  const b = total ? (risk / total) * 360 : 0;
  return (
    <div className="wcx-two">
      <Panel title="Plan health" description="Draft plans are excluded. Due dates and staleness can overlap the modeled-success tiers.">
        {totals ? (
          <div className="wcx-planvisual">
            <div
              className="wcx-donut"
              style={{
                background: `conic-gradient(#a74258 0deg ${a}deg,#d6a269 ${a}deg ${b}deg,var(--tone-wash) ${b}deg 360deg)`,
              }}
            >
              <div>
                <strong>{formatCount(total)}</strong>
                <span>Active / stale plans</span>
              </div>
            </div>
            <div className="wcx-planlegend">
              <Link className="secondary" to="/health?reviewMode=critical">
                {formatCount(critical)} below 50%
              </Link>
              <Link className="secondary" to="/health?reviewMode=risk">
                {formatCount(risk - critical)} other plans below 70%
              </Link>
              <Link className="secondary" to="/health?reviewMode=all">
                {formatCount(total - risk)} outside attention tier
              </Link>
              <Link className="secondary" to="/health?reviewMode=due">
                {formatCount(totals.due30)} reviews due in 30 days
              </Link>
              <Link className="secondary" to="/health?reviewMode=stale">
                {formatCount(totals.stale)} stale plans
              </Link>
            </div>
          </div>
        ) : (
          <SourceState source={summary} />
        )}
      </Panel>
      <Panel title="Plans requiring review" description="Provider plans in the advisory book that meet the attention criteria.">
        {picks.map(row => (
          <article className="wcx-planrow" key={row.account_id}>
            <div><h3>{planName(row)}</h3><span>Review {formatDate(row.next_review)} · {formatCount(row.goals)} provider goals</span></div>
            <strong>{planProbability(row.success)}</strong>
            <Link className="secondary" to={`/health?reviewAccount=${row.account_id}`}>Open review</Link>
          </article>
        ))}
        {!picks.length && <SourceState source={plans} />}
      </Panel>
    </div>
  );
}

function Concentration({ ownerId, propose, observatory = false }: Props & { observatory?: boolean }) {
  const source = useAsyncData(() => bookOnly(fetchHoldingsConcentration(ownerId, true)), [ownerId]);
  const view = useWorkspaceView();
  const rows = source.data?.rows ?? [];
  const name = useCapitalNames(rows.map(row => row.accountId));
  const row = rows[0];
  const exposures = source.data?.exposures ?? [];
  const shownValue = exposures.reduce((sum, item) => sum + item.marketValue, 0);
  const ticker = view.get('exposureTicker');
  const selectedExposure = exposures.find(item => item.ticker === ticker);
  const [position, setPosition] = useState<(typeof rows)[number] | null>(null);
  const positionActions = (item: (typeof rows)[number]) => (
    <div className="wcx-actions">
      <button className="secondary" onClick={() => propose('Task', `Review ${item.ticker} concentration`, {
        Id: '', Description: { value: `${item.ticker} accounts for ${planProbability(item.weight * 100)} of recorded household holdings.` },
      }, item.accountId)}>Prepare concentration review</button>
      <button className="secondary" onClick={() => setPosition(item)}>Inspect position</button>
      <HouseholdLink id={item.accountId} />
    </div>
  );
  return (
    <>
      {observatory ? row ? (
        <div className="ps-concentration-scene">
          <div className="ps-position-sculpture" role="img" aria-label={`${row.ticker} is ${planProbability(row.weight * 100)} of household holdings`}
            style={{ gridTemplateColumns: `${row.weight}fr ${Math.max(0, 1 - row.weight)}fr` }}>
            <div className="ps-position-major"><span>{row.ticker}</span><strong>{planProbability(row.weight * 100)}</strong></div>
            <div className="ps-position-rest"><span>Other holdings</span><strong>{planProbability((1 - row.weight) * 100)}</strong></div>
          </div>
          <div>
            <span className="wa-pill">{row.clientName || name(row.accountId)} · holdings context</span>
            <h2>Concentrated investment position</h2>
            <p>{row.ticker} represents {planProbability(row.weight * 100)} of {providerMoney(row.totalUsd)} in recorded holdings.</p>
            {positionActions(row)}
            <button className="secondary" onClick={() => view.set({ intelligenceView: 'concentration' })}>Explore book concentration</button>
          </div>
        </div>
      ) : <SourceState source={source} /> : (
        <>
          <Panel title="The issuers connecting the book" description="Area represents market value within the displayed single-stock exposures.">
            <div className="wcx-exposuremap">
              {exposures.map((item, index) => (
                <button key={item.ticker} aria-pressed={item.ticker === ticker}
                  style={{ flex: Math.max(1, item.marketValue), '--issuer': index } as CSSProperties}
                  onClick={() => view.set({ exposureTicker: item.ticker })}>
                  <strong>{item.ticker}</strong><span>{providerMoney(item.marketValue)}</span>
                  <small>{shownValue > 0 ? planProbability(item.marketValue / shownValue * 100) : '—'} of shown exposure · {formatCount(item.holders)} holders</small>
                </button>
              ))}
            </div>
            {selectedExposure && <p className="wcx-source">{selectedExposure.issuer} · {planProbability(selectedExposure.share * 100)} of measured holdings in the advisory book</p>}
            {!exposures.length && <SourceState source={source} />}
          </Panel>
          <div className="wcx-positioncontext">
            <div className="wa-statstrip">
              <Metric label="Holdings market value" value={providerMoney(source.data?.aum)} detail="FinServ holding source" />
              <Metric label="Households with holdings" value={formatCount(source.data?.clients)} detail="Independent aggregate" />
              <Metric label="Concentrated" value={formatCount(source.data?.concentrated)} detail="Largest single stock ≥20%" />
            </div>
            <section className="wa-panel">
              <header><h2>Position conversations</h2><p>Position weights use the recorded holdings total for each household.</p></header>
              {rows.map(item => <article className="wa-position" key={item.accountId}>
                <h3>{item.clientName || name(item.accountId)}</h3>
                <p>{item.ticker} · {planProbability(item.weight * 100)} of {providerMoney(item.totalUsd)} in holdings</p>
                <div className="wa-meter"><i style={{ width: `${Math.min(100, item.weight * 100)}%` }} /><b style={{ left: '20%' }} title="20% concentration threshold" /></div>
                <small>{providerMoney(item.positionUsd)} position · {item.weight >= .2 ? 'At or above' : 'Below'} threshold</small>
                {positionActions(item)}
              </article>)}
              {!rows.length && <SourceState source={source} />}
            </section>
          </div>
        </>
      )}
      {position && <RecordDialog title={`${position.ticker} · ${name(position.accountId)}`} close={() => setPosition(null)}>
        <div className="wa-pair"><Metric label={position.issuer} value={providerMoney(position.positionUsd)} />
          <Metric label="Recorded holdings total" value={providerMoney(position.totalUsd)} />
          <Metric label="Position weight" value={planProbability(position.weight * 100)} /></div>
        <HouseholdLink id={position.accountId} />
      </RecordDialog>}
    </>
  );
}

function Liquidity({ ownerId, propose, observatory = false }: Props & { observatory?: boolean }) {
  const view = useWorkspaceView();
  const flow = useAsyncData(() => bookOnly(fetchNetFlow(ownerId, undefined, true)), [ownerId]);
  const inflows = useAsyncData(() => bookOnly(fetchLargeInflows(ownerId, true)), [ownerId]);
  const selected = flow.data?.weeks.find(row => row.week === view.get('flowWeek')) ?? flow.data?.last;
  const maxFlow = Math.max(1, ...(flow.data?.weeks.map(row => Math.abs(row.net)) ?? []));
  const career = useAsyncData(() => bookOnly(fetchLiquidityEvents(ownerId, true)), [ownerId]);
  const rows = inflows.data?.rows ?? [];
  const name = useCapitalNames(rows.map(row => row.accountId));
  const latest = rows[0];
  const [inspected, setInspected] = useState<(typeof rows)[number] | null>(null);
  const actions = (row: (typeof rows)[number]) => (
    <div className="wcx-actions">
      <button className="secondary" onClick={() => setInspected(row)}>Inspect observation</button>
      <HouseholdLink id={row.accountId} className="secondary" />
      <button className="secondary" onClick={() => propose('Task', `Discuss ${row.kind.toLowerCase()} with ${name(row.accountId)}`, {
        Id: '', Description: { value: `${row.kind} · ${providerMoney(row.amount)} · ${formatDate(row.date)}` },
      }, row.accountId)}>Prepare liquidity conversation</button>
    </div>
  );
  const observation = inspected && <RecordDialog title={inspected.kind} close={() => setInspected(null)}>
    <p>{name(inspected.accountId)}</p><div className="wa-pair">
      <Metric label="Observed transaction" value={providerMoney(inspected.amount)} />
      <Metric label="Transaction date" value={formatDate(inspected.date)} />
    </div>{inspected.payer && <p>Payer {inspected.payer}</p>}
  </RecordDialog>;
  if (observatory) return (
    <div className="ps-liquidity-scene">
      <div className="ps-transition">
        <div><span><Briefcase /></span><strong>{latest?.kind || 'No qualifying transaction'}</strong><small>{latest ? formatDate(latest.date) : ''}</small></div>
        <span className="ps-transition-arrow" aria-hidden="true">→</span>
        <div><span><Layers /></span><strong>{latest ? name(latest.accountId) : 'Household conversation'}</strong><small>{latest ? `${providerMoney(latest.amount)} observed inflow` : 'Review another signal'}</small></div>
      </div>
      <div><span className="wa-pill">Liquidity transition</span><h2>Liquidity event review</h2>
        <p>Confirm the source, purpose and availability of the inflow before discussing a saving or investment move.</p>
        {latest ? actions(latest) : <SourceState source={inflows} />}
        <button className="secondary" onClick={() => view.set({ intelligenceView: 'liquidity' })}>Explore liquidity &amp; net flows</button>
      </div>
      {observation}
    </div>
  );
  return (
    <>
      <Panel title="Money moving through the book">
        <div className="wcx-flowchart" role="group" aria-label="Completed bank-flow weeks">
          {flow.data?.weeks.map(row => (
            <button
              key={row.week}
              aria-pressed={selected === row}
              onClick={() => view.set({ flowWeek: row.week })}
            >
              <div className="wcx-flowtrack">
                <i
                  className={row.net < 0 ? 'negative' : ''}
                  style={{ height: `${Math.max(2, (Math.abs(row.net) / maxFlow) * 72)}%` }}
                />
              </div>
              <strong>{providerMoney(row.net)}</strong>
              <small>{row.week.slice(5)}</small>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="wcx-acquisitionpulse">
            <CapitalStat label={`Week of ${formatDate(selected.week)}`} value={providerMoney(selected.net)} detail="Credits − debits" />
            <CapitalStat label="Credits" value={providerMoney(selected.credits)} detail={`${formatCount(selected.transactions)} transactions`} />
            <CapitalStat label="Debits" value={providerMoney(selected.debits)} detail={`${formatCount(selected.accounts)} accounts`} />
          </div>
        ) : (
          <SourceState source={flow} />
        )}
      </Panel>
      <div className="wcx-two">
        <Panel title="An observed liquidity moment" description="Review the transaction with the household to understand its purpose.">
          {rows.map(row => (
            <article className="wcx-liquidity" key={`${row.accountId}:${row.date}:${row.amount}`}>
              <p className="wcx-kicker">{name(row.accountId)}</p><strong>{providerMoney(row.amount)}</strong>
              <p>{row.kind}{row.payer ? ` · ${row.payer}` : ''}</p><time>{formatDate(row.date)}</time>
              {actions(row)}
            </article>
          ))}
          {!rows.length && <SourceState source={inflows} />}
        </Panel>
        <Panel title="Career & liquidity events">
          <div className="wcx-river">
            {career.data?.rows.map(row => (
              <article key={`${row.accountId}:${row.detectedDate}`}>
                <div>
                  <h3>{row.contactName}</h3>
                  <p>
                    {row.title} {row.newEmployerName ? `· ${row.newEmployerName}` : ''}
                  </p>
                  <small>{formatDate(row.detectedDate)}</small>
                </div>
                <HouseholdLink id={row.accountId} />
              </article>
            ))}
          </div>
          {!career.data?.rows.length && (
            <SourceState
              source={career}
              empty="No qualifying career-liquidity events returned for this book."
            />
          )}
        </Panel>
      </div>
      {observation}
    </>
  );
}

function Trading({ ownerId }: { ownerId: string }) {
  const view = useWorkspaceView();
  const source = useAsyncData(() => bookOnly(fetchTradingPulse(ownerId, true)), [ownerId]);
  const flow = useAsyncData(() => bookOnly(fetchNetFlow(ownerId, undefined, true)), [ownerId]);
  const selected =
    source.data?.weeks.find(row => row.date === view.get('tradeWeek')) ?? source.data?.weeks.slice(-1)[0];
  const weeks = source.data?.weeks ?? [];
  const maxGross = Math.max(1, ...weeks.flatMap(row => [row.buys, row.sells]));
  return (
    <>
      <div className="wcx-tradehero">
        <CapitalStat
          label="Latest trade week on file"
          value={formatDate(source.data?.weeks.slice(-1)[0]?.date)}
          detail={`Through ${formatDate(source.data?.asOf)}`}
        />
        <CapitalStat
          label="Confirmed USD executions"
          value={formatCount(source.data?.weeks.slice(-1)[0]?.trades)}
          detail="Latest source week may be partial"
        />
        <CapitalStat
          label="Bank net flow"
          value={providerMoney(flow.data?.last?.net)}
          detail="Separate completed bank-flow week"
        />
      </div>
      <div>
        <Panel title="Nine-week trading pulse">
          <div
            className="wa-tradechart atlas-trade-weeks"
            role="group"
            aria-label="Weekly gross buys and sells"
          >
            {weeks.map(row => (
              <button
                key={row.date}
                type="button"
                aria-pressed={selected === row}
                onClick={() => view.set({ tradeWeek: row.date })}
                aria-label={`${formatDate(row.date)}, buys ${providerMoney(row.buys)}, sells ${providerMoney(row.sells)}`}
              >
                <span className="atlas-trade-bars">
                  <i className="buy" style={{ height: `${Math.max(1, (row.buys / maxGross) * 150)}px` }} />
                  <i className="sell" style={{ height: `${Math.max(1, (row.sells / maxGross) * 150)}px` }} />
                </span>
                <small>{row.date.slice(5)}</small>
                <b>{formatCount(row.trades)}</b>
              </button>
            ))}
          </div>
          <p className="wcx-source">
            Buys and sells are gross USD executions. Counts show confirmed executions per calendar week.
          </p>
          {selected ? (
            <div className="wa-pair">
              <Metric label="Buys" value={providerMoney(selected.buys)} />
              <Metric label="Sells" value={providerMoney(selected.sells)} />
            </div>
          ) : (
            <SourceState source={source} />
          )}
        </Panel>
        <Panel title="Latest week net sellers">
          <div className="atlas-wealth-cards">
            {source.data?.sellers.map(row => (
              <article key={row.accountId}>
                <h3>{row.clientName || `Household …${row.accountId.slice(-6)}`}</h3>
                <p>
                  {row.instrument} · {providerMoney(row.netSold)} net sold · {formatCount(row.trades)} executions
                </p>
                <HouseholdLink id={row.accountId} />
              </article>
            ))}
          </div>
          {!source.data?.sellers.length && <SourceState source={source} />}
        </Panel>
      </div>
    </>
  );
}

function Signals({ ownerId, propose }: Props) {
  const view = useWorkspaceView();
  const lens = view.get('signalLens', 'aml');
  const calls = useAsyncData(() => bookOnly(fetchCallSentiment(ownerId, true)), [ownerId]);
  const screening = useAsyncData(() => bookOnly(fetchAmlChanges(ownerId, true)), [ownerId]);
  const inflows = useAsyncData(() => bookOnly(fetchLargeInflows(ownerId, true)), [ownerId]);
  const careers = useAsyncData(() => bookOnly(fetchLiquidityEvents(ownerId, true)), [ownerId]);
  const marketing = useAsyncData(() => bookOnly(fetchCampaignTouches(ownerId, 'Personal', true)), [ownerId]);
  const plans = useAsyncData(() => fetchPlanSummary(ownerId), [ownerId]);
  const exposure = useAsyncData(() => bookOnly(fetchHoldingsConcentration(ownerId, true)), [ownerId]);
  const flow = useAsyncData(() => bookOnly(fetchNetFlow(ownerId, undefined, true)), [ownerId]);
  const lenses = [
    { key: 'care', label: 'Call sentiment', title: 'Conversation care', description: 'Negative and declining sentiment in the latest source week.', source: calls },
    { key: 'aml', label: 'AML changes', title: 'Screening changes', description: 'Review dated changes in screening risk ratings.', source: screening },
    { key: 'inflow', label: 'Large inflows', title: 'A liquidity conversation', description: 'Confirm the origin and purpose of the recorded transaction.', source: inflows },
    { key: 'liquidity', label: 'Career moments', title: 'Career & liquidity moments', description: 'Review detected changes in the household’s career history.', source: careers },
    { key: 'marketing', label: 'Marketing signals', title: 'Engagement to understand', description: 'Review dated campaign clicks and opens before planning a conversation.', source: marketing },
  ];
  type Signal = { accountId: string; subtitle: string; facts: [string, string][]; visual: ReactNode };
  const signals: Record<string, Signal[]> = {
    aml: (screening.data?.rows ?? []).map(row => {
      const flags = [['Sanctions', row.sanctions], ['PEP', row.pep], ['Adverse media', row.adverseMedia]] as const;
      return {
        accountId: row.accountId, subtitle: `${row.prevRating || 'New screening'} → ${row.rating}`,
        facts: [['Screened', formatDate(row.screened)], ['Jurisdiction', row.jurisdiction], ['Source case', row.caseRef]],
        visual: <>
          <div className="wa-riskchange">
            <div><span>{row.prevRating ? 'Previous rating' : 'New screening'}</span><strong>{row.prevRating || 'Not supplied'}</strong></div>
            <i aria-hidden="true">→</i><div><span>Latest rating</span><strong>{row.rating}</strong></div>
          </div>
          <p>Screened {formatDate(row.screened)}</p>
          <div className="wa-flags">{flags.map(([label, flagged]) => <span className={`wa-pill${flagged ? ' warn' : ''}`} key={label}>{label}: {flagged ? 'Flagged' : 'No source hit'}</span>)}</div>
        </>,
      };
    }),
    care: (calls.data?.rows ?? []).map(row => ({
      accountId: row.accountId, subtitle: row.sentiment,
      facts: [['Last banker note', formatDate(row.lastNote)], ['Next call', formatDate(row.nextCall)]],
      visual: <div className="wa-conversationvisual"><span>Latest source sentiment</span><strong>{row.sentiment}</strong>
        <div className="wa-topics">{row.topics.map(topic => <span className="wa-pill" key={topic}>{topic}</span>)}</div>
        <div className="wa-pair"><Metric label="Deal-risk score" value={String(row.dealRisk)} />
          <Metric label="Next call on file" value={formatDate(row.nextCall)} /></div>
      </div>,
    })),
    inflow: (inflows.data?.rows ?? []).map(row => ({
      accountId: row.accountId, subtitle: `${row.kind} · ${providerMoney(row.amount)}`,
      facts: [['Transaction date', formatDate(row.date)], ['Source payer', row.payer || 'Unavailable']],
      visual: <div className="wa-inflowvisual"><span>Observed transaction</span><strong>{providerMoney(row.amount)}</strong>
        <p>{row.kind}{row.payer ? ` · ${row.payer}` : ''}</p><time>{formatDate(row.date)}</time></div>,
    })),
    liquidity: (careers.data?.rows ?? []).map(row => ({
      accountId: row.accountId, subtitle: `${row.title} · ${formatDate(row.detectedDate)}`,
      facts: [['Detected', formatDate(row.detectedDate)], ['New employer', row.newEmployerName || 'Unavailable']],
      visual: <div className="wa-conversationvisual"><span>Career moments</span><strong>{row.contactName}</strong><p>{row.title}</p></div>,
    })),
    marketing: (marketing.data?.rows ?? []).map(row => ({
      accountId: row.accountId, subtitle: `${row.campaign} · ${row.clicks} clicks`,
      facts: [['Last touch', formatDate(row.lastTouch)], ['Campaign opens', formatCount(row.opens)]],
      visual: <div className="wa-conversationvisual"><span>Marketing signals</span><strong>{row.product || row.campaign}</strong>
        <p>{row.campaign} · {formatCount(row.clicks)} clicks · {formatCount(row.opens)} opens</p></div>,
    })),
  };
  const current = lenses.find(item => item.key === lens) ?? lenses[1];
  const rows = signals[current.key];
  const name = useCapitalNames(rows.map(row => row.accountId));
  const selected = rows.find(item => item.accountId === view.get('signalHousehold')) ?? rows[0];
  const [inspected, setInspected] = useState<Signal | null>(null);
  return (
    <>
      <div className="wcx-acquisitionpulse">
        <CapitalStat label="Planning attention" value={formatCount(plans.data?.at_risk)} detail="Below 70% modeled plan success" />
        <CapitalStat label="Concentrated households" value={formatCount(exposure.data?.concentrated)} detail="Single stock ≥20% of source holdings" />
        <CapitalStat label="Latest full-week net flow" value={providerMoney(flow.data?.last?.net)} detail="Bank credits − debits" />
      </div>
      <nav className="wa-intelnav" aria-label="Relationship signal sources">
        {lenses.map(item => <button type="button" key={item.key} aria-pressed={item === current}
          onClick={() => view.set({ signalLens: item.key, signalHousehold: '' })}>
          <span>{item.label}</span><b>{item.source.data ? signals[item.key].length : '—'}</b>
          <small>{item.source.loading ? 'Loading' : item.source.error ? 'Unavailable' : 'Source records'}</small>
        </button>)}
      </nav>
      <div className="wa-intellayout">
        <div className="wa-panel"><h2>{current.title}</h2><p>{current.description}</p>
          <div className="wa-signalworklist">{rows.map((row, index) =>
            <button type="button" key={`${row.accountId}:${index}`} aria-pressed={row === selected}
              onClick={() => view.set({ signalHousehold: row.accountId })}>
              <span className="wa-avatar">{initials(name(row.accountId))}</span>
              <span><strong>{name(row.accountId)}</strong><small>{row.subtitle}</small></span>
            </button>
          )}</div>
          {!rows.length && <SourceState source={current.source} />}
        </div>
        <section className="wa-signalstage" data-signal-source={lens}>
          {selected ? <>
            <div className="wa-signalidentity"><span className="wa-avatar">{initials(name(selected.accountId))}</span>
              <div><p>My next conversation</p><h2>{name(selected.accountId)}</h2></div></div>
            {selected.visual}
            <div className="wa-actions">
              <button className="primary" onClick={() => propose('Task', `Review ${current.label.toLowerCase()} with ${name(selected.accountId)}`, {
                Id: '', Description: { value: selected.subtitle },
              }, selected.accountId)}>Prepare conversation</button>
              <button className="text-button" onClick={() => setInspected(selected)}>Inspect source</button>
              <HouseholdLink id={selected.accountId} />
            </div>
          </> : <p>Select a source that has records to review the household evidence.</p>}
        </section>
      </div>
      {inspected && <RecordDialog title={name(inspected.accountId)} close={() => setInspected(null)}>
        {inspected.visual}<div className="wa-pair">{inspected.facts.map(([label, value]) => <Metric key={label} label={label} value={value || 'Unavailable'} />)}</div>
      </RecordDialog>}
    </>
  );
}

export default function WealthCapital({ page, ownerId, propose }: Props & { page: string }) {
  const view = useWorkspaceView();
  const growth = page === 'growth';
  const mode = view.get(growth ? 'capitalView' : 'intelligenceView', growth ? 'capital' : 'observatory');
  const lens = view.get('observatoryLens', 'plans');
  const props = { ownerId, propose };
  return (
    <div className="wa wcx">
      <header className="wcx-heading">
        <p className="wcx-kicker">
          {growth ? 'My capital & acquisition desk' : 'My investment & relationship intelligence'}
        </p>
        <h1>{growth ? 'Capital and acquisition opportunities' : 'Household intelligence'}</h1>
        <p>
          {growth
            ? 'Review product eligibility, outside assets and acquisition leads.'
            : 'Plan resilience, investment exposure and money movement, with the evidence close at hand.'}
        </p>
      </header>
      <Tabs
        className="wcx-tabs"
        label={growth ? 'Capital and acquisition views' : 'Intelligence views'}
        items={growth ? capitalTabs : intelTabs}
        value={mode}
        onChange={value => view.set({ [growth ? 'capitalView' : 'intelligenceView']: value })}
      />
      {growth ? (
        mode === 'outside' ? (
          <Outside {...props} />
        ) : mode === 'acquisition' ? (
          <Acquisition {...props} />
        ) : (
          <CapitalPath {...props} mode={mode} />
        )
      ) : mode === 'observatory' ? (
        <section className="ps-wealth-observatory wr" data-retained-scene="wealth-intelligence">
          <Tabs
            className="ps-switches"
            label="Wealth observatory lens"
            items={[
              ['plans', 'Plan health'],
              ['concentration', 'Concentration'],
              ['liquidity', 'Liquidity'],
            ]}
            value={lens}
            onChange={value => view.set({ observatoryLens: value })}
          />
          {lens === 'concentration' ? (
            <Concentration {...props} observatory />
          ) : lens === 'liquidity' ? (
            <Liquidity {...props} observatory />
          ) : (
            <PlanObservatory ownerId={ownerId} />
          )}
        </section>
      ) : mode === 'plans' ? (
        <Planning ownerId={ownerId} />
      ) : mode === 'concentration' ? (
        <Concentration {...props} />
      ) : mode === 'liquidity' ? (
        <Liquidity {...props} />
      ) : mode === 'trading' ? (
        <Trading ownerId={ownerId} />
      ) : (
        <Signals {...props} />
      )}
      {!growth && <p className="wcx-source">Plan provider, FinServ holdings, confirmed executions and transaction observations for this advisory book.</p>}
    </div>
  );
}
