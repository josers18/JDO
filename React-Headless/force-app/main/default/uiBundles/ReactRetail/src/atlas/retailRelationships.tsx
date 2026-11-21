import { atlasChartColors } from '@shared/components/atlas/atlasChartColors';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { LEAD_SOURCE_OPTIONS, LEAD_STATUS_OPTIONS } from '@shared/components/home/types';
import { bookNames, field, label, numeric, readBook, readSource, type BookNode } from './retailData';
import { AccountLink, Choices, count, date, Facts, Header, initials, money, Paging, RecordLink, relationship, Search, SourceNotice, text, Title, useCrmList, useFilters, useSource, useWorkspace } from './retailUi';

function useDebounced(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const wait = window.setTimeout(() => setSettled(value), 250);
    return () => window.clearTimeout(wait);
  }, [value]);
  return settled;
}

export function Relationships({ ownerId, ownerName }: { ownerId: string; ownerName?: string }) {
  const { open, pins, togglePin } = useWorkspace();
  const { params, update, choice } = useFilters();
  const q = params.get('q') ?? '';
  const search = useDebounced(q);
  const selectedId = params.get('account') ?? '';
  const after = params.get('cursor');
  const [recent, setRecent] = useState<string[]>([]);
  const mode = choice('view', ['landscape', 'finder'], 'landscape');
  const lens = choice('lens', ['signals', 'milestones', 'goals'], 'signals');
  const group = choice('cohort', ['all', 'service', 'goals', 'milestones'], 'all');
  const pinned = choice('pinned', ['all', 'only'], 'all') === 'only';
  const groupIds = useSource(`${ownerId}:${group}`, async () => {
    if (group === 'all') return null;
    const related = { service: 'Case', goals: 'FinancialGoal', milestones: 'PersonLifeEvent' } as const;
    const result = await readBook(related[group], ownerId, { count: 100 });
    return [...new Set(result.rows.map(row => relationship(row).id).filter(Boolean))].slice(0, 50);
  });
  const ids = pinned ? pins.filter(id => group === 'all' || groupIds.data?.includes(id)) : groupIds.data ?? (group === 'all' ? undefined : []);
  const accounts = useCrmList('Account', ownerId, { count: 12, after, search, ids });
  const exact = useSource(`selectedAccount:${ownerId}:${selectedId}`, async () =>
    selectedId ? readBook('Account', ownerId, { record: selectedId, count: 1 }) : null);
  const rows = accounts.data?.rows ?? [];
  const selected = selectedId ? rows.find(row => row.Id === selectedId) ?? exact.data?.rows[0] : rows[0];
  const recentNames = useCrmList('Account', ownerId, { count: 4, ids: recent.slice(0, 4) });
  const [history, setHistory] = useState<Array<string | null>>([]);
  function select(id: string) {
    update({ account: id });
    setRecent(values => [id, ...values.filter(value => id !== value)].slice(0, 4));
  }
  function filter(patch: Record<string, string | null>, replace = false) {
    setHistory([]);
    update({ ...patch, account: null, cursor: null }, replace);
  }
  return <>
    <Header title="Customer relationships" description="Search your book and review customer priorities."><button className="secondary" onClick={() => open({ kind: 'lead' })}>New lead</button></Header>
    <div className="toolbar retail-relationship-toolbar"><div><input type="search" aria-label="Filter relationships" placeholder="Search name, ID, industry, or location" value={q} onChange={event => filter({ q: event.target.value }, true)} />
      <span className="small">{count(accounts.data?.totalCount)} matches</span></div>
      <Choices className="chips" items={[[ 'all','All customers' ], ['only','Pinned']]} selected={pinned ? 'only' : 'all'} update={value => filter({ pinned: value })} />
    </div>
    <Choices className="r2-switches" items={[[ 'landscape','Visual landscape' ], ['finder','Customer finder']]} selected={mode} update={value => update({ view: value })} />
    <section className="viz-workspace">
    {mode === 'landscape' && <Landscape ownerId={ownerId} ownerName={ownerName} rows={rows} selected={selected} pick={select} lens={lens} selectedId={selectedId} filtered={Boolean(q || group !== 'all' || pinned)}
      changeLens={value => update({ lens: value })} pins={pins}
      togglePin={togglePin} />}
    {selected && <section className="cx-entry" aria-label="Selected customer workspace"><div>
      <strong>Pick up {label(selected, 'Name')}’s relationship.</strong>
      <span>Financial accounts, goals, recorded conversations and follow-through.</span>
    </div><AccountLink id={selected.Id}>Open workspace</AccountLink></section>}
    <section className="r2-customer-finder" aria-label="Customer finder">
      <Title title="Customer finder" description="Search the book directly or choose a relationship below." />
      <div className="r2-finder-search retail-finder-search">
        <Search value={q} change={value => filter({ q: value }, true)} title="Name, record ID, industry, or location" placeholder="Start typing a name or identifying detail…" />
        <Choices className="r2-switches" items={[[ 'all','All customers' ], ['service','Service requests'],['goals','Financial goals'],['milestones','Life milestones']]} selected={group} update={value => filter({ cohort: value })} />
      </div>
      {group !== 'all' && <><SourceNotice source={groupIds} /><p className="source-note">Cohort filters describe a bounded set of recent source records.</p></>}
      {recentNames.data?.rows.length ? <div className="r2-recent-customers"><span>Recently viewed</span>{recentNames.data.rows.map(row =>
        <button className="secondary" key={row.Id} onClick={() => select(row.Id)}>{label(row, 'Name')}</button>)}</div> : null}
      <SourceNotice source={accounts} empty={!rows.length} />
      {selectedId && !selected && <SourceNotice source={exact} />}
      <div className="r2-match-count"><strong>{count(accounts.data?.totalCount)} matching relationships</strong></div>
      <div className="r2-customer-results" role="region" aria-label="Matching customers">{rows.map(row => <div className="r2-customer-row" key={row.Id}>
        <button className="r2-customer-name" aria-pressed={selected?.Id === row.Id} onClick={() => select(row.Id)}><span>{initials(label(row, 'Name'))}</span><strong>{label(row, 'Name')}<small>{label(row, 'Industry', label(row, 'Type'))} · {row.Id.slice(-6)}</small></strong></button>
        <span>{[label(row, 'BillingCity', ''), label(row, 'BillingState', '')].filter(Boolean).join(', ')}</span>
        <AccountLink id={row.Id} className="secondary">Open</AccountLink>
      </div>)}</div>
      {accounts.data && <Paging total={accounts.data.totalCount} shown={rows.length} offset={history.length * 12}
        previous={history.length > 0 ? () => { update({ cursor: history[history.length - 1] ?? null }); setHistory(values => values.slice(0, -1)); } : undefined}
        next={accounts.data.next ? () => { setHistory(values => [...values, after]); update({ cursor: accounts.data?.next ?? null }); } : undefined} />}
    </section>
    </section>
  </>;
}

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const milestoneGroups = [['Family & education','family'], ['Work & retirement','work'], ['Home & mobility','home'], ['Other moments','other']] as const;
const groupOf = (type: string) => /Baby|Birth|Marriage|Graduation|College/i.test(type) ? 0 :
  /Job|Retirement/i.test(type) ? 1 : /Home|Relocation|Car/i.test(type) ? 2 : 3;
