import { useEffect, useRef, useState } from 'react';
import { crmWrite, type CrmWriteInput } from '../../data/crmWriteClient';
import { fetchAccountEmail } from '../../data/accountLookup';
import { orgCoreOrigin } from '../../data/orgEnv';

type Action = 'task' | 'call' | 'case' | 'email';
const labels: Record<Action,string> = { task: 'Create task', call: 'Log completed call', case: 'Create case', email: 'Send email' };
interface Props {
  accountId?: string; ownerId?: string; name: string; subject: string; note: string;
  lead?: { id: string; email: string }; requestId?: string; onSaved?: () => void; onReviewSubmit?: (subject: string, body: string) => void;
}
export function AtlasActionReview(props: Props) {
  const [opened, setOpened] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string | null; action: Action }>();
  return <div className="atlas-action-review">
    {receipt ? <p role="status">{receipt.action === 'email' ? 'Email accepted by Salesforce.' : 'Saved in Salesforce.'}
      {receipt.id && <a href={orgCoreOrigin() + '/' + receipt.id} target="_blank" rel="noreferrer"> Open record</a>}</p>
      : opened ? <ReviewForm {...props} cancel={() => setOpened(false)} done={(id, action) => {
        setReceipt({ id, action }); props.onSaved?.();
      }} /> : <button type="button" className="secondary" onClick={() => setOpened(true)}>
        {props.lead ? 'Review email for sending' : 'Review recommended action'}</button>}
  </div>;
}
function ReviewForm({ accountId, ownerId, name, subject: initial, note, lead, requestId, onReviewSubmit, done, cancel }: Props & {
  cancel: () => void; done: (id: string | null, action: Action) => void;
}) {
  const [kind, setKind] = useState<Action>(lead ? 'email' : 'task');
  const [subject, setSubject] = useState(initial);
  const [body, setBody] = useState(note);
  const [recipient, setRecipient] = useState(lead?.email ?? '');
  const [due, setDue] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [key] = useState(() => requestId || crypto.randomUUID());
  useEffect(() => {
    if (kind !== 'email' || lead || !accountId) return;
    let live = true;
    void fetchAccountEmail(accountId).then(email => { if (live && email) setRecipient(value => value || email); }).catch(() => {});
    return () => { live = false; };
  }, [kind, accountId, lead]);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError('');
    const common = { subject: subject.trim(), description: body.trim(), requestId: key };
    const input: CrmWriteInput = kind === 'email' ? { ...common, action: 'email', toAddress: recipient.trim(), whoId: lead?.id, ownerId }
      : kind === 'case' ? { ...common, action: 'case', accountId }
      : { ...common, action: 'task', whatId: accountId, ownerId, dueDate: due || undefined,
        ...(kind === 'call' ? { type: 'Call', status: 'Completed' } : {}) };
    try { onReviewSubmit?.(common.subject,common.description); const result = await crmWrite(input); done(result.id, kind); }
    catch (err) { setError(err instanceof Error ? err.message : 'Salesforce could not complete the action.'); }
    finally { lock.current = false; setPending(false); }
  }
  return <form className="atlas-review-form" aria-label="Review Salesforce action" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <fieldset disabled={pending}><legend>{name}</legend>
      {!lead && <label>Action<select value={kind} onChange={e => setKind(e.target.value as Action)}>
        {Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {kind === 'email' && <label>Recipient<input type="email" value={recipient} readOnly={!!lead} required onChange={e => setRecipient(e.target.value)} /></label>}
      <label>Subject<input required value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label>{kind === 'email' ? 'Message' : 'Notes'}<textarea required={kind === 'email'} value={body} onChange={e => setBody(e.target.value)} /></label>
      {kind === 'task' && <label>Due date<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>}
      <button type="submit" className="primary" disabled={!subject.trim() || (kind === 'email' && (!body.trim() || !recipient.trim()))}>{pending ? 'Submitting…' : labels[kind]}</button>
      <button type="button" className="secondary" onClick={cancel}>Cancel</button>
    </fieldset>{error && <p role="alert">{error}</p>}
  </form>;
}
