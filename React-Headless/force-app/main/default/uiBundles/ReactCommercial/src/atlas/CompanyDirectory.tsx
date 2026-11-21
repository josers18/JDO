import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { findCompanies, nodes, str } from './commercialData';
import { Button, cash, Heading, initials, Pending, RouteLink, useLive } from './controls';

export function CompanyDirectory({ owner }: { owner: string }) {
  const { search } = useLocation();
  const [query, setQuery] = useState(() => new URLSearchParams(search).get('q') ?? '');
  const [industry, setIndustry] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const catalogue = useLive(() => findCompanies(owner), owner);
  const results = useLive(() => findCompanies(owner, query, industry, cursor), JSON.stringify([owner, query, industry, cursor]));
  const industries = [...new Set(nodes(catalogue.value?.Account).map(a => str(a, 'Industry')).filter(Boolean))].sort();
  const current = !query && !industry && !cursor ? catalogue : results;
  const connection = current.value?.Account;
  return <><Heading title="Companies in your book">Search your book by company, industry, location or exact record. Open a company to bring its credit, treasury and deal context together.</Heading>
    <div className="ca-directory-layout">
      <aside className="ca-directory-facets">
        <label>Find a company<input aria-label="Find a company" value={query} placeholder="Company, industry, city, ID…" onChange={e => { setQuery(e.target.value); setCursors([]); }} /></label>
        <label>Industry<select value={industry} onChange={e => { setIndustry(e.target.value); setCursors([]); }}><option value="">All industries</option>{industries.map(value => <option key={value}>{value}</option>)}</select></label>
        <strong>{connection?.totalCount?.toLocaleString() ?? '—'} matching companies</strong>
        <p>{catalogue.value?.Account?.totalCount?.toLocaleString() ?? '—'} company Accounts in your book.</p>
        <RouteLink to="/">Review priority companies</RouteLink>
      </aside>
      <section className="ca-directory-results" aria-label="Company search results">
        <div className="ca-directory-columns"><span>Company / industry</span><span>Location</span><span>Annual revenue</span><span>Open</span></div>
        <Pending state={current}>
          {nodes(connection).map(a => <Link className="ca-directory-row" key={a.Id} to={{ pathname: `/client/${a.Id}`, search: '' }}>
            <span className="ca-directory-name"><span className="ca-company-symbol">{initials(str(a, 'Name'))}</span><span><strong>{str(a, 'Name')}</strong><small>{str(a, 'Industry') || 'Industry unavailable'}</small><small>{a.Id}</small></span></span>
            <span>{[str(a, 'BillingCity'), str(a, 'BillingState')].filter(Boolean).join(', ') || 'Unavailable'}</span><span>{cash(str(a, 'AnnualRevenue'))}</span><span aria-hidden="true">↗</span>
          </Link>)}
          {nodes(connection).length === 0 && <p>No company matches. Clear the filter or search an exact Account ID.</p>}
          <div className="ca-actions">{cursors.length > 0 && <Button onClick={() => setCursors(cursors.slice(0, -1))}>Previous page</Button>}{connection?.pageInfo?.hasNextPage && <Button onClick={() => { const next = connection.pageInfo?.endCursor; if (next) setCursors([...cursors, next]); }}>Next page</Button>}</div>
        </Pending>
      </section>
    </div></>;
}
