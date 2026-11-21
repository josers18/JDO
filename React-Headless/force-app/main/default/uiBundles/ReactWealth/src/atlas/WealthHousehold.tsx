import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, ChartNoAxesCombined, House, Layers } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import { ScoreHistory } from './WealthCapital';
import { field, stringField, type RecordNode } from './wealthAtlasData';
import {
  fetchHouseholdEvidence,
  verifyHousehold,
  householdProductLabel,
  type Evidence,
  type HouseholdEvidence,
} from './wealthHouseholdData';
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPct,
  initials,
  numericField,
  type OpenProposal,
  RecordDialog,
  SourceState,
  Tabs,
  useWorkspaceView,
} from './wealthAtlasUi';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-customer-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-money-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-context.css';

const sections = [
  ['overview', 'Overview'],
  ['profile', 'Profile'],
  ['finances', 'Finances'],
  ['journey', 'Journey & goals'],
  ['engagement', 'Engagement & service'],
  ['growth', 'Opportunities'],
  ['tools', 'Notes & tools'],
  ['notebook', 'Notebook'],
  ['screening', 'Screening'],
] as const;

const workspaceLabels: Record<string, string> = {
  '/': 'My day',
  '/relationships': 'the household finder',
  '/pipeline': 'Pipeline',
  '/journey': 'Plans & goals',
  '/growth': 'Capital & Acquisition',
  '/intelligence': 'Intelligence',
  '/health': 'Review horizon',
  '/work': 'My workbench',
};

type Props = {
  ownerId: string;
  accountId: string;
  actorScope?: string;
  propose: OpenProposal;
  renderFolio: (account: RecordNode, evidence: HouseholdEvidence) => ReactNode;
};
type Content = { account: RecordNode; data: HouseholdEvidence; propose: OpenProposal };

