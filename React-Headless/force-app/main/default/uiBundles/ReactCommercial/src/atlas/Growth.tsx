import { atlasProbabilityBand } from '@shared/components/atlas/atlasChartColors';
import { CrossSellWhitespace } from '@shared/components/home/CrossSellWhitespace';
import { useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { fetchModeledUplift, fetchOwnerWealthHandoffs, fetchWarmIntros, fetchWhitespace, LeadModal } from '@shared';
import type { WhitespaceCell } from '@shared/data/whitespace';
import { nodes, readLeads, recordKey, str, verifyAccounts } from './commercialData';
import { Badge, Button, cash, day, Heading, initials, Inspect, Panel, Pending, RouteLink, Tabs, useLive } from './controls';
import type { Followup } from './TodayIntel';

const modes = [['lanes', 'Treasury plays'], ['coverage', 'Coverage matrix'], ['offers', 'Offer opportunities'], ['development', 'Leads & owner introductions']] as const;
export type Offer = WhitespaceCell & { accountId: string; company: string; product: string; rank?: number; openDeal?: string };
export function OfferCard({ offer, onClose, draft, company = true }: { offer: Offer; onClose: () => void; draft: (offer: Offer) => void; company?: boolean }) {
  const history = offer.history ?? [];
  return <Inspect title={`${offer.product} · ${offer.company}`} onClose={onClose}><div className="ca-offer-detail">
    <div className="ca-offer-vitals"><div><strong>{offer.score == null ? '—' : `${offer.score.toFixed(1)}%`}</strong><span>Modeled conversion</span></div><div><strong>{cash(offer.estValue)}</strong><span>Expected value uplift</span></div><div><strong>{offer.rank == null ? '—' : `#${offer.rank}`}</strong><span>Eligible model rank</span></div></div>
    <h3>Follow the same product through the relationship.</h3><p>{offer.reason}</p><p>{offer.action}</p>
    {history.length > 1 ? <div className="ca-offer-history"><svg viewBox="0 0 600 145" role="img" aria-label="Monthly modeled conversion probabilities">
      <polyline points={history.map((p, i) => `${30 + i / (history.length - 1) * 540},${120 - p.score}`).join(' ')} fill="none" stroke="var(--m-accent)" strokeWidth="3" />
      {history.map((p, i) => <g key={p.month}><circle cx={30 + i / (history.length - 1) * 540} cy={120 - p.score} r="5" fill="var(--m-accent)" /><text x={30 + i / (history.length - 1) * 540} y="140" textAnchor="middle">{p.month.slice(0, 7)}</text></g>)}
    </svg><p>{offer.moved == null ? '—' : offer.moved.toFixed(2)} conversion-point change · {cash(offer.evMoved)} expected-value change</p></div> : <p className="ca-unavailable">No monthly history returned for this company and product.</p>}
    <div className="ca-actions">{offer.owned ? <Badge>Open holding</Badge> : offer.inPipeline ? <RouteLink to={offer.openDeal ? `/pipeline?deal=${offer.openDeal}` : '/pipeline'}>Review open opportunities</RouteLink> : <Button style="primary" onClick={() => { onClose(); draft(offer); }}>Review opportunity proposal</Button>}
      {company && <RouteLink to={`/client/${offer.accountId}?tab=growth&product=${encodeURIComponent(offer.code ?? '')}`}>Open company growth</RouteLink>}
    </div>
  </div></Inspect>;
}

function Introductions({ owner, followup, newLead }: { owner: string; followup: Followup; newLead: () => void }) {
  const [lead, setLead] = useState<ReturnType<typeof nodes>[number]>();
  const [edit, setEdit] = useState(false);
  const [revision, setRevision] = useState(0);
  const db = useLive(async () => {
    const [leads, warm, wealth] = await Promise.allSettled([readLeads(owner), fetchWarmIntros(owner, true), fetchOwnerWealthHandoffs(owner, true)]);
    const intros = warm.status === 'fulfilled' ? warm.value.rows : [];
    const handoffs = wealth.status === 'fulfilled' ? wealth.value.rows : [];
    const accounts = await verifyAccounts(owner, [...intros.map(r => r.referrerId), ...handoffs.map(r => r.businessId)]);
    return { leads, warm, wealth, intros, handoffs, accounts };
  }, JSON.stringify([owner, revision]));
  const result = db.value;
  return <section className="ca-development"><div className="ca-origination-head"><div><h2>Origination desk</h2><p>Existing CRM leads alongside suggested owner introductions.</p></div><Button style="primary" onClick={newLead}>Create lead proposal</Button></div>
    <Pending state={db}><div className="ca-development-grid"><section className="ca-lead-inbox"><h3>CRM leads</h3>
      {result?.leads.status === 'fulfilled' ? nodes(result.leads.value.Lead).map(r => <button key={r.Id} onClick={() => setLead(r)}><span className="ca-person-symbol">{initials(str(r, 'Name'))}</span><span><strong>{str(r, 'Name')}</strong><small>{str(r, 'Company')}</small><span><Badge>{str(r, 'Status')}</Badge> {str(r, 'LeadSource')}</span></span></button>) : <p>CRM leads unavailable.</p>}
    </section><section className="ca-handoff-inbox"><section className="ca-warm-intros"><h3>Suggested warm introductions</h3>
      {result?.warm.status === 'rejected' && <p>Referral source unavailable.</p>}
      {result?.intros.map(r => { const a = result.accounts.get(recordKey(r.referrerId)); return a && <article key={`${r.referrerId}|${r.accountId}`}><div><span>{str(a, 'Name')}</span><i>→</i><strong>{r.name}</strong></div><p>{r.confidencePct}% graph confidence · discovered {day(r.discovered)}</p><Button onClick={() => followup({ id: r.accountId, accountId: a.Id, company: str(a, 'Name'), title: `Review referral to ${r.name}`, source: 'Data 360 relationship graph', detail: `Referral target Account ${r.accountId}. Verify the referring person and recipient before contact.`, family: 'Warm introductions' })}>Review referral proposal</Button></article>; })}
    </section><h3>Owners to consider for a Wealth introduction</h3>
      {result?.wealth.status === 'rejected' && <p>Owner relationship source unavailable.</p>}
      {result?.handoffs.map(r => { const a = result.accounts.get(recordKey(r.businessId)); return a && <article className="ca-handoff" key={`${r.businessId}|${r.ownerId}`}><div className="ca-directed-graph"><RouteLink to={`/client/${a.Id}`}><span className="ca-company-symbol">{initials(str(a, 'Name'))}</span><strong>{str(a, 'Name')}</strong></RouteLink><span>Owned by<br />→</span><div><span className="ca-person-symbol">{initials(r.ownerName)}</span><strong>{r.ownerName}</strong></div></div><p>{r.netWorthBand} · {r.wealthScore} Wealth propensity</p><small>{r.confidencePct}% graph relationship confidence.</small><Button onClick={() => followup({ id: r.ownerId, accountId: a.Id, company: str(a, 'Name'), title: `Review Wealth introduction for ${r.ownerName}`, source: 'Data 360 relationship graph', detail: `Business Account ${a.Id}. Target person Account ${r.ownerId}. Verify permission to contact the owner.`, family: 'Owner handoffs' })}>Review introduction proposal</Button></article>; })}
    </section></div></Pending>
    {lead && !edit && <Inspect title={str(lead, 'Name')} onClose={() => setLead(undefined)}><p>{str(lead, 'Company')}</p><p>{str(lead, 'Status')} · {str(lead, 'LeadSource')}</p><p>{lead.Id}</p><Button style="primary" onClick={() => setEdit(true)}>Review lead change</Button></Inspect>}
    {lead && edit && <LeadModal open onClose={() => { setEdit(false); setLead(undefined); }} onSaved={() => setRevision(r => r + 1)} lead={{
      recordId: lead.Id, firstName: str(lead, 'FirstName'), lastName: str(lead, 'LastName'), company: str(lead, 'Company'),
      status: str(lead, 'Status'), leadSource: str(lead, 'LeadSource'), email: str(lead, 'Email'),
      annualRevenue: str(lead, 'AnnualRevenue') ? Number(str(lead, 'AnnualRevenue')) : undefined,
    }} />}
  </section>;
}

function useOfferBook(owner: string) {
  const live = useLive(async () => {
    const result = await fetchWhitespace('commercial', owner, true);
    const accounts = await verifyAccounts(owner, [...result.clients.map(r => r.id), ...(result.movers ?? []).map(r => r.clientId)]);
    return {
      ...result,
      clients: result.clients.flatMap(r => { const a = accounts.get(recordKey(r.id)); return a ? [{ ...r, id: a.Id, name: str(a, 'Name') }] : []; }),
      movers: (result.movers ?? []).filter(r => accounts.has(recordKey(r.clientId))),
    };
  }, owner);
  const data = live.value;
  const offers = (data?.clients ?? []).flatMap(c => (data?.products ?? []).flatMap(p => {
    const cell = c.cells[p.key];
    return cell && cell.score != null && !cell.owned ? [{ ...cell, company: c.name, accountId: c.id, product: p.label }] : [];
  })).sort((a, b) => (b.estValue ?? 0) - (a.estValue ?? 0));
  return { live, data, offers };
}

export function TodayOffers({ owner, draft }: { owner: string; draft: (offer: Offer) => void }) {
  return <OfferLedger book={useOfferBook(owner)} draft={draft} today />;
}
function OfferLedger({ book, draft, today = false }: { book: ReturnType<typeof useOfferBook>; draft: (offer: Offer) => void; today?: boolean }) {
  const { live, data, offers } = book;
  const [view, setView] = useState<'rising' | 'falling' | 'all'>('rising');
  const [limit, setLimit] = useState(5);
  const [selected, setSelected] = useState<Offer>();
  const list: Offer[] = view === 'all' ? offers.filter(o => o.recommendationRank != null && (o.estValue ?? 0) > 0)
    : [...offers, ...(data?.movers ?? []).map(m => ({ ...m, company: m.clientName, accountId: m.clientId, product: m.productLabel, owned: false }))]
      .filter((o,index,rows) => rows.findIndex(r => recordKey(r.accountId) === recordKey(o.accountId) && r.code === o.code) === index)
      .filter(o => view === 'rising' ? (o.evMoved ?? 0) > 0 : (o.evMoved ?? 0) < 0)
      .sort((a,b) => Math.abs(b.evMoved ?? 0) - Math.abs(a.evMoved ?? 0));
  return <Panel title={today ? "Offers across the book" : "Offer opportunities"} action={today && <RouteLink to="/growth?view=offers">Open treasury &amp; origination</RouteLink>}>
    <div className="cr-switch" role="group">{([['rising','Rising'],['falling','Falling'],['all','Eligible offers']] as const).map(([id,label]) => <button key={id} aria-pressed={view===id} onClick={() => { setView(id); setLimit(5); }}>{label}</button>)}</div>
    <Pending state={live}><div className="cr-offer-list">{list.slice(0,limit).map(o =>
      <button key={o.accountId+'|'+o.code} onClick={() => setSelected({ ...o, rank: o.recommendationRank })}>
        <span><strong>{o.company}</strong><small>{o.code === 'BIZ-CRE' ? 'Commercial Real Estate' : o.product}</small></span><b>{view !== 'all' && (o.evMoved ?? 0)>0 ? '+' : ''}{cash(view === 'all' ? o.estValue : o.evMoved)}<small>{view === 'all' ? 'expected value' : 'value change'}</small></b><i aria-hidden="true">↗</i>
      </button>)}</div>
      <div className="cr-work-footer"><span>{Math.min(limit,list.length)} of {list.length} offers</span>{list.length > limit && <Button style="text-button" onClick={() => setLimit(limit+10)}>Show more</Button>}</div>
    </Pending>
    {selected && <OfferCard offer={selected} draft={draft} onClose={() => setSelected(undefined)} />}
  </Panel>;
}

export function Growth({ owner, draft, followup, newLead }: { owner: string; draft: (offer: Offer) => void; followup: Followup; newLead: () => void }) {
  const [search, setSearch] = useSearchParams();
  const mode = modes.find(([id]) => id === search.get('view'))?.[0] ?? 'lanes';
  const setMode = (value: typeof mode) => setSearch(previous => {
    const next = new URLSearchParams(previous);
    if (value === 'lanes') next.delete('view'); else next.set('view', value);
    return next;
  });
  const [product, setProduct] = useState(() => window.innerWidth < 800 ? 'tm' : 'all');
  const [selected, setSelected] = useState<Offer>();
  const book = useOfferBook(owner);
  const { live, data, offers } = book;
  const uplift = useLive(() => fetchModeledUplift(owner,'commercial',true),owner);
  const products = data?.products.filter(r => product === 'all' || r.key === product) ?? [];
  const eligible = offers.filter(o => o.recommendationRank != null && (o.estValue ?? 0) > 0).slice(0, 4);
  const lanes = [
    ['Operate', 'Make money movement work harder.', 'Settlement & controls', /BIZ-CHK|BIZ-TM-(ACH|RDC|PP)|BIZ-CARD/],
    ['Optimize cash', 'Put surplus cash to work.', 'Liquidity & yield', /BIZ-TM-SWP/],
    ['Fund growth', 'Structure the next chapter.', 'Working capital & assets', /BIZ-(LOC|TL|CRE|EQF|SBA)/],
  ] as const;
  return <><Heading title="Treasury and origination" action={<Button style="primary" onClick={newLead}>New lead proposal</Button>}>Review operating cash, liquidity and financing needs. Origination stays attached to the company and the people behind it.</Heading>
    <div className="ca-growth-toolbar"><Tabs choices={modes} value={mode} onChange={setMode} /><div className="ca-outcomes"><span><strong>{cash(uplift.value?.total)}</strong> modeled uplift</span><span><strong>{data?.stats?.open ?? '—'}</strong> source grid opportunities</span><span><strong>{data?.stats?.won30 ?? '—'}</strong> won in 30 days</span></div></div>
    {mode === 'development' ? <Introductions owner={owner} followup={followup} newLead={newLead} /> : <Pending state={live}>{mode === 'offers' ?
      <><OfferLedger book={book} draft={draft} /><details className="ca-offer-table"><summary>Full offer detail table</summary><CrossSellWhitespace data={data ?? null} onPropose={row => draft({
        accountId: row.clientId, company: row.clientName, product: row.productLabel, code: row.code,
        estValue: row.estValue, reason: row.reason, action: row.action, owned: false,
      })} /></details></> : mode === 'coverage' ?
      <section className="cs-coverage"><header className="cs-section-head"><div><span className="cs-eyebrow">RELATIONSHIP DEPTH / NATIVE MODEL</span><h2>Treasury opportunities</h2><p>Read across a company. Follow a product into its evidence.</p></div><label>Product lens<select value={product} onChange={e => setProduct(e.target.value)}><option value="all">All products</option>{data?.products.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label></header>
        <div className="cs-legend"><span>Modeled conversion</span><i /><span>0–100%</span><b>✓ Owned</b><span>— No evidence returned</span></div>
        <div className="cs-matrix" style={{ '--cs-cols': products.length } as CSSProperties}><div className="cs-matrix-head"><strong>Company</strong>{products.map(p => <span key={p.key}>{p.label}</span>)}</div>
          {data?.clients.map(c => <div className="cs-matrix-row" key={c.id}><RouteLink style="cs-company" to={`/client/${c.id}`}><span>{initials(c.name)}</span><strong>{c.name}<small>{c.cells.ccard?.owned ? 'Corporate Card holder' : 'Eligible-value selection'}</small></strong></RouteLink>
            {products.map(p => { const cell = c.cells[p.key]; return cell?.owned
              ? <span key={p.key} className="cs-cell cs-owned"><small>{p.label}</small><b>✓</b><em>Owned</em></span>
              : cell?.score != null ? <button key={p.key} className="cs-cell cs-score" data-score-band={atlasProbabilityBand(cell.score)} onClick={() => setSelected({ ...cell, accountId: c.id, company: c.name, product: p.label })}><small>{p.label}</small><b>{cell.score.toFixed(1)}<em>%</em></b><span>{cash(cell.estValue)} EV</span></button>
              : <span key={p.key} className="cs-cell cs-unknown"><small>{p.label}</small><b>—</b><em>No evidence</em></span>; })}
          </div>)}</div><p className="cs-caption">The matrix shows {data?.clients.length ?? 0} companies selected by eligible value and Corporate Card holdings. Owned cells come from CRM holdings. Scored cells show modeled conversion and expected value.</p>{!data?.clients.length && <p>No eligible treasury evidence returned for this book.</p>}
      </section>
      : <><div className="ca-treasury-map"><div className="ca-treasury-path"><span>Receivables</span><i /><span>Operating cash</span><i /><span>Liquidity reserve</span><i /><span>Fund the next move</span></div><div className="ca-treasury-lanes">
        {lanes.map(([title, subtitle, label, codes], i) => <section className="ca-treasury-lane" data-lane={title} key={title}><div className={`ca-lane-graphic ca-lane-${i}`} aria-hidden="true">{i === 0 ? <><span>←</span><b>Cash</b><span>→</span></> : <><i /><i /><i />{i === 1 ? <b>↗</b> : <i />}</>}</div><header><span>{label}</span><h2>{title}</h2><p>{subtitle}</p></header>
          {offers.filter(o => codes.test(o.code ?? '')).slice(0, 4).map(o => <button key={`${o.accountId}|${o.code}`} onClick={() => setSelected(o)}><strong>{o.company}</strong><span>{o.product}</span><small>{o.score?.toFixed(1)}% modeled conversion · {cash(o.estValue)} EV</small></button>)}</section>)}
      </div></div>
      <Panel title="Moves across the book"><div className="ca-movers">{[true, false].map(rising => <section data-movement={rising ? 'gain' : 'loss'} key={String(rising)}><h3>{rising ? 'Gaining value' : 'Losing value'}</h3>
        {data?.movers.filter(m => rising ? m.evMoved > 0 : m.evMoved < 0).slice(0, 4).map(m => <button key={`${m.clientId}|${m.code}`} onClick={() => setSelected({ ...m, accountId: m.clientId, company: m.clientName, product: m.productLabel, owned: false })}><span>{rising ? '↗' : '↘'}</span><strong>{m.clientName}</strong><small>{m.productLabel}</small><em>{cash(m.evMoved)} EV</em></button>)}</section>)}
        <section data-movement="eligible"><h3>Eligible offers</h3>{eligible.length ? eligible.map(o =>
          <button key={`${o.accountId}|${o.code}`} onClick={() => setSelected({ ...o, rank: o.recommendationRank })}><span aria-hidden="true">◇</span><strong>{o.company}</strong><small>{o.product}</small><em>{cash(o.estValue)} EV</em></button>
        ) : <p>No eligible offers returned.</p>}</section></div></Panel>
      <Panel title="Commercial leads and referrals"><div className="ca-development-preview"><div><h2>Business-owner introductions</h2><p>Review Salesforce leads and owner-to-Wealth handoffs.</p></div><Button style="primary" onClick={() => setMode('development')}>Open origination desk</Button></div></Panel></>}</Pending>}
    {selected && <OfferCard offer={selected} onClose={() => setSelected(undefined)} draft={draft} />}
  </>;
}
