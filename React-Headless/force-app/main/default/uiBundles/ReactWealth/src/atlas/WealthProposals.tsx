import { GOAL_PRIORITY_OPTIONS, GOAL_STATUS_OPTIONS, GOAL_TYPE_OPTIONS } from '@shared/components/home/types';
import { submissionLabel } from './wealthProposalWrite';
import { useState, type FormEvent } from 'react';
import { useAsyncData } from '@shared/hooks/useAsyncData';
import { stringField, type RecordNode } from './wealthAtlasData';
import {
  fetchHouseholdEvidence,
  verifyHousehold,
  householdProductLabel,
  type HouseholdEvidence,
} from './wealthHouseholdData';
import { formatDate, formatMoney, formatPct, initials, numericField, SourceState } from './wealthAtlasUi';
export type Proposal = {
  id: string;
  kind: string;
  title: string;
  description: string;
  date: string;
  sourceId?: string;
  accountId?: string;
  details?: Record<string, string>;
};
export type ProposalDraft = Omit<Proposal, 'id' | 'description' | 'date'> & Partial<Proposal>;

type ProposalField = { key: string; label: string; type?: string; required?: boolean };
const draftFields: Record<string, ProposalField[]> = {
  'Life event': [{ key: 'EventType', label: 'Event type', required: true }],
  Goal: [
    { key: 'Type', label: 'Goal type' },
    { key: 'Status', label: 'Status' },
    { key: 'Priority', label: 'Priority' },
    { key: 'TargetAmount', label: 'Target amount (USD)', type: 'number', required: true },
    { key: 'ActualAmount', label: 'Actual amount (USD)', type: 'number' },
  ],
  Lead: [
    { key: 'FirstName', label: 'First name' },
    { key: 'LastName', label: 'Last name', required: true },
    { key: 'Company', label: 'Company', required: true },
    { key: 'Email', label: 'Email', type: 'email' },
    { key: 'Status', label: 'Status' },
  ],
  Opportunity: [{ key: 'Amount', label: 'Opportunity amount (USD)', type: 'number' }],
  Meeting: [{ key: 'StartTime', label: 'Local start time', type: 'time' }, { key: 'Location', label: 'Location' }],
  Task: [
    { key: 'Priority', label: 'Priority' },
    { key: 'Status', label: 'Status' },
  ],
};

