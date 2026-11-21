import { Link } from 'react-router';
import { useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import {
  field,
  fetchPlanSummary,
  fetchProviderPlans,
  fetchRecords,
  relation,
  stringField,
  type ProviderPlan,
  type RecordNode,
} from './wealthAtlasData';
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
  numericField,
  dates,
  today,
  initials,
  matches,
  goalAccount,
  RecordDialog,
  Calendar,
} from './wealthAtlasUi';
const eventAccount = (event: RecordNode | undefined) => relation(relation(event, 'PrimaryPerson'), 'Account');

const momentColors = { family: 'var(--tone-accent)', work: '#437f83', home: '#ac775b', other: '#687994' };
function momentCategory(type: string): keyof typeof momentColors {
  if (/Baby|Birth|Marriage|Graduation/i.test(type)) return 'family';
  if (/Job|Retirement/i.test(type)) return 'work';
  if (/Home|Relocation|Car/i.test(type)) return 'home';
  return 'other';
}

function ProviderDetail({ row, name, review }: { row: ProviderPlan; name: string; review?: boolean }) {
  const success = Math.min(100, Math.max(0, row.success ?? 0));
  return (
    <article className="wl-plan-focus">
      <header>
        <span className="wl-seal">{initials(name)}</span>
        <div>
          <small>{row.status} · PROVIDER FINANCIAL PLAN</small>
          <h3>{name}</h3>
        </div>
      </header>
      <div className="wl-plan-map">
        <div className="wl-success" style={{ '--wl-value': `${success}%` } as CSSProperties}>
          <span>
            <strong>{formatPct(row.success)}</strong>
            <small>modeled success</small>
          </span>
        </div>
        <div className="wl-plan-branches">
          <div>
            <i>01</i>
            <span>
              Goal exposure<strong>{formatMoney(row.goal_usd)}</strong>
              <small>{formatCount(row.goals)} provider goals</small>
            </span>
          </div>
          <div>
            <i>02</i>
            <span>
              Retirement target
              <strong>{row.retirement_age == null ? '—' : `Age ${row.retirement_age}`}</strong>
              <small>{formatMoney(row.monthly_income)} monthly income target</small>
            </span>
          </div>
          <div>
            <i>03</i>
            <span>
              Investment approach<strong>{row.allocation || '—'}</strong>
              <small>Updated {formatDate(row.updated)}</small>
            </span>
          </div>
        </div>
      </div>
      <footer>
        <span>
          Next review <strong>{formatDate(row.next_review)}</strong>
        </span>
        <div className="wl-actions">
          {review && row.status !== 'Draft' && (
            <Link className="secondary" to={`/health?reviewAccount=${row.account_id}`}>
              Open review horizon
            </Link>
          )}
          <HouseholdLink id={row.account_id} className="text-button" />
        </div>
      </footer>
    </article>
  );
}

