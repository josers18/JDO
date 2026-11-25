import { AtlasActionReview } from '@shared/components/atlas/AtlasActionReview';
import { useToast } from '@shared/components/Toast';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BriefcaseBusiness, CalendarDays, Check, Clock, FileText, Mail, Search, Shield, Users } from 'lucide-react';
import { Modal } from '@shared/components/Modal';
import { ScheduleDetailModal } from '@shared/components/home/ScheduleDetailModal';
import { useCrmAction } from '@shared/components/home/useCrmAction';
import { WHITESPACE_LEAD_SOURCE } from '@shared/data/whitespace';
import { accountId, bookNames, field, label, readBook, readHoldings, type BookNode } from './retailData';
import { AccountLink, Choices, count, date, Facts, Header, initials, Paging, RecordLink, relationship, SourceNotice, useCrmList, useFilters, useSource, useWorkspace, type Draft } from './retailUi';

const serviceSteps = [
  ['understand', 'Understand', Search],
  ['prepare', 'Prepare', BriefcaseBusiness],
  ['follow', 'Follow through', Check],
] as const;
const responseChecks = ['Read the original request', 'Confirm the customer context', 'Agree on the next update'] as const;
type ResponseCheck = typeof responseChecks[number];
type ResponseDraft = { note: string; checked: ResponseCheck[] };

const casePriorities = ['Critical', 'High', 'Medium', 'Low'] as const;
const priorityClass = (priority: string) => {
  if (priority === 'Urgent') return 'wc-critical';
  if (priority === 'Normal') return 'wc-medium';
  return `wc-${casePriorities.find(value => value === priority)?.toLowerCase() || 'unknown'}`;
};

const views = [['desk','Service desk'], ['tasks','Tasks'], ['meetings','Meetings'], ['cases','Service cases'], ['drafts','Local drafts']] as const;
const headings = {
  desk: ['Service workbench', 'Resolve the immediate need, prepare a helpful response, and keep the follow-through attached.'],
  tasks: ['Assigned tasks', 'Plan the next step around the commitments in your book.'],
  meetings: ['Recorded meetings', 'Review recorded meetings and prepare the next conversation.'],
  cases: ['Service cases', 'Review service requests and decide how to follow through.'],
  drafts: ['Local drafts', 'Review your prepared work before making a Salesforce change.'],
};