export function Journey({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { params, update, choice } = useFilters();
  const mode = choice('mode', ['events', 'goals'], 'events');
  const query = params.get('q') ?? '';
  const eventType = params.get('kind') ?? '';
  const month = params.get('month') ?? 'all';
  const [storyCount, setStoryCount] = useState(6);
  const quarter = choice('quarter', ['0','1','2','3'], String(Math.floor(new Date().getMonth() / 3)) as '0' | '1' | '2' | '3');
  const [goalPage, setGoalPage] = useState<Array<string | null>>([]);
  const after = params.get('cursor');
  const root = mode === 'events' ? 'PersonLifeEvent' : 'FinancialGoal';
  const source = useCrmList(root, ownerId, mode === 'events' ? { count: 200, kind: eventType } : { count: 12, after });
  const selectedId = params.get(mode === 'events' ? 'event' : 'goal') ?? '';
  const preview = useCrmList('FinancialGoal', ownerId, { count: 3 });
  const exact = useSource(`journey:${root}:${ownerId}:${selectedId}`, async () => selectedId ? readBook(root, ownerId, { record: selectedId, count: 1 }) : null);
  const rows = source.data?.rows ?? [];
  const years = [...new Set(rows.map(row => label(row, 'EventDate', '').slice(0, 4)).filter(Boolean))];
  const year = years.find(value => value === params.get('year')) ?? years[0];
  const inYear = rows.filter(row => label(row, 'EventDate', '').startsWith(year ?? ''));
  const events = inYear.filter(row => (month === 'all' || label(row, 'EventDate', '').slice(5, 7) === month) &&
    [label(row, 'Name'), label(row, 'EventType'), relationship(row).name].some(value => value.toLowerCase().includes(query.toLowerCase())));
  const selected = selectedId ? rows.find(row => row.Id === selectedId) ?? exact.data?.rows[0] : events[0];
  const openNew = () => open({ kind: mode === 'events' ? 'life' : 'goal', onSaved: source.retry });
  return <>
    <Header title="Customer life events and goals" description="Review recorded milestones and progress toward financial goals.">
      <button className="primary" onClick={openNew}>{mode === 'goals' ? 'New goal' : 'Log life event'}</button>
    </Header>
    <div className="toolbar retail-journey-toolbar"><Choices className="chips" items={[[ 'events','Life events' ], ['goals','Financial goals']]} selected={mode}
      update={value => { setGoalPage([]); update({ mode: value, event: null, goal: null, cursor: null }); }} />
      <span className="small">{count(source.data?.rows.length)} selected records</span>
    </div>
    {mode === 'events' && <div className="toolbar retail-journey-filters">
      <Choices className="chips" items={[[ '','All' ], ...[...new Set(rows.map(row => label(row, 'EventType', '')).filter(Boolean))].map(type => [type, type] as const)]}
        selected={eventType} update={value => update({ kind: value, event: null })} />
      <input type="search" aria-label="Find a milestone" value={query} placeholder="Search a milestone or person" onChange={event => update({ q: event.target.value, event: null }, true)} />
    </div>}
    <SourceNotice source={source} empty={!rows.length} />
    {mode === 'goals' ? <div className="rv-page">
      <Title title="Financial plans" description="Your customers’ goals, progress, and target dates." />
      <div className="r2-goal-grid">{(selectedId && selected && !rows.some(row => row.Id === selectedId) ? [selected, ...rows] : rows).map(row =>
        <GoalCard key={row.Id} row={row} active={selectedId === row.Id} onReview={() => { update({ goal: row.Id }); open({ kind: 'goal', row, onSaved: source.retry }); }} />)}</div>
      {source.data && <Paging total={source.data.totalCount} shown={rows.length} offset={goalPage.length * 12}
        previous={goalPage.length ? () => { update({ cursor: goalPage[goalPage.length - 1] ?? null }); setGoalPage(values => values.slice(0, -1)); } : undefined}
        next={source.data.next ? () => { setGoalPage(values => [...values, after]); update({ cursor: source.data?.next ?? null }); } : undefined} />}
    </div> : <div className="rv-page r2-life" data-retail-view="journey">
      <nav className="retail-journey-index" aria-label="Planning dashboard sections">
        {([['retail-calendar', 'Calendar'], ['retail-milestones', 'Milestone stories'], ['retail-goal-preview', 'Financial goals']] as const)
          .map(([id, name]) => <button type="button" key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ block: 'start' })}>{name}</button>)}
      </nav>
      <div className="r2-life-top" id="retail-calendar">
        <aside className="r2-moment-counter"><div><span>Moments in your book</span><strong>{count(inYear.length)}</strong><small>{year ? `Shown for ${year}` : 'Latest milestones'}</small></div>
          <label>Explore year<select aria-label="Milestone year" value={year ?? ''} onChange={event => update({ year: event.target.value, month: null, event: null })}>
            {years.map(value => <option key={value}>{value}</option>)}</select></label>
          <div className="r2-moment-categories">{milestoneGroups.map(([name,key],i) => <span key={key}><i className={`r2-${key}`} />{name}
            <b>{inYear.filter(row => groupOf(label(row, 'EventType')) === i).length}</b></span>)}</div>
          <label>Focus month<select aria-label="Milestone month" value={month} onChange={event => update({ month: event.target.value, event: null })}>
            <option value="all">All months</option>{months.map((name,idx) => <option key={name} value={String(idx + 1).padStart(2,'0')}>{name}</option>)}</select></label>
        </aside>
        <section className="r2-year-calendar" data-active-quarter={quarter}>
          <header><div><h2>The relationship calendar</h2><span>{year ? `${year} · Recorded life events` : 'Recorded life events'}</span></div>
            <label className="r2-quarter-control">Calendar period<select aria-label="Calendar quarter" value={quarter} onChange={event => update({ quarter: event.target.value })}>
              {[0,1,2,3].map(q => <option key={q} value={q}>Q{q + 1}</option>)}</select></label>
          </header>
          <div className="r2-year-quarters">{[0,1,2,3].map(q => <div className="r2-calendar-quarter" data-quarter={q} key={q}>
            <div className="r2-grid-head"><span>{q === 0 ? 'Milestone' : ''}</span>{months.slice(q * 3, q * 3 + 3).map(name => <span key={name}>{name}</span>)}</div>
            {milestoneGroups.map(([name,key], index) => <div className="r2-grid-lane" key={key}><strong>{name}</strong>
              {[1,2,3].map(i => {
                const monthOf = String(q * 3 + i).padStart(2,'0');
                const cells = events.filter(row => label(row, 'EventDate', '').slice(5,7) === monthOf && groupOf(label(row, 'EventType')) === index);
                return <div className="r2-grid-cell" key={monthOf}>{cells.map(row => <button key={row.Id} className={`r2-day-marker r2-${key}`}
                  aria-label={`${relationship(row).name || label(row, 'Name')}: ${label(row, 'EventType')}, ${date(field(row, 'EventDate'))}`}
                  aria-pressed={selectedId === row.Id} onClick={() => { update({ event: row.Id }); requestAnimationFrame(() => document.getElementById('retail-milestones')?.scrollIntoView({ block: 'start' })); }}><span>{label(row, 'EventDate', '').slice(8,10)}</span></button>)}</div>;
              })}</div>)}
          </div>)}</div>
          <p className="rv-note">Select a date marker to bring its customer story into focus.</p>
        </section>
      </div>
      <section className="r2-stories" id="retail-milestones">
        <Title title="Customers with life events" description="Upcoming and recently recorded life events." />
        <div className="r2-story-grid">{(selected && selectedId && !events.slice(0, storyCount).some(row => row.Id === selected.Id) ? [selected, ...events.slice(0, storyCount - 1)] : events.slice(0, storyCount)).map(row => {
          const eventType = label(row, 'EventType');
          const type = milestoneGroups[groupOf(eventType)][1];
          const person = relationship(row);
          const eventDay = field(row, 'EventDate');
          const prompt = /Baby|Birth/i.test(eventType) ? 'Ask about changing family priorities and saving for the future.' :
            /Job/i.test(eventType) ? 'Review income, benefits, and payroll needs for the next chapter.' :
              /Retirement/i.test(eventType) ? 'Understand the customer’s income needs and plans for retirement.' :
                'Ask what has changed and which priorities need attention.';
          return <article className={`r2-milestone-story r2-${type}${selected?.Id === row.Id ? ' selected' : ''}`} key={row.Id}>
            <button className="r2-story-select" aria-pressed={selected?.Id === row.Id} onClick={() => update({ event: row.Id })}>
              <div className="r2-story-top"><time><span>{date(eventDay).split(' ')[0]}</span><strong>{label(row, 'EventDate', '').slice(8,10)}</strong></time><MilestoneArt type={eventType} /></div>
              <span className="r2-event-type">{eventType}</span><h3>{person.name || label(row, 'Name')}</h3><p>{label(row, 'Name')}</p>
            </button>
            <div className="r2-story-prompt"><span>Conversation starter</span><p>{prompt}</p></div>
            <footer><button className="secondary" onClick={() => open({ kind: 'life', row, onSaved: source.retry })}>Review milestone</button>
              {person.id && <button className="secondary" onClick={() => open({ kind: 'prep', ...person, context: `${label(row, 'Name')} · ${prompt}` })}>Prepare outreach</button>}
            </footer>
          </article>;
        })}</div>
        {events.length > storyCount && <button className="secondary" onClick={() => setStoryCount(n => n + 6)}>Show more customer stories</button>}
      </section>
      <section className="r2-goals" id="retail-goal-preview">
        <Title title="Customer financial goals" description="Funding and target dates give the milestones a financial context.">
          <button className="rv-link" onClick={() => update({ mode: 'goals', event: null })}>All financial goals</button></Title>
        <SourceNotice source={preview} empty={!preview.data?.rows.length} />
        <div className="r2-goal-grid">{preview.data?.rows.map(row => <GoalCard key={row.Id} row={row}
          onReview={() => open({ kind: 'goal', row, onSaved: preview.retry })} />)}</div>
      </section>
    </div>}
    {selectedId && !selected && <><SourceNotice source={exact} />{!exact.loading && <p className="source-note">This record is unavailable in the current book.</p>}</>}
  </>;
}