function Panel({ title, children, detail }: { title: string; children: ReactNode; detail?: string }) {
  return (
    <section className="wa-panel wcare-panel">
      <header>
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

const text = (value: unknown, fallback = 'Not supplied') =>
  value == null || value === '' ? fallback : String(value);
const number = (value: unknown) =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const compactNumber = (value: unknown) => {
  const found = number(value);
  return found == null ? text(value) : found.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const score = (value: unknown, scale = 100) =>
  value == null ? 'Not supplied' : `${compactNumber(value)} / ${scale}`;
const day = (value: unknown) => formatDate(text(value, ''));
const empty = (source?: Evidence) => (
  <p className="wcare-empty">
    {!source || source.error ? 'Source unavailable.' : 'No matching source records.'}
  </p>
);
const numericScore = (value: unknown) => formatPct(number(value));
const holdingsByProduct: Record<string, RegExp> = {
  'PCHK-ACQ': /Premier Checking/i,
  'WM-CASH': /High-Yield|Money Market|\bCD\b/i,
  'WM-MAS': /Managed/i,
  'IRA-RTH': /Roth/i,
  'IRA-ROL': /Traditional IRA|Rollover/i,
  'MTG-JMB': /Mortgage|\bARM\b/i,
  'HEL-ACQ': /HELOC/i,
};

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="wcare-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function switchTab(event: KeyboardEvent<HTMLDivElement>, current: string, select: (tab: string) => void) {
  if (
    !(event.target instanceof HTMLButtonElement) ||
    !['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  )
    return;
  const index = sections.findIndex(([key]) => key === current);
  const last = sections.length - 1;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : (index + (event.key === 'ArrowRight' ? 1 : last)) % sections.length;
  event.preventDefault();
  select(sections[next][0]);
  event.currentTarget.querySelectorAll('button')[next]?.focus();
}

export default function WealthHousehold(props: Props) {
  const access = useAsyncData(
    () => verifyHousehold(props.ownerId, props.accountId),
    [props.ownerId, props.accountId]
  );
  if (access.loading || access.error || !access.data) {
    return (
      <div className="wa">
        <p>
          <Link className="text-button" to="/relationships">
            Relationships
          </Link>
        </p>
        <SourceState
          source={access}
          empty="This relationship is unavailable in the selected advisory book."
        />
      </div>
    );
  }
  return <HouseholdWorkspace {...props} key={access.data.Id} account={access.data} />;
}

function HouseholdWorkspace({
  ownerId,
  account,
  actorScope,
  propose,
  renderFolio,
}: Omit<Props, 'accountId'> & { account: RecordNode }) {
  const view = useWorkspaceView();
  const { state } = useLocation();
  const candidate: unknown = state?.returnTo;
  const origin = typeof candidate === 'string' ? candidate.split('?')[0] : '';
  const returnTo =
    typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(workspaceLabels, origin)
      ? candidate
      : '';

  const fetch = useAsyncData(() => fetchHouseholdEvidence(ownerId, account), [ownerId, account.Id]);
  const tab = sections.find(([key]) => key === view.get('tab'))?.[0] ?? 'overview';
  const select = (value: string) => view.set({ tab: value });
  const name = stringField(account, 'Name') || 'Household';
  const key = actorScope ? `cumulus.atlas.wealth.pin.${actorScope}.${ownerId}.${account.Id}` : null;
  const [pinned, setPinned] = useState(() => {
    try {
      return Boolean(key && sessionStorage.getItem(key));
    } catch {
      return false;
    }
  });
  const setPin = () => {
    try {
      if (key) {
        if (pinned) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, '1');
      }
    } catch {
      /* The pin remains available for this view. */
    }
    setPinned(!pinned);
  };
  const data = fetch.data;
  const content = data ? { account, data, propose } : null;
  const context = [
    stringField(account, 'Type'),
    stringField(account, 'Industry'),
    stringField(account, 'BillingCity'),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="wa wealth-dossier" data-relationship-tab={tab}>
      <div className="breadcrumb">
        <Link to={origin === '/relationships' && returnTo ? returnTo : '/relationships'}>Relationships</Link>
        <span aria-hidden="true">/</span>
        <span>{name}</span>
      </div>
      {returnTo && origin !== '/relationships' && (
        <div className="wctx-return">
          <Link className="text-button" to={returnTo}>
            Return to {workspaceLabels[origin]}
          </Link>
        </div>
      )}
      <header className="dossier-header">
        <div>
          <h1>{name}</h1>
          <p>{context || 'Salesforce relationship'}</p>
        </div>
        <div className="dossier-actions">
          <button className="secondary" aria-pressed={pinned} onClick={setPin}>
            {pinned ? 'Unpin relationship' : 'Pin relationship'}
          </button>
          <button
            className="primary"
            onClick={() => propose('Review folio', `Review for ${name}`, undefined, account.Id)}
          >
            Prepare conversation <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button
            className="secondary"
            onClick={() => propose('Task', `Follow up with ${name}`, undefined, account.Id)}
          >
            Create task
          </button>
        </div>
      </header>
      <div
        className="dossier-tabs"
        role="tablist"
        aria-label="Relationship sections"
        onKeyDown={event => switchTab(event, tab, select)}
      >
        {sections.map(([value, label]) => (
          <button
            id={`tab-${value}`}
            key={value}
            role="tab"
            aria-controls="dossier-panel"
            aria-selected={value === tab}
            tabIndex={value === tab ? 0 : -1}
            onClick={() => select(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section id="dossier-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {!content ? (
          <SourceState source={fetch} />
        ) : tab === 'overview' ? (
          <Overview {...content} select={select} />
        ) : tab === 'profile' ? (
          <Profile {...content} />
        ) : tab === 'finances' ? (
          <Finances {...content} />
        ) : tab === 'journey' ? (
          <Journey {...content} />
        ) : tab === 'engagement' ? (
          <Engagement {...content} />
        ) : tab === 'growth' ? (
          <Products {...content} />
        ) : tab === 'screening' ? (
          <Screening {...content} />
        ) : (
          <>
            {renderFolio(account, content.data)}
            {tab === 'notebook' && <Notebook {...content} />}
          </>
        )}
      </section>
      <p className="wealth-dossier-legacy">
        <Link className="text-button" to={`/client/${account.Id}`}>
          Open Customer 360
        </Link>
      </p>
    </div>
  );
}

function Overview({ account, data, propose, select }: Content & { select: (tab: string) => void }) {
  const name = stringField(account, 'Name');
  const { plan, signals, outside, goals } = data;
  const csat = signals?.feedback.rows[0],
    gong = signals?.gong.rows[0];
  return (
    <div className="wcare">
      <section className="wcare-household-hero">
        <div>
          <span className="wcare-person">{initials(name)}</span>
          <div>
            <h2>Household overview</h2>
            <p>
              {name} · {stringField(account, 'PersonEmail') || 'Verified Account record'}
            </p>
            <div className="wcare-actions">
              <button
                className="primary"
                onClick={() => propose('Review folio', `Review for ${name}`, undefined, account.Id)}
              >
                Build review folio
              </button>
              <button
                className="secondary"
                onClick={() => propose('Task', `Follow up with ${name}`, undefined, account.Id)}
              >
                Plan follow-up
              </button>
              <button
                className="secondary"
                onClick={() => propose('Meeting', `Review meeting with ${name}`, undefined, account.Id)}
              >
                Propose next meeting
              </button>
            </div>
          </div>
        </div>
        <div className="wcare-hero-facts">
          <Metric
            label="Observed satisfaction"
            value={
              csat
                ? score(csat.csat)
                : signals?.feedback.error
                  ? 'Source unavailable'
                  : 'No response returned'
            }
            detail={csat ? day(csat.dt) : undefined}
          />
          <Metric
            label="Provider plan"
            value={plan?.status || 'No plan evidence available'}
            detail={
              plan?.status === 'Draft'
                ? 'Drafts are separate from review priorities'
                : plan
                  ? `${numericScore(plan.success)} modeled success`
                  : undefined
            }
          />
          <Metric
            label="Investable held away"
            value={outside ? formatMoney(outside.balance) : 'No qualifying row'}
            detail={outside?.institution || 'Brokerage / robo slice'}
          />
        </div>
      </section>
      <div className="wcare-three">
        <Panel title="Planning context">
          {plan ? (
            <>
              <span className="wa-pill">{plan.status}</span>
              <h3>
                {plan.status === 'Draft'
                  ? 'A draft plan to understand.'
                  : 'Household planning summary'}
              </h3>
              <div className="wcare-pair">
                <Metric label="Provider goal exposure" value={formatMoney(plan.goal_usd)} />
                <Metric label="Next provider review" value={formatDate(plan.next_review)} />
              </div>
              <p>
                Updated {formatDate(plan.updated)} · {plan.allocation || 'Allocation not supplied'}
              </p>
              <div className="wcare-actions">
                <button className="secondary" onClick={() => select('journey')}>
                  Open plans &amp; goals
                </button>
                {['Active', 'Stale'].includes(plan.status) && (
                  <Link className="secondary" to={`/health?reviewAccount=${account.Id}`}>
                    Open review horizon
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p className="wcare-empty">No provider planning evidence available.</p>
          )}
        </Panel>
        <Panel title="Relationship care">
          {gong ? (
            <>
              <span className="wa-pill">Source conversation sentiment</span>
              <h3>{text(gong.sent)}</h3>
              <p>
                {text(gong.trend)} · profile {day(gong.period)}
              </p>
              <p>Actual call date {day(gong.dt)}</p>
              <button className="secondary" onClick={() => select('engagement')}>
                Explore feedback &amp; conversations
              </button>
            </>
          ) : (
            empty(signals?.gong)
          )}
        </Panel>
        <Panel title="Follow-up actions">
          <h3>{goals ? `${goals.length} CRM goals` : 'CRM goal evidence unavailable'}</h3>
          <p>Review CRM goal funding, the provider plan and eligible product conversations.</p>
          <div className="wcare-actions">
            <button className="secondary" onClick={() => select('growth')}>
              Review product opportunities
            </button>
            <button className="secondary" onClick={() => select('finances')}>
              Explore financial context
            </button>
          </div>
        </Panel>
      </div>
      {!!goals?.length && (
        <Panel title="Goals linked to the plan">
          <GoalCards items={goals} propose={propose} accountId={account.Id} />
        </Panel>
      )}
    </div>
  );
}

function Profile({ account, data, propose }: Content) {
  const name = stringField(account, 'Name');
  const location = [stringField(account, 'BillingCity'), stringField(account, 'BillingState')]
    .filter(Boolean)
    .join(', ');
  const facts = [
    ['Relationship record', account.Id],
    ['Linked Contact', stringField(account, 'PersonContactId')],
    ['Email', stringField(account, 'PersonEmail')],
    ['Phone', stringField(account, 'Phone')],
    ['Location', location],
    ['Source account type', stringField(account, 'Type')],
  ];
  const property = data.core?.property;
  return (
    <div className="wms">
      <section className="wms-identity">
        <div className="wms-monogram">{initials(name)}</div>
        <div>
          <h2>{name}</h2>
          <p>A household record with its own source history and next conversation.</p>
        </div>
        <button
          className="secondary"
          onClick={() => propose('Review folio', `Review for ${name}`, undefined, account.Id)}
        >
          Build review folio
        </button>
      </section>
      <section className="wms-profile-facts">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div className="wms-metric" key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
      </section>
      <Panel title="Property & risk context">
        {property ? (
          <>
            <div className="wcare-pair">
              <Metric label="Property type" value={property.propertyType} detail={property.asOf} />
              <Metric label="Housing status" value={property.isOwner ? 'Owner' : 'Non-owner'} />
            </div>
            {property.isOwner && (
              <div className="wcare-hero-facts">
                <Metric label="Estimated value" value={formatMoney(property.estimatedValue)} />
                <Metric label="Estimated equity" value={formatMoney(property.equity)} />
                <Metric label="Outstanding mortgage" value={formatMoney(property.mortgageBalance)} />
              </div>
            )}
          </>
        ) : (
          <p className="wcare-empty">No property evidence available for this household.</p>
        )}
      </Panel>
    </div>
  );
}

function Finances({ account, data, propose }: Content) {
  const route = useWorkspaceView();
  const mode = route.get('moneyView', 'accounts');
  const accountGroup = route.get('moneyAccountGroup', 'all');
  const search = route.get(mode === 'trades' ? 'moneyTradeSearch' : 'moneyTransactionSearch');
  const filterKey = mode === 'trades' ? 'moneyTradeSide' : 'moneyTransactionType';
  const selected = route.get(filterKey, 'all');
  const name = stringField(account, 'Name');
  const [detail, setDetail] = useState<{ title: string; rows: [string, string][] } | null>(null);
  const accounts = data.core?.finAccounts ?? [];
  const trades = data.core?.trades ?? [];
  const transactions = data.core?.transactions ?? [];
  const group = (type: string) =>
    /deposit|saving|checking/i.test(type)
      ? 'Banking'
      : /investment|ira|brokerage|retirement/i.test(type)
        ? 'Investing & goals'
        : /loan|credit|mortgage/i.test(type)
          ? 'Borrowing'
          : 'Other accounts';
  const groups = ['Banking', 'Investing & goals', 'Borrowing', 'Other accounts'];
  const cash = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const maxAmount = Math.max(1, ...transactions.map(row => Math.abs(row.amount)));
  const branches = ['all', ...groups];
  const selectedAccounts = accounts.filter(row => accountGroup === 'all' || group(row.type) === accountGroup);
  const labels =
    mode === 'trades'
      ? [...new Set(trades.map(row => row.action))]
      : [...new Set(transactions.map(row => row.account))];
  const show = (values: string[], value: string) =>
    (selected === 'all' || selected.toLowerCase() === value.toLowerCase()) &&
    values.some(item => item.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="wms">
      <header className="wms-heading">
        <div>
          <h2>Household finances</h2>
          <p>{name} · choose accounts, transactions or execution evidence.</p>
        </div>
        <button
          className="secondary"
          onClick={() => propose('Task', `Follow up with ${name}`, undefined, account.Id)}
        >
          Prepare follow-up
        </button>
      </header>
      <Tabs
        className="wms-tabs"
        label="Customer money view"
        items={[
          ['accounts', 'Accounts & products'],
          ['transactions', 'Transactions'],
          ['trades', 'Execution journal'],
        ]}
        value={mode}
        onChange={value => route.set({ moneyView: value })}
      />
      {mode === 'accounts' ? (
        <section className="wms-accountbook">
          <div className="wms-account-opening">
            <div>
              <h2>Financial accounts</h2>
              <p>Recorded financial accounts, grouped by product type.</p>
            </div>
            <div className="wms-account-total">
              <strong>{formatCount(data.core?.finAccounts.length)}</strong>
              <span>financial accounts on file</span>
            </div>
          </div>
          <div className="wms-product-branches" role="group" aria-label="Financial account group">
            {branches.map((value, index) => {
              const Icon =
                value === 'Borrowing' ? House : value === 'Investing & goals' ? ChartNoAxesCombined : Layers;
              const count =
                value === 'all' ? accounts.length : accounts.filter(row => group(row.type) === value).length;
              return (
                <button
                  key={value}
                  type="button"
                  style={{ '--branch': index } as CSSProperties}
                  aria-pressed={accountGroup === value}
                  onClick={() => route.set({ moneyAccountGroup: value })}
                >
                  <span>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <strong>{value === 'all' ? 'All accounts' : value}</strong>
                  <b>{count}</b>
                  <small>source records</small>
                </button>
              );
            })}
          </div>
          <div
            className="wms-account-ledger"
            role="region"
            tabIndex={0}
            aria-label="Financial account records"
          >
            {selectedAccounts.map(row => (
              <button
                className="wms-account-ticket"
                key={row.id}
                onClick={() =>
                  setDetail({
                    title: row.name,
                    rows: [
                      ['Account type', row.type],
                      ['Recorded balance', cash(row.balance)],
                      ['Opened', row.opened],
                      ['Status', row.status],
                    ],
                  })
                }
              >
                <div>
                  <span>{row.type}</span>
                  <h3>{row.name}</h3>
                  <small>
                    {row.status} · {row.number}
                  </small>
                </div>
                <div>
                  <strong>{cash(row.balance)}</strong>
                  <small>source balance</small>
                </div>
              </button>
            ))}
          </div>
          {!selectedAccounts.length && (
            <p className="wcare-empty">No financial account records in this view.</p>
          )}
          <p className="wms-source">
            Account groups use the source product type. Each balance remains with its financial account.
          </p>
        </section>
      ) : (
        <Panel title={mode === 'trades' ? 'An execution journal' : 'The latest money moments'}>
          <div className="wms-controls">
            <label className="wa-field">
              {mode === 'trades' ? 'Find an instrument' : 'Find a transaction'}
              <input
                value={search}
                onChange={event =>
                  route.set(
                    {
                      [mode === 'trades' ? 'moneyTradeSearch' : 'moneyTransactionSearch']: event.target.value,
                    },
                    true
                  )
                }
              />
            </label>
            <label className="wa-field">
              {mode === 'trades' ? 'Trade side' : 'Transaction type'}
              <select value={selected} onChange={event => route.set({ [filterKey]: event.target.value })}>
                <option value="all">All</option>
                {labels.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          {mode === 'trades' ? (
            <div className="wms-trades" role="region" tabIndex={0} aria-label="Execution records">
              {trades
                .filter(row => show([row.name, row.symbol, row.action, row.date], row.action))
                .map(row => (
                  <button
                    key={row.id}
                    onClick={() =>
                      setDetail({
                        title: row.name,
                        rows: [
                          ['Execution date', row.date],
                          ['Side', row.action],
                          ['Instrument', row.symbol],
                          ['Shares', formatCount(row.shares)],
                          ['Price', cash(row.price)],
                          ['Execution amount', cash(row.amount)],
                        ],
                      })
                    }
                  >
                    <div className="wms-ticker">
                      <strong>{row.symbol}</strong>
                      <span>{row.action}</span>
                    </div>
                    <div className="wms-trade-instrument">
                      <h3>{row.name}</h3>
                      <span>{row.date}</span>
                      <p>
                        {formatCount(row.shares)} shares × {cash(row.price)}
                      </p>
                    </div>
                    <div className="wms-trade-gross">
                      <strong>{cash(row.amount)}</strong>
                      <small>gross execution value</small>
                    </div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="wms-transactions" role="region" tabIndex={0} aria-label="Transaction records">
              {transactions
                .filter(row =>
                  show([row.description, row.date, row.account, String(row.amount)], row.account)
                )
                .map(row => (
                  <button
                    key={row.id}
                    className={`wms-transaction ${row.amount < 0 ? 'debit' : 'credit'}`}
                    onClick={() =>
                      setDetail({
                        title: row.description,
                        rows: [
                          ['Transaction date', row.date],
                          ['Type', row.account],
                          ['Category', row.category],
                          ['Recorded amount', cash(row.amount)],
                        ],
                      })
                    }
                  >
                    <div className="wms-transaction-date">{row.date}</div>
                    <div className="wms-transaction-copy">
                      <strong>{row.description}</strong>
                      <span>{row.account}</span>
                      <i
                        style={
                          { '--length': `${(Math.abs(row.amount) / maxAmount) * 100}%` } as CSSProperties
                        }
                      />
                    </div>
                    <strong>{cash(row.amount)}</strong>
                  </button>
                ))}
            </div>
          )}
          {!(mode === 'trades'
            ? trades.some(row => show([row.name, row.symbol, row.action, row.date], row.action))
            : transactions.some(row =>
                show([row.description, row.date, row.account, String(row.amount)], row.account)
              )) && <p className="wms-source">No source records match this view.</p>}
          <p className="wms-source">
            {mode === 'trades'
              ? 'Gross recorded execution value stays separate from portfolio performance and bank net flow.'
              : 'Bars compare absolute amounts within the loaded transaction records.'}
          </p>
        </Panel>
      )}
      {data.outside && (
        <Panel title="External investment assets">
          <div className="wcare-pair">
            <Metric
              label={data.outside.institution}
              value={formatMoney(data.outside.balance)}
              detail={data.outside.acct_type}
            />
            <Metric label="Outside monthly net flow" value={formatMoney(data.outside.net_flow)} />
          </div>
        </Panel>
      )}
      {detail && (
        <RecordDialog title={detail.title} close={() => setDetail(null)}>
          <div className="wcare-evidence">
            {detail.rows.map(([label, value]) => (
              <Metric label={label} key={label} value={value} />
            ))}
          </div>
        </RecordDialog>
      )}
    </div>
  );
}

function GoalCards({
  items,
  accountId,
  propose,
}: {
  items: RecordNode[];
  accountId: string;
  propose: OpenProposal;
}) {
  return (
    <div className="wa-goals">
      {items.map(row => (
        <article key={row.Id}>
          <small>{stringField(row, 'Type')}</small>
          <h3>{stringField(row, 'Name')}</h3>
          <div className="wcare-pair">
            <Metric label="Recorded funding" value={formatMoney(numericField(row, 'ActualAmount'))} />
            <Metric label="Target" value={formatMoney(numericField(row, 'TargetAmount'))} />
          </div>
          <p>
            Target {formatDate(stringField(row, 'TargetDate'))} · {stringField(row, 'Status')}
          </p>
          <button
            className="secondary"
            onClick={() => propose('Goal', stringField(row, 'Name'), row, accountId)}
          >
            Review goal
          </button>
        </article>
      ))}
    </div>
  );
}

function Journey({ account, data, propose }: Content) {
  const plan = data.plan;
  const [choosePlan, setChoosePlan] = useState(false);
  return (
    <div className="wcare">
      <Panel title="Plans & goals">
        <div className="wcare-actions">
          <button className="primary" disabled={!data.crmPlans?.length} onClick={() => setChoosePlan(true)}>
            Create goal proposal
          </button>
          {!data.crmPlans?.length && <small>No CRM financial plan available to link.</small>}
        </div>
        {data.goals?.length ? (
          <GoalCards items={data.goals} accountId={account.Id} propose={propose} />
        ) : (
          <p className="wcare-empty">
            {data.goals ? 'No CRM goals returned for this household.' : 'CRM goal evidence is unavailable.'}
          </p>
        )}
      </Panel>
      {choosePlan && (
        <RecordDialog title="Create goal proposal" close={() => setChoosePlan(false)}>
          <form
            onSubmit={event => {
              event.preventDefault();
              const selected = new FormData(event.currentTarget).get('plan');
              const source = data.crmPlans?.find(row => row.Id === selected);
              if (!source) return;
              setChoosePlan(false);
              propose('Goal', '', source, account.Id);
            }}
          >
            <label className="wa-field">
              CRM financial plan
              <select name="plan" required defaultValue="">
                <option value="">Choose a financial plan…</option>
                {data.crmPlans?.map(row => (
                  <option key={row.Id} value={row.Id}>
                    {stringField(row, 'Name')}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="submit">
              Prepare proposal
            </button>
          </form>
        </RecordDialog>
      )}
      <Panel title="Contact-linked milestones">
        <div className="wa-commitments">
          {data.moments?.map(row => (
            <article key={row.Id}>
              <div>
                <h3>{stringField(row, 'Name')}</h3>
                <p>
                  {stringField(row, 'EventType')} · {formatDate(stringField(row, 'EventDate'))}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => propose('Life event', stringField(row, 'Name'), row, account.Id)}
              >
                Review life event
              </button>
            </article>
          ))}
        </div>
        {!data.moments?.length && <p className="wcare-empty">No Contact-linked milestones available.</p>}
        {stringField(account, 'PersonContactId') && (
          <button
            className="secondary"
            onClick={() =>
              propose('Life event', '', { Id: stringField(account, 'PersonContactId') }, account.Id)
            }
          >
            Log life event
          </button>
        )}
      </Panel>
      <Panel title="Provider plan">
        {plan ? (
          <>
            <div className="wcare-hero-facts">
              <Metric label="Status" value={plan.status} />
              <Metric label="Modeled success" value={numericScore(plan.success)} />
              <Metric label="Plan goal exposure" value={formatMoney(plan.goal_usd)} />
            </div>
            <p>
              {plan.allocation} · next review {formatDate(plan.next_review)}
            </p>
            {['Active', 'Stale'].includes(plan.status) && (
              <Link className="secondary" to={`/health?reviewAccount=${account.Id}`}>
                Open review horizon
              </Link>
            )}
          </>
        ) : (
          <p className="wcare-empty">No provider planning evidence available.</p>
        )}
      </Panel>
    </div>
  );
}

const careTabs = [
  ['overview', 'Relationship pulse'],
  ['feedback', 'Satisfaction history'],
  ['models', 'Prediction context'],
  ['conversations', 'Conversations'],
  ['campaigns', 'Campaigns'],
  ['service', 'Service & commitments'],
] as const;

function Feedback({ account, data, propose }: Content) {
  const view = useWorkspaceView();
  const source = data.signals?.feedback;
  const rows = source?.rows.slice().reverse() ?? [];
  const picked = rows.find(row => text(row.dt) === view.get('feedbackPeriod')) ?? rows[rows.length - 1];
  if (!picked) return <Panel title="The voice of the relationship">{empty(source)}</Panel>;
  const prior = rows[rows.indexOf(picked) - 1];
  const actual = number(picked.csat),
    previous = number(prior?.csat);
  const delta = actual != null && previous != null ? actual - previous : null;
  const plotted = rows.filter(row => number(row.csat) != null);
  const x = (index: number) => (plotted.length === 1 ? 300 : 30 + (index / (plotted.length - 1)) * 540);
  const y = (value: unknown) => 170 - Number(value) * 1.4;
  return (
    <Panel
      title="The voice of the relationship"
      detail="Keep what the customer reported alongside its source date."
    >
      <div className="wcare-feedback-head">
        <Metric label="Observed satisfaction" value={score(picked.csat)} detail={day(picked.dt)} />
        <Metric label="Recommendation response" value={score(picked.nps, 10)} detail={text(picked.npsd)} />
        <Metric
          label="Change vs prior response"
          value={
            delta == null ? 'No prior response supplied' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pts`
          }
        />
      </div>
      <svg
        className="wcare-csat-chart"
        viewBox="0 0 600 205"
        role="img"
        aria-label="Observed satisfaction scores from zero to 100"
      >
        {[0, 50, 100].map(value => (
          <g key={value}>
            <line x1="30" x2="570" y1={y(value)} y2={y(value)} stroke="var(--tone-wash)" />
            <text x="3" y={y(value) + 5}>
              {value}
            </text>
          </g>
        ))}
        <polyline
          points={plotted.map((row, index) => `${x(index)},${y(row.csat)}`).join(' ')}
          fill="none"
          stroke="var(--tone-accent)"
          strokeWidth="3"
        />
        {plotted.map((row, index) => (
          <circle
            key={text(row.dt)}
            cx={x(index)}
            cy={y(row.csat)}
            r={row === picked ? 7 : 4}
            fill={row === picked ? 'var(--tone-accent)' : 'var(--tone-plot)'}
          >
            <title>
              {day(row.dt)} · {score(row.csat)}
            </title>
          </circle>
        ))}
        <text x="30" y="198">
          {day(plotted[0]?.dt)}
        </text>
        <text x="570" y="198" textAnchor="end">
          {day(plotted[plotted.length - 1]?.dt)}
        </text>
      </svg>
      <div className="wcare-response-picker" role="group" aria-label="Recorded satisfaction response">
        {rows.map(row => (
          <button
            key={text(row.dt)}
            aria-pressed={row === picked}
            onClick={() => view.set({ feedbackPeriod: text(row.dt) })}
          >
            {day(row.dt)} · {compactNumber(row.csat)}
          </button>
        ))}
      </div>
      <div className="wcare-rating-language">
        <div>
          <span>Source satisfaction description</span>
          <strong>{text(picked.csatd)}</strong>
        </div>
        <div>
          <span>Source recommendation description</span>
          <strong>{text(picked.npsd)}</strong>
        </div>
      </div>
      <EvidenceActions account={account} domain="Observed satisfaction" row={picked} propose={propose} />
    </Panel>
  );
}

function EvidenceActions({
  account,
  domain,
  row,
  propose,
}: {
  account: RecordNode;
  domain: string;
  row: Record<string, unknown>;
  propose: OpenProposal;
}) {
  const [open, setOpen] = useState(false);
  const description = `${domain} · ${day(row.period ?? row.dt)}`;
  return (
    <div className="wcare-actions">
      <button className="secondary" onClick={() => setOpen(true)}>
        Review source evidence
      </button>
      <button
        className="secondary"
        onClick={() =>
          propose(
            'Task',
            `Follow up with ${stringField(account, 'Name')}`,
            {
              Id: '',
              Description: { value: description },
              EvidenceKind: { value: domain },
              EvidencePeriod: { value: text(row.period ?? row.dt, '') },
            },
            account.Id
          )
        }
      >
        Plan follow-up
      </button>
      {open && (
        <RecordDialog close={() => setOpen(false)} title={domain}>
          <div className="wcare-evidence">
            {Object.entries(row).map(([key, value]) => (
              <Metric key={key} label={key} value={text(value)} />
            ))}
          </div>
        </RecordDialog>
      )}
    </div>
  );
}

function Predictions({ account, data, propose }: Content) {
  const source = data.signals?.prediction;
  const row = source?.rows[0],
    churn = data.signals?.attrition.rows[0];
  if (!row && !churn) return <Panel title="Model context, with its limits">{empty(source)}</Panel>;
  const entries = [
    ...(row
      ? [
          ['Predicted satisfaction', row.pred, 'Model output'],
          ['Cross-sell source score', row.xsell, 'Source model output'],
        ]
      : []),
    ...(churn ? [['Attrition model score', churn.churned, 'Source model output']] : []),
  ];
  return (
    <Panel title="Model context, with its limits">
      <div className="wcare-modelscores">
        {entries.map(([label, value, detail]) => (
          <article className="wcare-modelscore" key={String(label)} data-driver={String(label)}>
            <Metric label={String(label)} value={score(value)} detail={String(detail)} />
            <div>
              <i style={{ width: `${Math.min(100, Math.max(0, number(value) ?? 0))}%` }} />
            </div>
          </article>
        ))}
      </div>
      {row && (
        <div className="wcare-inputs">
          <h3>Inputs supplied with this prediction</h3>
          <div>
            <Metric label="Digital engagement" value={score(row.dig)} />
            <Metric label="Complaint count" value={compactNumber(row.comp)} />
            <Metric label="Source segment" value={text(row.seg)} />
          </div>
          <p>The source supplies no signed feature contributions or causal attribution weights.</p>
        </div>
      )}
      <EvidenceActions
        account={account}
        domain="Prediction context"
        row={row ?? churn ?? {}}
        propose={propose}
      />
    </Panel>
  );
}

function Gong({ account, data, propose }: Content) {
  const source = data.signals?.gong;
  const row = source?.rows[0];
  return (
    <Panel title="How the conversations are landing">
      {row ? (
        <>
          <div className="wcare-gong-lead">
            <span>Latest source profile week · {day(row.period)}</span>
            <h3>{text(row.sent)}</h3>
            <p>
              {text(row.trend)} · actual call {day(row.dt)}
            </p>
          </div>
          <Metric label="Source deal-risk score" value={score(row.risk)} />
          <EvidenceActions account={account} domain="Conversation sentiment" row={row} propose={propose} />
        </>
      ) : (
        empty(source)
      )}
    </Panel>
  );
}

function Engagement(props: Content) {
  const { account, data, propose } = props;
  const view = useWorkspaceView();
  const mode = view.get('careView', 'overview');
  const [detail, setDetail] = useState<{ title: string; detail: string } | null>(null);
  return (
    <div className="wcare">
      <header className="wcare-heading">
        <h2>Engagement history</h2>
        <p>Observed feedback, model signals and source conversations, each with its own evidence.</p>
      </header>
      <Tabs
        className="wcare-tabs"
        label="Household care view"
        items={careTabs}
        value={mode}
        onChange={value => view.set({ careView: value })}
      />
      {mode === 'feedback' ? (
        <Feedback {...props} />
      ) : mode === 'models' ? (
        <Predictions {...props} />
      ) : mode === 'conversations' ? (
        <Panel title="Conversations, commitments and context">
          <div className="wcare-timeline">
            {data.core?.interactions.map(row => (
              <article key={row.id}>
                <time>{row.when}</time>
                <div>
                  <span>{row.channel}</span>
                  <h3>{row.type}</h3>
                  <p>{row.summary}</p>
                </div>
              </article>
            ))}
          </div>
          {!data.core?.interactions.length && (
            <p className="wcare-empty">No conversation source records available.</p>
          )}
        </Panel>
      ) : mode === 'campaigns' ? (
        <Panel title="Engagement beyond the meeting">
          <div className="wcare-campaigns">
            {data.core?.campaigns.map(row => (
              <article key={row.id}>
                <time>{row.memberSince}</time>
                <span>{row.type}</span>
                <h3>{row.name}</h3>
                <p>{row.status}</p>
              </article>
            ))}
          </div>
          {!data.core?.campaigns.length && (
            <p className="wcare-empty">No campaign source records available.</p>
          )}
        </Panel>
      ) : mode === 'service' ? (
        <>
          <Panel title="My commitments for this household">
            <div className="wa-actions">
              <Link className="secondary" to={`/work?work=tasks&workAccount=${encodeURIComponent(account.Id)}`}>Open household tasks</Link>
              <Link className="secondary" to={`/work?work=meetings&workAccount=${encodeURIComponent(account.Id)}`}>Open recorded meetings</Link>
            </div>
            <div className="wa-commitmentlist">
              {[...(data.tasks ?? []), ...(data.meetings ?? [])].map(row => (
                <button
                  key={row.Id}
                  onClick={() =>
                    propose(
                      field(row, 'ActivityDateTime') ? 'Meeting · Edit' : 'Task · Edit',
                      stringField(row, 'Subject'),
                      row,
                      account.Id
                    )
                  }
                >
                  <span>{day(field(row, 'ActivityDateTime') ?? field(row, 'ActivityDate'))}</span>
                  <strong>{stringField(row, 'Subject')}</strong>
                  <small>{stringField(row, 'Status') || stringField(row, 'ShowAs')}</small>
                </button>
              ))}
            </div>
            {!data.tasks?.length && !data.meetings?.length && (
              <p className="wcare-empty">No commitment source records available.</p>
            )}
          </Panel>
          <Panel title="Service cases">
            <div className="wa-casegrid">
              {data.core?.cases.map(row => (
                <article key={row.id}>
                  <small>Case {row.number}</small>
                  <h3>{row.subject}</h3>
                  <p>
                    {row.status} · {row.priority}
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      setDetail({
                        title: row.subject,
                        detail: `Case ${row.number} · ${row.priority} priority · ${row.status} · opened ${row.opened}`,
                      })
                    }
                  >
                    Read source case
                  </button>
                </article>
              ))}
            </div>
            {!data.core?.cases.length && <p className="wcare-empty">No service case records available.</p>}
          </Panel>
        </>
      ) : (
        <div className="wcare-two">
          <Feedback {...props} />
          <Gong {...props} />
        </div>
      )}
      {detail && (
        <RecordDialog title={detail.title} close={() => setDetail(null)}>
          <p>{detail.detail}</p>
        </RecordDialog>
      )}
    </div>
  );
}

function Products({ account, data, propose }: Content) {
  const view = useWorkspaceView();
  const source = data.signals?.products;
  const records = source?.rows ?? [];
  const selected = records.find(row => text(row.code) === view.get('product')) ?? records[0];
  const institution = data.outside;
  const name = stringField(account, 'Name');
  const investmentAccounts = data.core?.finAccounts.filter(row =>
    /Brokerage|Managed|IRA|529/i.test(row.name)
  );
  const code = text(selected?.code, '');
  const owned = data.core?.finAccounts.some(row => holdingsByProduct[code]?.test(row.name)) ?? false;
  const existing =
    data.core?.opportunities.some(
      row =>
        !/^Closed\b/i.test(row.stage) &&
        row.name.toLowerCase().includes(householdProductLabel(code).toLowerCase())
    ) ?? false;
  const history = (data.signals?.productHistory.rows ?? [])
    .filter(row => text(row.code) === code && number(row.probability) != null)
    .map(row => ({ month: text(row.period), score: Number(row.probability) }));
  const create = (kind: 'Task' | 'Opportunity') => {
    if (!selected) return;
    propose(
      kind,
      `${householdProductLabel(selected.code)} · ${name}`,
      {
        Id: '',
        EvidenceKind: { value: 'Offer eligibility' },
        ProductCode: { value: code }, Product: { value: householdProductLabel(code) },
        AccountName: { value: name }, Amount: { value: selected.value },
        EvidencePeriod: { value: text(selected.period, '') },
        Type: { value: code },
      },
      account.Id
    );
  };
  return (
    <div className="wcare">
      <Panel title="Household opportunities">
        <div className="wa-capitalpath">
          <div>
            <span>Outside investments</span>
            <strong>{formatMoney(institution?.balance)}</strong>
            <small>{institution?.institution || 'No qualifying outside assets returned'}</small>
          </div>
          <i aria-hidden="true">↔</i>
          <div className="wa-capitalhub">
            <span className="wa-avatar">{initials(name)}</span>
            <strong>{name}</strong>
            <small>My household conversation</small>
          </div>
          <i aria-hidden="true">↔</i>
          <div>
            <span>Investment accounts on file</span>
            <strong>{formatCount(investmentAccounts?.length)}</strong>
            <small>Accounts in the loaded source</small>
          </div>
        </div>
        {selected ? (
          <>
            <label className="wa-field">
              Product
              <select value={code} onChange={event => view.set({ product: event.target.value })}>
                {records.map(row => (
                  <option key={text(row.code)} value={text(row.code)}>
                    {householdProductLabel(row.code)}
                  </option>
                ))}
              </select>
            </label>
            <div className="wa-offer">
              <div>
                <span className="wa-pill">{householdProductLabel(selected.code)}</span>
                <h3>
                  {numericScore(selected.probability)}
                  <small>modeled conversion</small>
                </h3>
                <div className="wa-meter">
                  <i style={{ width: `${Math.max(0, Math.min(100, number(selected.probability) ?? 0))}%` }} />
                </div>
              </div>
              <div className="wa-pair">
                <Metric label="Modeled expected value" value={formatMoney(number(selected.value))} />
                <Metric label="Recommendation rank" value={text(selected.rank)} />
              </div>
              <ScoreHistory key={code} cell={{ owned: false, history }} />
              <div className="wa-actions">
                <button className="primary" onClick={() => create('Task')}>
                  Prepare follow-up
                </button>
                {data.core && !owned && !existing ? (
                  <button className="secondary" onClick={() => create('Opportunity')}>
                    Propose opportunity
                  </button>
                ) : (
                  <span className="wa-pill">
                    {owned
                      ? 'Product already on file'
                      : existing
                        ? 'Opportunity already open'
                        : 'Ownership evidence unavailable'}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          empty(source)
        )}
      </Panel>
      <Panel title="CRM opportunities on file">
        <div className="atlas-wealth-cards">
          {data.core?.opportunities.map(row => (
            <article key={row.id}>
              <h3>{row.name}</h3>
              <p>
                {row.stage} · {formatMoney(row.amount)}
              </p>
              <small>{row.closeDate}</small>
            </article>
          ))}
        </div>
        {!data.core?.opportunities.length && <p className="wcare-empty">No CRM opportunities available.</p>}
      </Panel>
    </div>
  );
}

function Screening({ account, data, propose }: Content) {
  const source = data.signals?.screening;
  const row = source?.rows[0];
  const flag = (value: unknown) =>
    value == null ? 'Not supplied' : value === true || value === 'true' ? 'Source hit' : 'No source hit';
  return (
    <div className="wcare">
      <Panel title="Dated screening evidence">
        {row ? (
          <>
            <div className="wcare-screening">
              <div>
                <span>Source risk rating</span>
                <strong>{text(row.rating)}</strong>
              </div>
              <div>
                <span>Last screened</span>
                <strong>{day(row.dt)}</strong>
              </div>
            </div>
            <div className="wcare-screening-flags">
              {[
                ['Sanctions', row.sanc],
                ['PEP', row.pep],
                ['Adverse media', row.media],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{String(label)}</span>
                  <strong>{flag(value)}</strong>
                </div>
              ))}
            </div>
            <EvidenceActions account={account} domain="Screening record" row={row} propose={propose} />
            <p className="wcare-source">
              Source screening observations remain separate from compliance dispositions.
            </p>
          </>
        ) : (
          empty(source)
        )}
      </Panel>
    </div>
  );
}

function Notebook({ data }: Content) {
  return (
    <div className="wcare">
      <Panel title="Source notes" detail="Meeting notes on file.">
        <div className="wrp-native-notes">
          {data.core?.meetingNotes.map(row => (
            <article className="wrp-source-note" key={row.id}>
              <small>{row.date}</small>
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </article>
          ))}
        </div>
        {!data.core?.meetingNotes.length && <p className="wcare-empty">No source notes available.</p>}
      </Panel>
    </div>
  );
}
