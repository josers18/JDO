import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Check, CircleCheck, FileText, ListChecks, Lock, Mail, Plus, ShieldAlert, ShieldCheck, Sparkles, TrendingDown, TriangleAlert, X } from 'lucide-react';
import { approveAfterCall, draftAfterCall, fetchAfterCallContext, fetchCallRecord, type AfterCallDraft } from '../personas/customer/afterCall';
import { Badge, Button, Panel, Pending, useLive } from './controls';

type Tone = 'neg' | 'warn' | 'pos' | 'plain';
const Chip = ({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) =>
  <span className={`ca-ac-chip ca-ac-${tone}`}>{icon}<span>{children}</span></span>;

const SectionHead = ({ icon, title, meta, tone = 'plain' }: { icon: ReactNode; title: string; meta?: ReactNode; tone?: Tone }) =>
  <div className="ca-ac-head"><span className={`ca-ac-icon ca-ac-${tone}`}>{icon}</span><h3>{title}</h3>{meta && <span className="ca-ac-meta">{meta}</span>}</div>;

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

interface Saved { draft: AfterCallDraft; count: number; kycFrom: string; title: string }
const RECORD_CHANGED = 'cumulus:call-record-changed';

/**
 * "After the call" for the V2 company page: drafts the post-call work from the latest transcript,
 * Gong sentiment and WorldCheck, lets the banker edit it, and writes it all to CRM on one Approve.
 */
export function AfterCall({ accountId }: { accountId: string }) {
  const [version, setVersion] = useState(0);
  const ctx = useLive(() => fetchAfterCallContext(accountId), `${accountId}|${version}`);
  const [draft, setDraft] = useState<AfterCallDraft | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState<'draft' | 'approve' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
    const final = { ...draft, kycGaps: draft.kycGaps.map(g => g.trim()).filter(Boolean) };
    try {
      const count = await approveAfterCall(c, final);
      setSaved({ draft: final, count, kycFrom: c.kycStatus, title });
      window.dispatchEvent(new Event(RECORD_CHANGED));
      setDraft(null);
      setVersion(v => v + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Approve failed.');
    }
    setBusy(null);
  };
  const set = (patch: Partial<AfterCallDraft>) => setDraft(d => (d ? { ...d, ...patch } : d));
  const setTask = (i: number, patch: Partial<AfterCallDraft['tasks'][number]>) => set({ tasks: draft!.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setGap = (i: number, v: string) => set({ kycGaps: draft!.kycGaps.map((g, j) => (j === i ? v : g)) });

  const kycBad = !!c && /expired|overdue|required/i.test(c.kycStatus);
  const title = c?.note?.title?.replace(/\s*[—–-]\s*call transcript$/i, '') || 'latest call';

  return <Panel title="After the call" action={c?.note && <Badge>{c.note.title} · {c.note.date}</Badge>}>
    {saved ? <div className="ca-ac-saved ca-aftercall-ok" role="status">
      <div className="ca-ac-saved-top">
        <span className="ca-ac-icon ca-ac-pos"><CircleCheck size={22} aria-hidden /></span>
        <div><h3>Saved {saved.count} records to Salesforce</h3><p>Everything below was written in one approval. Nothing was sent to the client.</p></div>
        <Button onClick={() => setSaved(null)}>Done</Button>
      </div>
      <ol className="ca-ac-written">
        {saved.draft.tasks.map((t, i) => <li key={i} style={{ '--i': i } as React.CSSProperties}>
          <span className="ca-ac-icon ca-ac-plain"><ListChecks size={18} aria-hidden /></span>
          <div><strong>Task · {t.subject}</strong><small>Due {shortDate(t.dueDate)} · High priority · linked to the company and contact</small></div>
          <Check className="ca-ac-tick" size={18} aria-hidden />
        </li>)}
        <li style={{ '--i': saved.draft.tasks.length } as React.CSSProperties}>
          <span className="ca-ac-icon ca-ac-plain"><Mail size={18} aria-hidden /></span>
          <div><strong>Email logged · {saved.draft.email.subject}</strong><small>To {saved.draft.email.to || 'the client contact'} · logged as completed, not sent</small></div>
          <Check className="ca-ac-tick" size={18} aria-hidden />
        </li>
        <li style={{ '--i': saved.draft.tasks.length + 1 } as React.CSSProperties}>
          <span className="ca-ac-icon ca-ac-plain"><FileText size={18} aria-hidden /></span>
          <div><strong>Call summary — {saved.title}</strong><small>Meeting note on the company record</small></div>
          <Check className="ca-ac-tick" size={18} aria-hidden />
        </li>
        <li className="ca-ac-written-kyc" style={{ '--i': saved.draft.tasks.length + 2 } as React.CSSProperties}>
          <span className="ca-ac-icon ca-ac-neg"><ShieldAlert size={18} aria-hidden /></span>
          <div><strong>KYC status · {saved.kycFrom || 'Unknown'} → Required</strong><small>{saved.draft.kycGaps.length} {saved.draft.kycGaps.length === 1 ? 'gap' : 'gaps'} recorded for compliance review</small></div>
          <Check className="ca-ac-tick" size={18} aria-hidden />
        </li>
      </ol>
    </div> : <Pending state={ctx}>{!c?.note ? <p>No call transcript has been recorded for this company.</p> : !draft ? (
      <div className="ca-ac-collapsed">
        <div className="ca-ac-signals">
          {c.gong && <Chip tone={/neg/i.test(c.gong.sentiment) ? 'neg' : /pos/i.test(c.gong.sentiment) ? 'pos' : 'plain'} icon={<TrendingDown size={18} aria-hidden />}>Sentiment {c.gong.sentiment.toLowerCase()}</Chip>}
          {c.gong && <Chip tone="plain" icon={<ListChecks size={18} aria-hidden />}>{c.gong.actionItems} action items</Chip>}
          <span className="ca-ac-group" data-rec="compliance">
            <Chip tone={kycBad ? 'warn' : 'pos'} icon={kycBad ? <ShieldAlert size={18} aria-hidden /> : <ShieldCheck size={18} aria-hidden />}>KYC {c.kycStatus || '—'}</Chip>
            {c.pep && <Chip tone="neg" icon={<TriangleAlert size={18} aria-hidden />}>PEP hit</Chip>}
            {c.sanctions && <Chip tone="neg" icon={<TriangleAlert size={18} aria-hidden />}>Sanctions hit</Chip>}
            {c.adverseMedia && <Chip tone="warn" icon={<TriangleAlert size={18} aria-hidden />}>Adverse media</Chip>}
          </span>
        </div>
        <div className="ca-ac-cta">
          <p>Agentforce reads the transcript with Gong and WorldCheck, then drafts the tasks, the client email and the KYC gaps for you to review.</p>
          <Button style="primary" onClick={() => void run()}>{busy === 'draft' ? 'Drafting…' : <><Sparkles size={16} aria-hidden /> Draft follow-ups</>}</Button>
        </div>
      </div>
    ) : (
      <div className="ca-ac-form">
        <div className="ca-ac-block">
          <SectionHead icon={<FileText size={20} aria-hidden />} title="Call summary" meta="Saved as a meeting note" />
          <textarea aria-label="Call summary" rows={4} value={draft.summary} onChange={e => set({ summary: e.target.value })} />
        </div>

        <div className="ca-ac-block" role="group" aria-label="Follow-up tasks">
          <SectionHead icon={<ListChecks size={20} aria-hidden />} title="Follow-up tasks" meta={`${draft.tasks.length} tasks · High priority`} />
          <ul className="ca-ac-tasks">
            {draft.tasks.map((t, i) => <li key={i}>
              <span className="ca-ac-num" aria-hidden>{i + 1}</span>
              <input aria-label={`Task ${i + 1}`} value={t.subject} onChange={e => setTask(i, { subject: e.target.value })} />
              <label className="ca-ac-due"><CalendarDays size={16} aria-hidden /><input aria-label={`Task ${i + 1} due`} type="date" value={t.dueDate} onChange={e => setTask(i, { dueDate: e.target.value })} /></label>
            </li>)}
          </ul>
        </div>

        <div className="ca-ac-block" role="group" aria-label="Client email">
          <SectionHead icon={<Mail size={20} aria-hidden />} title="Client email" meta={<span className="ca-ac-logged"><Lock size={14} aria-hidden /> Logged, not sent</span>} />
          <div className="ca-ac-mail">
            <div className="ca-ac-mailrow"><span>To</span><strong>{draft.email.to || '—'}</strong></div>
            <div className="ca-ac-mailrow"><span>Subject</span><input aria-label="Email subject" value={draft.email.subject} onChange={e => set({ email: { ...draft.email, subject: e.target.value } })} /></div>
            <textarea aria-label="Email body" rows={8} value={draft.email.body} onChange={e => set({ email: { ...draft.email, body: e.target.value } })} />
          </div>
        </div>

        <div className="ca-ac-kyc" role="group" aria-label="KYC gaps">
          <div className="ca-ac-kyc-top">
            <span className="ca-ac-kyc-icon"><ShieldAlert size={30} aria-hidden /></span>
            <div>
              <h3>KYC gaps need compliance attention</h3>
              <p>Approving sets this client's KYC status to <strong>Required</strong> and records every gap below.</p>
            </div>
            <span className="ca-ac-status"><span>{c.kycStatus || 'Unknown'}</span> → <strong>Required</strong></span>
          </div>
          <ul className="ca-ac-gaps">
            {draft.kycGaps.map((g, i) => <li key={i}>
              <TriangleAlert size={18} aria-hidden />
              <input aria-label={`KYC gap ${i + 1}`} value={g} onChange={e => setGap(i, e.target.value)} />
              <button type="button" className="ca-ac-icon-btn" aria-label={`Remove KYC gap ${i + 1}`} onClick={() => set({ kycGaps: draft.kycGaps.filter((_, j) => j !== i) })}><X size={16} aria-hidden /></button>
            </li>)}
          </ul>
          <button type="button" className="ca-ac-add" onClick={() => set({ kycGaps: [...draft.kycGaps, ''] })}><Plus size={16} aria-hidden /> Add a gap</button>
        </div>

        {msg && <p role="alert" className="ca-aftercall-error">{msg}</p>}
        <div className="ca-aftercall-actions">
          <button type="button" className="primary" onClick={() => void approve()} disabled={busy !== null || !draft.tasks.length}>{busy === 'approve' ? 'Saving…' : 'Approve'}</button>
          <Button onClick={() => setDraft(null)}>Discard</Button>
          <small>Writes {draft.tasks.length + 3} records · {draft.source === 'model' ? 'Drafted by Agentforce' : 'Composed from transcript + signals'}</small>
        </div>
      </div>
    )}</Pending>}
  </Panel>;
}

/** Read-only view of what CRM holds now: KYC status and gaps plus the latest meeting notes. */
export function CallRecord({ accountId }: { accountId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN(v => v + 1);
    window.addEventListener(RECORD_CHANGED, bump);
    return () => window.removeEventListener(RECORD_CHANGED, bump);
  }, []);
  const record = useLive(() => fetchCallRecord(accountId), `${accountId}|${n}`);
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