function MilestoneArt({ type }: { type: string }) {
  const path = /Home|Relocation|Vacation/i.test(type) ? 'm18 36 42-27 42 27M29 30v39h62V30M53 69V46h18v23M36 40h10v13H36ZM77 40h8v13h-8' :
    /Retirement/i.test(type) ? 'M20 61h80M29 61a31 31 0 0 1 62 0M60 10v9M20 26l8 8M100 26l-8 8M17 49h10M93 49h10M36 72h48' :
      /Graduation|College|Education/i.test(type) ? 'm13 30 47-19 47 19-47 19-47-19ZM31 39v21q29 15 58 0V39M104 31v32M98 67h12' :
        /Baby|Birth/i.test(type) ? 'M22 40h72a28 28 0 0 1-28 22H50A28 28 0 0 1 22 40ZM30 40V22h18M25 64l-6 7M90 64l6 7M87 12v10M82 17h10' :
          /Job/i.test(type) ? 'M24 26h70v37H24ZM46 26V15h26v11M24 42h70M51 42v9h16v-9M16 70h86' :
            'M26 64V44h16v20M52 64V31h16v33M78 64V16h16v48M17 70h90M24 23l21 7 19-15 25-7';
  return <svg className="r2-illustration" viewBox="0 0 120 82" aria-hidden="true"><path d={path} /></svg>;
}