export function ProposalForm({
  draft,
  status,
  save, pending = false,
}: {
  pending?: boolean;
  draft: ProposalDraft;
  status: string;
  save: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const kind = draft.kind.split(' · ')[0];
  const { AccountName, Product, ProductCode, EvidenceKind, EvidencePeriod, EvidenceSummary } = draft.details ?? {};
  return (
    <form onSubmit={save} className="wa" aria-busy={pending}><fieldset disabled={pending} style={{border:0,padding:0,margin:0}}>
      {AccountName && (
        <section className="wa-proposal-context" aria-label="Proposal context">
          <p><strong>{AccountName}</strong>{Product && ` · ${Product}`}</p>
          <p>{[EvidenceKind, ProductCode].filter(Boolean).join(' · ')}</p>
          {EvidencePeriod && <p>Source date {formatDate(EvidencePeriod)}</p>}
          {EvidenceSummary && <details><summary>Linked source evidence</summary><p>{EvidenceSummary}</p></details>}
          <p className="wa-source">Save a draft to return to it in Workbench.</p>
        </section>
      )}
      <label className="wa-field">
        {kind === 'Task' && AccountName ? 'Subject' : 'Title'}
        <input name="title" readOnly={kind === 'Opportunity'} defaultValue={kind === 'Opportunity' && Product && AccountName ? Product + ' — ' + AccountName : draft.title} required />
      </label>
      <label className="wa-field">
        {kind === 'Goal' ? 'Target date' : kind === 'Life event' ? 'Event date' : kind === 'Task' && AccountName ? 'Due date' : 'Date'}
        <input name="date" type="date" defaultValue={draft.date} required={kind === 'Life event'} />
      </label>
      {draftFields[kind]?.map(({ key, type, required, label }) => {
        const value = draft.details?.[key] ?? '';
        const options = kind !== 'Goal' ? undefined : key === 'Priority' ? GOAL_PRIORITY_OPTIONS
          : key === 'Status' ? GOAL_STATUS_OPTIONS : key === 'Type' ? GOAL_TYPE_OPTIONS.map(v => ({value:v,label:v})) : undefined;
        return (
          <label className="wa-field" key={key}>
            {label}
            {options ? <select name={`detail:${key}`} defaultValue={value || (key === 'Type' ? 'Other' : '')}><option value="">Default</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : key === 'EventType' ? (
              value ? (
                <input name={`detail:${key}`} value={value} readOnly />
              ) : (
                <select name={`detail:${key}`} required defaultValue="">
                  <option value="">Choose event type…</option>
                  {[
                    'Birth',
                    'Baby',
                    'Graduation',
                    'Job',
                    'Marriage',
                    'Relocation',
                    'Home',
                    'Car',
                    'Diagnosis',
                    'Retirement',
                  ].map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              )
            ) : (
              <input
                name={`detail:${key}`}
                type={type}
                step={type === 'number' ? 'any' : undefined}
                defaultValue={value}
                required={required}
              />
            )}
          </label>
        );
      })}
      <label className="wa-field">
        Description
        <textarea name="description" defaultValue={draft.description} rows={4} />
      </label>
      {draft.accountId && <p>Related record {draft.accountId}</p>}
      {draft.sourceId && <p>Linked source {draft.sourceId}</p>}
      <div className="wa-actions"><button type="submit" className="secondary">Save local proposal</button>
        {submissionLabel(draft.kind) && <button type="submit" name="intent" value="crm" className="primary">{pending ? 'Submitting…' : submissionLabel(draft.kind)}</button>}
      </div></fieldset>
      <p role="status">{status}</p>
    </form>
  );
}

const folioSections = [
  ['summary', 'Relationship summary'],
  ['financials', 'Accounts & outside assets'],
  ['plans', 'Plan & CRM goals'],
  ['products', 'Product conversations'],
  ['risk', 'Risk & concentration'],
  ['engagement', 'Recent engagement'],
  ['campaigns', 'Campaign history'],
  ['notes', 'Source notes'],
] as const;
type Section = (typeof folioSections)[number][0];
type FolioProps = {
  draft: ProposalDraft;
  ownerId: string;
  ownerName?: string;
  status: string;
  save: (event: FormEvent<HTMLFormElement>) => void;
};

export function ReviewFolio(props: FolioProps) {
  const { ownerId, draft } = props;
  const source = useAsyncData(async () => {
    const account = draft.accountId ? await verifyHousehold(ownerId, draft.accountId) : null;
    return account ? { account, evidence: await fetchHouseholdEvidence(ownerId, account) } : null;
  }, [ownerId, draft.accountId]);
  if (source.loading || source.error || !source.data)
    return <SourceState source={source} empty="A verified household is required for this folio." />;
  return <ReviewPacket {...props} {...source.data} />;
}

export function ReviewPacket({
  draft,
  status,
  save,
  ownerName,
  account,
  evidence,
}: FolioProps & { account: RecordNode; evidence: HouseholdEvidence }) {
  const allowed = new Set<string>(folioSections.map(([key]) => key));
  const [selected, setSelected] = useState(() =>
    (draft.details?.Sections ?? 'summary,plans,products')
      .split(',')
      .map(key => (key === 'planning' || key === 'goals' ? 'plans' : key === 'capital' ? 'financials' : key))
      .filter(key => allowed.has(key))
  );
  const [tone, setTone] = useState(draft.details?.Tone || 'Concise');
  const [questions, setQuestions] = useState(draft.description ?? '');
  const { core, plan, outside, goals, signals } = evidence;
  const name = stringField(account, 'Name');
  const latest = signals?.feedback.rows[0];
  const gong = signals?.gong.rows[0];
  const aml = signals?.screening.rows[0];
  const forecast = signals?.prediction.rows[0];
  const opening =
    tone === 'Detailed'
      ? 'Review the source evidence, confirm household priorities, and record the next commitment.'
      : tone === 'Conversational'
        ? 'Start with what matters most to the household, then decide the next step together.'
        : 'Confirm priorities and agree on the next useful step.';
  const summary = [
    ['Household', name],
    ['Email on file', stringField(account, 'PersonEmail') || 'Not supplied'],
    ['Advisor', ownerName || 'Selected advisory book'],
    ['Account', account.Id],
  ];
  const display = (value: unknown) => (value == null || value === '' ? 'Not supplied' : String(value));
  const fmt = (value: unknown) =>
    value != null && Number.isFinite(Number(value)) ? formatPct(Number(value)) : 'Not supplied';
  const listed = (
    values?: string[],
    unavailable = 'Source unavailable for this household.',
    noRows = 'No matching source records.'
  ) => (values ? (values.length ? values : [noRows]) : [unavailable]);
  const paper: Record<Section, string[]> = {
    summary: [opening, ...summary.map(([label, value]) => `${label}: ${value}`)],
    financials: [
      ...listed(
        core?.finAccounts.map(
          row => `${row.name} · ${row.type} · ${formatMoney(row.balance)} · ${row.status}`
        )
      ),
      outside
        ? `${formatMoney(outside.balance)} in qualifying external investment assets. Largest account at ${outside.institution}.`
        : 'No external investment asset evidence available.',
    ],
    plans: [
      plan
        ? `${plan.status} · ${fmt(plan.success)} modeled success · provider review ${formatDate(plan.next_review)} · ${formatMoney(plan.goal_usd)} provider goal exposure.`
        : 'Provider plan evidence unavailable.',
      ...listed(
        goals?.map(
          row =>
            `${stringField(row, 'Name')} · ${formatMoney(numericField(row, 'ActualAmount'))} funded · ${formatMoney(numericField(row, 'TargetAmount'))} target`
        ),
        'CRM goal source unavailable.',
        'No CRM goals returned for this household.'
      ),
    ],
    products: listed(
      signals?.products.error
        ? undefined
        : signals?.products.rows.map(
            row =>
              `${householdProductLabel(row.code)} · ${fmt(row.probability)} modeled conversion · ${formatMoney(row.value == null ? null : Number(row.value))} modeled expected value`
          )
    ),
    risk: [
      aml
        ? `Screening rating ${display(aml.rating)} · last screened ${formatDate(display(aml.dt))}`
        : 'Screening source evidence unavailable.',
      core?.property
        ? `Property source · ${core.property.propertyType} · ${core.property.asOf}`
        : 'No property source evidence available.',
      forecast
        ? `Predicted satisfaction ${display(forecast.pred)} / 100 · model output`
        : 'No prediction source evidence available.',
    ],
    engagement: [
      ...(latest
        ? [`Observed satisfaction ${display(latest.csat)} / 100 · ${formatDate(display(latest.dt))}`]
        : []),
      ...(gong ? [`Conversation sentiment ${display(gong.sent)} · ${formatDate(display(gong.period))}`] : []),
      ...listed(core?.interactions.map(row => `${row.when} · ${row.type} · ${row.summary}`)),
    ],
    campaigns: listed(core?.campaigns.map(row => `${row.memberSince} · ${row.name} · ${row.status}`)),
    notes: listed(core?.meetingNotes.map(row => `${row.date} · ${row.title} · ${row.body}`)),
  };
  const included = folioSections.filter(([key]) => selected.includes(key));
  const prompt = `Prepare a ${tone.toLowerCase()} household review for ${name} using these source sections: ${included.map(([, label]) => label).join(', ') || 'none selected'}. Preserve the source dates and distinguish observations from models.`;
  function exportFolio(printed: boolean) {
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
      );
    const sections = included
      .map(
        ([key, label]) =>
          `<section><h2>${escape(label)}</h2>${paper[key].map(value => `<p>${escape(value)}</p>`).join('')}</section>`
      )
      .join('');
    const document = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(name)} · Review folio</title><style>body{margin:2rem auto;padding:0 1.5rem;max-width:52rem;color:#342b47;font:16px/1.6 system-ui,sans-serif}section{border-top:1px solid #ddd0ea;padding:1rem 0}h1,h2{line-height:1.2}p{white-space:pre-wrap}</style><main><h1>${escape(name)}</h1><p>Household review working paper · ${escape(tone)}</p>${sections}${questions ? `<section><h2>Private questions</h2><p>${escape(questions)}</p></section>` : ''}</main></html>`;
    const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = url;
    if (printed) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.download = 'household-review-folio.html';
    }
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return (
    <div className="wa wrp">
      <header className="wrp-heading">
        <div>
          <h2>Household review folio</h2>
          <p>Shape the evidence into the conversation I want to have.</p>
        </div>
        <span className="wrp-local">Browser-local working copy</span>
      </header>
      <div className="wrp-studio">
        <aside className="wrp-builder">
          <details className="wrp-settings" open>
            <summary>
              Customize this review<span>Sections, tone &amp; questions</span>
            </summary>
            <form className="wrp-settings-body" onSubmit={save}>
              <div className="wrp-builder-identity">
                <span>{initials(name)}</span>
                <div>
                  <strong>{name}</strong>
                  <small>Exact Account …{account.Id.slice(-6)}</small>
                </div>
              </div>
              <fieldset>
                <legend>What belongs in this review?</legend>
                {folioSections.map(([key, label]) => (
                  <label className="wrp-section-choice" key={key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      onChange={event =>
                        setSelected(values =>
                          event.target.checked ? [...values, key] : values.filter(value => value !== key)
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="wrp-field">
                Preparation tone
                <select name="detail:Tone" value={tone} onChange={event => setTone(event.target.value)}>
                  {['Concise', 'Conversational', 'Detailed'].map(value => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="wrp-field">
                Questions for my review
                <textarea
                  name="description"
                  value={questions}
                  onChange={event => setQuestions(event.target.value)}
                  rows={5}
                  placeholder="What would make this conversation useful?"
                />
              </label>
              <input name="title" value={draft.title} type="hidden" />
              <input name="detail:Sections" value={selected.join(',')} type="hidden" />
              <button className="primary" type="submit">
                Save private folio
              </button>
              <span role="status">{status}</span>
              <details className="wrp-prompt">
                <summary>Prompt preview</summary>
                <pre>{prompt}</pre>
              </details>
            </form>
          </details>
        </aside>
        <div className="wrp-preview">
          <div className="wrp-preview-bar">
            <span>{included.length} sections selected</span>
            <div>
              <button className="secondary" onClick={() => exportFolio(true)}>
                Open print view
              </button>
              <button className="secondary" onClick={() => exportFolio(false)}>
                Download HTML
              </button>
            </div>
          </div>
          <article className="wrp-paper wa-paper">
            <header>
              <div>
                <span>Household review working paper</span>
                <h2>{name}</h2>
                <p>Live source evidence · {tone} preparation</p>
              </div>
              <div className="wrp-paper-seal">{initials(name)}</div>
            </header>
            {included.map(([key, label]) => (
              <section key={key} data-wrp-section-preview={key}>
                <h3>{label}</h3>
                {key === 'summary' ? (
                  <>
                    <p className="wrp-opening">{opening}</p>
                    <dl className="wrp-summary">
                      {summary.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  paper[key].map((value, index) => <p key={index}>{value}</p>)
                )}
              </section>
            ))}
            {!included.length && (
              <p className="wrp-empty">Choose at least one section to shape this working paper.</p>
            )}
            {questions.trim() && (
              <section className="wrp-private">
                <h3>My private questions</h3>
                <p>{questions}</p>
              </section>
            )}
            <footer>Prepared locally from live source records.</footer>
          </article>
        </div>
      </div>
    </div>
  );
}
