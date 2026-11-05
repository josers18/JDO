import { useAsyncData } from '../../hooks/useAsyncData';
import { useToast } from '../Toast';
import { fetchEffectiveUser, getViewAs, useViewAs } from '../../data/viewAs';
import { createWhitespaceOpportunity, fetchWhitespace, type WhitespacePersona } from '../../data/whitespace';
import { CrossSellWhitespace, type WhitespaceAct } from './CrossSellWhitespace';

/**
 * The white-space grid wired to live data for one cockpit: loads the signed-in
 * (or viewed-as) banker's book via `fetchWhitespace`, and turns "make it
 * happen" into a real Opportunity in Salesforce. Reloads the matrix after each
 * write so the pipeline stats in the header stay true.
 */
export function CrossSellWhitespaceLive({ persona }: { persona: WhitespacePersona }) {
  const viewAs = useViewAs();
  const { toast } = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => fetchEffectiveUser().then(u => fetchWhitespace(persona, u?.userId)),
    [persona, viewAs?.userId],
  );

  const onAct = async (r: WhitespaceAct) => {
    try {
      await createWhitespaceOpportunity(r, getViewAs()?.userId);
      toast('Opportunity created', `${r.productLabel} · ${r.clientName}`);
      refetch();
      return true;
    } catch (e) {
      toast('Could not create the opportunity', e instanceof Error ? e.message : 'CRM write failed');
      return false;
    }
  };

  if (error && !data) {
    return (
      <div className="rounded-[22px] border border-line bg-surface-glass px-6 py-8 text-center text-[13px] text-muted shadow-card">
        The white-space grid couldn&apos;t load: {error}
        <button type="button" onClick={refetch} className="ml-3 font-medium text-accent underline-offset-2 hover:underline">
          Retry
        </button>
      </div>
    );
  }
  return <CrossSellWhitespace data={data} loading={loading} onAct={onAct} />;
}