function GoalCard({ row, active, onReview }: { row: BookNode; active?: boolean; onReview: () => void }) {
  const current = numeric(field(row, 'ActualAmount'));
  const target = numeric(field(row, 'TargetAmount'));
  const percent = current != null && target != null && target > 0 ? Math.max(0, Math.min(100, Math.round(current / target * 100))) : null;
  return <article className="r2-goal-card" data-goal-type={label(row, 'Type')} aria-current={active ? 'true' : undefined}>
    <div className="r2-goal-scene"><MilestoneArt type={label(row, 'Type')} /><span>{label(row, 'Status').replace(/_/g, ' ').toLowerCase()}</span></div>
    <div className="r2-goal-body"><h3>{label(row, 'Name')}</h3><p>{relationship(row).name}</p>
      <div className="r2-funding"><svg viewBox="0 0 100 100" role="img" aria-label={percent == null ? 'Goal funding progress unavailable' : `${percent}% funded`}>
        <circle cx="50" cy="50" r="39" fill="none" stroke="var(--m-soft)" strokeWidth="8" />
        {percent != null && <circle cx="50" cy="50" r="39" fill="none" stroke="var(--m-accent)" strokeWidth="8" pathLength="100"
          strokeDasharray={`${percent} ${100 - percent}`} transform="rotate(-90 50 50)" />}
        <text x="50" y="56" textAnchor="middle">{percent == null ? '—' : `${percent}%`}</text>
      </svg><div><strong>{money(current)}</strong><span>toward {money(target)}</span></div></div>
      <div className="r2-goal-path"><span>Recorded</span><i /><span>Funding</span><i /><span>Target</span></div>
      <footer><span>{date(field(row, 'TargetDate'))}</span><button className="secondary" onClick={onReview}>Review goal</button></footer>
    </div>
  </article>;
}

