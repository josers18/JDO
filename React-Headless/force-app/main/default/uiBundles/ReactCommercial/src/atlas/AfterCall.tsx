import { useState } from 'react';
import { approveAfterCall, draftAfterCall, fetchAfterCallContext, fetchCallRecord, type AfterCallDraft } from '../personas/customer/afterCall';
import { Badge, Button, Panel, Pending, useLive } from './controls';

/**
 * "After the call" for the V2 company page: drafts the post-call work from the latest transcript,
 * Gong sentiment and WorldCheck, lets the banker edit it, and writes it all to CRM on one Approve.
 */
export function AfterCall({ accountId }: { accountId: string }) {
  const [version, setVersion] = useState(0);
  const ctx = useLive(() => fetchAfterCallContext(accountId), `${accountId}|${version}`);
  const [draft, setDraft] = useState<AfterCallDraft | null>(null);
  const [busy, setBusy] = useState<'draft' | 'approve' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = ctx.value;

  const run = async () => {
    if (!c) return;
    setBusy('draft'); setMsg(null);
    setDraft(await draftAfterCall(c));
    setBusy(null);
  };
  const approve = async () => {
    if (!c || !draft) return;
    setBusy('approve'); setMsg(null);
    try {
      const n = await approveAfterCall(c, draft);
      setMsg({ ok: true, text: `Saved ${n} records: ${draft.tasks.length} follow-up tasks, email logged (not sent), call summary note, KYC set to Required.` });
      setDraft(null);
      setVersion(v => v + 1);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Approve failed.' });
    }
    setBusy(null);
  };
  const set = (patch: Partial<AfterCallDraft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  return <Panel title="After the call" action={c?.note && <Badge>{c.note.title} · {c.note.date}</Badge>}>
    <Pending state={ctx}>{!c?.note ? <p>No call transcript has been recorded for this company.</p> : !draft ? (
      <div className="ca-aftercall-summary">
        <p>
          {c.gong ? `Sentiment ${c.gong.sentiment.toLowerCase()} · ${c.gong.actionItems} action items · ` : ''}
          KYC {c.kycStatus || '—'}{c.pep ? ' · PEP hit' : ''}
        </p>
        <Button style="primary" onClick={() => void run()}>{busy === 'draft' ? 'Drafting…' : 'Draft follow-ups'}</Button>
      </div>
    ) : (
      <div className="ca-aftercall-form">
        <label>Call summary<textarea aria-label="Call summary" rows={4} value={draft.summary} onChange={e => set({ summary: e.target.value })} /></label>
        <fieldset><legend>Follow-up tasks</legend>
          {draft.tasks.map((t, i) => <div className="ca-aftercall-task" key={i}>
            <input aria-label={`Task ${i + 1}`} value={t.subject} onChange={e => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })} />
            <input aria-label={`Task ${i + 1} due`} type="date" value={t.dueDate} onChange={e => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)) })} />
          </div>)}
        </fieldset>
        <fieldset><legend>Client email · to {draft.email.to || '—'} · logged, not sent</legend>
          <input aria-label="Email subject" value={draft.email.subject} onChange={e => set({ email: { ...draft.email, subject: e.target.value } })} />
          <textarea aria-label="Email body" rows={8} value={draft.email.body} onChange={e => set({ email: { ...draft.email, body: e.target.value } })} />
        </fieldset>
        <label>KYC gaps → KYC status Required<textarea aria-label="KYC gaps" rows={4} value={draft.kycGaps.join('\n')} onChange={e => set({ kycGaps: e.target.value.split('\n') })} /></label>
        <div className="ca-aftercall-actions">
          <button type="button" className="primary" onClick={() => void approve()} disabled={busy !== null || !draft.tasks.length}>{busy === 'approve' ? 'Saving…' : 'Approve'}</button>
          <Button onClick={() => setDraft(null)}>Discard</Button>
          <small>{draft.source === 'model' ? 'Drafted by Agentforce' : 'Composed from transcript + signals'}</small>
        </div>
      </div>
    )}</Pending>
    {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ca-aftercall-ok' : 'ca-aftercall-error'}>{msg.text}</p>}
  </Panel>;
}

/** Read-only view of what CRM holds now: KYC status and gaps plus the latest meeting notes. */
export function CallRecord({ accountId }: { accountId: string }) {
  const record = useLive(() => fetchCallRecord(accountId), accountId);
  const r = record.value;
  return <Panel title="Recorded in Salesforce">
    <Pending state={record}>{r ? <>
      <p><strong>KYC status</strong> · {r.kycStatus || '—'}</p>
      {r.kycSummary && <p className="ca-aftercall-pre">{r.kycSummary}</p>}
      {r.notes.length ? r.notes.map(n => <article className="ca-conversation-entry" key={n.id}><time>{n.date}</time><h3>{n.title}</h3><p className="ca-aftercall-clamp">{n.body}</p></article>)
        : <p>No meeting notes are recorded for this company.</p>}
    </> : <p>This company could not be read from Salesforce.</p>}</Pending>
  </Panel>;
}
