import { useRef, useState, type FormEvent } from 'react';
import { lexRecordUrl } from '@shared/data/orgEnv';
import { crmWrite, type CrmWriteInput } from '@shared';
import { LEAD_SOURCE_OPTIONS, LEAD_STATUS_OPTIONS } from '@shared/components/home/types';
import { assertActivity, findCompanies, nodes, recordKey, str, verifyAccounts } from './commercialData';
import { Button, Inspect, useLive } from './controls';

export type Draft = {
  id: string;
  kind: 'task' | 'meeting' | 'opportunity' | 'lead' | 'case';
  operation?: 'delete';
  status?: string;
  priority?: string;
  location?: string;
  title: string;
  detail: string;
  accountId: string;
  company: string;
  date: string;
  time: string;
  sourceRef?: string;
  original?: string;
  offer?: string;
  lastName?: string;
  firstName?: string;
  email?: string;
  leadSource?: string;
  annualRevenue?: number;
  amount?: number;
};
export type DraftSeed = Partial<Draft> & { kind: Draft['kind'] };
export type DraftEditor = (seed: DraftSeed) => void;

export function DraftForm({ seed, owner, close, save, remove, submitted }: { seed: DraftSeed; owner: string; close: () => void; save: (draft: Draft) => void; remove: (id: string) => void; submitted: () => void }) {
  const [form, setForm] = useState<Draft>(() => ({ id: crypto.randomUUID(), title: '', detail: '', accountId: '', company: '', date: '', time: '', ...seed }));
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const existingOpportunity = form.kind === 'opportunity' && Boolean(form.original);
  const requiresCompany = form.kind !== 'lead';
  const results = useLive(() => requiresCompany && !seed.accountId ? findCompanies(owner, query) : Promise.resolve({ Account: undefined }), JSON.stringify([owner, query, requiresCompany, seed.accountId]));
  const set = (key: keyof Draft, value: string | number) => setForm(current => ({ ...current, [key]: value }));
  const companyValid = !requiresCompany || Boolean(form.accountId);
  const valid = (form.kind === 'lead' ? form.lastName?.trim() && form.company.trim() : form.title.trim())
    && (form.kind !== 'meeting' || form.operation === 'delete' || (form.date && form.time));
  const saveProposal = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save(form.kind === 'lead' ? { ...form, title: form.lastName ?? '' } : form);
  };
  const send = async () => {
    if (!valid || !companyValid || existingOpportunity || sending.current || (form.operation === 'delete' && !form.original)) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (requiresCompany) {
        const scoped = await verifyAccounts(owner, [form.accountId]);
        if (!scoped.has(recordKey(form.accountId))) throw new Error('This company is no longer available in the selected book.');
      }
      if (form.original && (form.kind === 'task' || form.kind === 'meeting')) {
        await assertActivity(owner, form.accountId, form.original, form.kind === 'task' ? 'Task' : 'Event');
      }
      const description = [form.detail, form.sourceRef ? `Source reference: ${form.sourceRef}` : '', form.offer ? `Offer model: ${form.offer}` : ''].filter(Boolean).join('\n');
      const base = { subject: form.title, description, status: form.status, priority: form.priority };
      let request: CrmWriteInput;
      if (form.operation === 'delete' && form.original && (form.kind === 'task' || form.kind === 'meeting')) {
        request = { action: 'delete', recordId: form.original, sobjectType: form.kind === 'task' ? 'Task' : 'Event' };
      } else switch (form.kind) {
        case 'task':
          request = form.original ? { ...base, action: 'update', sobjectType: 'Task', recordId: form.original, dueDate: form.date || undefined }
            : { ...base, action: 'task', whatId: form.accountId, dueDate: form.date || undefined };
          break;
        case 'meeting': {
          const activityDateTime = new Date(`${form.date}T${form.time}${form.original ? 'Z' : ''}`).toISOString();
          request = form.original ? { ...base, action: 'update', sobjectType: 'Event', recordId: form.original, activityDateTime, location: form.location }
            : { ...base, action: 'event', whatId: form.accountId, activityDateTime };
          break;
        }
        case 'case': request = { ...base, action: 'case', accountId: form.accountId }; break;
        case 'lead': request = { ...base, action: 'lead', firstName: form.firstName, lastName: form.lastName, company: form.company, leadSource: form.leadSource, email: form.email, annualRevenue: form.annualRevenue }; break;
        case 'opportunity': request = { ...base, action: 'opportunity', accountId: form.accountId, name: form.title, amount: form.amount, closeDate: form.date || undefined, leadSource: form.offer ? 'Cross-sell grid' : undefined, ownerId: owner }; break;
      }
      await crmWrite(request);
      remove(form.id);
      submitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salesforce could not save this record.');
    } finally { sending.current = false; setBusy(false); }
  };
  return <Inspect title={form.operation === 'delete' ? 'Review activity deletion' : form.original ? 'Review source change proposal' : `Review ${form.kind} proposal`} onClose={busy ? () => undefined : close}>
    <form className="ca-proposal-form" onSubmit={saveProposal}>
      {requiresCompany ? seed.accountId ? <p><strong>{form.company}</strong> · {form.accountId}</p> : <>
        <label>Find a company<input value={query} onChange={event => { setQuery(event.target.value); setForm(form => ({ ...form, company: '', accountId: '' })); }} /></label>
        <label>Company<select value={form.accountId} onChange={event => { const a = nodes(results.value?.Account).find(r => r.Id === event.target.value); setForm(current => ({ ...current, accountId: a?.Id ?? '', company: a ? str(a, 'Name') : '' })); }}><option value="">Choose a company</option>{nodes(results.value?.Account).map(a => <option value={a.Id} key={a.Id}>{str(a, 'Name')}</option>)}</select></label>
        {!form.accountId && <p className="ca-note">You can save a local proposal now and link a company before submitting to Salesforce.</p>}
        {results.error && <p role="alert">{results.error}</p>}
      </> : <><label>First name<input value={form.firstName ?? ''} onChange={e => set('firstName', e.target.value)} /></label><label>Last name<input required value={form.lastName ?? ''} onChange={e => set('lastName', e.target.value)} /></label><label>Company<input required value={form.company} onChange={e => set('company', e.target.value)} /></label>
        <label>Status<select value={form.status ?? ''} onChange={e => set('status', e.target.value)}><option value="">Unspecified</option>{LEAD_STATUS_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></label>
        <label>Lead source<select value={form.leadSource ?? ''} onChange={e => set('leadSource', e.target.value)}><option value="">Unspecified</option>{LEAD_SOURCE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></label>
        <label>Email<input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></label>
        <label>Annual revenue<input type="number" min="0" step="0.01" value={form.annualRevenue ?? ''} onChange={e => setForm(current => ({ ...current, annualRevenue: e.target.value === '' ? undefined : Number(e.target.value) }))} /></label>
      </>}
      {form.kind !== 'lead' && <label>{form.kind === 'opportunity' ? 'Opportunity name' : 'Subject'}<input required value={form.title} onChange={e => set('title', e.target.value)} /></label>}
      {form.operation === 'delete' && <p>This action deletes the exact source activity {form.original} when submitted.</p>}
      {form.operation !== 'delete' && <label>Description<textarea rows={5} value={form.detail} onChange={e => set('detail', e.target.value)} /></label>}
      {form.operation !== 'delete' && form.kind !== 'case' && form.kind !== 'lead' && <label>{form.kind === 'opportunity' ? 'Close date' : form.kind === 'meeting' ? 'Meeting date' : 'Due date'}<input type="date" required={form.kind === 'meeting'} value={form.date} onChange={e => set('date', e.target.value)} /></label>}
      {form.operation !== 'delete' && form.kind === 'meeting' && <label>{form.original ? 'Start time (UTC)' : 'Start time'}<input type="time" required value={form.time} onChange={e => set('time', e.target.value)} /></label>}
      {form.operation !== 'delete' && form.kind === 'meeting' && form.original && <label>Location<input value={form.location ?? ''} onChange={e => set('location', e.target.value)} /></label>}
      {form.operation !== 'delete' && (form.kind === 'task' || form.kind === 'case') && <>
        <label>Priority<select value={form.priority ?? ''} onChange={e => set('priority', e.target.value)}><option value="">Unspecified</option>{[...new Set([form.priority, 'High', form.kind === 'case' ? 'Medium' : 'Normal', 'Low'])].filter(Boolean).map(option => <option key={option}>{option}</option>)}</select></label>
        <label>Status<select value={form.status ?? ''} onChange={e => set('status', e.target.value)}><option value="">Unspecified</option>{[...new Set([form.status, ...(form.kind === 'case' ? ['New', 'Working', 'Escalated'] : ['Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred'])])].filter(Boolean).map(option => <option key={option}>{option}</option>)}</select></label>
      </>}
      {form.kind === 'opportunity' && <label>Proposed amount<input type="number" min="0" step="0.01" value={form.amount ?? ''} onChange={e => setForm(current => ({ ...current, amount: e.target.value ? Number(e.target.value) : undefined }))} /></label>}
      {form.sourceRef && <p className="ca-note">Source {form.sourceRef}{form.offer && ` · Product ${form.offer}`}</p>}
      {error && <p role="alert">{error}</p>}
      {confirm && <p role="status">Submit this proposal to Salesforce?</p>}
      <div className="ca-actions"><button type="submit" disabled={!valid || busy} className="primary">Save local proposal</button>
        {existingOpportunity && form.original ? <a className="secondary" href={lexRecordUrl('Opportunity', form.original)} target="_top">Open Salesforce opportunity</a> : <button type="button" disabled={!valid || !companyValid || busy} className="secondary" onClick={() => confirm ? void send() : setConfirm(true)}>{busy ? 'Saving…' : confirm ? 'Confirm Salesforce submission' : 'Submit to Salesforce'}</button>}
        {seed.id && !busy && <Button onClick={() => { remove(seed.id!); close(); }} style="text-button">Discard proposal</Button>}
      </div>
    </form>
  </Inspect>;
}