export function Prospecting({ ownerId }: { ownerId: string }) {
  const { open, drafts, saveDraft } = useWorkspace();
  const prospectNote = useRef<HTMLTextAreaElement>(null);
  const { params, update, choice } = useFilters();
  const [history, setHistory] = useState<Array<string | null>>([]);
  const mode = choice('mode', ['leads', 'introductions'], 'leads');
  const query = params.get('q') ?? '';
  const search = useDebounced(query);
  const sourceFilter = [...LEAD_SOURCE_OPTIONS, 'Web', 'Existing Customer'].find(value => value === params.get('source')) ?? '';
  const status = LEAD_STATUS_OPTIONS.find(value => value === params.get('status')) ?? '';
  const selectedId = params.get('lead') ?? '';
  const after = params.get('cursor');
  const source = useCrmList('Lead', ownerId, { search, source: sourceFilter, status, after, count: 12 });
  const total = useCrmList('Lead', ownerId, { count: 1 });
  const referrals = useCrmList('Lead', ownerId, { count: 1, source: 'Referral' });
  const exact = useSource(`lead:${ownerId}:${selectedId}`, async () => selectedId ? readBook('Lead', ownerId, { record: selectedId, count: 1 }) : null);
  const rows = source.data?.rows ?? [];
  const selected = selectedId
    ? rows.find(row => row.Id === selectedId) ?? exact.data?.rows.find(row => row.Id === selectedId)
    : rows[0];
  const filter = (change: Record<string, string | null>, replace = false) => { setHistory([]); update({ ...change, lead: null, cursor: null }, replace); };
  const prepared = drafts.filter(draft => (draft.kind === 'Lead' || draft.kind === 'Email') && draft.recordId);
  const followUp = prepared.find(draft => draft.kind === 'Lead' && draft.recordId === selected?.Id);
  const email = prepared.find(draft => draft.kind === 'Email' && draft.recordId === selected?.Id);
  const prepare = (id: string, name: string, note: string) => {
    saveDraft({ id: `lead:${id}`, kind: 'Lead', title: `Follow up with ${name}`, note, readiness: 'Working', recordId: id });
    update({ lead: id });
  };
  return <>
    <Header title={mode === 'introductions' ? 'Warm introductions' : 'Leads and referrals'}
      description={mode === 'introductions' ? 'Prepare an introduction through someone you already serve.' : 'Work referrals and inbound leads through their next contact.'}>
      <button className="secondary" onClick={() => open({ kind: 'lead', onSaved: () => { source.retry(); total.retry(); referrals.retry(); } })}>New lead or referral</button>
    </Header>
    <Choices className="biz-modes" items={[[ 'leads','Leads & referrals' ], ['introductions','Warm introductions']]} selected={mode} update={value => filter({ mode: value })} />
    {mode === 'introductions' ? <Introductions ownerId={ownerId} onSaved={() => { source.retry(); total.retry(); referrals.retry(); }} /> :
      <div className="r3-prospecting rv-page" data-retail-prospecting="">
        <div className="r3-prospect-summary"><span><strong>{count(total.data?.totalCount)}</strong> open prospects</span>
          <span><strong>{count(referrals.data?.totalCount)}</strong> referrals</span><span><strong>{new Set(prepared.map(draft => draft.recordId)).size}</strong> with local follow-up prepared</span></div>
        <div className="r3-prospect-layout">
          <aside className="r3-prospect-sources"><h2>Referral sources</h2>
            <button aria-pressed={!sourceFilter} onClick={() => filter({ source: null })}>All prospects<strong>{count(total.data?.totalCount)}</strong></button>
            <button aria-pressed={sourceFilter === 'Referral'} onClick={() => filter({ source: 'Referral' })}>Referrals<strong>{count(referrals.data?.totalCount)}</strong></button>
            <label className="r3-extra-sources">Other lead sources<select value={sourceFilter === 'Referral' ? '' : sourceFilter} onChange={event => filter({ source: event.target.value })}>
              <option value="">Choose a source</option>{['Web', 'Existing Customer', ...LEAD_SOURCE_OPTIONS.filter(value => value !== 'Referral')].map(value => <option key={value}>{value}</option>)}
            </select></label>
          </aside>
          <section className="r3-prospect-worklist" aria-label="Lead and referral worklist">
            <header><h2>Your working list <span>{count(source.data?.totalCount)}</span></h2>
              <label className="r3-status-filter">Status<select value={status} onChange={event => filter({ status: event.target.value })}>
                <option value="">All statuses</option>{LEAD_STATUS_OPTIONS.map(value => <option key={value}>{value}</option>)}
              </select></label>
              <Search value={query} change={q => filter({ q }, true)} title="Find a prospect" placeholder="Name or company" />
            </header>
            <SourceNotice source={source} empty={!rows.length} />
            <div className="r3-prospect-table-wrap"><table className="r3-prospect-table"><thead><tr><th>Prospect</th><th>Status</th><th>Preparation</th></tr></thead><tbody>
              {rows.map(row => <tr key={row.Id} className={row.Id === selected?.Id ? 'selected' : undefined}>
                <td><button className="r3-prospect-identity" aria-pressed={row.Id === selected?.Id} onClick={() => update({ lead: row.Id })}>
                  <span className="r3-prospect-initials">{initials(label(row, 'Name'))}</span><span><strong>{label(row, 'Name')}</strong>
                    <small>{label(row, 'Company')}</small><small>{label(row, 'LeadSource', 'Source not recorded')}</small></span>
                </button></td>
                <td><span className="r3-status-chip">{label(row, 'Status')}</span></td>
                <td>{prepared.some(draft => draft.recordId === row.Id) ? <span className="r3-prepared">Draft prepared</span>
                  : <span className="r3-contact-gap">{field(row, 'Email') || field(row, 'Phone') ? 'Ready to prepare' : 'Contact details missing'}</span>}</td>
              </tr>)}
            </tbody></table></div>
            {source.data && <Paging shown={rows.length} total={source.data.totalCount} offset={history.length * 12}
              previous={history.length ? () => { update({ cursor: history[history.length - 1] ?? null, lead: null }); setHistory(values => values.slice(0, -1)); } : undefined}
              next={source.data.next ? () => { setHistory(values => [...values, after]); update({ cursor: source.data?.next ?? null, lead: null }); } : undefined} />}
          </section>
          {selected ? <article className="r3-prospect-inspector">
            <header><span>{initials(label(selected, 'Name'))}</span><div>
              <small>{label(selected, 'LeadSource', 'Source not recorded')}</small><h2>{label(selected, 'Name')}</h2><p>{label(selected, 'Company')}</p>
            </div></header>
            <div className="r3-prospect-state"><span className="r3-status-chip">{label(selected, 'Status')}</span>
              <span>{field(selected, 'Email') || field(selected, 'Phone') ? 'Contact route on record' : 'Contact details need review'}</span></div>
            <section className="r3-contact-record"><h3>Contact &amp; source</h3>
              <Facts values={[[ 'Email', label(selected, 'Email', 'No email recorded') ], ['Phone', label(selected, 'Phone', 'No phone recorded')],
                ['Annual revenue', money(field(selected, 'AnnualRevenue'))], ['Created', date(field(selected, 'CreatedDate'))]]} />
            </section>
            <section data-agent-record={selected.Id} data-agent-label={label(selected, 'Name')} className="r3-prepare-section"><label htmlFor="retail-prospect-note">Prepare the next contact</label>
              <textarea id="retail-prospect-note" key={selected.Id} ref={prospectNote} placeholder="What do you want to understand or confirm?" defaultValue={followUp?.note ?? ''} />
              <div className="r3-prospect-actions">
                <button className="primary" onClick={() => open({ kind: 'task', whoId: selected.Id, name: label(selected, 'Name'),
                  subject: `Follow up with ${label(selected, 'Name')}`, context: prospectNote.current?.value ?? '' })}>Plan follow-up</button>
                <button className="secondary" onClick={() => open({ kind: 'leadEmail', row: selected, note: prospectNote.current?.value ?? '' })}>Draft email</button>
                <button className="secondary" onClick={() => open({ kind: 'lead', row: selected, onSaved: () => { source.retry(); exact.retry(); } })}>Review lead</button>
                <button className="secondary" onClick={() => prepare(selected.Id, label(selected, 'Name'), prospectNote.current?.value ?? '')}>Keep follow-up draft</button>
              </div>
            </section>
            <section className="r3-prepared-work"><h3>Prepared follow-through <span>{Number(Boolean(followUp)) + Number(Boolean(email))}</span></h3>
              {followUp || email ? <div className="r3-prospect-actions">
                {followUp && <Link to={`/work?view=drafts&draft=${encodeURIComponent(followUp.id)}`}>Open prepared work <span aria-hidden="true">→</span></Link>}
                {email && <Link to={`/work?view=drafts&draft=${encodeURIComponent(email.id)}`}>Open email draft <span aria-hidden="true">→</span></Link>}
              </div> : <p>Prepared drafts appear here.</p>}
            </section>
            <RecordLink object="Lead" id={selected.Id} />
          </article> : <article className="r3-prospect-inspector"><SourceNotice source={exact} /><p>{selectedId ? 'This Lead is unavailable in the current book.' : 'Choose a prospect to review their next contact.'}</p></article>}
        </div>
      </div>}
  </>;
}

