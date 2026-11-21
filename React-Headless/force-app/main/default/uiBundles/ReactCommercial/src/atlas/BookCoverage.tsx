import { atlasChartColors } from '@shared/components/atlas/atlasChartColors';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchFirmographicMix, fetchMarketFootprint, Sparkline } from '@shared';
import { recordKey, str, verifyAccounts } from './commercialData';
import { Button, Inspect, Panel, Pending, RouteLink, useLive } from './controls';
import { CreditCohortInspector } from './CreditCohortInspector';
import type { CreditCohort } from './creditCohorts';

function History({ values, label }: { values?: number[]; label: string }) {
  if (!values || values.length < 2) return null;
  return <figure className="ca-history" aria-label={label}>
    <Sparkline points={values} /><figcaption>{label} · {values[0].toLocaleString()} → {values[values.length - 1].toLocaleString()}</figcaption>
  </figure>;
}

export function BookCoverage({ owner, compact = false }: { owner: string; compact?: boolean }) {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const mix = useLive(() => fetchFirmographicMix(owner, true), owner);
  const footprint = useLive(() => fetchMarketFootprint(owner, true), owner);
  const rows = mix.value?.rows;
  const names = useLive(() => verifyAccounts(owner, !compact && rows ? rows.map(row => row.accountId) : []), JSON.stringify([owner, compact, rows?.map(r => r.accountId)]));
  const [detail, setDetail] = useState<'employees' | 'targets'>();
  const [cohort, setCohort] = useState<CreditCohort>();
  const m = mix.value, f = footprint.value;
  const max = Math.max(1, ...(m?.revenue ?? []).map(r => r.count));
  const market = cohort?.kind === 'market' ? f?.rows.find(r => r.zip === cohort.zip) : undefined;

  return <div className="ca-bottom-band ca-book-coverage" data-focus={compact ? undefined : focus}>
    <Panel title={compact ? 'Growth-tier mix' : 'The businesses in your book'} action={compact && <RouteLink to="/health?focus=growth">Explore growth tiers →</RouteLink>}>
      <Pending state={mix}>{m && <>
        <div className="ca-book-stat"><strong>{m.upmarket.toLocaleString()}</strong><span>$50M+ revenue · {m.total.toLocaleString()} profiled companies</span></div>
        <History values={m.history.trend} label="Upmarket companies by period" />
        {!compact && <>
          <div className="ca-revenue-mix">{m.revenue.map((row, index) => <button key={row.band} className={['$50M-$200M', '$200M-$1B', '$1B+'].includes(row.band) ? 'ca-upmarket-band' : undefined} onClick={() => setCohort({ kind: 'revenue', band: row.band, observationCount: row.count })}>
            <span>{row.band}</span><i style={{ background: atlasChartColors[index % atlasChartColors.length], width: `${Math.max(2, row.count / max * 65)}%` }} /><strong>{row.count.toLocaleString()}</strong></button>)}</div>
          <div className="ca-actions"><Button onClick={() => setDetail('employees')}>Employee mix</Button><Button onClick={() => setDetail('targets')}>Treasury conversations</Button></div>
          {detail && <Inspect title={detail === 'employees' ? 'Employee mix' : 'Upmarket treasury conversations'} onClose={() => setDetail(undefined)}>
            {detail === 'employees' ? <dl className="ca-book-distribution">{m.employees.map(row => <div key={row.band}><dt>{row.band} employees</dt><dd>{row.count.toLocaleString()}</dd></div>)}</dl>
          : <Pending state={names}><div className="ca-target-list">{m.rows.map(row => {
            const company = names.value?.get(recordKey(row.accountId));
            return company && <RouteLink key={row.accountId} to={'/client/' + company.Id} style="ca-company-target"><strong>{str(company, 'Name')}</strong><small>{row.revenueBand} · {row.pitch || row.tech.join(', ') || 'No tech-stack signal'}</small></RouteLink>;
          })}</div>{!names.value?.size && <p>{m.rows.length ? 'No matching company accounts are visible in this book.' : 'No qualifying upmarket companies in this book.'}</p>}</Pending>}
          </Inspect>}
        </>}
      </>}</Pending>
    </Panel>
    <Panel title={compact ? 'Branch & market footprint' : 'Market footprint'} action={compact && <RouteLink to="/health?focus=market">Explore branch exposure →</RouteLink>}>
      <Pending state={footprint}>{f && <>
        <div className="ca-book-stat"><strong>{f.consolidate.toLocaleString()}</strong><span>clients near a branch flagged Consolidate · {f.clients.toLocaleString()} clients in {f.zips.toLocaleString()} profiled ZIPs</span></div>
        <History values={f.history.trend} label="Clients near Consolidate branches by period" />
        {!compact && <><dl className="ca-book-distribution">
          <div><dt>Clients in affluent markets (wealth index ≥120)</dt><dd>{f.affluent.toLocaleString()}</dd></div>
          <div><dt>Average wealth index</dt><dd>{f.clients ? Math.round(f.avgWealthIndex) : '—'}</dd></div>
          <div><dt>Average foot traffic</dt><dd>{f.clients ? Math.round(f.avgFootTraffic) : '—'}</dd></div>
          <div><dt>Average distance to nearest branch</dt><dd>{f.clients ? f.avgDistanceMi.toFixed(1) + ' mi' : '—'}</dd></div>
        </dl><div className="ca-market-grid">{f.rows.map(r => <button key={r.zip} onClick={() => setCohort({ kind: 'market', zip: r.zip, observationCount: r.clients })}><strong>{r.zip} · {r.state}</strong><span>{r.clients} companies · {r.recommendation}</span><small>{r.tapestry} · {r.wealthIndex} wealth index · {Math.round(r.footTraffic)} foot traffic · {r.distanceMi.toFixed(1)} mi</small></button>)}</div>{!f.rows.length && <p>No market footprint profiles returned.</p>}</>}
      </>}</Pending>
    </Panel>
    {cohort && <CreditCohortInspector owner={owner} cohort={cohort} onClose={() => setCohort(undefined)}>
      {market && <><h2>{market.recommendation}</h2><p>{market.state} · {market.tapestry}</p><p>Wealth index {market.wealthIndex} · foot traffic {Math.round(market.footTraffic)} · branch distance {market.distanceMi.toFixed(1)} mi.</p></>}
    </CreditCohortInspector>}
  </div>;
}
