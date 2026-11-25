import { Link } from 'react-router';
import { useEffect, useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import { fetchProviderPlans, fetchRecords, fetchOutside, relation, stringField } from './wealthAtlasData';
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPct,
  HouseholdLink,
  Metric,
  SourceState,
  Tabs,
  type OpenProposal,
  useWorkspaceView,
  initials,
  matches,
  goalAccount,
  RecordDialog,
} from './wealthAtlasUi';
function useAccountDirectory(ownerId: string, search: string) {
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const initial = useAsyncData(
    () => fetchRecords(ownerId, 'Account', undefined, debounced),
    [ownerId, debounced]
  );
  const [loaded, setLoaded] = useState<{
    query: string;
    records: Awaited<ReturnType<typeof fetchRecords>>;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const data =
    initial.loading || initial.error ? null : loaded?.query === debounced ? loaded.records : initial.data;
  async function more() {
    if (!data?.next || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchRecords(ownerId, 'Account', data.next, debounced);
      setLoaded({ query: debounced, records: { ...page, rows: [...data.rows, ...page.rows] } });
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }
  return { ...initial, data, more, loadingMore, moreError };
}

export default function Relationships({ ownerId, propose }: { ownerId: string; propose: OpenProposal }) {
  const view = useWorkspaceView();
  const search = view.get('relationshipSearch');
  const directory = useAccountDirectory(ownerId, search);
  const count = useAsyncData(() => fetchRecords(ownerId, 'Account'), [ownerId]);
  const plans = useAsyncData(
    () => fetchProviderPlans(ownerId, 'all', view.get('householdSelected')),
    [ownerId, view.get('householdSelected')]
  );
  const outside = useAsyncData(() => fetchOutside(ownerId), [ownerId]);
  const cases = useAsyncData(() => fetchRecords(ownerId, 'Case'), [ownerId]);
  const goals = useAsyncData(() => fetchRecords(ownerId, 'FinancialGoal'), [ownerId]);
  const [compare, setCompare] = useState<{ id: string; name: string }[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const lens = view.get('householdLens', 'all');
  const mode = view.get('householdView', 'landscape') === 'landscape' ? 'landscape' : 'directory';
  const sort = view.get('householdSort', 'attention');
  const all = (directory.data?.rows ?? []).map(account => ({
    account,
    id: account.Id,
    name: stringField(account, 'Name'),
    email: stringField(account, 'PersonEmail'),
    plan: plans.data?.find(plan => plan.account_id === account.Id),
    outside: outside.data?.rows.find(item => item.account_id === account.Id),
    cases: cases.data?.rows.filter(
      item => relation(item, 'Account')?.Id === account.Id && !/closed/i.test(stringField(item, 'Status'))
    ),
    goals: goals.data?.rows.filter(item => goalAccount(item)?.Id === account.Id),
  }));
  type Context = (typeof all)[number];
  const lensItems = [
    ['all', 'All households'],
    ['planning', 'Planning attention'],
    ['capital', 'Capital conversations'],
    ['service', 'Service needs'],
    ['goals', 'CRM goals'],
    ['shortlist', 'My comparison'],
  ] as const;
  const inLens = (item: Context, key: string) => {
    if (key === 'planning') return item.plan?.success != null && item.plan.success < 70;
    if (key === 'capital') return Boolean(item.outside);
    if (key === 'service') return Boolean(item.cases?.length);
    if (key === 'goals') return Boolean(item.goals?.length);
    if (key === 'shortlist') return compare.some(entry => entry.id === item.id);
    return true;
  };
  const list = all
    .filter(item => inLens(item, lens) && matches(search, item.name, item.email, item.id))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'review') return (a.plan?.next_review || '~').localeCompare(b.plan?.next_review || '~');
      if (sort === 'outside') return (b.outside?.balance ?? 0) - (a.outside?.balance ?? 0);
      return (
        (a.plan?.success ?? 101) - (b.plan?.success ?? 101) ||
        (b.outside?.balance ?? 0) - (a.outside?.balance ?? 0)
      );
    });
  const selected = list.find(item => item.id === view.get('householdSelected')) ?? list[0];
  const shown = selected ? [selected, ...list.filter(item => item.id !== selected.id)].slice(0, 6) : [];
  const positions = [
    [19, 27],
    [50, 18],
    [81, 27],
    [81, 73],
    [50, 82],
    [19, 73],
  ];
  const select = (id: string) => view.set({ householdSelected: id });
  const toggle = (id: string) =>
    setCompare(entries => {
      if (entries.some(item => item.id === id)) return entries.filter(item => item.id !== id);
      const account = all.find(item => item.id === id);
      return account ? [...entries, { id, name: account.name }].slice(-3) : entries;
    });
  const describe = (item: Context) =>
    item.plan
      ? `${formatPct(item.plan.success)} modeled success`
      : item.outside
        ? `${formatMoney(item.outside.balance)} outside`
        : 'Household context';
  const seal = (item: Context) => <span className="wrel-seal">{initials(item.name)}</span>;
  const finder = (compact: boolean) => (
    <section className="wrel-directory" aria-label="Household finder">
      <header>
        <div>
          <h2>{compact ? 'Every household within reach' : 'Household finder'}</h2>
          <p>
            {list.length} matching loaded relationships · {formatCount(count.data?.total)} in the book
          </p>
        </div>
        <label>
          Sort by
          <select value={sort} onChange={event => view.set({ householdSort: event.target.value })}>
            <option value="attention">Planning / capital context</option>
            <option value="name">Household name</option>
            <option value="review">Next provider review</option>
            <option value="outside">Investable held away</option>
          </select>
        </label>
      </header>
      <div className="wrel-directory-head">
        <span>Household</span>
        <span>Planning context</span>
        <span>Capital / next step</span>
      </div>
      <div className="wrel-results" role="region" aria-label="Matching households" tabIndex={0}>
        {list.map(item => (
          <article className={`wrel-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id}>
            <button
              className="wrel-row-person"
              aria-pressed={selected?.id === item.id}
              onClick={() => select(item.id)}
            >
              {seal(item)}
              <span>
                <strong>{item.name}</strong>
                <small>{item.email || `Account …${item.id.slice(-6)}`}</small>
              </span>
            </button>
            <div className="wrel-row-plan">
              <strong>{item.plan ? describe(item) : '—'}</strong>
              <span>
                {item.plan
                  ? `Review ${formatDate(item.plan.next_review)}`
                  : 'Provider evidence unavailable in this view'}
              </span>
            </div>
            <div className="wrel-row-context">
              <strong>{item.outside ? `${formatMoney(item.outside.balance)} outside` : '—'}</strong>
              <span>{item.outside?.institution}</span>
            </div>
            <div className="wrel-row-actions">
              <HouseholdLink id={item.id}>Open</HouseholdLink>
              <button
                aria-pressed={compare.some(entry => entry.id === item.id)}
                aria-label={`Compare ${item.name}`}
                onClick={() => toggle(item.id)}
              >
                {' '}
                {compare.some(entry => entry.id === item.id) ? '−' : '+'} Compare
              </button>
            </div>
          </article>
        ))}
        {!list.length && (
          <SourceState source={directory} empty="No households match the loaded records and filters." />
        )}
      </div>
      {directory.data?.next && (
        <button className="secondary" disabled={directory.loadingMore} onClick={directory.more}>
          {directory.loadingMore ? 'Loading households…' : 'Load more households'}
        </button>
      )}
      {directory.moreError && <p role="alert">Unable to load more households. Try again.</p>}
    </section>
  );

  return (
    <div className="wa wrel">
      <header className="wrel-heading">
        <div>
          <h1>Households in your book</h1>
          <p>Search by household name or open a relationship from your book.</p>
        </div>
        <Tabs
          className="wrel-view"
          label="Relationship view"
          items={[
            ['landscape', 'Landscape'],
            ['directory', 'Finder'],
          ]}
          value={mode}
          onChange={value => view.set({ householdView: value })}
        />
      </header>
      <div className="wrel-findbar">
        <label>
          Search my advisory book
          <input
            value={search}
            onChange={event => view.set({ relationshipSearch: event.target.value }, true)}
            placeholder="Name, email or exact record"
            autoComplete="off"
          />
        </label>
        <div>
          <strong>{formatCount(count.data?.total)}</strong>
          <span>book households</span>
        </div>
        <div>
          <strong>{list.length}</strong>
          <span>matching loaded records</span>
        </div>
      </div>
      <nav className="wrel-lenses" aria-label="Household lens">
        {lensItems.map(([key, label]) => (
          <button key={key} aria-pressed={lens === key} onClick={() => view.set({ householdLens: key })}>
            <span>{label}</span>
            <b>{all.filter(item => inLens(item, key)).length}</b>
          </button>
        ))}
      </nav>
      <div className="wrel-layout">
        {mode === 'landscape' ? (
          <section className="wrel-landscape">
            <header>
              <div>
                <h2>The household landscape</h2>
                <p>Select a household to bring its next conversation into focus.</p>
              </div>
              <span>{shown.length} shown</span>
            </header>
            <div className="wrel-orbits">
              <svg
                className="wrel-orbit-lines"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <ellipse cx="50" cy="49" rx="32" ry="34" />
                <ellipse cx="50" cy="49" rx="22" ry="23" />
                {shown.map((item, index) => (
                  <path
                    key={item.id}
                    d={`M50 49 L${positions[index][0]} ${positions[index][1]}`}
                    className={item.id === selected?.id ? 'selected' : ''}
                  />
                ))}
              </svg>
              <div className="wrel-center">
                <Users />
                <strong>My advisory book</strong>
                <span>{list.length} matching households</span>
              </div>
              {shown.map((item, index) => (
                <button
                  key={item.id}
                  className="wrel-node"
                  style={
                    { '--x': `${positions[index][0]}%`, '--y': `${positions[index][1]}%` } as CSSProperties
                  }
                  aria-pressed={item.id === selected?.id}
                  onClick={() => select(item.id)}
                >
                  {seal(item)}
                  <strong>{item.name}</strong>
                  <span>{describe(item)}</span>
                  <small>{item.plan ? 'Provider plan' : 'Advisory book'}</small>
                </button>
              ))}
            </div>
            {shown.length === 0 && <SourceState source={directory} empty="No households match this view." />}
            <p className="wrel-footnote">
              Connections show membership in my advisory book. Position and distance carry no financial
              meaning.
            </p>
          </section>
        ) : (
          finder(false)
        )}
        <aside className="wrel-inspector" aria-label="Selected household">
          {selected ? (
            <>
              <div className="wrel-profiletop">
                {seal(selected)}
                <div>
                  <span>{describe(selected)}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.email || 'Email unavailable'}</p>
                </div>
              </div>
              <div className="wrel-brief">
                <div className="wrel-identity-art">
                  <Users />
                  <strong>
                    {selected.plan ? formatPct(selected.plan.success) : 'The relationship first.'}
                  </strong>
                  <span>
                    {selected.plan ? 'Modeled success' : 'Review the context before the next conversation.'}
                  </span>
                </div>
                <div>
                  <h3>
                    {selected.plan
                      ? 'Reconnect the plan and the priorities.'
                      : 'Selected household'}
                  </h3>
                  <p>
                    {selected.plan
                      ? `Provider review ${formatDate(selected.plan.next_review)}`
                      : 'Select an evidence lens or open this household.'}
                  </p>
                </div>
              </div>
              <div className="wrel-facts">
                <Metric label="Investable held away" value={formatMoney(selected.outside?.balance)} />
                <Metric
                  label="Open service cases"
                  value={formatCount(selected.cases?.length)}
                  detail="Loaded source rows"
                />
                <Metric
                  label="CRM goals"
                  value={formatCount(selected.goals?.length)}
                  detail="Loaded source rows"
                />
              </div>
              <div className="wrel-inspector-actions">
                <HouseholdLink className="primary" id={selected.id} />
                <button
                  className="secondary"
                  onClick={() =>
                    propose('Review folio', `Review for ${selected.name}`, undefined, selected.id)
                  }
                >
                  Build review folio
                </button>
                <button
                  className="secondary"
                  onClick={() => propose('Task', `Follow up with ${selected.name}`, undefined, selected.id)}
                >
                  Plan follow-up
                </button>
                <button
                  className="secondary"
                  onClick={() => toggle(selected.id)}
                  aria-pressed={compare.some(entry => entry.id === selected.id)}
                >
                  {compare.some(entry => entry.id === selected.id)
                    ? 'Remove comparison'
                    : 'Compare household'}
                </button>
                <Link className="text-button" to={`/work?work=tasks&workAccount=${encodeURIComponent(selected.id)}`}>Review commitments</Link>
                {selected.plan && (
                  <Link className="text-button" to={`/health?reviewAccount=${selected.id}`}>
                    Open review horizon
                  </Link>
                )}
              </div>
              <details className="wrel-source">
                <summary>Evidence behind this view</summary>
                <p>
                  Account {selected.id}. Provider plan, investment account, service and goal evidence reflect
                  the owner-scoped source rows loaded here.
                </p>
              </details>
            </>
          ) : (
            <SourceState source={directory} empty="No matching household." />
          )}
        </aside>
      </div>
      {mode === 'landscape' && finder(true)}
      {!!compare.length && (
        <section className="wrel-compare-tray" aria-label="Household comparison">
          <div>
            <strong>Compare the context</strong>
            <div>
              {compare.map(item => (
                <button key={item.id} onClick={() => toggle(item.id)}>
                  {item.name} ×
                </button>
              ))}
            </div>
          </div>
          <button className="primary" disabled={compare.length < 2} onClick={() => setCompareOpen(true)}>
            Compare households
          </button>
        </section>
      )}
      {compareOpen && (
        <RecordDialog title="Households, side by side" close={() => setCompareOpen(false)}>
          <div className="wrel-comparison atlas-wealth-cards">
            {compare.map(item => {
              const context = all.find(row => row.id === item.id);
              const plan = context?.plan ?? plans.data?.find(row => row.account_id === item.id);
              const assets = context?.outside ?? outside.data?.rows.find(row => row.account_id === item.id);
              return (
                <article key={item.id}>
                  <h3>{item.name}</h3>
                  <p>Modeled plan success {formatPct(plan?.success)}</p>
                  <p>Next review {formatDate(plan?.next_review)}</p>
                  <p>External investment assets {formatMoney(assets?.balance)}</p>
                  <HouseholdLink id={item.id} />
                </article>
              );
            })}
          </div>
        </RecordDialog>
      )}
    </div>
  );
}
