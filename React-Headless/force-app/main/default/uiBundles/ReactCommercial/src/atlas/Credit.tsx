import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookCoverage } from './BookCoverage';
import { readBookAccountCount, readCredit, readPaymentBands, recordKey, str, verifyAccounts } from './commercialData';
import { Badge, Button, day, Heading, Inspect, Panel, Pending, RouteLink, useLive } from './controls';
import { readSignals, type Signal } from './signals';
import { CreditCohortInspector } from './CreditCohortInspector';
import type { CreditCohort } from './creditCohorts';
import { SignalDetail, type Followup } from './TodayIntel';

const colors = ['var(--brand-plot,#679994)', 'var(--brand-mid,#87a7b5)', '#c39968', '#ad7470'];
const asNumber = (value: number | string | null | undefined) => value == null || value === '' || !Number.isFinite(Number(value))
  ? null : Number(value);
const decimal = (value: number | null, fallback = '—') => value == null ? fallback : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export function Credit({ owner, followup }: { owner: string; followup: Followup }) {
  const [band, setBand] = useState('');
  const [selected, setSelected] = useState('');
  const [watchItem, setWatchItem] = useState<Signal>();
  const accountCount = useLive(() => readBookAccountCount(owner), owner);
  const summary = useLive(() => readPaymentBands(owner), owner);
  const signals = useLive(() => readSignals(owner), owner);
  const evidence = useLive(async () => {
    const r = await readCredit(owner, band);
    const accounts = await verifyAccounts(owner, r.rows.map(a => a.account_id));
    return r.rows.flatMap(a => {
      const record = accounts.get(recordKey(a.account_id));
      return record ? [{
        ...a, id: record.Id, company: str(record, 'Name'),
        paydex: asNumber(a.paydex), days_beyond: asNumber(a.days_beyond),
        failure: asNumber(a.failure), delinquency: asNumber(a.delinquency),
      }] : [];
    });
  }, JSON.stringify([owner, band]));
  const [params] = useSearchParams();
  const coverageFirst = ['market', 'growth'].includes(params.get('focus') ?? '');
  const [cohort, setCohort] = useState<CreditCohort | undefined>(() => params.get('focus') === 'watch' ? { kind: 'supplier', band: '', watch: true } : undefined);
  const bands = [...(summary.value?.rows ?? [])].sort((a, b) => Number(a.paydex) - Number(b.paydex));
  const bandColor = (i: number) => colors[Math.max(0, colors.length - 1 - i)];
  const totalObservations = summary.value ? bands.reduce((n, r) => n + Number(r.cnt), 0) : undefined;
  const filteredObservationCount = summary.value ? bands.reduce((n, r) => n + (!band || r.band === band ? Number(r.cnt) : 0), 0) : undefined;
  const rows = evidence.value ?? [];
  const chosen = rows.find(r => r.id === selected) ?? rows[0];
  const maxDays = Math.max(60, ...rows.map(r => Number(r.days_beyond)));
  const watch = signals.value?.rows.filter(r => ['Credit outlook', 'Leadership', 'ESG Downgrade', 'ESG Upgrade'].includes(r.family)) ?? [];
  return <><Heading title="Credit risk and market coverage">Supplier-payment observations, rating outlooks and market context. {totalObservations != null && accountCount.value != null && `The latest D&B profile covers ${totalObservations.toLocaleString()} of ${accountCount.value.toLocaleString()} Accounts in your book.`}</Heading>
    {coverageFirst && <BookCoverage owner={owner} />}
    <section className="cs-credit">
      <div className="cs-section-head"><div><span className="cs-eyebrow">SUPPLIER PAYMENT LANDSCAPE</span><h2>Company credit exposure</h2><p>Business-credit observations, separate from loan delinquency.</p></div><div className="cs-source-count"><strong>{totalObservations?.toLocaleString() ?? '—'}</strong><span>profiled companies{accountCount.value != null && ` / ${accountCount.value.toLocaleString()} Accounts in book`}</span></div></div>
      <Pending state={summary}><div className="cs-distribution" aria-label="Supplier payment distribution">{bands.map((item, i) => <button key={item.band} style={{ flex: Number(item.cnt), background: bandColor(i) }} aria-label={`${item.band}, ${item.cnt} companies`} onClick={() => setBand(item.band)} />)}</div>
      <div className="cs-band-legend"><button onClick={() => setBand('')} aria-pressed={!band}>All bands</button>{bands.map((item, i) => <button key={item.band} onClick={() => setBand(item.band)} aria-pressed={band === item.band}><i style={{ background: bandColor(i) }} /><span>{item.band}<strong>{Number(item.cnt).toLocaleString()}</strong><small>Mean PAYDEX {item.paydex == null ? '—' : Number(item.paydex).toFixed(1)}</small></span></button>)}</div></Pending>
      <Pending state={evidence}><div className="cs-credit-desk"><div className="cs-landscape"><div className="cs-chart-label"><strong>PAYDEX × supplier days beyond terms</strong><span>{rows.length} company observations plotted</span></div>
        <svg viewBox="0 0 640 285" role="group" aria-label="Company PAYDEX against supplier days beyond terms"><rect x="65" y="20" width="535" height="205" rx="6" fill="var(--brand-well,#f1f6f4)" />
          {[0, 25, 50, 75, 100].map(n => <g key={n}><line x1={65 + n * 5.35} y1="20" x2={65 + n * 5.35} y2="225" stroke="var(--brand-line,#d9e4e2)" /><text x={65 + n * 5.35} y="248" textAnchor="middle">{n}</text></g>)}
          {[0, .25, .5, .75, 1].map(n => <g key={n}><line x1="65" y1={225 - n * 205} x2="600" y2={225 - n * 205} stroke="var(--brand-line,#d9e4e2)" /><text x="50" y={230 - n * 205} textAnchor="end">{Math.round(n * maxDays)}</text></g>)}
          <text x="330" y="276" textAnchor="middle">PAYDEX score →</text><text x="15" y="130" transform="rotate(-90 15 130)" textAnchor="middle">Supplier days beyond terms</text>
          {rows.filter(r => r.paydex != null && r.days_beyond != null).map(r => <a href="#commercial-credit" key={r.id} aria-label={`${r.company}, PAYDEX ${r.paydex}, ${r.days_beyond} supplier days`} onClick={event => { event.preventDefault(); setSelected(r.id); }}><circle cx={65 + Number(r.paydex) * 5.35} cy={225 - Math.max(0, Number(r.days_beyond)) / maxDays * 205} r={chosen?.id === r.id ? 11 : 7} fill={chosen?.id === r.id ? '#173e4e' : '#45968f'} stroke="white" strokeWidth="2" /></a>)}
        </svg><p className="cs-caption">Select a plotted company or choose one below. Source period {day(bands[0]?.as_of?.slice(0, 10))}.</p><Button style="text-button" onClick={() => setCohort({ kind: 'supplier', band, observationCount: filteredObservationCount })}>Review companies in {band ? 'this band' : 'all bands'}</Button>
      </div><article className="cs-credit-focus" id="commercial-credit">{chosen ? <><span className="cs-eyebrow">COMPANY UNDER THE LENS</span><h3>{chosen.company}</h3>
        <div className="cs-gauges"><div><strong>{decimal(chosen.paydex)}</strong><span>PAYDEX</span></div><div><strong>{decimal(chosen.days_beyond)}</strong><span>supplier days</span></div></div>
        <p>{chosen.tier ?? 'Credit tier unavailable'}</p><dl><div><dt>Failure score</dt><dd>{decimal(chosen.failure, 'Unavailable')}</dd></div><div><dt>Raw delinquency predictor</dt><dd>{decimal(chosen.delinquency, 'Unavailable')}</dd></div></dl>
        <RouteLink style="primary" to={`/client/${chosen.id}`}>Open company dossier →</RouteLink></> : <h3>No company observations returned for this band.</h3>}</article></div>
      <div className="cs-company-picker" aria-label="Companies">{rows.map(r => <button key={r.id} aria-pressed={chosen?.id === r.id} onClick={() => setSelected(r.id)}><strong>{r.company}</strong><span>PAYDEX {decimal(r.paydex)} · {decimal(r.days_beyond)} days</span></button>)}</div></Pending>
    </section>
    <div className="ca-health-grid cs-watch-band"><Panel title="Agency and leadership watch"><Pending state={signals}><div className="ca-watch-list">{watch.slice(0, 7).map(row => <button key={row.id} onClick={() => setWatchItem(row)}><Badge>{row.source}</Badge><strong>{row.company}</strong><span>{row.title}</span></button>)}{watch.length === 0 && <p>No qualifying observations returned.</p>}</div></Pending></Panel></div>
    {!coverageFirst && <BookCoverage owner={owner} />}
    {watchItem && <Inspect title={`${watchItem.company} · ${watchItem.source}`} onClose={() => setWatchItem(undefined)}>
      <Badge>{watchItem.family}</Badge><h2>{watchItem.title}</h2><p>{watchItem.detail}</p><p>{day(watchItem.date)}</p>
      <SignalDetail row={watchItem} followup={row => { setWatchItem(undefined); followup(row); }} />
    </Inspect>}
    {cohort && <CreditCohortInspector owner={owner} cohort={cohort} onClose={() => setCohort(undefined)} />}
  </>;
}
