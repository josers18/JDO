import { useState } from 'react';
import { useParams } from 'react-router';
import clsx from 'clsx';
import { useAsyncData, Panel, Eyebrow, AgentforceChat, SkeletonCard } from '@shared';
import { fetchCustomer360, fetchCustomer360Detail } from './customerData';
import { fetchFull360 } from './full360Data';
import { ClientIdentityRail } from './ClientIdentityRail';
import { HighlightStrip } from './HighlightStrip';
import { ContextSidebar } from './ContextSidebar';
import { Full360Tabs, TAB_GROUPS, type FullTab } from './Full360Tabs';

/** Cumulus Assistant — the main Agentforce agent in jdo-1lrnov. */
const CUMULUS_AGENT_ID = '0Xxam000000tfCDCAY';

/**
 * Customer 360 command center (Aurora Glass) — three columns:
 *  · LEFT  identity rail (sticky)
 *  · CENTER AI headline + highlight strip + full §3b tabbed content
 *  · RIGHT contextual AI/ML sidebar (swaps per tab)
 * Embedded on the Account record page (/client/:id).
 *
 * The pink Agentforce FAB is mounted here too, primed with the current
 * client's name so it opens scoped to whoever is on screen (the ACC embed
 * has no silent context API — priming the label/placeholder is the honest
 * record-aware treatment). Re-mounts per client via the `contextLabel` key.
 */
export default function Customer360Page() {
  const { id } = useParams();
  const accountId = id ?? '001am00000qvjsAAAQ';
  const [tab, setTab] = useState<FullTab>('Overview');
  // The active leaf's owning group drives the primary strip's highlight; its
  // sibling leaves populate the secondary segmented row (shown only when >1).
  const activeGroup = TAB_GROUPS.find(g => g.tabs.includes(tab)) ?? TAB_GROUPS[0];
  const selectGroup = (g: (typeof TAB_GROUPS)[number]) => setTab(g.tabs[0]);

  const customer = useAsyncData(() => fetchCustomer360(accountId), [accountId]);
  const detail = useAsyncData(() => fetchCustomer360Detail(accountId), [accountId]);
  const full = useAsyncData(() => fetchFull360(accountId), [accountId]);

  if (customer.loading || !customer.data) {
    return <div style={{ color: 'var(--wp-text-muted)', padding: '2rem', animation: 'wp-pulse 1.2s ease infinite' }}>Loading customer 360…</div>;
  }
  const c = customer.data;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) minmax(0, 1fr) minmax(300px, 350px)', gap: '1.25rem', alignItems: 'start' }}>
      {/* LEFT — identity */}
      <Panel className="sticky top-4">
        <ClientIdentityRail customer={c} />
      </Panel>

      {/* CENTER — headline + highlights + tabbed content */}
      <div style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
        <div>
          <Eyebrow>Relationship status</Eyebrow>
          <h1 className="mt-1.5 font-display text-[1.55rem] font-semibold leading-tight tracking-tight">
            {c.name}’s relationship is <span className="text-accent">{c.aiBriefHeadline.toLowerCase()}</span>.
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--wp-text-muted)', fontSize: '0.92rem' }}>
            AI confidence {c.confidencePct}% · next best action: {c.nextBestActions[0]?.title.toLowerCase()}.
          </p>
        </div>
        <HighlightStrip highlights={c.highlights} />

        {/* PRIMARY nav — 5 grouped tabs (underline-active) */}
        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', borderBottom: '1px solid var(--wp-border-strong)' }}>
          {TAB_GROUPS.map(g => (
            <button
              key={g.label}
              type="button"
              onClick={() => selectGroup(g)}
              className={clsx(
                '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[0.88rem] font-medium',
                g === activeGroup ? 'border-accent font-bold text-accent' : 'border-transparent text-muted',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* SECONDARY nav — leaves within the active group (only when >1) */}
        {activeGroup.tabs.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {activeGroup.tabs.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  'whitespace-nowrap rounded-full px-3 py-1 text-[0.8rem] font-semibold transition-colors',
                  tab === t
                    ? 'bg-accent text-[color:var(--wp-on-accent)]'
                    : 'bg-[color:var(--wp-surface-raised)] text-muted hover:text-fg',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {detail.data && full.data
          ? <Full360Tabs tab={tab} full={full.data} customer={c} detail={detail.data} />
          : (
            <div style={{ display: 'grid', gap: '1rem' }} aria-busy="true" aria-label="Loading customer detail">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>
                <SkeletonCard lines={4} />
                <SkeletonCard lines={4} />
              </div>
              <SkeletonCard lines={3} />
            </div>
          )}
      </div>

      {/* RIGHT — contextual AI/ML */}
      {full.data
        ? <ContextSidebar data={full.data} tab={tab} accountId={accountId} />
        : (
          <div style={{ display: 'grid', gap: '1rem', position: 'sticky', top: 16 }} aria-busy="true">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </div>
        )}

      {/* Client-scoped Agentforce FAB — primed with the current client's name. */}
      <AgentforceChat agentId={CUMULUS_AGENT_ID} agentLabel="Cumulus Assistant" contextLabel={c.name} />
    </div>
  );
}