export function LifeAndGoals({ ownerId, propose }: { ownerId: string; propose: OpenProposal }) {
  const view = useWorkspaceView();
  const moments = useAsyncData(() => fetchRecords(ownerId, 'PersonLifeEvent'), [ownerId]);
  const goals = useAsyncData(() => fetchRecords(ownerId, 'FinancialGoal'), [ownerId]);
  const crmPlans = useAsyncData(() => fetchRecords(ownerId, 'FinancialPlan'), [ownerId]);
  const provider = useAsyncData(() => fetchProviderPlans(ownerId), [ownerId]);
  const [reviewing, setReviewing] = useState<RecordNode | null>(null);
  const [create, setCreate] = useState<'life' | 'goal' | null>(null);
  const mode = view.get('lifeMode', 'overview');
  const query = view.get('lifeQuery');
  const status = view.get('lifePlanStatus', 'all');
  const category = view.get('lifeCategory', 'all');
  const limit = Number(view.get('lifeLimit')) || 3;
  const currentMonth = today().slice(0, 7);
  const homeName = (account: RecordNode | undefined) => stringField(account, 'Name') || 'Linked household';
  const events = (moments.data?.rows ?? []).filter(event =>
    matches(query, homeName(eventAccount(event)), stringField(event, 'Name'), stringField(event, 'EventType'))
  );
  const ordered = events.slice().sort((left, right) => {
    const a = stringField(left, 'EventDate'),
      b = stringField(right, 'EventDate');
    return (
      Number(b >= today()) - Number(a >= today()) || (a >= today() ? a.localeCompare(b) : b.localeCompare(a))
    );
  });
  const groups = {
    all: 'All moments',
    family: 'Family & legacy',
    work: 'Work & retirement',
    home: 'Home & new chapters',
    other: 'Other moments',
  };
  const activeCategory = Object.prototype.hasOwnProperty.call(groups, category)
    ? category
    : momentCategory(category === 'Career' ? 'Job' : category === 'Education' ? 'Graduation' : category);
  const family = (value: string) =>
    /birth|baby|marriage/i.test(value)
      ? 'Family'
      : /home|relocation/i.test(value)
        ? 'Home'
        : /job/i.test(value)
          ? 'Career'
          : /graduation/i.test(value)
            ? 'Education'
            : /retirement/i.test(value)
              ? 'Retirement'
              : 'Other';
  const stories = ordered.filter(
    event => activeCategory === 'all' || momentCategory(stringField(event, 'EventType')) === activeCategory
  );
  const datesInSource = events
    .map(item => dates(stringField(item, 'EventDate')))
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
  const months = Array.from(new Set([currentMonth, ...datesInSource.map(value => value.slice(0, 7))])).sort();
  const defaultMonth = datesInSource.some(date => date.startsWith(currentMonth))
    ? currentMonth
    : (months.filter(value => value !== currentMonth).slice(-1)[0] ?? currentMonth);
  const month = view.get('lifeMonth', defaultMonth);
  const monthMoments = datesInSource.filter(date => date.startsWith(month)).length;
  const day = view.get('lifeDay');
  const agenda = events.filter(event =>
    day ? dates(stringField(event, 'EventDate')) === day : stringField(event, 'EventDate').startsWith(month)
  );
  const providerPlans = (provider.data ?? []).filter(
    plan =>
      (status === 'all' || plan.status === status) &&
      matches(query, plan.account_id, plan.account_name || '', plan.status, plan.allocation || '')
  );
  const plan = providerPlans.find(item => item.account_id === view.get('lifePlan')) ?? providerPlans[0];
  const goalRows = (goals.data?.rows ?? []).filter(item =>
    matches(
      query,
      homeName(goalAccount(item)),
      stringField(item, 'Name'),
      stringField(item, 'Type'),
      stringField(item, 'Status')
    )
  );
  const seen = (key: string) => mode === 'overview' || mode === key;
  return (
    <div className="wa ws wl-studio">
      <header className="wl-heading">
        <div>
          <small>MY ADVISORY BOOK</small>
          <h1>Life, plans &amp; goals</h1>
          <p>Know what is changing. See what is planned. Help fund what matters.</p>
        </div>
        <button className="primary" onClick={() => setCreate('life')}>
          Log life event
        </button>
      </header>
      <div className="wl-bookline">
        <span>
          <strong>{formatCount(moments.data?.total)}</strong> recorded life moments
        </span>
        <span>
          <strong>{formatCount(provider.data?.length)}</strong> provider plans loaded
        </span>
        <span>
          <strong>{formatCount(goals.data?.total)}</strong> CRM funding goals
        </span>
        <small>As of {formatDate(today())}</small>
      </div>
      <div className="wl-toolbar">
        <Tabs
          label="Life and goals views"
          items={[
            ['overview', 'Overview'],
            ['moments', 'Life moments'],
            ['plans', 'Financial plans'],
            ['goals', 'Goal funding'],
          ]}
          value={mode}
          onChange={value => view.set({ lifeMode: value })}
        />
        <form
          onSubmit={event => {
            event.preventDefault();
            view.set({
              lifeQuery: String(new FormData(event.currentTarget).get('query') ?? ''),
              lifeDay: '',
              lifeLimit: '',
            });
          }}
        >
          <label>
            <span className="sr-only">Search households, moments or goals</span>
            <input
              key={query}
              name="query"
              defaultValue={query}
              placeholder="Find a household, moment or goal…"
            />
          </label>
          <button>Search</button>
        </form>
        <button
          onClick={() =>
            view.set({
              lifeMode: '',
              lifeQuery: '',
              lifeCategory: '',
              lifeMonth: '',
              lifeDay: '',
              lifePlan: '',
              lifePlanStatus: '',
              lifeLimit: '',
            })
          }
        >
          Reset view
        </button>
      </div>
      {seen('moments') && (
        <>
          <section className="wl-calendar">
            <header>
              <div>
                <small>MY MOMENTS CALENDAR</small>
                <h2>{monthMoments} recorded {monthMoments === 1 ? 'moment' : 'moments'}</h2>
              </div>
              <select
                aria-label="Calendar month"
                value={month}
                onChange={event => view.set({ lifeMonth: event.target.value, lifeDay: '' })}
              >
                {months.map(value => (
                  <option key={value} value={value}>
                    {new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </option>
                ))}
              </select>
            </header>
            <p className="wl-calendar-note">
              Calendar selections focus this agenda. The stories below include all loaded dates.
            </p>
            <div className="wl-calendar-body">
              <Calendar
                days={datesInSource}
                chosen={day}
                month={month}
                select={value => view.set({ lifeDay: value })}
              />
              <div className="wl-agenda">
                <small>{day ? formatDate(day) : 'IN THIS CALENDAR MONTH'}</small>
                {agenda.slice(0, 5).map(event => (
                  <div key={event.Id}>
                    <time>{stringField(event, 'EventDate').slice(8, 10)}</time>
                    <span>
                      <strong>{homeName(eventAccount(event))}</strong>
                      <small>
                        {stringField(event, 'EventType')} · {stringField(event, 'Name')}
                      </small>
                    </span>
                    <button className="text-button" onClick={() => setReviewing(event)}>
                      Review
                    </button>
                  </div>
                ))}
                {!agenda.length && <SourceState source={moments} empty="No matching moments this month." />}
                {day && (
                  <button className="secondary" onClick={() => view.set({ lifeDay: '' })}>
                    Clear selected day
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="wl-chapter">
            <header>
              <div>
                <small>LIFE MOMENTS</small>
                <h2>Household life events</h2>
                <p>Upcoming first, then most recently recorded.</p>
              </div>
              <span>{stories.length} matching records</span>
            </header>
            <Tabs
              label="Moment category"
              className="wl-categories"
              items={Object.entries(groups)}
              value={activeCategory}
              onChange={value => view.set({ lifeCategory: value, lifeLimit: '' })}
            />
            <div className="wl-stories ws-moment-stories wa-moments">
              {stories.slice(0, limit).map(event => (
                <article key={event.Id} data-event={stringField(event, 'EventType')} style={{ '--wl-ink': momentColors[momentCategory(stringField(event, 'EventType'))] } as CSSProperties}>
                  <div className="wl-story-art">
                    <MomentArt kind={family(stringField(event, 'EventType'))} />
                    <time>{formatDate(stringField(event, 'EventDate'))}</time>
                  </div>
                  <div className="wl-story-copy">
                    <small>
                      {stringField(event, 'EventType')} ·{' '}
                      {stringField(event, 'EventDate') < today()
                        ? 'Recorded past moment'
                        : 'Upcoming source moment'}
                    </small>
                    <h3>{homeName(eventAccount(event))}</h3>
                    <p>{stringField(event, 'Name')}</p>
                    <span>{stringField(relation(event, 'PrimaryPerson'), 'Name') || 'Linked Contact'}</span>
                    <div className="wl-actions">
                      <button className="secondary" onClick={() => setReviewing(event)}>
                        Review moment
                      </button>
                      <HouseholdLink id={eventAccount(event)?.Id ?? ''} className="text-button" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!stories.length && <SourceState source={moments} />}
            {stories.length > limit && (
              <button onClick={() => view.set({ lifeLimit: String(limit + 6) })}>
                Show {Math.min(6, stories.length - limit)} more moments
              </button>
            )}
          </section>
        </>
      )}
      {seen('plans') && (
        <section className="wl-chapter">
          <header>
            <div>
              <small>FINANCIAL PLANS</small>
              <h2>Household financial plans</h2>
              <p>Provider planning evidence. Modeled success and CRM funding have separate sources.</p>
            </div>
            <label>
              Status{' '}
              <select
                value={status}
                onChange={event => view.set({ lifePlanStatus: event.target.value, lifePlan: '' })}
              >
                {['all', 'Active', 'Stale', 'Draft'].map(value => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All plan statuses' : value}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <div className="wl-plan-status">
            {['Active', 'Stale', 'Draft'].map(value => (
              <div key={value}>
                <i className={value.toLowerCase()} />
                <strong>{formatCount(provider.data?.filter(plan => plan.status === value).length)}</strong>
                <span>{value}</span>
              </div>
            ))}
            <small>{providerPlans.length} matching loaded provider plans</small>
          </div>
          {plan ? (
            <div className="wl-plan-desk">
              <div className="wl-plan-list" tabIndex={0} aria-label="Matching provider financial plans">
                {providerPlans.map(row => (
                  <button
                    key={row.account_id}
                    aria-pressed={row === plan}
                    onClick={() => view.set({ lifePlan: row.account_id })}
                  >
                    <span className="wl-mini-seal">
                      <Users size={18} />
                    </span>
                    <span>
                      <strong>{row.account_name || `Household …${row.account_id.slice(-6)}`}</strong>
                      <small>
                        {row.status} · {formatDate(row.next_review)}
                      </small>
                    </span>
                    <b>{formatPct(row.success)}</b>
                  </button>
                ))}
              </div>
              <ProviderDetail
                row={plan}
                name={plan.account_name || `Household …${plan.account_id.slice(-6)}`}
                review
              />
            </div>
          ) : (
            <SourceState source={provider} />
          )}
        </section>
      )}
      {seen('goals') && (
        <section className="wl-chapter">
          <header>
            <div>
              <small>FUNDED GOALS</small>
              <h2>Goal funding progress</h2>
              <p>CRM FinancialGoal records linked through their FinancialPlan.</p>
            </div>
            <button className="primary" onClick={() => setCreate('goal')}>
              Create goal proposal
            </button>
          </header>
          <div className="wl-goals">
            {goalRows.map(goal => {
              const recorded = field(goal, 'ActualAmount'),
                target = field(goal, 'TargetAmount');
              const percent =
                recorded != null && Number(target) > 0 ? (Number(recorded) / Number(target)) * 100 : null;
              return (
                <article key={goal.Id} data-goal={stringField(goal, 'Type')} data-funded={percent != null && percent >= 100}>
                  <header>
                    <span className="wl-tag">{stringField(goal, 'Type') || 'Goal'}</span>
                    <small data-priority={stringField(goal, 'Priority')}>{stringField(goal, 'Priority')}</small>
                  </header>
                  <div className="wl-goal-landscape">
                    <MomentArt kind={family(stringField(goal, 'Name'))} />
                    <div>
                      <strong>{formatPct(percent)}</strong>
                      <span>funded</span>
                    </div>
                  </div>
                  <h3>{stringField(goal, 'Name')}</h3>
                  <p>{homeName(goalAccount(goal))}</p>
                  <div className="wl-funding-track">
                    <i style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
                  </div>
                  <div className="wl-funding-values">
                    <span>
                      Recorded<strong>{formatMoney(recorded == null ? null : Number(recorded))}</strong>
                    </span>
                    <span>
                      Target<strong>{formatMoney(target == null ? null : Number(target))}</strong>
                    </span>
                  </div>
                  <footer>
                    <span>
                      {stringField(goal, 'Status')}
                      <small>Target {formatDate(stringField(goal, 'TargetDate'))}</small>
                    </span>
                    <button
                      className="secondary"
                      onClick={() => propose('Goal', stringField(goal, 'Name'), goal, goalAccount(goal)?.Id)}
                    >
                      Review goal
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
          {!goalRows.length && <SourceState source={goals} />}
        </section>
      )}
      {reviewing && (
        <RecordDialog close={() => setReviewing(null)} title={stringField(reviewing, 'Name')}>
          <p>
            {homeName(eventAccount(reviewing))} · {stringField(reviewing, 'EventType')} ·{' '}
            {formatDate(stringField(reviewing, 'EventDate'))}
          </p>
          <button
            className="secondary"
            onClick={() => {
              propose('Life event', stringField(reviewing, 'Name'), reviewing, eventAccount(reviewing)?.Id);
              setReviewing(null);
            }}
          >
            Propose changes
          </button>
        </RecordDialog>
      )}
      {create && (
        <RecordDialog
          close={() => setCreate(null)}
          title={create === 'life' ? 'Log life event' : 'Create goal proposal'}
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const rows = create === 'life' ? moments.data?.rows : crmPlans.data?.rows;
              const node = rows?.find(item => item.Id === values.get('record'));
              const source = create === 'life' ? relation(node, 'PrimaryPerson') : node;
              const account = create === 'life' ? eventAccount(node) : relation(node, 'Account');
              if (!source || !account || !node) return;
              propose(
                create === 'life' ? 'Life event' : 'Goal',
                String(values.get('title')),
                source,
                account.Id
              );
              setCreate(null);
            }}
          >
            <label className="wa-field">
              Name
              <input name="title" required />
            </label>
            <label className="wa-field">
              {create === 'life' ? 'Contact on file' : 'Financial plan'}
              <select name="record" required>
                <option value="">Choose a source record…</option>
                {(create === 'life'
                  ? (moments.data?.rows ?? []).filter(
                      (row, index, all) =>
                        relation(row, 'PrimaryPerson') &&
                        all.findIndex(
                          item => relation(item, 'PrimaryPerson')?.Id === relation(row, 'PrimaryPerson')?.Id
                        ) === index
                    )
                  : (crmPlans.data?.rows ?? [])
                ).map(row => (
                  <option key={row.Id} value={row.Id}>
                    {create === 'life'
                      ? stringField(relation(row, 'PrimaryPerson'), 'Name')
                      : `${stringField(row, 'Name')} · ${homeName(relation(row, 'Account'))}`}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary">Prepare proposal</button>
          </form>
        </RecordDialog>
      )}
    </div>
  );
}

function MomentArt({ kind }: { kind: string }) {
  const shapes: Record<string, string> = {
    Retirement: 'M20 82h140M30 65h120M45 50a45 45 0 0 1 90 0M90 8v12M32 22l12 12M148 22l-12 12',
    Family: 'M90 84S28 48 45 26c15-18 35-5 45 8 10-13 30-26 45-8 17 22-45 58-45 58ZM20 85h140M35 95h110',
    Education: 'm24 40 66-26 66 26-66 26-66-26Zm25 12v28q41 25 82 0V52M151 45v38',
    Career: 'M34 35h112v62H34ZM69 35V20h42v15M34 58q56 31 112 0M82 64h16v15H82Z',
    Home: 'm30 52 60-38 60 38M44 45v52h92V45M78 97V65h25v32M53 57h13v15H53Z',
  };
  return (
    <svg viewBox="0 0 180 112" aria-hidden="true">
      <circle cx="90" cy="58" r="49" fill="currentColor" opacity=".08" />
      <path
        d={shapes[kind] ?? 'M35 85h110M48 85V60h25v25M78 85V40h25v45M108 85V20h25v65M35 23l20-8 10 22'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const reviewLenses = [
  ['due', 'Due in 30 days'],
  ['risk', 'Plan attention'],
  ['critical', 'Below 50%'],
  ['stale', 'Stale'],
  ['all', 'All plans'],
] as const;
const planName = (row: ProviderPlan) => row.account_name || `Household …${row.account_id.slice(-6)}`;

export function Horizon({ ownerId, propose }: { ownerId: string; propose: OpenProposal }) {
  const view = useWorkspaceView();
  const requestedMode = view.get('reviewMode');
  const lens = reviewLenses.find(([key]) => key === requestedMode)?.[0] ?? 'due';
  const focus = view.get('reviewAccount');
  const [source, setSource] = useState<ProviderPlan | null>(null);
  const summary = useAsyncData(() => fetchPlanSummary(ownerId), [ownerId]);
  const plans = useAsyncData(() => fetchProviderPlans(ownerId, lens, focus), [ownerId, lens, focus]);
  const goals = useAsyncData(() => fetchRecords(ownerId, 'FinancialGoal'), [ownerId]);
  const rows = plans.loading || plans.error ? [] : (plans.data ?? []);
  const selected = rows.find(item => item.account_id === focus) ?? rows[0];
  const plotted = rows.filter(row => row.success != null && Number.isFinite(Date.parse(row.next_review)));
  const start = Math.min(Date.parse(today()), ...plotted.map(row => Date.parse(row.next_review)));
  const end = Math.max(start + 30 * 86400000, ...plotted.map(row => Date.parse(row.next_review)));
  const y = (success: number) => 235 - success * 1.95;
  const totals = summary.data;
  const total = Number(totals?.plans) || 0,
    critical = Number(totals?.critical) || 0,
    risk = Number(totals?.at_risk) || 0;
  const segments = [
    { label: 'Below 50%', number: critical, offset: 0, fill: '#b37775', key: 'critical' },
    { label: '50–under 70%', number: risk - critical, offset: critical, fill: 'var(--tone-plot)', key: 'risk' },
    { label: 'Outside attention tier', number: total - risk, offset: risk, fill: 'var(--tone-mid)', key: 'all' },
  ];
  const householdGoals = selected
    ? (goals.data?.rows.filter(goal => goalAccount(goal)?.Id === selected.account_id) ?? [])
    : [];
  const select = (row: ProviderPlan) => view.set({ reviewAccount: row.account_id });
  return (
    <div className="wa ws ws-review">
      <header className="ws-heading">
        <div>
          <h1>Upcoming household reviews</h1>
          <p>Review dates, plan status and modeled success by household.</p>
        </div>
      </header>
      <section className="ws-review-opening">
        <div>
          <h2>Planning portfolio</h2>
          {totals && !summary.error ? (
            <div className="ws-plan-distribution">
              <svg viewBox="0 0 200 200" role="img" aria-label={`${total} active or stale plans`}>
                <circle cx="100" cy="100" r="72" fill="none" stroke="var(--tone-wash)" strokeWidth="18" />
                {total > 0 &&
                  segments.map(segment => (
                    <circle
                      key={segment.key}
                      cx="100"
                      cy="100"
                      r="72"
                      fill="none"
                      stroke={segment.fill}
                      strokeWidth="18"
                      pathLength="100"
                      strokeDasharray={`${(segment.number / total) * 100} 100`}
                      strokeDashoffset={(-segment.offset / total) * 100}
                      transform="rotate(-90 100 100)"
                    />
                  ))}
                <text x="100" y="98" textAnchor="middle" className="ws-ring-number">
                  {formatCount(total)}
                </text>
                <text x="100" y="121" textAnchor="middle">
                  active / stale plans
                </text>
              </svg>
              <div>
                {segments.map(segment => (
                  <button
                    key={segment.key}
                    onClick={() => view.set({ reviewMode: segment.key, reviewAccount: '' })}
                  >
                    <i style={{ background: segment.fill }} />
                    <span>{segment.label}</span>
                    <strong>{formatCount(segment.number)}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <SourceState source={summary} />
          )}
        </div>
        <div className="ws-review-summaries">
          <Metric
            label="Reviews in 30 days"
            value={formatCount(totals?.due30)}
            detail="Provider review dates"
          />
          <Metric
            label="Stale plans"
            value={formatCount(totals?.stale)}
            detail="Provider status or 12 months since update"
          />
          <Metric
            label="Goal value in at-risk plans"
            value={formatMoney(totals?.at_risk_goal_usd)}
            detail="Provider goal exposure"
          />
        </div>
      </section>
      <Tabs
        className="ws-modebar"
        label="Review horizon lenses"
        items={reviewLenses}
        value={lens}
        onChange={value => view.set({ reviewMode: value, reviewAccount: '' })}
      />
      <div className="ws-review-desk wa-reviewlayout">
        <div className="ws-review-column">
          <div className="ws-risk-map">
            <div className="ws-chart-heading">
              <h2>Households due for review</h2>
              <span>{plotted.length} plans plotted</span>
            </div>
            {plotted.length ? (
              <svg viewBox="0 0 760 300" role="group" aria-label="Modeled plan success versus review date">
                <rect x="50" y="40" width="675" height="58.5" fill="var(--tone-pale)" />
                <rect x="50" y="98.5" width="675" height="39" fill="var(--tone-wash)" />
                <rect x="50" y="137.5" width="675" height="97.5" fill="#f3e5e4" />
                {[0, 50, 70, 100].map(value => (
                  <g key={value}>
                    <line
                      x1="50"
                      x2="725"
                      y1={y(value)}
                      y2={y(value)}
                      stroke="var(--tone-border)"
                      strokeDasharray="3 5"
                    />
                    <text x="39" y={y(value) + 4} textAnchor="end">
                      {value}%
                    </text>
                  </g>
                ))}
                {plotted.map(row => (
                  <g
                    role="button"
                    tabIndex={0}
                    key={row.account_id}
                    onClick={() => select(row)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        select(row);
                      }
                    }}
                    aria-label={`${planName(row)}, ${formatPct(row.success)} modeled success`}
                  >
                    <circle
                      cx={50 + ((Date.parse(row.next_review) - start) / (end - start)) * 675}
                      cy={y(Number(row.success))}
                      r={selected === row ? 11 : 7}
                      fill={
                        Number(row.success) < 50
                          ? '#ab6667'
                          : Number(row.success) < 70
                            ? 'var(--tone-mid)'
                            : 'var(--tone-accent)'
                      }
                      stroke={selected === row ? 'var(--tone-deep)' : '#fff'}
                      strokeWidth={selected === row ? 3 : 2}
                    />
                    <title>
                      {planName(row)} · {formatDate(row.next_review)}
                    </title>
                  </g>
                ))}
                <text x="50" y="268">
                  {formatDate(new Date(start).toISOString())}
                </text>
                <text x="725" y="268" textAnchor="end">
                  {formatDate(new Date(end).toISOString())}
                </text>
              </svg>
            ) : (
              <SourceState source={plans} empty="No dated provider probabilities match this lens." />
            )}
          </div>
          <div className="ws-review-list">
            <header>
              <h2>Households to review</h2>
              <small>{rows.length} loaded matches</small>
            </header>
            {rows.map(row => (
              <article className={row === selected ? 'selected' : ''} key={row.account_id}>
                <button onClick={() => select(row)}>
                  <span className="ws-household-seal">{initials(planName(row))}</span>
                  <span>
                    <strong>{planName(row)}</strong>
                    <small>
                      {formatDate(row.next_review)} · {row.stale ? 'Stale' : 'Provider review'}
                    </small>
                  </span>
                  <b>{formatPct(row.success)}</b>
                </button>
                <div className="ws-planrow-actions">
                  <button className="secondary" onClick={() => setSource(row)}>
                    Review source
                  </button>
                  <HouseholdLink id={row.account_id} className="text-button" />
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className="ws-plan-focus">
          {selected ? (
            <>
              <div className="ws-folder-tab">The review I am preparing</div>
              <div className="ws-planfocus wa-planfocus">
                <div
                  className="ws-success-dial"
                  style={{ '--ws-success': `${selected.success ?? 0}%` } as CSSProperties}
                >
                  <div>
                    <strong>{formatPct(selected.success)}</strong>
                    <span>modeled success</span>
                  </div>
                </div>
                <div>
                  <h2>{planName(selected)}</h2>
                  <p>Next provider review {formatDate(selected.next_review)}</p>
                  <p className="ws-source">Updated {formatDate(selected.updated)}</p>
                </div>
              </div>
              <div className="ws-focus-actions">
                <button
                  className="primary"
                  onClick={() =>
                    propose(
                      'Meeting',
                      `Review meeting for ${planName(selected)}`,
                      undefined,
                      selected.account_id
                    )
                  }
                >
                  Propose review meeting
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    propose(
                      'Review folio',
                      `Review for ${planName(selected)}`,
                      undefined,
                      selected.account_id
                    )
                  }
                >
                  Build review folio
                </button>
                <HouseholdLink className="text-button" id={selected.account_id}>
                  Open plans &amp; goals
                </HouseholdLink>
              </div>
              <div className="ws-review-prep">
                <h3>Review considerations</h3>
                <div>
                  <Metric label="Provider goal total" value={formatMoney(selected.goal_usd)} />
                  <Metric label="Goals in provider plan" value={formatCount(selected.goals)} />
                  <Metric label="Target retirement age" value={formatCount(selected.retirement_age)} />
                  <Metric
                    label="Monthly income target"
                    value={formatMoney(selected.monthly_income)}
                    detail="Planning assumption"
                  />
                </div>
                {selected.allocation && (
                  <p>
                    Provider allocation recommendation <strong>{selected.allocation}</strong>
                  </p>
                )}
              </div>
              <div className="ws-source-divider">
                <h3>CRM goal funding</h3>
                {householdGoals.map(goal => (
                  <p key={goal.Id}>
                    {stringField(goal, 'Name')} · {formatMoney(numericField(goal, 'ActualAmount'))} /{' '}
                    {formatMoney(numericField(goal, 'TargetAmount'))}
                  </p>
                ))}
                {!householdGoals.length && (
                  <SourceState source={goals} empty="No linked goals in the loaded source records." />
                )}
              </div>
            </>
          ) : (
            <SourceState source={plans} empty="Choose another planning lens to inspect a household." />
          )}
        </aside>
      </div>
      {source && (
        <RecordDialog title={`Provider source · ${planName(source)}`} close={() => setSource(null)}>
          <ProviderDetail row={source} name={planName(source)} />
        </RecordDialog>
      )}
    </div>
  );
}
