import { useState } from 'react';
import { Briefcase, Check, Layers, Shield, Users } from 'lucide-react';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import { field, fetchCapitalAccountNames, fetchRecords, relation, stringField, type RecordNode } from './wealthAtlasData';
import {
  Calendar,
  dates,
  formatCount,
  formatDate,
  matches,
  Metric,
  type OpenProposal,
  RecordDialog,
  SourceState,
  Tabs,
  today,
  useWorkspaceView,
} from './wealthAtlasUi';
import type { Proposal } from './WealthProposals';
import { verifyHousehold } from './wealthHouseholdData';
const recordedTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
function meetingDate(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? recordedTime.format(time) + ' UTC' : 'Date unavailable';
}

export default function Workbench({
  ownerId,
  ownerName,
  proposals,
  open,
  edit,
  remove,
}: {
  ownerId: string;
  ownerName?: string;
  proposals: Proposal[];
  open: OpenProposal;
  edit: (proposal: Proposal) => void;
  remove: (id: string) => void;
}) {
  const view = useWorkspaceView();
  const mode = view.get(
    'work',
    view.get('tab') === 'drafts' || view.get('sub') === 'drafts' ? 'drafts' : 'tasks'
  );
  const query = view.get('workSearch');
  const tasks = useAsyncData(() => fetchRecords(ownerId, 'Task'), [ownerId]);
  const meetings = useAsyncData(() => fetchRecords(ownerId, 'Event'), [ownerId]);
  const cases = useAsyncData(() => fetchRecords(ownerId, 'Case'), [ownerId]);
  const accountId = view.get('workAccount');
  const household = useAsyncData(() => accountId ? verifyHousehold(ownerId, accountId) : Promise.resolve(null), [ownerId, accountId]);
  const contactId = stringField(household.data ?? undefined, 'PersonContactId');
  const scoped = (row: RecordNode) => !accountId || Boolean(household.data && (
    stringField(row, 'WhatId') === accountId ||
    relation(row, 'Account')?.Id === accountId ||
    (contactId && stringField(row, 'WhoId') === contactId)
  ));
  const source = mode === 'meetings' ? meetings : mode === 'cases' ? cases : tasks;
  const timeKey = mode === 'meetings' ? 'ActivityDateTime' : mode === 'cases' ? 'CreatedDate' : 'ActivityDate';
  const title = (row: RecordNode) => stringField(row, 'Subject');
  const status = (row: RecordNode) => stringField(row, mode === 'meetings' ? 'ShowAs' : 'Status');
  const day = (row: RecordNode) => dates(stringField(row, timeKey));
  const date = view.get('workDay');
  const meetingDates = meetings.data?.rows.filter(scoped).map(row => dates(stringField(row,'ActivityDateTime'))).filter(Boolean) ?? [];
  const recordedMonths = [...new Set(meetingDates.map(value => value.slice(0, 7)))].sort();
  const months = recordedMonths.length ? recordedMonths : [today().slice(0, 7)];
  const month = months.find(value => value === view.get('workMonth')) ?? months[months.length - 1];
  const scopedRows = source.data?.rows.filter(scoped) ?? [];
  const rows = scopedRows.filter(row =>
    matches(query, title(row), status(row), stringField(row, 'Description')) &&
    (!date || day(row) === date) &&
    (mode !== 'meetings' || query || day(row).startsWith(month))
  );
  const selected = rows.find(row => row.Id === view.get('commitment')) ?? rows[0];
  const namesKey = [...new Set([
    ...(mode === 'drafts' ? proposals.map(item => item.accountId ?? '') : []),
    stringField(selected, 'WhatId'),
  ].filter(Boolean))].slice(0, 100).join(',');
  const names = useAsyncData(() => fetchCapitalAccountNames(namesKey ? namesKey.split(',') : []), [namesKey]);
  const caseLanes = [...new Set(rows.map(row => status(row) || 'Status unavailable'))];
  const clearScope = () => view.set({ workAccount: '', workDay: '', workMonth: '', commitment: '' });
  const [detail, setDetail] = useState<RecordNode | null>(null);
  const [limit, setLimit] = useState(8);
  const overdue = tasks.data?.rows.filter(
    row =>
      !field(row, 'IsClosed') &&
      stringField(row, 'Status') !== 'Deferred' &&
      stringField(row, 'ActivityDate') &&
      stringField(row, 'ActivityDate') < today()
  ).length;
  return (
    <div className="wa ws ws-work">
      <header className="ws-heading">
        <div>
          <h1>Advisory workbench</h1>
          <p>Review assigned tasks, meetings, service cases and local proposals.</p>
        </div>
        <button className="primary" onClick={() => open('Task', '')}>
          Prepare a new task
        </button>
      </header>
      <section className="ws-work-opening">
        <div className="ws-commitment-spine">
          <span className="ws-spine-line" />
          {[
            ['Read the context', 'Source records and household evidence', Layers],
            ['Shape the conversation', 'A reviewable draft, in my words', Users],
            ['Keep the commitment', 'A proposed next step, ready for review', Check],
          ].map(([heading, text, Icon]) => (
            <div className="ws-spine-step" key={String(heading)}>
              <span>
                <Icon />
              </span>
              <div>
                <h2>{String(heading)}</h2>
                <p>{String(text)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="ws-work-vitals">
          <Metric
            label="Overdue tasks in loaded records"
            value={formatCount(overdue)}
            detail={`Due before ${formatDate(today())}`}
          />
          <Metric label="Meetings on file" value={formatCount(meetings.data?.total)} detail="CRM Event" />
          <Metric
            label="My local proposals"
            value={formatCount(proposals.length)}
            detail="Private preparation"
          />
        </div>
        <div className="ws-folio-illustration">
          <span />
          <span />
          <article>
            <i>
              <Briefcase />
            </i>
            <strong>My review folio</strong>
            <p>
              Evidence
              <br />
              Questions
              <br />
              Next commitment
            </p>
            <small>
              {proposals.length
                ? `${proposals.length} private proposals`
                : 'Ready for a thoughtful next step'}
            </small>
          </article>
        </div>
      </section>
      <div className="ws-work-tabs">
        <Tabs
          label="Work desk"
          className="wa-tabs"
          items={[
            ['tasks', 'Tasks on file'],
            ['meetings', 'Meetings on file'],
            ['cases', 'Service cases'],
            ['drafts', 'My local proposals'],
          ]}
          value={mode}
          onChange={value => {
            setLimit(8);
            view.set({ work: value, tab: '', sub: '', workDay: '', commitment: '', workSearch: '' });
          }}
        />
      </div>
      <section className={`ws-work-scene ws-work-${mode}`}>
        {accountId && mode !== 'drafts' && <div className="wa-actions ws-work-scope">
          <span className="wa-pill">{stringField(household.data ?? undefined, 'Name') || 'Household commitments'}</span>
          <button className="text-button" onClick={clearScope}>Show all commitments</button>
          {(household.loading || household.error || !household.data) && <SourceState source={household} empty="This household is unavailable in the selected book." />}
        </div>}
        {mode === 'drafts' ? (
          <>
            <header className="ws-section-title">
              <h2>My proposal library</h2>
              <p>Review linked source context and return to private preparation.</p>
            </header>
            <div className="wa-draftgrid">
              {proposals.map(proposal => (
                <article key={proposal.id}>
                  <span className="wa-pill">{proposal.kind}</span>
                  <h3>{proposal.title}</h3>
                  <p>{proposal.accountId ? names.data?.get(proposal.accountId) || 'Linked household' : proposal.details?.Company || 'Relationship unavailable'}</p>
                  {proposal.description && <p>{proposal.description}</p>}
                  {proposal.sourceId && <small>Linked source record {proposal.sourceId}</small>}
                  <button className="secondary" onClick={() => edit(proposal)}>
                    Review proposal
                  </button>
                  <button className="text-button" onClick={() => remove(proposal.id)}>
                    Discard proposal
                  </button>
                </article>
              ))}
            </div>
            {!proposals.length && (
              <p className="wa-empty">Prepare a conversation or propose an action to start your folio.</p>
            )}
          </>
        ) : mode === 'cases' ? (
          <>
            <header className="ws-section-title">
              <h2>Household service cases</h2>
              <p>CRM cases linked to accounts in the advisory book.</p>
            </header>
            <div className="ws-service-summary"><span><Shield aria-hidden="true" /></span>
              <div><h3>Service case details</h3>
                <p>{formatCount(rows.length)} cases in the loaded source records. Status and priority come from Salesforce.</p></div></div>
            <div className="ws-case-board wa-casegrid">
              {caseLanes.map(lane => {
                const records = rows.filter(row => (status(row) || 'Status unavailable') === lane);
                return <section key={lane} className="ws-case-lane" data-case-status={lane}>
                  <header><span>{lane}</span><strong>{formatCount(records.length)}</strong></header>
                  {records.slice(0, limit).map(row => {
                    const priority = stringField(row, 'Priority');
                    return <article key={row.Id}>
                      <div className="ws-case-meta"><span data-priority={priority.toLowerCase()}>{priority || 'Priority unavailable'}</span>
                        <small>Case {stringField(row, 'CaseNumber') || '—'}</small></div>
                      <h3>{title(row)}</h3><p>{stringField(relation(row, 'Account'), 'Name') || 'Relationship unavailable'}</p>
                      <footer><time>{formatDate(day(row))}</time><button className="secondary" onClick={() => setDetail(row)}>Read source case</button></footer>
                    </article>;
                  })}
                </section>;
              })}
            </div>
            {!rows.length && <SourceState source={source} />}
          </>
        ) : (
          <div className="wa-worklayout">
            <section className="wa-panel">
              <header>
                <h2>{mode === 'meetings' ? 'My meeting calendar' : 'My task focus'}</h2>
              </header>
              {mode === 'meetings' ? (
                <>
                  <label className="wa-field">
                    Calendar month
                    <select
                      value={month}
                      onChange={event => view.set({ workMonth: event.target.value, workDay: '', commitment: '' })}
                    >
                      {months.map(value => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <Calendar
                    days={meetingDates}
                    label="Recorded CRM Events"
                    chosen={date}
                    month={month}
                    select={value => view.set({ workDay: value, commitment: '' })}
                  />
                </>
              ) : (
                <div className="wa-tasklanes">
                  {['Not Started', 'In Progress', 'Completed'].map(value => (
                    <div key={value}>
                      <b>{formatCount(tasks.data ? tasks.data.rows.filter(row => scoped(row) && status(row) === value).length : undefined)}</b>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
              <label className="wa-field">
                Find a source commitment
                <input
                  value={query}
                  onChange={event => view.set({ workSearch: event.target.value }, true)}
                  placeholder="Search title, description or status"
                />
              </label>
              <div className="wa-commitmentlist">
                {rows.slice(0, limit).map(row => (
                  <button
                    key={row.Id}
                    className={selected === row ? 'selected' : ''}
                    aria-pressed={selected === row}
                    onClick={() => view.set({ commitment: row.Id })}
                  >
                    <span>{formatDate(day(row))}</span>
                    <strong>{title(row)}</strong>
                    <small>{status(row)}</small>
                  </button>
                ))}
              </div>
              {date && <button className="secondary" onClick={() => view.set({ workDay: '', commitment: '' })}>Show all dates</button>}
              {!rows.length && <SourceState source={source} />}
              <p className="wa-source">{formatCount(rows.length)} matches in the loaded source records.{rows.length > limit ? ` Showing the first ${limit}.` : ''}</p>
            </section>
            <section className="wa-panel">
              <header>
                <div>
                  <h2>{selected ? 'Selected commitment' : 'No matching commitment'}</h2>
                  <p>Review source context before proposing changes.</p>
                </div>
              </header>
              {selected && (
                <div className="wa-commitmentfocus">
                  <div className="wa-dateblock">
                    <b>{day(selected).slice(-2) || '—'}</b>
                    <span>{mode === 'meetings' ? 'Event' : 'Task'}</span>
                  </div>
                  <h3>{title(selected)}</h3>
                  {stringField(selected, 'Priority') && <span className="wa-pill" data-priority={stringField(selected, 'Priority')}>{stringField(selected, 'Priority')} priority</span>}
                  <p>
                    {mode === 'meetings' ? meetingDate(stringField(selected, timeKey)) : formatDate(day(selected))} · {status(selected) || 'Status unavailable'}
                  </p>
                  <p>{stringField(selected, 'Description') || 'No description supplied.'}</p>
                  <div className="wa-assignment">
                    <small>Assigned to</small>
                    <strong>{ownerName && stringField(selected, 'OwnerId') === ownerId ? ownerName : stringField(selected, 'OwnerId') || '—'}</strong>
                    <small>Related record</small>
                    <strong>{names.data?.get(stringField(selected, 'WhatId')) || stringField(selected, 'WhatId') || '—'}</strong>
                    <small>Attendee / person link</small>
                    <strong>{stringField(selected, 'WhoId') || '—'}</strong>
                  </div>
                  <button className="primary" onClick={() => setDetail(selected)}>
                    Review supported edits
                  </button><p className="wa-source">Source owner, related record and attendee are shown separately. Review changes before submitting them to Salesforce.</p>
                </div>
              )}
            </section>
          </div>
        )}
        {mode !== 'drafts' && (mode === 'cases'
          ? caseLanes.some(lane => rows.filter(row => (status(row) || 'Status unavailable') === lane).length > limit)
          : rows.length > limit) && (
          <button className="secondary" onClick={() => setLimit(value => value + 12)}>
            Show more loaded records
          </button>
        )}
      </section>
      {detail && (
        <RecordDialog title={`${mode === 'cases' ? 'Source case' : 'Source commitment'} · ${title(detail)}`} close={() => setDetail(null)}>
          <p>{stringField(detail, 'Description')}</p>
          <p>
            {formatDate(day(detail))} · {status(detail)}
          </p>
          <dl className="ws-work-evidence">
            {(mode === 'cases' ? [['Case number','CaseNumber'], ['Priority','Priority'], ['Status','Status'], ['Opened','CreatedDate']]
              : [['Owner','OwnerId'], ['Related record','WhatId'], ['Attendee / person link','WhoId'], ['Priority','Priority'], ['Location','Location']])
              .filter(([,key]) => stringField(detail,key)).map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{key.endsWith('Date') ? formatDate(stringField(detail,key)) : stringField(detail,key)}</dd></div>)}
          </dl>
          {mode !== 'cases' && (
            <div className="wa-actions">
              {[
                'Edit',
                mode === 'meetings' ? 'Cancel' : 'Complete',
                ...(mode === 'tasks' ? ['Delete'] : []),
              ].map(action => (
                <button
                  key={action}
                  className="secondary"
                  onClick={() => {
                    open(
                      `${mode === 'meetings' ? 'Meeting' : 'Task'} · ${action}`,
                      title(detail),
                      detail,
                      stringField(detail, 'WhatId')
                    );
                    setDetail(null);
                  }}
                >
                  Propose {action.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </RecordDialog>
      )}
    </div>
  );
}