function Introductions({ ownerId, onSaved }: { ownerId: string; onSaved: () => void }) {
  const { open } = useWorkspace();
  const introductionNote = useRef<HTMLTextAreaElement>(null);
  const { params, update } = useFilters();
  const source = useSource(`intros:${ownerId}`, async () => {
    const result = await readSource('intros', ownerId);
    return { ...result, names: await bookNames(ownerId, result.rows, 'src_id') };
  });
  const rows = source.data?.rows ?? [];
  const key = (row: typeof rows[number]) => [row.src_id, row.dst_id, row.discovered].join(':');
  const current = params.get('intro');
  const selected = current ? rows.find(row => key(row) === current) : rows[0];
  const referrerId = text(selected?.src_id, '');
  const referrer = source.data?.names.get(referrerId);
  const target = text(selected?.dst_name);
  return <section className="biz-introductions">
    <div className="biz-intro-list">
      <header><span className="biz-eyebrow">Relationship graph</span><h2>Potential introductions</h2><p>Review each proposed connection with your customer.</p></header>
      <SourceNotice source={source} empty={!rows.length} warning={source.data?.warning} />
      {rows.map(row => {
        const name = text(row.dst_name);
        return <button className="biz-intro-row" key={key(row)} aria-pressed={row === selected} onClick={() => update({ intro: key(row) })}>
          <span className="biz-avatar">{initials(name)}</span><span><strong>{name}</strong><small>Through {source.data?.names.get(text(row.src_id)) ?? text(row.src_id)}</small></span><b>↗</b>
        </button>;
      })}
    </div>
    {selected ? <article className="biz-intro-detail" data-introduction-key={key(selected)}>
      <div className="biz-section-head"><span className="biz-eyebrow">Suggested introduction</span>
        <span className="badge">{selected.conf == null ? 'Confidence unavailable' : `${Number(selected.conf).toFixed(1)}% edge confidence`}</span></div>
      <div className="biz-connection"><div><span className="biz-avatar">{initials(referrer ?? referrerId)}</span><small>Your customer</small><h3>{referrer ?? referrerId}</h3>
        {referrer && <AccountLink id={referrerId}>Open relationship</AccountLink>}</div><div className="biz-connection-line" aria-hidden="true">··· → ···</div>
        <div><span className="biz-avatar biz-target">{initials(target)}</span><small>Outside your book</small><h3>{target}</h3>
          <span>{numeric(selected.dst_owned) ? 'Assigned to another banker' : 'No banker assignment recorded'}</span></div></div>
      <Facts values={[[ 'Discovered', date(selected.discovered) ], ['Evidence', 'Relationship graph · Referral edge'], ['Record state', 'Account suggestion']]} />
      <label className="biz-prep">Prepare the introduction<textarea ref={introductionNote} key={key(selected)}
        placeholder="What should you confirm with your customer first?" /></label>
      <p className="biz-note">Verify the introduction and contact permission before reaching out.</p>
      {referrer && <div className="biz-actions">
        <button className="primary" onClick={() => open({ kind: 'lead', onSaved, leadDefaults: { lastName: target } })}>Prepare lead</button>
        <button className="secondary" onClick={() => open({ kind: 'task', id: referrerId, name: referrer, subject: `Discuss a possible introduction to ${target}`,
          context: introductionNote.current?.value.trim() || `Review the graph suggestion with ${referrer}. Confirm context before requesting an introduction.` })}>Prepare referrer follow-up</button>
      </div>}
    </article> : <p className="source-note">{current ? 'This introduction is unavailable in the current book.' : 'Select an introduction to review provenance.'}</p>}
  </section>;
}


