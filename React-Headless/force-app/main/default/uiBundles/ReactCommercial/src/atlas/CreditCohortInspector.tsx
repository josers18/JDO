import { useState, type ReactNode } from 'react';
import { Button, day, Inspect, Pending, RouteLink, useLive } from './controls';
import { readCreditCohort, type CreditCohort } from './creditCohorts';

const displayScore = (value?: string | number | null) => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const columns = {
  supplier: ['PAYDEX', 'Days beyond terms', 'Supplier tier', 'Failure score', 'Raw delinquency predictor'],
  revenue: ['Employee band', 'NAICS', 'Headquarters state'],
  market: ['Billing location'],
};
export function CreditCohortInspector({ owner, cohort, onClose, children }: {
  owner: string; cohort: CreditCohort; onClose: () => void; children?: ReactNode;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const data = useLive(() => readCreditCohort(owner, cohort, cursor), JSON.stringify([owner, cohort, cursor, attempt]));
  const title = cohort.kind === 'supplier' ? (cohort.watch ? 'Credit Watch companies' : cohort.band || 'All supplier payment bands')
    : cohort.kind === 'revenue' ? `${cohort.band} revenue cohort` : `Market ${cohort.zip}`;
  const rows = data.value?.rows ?? [];
  return <Inspect title={title} onClose={onClose}>
    {children}
    {cohort.observationCount != null && <p>{cohort.observationCount.toLocaleString()} source observations in the selected book.</p>}
    <p>Company Accounts are verified against Salesforce ownership. Source counts can include records without a currently visible matching company.</p>
    {data.error ? <div role="alert"><p>Could not load company membership for this cohort. Retry the same book and filter.</p><Button onClick={() => setAttempt(value => value + 1)}>Retry</Button></div> : <Pending state={data}>
      {data.value?.period && <p className="ca-note">Source period {day(data.value.period.slice(0, 10))}</p>}
      <div className="ca-coverage-scroll ca-cohort-table" tabIndex={0} aria-label="Cohort constituents">
        <table><thead><tr><th scope="col">Company</th>{columns[cohort.kind].map(head => <th key={head} scope="col">{head}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => {
            const details = cohort.kind === 'supplier' ? [displayScore(row.paydex), displayScore(row.days_beyond), row.tier, displayScore(row.failure), displayScore(row.delinquency)]
              : cohort.kind === 'revenue' ? [row.employee_band, row.naics, row.state] : [row.location];
            return <tr key={`${row.id}|${index}`}><th scope="row"><RouteLink to={`/client/${row.id}`}>{row.name}</RouteLink><small>{row.industry}</small></th>
              {details.map((value, i) => <td key={columns[cohort.kind][i]}>{value || '—'}</td>)}</tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p>No visible company Accounts matched on this page.</p>}
    </Pending>}
    {Boolean(cursors.length || data.value?.next) && <div className="ca-actions">
      {cursors.length > 0 && <Button onClick={() => setCursors(list => list.slice(0, -1))}>Previous page</Button>}
      <span>Page {cursors.length + 1}</span>
      {data.value?.next && <Button onClick={() => { const next = data.value?.next; if (next) setCursors(list => [...list, next]); }}>Next page</Button>}
    </div>}
  </Inspect>;
}
