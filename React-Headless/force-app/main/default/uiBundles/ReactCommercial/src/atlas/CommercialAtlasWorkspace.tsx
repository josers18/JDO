import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import '../../../../../../../docs/design-studies/2026-11-12-directions/commercial-atlas.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/commercial-studio.css';
import '../../../../../../../docs/design-studies/2026-11-12-directions/commercial-review.css';
import './commercialAtlas.css';
import { CompanyDirectory } from './CompanyDirectory';
import { Credit } from './Credit';
import { Growth, type Offer } from './Growth';
import { Today, Intelligence, type Followup } from './TodayIntel';
import { Planning, Workbench } from './Work';
import { DraftForm, type Draft, type DraftSeed, type DraftEditor } from './drafts';
import { CommercialOwner } from './controls';
import { Company } from './Company';

const pages: Record<string, string> = { '/': 'today', '/relationships': 'companies', '/journey': 'journey', '/growth': 'growth', '/intelligence': 'intel', '/health': 'health', '/work': 'work' };
export type CommercialWorkspaceProps = {
  page: string; ownerId: string; ownerName: string; actorScope?: string; actorName?: string;
  renderPipeline?: (edit: DraftEditor) => ReactNode;
};
export default function CommercialAtlasWorkspace(props: CommercialWorkspaceProps) {
  return <Workspace key={(props.actorScope ?? '') + props.ownerId} {...props} />;
}
function Workspace({ page, ownerId, ownerName, actorScope, actorName, renderPipeline }: CommercialWorkspaceProps) {
  const params = useParams();
  const path = page.startsWith('/') ? page : '/' + page;
  const pageName = pages[path] ?? (path.startsWith('/client') ? 'company' : page);
  const storageKey = actorScope ? `cumulus.atlas.proposals.commercial.${actorScope}.${ownerId}` : null;
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try {
      if (!storageKey) return [];
      const rows: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string' && typeof r.title === 'string') : [];
    } catch { return []; }
  });
  const [draft, setDraft] = useState<DraftSeed>();
  const [revision, setRevision] = useState(0);
  const update = (updated: (rows: Draft[]) => Draft[]) => {
    setDrafts(rows => {
      const next = updated(rows);
      try { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(next)); queueMicrotask(() => window.dispatchEvent(new Event('cumulus:atlas-stage-drafts'))); } catch { /* storage may be unavailable */ }
      return next;
    });
  };
  const followup: Followup = row => setDraft({ kind: 'task', accountId: row.accountId, company: row.company, title: row.title, detail: row.detail, sourceRef: row.id });
  const draftOffer = (offer: Offer) => setDraft({ kind: 'opportunity', accountId: offer.accountId, company: offer.company, title: `${offer.product} — ${offer.company}`, detail: [offer.reason, offer.action].filter(Boolean).join('\n'), offer: offer.code });
  return <CommercialOwner.Provider value={ownerName}>{renderPipeline?.(setDraft)}
    {(!renderPipeline || draft) && <div className={`ca-root cs-root cs-page-${pageName} cr-root`}>
    {pageName === 'today' && <Today saveBatch={signals => update(rows => [...rows,...signals.filter(signal => !rows.some(row => row.kind === 'task' && row.sourceRef === signal.id)).map(signal => ({
      id: crypto.randomUUID(), kind: 'task' as const, accountId: signal.accountId, company: signal.company,
      title: signal.title, detail: signal.detail, sourceRef: signal.id, date: '', time: '',
    }))])} draft={draftOffer} owner={ownerId} ownerName={ownerName} actor={actorScope} actorName={actorName} followup={followup} />}
    {pageName === 'companies' && <CompanyDirectory owner={ownerId} />}
    {pageName === 'company' && <Company drafts={drafts} key={params.id ?? page} owner={ownerId} actorScope={actorScope ?? ''} accountId={params.id ?? page.split('/').slice(-1)[0] ?? ''} onEdit={setDraft} followup={followup} draftOffer={draftOffer} revision={revision} />}
    {pageName === 'journey' && <Planning owner={ownerId} onEdit={setDraft} drafts={drafts} revision={revision} />}
    {pageName === 'growth' && <Growth owner={ownerId} draft={draftOffer} followup={followup} newLead={() => setDraft({ kind: 'lead' })} />}
    {(pageName === 'intel' || pageName === 'intelligence') && <Intelligence owner={ownerId} followup={followup} />}
    {pageName === 'health' && <Credit owner={ownerId} followup={followup} />}
    {pageName === 'work' && <Workbench owner={ownerId} actorScope={actorScope} drafts={drafts} onEdit={setDraft} revision={revision} />}
    {!renderPipeline && pageName !== 'company' && pageName !== 'today' && <p className="ca-note">{ownerName}’s Commercial book · Salesforce and Data 360. Local proposals stay in this tab until submitted.</p>}
    {draft && <DraftForm seed={draft} owner={ownerId} close={() => setDraft(undefined)}
      save={value => { update(rows => [...rows.filter(r => r.id !== value.id), value]); setDraft(undefined); }}
      remove={id => update(rows => rows.filter(r => r.id !== id))}
      submitted={() => { setRevision(r => r + 1); setDraft(undefined); }} />}
  </div>}</CommercialOwner.Provider>;
}
