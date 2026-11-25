import { readVisibleAccount } from '@shared/data/visibleAccount';
import { PropertyTab } from '../personas/customer/Full360Tabs';
import { useState, type ReactNode } from 'react';
import { RelationshipFacts, RelationshipPacket, RelationshipProfile, type PacketSection } from '@shared/components/atlas/AtlasRelationshipScenes';
import { ArrowRight } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmailModal, generateText, loadCenterConfig, queryDataCloud, runPromptFlow, stripHtml } from '@shared';
import { fetchCommercialCompanyWhoToCall, type CommercialWhoToCallRow } from '@shared/data/commercialWhoToCall';
import { AGENTFORCE_FLOWS } from '../personas/customer/agentforceFlows';
import { fetchFull360Real } from '../personas/customer/full360DataReal';
import type { Full360 } from '../personas/customer/full360Types';
import { nodes, readCompanyFinance, recordKey, str, type RecordNode } from './commercialData';
import { Badge, Button, cash, day, Heading, initials, Inspect, Panel, Pending, RouteLink, useLive } from './controls';
import { OfferCard, type Offer } from './Growth';
import { readProspectFocus, readSignals, type Signal } from './signals';
import { SignalDetail, type Followup } from './TodayIntel';
import { SourceMark, sourceStyle } from './sources';
import { ActivityContent } from './Work';
import { AfterCall, CallRecord } from './AfterCall';
import type { Draft, DraftEditor } from './drafts';