export default function Workbench({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const { choice, update } = useFilters();
  const view = choice('view', views.map(([value]) => value), 'desk');
  const [title, description] = headings[view];
  const planned = view === 'meetings' && choice('agenda', ['recorded', 'planned'], 'recorded') === 'planned';
  const [generation, setGeneration] = useState(0);
  const onSaved = () => setGeneration(value => value + 1);
  const utilities = <div className="ps-work-utilities"><Choices className="chips" items={views} selected={view}
    update={value => update({ view: value, record: null, cursor: null, step: null, priority: null, agenda: null, date: null, account: null })} />
    <div className="retail-work-actions" role="group" aria-label="Create work"><button className="secondary" onClick={() => open({ kind: 'task', name: 'New commitment', subject: '', onSaved })}>Create task</button>
      <button className="secondary" onClick={() => open({ kind: 'meeting', name: 'New meeting', subject: 'Meeting', onSaved })}>Schedule</button>
      <button className="secondary" onClick={() => open({ kind: 'email', name: 'Customer' })}>Email</button></div></div>;
  return <>
    {view !== 'meetings' && <Header title={title} description={description} />}
    {!planned && utilities}
    {view === 'desk' ? <Desk ownerId={ownerId} key={generation} /> : view === 'drafts' ? <DraftShelf ownerId={ownerId} /> : <Collection key={`${view}:${generation}`} ownerId={ownerId} view={view} utilities={utilities} />}
  </>;
}
function Desk({ ownerId }: { ownerId: string }) {
  const { params, update, choice } = useFilters();
  const mode = choice('lens', ['service', 'commitments'], 'service');
  const root = mode === 'service' ? 'Case' : 'Task';
  const record = params.get('record');
  const [working, setWorking] = useState<Record<string, ResponseDraft>>({});
  const selectedId = record?.startsWith(root + ':') ? record.slice(root.length + 1) : !record?.includes(':') ? record : null;
  const cursor = params.get('cursor');
  const [cursors, setCursors] = useState<Array<string | null>>([]);
  const pageSize = 6;
  const source = useCrmList(root, ownerId, { count: pageSize, after: cursor });
  const exact = useSource(`desk:${ownerId}:${root}:${selectedId}`, async () =>
    selectedId ? readBook(root, ownerId, { record: selectedId, count: 1 }) : null);
  const rows = source.data?.rows ?? [];
  const selected = record ? rows.find(row => row.Id === selectedId) ?? exact.data?.rows[0] :
    rows.find(row => label(row, 'Priority') === 'Critical') ?? rows[0];
  return <section className="ps-retail-desk" data-persona-scene="retail-work">
    <aside>
      <div className="ps-section-title"><div><h2>Your working queue</h2>
        {source.data && <p>{source.data.totalCount.toLocaleString()} {mode === 'service' ? 'open service cases' : 'open commitments'}</p>}</div></div>
      <Choices className="ps-switches" items={[[ 'service','Service' ], ['commitments','Commitments']]} selected={mode} update={value => { setCursors([]); update({ lens: value, record: null, step: null, cursor: null }); }} label="Retail work queue" />
      <SourceNotice source={source} empty={!rows.length} />
      <div className="ps-work-queue" aria-label={mode === 'service' ? 'CRM service cases' : 'Open commitments'}>{rows.map(row => <button key={row.Id} aria-pressed={selected?.Id === row.Id} onClick={() => update({ record: `${root}:${row.Id}`, step: null })}>
        <span className={`ps-queue-dot ${priorityClass(label(row, 'Priority'))}`} /><strong>{label(row, 'Subject')}</strong>
        <small>{[relationship(row).name, label(row, 'Status', '')].filter(Boolean).join(' · ')}</small>
      </button>)}</div>
      {source.data && (source.data.next || cursors.length > 0) && <Paging total={source.data.totalCount} shown={rows.length} offset={cursors.length * pageSize}
        previous={cursors.length ? () => { update({ cursor: cursors[cursors.length - 1] ?? null, record: null, step: null }); setCursors(values => values.slice(0, -1)); } : undefined}
        next={source.data.next ? () => { setCursors(values => [...values, cursor]); update({ cursor: source.data?.next ?? null, record: null, step: null }); } : undefined} />}
    </aside>
    {selected ? <DeskFocus key={selected.Id} row={selected} root={root} refresh={source.retry}
      working={working[selected.Id]} prepare={draft => setWorking(previous => ({ ...previous, [selected.Id]: draft }))} /> :
      <div className="ps-interaction-desk">
        <SourceNotice source={exact} />
        <p>{record && !exact.loading ? 'This source record is unavailable in the selected book.' : 'Choose a source record to understand the request and prepare the next step.'}</p>
      </div>}
  </section>;
}

function DeskFocus({ row, root, refresh, working, prepare }: {
  row: BookNode; root: 'Task' | 'Case'; refresh: () => void; working?: ResponseDraft; prepare: (draft: ResponseDraft) => void;
}) {
  const { open, drafts, saveDraft } = useWorkspace();
  const { choice, update } = useFilters();
  const id = `service-desk:${row.Id}`;
  const existing = drafts.find(item => item.id === id);
  const note = working?.note ?? existing?.note ?? '';
  const checked = working?.checked ?? responseChecks.filter(check => existing?.checklist?.includes(check));
  const step = choice('step', ['understand', 'prepare', 'follow'], 'understand');
  const client = relationship(row);
  const title = label(row, 'Subject');
  const status = label(row, 'Status');
  const prepared = Math.round(checked.length / responseChecks.length * 100);
  const isCase = root === 'Case';
  const priority = label(row, 'Priority', '');
  const sourceDate = isCase ? date(field(row, 'CreatedDate')) : date(field(row, 'ActivityDate'));
  const showSource = () => open({
    kind: 'detail',
    title,
    children: <>
      <Facts values={[
        ['Source', isCase ? 'Salesforce Case' : 'Salesforce Task'],
        ['Recorded status', status],
        ['Priority', priority || '—'],
        [isCase ? 'Case number' : 'Recorded due date', isCase ? label(row, 'CaseNumber') : sourceDate],
        [isCase ? 'Created' : 'Assigned to', isCase ? sourceDate : label(row, 'OwnerId')],
        ['Linked relationship', client.name || client.id || '—'],
      ]} />
      {label(row, 'Description', '') && <p>{label(row, 'Description', '')}</p>}
      <div className="atlas-retail-actions"><RecordLink object={root} id={row.Id} /><AccountLink id={client.id} /></div>
    </>,
  });
  const act = (kind: 'task' | 'email' | 'meeting') => open({ kind, id: client.id || undefined, name: client.name || 'Customer', context: note,
    subject: title, onSaved: refresh });
  return <div className="ps-interaction-desk">
    <div className="ps-desk-client"><span>{initials(client.name || 'Customer')}</span><div><p>{client.name || 'Linked customer unavailable'}</p><h2>{title}</h2></div>
      {priority && <span className={`badge wc-priority-badge ${priorityClass(priority)}`}>{priority} priority</span>}
    </div>
    <div className="ps-desk-route" role="group" aria-label="Response steps">
      {serviceSteps.map(([value, name, Icon]) =>
        <button key={value} type="button" aria-pressed={step === value} onClick={() => update({ step: value })}>
          <span><Icon aria-hidden="true" /></span>{name}
        </button>)}
    </div>
    {step === 'understand' ? <div className="ps-understand">
      <div className="ps-service-object">{isCase ? <Shield aria-hidden="true" /> : <Clock aria-hidden="true" />}<strong>{status}</strong><span>Recorded {isCase ? 'case' : 'task'} status</span></div>
      <div><h3>Selected record</h3>
        <p>{isCase ? 'Review the customer’s request and confirm what has already happened before choosing a response.' : 'Confirm the commitment and its due date before planning another touchpoint.'}</p>
        <dl><dt>Source subject</dt><dd>{title}</dd><dt>{isCase ? 'Case number' : 'Recorded due date'}</dt><dd>{isCase ? label(row, 'CaseNumber') : date(field(row, 'ActivityDate'))}</dd></dl>
        <button className="text-button" type="button" onClick={showSource}>Open source details</button>
      </div>
    </div> : step === 'prepare' ? <div className="ps-response-prep">
      <h3>Prepare the response.</h3>
      <div className="ps-checklist">{responseChecks.map(check => <label key={check}>
        <input type="checkbox" checked={checked.includes(check)}
          onChange={() => prepare({ note, checked: checked.includes(check) ? checked.filter(value => value !== check) : [...checked, check] })} />
        <span aria-hidden="true"><Check /></span>{check}
      </label>)}</div>
      <label className="ps-note-label">Conversation notes<textarea value={note} onChange={event => prepare({ note: event.target.value, checked })} placeholder="What needs to happen next?" /></label>
      <div className="ps-prep-meter" role="progressbar" aria-label="Local preparation" aria-valuenow={prepared}>
        <span>Local preparation <strong>{prepared}%</strong></span><div><i style={{ width: `${prepared}%` }} /></div>
      </div>
    </div> : <div className="ps-response-actions">
      <div><span><Check aria-hidden="true" /></span><h3>Customer follow-up</h3><p>Keep a preparation draft, then choose a task, meeting, or email.</p></div>
      <button className="primary" onClick={() => saveDraft({ id, kind: 'Preparation', title, note, readiness: 'Working', recordId: row.Id, checklist: checked, account: client.id ? client : undefined })}>Keep preparation draft</button>
      {existing?.note === note && existing?.checklist?.length === checked.length && checked.every(check => existing.checklist?.includes(check)) &&
        <p role="status">Preparation draft kept. <Link className="text-button" to={`/work?view=drafts&draft=${encodeURIComponent(id)}`}>Review draft</Link></p>}
      <div><button className="secondary" onClick={() => act('task')}>Create follow-up task</button>
        <button className="secondary" onClick={() => act('meeting')}>Schedule meeting</button>
        {client.id && <button className="secondary" onClick={() => act('email')}>Draft email</button>}</div>
    </div>}
    <p className="ps-source-note">Recorded status is {status}. Preparation stays in this workspace session.</p>
  </div>;
}
type CollectionView = 'tasks' | 'meetings' | 'cases';

function Collection({ ownerId, view, utilities }: { ownerId: string; view: CollectionView; utilities: ReactNode }) {
  const { params, update, choice } = useFilters();
  const root = view === 'tasks' ? 'Task' : view === 'meetings' ? 'Event' : 'Case';
  const after = params.get('cursor');
  const record = params.get('record') ?? '';
  const id = record.startsWith(root + ':') ? record.slice(root.length + 1) : '';
  const [history, setHistory] = useState<Array<string | null>>([]);
  const pageSize = view === 'meetings' ? 5 : 6;
  const agenda = choice('agenda', ['recorded', 'planned'], 'recorded');
  const priority = choice('priority', ['all', ...casePriorities], 'all');
  const meetingAccount = view === 'meetings' ? params.get('account') : null;
  const source = useSource(JSON.stringify([root, ownerId, pageSize, after, meetingAccount, priority]), async () => {
    const options = { count: pageSize, after, recorded: view === 'meetings', priority: view === 'cases' && priority !== 'all' ? priority : undefined };
    if (!meetingAccount) return { ...await readBook(root, ownerId, options), customer: undefined };
    if (!accountId.test(meetingAccount)) throw new Error('This relationship link is unavailable.');
    const customer = (await readBook('Account', ownerId, { record: meetingAccount, count: 1 })).rows[0];
    if (!customer) throw new Error('This relationship is unavailable in the current book.');
    return { ...await readBook('Event', ownerId, { ...options, customerId: customer.Id, forCustomer: true }), customer };
  });
  const exact = useSource(`${ownerId}:${root}:${id}`, async () => id ? readBook(root, ownerId, { record: id, count: 1 }) : null);
  const rows = source.data?.rows ?? [];
  const selected = id ? rows.find(row => row.Id === id) ?? exact.data?.rows[0] : rows[0];
  const onSelect = (row: BookNode) => update({ record: `${root}:${row.Id}` });
  const refresh = () => { source.retry(); exact.retry(); };
  const [editing, setEditing] = useState<BookNode | null>(null);
  const paging = source.data && <Paging shown={rows.length} total={source.data.totalCount} offset={history.length * pageSize}
    previous={history.length ? () => { update({ cursor: history[history.length - 1] ?? null, record: null }); setHistory(values => values.slice(0, -1)); } : undefined}
    next={source.data.next ? () => { setHistory(values => [...values, after]); update({ cursor: source.data?.next ?? null, record: null }); } : undefined} />;
  return <>
    {view === 'meetings' ? <>
      <Choices className="cx-modes" items={[[ 'recorded', `Recorded meetings · ${count(source.data?.totalCount)}` ], ['planned', 'Plan a meeting']]}
        selected={agenda} update={value => { setHistory([]); update({ agenda: value, cursor: null, record: null }); }} />
      {agenda === 'planned' ? <MeetingPlanner utilities={utilities} /> :
        <RecordedMeetings ownerId={ownerId} customer={source.data?.customer} source={source} edit={setEditing} paging={paging} />}
    </> : <>
      <SourceNotice source={source} empty={!rows.length} />
      {view === 'tasks' ? <TaskTrail ownerId={ownerId} rows={rows} selected={selected} onSelect={onSelect} edit={setEditing} /> :
        <CaseBoard ownerId={ownerId} rows={rows} selected={selected} onSelect={onSelect} priority={priority}
          changePriority={value => { setHistory([]); update({ priority: value, cursor: null, record: null }); }} />}
      {record && !selected && <SourceNotice source={exact} empty={!exact.data?.rows.length} />}
      {paging}
    </>}
    {editing && (root === 'Task' || root === 'Event') && <ScheduleDetailModal open onClose={() => setEditing(null)} onSaved={refresh}
      item={{
        id: editing.Id, recordId: editing.Id, sobjectType: root, kind: root === 'Task' ? 'task' : 'meeting',
        title: label(editing, 'Subject'), time: label(editing, root === 'Task' ? 'ActivityDate' : 'ActivityDateTime', '').slice(0, 10),
        startDateTime: label(editing, 'ActivityDateTime', '') || undefined, status: label(editing, 'Status', '') || undefined,
        priority: label(editing, 'Priority', '') || undefined, whatId: label(editing, 'WhatId', '') || undefined,
        clientName: relationship(editing).name, type: label(editing, 'Type', '') || undefined,
        description: label(editing, 'Description', '') || undefined, location: label(editing, 'Location', '') || undefined,
        showAs: label(editing, 'ShowAs', '') || undefined, ownerId: label(editing, 'OwnerId', '') || undefined,
      }} />}
  </>;
}
const taskReadiness = [
  ['Working', 'To prepare'], ['Review', 'In focus'], ['Ready', 'Prepared'],
] as const;

type TaskPreparation = Pick<Draft, 'note' | 'readiness'>;

function TaskTrail({ ownerId, rows, selected, onSelect, edit }: {
  ownerId: string; rows: BookNode[]; selected?: BookNode; onSelect: (row: BookNode) => void; edit: (row: BookNode) => void;
}) {
  const { drafts, saveDraft } = useWorkspace();
  const [working, setWorking] = useState<Record<string, TaskPreparation>>({});
  const groups = new Map<string, BookNode[]>();
  for (const row of rows) {
    const due = label(row, 'ActivityDate', '');
    const group = groups.get(due) ?? [];
    group.push(row);
    groups.set(due, group);
  }
  const accountIds = [...new Set([...rows, ...(selected ? [selected] : [])].map(row => relationship(row).id).filter(Boolean))];
  const names = useSource(`task-relationships:${ownerId}:${accountIds.join(',')}`, () =>
    bookNames(ownerId, accountIds.map(id => ({ account_id: id }))));
  const clientFor = (row: BookNode) => {
    const client = relationship(row);
    return { id: client.id, name: client.name || (client.id ? names.data?.get(client.id) || '' : '') };
  };
  const preparationFor = (row: BookNode): TaskPreparation =>
    working[row.Id] ?? drafts.find(draft => draft.id === `task:${row.Id}`) ?? { note: '', readiness: 'Working' };
  return <div className="wc-scene wc-retail" data-collection="tasks">
    <section className="wc-retail-trail" aria-label="Open commitments">
      <header className="wc-trail-caption"><h2>Task history</h2><p>Recorded due dates · {rows.length} shown</p></header>
      <div className="wc-date-trail" tabIndex={0} aria-label="Tasks grouped by due date" role="region">
        {[...groups].map(([day, tasks]) => <section key={day}>
          <h3 className="wc-date-marker"><span>{day ? date(day) : 'No due date'}</span><i aria-hidden="true" /></h3>
          {tasks.map(row => <button className="wc-choice" key={row.Id} aria-pressed={selected?.Id === row.Id} onClick={() => onSelect(row)}>
            <small>{clientFor(row).name || 'Relationship unavailable'}</small><strong>{label(row, 'Subject')}</strong>
            <span className="wc-task-state">{taskReadiness.find(([value]) => value === preparationFor(row).readiness)?.[1]}</span>
          </button>)}
        </section>)}
      </div>
    </section>
    <div className="wc-task-bottom">
      {selected ? <TaskFocus key={selected.Id} row={selected} client={clientFor(selected)} preparation={preparationFor(selected)}
        change={value => setWorking(current => ({ ...current, [selected.Id]: value }))} edit={() => edit(selected)}
        retain={() => {
          const client = clientFor(selected);
          saveDraft({ id: `task:${selected.Id}`, kind: 'Task', title: label(selected, 'Subject'), ...preparationFor(selected),
            recordId: selected.Id, account: client.id ? client : undefined });
        }} /> :
        <article className="wc-focus"><h2>Selected commitment</h2><p>Select a task to prepare its next step.</p></article>}
      <aside className="wc-local-plan"><h2>Task preparation status</h2>
        {taskReadiness.map(([value, name]) => {
          const count = rows.filter(row => preparationFor(row).readiness === value).length;
          return <div key={value} data-readiness={value}><span>{name}</span><strong>{count}</strong>
            <div className="wc-bar" aria-hidden="true"><i style={{ width: `${rows.length ? count / rows.length * 100 : 0}%` }} /></div>
          </div>;
        })}
        <p>Move a commitment into focus when you are ready to prepare it. Counts cover the tasks shown.</p>
      </aside>
    </div>
  </div>;
}

function TaskFocus({ row, client, preparation, change, retain, edit }: {
  row: BookNode; client: ReturnType<typeof relationship>; preparation: TaskPreparation;
  change: (value: TaskPreparation) => void; retain: () => void; edit: () => void;
}) {
  const { drafts } = useWorkspace();
  const [planning, setPlanning] = useState(false);
  const existing = drafts.find(item => item.id === `task:${row.Id}`);
  const title = label(row, 'Subject');
  return <article className="wc-focus">
    <header><span className="wc-round"><Check aria-hidden="true" /></span><div><p>Selected commitment</p><h2>{title}</h2><p>{client.name || 'Relationship unavailable'}</p></div></header>
    <dl className="wc-facts"><div><dt>Recorded due date</dt><dd>{date(field(row, 'ActivityDate'))}</dd></div>
      <div><dt>Recorded status</dt><dd>{label(row, 'Status')}</dd></div></dl>
    <label className="wc-field">Local next step<select value={preparation.readiness} onChange={event => {
      const readiness = taskReadiness.find(([value]) => value === event.target.value)?.[0];
      if (readiness) change({ ...preparation, readiness });
    }}>{taskReadiness.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    <label className="wc-field">Preparation note<textarea placeholder="What needs to happen before you follow up?" value={preparation.note}
      onChange={event => change({ ...preparation, note: event.target.value })} /></label>
    <p className="wc-muted">Preparation stays in this session. Task status is recorded in Salesforce.</p>
    <div className="wc-actions"><button className="primary" onClick={edit}>Review task</button>
      <button className="secondary" onClick={retain}>Keep follow-up draft</button>
      <button className="secondary" onClick={() => setPlanning(true)}>Plan task action</button><AccountLink id={client.id} />
    </div>
    {existing && existing.note === preparation.note && existing.readiness === preparation.readiness &&
      <p role="status" className="wc-muted">Follow-up draft saved in this session.</p>}
    {planning && <TaskActionPlan row={row} client={client} close={() => setPlanning(false)} />}
  </article>;
}

function TaskActionPlan({ row, client, close }: {
  row: BookNode; client: ReturnType<typeof relationship>; close: () => void;
}) {
  const { saveDraft } = useWorkspace();
  const [operation, setOperation] = useState('Update task');
  const [subject, setSubject] = useState(label(row, 'Subject'));
  const [due, setDue] = useState(label(row, 'ActivityDate', ''));
  const [note, setNote] = useState('');
  const [review, setReview] = useState(false);
  const details = [operation, due && `Proposed due date: ${date(due)}`, note.trim()].filter(Boolean).join('\n');
  return <Modal open title="Plan task action" onClose={close}>
    <form className="atlas-retail-workspace" onSubmit={event => {
      event.preventDefault();
      if (!subject.trim()) return;
      if (!review) { setReview(true); return; }
      saveDraft({ id: `task-action:${row.Id}`, kind: 'Task', title: `${operation} · ${subject.trim()}`, note: details,
        recordId: row.Id, readiness: 'Review', account: client.id ? client : undefined });
      close();
    }}>
      <p>{label(row, 'Subject')} · Recorded status: {label(row, 'Status')}</p>
      {review ? <><p>{subject}</p><p style={{ whiteSpace: 'pre-wrap' }}>{details}</p></> : <>
        <label className="wc-field">Proposed action<select value={operation} onChange={event => setOperation(event.target.value)}>
          <option>Update task</option><option>Mark complete</option><option>Delete task</option></select></label>
        <label className="wc-field">Task title<input required value={subject} onChange={event => setSubject(event.target.value)} /></label>
        <label className="wc-field">Proposed due date<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
        <label className="wc-field">Reason or handoff note<textarea value={note} onChange={event => setNote(event.target.value)} /></label>
      </>}
      <div className="wc-actions">
        <button className="primary" type="submit">{review ? 'Keep action proposal' : 'Review action proposal'}</button>
        {review && <button className="secondary" type="button" onClick={() => setReview(false)}>Edit proposal</button>}
      </div>
    </form>
  </Modal>;
}
function CaseBoard({ ownerId, rows, selected, onSelect, priority, changePriority }: {
  ownerId: string; rows: BookNode[]; selected?: BookNode; onSelect: (row: BookNode) => void;
  priority: string; changePriority: (value: string) => void;
}) {
  const stats = useSource(`case-priorities:${ownerId}`, () =>
    Promise.all(casePriorities.map(priority => readBook('Case', ownerId, { priority, count: 1 }))));
  return <div className="wc-scene wc-retail" data-collection="cases"><div className="wc-triage">
    <section className="wc-triage-overview" aria-label="CRM service cases">
      <h2>Service case priorities</h2>
      <SourceNotice source={stats} />
      <div className="wc-priority-ribbon" role="group" aria-label="Filter by service case priority">
        {casePriorities.map((value, index) => <button className={`wc-priority ${priorityClass(value)}`} key={value}
          aria-pressed={priority === value} onClick={() => changePriority(value)}>
          <strong>{count(stats.data?.[index]?.totalCount)}</strong><span>{value}</span>
        </button>)}
        <button className="wc-all" aria-pressed={priority === 'all'} onClick={() => changePriority('all')}>All requests</button>
      </div>
      <div className="wc-ticket-stack">{rows.map(row => {
        const level = label(row, 'Priority');
        return <button key={row.Id} className="wc-choice" aria-pressed={row.Id === selected?.Id} onClick={() => onSelect(row)}>
          <span className={`wc-ticket-priority ${priorityClass(level)}`} />
          <strong>{label(row, 'Subject')}</strong><small>{relationship(row).name || 'Relationship unavailable'}</small>
          <span className="wc-status">{label(row, 'Status')}</span>
        </button>;
      })}</div>
    </section>
    {selected ? <CaseFocus key={selected.Id} row={selected} /> :
      <article className="wc-focus wc-case-focus"><h2>Service response</h2><p>Select a case to prepare a response.</p></article>}
  </div></div>;
}

const caseSteps = ['Read the request', 'Confirm the next step', 'Prepare the customer update'];

function CaseFocus({ row }: { row: BookNode }) {
  const { open, saveDraft, drafts } = useWorkspace();
  const client = relationship(row);
  const title = label(row, 'Subject');
  const priority = label(row, 'Priority', '');
  const status = label(row, 'Status');
  const existing = drafts.find(item => item.id === `case:${row.Id}`);
  const [note, setNote] = useState(existing?.note ?? '');
  const [checked, setChecked] = useState<readonly string[]>(existing?.checklist ?? []);
  const reviewCase = () => open({ kind: 'detail', title, children: <div className="atlas-retail-workspace">
    <Facts values={[[ 'Case number', label(row, 'CaseNumber') ], ['Recorded status', status], ['Priority', priority], ['Created', date(field(row, 'CreatedDate'))]]} />
    <p>{label(row, 'Description', 'No description recorded.')}</p>
    <div className="wc-actions"><RecordLink object="Case" id={row.Id} /><AccountLink id={client.id} />
      {client.id && <button className="secondary" onClick={() => open({ kind: 'task', ...client, subject: `Follow up on ${title}`, context: note })}>Create follow-up task</button>}</div>
  </div> });
  return <article className="wc-focus wc-case-focus"><header><span className="wc-round"><Shield aria-hidden="true" /></span><div><p>Service response</p>
    <h2>{title}</h2><p>{client.name || 'Relationship unavailable'}</p></div></header>
    <div className="wc-tags">{priority && <span className={`wc-priority-badge ${priorityClass(priority)}`}>{priority} priority</span>}<span className="wc-status">{status}</span></div>
    <div className="wc-response-path">{caseSteps.map((step, index) => <label key={step}><input type="checkbox" checked={checked.includes(step)}
      onChange={event => setChecked(event.target.checked ? [...checked, step] : checked.filter(value => value !== step))} />
      <span aria-hidden="true">{index + 1}</span><strong>{step}</strong></label>)}</div>
    <label className="wc-field">Response preparation<textarea placeholder="Add the context you want to carry into the response…" value={note} onChange={event => setNote(event.target.value)} /></label>
    <div className="wc-actions"><button className="primary" onClick={reviewCase}>Review service case</button>
      <button className="secondary" onClick={() => saveDraft({ id: `case:${row.Id}`, kind: 'Case', title, note, checklist: checked,
        readiness: 'Working', recordId: row.Id, account: client.id ? client : undefined })}>Prepare response</button></div>
    <p className="wc-muted">The checklist tracks your preparation. Salesforce shows the recorded case status.</p>
    {existing && existing.note === note && existing.checklist?.length === checked.length && checked.every(step => existing.checklist?.includes(step)) &&
      <p role="status" className="wc-muted">Response draft saved in this session.</p>}
  </article>;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function RecordedMeetings({ ownerId, customer, source, edit, paging }: {
  ownerId: string; customer?: BookNode; source: ReturnType<typeof useCrmList>; edit: (row: BookNode) => void; paging: ReactNode;
}) {
  const { ownerName } = useWorkspace();
  const rows = source.data?.rows ?? [];
  const ids = [...new Set(rows.map(row => relationship(row).id).filter(Boolean))];
  const names = useSource(`meeting-relationships:${ownerId}:${ids.join(',')}`, () =>
    bookNames(ownerId, ids.map(id => ({ account_id: id }))));
  return <section className="cx-recorded-agenda" aria-label="Recorded meetings">
    <header className="cx-section-head"><div><h1>Recorded meetings</h1>
      <p>{customer ? `${label(customer, 'Name')} · selected Retail relationship · ` : ownerName ? `${ownerName} · recorded Salesforce history · ` : ''}times shown in UTC.</p></div>
      {(customer?.Id || ids[0]) && <AccountLink id={customer?.Id || ids[0]}>Open customer</AccountLink>}</header>
    <div className="cx-agenda-label">Recorded CRM history{rows[0] && ` · latest on this page ${date(field(rows[0], 'ActivityDateTime'))}`}</div>
    <SourceNotice source={source} empty={!rows.length} />
    {rows.map(row => {
      const start = label(row, 'ActivityDateTime', '');
      const client = relationship(row);
      return <article className="cx-agenda-event" key={row.Id}>
        <time dateTime={start || undefined}><strong>{date(start)}</strong><span>{start.slice(11, 16)} UTC</span></time>
        <div><h2>{label(row, 'Subject')}</h2><p>{[names.data?.get(client.id), label(row, 'Location', 'Location unavailable'), field(row, 'DurationInMinutes') != null && `${count(field(row, 'DurationInMinutes'))} minutes`, label(row, 'ShowAs', '')].filter(Boolean).join(' · ')}</p>
          <p>Assigned to {(!customer && ownerName) || label(row, 'OwnerId')}</p><p>{label(row, 'Description', 'No description recorded.')}</p></div>
        <button className="secondary" onClick={() => edit(row)}>Review meeting</button>
      </article>;
    })}
    {paging && <footer>{paging}</footer>}
  </section>;
}

const meetingOutline = ['What has changed?', 'What should we review together?', 'What is the next useful step?'];

function MeetingPlanner({ utilities }: { utilities: ReactNode }) {
  const { drafts, saveDraft } = useWorkspace();
  const { params, update } = useFilters();
  const today = dateKey(new Date());
  const dateParam = params.get('date') ?? '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && Number.isFinite(Date.parse(dateParam)) ? dateParam : today;
  const [hour, setHour] = useState('09:00');
  const [relationshipName, setRelationshipName] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const active = new Date(day + 'T12:00:00');
  const middle = new Date(active);
  middle.setDate(active.getDate() - ((active.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, offset) => dateKey(new Date(middle.getFullYear(), middle.getMonth(), middle.getDate() + offset)));
  const dayDrafts = (key: string) => drafts.filter(row => row.kind === 'Meeting' && !row.recordId && row.meetingAt?.startsWith(key));
  const select = (value: string) => update({ date: value });
  return <>
    <Header title="Meeting planner" description="Choose a date, sketch the agenda, and keep a meeting draft." />
    {utilities}
    <div className="wc-scene wc-retail" data-collection="meetings"><div className="wc-meeting-layout">
      <section className="wc-calendar"><header><div><p>Conversation planner</p><h2>{active.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div>
        <div className="wc-calendar-controls">{[-1, 1].map(change => <button key={change} aria-label={change < 0 ? 'Previous week' : 'Next week'}
          onClick={() => select(dateKey(new Date(active.getFullYear(), active.getMonth(), active.getDate() + change * 7)))}>{change < 0 ? '‹' : '›'}</button>)}</div></header>
        <div className="wc-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(value => <span key={value}>{value}</span>)}</div>
        <div className="wc-calendar-grid wc-week-grid">{days.map(value => <button key={value} aria-label={date(value)} aria-pressed={day === value} onClick={() => select(value)}>
          <span>{Number(value.slice(-2))}</span>{dayDrafts(value).map(row => <small key={row.id}>{row.meetingAt?.slice(11)} Draft</small>)}
        </button>)}</div>
        <div className="wc-calendar-legend"><i aria-hidden="true" />Selected planning date <span>Meeting drafts stay local</span></div>
        <div className="wc-day-agenda"><h3>{date(day)}</h3>{dayDrafts(day).length ? dayDrafts(day).map(row => <article key={row.id}>
          <time>{row.meetingAt?.slice(11)}</time><div><strong>{row.title}</strong><p>{row.meetingRelationship || 'Relationship not entered'} · Local draft</p></div>
          <button className="secondary" onClick={() => setEditing(row)}>Edit draft</button>
        </article>) : <div className="wc-open-day"><CalendarDays aria-hidden="true" /><div><strong>Room to plan a conversation</strong>
          <p>No new-meeting drafts for this date. View Recorded meetings for CRM history.</p></div></div>}</div>
      </section>
      <aside className="wc-meeting-studio"><div className="wc-meeting-dial"><Users aria-hidden="true" /><strong>{hour || '—'}</strong><small>Proposed start</small></div>
        <h2>Plan a customer conversation</h2>
        <label className="wc-field">Planning date<input type="date" value={day} onChange={event => { if (event.target.value) select(event.target.value); }} /></label>
        <label className="wc-field">Proposed time<input type="time" value={hour} onChange={event => setHour(event.target.value)} /></label>
        <label className="wc-field">Relationship<input value={relationshipName} placeholder="Customer, household, or company" onChange={event => setRelationshipName(event.target.value)} /></label>
        <div className="wc-agenda-outline"><h3>Conversation outline</h3>{meetingOutline.map((step, index) => <div key={step}><span>{index + 1}</span>{step}</div>)}</div>
        <button className="primary" disabled={!hour} onClick={() => setEditing({ id: `meeting:${crypto.randomUUID()}`, kind: 'Meeting',
          title: 'Customer conversation', note: '', readiness: 'Working', meetingAt: `${day}T${hour}`, meetingRelationship: relationshipName.trim() })}>Prepare meeting draft</button>
        <p className="wc-muted">Confirm attendees and details before scheduling.</p>
      </aside>
    </div></div>
    {editing && <MeetingDraftForm draft={editing} save={draft => { saveDraft(draft); select(draft.meetingAt?.slice(0, 10) || day); setEditing(null); }}
      close={() => setEditing(null)} />}
  </>;
}

function MeetingDraftForm({ draft, save, close }: { draft: Draft; save: (draft: Draft) => void; close: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [when, setWhen] = useState(draft.meetingAt ?? '');
  const [relationshipName, setRelationshipName] = useState(draft.meetingRelationship ?? '');
  const [note, setNote] = useState(draft.note);
  return <Modal open title="Prepare meeting draft" onClose={close}><form className="atlas-retail-workspace" onSubmit={event => {
    event.preventDefault();
    if (title.trim() && when) save({ ...draft, title: title.trim(), meetingAt: when, meetingRelationship: relationshipName.trim(), note });
  }}>
    <label className="wc-field">Meeting title<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="wc-field">Proposed start<input type="datetime-local" required value={when} onChange={event => setWhen(event.target.value)} /></label>
    <label className="wc-field">Relationship<input value={relationshipName} onChange={event => setRelationshipName(event.target.value)} /></label>
    <label className="wc-field">Conversation notes<textarea value={note} onChange={event => setNote(event.target.value)} /></label>
    <button className="primary" type="submit">Keep meeting draft</button>
  </form></Modal>;
}

function DraftShelf({ ownerId }: { ownerId: string }) {
  const { drafts, removeDraft, open } = useWorkspace();
  const { params, update } = useFilters();
  const selectedId = params.get('draft');
  const kind = params.get('kind') ?? 'all';
  const rows = drafts.filter(row => kind === 'all' || kind === row.kind);
  const selected = selectedId ? rows.find(row => row.id === selectedId) : rows[0];
  return <section className="wc-scene wc-retail" data-collection="drafts">
    <div className="wc-draft-toolbar"><div className="wc-draft-progress">{['Working','Review','Ready'].map(value => <div key={value}><strong>{drafts.filter(row => row.readiness === value).length}</strong><span>{value}</span></div>)}</div>
      <label className="wc-field">Draft type<select value={kind} onChange={event => update({ kind: event.target.value, draft: null })}>
        <option value="all">All types</option>{[...new Set(drafts.map(row => row.kind))].map(value => <option key={value}>{value}</option>)}
      </select></label></div>
    <div className="wc-draft-layout wc-action-shelf">
      <div className="wc-draft-shelf"><h2>Customer follow-through</h2>{rows.map(row => <button className="wc-choice" key={row.id} aria-pressed={selected?.id === row.id} onClick={() => update({ draft: row.id })}>
        <span className="wc-paper-fold">{row.kind === 'Meeting' ? <CalendarDays /> : row.kind === 'Email' ? <Mail /> : <FileText />}</span>
        <small>{row.kind}</small><strong>{row.title}</strong><span>{row.account?.name || row.meetingRelationship || 'No relationship entered'}</span>
        <span className="wc-status">{row.readiness}</span>
      </button>)}{!rows.length && <p className="wc-shelf-empty">No local drafts here yet.</p>}</div>
      {selected ? <DraftEditor key={selected.id} draft={selected} ownerId={ownerId} onRemove={() => { removeDraft(selected.id); update({ draft: null }); }} /> :
        <article className="wc-document wc-blank-document"><FileText aria-hidden="true" /><h2>Draft details</h2>
          <p>{selectedId ? 'This draft is unavailable in the current workspace session.' : 'Prepare a customer follow-up, meeting, or task to review it here.'}</p>
          <div className="wc-actions"><button className="secondary" onClick={() => open({ kind: 'task', name: 'New commitment', subject: '' })}>Draft a task</button>
            <button className="secondary" onClick={() => update({ view: 'meetings', agenda: 'planned', draft: null })}>Plan a meeting</button></div>
        </article>}
    </div>
  </section>;
}

function DraftEditor({ draft, ownerId, onRemove }: { draft: Draft; ownerId: string; onRemove: () => void }) {
  const { saveDraft, open } = useWorkspace();
  const { toast } = useToast();
  useEffect(() => {
    if (draft.kind === 'Email' && !draft.requestId) saveDraft({...draft, requestId:crypto.randomUUID()});
  }, [draft, saveDraft]);
  const [note, setNote] = useState(draft.note);
  const [readiness, setReadiness] = useState(draft.readiness);
  const [confirm, setConfirm] = useState(false);
  const { submit, error, loading } = useCrmAction(onRemove);
  const taskAccountId = draft.kind !== 'Opportunity' ? draft.account?.id : undefined;
  const taskAccount = useSource(`draft-task-account:${ownerId}:${taskAccountId}`, async () =>
    taskAccountId ? (await readBook('Account', ownerId, { record: taskAccountId, count: 1 })).rows.find(row => row.Id === taskAccountId) : null);
  const validity = useSource(`draft-validity:${ownerId}:${draft.id}:${confirm}`, async () => {
    if (!confirm || !draft.payload || !draft.account) return null;
    if (draft.payload.ownerId !== ownerId) throw new Error('This draft belongs to another book.');
    const [account, existing, holdings] = await Promise.all([
      readBook('Account', ownerId, { record: draft.account.id, count: 1 }),
      readBook('Opportunity', ownerId, { count: 1, customerId: draft.account.id, exactName: draft.payload.name, leadSource: WHITESPACE_LEAD_SOURCE }),
      readHoldings([draft.account.id]),
    ]);
    if (!account.rows[0]) throw new Error('The original relationship is unavailable.');
    if (existing.totalCount) throw new Error('An open opportunity already exists for this draft.');
    const product = draft.product;
    if (product && holdings.some(row => label(row, 'Name', '').toLowerCase().includes(product.toLowerCase()))) throw new Error('The customer already holds this product.');
    return true;
  });
  const prospect = useSource(`email-recipient:${ownerId}:${draft.recordId}:${draft.kind}`, async () =>
    draft.kind === 'Email' && draft.recordId ? (await readBook('Lead', ownerId, { record: draft.recordId, count: 1 })).rows.find(row => row.Id === draft.recordId) : null);
  const isLead = draft.kind === 'Lead' || draft.kind === 'Email';
  const isService = draft.kind === 'Preparation' && draft.id.startsWith('service-desk:');
  const isTask = draft.kind === 'Task' || (isService && draft.recordId?.startsWith('00T'));
  const isCase = draft.kind === 'Case' || (isService && draft.recordId?.startsWith('500'));
  const object = isTask ? 'Task' : isCase ? 'Case' : isLead ? 'Lead' : undefined;
  return <article className="wc-document"><header><span className="wc-document-icon"><FileText aria-hidden="true" /></span>
    <div><p>{draft.kind} · Local draft</p><span className="wc-status">{draft.readiness}</span></div></header>
    <h2>{draft.title}</h2><p>{draft.account?.name || draft.meetingRelationship || 'Relationship not entered'}</p>
    {draft.meetingAt && <p>{date(draft.meetingAt.slice(0, 10))} · {draft.meetingAt.slice(11)}</p>}
    {draft.kind === 'Email' && <Facts values={[[ 'Recipient at preparation', draft.recipient || 'No email recorded' ]]} />}
    <label className="wc-field">Readiness<select value={readiness} onChange={event => setReadiness(event.target.value as Draft['readiness'])}>
      <option>Working</option><option>Review</option><option>Ready</option></select></label>
    <label className="wc-field">{draft.kind === 'Email' ? 'Email body' : 'Preparation note'}<textarea value={note} onChange={event => setNote(event.target.value)} /></label>
    <div className="wc-actions">
      <button className="primary" onClick={() => saveDraft({ ...draft, note, readiness })}>Save draft</button>
      <button className="secondary" onClick={onRemove}>Discard draft</button>
      {isLead && draft.recordId && <Link className="secondary" to={`/prospecting?lead=${encodeURIComponent(draft.recordId)}`}>Open prospect</Link>}
      {draft.recordId && object && <RecordLink object={object} id={draft.recordId} />}
      {taskAccount.data && !taskAccount.error && <button className="secondary" onClick={() => {
        const account = taskAccount.data;
        if (account) open({ kind: 'task', id: account.Id, name: label(account, 'Name'), subject: draft.title, context: note });
      }}>Create follow-up task</button>}
      {draft.payload && <button className="secondary" onClick={() => setConfirm(value => !value)}>Review Salesforce action</button>}
    </div>
    {draft.kind === 'Email' && <><SourceNotice source={prospect} empty={!prospect.data} />
      {prospect.data && draft.requestId && <AtlasActionReview key={draft.id} lead={{ id: prospect.data.Id, email: label(prospect.data,'Email','') }}
        name={label(prospect.data,'Name')} ownerId={ownerId} subject={draft.title} note={note} requestId={draft.requestId} onReviewSubmit={(title,body) => { setNote(body); saveDraft({...draft,title,note:body,readiness}); }}
        onSaved={() => { toast('Email accepted by Salesforce', draft.title); onRemove(); }} />}</>}
    {taskAccount.data && <AtlasActionReview accountId={taskAccount.data.Id} ownerId={ownerId} name={label(taskAccount.data,'Name')} subject={draft.title} note={note} />}
    {taskAccountId && <SourceNotice source={taskAccount} empty={!taskAccount.data} />}
    {draft.payload && confirm && <><p>Create the Opportunity for {draft.account?.name} using the recorded model value.</p>
      <SourceNotice source={validity} /><button className="primary" disabled={loading || validity.loading || !validity.data || Boolean(validity.error)} onClick={() => { if (draft.payload) void submit({ ...draft.payload, description: note }, 'Opportunity created', draft.title); }}>{loading ? 'Creating…' : 'Create opportunity'}</button></>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
