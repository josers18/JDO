import { useState } from 'react';
import { Panel, useAsyncData } from '@shared';
import { fetchAfterCallContext, draftAfterCall, approveAfterCall, type AfterCallDraft } from './afterCall';

const label: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 };
const field: React.CSSProperties = { width: '100%', padding: '0.5rem 0.6rem', fontSize: '0.85rem', lineHeight: 1.5, background: 'var(--wp-surface-raised)', color: 'inherit', border: '1px solid var(--wp-border-strong)', borderRadius: 'var(--wp-radius-sm)', fontFamily: 'inherit' };
const btn: React.CSSProperties = { padding: '0.45rem 0.9rem', fontSize: '0.8rem', fontWeight: 700, borderRadius: 'var(--wp-radius-sm)', border: '1px solid var(--wp-border-strong)', background: 'var(--wp-surface-raised)', color: 'inherit', cursor: 'pointer' };

/**
 * "After the call" — drafts the post-call work from the latest transcript note,
 * Gong sentiment and WorldCheck, lets the banker edit it, and writes it all to
 * CRM on one Approve.
 */
export function AfterCallPanel({ accountId }: { accountId: string }) {
  const ctx = useAsyncData(() => fetchAfterCallContext(accountId), [accountId]);
  const [draft, setDraft] = useState<AfterCallDraft | null>(null);
  const [busy, setBusy] = useState<'draft' | 'approve' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const c = ctx.data;
  if (ctx.loading || !c?.note) return null;

  const run = async () => {
    setBusy('draft'); setMsg(null);
    setDraft(await draftAfterCall(c));
    setBusy(null);
  };
  const approve = async () => {
    if (!draft) return;
    setBusy('approve'); setMsg(null);
    try {
      const n = await approveAfterCall(c, draft);
      setMsg({ ok: true, text: `Saved ${n} records: ${draft.tasks.length} follow-up tasks, email logged (not sent), call summary note, KYC set to Required.` });
      setDraft(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Approve failed.' });
    }
    setBusy(null);
  };
  const set = (patch: Partial<AfterCallDraft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  return (
    <Panel
      title="After the call"
      accentRail
      action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>{c.note.title} · {c.note.date}</span>}
    >
      {!draft ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.86rem', color: 'var(--wp-text-muted)', flex: 1, minWidth: 220 }}>
            {c.gong ? `Sentiment ${c.gong.sentiment.toLowerCase()} · ${c.gong.actionItems} action items · ` : ''}
            KYC {c.kycStatus || '—'}{c.pep ? ' · PEP hit' : ''}
          </span>
          <button type="button" style={btn} onClick={run} disabled={busy !== null}>{busy === 'draft' ? 'Drafting…' : 'Draft follow-ups'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div>
            <div style={label}>Call summary</div>
            <textarea aria-label="Call summary" style={field} rows={4} value={draft.summary} onChange={e => set({ summary: e.target.value })} />
          </div>
          <div>
            <div style={label}>Follow-up tasks</div>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {draft.tasks.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '0.4rem' }}>
                  <input aria-label={`Task ${i + 1}`} style={field} value={t.subject} onChange={e => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })} />
                  <input aria-label={`Task ${i + 1} due`} type="date" style={field} value={t.dueDate} onChange={e => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)) })} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={label}>Client email · to {draft.email.to || '—'} · logged, not sent</div>
            <input aria-label="Email subject" style={{ ...field, marginBottom: '0.4rem' }} value={draft.email.subject} onChange={e => set({ email: { ...draft.email, subject: e.target.value } })} />
            <textarea aria-label="Email body" style={field} rows={8} value={draft.email.body} onChange={e => set({ email: { ...draft.email, body: e.target.value } })} />
          </div>
          <div>
            <div style={label}>KYC gaps → KYC status Required</div>
            <textarea aria-label="KYC gaps" style={field} rows={4} value={draft.kycGaps.join('\n')} onChange={e => set({ kycGaps: e.target.value.split('\n') })} />
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button type="button" style={{ ...btn, background: 'var(--wp-accent)', color: '#fff', borderColor: 'transparent' }} onClick={approve} disabled={busy !== null || !draft.tasks.length}>
              {busy === 'approve' ? 'Saving…' : 'Approve'}
            </button>
            <button type="button" style={btn} onClick={() => setDraft(null)} disabled={busy !== null}>Discard</button>
            <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>{draft.source === 'model' ? 'Drafted by Agentforce' : 'Composed from transcript + signals'}</span>
          </div>
        </div>
      )}
      {msg && <p role="status" style={{ margin: '0.7rem 0 0', fontSize: '0.82rem', color: msg.ok ? 'var(--wp-pos)' : 'var(--wp-neg)' }}>{msg.text}</p>}
    </Panel>
  );
}
