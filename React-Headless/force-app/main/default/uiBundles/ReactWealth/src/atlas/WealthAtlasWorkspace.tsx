import { Fragment, useRef, useState, type FormEvent } from 'react';
import AtlasToday from '@shared/components/atlas/AtlasToday';
import type { AtlasLink } from '@shared/components/atlas/AtlasShell';
import type { CurrentUser } from '@shared/data/crmWriteClient';
import { orgCoreOrigin } from '@shared/data/orgEnv';
import { submitWealthProposal } from './wealthProposalWrite';
import { stringField } from './wealthAtlasData';
import { dates, type OpenProposal, RecordDialog, useWorkspaceView } from './wealthAtlasUi';
import WealthCapital from './WealthCapital';
import Relationships from './WealthRelationships';
import WealthHousehold from './WealthHousehold';
import { LifeAndGoals, Horizon } from './WealthPlanning';
import Workbench from './WealthWorkbench';
import {
  type Proposal,
  type ProposalDraft,
  ProposalForm,
  ReviewFolio,
  ReviewPacket,
} from './WealthProposals';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-atlas.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-capital-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-relationships.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-life-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-retained-scenes.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-review-packet.css';
import './wealthAtlas.css';

function loadProposals(key: string | null): Proposal[] {
  if (!key) return [];
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter(
          (value): value is Proposal =>
            value &&
            typeof value.id === 'string' &&
            typeof value.title === 'string' &&
            typeof value.kind === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

export type WealthAtlasWorkspaceProps = {
  page: string;
  ownerId: string;
  ownerName?: string;
  actorScope?: string;
  today?: { owner: CurrentUser; link: AtlasLink };
};

function Workspace({
  page,
  ownerId,
  ownerName,
  actorScope,
  today,
}: WealthAtlasWorkspaceProps) {
  const storageKey = actorScope ? `cumulus.atlas.proposals.wealth.${actorScope}.${ownerId}` : null;
  const [proposals, setProposals] = useState(() => loadProposals(storageKey));
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [resultId, setResultId] = useState<string | null>(null);
  const accountId = useWorkspaceView().get('client');
  const prepare = (proposal: ProposalDraft) => {
    setStatus('');
    setResultId(null);
    setDraft(proposal);
  };
  const propose: OpenProposal = (kind, title, source, accountId) => {
    const saved =
      kind === 'Review folio' && proposals.find(item => item.kind === kind && item.accountId === accountId);
    if (saved) {
      prepare(saved);
      return;
    }
    const start = stringField(source, 'ActivityDateTime') || stringField(source, 'StartDateTime');
    const local = start ? new Date(start) : null;
    const validStart = local && Number.isFinite(local.valueOf()) ? local : null;
    const two = (v: number) => String(v).padStart(2, '0');
    prepare({
      kind,
      title,
      sourceId: source?.Id,
      accountId,
      description: stringField(source, 'Description'),
      date: validStart ? [validStart.getFullYear(), two(validStart.getMonth()+1), two(validStart.getDate())].join('-') : dates(
        stringField(source, 'ActivityDate') ||
          stringField(source, 'ActivityDateTime') ||
          stringField(source, 'EventDate') ||
          stringField(source, 'TargetDate')
      ),
      details: {StartTime: validStart ? two(validStart.getHours())+':'+two(validStart.getMinutes()) : '', ...Object.fromEntries(
        [
          'Type',
          'EventType',
          'TargetAmount',
          'ActualAmount',
          'Status',
          'Priority',
          'FirstName',
          'LastName',
          'Company',
          'Email',
          'Location',
          'EvidenceKind',
          'EvidencePeriod',
          'EvidenceSummary',
          'AccountName',
          'Product',
          'ProductCode', 'Amount',
        ].map(key => [key, stringField(source, key)])
      )},
    });
  };
  const save = (event: FormEvent<HTMLFormElement>, current = draft, close = true) => {
    event.preventDefault();
    if (!current || lock.current) return;
    const submit = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'crm';
    if (!storageKey) {
      setStatus('Sign-in is required to save a local proposal for this book.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const proposal = {
      ...current,
      id: current.id ?? crypto.randomUUID(),
      title: String(form.get('title')).trim(),
      description: String(form.get('description') ?? '').trim(),
      date: String(form.get('date') ?? ''),
      details: {
        ...current.details,
        ...Object.fromEntries(
          Array.from(form.entries())
            .filter(([key]) => key.startsWith('detail:'))
            .map(([key, value]) => [key.slice(7), String(value)])
        ),
      },
    };
    if (!proposal.title) return;
    const next = [proposal, ...loadProposals(storageKey).filter(item => item.id !== proposal.id)];
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setProposals(next);
      if (submit) {
        setDraft(proposal);
        lock.current = true;
        setPending(true);
        setStatus('Submitting to Salesforce…');
        void submitWealthProposal(proposal, ownerId).then(result => {
          const remaining = loadProposals(storageKey).filter(item => item.id !== proposal.id);
          let message = 'Salesforce accepted the change.';
          try { sessionStorage.setItem(storageKey, JSON.stringify(remaining)); }
          catch { message += ' Browser storage could not remove the saved draft.'; }
          setProposals(remaining);
          setResultId(/ · (Delete|Cancel)$/.test(proposal.kind) ? null : result.id);
          setStatus(message);
          setDraft(null);
          setRevision(version => version + 1);
          window.dispatchEvent(new Event('cumulus:atlas-stage-drafts'));
        }).catch(error => setStatus(error instanceof Error ? error.message : 'Submission failed. Your draft is saved.'))
          .finally(() => { lock.current = false; setPending(false); });
        return;
      }
      if (close) setDraft(null);
      setStatus('Local proposal saved.');
      window.dispatchEvent(new Event('cumulus:atlas-stage-drafts'));
    } catch {
      setStatus('Browser storage is unavailable. The proposal is still open.');
    }
  };
  const remove = (id: string) => {
    if (!storageKey) return;
    const next = loadProposals(storageKey).filter(item => item.id !== id);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setProposals(next);
      setStatus('Local proposal discarded.');
      window.dispatchEvent(new Event('cumulus:atlas-stage-drafts'));
    } catch {
      setStatus('Browser storage is unavailable. The proposal was kept.');
    }
  };
  const path = page.replace(/^\//, '').replace(/\/$/, '');
  return (
    <div className={today ? undefined : 'wealth-atlas-workspace'}>
      {!draft && status && (
        <span role="status" className="wa-source">
          {status} {resultId && <a href={orgCoreOrigin()+'/'+resultId} target="_blank" rel="noreferrer">Open Salesforce record</a>}
        </span>
      )}
      <Fragment key={revision}>{today ? (
        <AtlasToday persona="wealth" owner={today.owner} link={today.link}
          wealthActions={{
            prepare,
            dialog: (title, close, content) => (
              <RecordDialog title={title} close={close}>{content}</RecordDialog>
            ),
          }}
        />
      ) : path === 'relationships' ? (
        <>
          {accountId ? (
            <WealthHousehold
              key={accountId}
              ownerId={ownerId}
              accountId={accountId}
              actorScope={actorScope}
              propose={propose}
              renderFolio={(account, evidence) => {
                const current = proposals.find(
                  item => item.kind === 'Review folio' && item.accountId === account.Id
                ) ?? {
                  kind: 'Review folio',
                  accountId: account.Id,
                  title: `Review for ${stringField(account, 'Name')}`,
                };
                return (
                  <ReviewPacket
                    account={account}
                    evidence={evidence}
                    draft={current}
                    ownerId={ownerId}
                    ownerName={ownerName}
                    status={status}
                    save={event => save(event, current, false)}
                  />
                );
              }}
            />
          ) : (
            <Relationships ownerId={ownerId} propose={propose} />
          )}
        </>
      ) : path === 'journey' ? (
        <LifeAndGoals ownerId={ownerId} propose={propose} />
      ) : path === 'health' ? (
        <Horizon ownerId={ownerId} propose={propose} />
      ) : path === 'work' ? (
        <Workbench ownerId={ownerId} ownerName={ownerName} proposals={proposals} open={propose} edit={prepare} remove={remove} />
      ) : (
        <WealthCapital key={path} page={path} ownerId={ownerId} propose={propose} />
      )}
      </Fragment>
      {draft && (
        <RecordDialog
          title={draft.kind === 'Review folio' ? 'My review folio'
            : draft.kind === 'Task' && draft.details?.AccountName ? (draft.id ? 'Edit task proposal' : 'New Task')
              : draft.kind}
          close={() => { if (!lock.current) setDraft(null); }}
        >
          {draft.kind === 'Review folio' && draft.accountId ? (
            <ReviewFolio
              key={draft.accountId}
              ownerId={ownerId}
              ownerName={ownerName}
              draft={draft}
              status={status}
              save={save}
            />
          ) : (
            <ProposalForm key={draft.id ?? draft.kind} draft={draft} status={status} pending={pending} save={save} />
          )}
        </RecordDialog>
      )}

    </div>
  );
}

export default function WealthAtlasWorkspace(props: WealthAtlasWorkspaceProps) {
  return (
    <Workspace
      key={`${props.actorScope ?? ''}:${props.ownerId}`}
      {...props}
    />
  );
}