const tabs = [['overview', 'Command view'], ['profile', 'Profile'], ['finances', 'Cash & accounts'], ['property', 'Property'], ['intel', 'Company Intel'], ['engagement', 'Conversations'], ['growth', 'Treasury'], ['journey', 'Activity & plans'], ['notebook', 'Notebook'], ['screening', 'Screening'], ['tools', 'Notes & tools']] as const;
const relationshipTabs = [
  ['overview', 'Overview'], ['profile', 'Profile'], ['finances', 'Finances'], ['property', 'Property'], ['intel', 'Company Intel'],
  ['journey', 'Journey & goals'], ['engagement', 'Engagement & service'], ['growth', 'Opportunities'],
  ['tools', 'Notes & tools'], ['notebook', 'Notebook'], ['screening', 'Screening'],
] as const;
const profileCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const products: Record<string, string> = {
  'BIZ-CHK': 'Business checking', 'BIZ-TM-ACH': 'ACH origination', 'BIZ-TM-RDC': 'Remote deposit', 'BIZ-TM-PP': 'Positive pay', 'BIZ-TM-SWP': 'Sweep account', 'BIZ-CARD': 'Corporate card',
  'BIZ-LOC': 'Line of credit', 'BIZ-TL': 'Term loan', 'BIZ-CRE': 'Commercial real estate', 'BIZ-EQF': 'Equipment financing', 'BIZ-SBA': 'SBA lending',
};
async function exactOffers(account: RecordNode) {
  const result = await queryDataCloud<{ code: string; conv: number | null; ev: number | null; channels: string; rank: number | null }>(`
    SELECT action_code__c AS code, conversion_probability__c AS conv, expected_value_uplift__c AS ev, recommended_channels__c AS channels, recommended_action_rank__c AS rank
    FROM BT_Offer_Eligibility__dlm
    WHERE account_id__c = '${account.Id}' AND action_code__c LIKE 'BIZ-%' AND recommended_action_rank__c IS NOT NULL
    ORDER BY recommended_action_rank__c ASC LIMIT 24`, 24);
  if (!result.rows.length) return [];
  const history = await queryDataCloud<{ code: string; mo: string; conv: number | null }>(`
    SELECT action_code__c AS code, CAST(start_date__c AS VARCHAR) AS mo, conversion_probability__c AS conv
    FROM BT_Offer_Eligibility_History__dlm
    WHERE account_id__c = '${account.Id}' AND action_code__c LIKE 'BIZ-%'
      AND start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH
    ORDER BY start_date__c ASC LIMIT 168`, 168).catch(() => undefined);
  return result.rows.map((row): Offer => {
    const timeline = history?.rows.filter(item => item.code === row.code && item.conv != null).map(item => ({ month: item.mo, score: Number(item.conv) }));
    return {
      accountId: account.Id, company: str(account, 'Name'), code: row.code, product: products[row.code] ?? row.code,
      owned: false, rank: row.rank == null ? undefined : Number(row.rank), score: row.conv == null ? undefined : Number(row.conv), estValue: row.ev == null ? undefined : Number(row.ev),
      action: row.channels, history: timeline, moved: timeline && timeline.length > 1 ? timeline[timeline.length - 1].score - timeline[0].score : undefined,
    };
  });
}
function CompanyOffers({ account, holdings, opportunities, draft, product }: { account: RecordNode; holdings: RecordNode[]; opportunities: RecordNode[]; draft: (offer: Offer) => void; product?: string | null }) {
  const state = useLive(() => exactOffers(account), account.Id);
  const [selected, setSelected] = useState<Offer>();
  const matches: Record<string, RegExp> = {
    'BIZ-CHK': /Business.*Checking|Analyzed Checking/i, 'BIZ-TM-ACH': /Treasury|ACH/i,
    'BIZ-TM-RDC': /Treasury|Remote Deposit/i, 'BIZ-TM-PP': /Treasury|Positive Pay/i, 'BIZ-TM-SWP': /Sweep/i,
    'BIZ-CARD': /Corporate Card|Commercial Card/i, 'BIZ-LOC': /Line of Credit/i, 'BIZ-TL': /Term Loan/i, 'BIZ-CRE': /\bCRE\b|Commercial Real Estate/i,
    'BIZ-EQF': /Equipment/i, 'BIZ-SBA': /\bSBA\b/i,
  };
  const rows = (state.value ?? []).map(offer => {
    const owned = holdings.some(r => /^open|active$/i.test(str(r, 'FinServ__Status__c')) && matches[offer.code ?? '']?.test(str(r, 'Name')));
    const deal = opportunities.find(r => str(r, 'LeadSource') === 'Cross-sell grid' && str(r, 'Name').toLowerCase().startsWith(offer.product.toLowerCase() + ' — '));
    return { ...offer, owned, inPipeline: Boolean(deal), openDeal: deal?.Id };
  }).sort((a, b) => Number(b.code === product) - Number(a.code === product));
  return <Pending state={state}><div className="ca-company-offers">
    {rows.map(row => <button key={row.code} className={row.code === product ? 'ca-selected-product' : ''} onClick={() => setSelected(row)}>{row.code === product && <Badge>Selected product</Badge>}<span>{row.product}</span><strong>{row.score == null ? '—' : `${row.score.toFixed(1)}%`}</strong><small>{row.owned ? 'Existing CRM holding' : `Modeled conversion · ${cash(row.estValue)} EV${row.rank == null ? '' : ` · rank ${row.rank}`}`}</small><span>Inspect product evidence ↗</span></button>)}
    {!rows.length && <p>No eligible modeled offer returned for this company.</p>}
  </div>{selected && <OfferCard offer={selected} draft={draft} onClose={() => setSelected(undefined)} company={false} />}</Pending>;
}
function getCompanyNote(storageKey: string) {
  try { return sessionStorage.getItem(storageKey) ?? ''; } catch { return ''; }
}
function Notebook({ storageKey, relationship, children }: { storageKey: string; relationship?: boolean; children?: ReactNode }) {
  const [notes, setNotes] = useState(() => getCompanyNote(storageKey));
  const [status, setStatus] = useState('');
  return <Panel title={relationship ? 'Notes that stay with the relationship' : 'Your company notebook'}>
    <p>{relationship ? 'Local to this browser tab.' : 'These notes stay in this browser tab. Recorded meeting notes are available in Conversations.'}</p>
    <form className="ca-company-note-form" onSubmit={e => {
    e.preventDefault();
    try { sessionStorage.setItem(storageKey, notes); setStatus('Notes saved for this browser session.'); } catch { setStatus('Browser storage is unavailable.'); }
  }}><label>{relationship ? 'Relationship notes' : 'Working notes'}<textarea rows={relationship ? 5 : 9} placeholder={relationship ? 'Keep a thought for the next conversation…' : undefined} value={notes} onChange={e => { setNotes(e.target.value); setStatus(''); }} /></label><button className="primary">{relationship ? 'Keep notes in this tab' : 'Keep local note'}</button>{status && <p role="status">{status}</p>}</form>{children}</Panel>;
}
function ProviderData({ data, company }: { data: Full360; company: string }) {
  const { firmographics: f, governance: g, esg: e, secFilings } = data;
  return <div className="ca-company-intel">
    <Panel title="Business profile">{f ? <>
      <div className="ca-provider-heading"><strong>ZoomInfo</strong><Badge>{day(f.asOf)}</Badge></div>
      <h3>{company}</h3>
      <div className="ca-profile-stats">
        <div><strong>{f.revenueBand || '—'}</strong><span>Revenue band</span></div>
        <div><strong>{f.employeeBand || '—'}</strong><span>Employees</span></div>
        <div><strong>{f.foundedYear || '—'}</strong><span>Founded</span></div>
      </div>
      <p>{[f.website, f.hq].filter(Boolean).join(' · ')}</p>
      <h4>Technology signals</h4><div className="ca-tech">{f.techStack.length ? f.techStack.map(tech => <Badge key={tech}>{tech}</Badge>) : '—'}</div>
    </> : <p>No ZoomInfo profile returned.</p>}</Panel>
    <Panel title="Governance and leadership">{g ? <>
      <div className="ca-provider-heading"><strong>BoardEx</strong><Badge>{day(g.asOf)}</Badge></div>
      <div className="ca-board-visual" role="img" aria-label={`${g.boardSize} board members`}>
        {Array.from({ length: Math.min(15, g.boardSize || 0) }, (_, index) => <span key={index}>{index === 0 ? '●' : '○'}</span>)}
      </div>
      <h3>{g.governanceRating} governance</h3>
      <p>{g.boardSize} board members · {g.ceoTenureYears} years CEO tenure · {g.boardAvgTenureYears} years average board tenure</p>
      <p>Key director {g.keyDirector || '—'} · {g.interlockCount} interlocks</p>
      <p>Turnover flag: {g.execTurnover ? 'Yes' : 'No'} · event {day(g.recentEventDate)}</p>
    </> : <p>No BoardEx profile returned.</p>}</Panel>
    <Panel title="ESG exposure">{e ? <>
      <div className="ca-provider-heading"><strong>MSCI</strong><Badge>{day(e.asOf)}</Badge></div>
      <div className="ca-esg-rating"><strong>{e.rating}</strong><span>{e.overall}/10 overall score</span></div>
      <div className="ca-esg-bars">{([['Environment', e.environmental], ['Social', e.social], ['Governance', e.governance]] as const)
        .map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, Number(value) * 10))}%` }} /></i>
          <strong>{value ?? '—'}</strong></div>)}</div>
      <p>{e.controversyCount} controversy flags · {e.topControversy || 'No category supplied'}</p>
      <p>Carbon intensity {e.carbonIntensity} tons / $1M revenue · source direction {e.ratingChangeDirection || '—'}</p>
    </> : <p>No MSCI profile returned.</p>}</Panel>
    <Panel title="Regulatory filings">
      {secFilings.flatMap(filing => filing.sections.map(section => <details key={section.id}>
        <summary>{filing.filingType} · {section.section}</summary><p>{section.text}</p><small>Source identifier {section.id}</small>
      </details>))}
      {!secFilings.some(filing => filing.sections.length) && <div className="ca-source-empty"><span aria-hidden="true">⌕</span>
        <h3>No SEC filing match</h3><p>No filings returned for this exact company.</p></div>}
    </Panel>
  </div>;
}


const driverLabel = { credit: 'D&B credit', gong: 'Gong call risk', outlook: 'Moody’s outlook', fees: 'Fee pressure', offer: 'Eligible offer' };
function WhoToCallDrivers({ row }: { row: CommercialWhoToCallRow }) {
  return <>
    <div className="ca-drivers">{row.drivers.map(driver => <div key={driver.driver} data-driver={driver.driver}>
      <span>{driverLabel[driver.driver]}</span><i><b style={{ width: `${Math.min(100, driver.points / .3 * 100)}%` }} /></i>
      <strong>{(driver.points * 100).toFixed(1)} pts</strong>
    </div>)}</div>
    <p className="ca-note">Native weighted contributions are credit 30%, Gong 25%, outlook 10%, fees 20%, and offer 15%. Priority points describe relationship follow-up. Review the original source fields before interpreting the delinquency predictor.</p>
  </>;
}

function CompanyPriority({ owner, accountId, company, fallback, followup }: { owner: string; accountId: string; company: string; fallback?: Signal; followup: Followup }) {
  // The dossier renders only after CRM has verified this Account in the current book.
  const native = useLive(() => fetchCommercialCompanyWhoToCall(owner, accountId), JSON.stringify([owner, accountId]));
  const [inspect, setInspect] = useState(false);
  const row = native.value;
  const detail = row ? [row.paydex == null ? null : `PAYDEX ${row.paydex}`, row.daysBeyond == null ? null : `${row.daysBeyond} supplier days beyond terms`, row.outlook ? `${row.outlook} outlook` : null, row.fees == null ? null : `${row.fees} fee observations`].filter(Boolean).join(' · ') : '';
  const signal = row ? { id: `who-to-call:${accountId}`, accountId, company, family: 'Prioritized relationship', source: 'Commercial Who-to-Call', title: 'Review the relationship', detail } : fallback;
  return <section className="ca-company-focus">
    <h2>Relationship priorities</h2>
    {native.pending && <p role="status">Loading company Who-to-Call evidence…</p>}
    {native.error && <p role="alert">Company Who-to-Call evidence is unavailable.</p>}
    {row ? <><h3>Review the relationship</h3><p>{detail}</p><WhoToCallDrivers row={row} /><Button onClick={() => setInspect(true)}>Inspect recommendation</Button></>
      : !native.pending && (fallback ? <><h3>{fallback.title}</h3><p>{fallback.detail}</p><SignalDetail row={fallback} followup={followup} closeCompany /></>
        : <p>No prioritized company observation returned.</p>)}
    {inspect && signal && row && <Inspect title={`${company} · Commercial Who-to-Call`} onClose={() => setInspect(false)}>
      <Badge>Commercial Who-to-Call</Badge><h2>Review the relationship</h2><p>{detail}</p><WhoToCallDrivers row={row} />
      <dl className="ca-fields"><div><dt>Native priority score</dt><dd>{(row.score * 100).toFixed(1)} points</dd></div>
        <div><dt>D&B supplier tier</dt><dd>{row.tier ?? '—'}</dd></div><div><dt>Gong call sentiment</dt><dd>{row.sentiment ?? '—'}</dd></div>
        <div><dt>Moody’s rating</dt><dd>{row.rating ?? '—'}</dd></div><div><dt>Eligible product identifier</dt><dd>{row.offerCode ?? '—'}</dd></div>
      </dl><SignalDetail row={signal} followup={item => { setInspect(false); followup(item); }} closeCompany />
    </Inspect>}
  </section>;
}

function ShareableSummary({ company, data, close }: { company: string; data: Full360; close: () => void }) {
  const [chosen, setChosen] = useState<string[]>(['Relationship', 'Service and conversations']);
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('');
  const sources = {
    Relationship: data.details.map(r => [r.label, r.value]),
    'Service and conversations': {
      service: data.cases.map(r => [r.number, r.subject, r.status]),
      notes: data.interactions.map(r => [r.when, r.type, r.summary]),
    },
    'Company intelligence': {
      profile: data.firmographics, governance: data.governance, esg: data.esg,
    },
  };
  const generate = async () => {
    setSummary('');
    setStatus('Preparing with Agentforce…');
    const config = await loadCenterConfig('commercial');
    try {
      const result = await generateText({ task: 'freeform', prompt: 'Write a one-page commercial company review. Use only the selected evidence. Preserve source dates and indicate unavailable information.', context: JSON.stringify({ company, sources: Object.fromEntries(Object.entries(sources).filter(([key]) => chosen.includes(key))) }), modelName: config.models.freeform, ...config.params });
      setSummary(result.text.trim());
      setStatus(result.text.trim() ? '' : 'Agentforce summary is unavailable.');
    } catch { setStatus('Agentforce summary is unavailable.'); }
  };
  return <Inspect title={`Build a company tearsheet · ${company}`} onClose={close}>
    <div className="ca-proposal-form">{Object.keys(sources).map(key => <label key={key}><span><input type="checkbox" checked={chosen.includes(key)} onChange={e => setChosen(current => e.target.checked ? [...current, key] : current.filter(r => r !== key))} /> {key}</span></label>)}</div>
    <Button style="primary" onClick={() => void generate()}>Generate tearsheet</Button>
    {status && <p role="status">{status}</p>}
    {summary && <p style={{ whiteSpace: 'pre-wrap' }}>{summary}</p>}
  </Inspect>;
}

export function Company({ drafts, owner, actorScope, accountId, onEdit, followup, draftOffer, revision }: { drafts: Draft[]; owner: string; actorScope: string; accountId: string; onEdit: DraftEditor; followup: Followup; draftOffer: (offer: Offer) => void; revision: number }) {
  const [search, setSearch] = useSearchParams();
  const selected = search.get('tab');
  const tab = tabs.find(([id]) => id === selected)?.[0] ?? 'overview';
  const db = useLive(() => readVisibleAccount(accountId), accountId);
  const account = db.value;
  return <Pending state={db}>{account ? <Dossier drafts={drafts} owner={owner} actorScope={actorScope} account={account} tab={tab} product={search.get('product')} setTab={tab => setSearch(previous => { const next = new URLSearchParams(previous); next.set('tab', tab); return next; })}
    onEdit={onEdit} followup={followup} draftOffer={draftOffer} revision={revision} /> : <Heading title="Company unavailable." action={<RouteLink to="/relationships">Return to companies</RouteLink>}>This account could not be found or accessed in Salesforce.</Heading>}</Pending>;
}
function Dossier({ drafts, owner, actorScope, account, tab, product, setTab, onEdit, followup, draftOffer, revision }: {
  drafts: Draft[]; owner: string; actorScope: string; account: RecordNode; tab: string; product: string | null; setTab: (tab: string) => void; onEdit: DraftEditor; followup: Followup; draftOffer: (offer: Offer) => void; revision: number;
}) {
  const [email, setEmail] = useState(false);
  const [tearsheet, setTearsheet] = useState(false);
  const [brief, setBrief] = useState<{ title: string; value?: string }>();
  const openBrief = (key: 'account' | 'transaction', title: string) => {
    setBrief({ title });
    void runPromptFlow(AGENTFORCE_FLOWS[key], account.Id).then(result => setBrief(current => current?.title === title
      ? { title, value: stripHtml(result) || 'The source returned no summary.' } : current)).catch(() => setBrief(current => current?.title === title
      ? { title, value: 'The Agentforce source is unavailable.' } : current));
  };
  const company = str(account, 'Name');
  const accountId = account.Id;
  const accountOwner = str(account, 'OwnerId') || owner;
  const finance = useLive(() => readCompanyFinance(accountOwner, accountId), JSON.stringify([accountOwner, accountId, revision]));
  const finances = finance.value?.accounts.status === 'fulfilled' ? finance.value.accounts.value : undefined;
  const transactions = finance.value?.positions.status === 'fulfilled' ? finance.value.positions.value.rows : undefined;
  const detail = useLive(() => fetchFull360Real(accountId), accountId);
  const evidence = useLive(() => readSignals(owner), owner);
  const data = detail.value;
  const bookSignals = evidence.value?.rows.filter(row => recordKey(row.accountId) === recordKey(accountId)) ?? [];
  const calls: Signal[] = (data?.callSummaries ?? []).map(call => ({
    id: accountId + ':' + call.id, accountId, company, family: 'Call sentiment', source: 'Gong',
    title: 'Call sentiment · ' + call.sentiment, detail: call.summary, date: call.date,
  }));
  const prospect = useLive(() => readProspectFocus(accountId, company), JSON.stringify([accountId, company]));
  // A prospect's champion move and intent lead the evidence; funding already comes from the book's Harmonic read.
  const prospectEvidence = (prospect.value?.evidence ?? []).filter(p => !bookSignals.some(item => item.source === p.source && item.title === p.title));
  const signals = [...prospectEvidence, ...bookSignals, ...calls.filter(call => !bookSignals.some(item =>
    item.family === call.family && day(item.date) === day(call.date)))];
  const newTask = () => onEdit({ kind: 'task', company, accountId });
  const newMeeting = () => onEdit({ kind: 'meeting', company, accountId });
  const revenue = str(account, 'AnnualRevenue');
  const profileFields = [
    ['Industry', str(account,'Industry') || '—'], ['Annual revenue', revenue && Number.isFinite(Number(revenue)) ? profileCurrency.format(Number(revenue)) : '—'],
    ['Employees', str(account,'NumberOfEmployees') || '—'], ['Phone', str(account,'Phone') || '—'], ['Email', '—'], ['Website', str(account,'Website') || '—'],
  ] as const;
  const notebookKey = `atlas-commercial-notes:${actorScope}:${owner}:${accountId}`;
  const editorial = tab === 'profile' || tab === 'tools';
  const pinKey = `atlas-commercial-pin:${actorScope}:${owner}:${accountId}`;
  const [pinned, setPinned] = useState(() => getCompanyNote(pinKey) === '1');
  const togglePin = () => {
    const next = !pinned;
    try { sessionStorage.setItem(pinKey, next ? '1' : '0'); } catch { /* The pin stays in memory. */ }
    setPinned(next);
  };
  const [inspected, setInspected] = useState<Signal>();
  const renderPacket = (section: PacketSection) => {
    switch (section) {
      case 'Profile': return <RelationshipFacts values={profileFields} />;
      case 'Finances': return <Pending state={finance}>{nodes(finances?.FinancialAccounts).length ?
        nodes(finances?.FinancialAccounts).map(row => <p key={row.Id}>{str(row,'Name')} · {cash(str(row,'FinServ__Balance__c'))}</p>)
        : <p>No financial accounts returned.</p>}</Pending>;
      case 'Goals': return <Pending state={detail}>{data?.financialPlan ?
        <p>{data.financialPlan.status} · {data.financialPlan.goalCount} goals · {cash(data.financialPlan.totalGoalAmount)} target total</p>
        : <p>No provider plan returned.</p>}</Pending>;
      case 'Evidence': return <Pending state={evidence}>{signals.length ? signals.map(row =>
        <p key={row.id}>{row.source} · {row.title}</p>) : <p>No source observations returned.</p>}</Pending>;
      case 'Notebook': return <p>{getCompanyNote(notebookKey) || 'No local note has been kept.'}</p>;
      case 'Screening': return <Pending state={detail}><p>{data?.kyc.riskRating || 'No risk rating returned.'}</p></Pending>;
    }
  };
  return <div className={`ca-root ca-dossier${editorial ? ' ca-dossier-editorial' : ''}`}>
    {editorial ? <div className="ca-relationship-breadcrumb"><RouteLink to="/relationships">Relationships</RouteLink><span aria-hidden="true">/</span><span>{company}</span></div>
      : <RouteLink to="/relationships">All companies</RouteLink>}
    <header className="ca-dossier-head">
      {!editorial && <span className="ca-company-symbol">{initials(company)}</span>}
      <div><h1>{company}</h1><p>{(editorial ? [str(account,'Type'), str(account,'Industry'), str(account,'BillingCity')]
        : [str(account,'Industry'), str(account,'BillingCity'), str(account,'BillingState')]).filter(Boolean).join(' · ')}</p>
        {!editorial && <small>{accountId}</small>}</div>
      <div className="ca-dossier-actions">
        {editorial && <button type="button" className="secondary" aria-pressed={pinned} onClick={togglePin}>{pinned ? 'Unpin relationship' : 'Pin relationship'}</button>}
        <Button style="primary" onClick={() => openBrief('account', 'Prepare company review')}>{editorial ? <>Prepare conversation <ArrowRight size={18} aria-hidden="true" /></> : 'Prepare company review'}</Button>
        <Button onClick={newTask}>{editorial ? 'Create task' : 'Draft task'}</Button>
        {!editorial && <Button onClick={newMeeting}>Plan meeting</Button>}
      </div>
    </header>
    <div className="ca-dossier-tabs" role="tablist" aria-label="Relationship views">
      {(editorial ? relationshipTabs : tabs).map(([id, title]) => <button type="button" key={id} id={`ca-tab-${id}`} aria-controls="ca-company-panel" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{title}</button>)}
    </div>
    <section id="ca-company-panel" className="ca-company-content" data-relationship-tab={tab} role="tabpanel" aria-labelledby={`ca-tab-${tab}`}>
      {tab === 'overview' && <div className="ca-company-overview"><CompanyPriority owner={accountOwner} accountId={accountId} company={company} fallback={prospect.value?.focus ?? signals[0]} followup={followup} />
        <Panel title="Relationship footprint"><Pending state={detail}><div className="ca-company-vitals"><div><strong>{finances?.FinancialAccounts?.totalCount ?? '—'}</strong><span>Financial accounts shown</span></div><div><strong>{finances?.Opportunity?.totalCount ?? '—'}</strong><span>Open deals shown</span></div><div><strong>{evidence.value ? signals.length : '—'}</strong><span>Source observations shown</span></div></div><Button onClick={() => setTab('finances')}>Review cash & accounts</Button></Pending></Panel>
        <Panel title="Company evidence"><Pending state={evidence}><div className="ca-evidence-list">{signals.map(row => <button type="button" className="ca-evidence-row" data-source={row.source} key={row.id} style={{ ['--src' as string]: sourceStyle(row.source).tone }} onClick={() => setInspected(row)}><SourceMark source={row.source} size={20} /><span><small>{row.source} · {row.family}</small><strong>{row.title}</strong>{row.detail && <em>{row.detail}</em>}</span><time>{day(row.date)}</time></button>)}</div>{signals.length === 0 && <p>No additional observations returned for this company.</p>}</Pending></Panel>
        <Panel title="Deal and treasury next steps"><Pending state={finance}>{nodes(finances?.Opportunity).map(o => <RouteLink style="ca-source-row" key={o.Id} to={`/pipeline?deal=${o.Id}`}><strong>{str(o, 'Name')}</strong><span>{str(o, 'StageName')}</span><em>{cash(str(o, 'Amount'))}</em></RouteLink>)}</Pending><Button onClick={() => setTab('growth')}>Review treasury evidence</Button></Panel>
      </div>}
      {tab === 'profile' && <RelationshipProfile name={company} type={str(account, 'Type')} recordId={accountId}
        location={[str(account,'BillingCity'), str(account,'BillingState')].filter(Boolean).join(', ')} fields={profileFields}
        prepare={() => onEdit({ kind: 'task', company, accountId, title: `Review profile changes · ${company}` })}>
        <h3>Work attached to this relationship</h3><div className="ax-context-links">
          <Button onClick={() => setTab('journey')}>Review tasks and cases</Button>
          <Button onClick={() => setTab('tools')}>Notes &amp; review packet</Button>
        </div>
      </RelationshipProfile>}
      {tab === 'finances' && <Pending state={finance}><div className="ca-company-cash"><Panel title="Financial accounts">
        {nodes(finances?.FinancialAccounts).map(r => { const name = str(r, 'Name'); const number = str(r, 'FinServ__FinancialAccountNumber__c');
          return <article className="ca-financial-account" key={r.Id}><div><span className="ca-account-mark">{/Card/i.test(name) ? '▰' : '⇄'}</span><div><h3>{name}</h3><span>{str(r, 'FinServ__Status__c') || 'Status unavailable'}</span></div></div><strong>{cash(str(r, 'FinServ__Balance__c'))}</strong><small>{str(r, 'FinServ__FinancialAccountType__c')} · {number ? `••••${number.slice(-4)}` : r.Id}</small></article>; })}
        {!finances && <p>Financial accounts source is unavailable.</p>}{finances && !nodes(finances.FinancialAccounts).length && <p>No financial accounts returned.</p>}
      </Panel><Panel title="Recent cash activity" action={<Button style="text-button" onClick={() => openBrief('transaction', 'Summarize company cash activity')}>Summarize</Button>}>
        {transactions?.map((r, i) => <div className="ca-transaction" key={`${r.dt}|${r.category}|${r.amount}|${i}`}><span className={(r.kind ?? '').toLowerCase() === 'debit' ? 'debit' : 'credit'}>{(r.kind ?? '').toLowerCase() === 'debit' ? '↗' : '↙'}</span><span><strong>{r.category}</strong><small>{day(r.dt?.slice(0, 10))} · {r.kind}</small></span><strong>{cash(r.amount)}</strong></div>)}
        {!transactions && <p>Cash activity source is unavailable.</p>}{transactions?.length === 0 && <p>No recent transactions returned.</p>}
      </Panel></div></Pending>}
      {tab === 'property' && <Pending state={detail}>{data ? <PropertyTab full={data} /> : <p>No CoreLogic property record available for this company.</p>}</Pending>}
      {tab === 'intel' && <Pending state={detail}>{data && <ProviderData data={data} company={company} />}</Pending>}
      {tab === 'growth' && <CompanyOffers account={account} holdings={nodes(finances?.FinancialAccounts)} opportunities={nodes(finances?.Opportunity)} product={product} draft={draftOffer} />}
      {tab === 'engagement' && <Pending state={detail}><div className="ca-conversation-dossier"><CallRecord accountId={accountId} /><Panel title="Conversations and meeting notes">{data?.interactions.map(row => <article className="ca-conversation-entry" key={row.id}><time>{row.when}</time><h3>{row.type}</h3><p>{row.summary}</p><Button onClick={newTask}>Draft company follow-up</Button></article>)}{data && !data.interactions.length && !data.meetingNotes.length && <p>No conversation or meeting-note rows returned for this company.</p>}{data?.meetingNotes.map(row => <article className="ca-conversation-entry" key={row.id}><time>{row.date}</time><h3>{row.title}</h3><p>{row.body}</p></article>)}</Panel>
        <Panel title="Campaign engagement">{data?.campaigns.map(row => <article className="ca-campaign" key={row.id}><Badge>{row.status}</Badge><h3>{row.name}</h3><p>{row.type} · {row.memberSince}</p></article>)}{data && !data.campaigns.length && <p>No campaign sends returned for this company.</p>}</Panel></div></Pending>}
      {tab === 'journey' && <ActivityContent owner={owner} accountId={accountId} onEdit={onEdit} revision={revision} />}
      {tab === 'notebook' && <Notebook storageKey={notebookKey} />}
      {tab === 'screening' && <><CallRecord accountId={accountId} /><Panel title="Screening evidence"><Pending state={evidence}>{signals.filter(row => row.family === 'Screening change').map(row => <article key={row.id}><h3>{row.title}</h3><p>{row.detail}</p><SignalDetail row={row} followup={followup} closeCompany /></article>)}{!signals.some(row => row.family === 'Screening change') && <p>No qualifying change returned. Review the source screening before drawing a conclusion.</p>}</Pending></Panel></>}
      {tab === 'tools' && <><AfterCall accountId={accountId} /><CallRecord accountId={accountId} /><div className="ca-relationship-tools">
        <Notebook storageKey={notebookKey} relationship>
          <h3 className="ca-note-drafts-heading">Action drafts for this relationship</h3>
          {drafts.some(draft => draft.accountId === accountId) ? drafts.filter(draft => draft.accountId === accountId).map(draft =>
            <button className="ca-source-row" key={draft.id} onClick={() => onEdit(draft)}><strong>{draft.title}</strong><Badge>Local draft</Badge></button>) : <p>No action drafts yet.</p>}
        </Notebook>
        <RelationshipPacket initialSections={['Profile', 'Finances', 'Goals', 'Evidence']} name={company} renderSection={renderPacket} />
        <Panel title="Company tools"><div className="ca-actions"><Button onClick={newTask}>Draft task</Button><Button onClick={newMeeting}>Plan meeting</Button><Button onClick={() => onEdit({ kind: 'case', accountId, company })}>Log service case</Button><Button onClick={() => setEmail(true)}>Draft email</Button><Button onClick={() => openBrief('account', 'Prepare company review')}>Prepare company review</Button>{data && <Button onClick={() => setTearsheet(true)}>Build company tearsheet</Button>}<Button onClick={() => setTab('notebook')}>Open company notebook</Button></div></Panel></div></>}
    </section>
    {tab === 'profile' ? <p className="ax-source">Profile fields come from the Salesforce Account for {company}.</p> :
      !editorial && <p className="ca-note">{company} · Salesforce and Data 360 records for this company.</p>}
    {inspected && <Inspect title={inspected.title} onClose={() => setInspected(undefined)}><SignalDetail row={inspected} followup={followup} closeCompany /></Inspect>}
    {tearsheet && data && <ShareableSummary company={company} data={data} close={() => setTearsheet(false)} />}
    {brief && <Inspect title={brief.title} onClose={() => setBrief(undefined)}><p style={{ whiteSpace: 'pre-wrap' }}>{brief.value ?? 'Preparing with Agentforce…'}</p></Inspect>}
    {email && <EmailModal open clientId={accountId} clientName={company} onClose={() => setEmail(false)} />}
  </div>;
}