const coordinates = [[27,18],[73,18],[80,51],[72,83],[28,83],[20,51]] as const;
function Landscape({ ownerId, ownerName, rows, selected, pick, lens, changeLens, pins, togglePin, selectedId, filtered }: {
  ownerId: string; ownerName?: string; rows: BookNode[]; selected?: BookNode; pick: (id: string) => void;
  lens: 'signals' | 'milestones' | 'goals'; selectedId: string; filtered: boolean; changeLens: (value: string) => void; pins: string[]; togglePin: (id: string) => void;
}) {
  const { open } = useWorkspace();
  const [comparison, setComparison] = useState<string[]>([]);
  const related = useSource(`landscape:${ownerId}:${lens}`, async () => {
    if (lens === 'signals') {
      const signals = await readSource('who', ownerId);
      const ids = [...new Set(signals.rows.map(row => text(row.account_id)).filter(id => id !== '—'))].slice(0, 6);
      const result = await readBook('Account', ownerId, { count: 6, ids });
      return { accounts: result.rows, signals: signals.rows };
    }
    const root = lens === 'goals' ? 'FinancialGoal' : 'PersonLifeEvent';
    const results = await readBook(root, ownerId, { count: 25 });
    const ids = [...new Set(results.rows.map(row => relationship(row).id).filter(Boolean))].slice(0, 6);
    return { accounts: (await readBook('Account', ownerId, { count: 6, ids })).rows, signals: [] };
  });
  const accounts = related.data?.accounts ?? [];
  const chosen = selectedId ? selected ?? accounts.find(row => row.Id === selectedId) : filtered ? selected : accounts[0] ?? selected;
  const signal = related.data?.signals.find(row => row.account_id === chosen?.Id);
  const summary = useSource(`landscape-summary:${ownerId}:${chosen?.Id ?? ''}`, async () => {
    if (!chosen) return null;
    const [events, goals] = await Promise.all([
      readBook('PersonLifeEvent', ownerId, { count: 1, customerId: chosen.Id }),
      readBook('FinancialGoal', ownerId, { count: 100, customerId: chosen.Id }),
    ]);
    return { events, goals };
  });
  const goals = summary.data?.goals;
  const target = goals?.rows.reduce((total, row) => total + (numeric(field(row, 'TargetAmount')) ?? 0), 0) ?? 0;
  const funded = goals?.rows.reduce((total, row) => total + (numeric(field(row, 'ActualAmount')) ?? 0), 0) ?? 0;
  const progress = Math.min(100, Math.max(0, Math.round(funded / Math.max(1, target) * 100)));
  const sample = [...new Map([...(filtered ? [] : accounts), ...rows].map(row => [row.Id, row])).values()].slice(0, 6);
  if (chosen && !sample.some(row => row.Id === chosen.Id)) sample[Math.min(sample.length, 5)] = chosen;
  const select = (row: BookNode) => comparison.includes(row.Id) ? setComparison(values => values.filter(id => id !== row.Id)) :
    setComparison(values => [...values.slice(-2), row.Id]);
  async function compare() {
    const data = await Promise.allSettled(comparison.map(async id => {
      const account = (await readBook('Account', ownerId, { record: id, count: 1 })).rows[0];
      const [events, goals] = await Promise.all([
        readBook('PersonLifeEvent', ownerId, { count: 1, customerId: id }),
        readBook('FinancialGoal', ownerId, { count: 1, customerId: id }),
      ]);
      return { account, events: events.totalCount, goals: goals.totalCount };
    }));
    open({ kind: 'detail', title: 'Relationships, side by side', children: <div className="viz-comparison-grid" style={{ '--compare-columns': data.length } as CSSProperties}>
      {data.map((result, idx) => result.status === 'fulfilled' && result.value.account ? <section key={result.value.account.Id}>
        <span className="viz-avatar" style={{ background: atlasChartColors[idx] }}>{initials(label(result.value.account, 'Name'))}</span>
        <h3>{label(result.value.account, 'Name')}</h3><Facts values={[[ 'Milestones', count(result.value.events) ], ['Goals', count(result.value.goals)]]} />
        <AccountLink id={result.value.account.Id} />
      </section> : <p className="source-note" key={comparison[idx]}>Relationship details unavailable.</p>)}
    </div> });
  }
  return <>
    <div className="viz-section-heading"><div><h2>The relationship landscape</h2><p>Choose a person to bring their context into focus.</p></div>
      <Choices className="viz-switch" items={[[ 'signals','Signals' ], ['milestones','Milestones'], ['goals','Goals']]} selected={lens} update={changeLens} label="Relationship lens" /></div>
    <SourceNotice source={related} />
    <div className="viz-map-layout"><div>
      <div className="viz-map-canvas">
        <svg className="viz-map-lines" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="500" cy="325" rx="340" ry="230" /><ellipse cx="500" cy="325" rx="220" ry="150" />
          {sample.map((row, i) => <path key={row.Id} className={row.Id === chosen?.Id ? 'selected' : undefined} d={`M500 325 Q ${coordinates[i][0] * 10} 325 ${coordinates[i][0] * 10} ${coordinates[i][1] * 6.5}`} />)}
        </svg>
        <div className="viz-map-center"><span>{ownerName ? initials(ownerName) : ''}</span><strong>Your book</strong></div>
        {sample.map((row, i) => <button key={row.Id} className={`viz-map-person${row.Id === chosen?.Id ? ' selected' : ''}`} aria-pressed={row.Id === chosen?.Id}
          style={{ '--node-x': `${coordinates[i][0]}%`, '--node-y': `${coordinates[i][1]}%`, '--node-color': atlasChartColors[i] } as CSSProperties}
          title={label(row, 'Name')} onClick={() => pick(row.Id)}>
          <span className="viz-person-orbit"><span className="viz-person-avatar">{initials(label(row, 'Name'))}</span>{accounts.some(item => item.Id === row.Id) && <i />}</span>
          <strong>{label(row, 'Name')}</strong><small>{label(row, 'Type', 'Relationship context')}</small>
        </button>)}
      </div>
      <p className="viz-footnote">Six selected relationships. Lines connect each customer to the book.</p>
    </div><aside className="viz-inspector" aria-label="Selected relationship">{chosen ? <>
      <div className="viz-inspector-top"><span className="viz-avatar">{initials(label(chosen, 'Name'))}</span><span className="badge">{label(chosen, 'Type', 'Relationship')}</span></div>
      <h2>{label(chosen, 'Name')}</h2><p>{text(signal?.csat_reason, [label(chosen, 'Industry', ''), label(chosen, 'BillingCity', '')].filter(Boolean).join(' · ') || 'Review this customer’s milestones and goals.')}</p>
      <SourceNotice source={summary} />
      <div className="viz-inspector-metrics"><div><strong>{count(summary.data?.events.totalCount)}</strong><span>Recorded milestones</span></div>
        <div><strong>{count(summary.data?.goals.totalCount)}</strong><span>Recorded goals</span></div></div>
      {target > 0 && <div className="viz-funding-preview">
        <svg className="viz-ring" width="82" height="82" viewBox="0 0 120 120" role="img" aria-label={`Recorded goal funding ${progress}%`}>
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--m-soft)" strokeWidth="9" />
          <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="9" pathLength="100"
            strokeDasharray={`${progress} ${100 - progress}`} transform="rotate(-90 60 60)" strokeLinecap="round" />
          <text x="60" y="67" textAnchor="middle" fill="currentColor">{progress}%</text>
        </svg>
        <div><strong>Goal funding</strong><p>{money(funded)} of {money(target)}</p></div>
      </div>}
      {summary.data?.events.rows[0] && <div className="viz-next-moment"><span>Latest recorded milestone</span>
        <strong>{label(summary.data.events.rows[0], 'Name')}</strong><small>{date(field(summary.data.events.rows[0], 'EventDate'))}</small></div>}
      <div className="viz-inspector-actions"><AccountLink id={chosen.Id} className="primary">Open relationship</AccountLink>
        <button className="secondary" onClick={() => select(chosen)}>{comparison.includes(chosen.Id) ? 'Remove from comparison' : 'Add to comparison'}</button>
        <button className="secondary" onClick={() => open({ kind: 'prep', id: chosen.Id, name: label(chosen, 'Name'),
          context: summary.data?.events.rows[0] ? label(summary.data.events.rows[0], 'Name') : undefined })}>Prepare conversation</button>
        <button className="text-button" onClick={() => togglePin(chosen.Id)}>{pins.includes(chosen.Id) ? 'Unpin relationship' : 'Pin relationship'}</button>
      </div>
    </> : <><h2>Selected relationship</h2><p>{related.loading ? 'Loading the relationship landscape…' : 'Choose a matching customer to see their context.'}</p></>}</aside></div>
    {comparison.length > 0 && <div className="viz-comparison-tray"><p>{comparison.length} selected for comparison</p><button className="primary" onClick={() => void compare()}>Compare {comparison.length}</button></div>}
  </>;
}
