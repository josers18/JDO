import { useState } from 'react';
import { useParams } from 'react-router';
import { useAsyncData, GlassCard, AgentforceChat } from '@shared';
import { fetchCustomer360, fetchCustomer360Detail } from './customerData';
import { fetchFull360 } from './full360Data';
import { ClientIdentityRail } from './ClientIdentityRail';
import { HighlightStrip } from './HighlightStrip';
import { ContextSidebar } from './ContextSidebar';
import { Full360Tabs, FULL_TABS, type FullTab } from './Full360Tabs';

/** Cumulus Assistant — the main Agentforce agent in jdo-1lrnov. */
const CUMULUS_AGENT_ID = '0Xxam000000tfCDCAY';

/**
 * Customer 360 command center (Aurora Glass) — three columns:
 *  · LEFT  identity rail (sticky)
 *  · CENTER AI headline + highlight strip + full §3b tabbed content
 *  · RIGHT contextual AI/ML sidebar (swaps per tab)
 * Embedded on the Account record page (/client/:id). Client-scoped Agentforce
 * FAB is mounted here, primed with the current client's name.
 */
export default function Customer360Page() {
  const { id } = useParams();
  const accountId = id ?? '001am00000qvjsAAAQ';
  const [tab, setTab] = useState<FullTab>('Overview');

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
      <GlassCard style={{ position: 'sticky', top: 16 }}>
        <ClientIdentityRail customer={c} />
      </GlassCard>

      {/* CENTER — headline + highlights + tabbed content */}
      <div style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {c.name}’s relationship is <span style={{ color: 'var(--wp-accent)' }}>{c.aiBriefHeadline.toLowerCase()}</span>.
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--wp-text-muted)', fontSize: '0.92rem' }}>
            AI confidence {c.confidencePct}% · next best action: {c.nextBestActions[0]?.title.toLowerCase()}.
          </p>
        </div>
        <HighlightStrip highlights={c.highlights} />

        {/* tab bar */}
        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', borderBottom: '1px solid var(--wp-border-strong)' }}>
          {FULL_TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '0.55rem 0.9rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: tab === t ? 800 : 500,
                color: tab === t ? 'var(--wp-accent)' : 'var(--wp-text-muted)',
                borderBottom: `2px solid ${tab === t ? 'var(--wp-accent)' : 'transparent'}`,
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {detail.data && full.data && <Full360Tabs tab={tab} full={full.data} customer={c} detail={detail.data} />}
      </div>

      {/* RIGHT — contextual AI/ML */}
      {full.data && <ContextSidebar data={full.data} tab={tab} />}

      {/* Client-scoped Agentforce FAB — primed with the current client's name. */}
      <AgentforceChat agentId={CUMULUS_AGENT_ID} agentLabel="Cumulus Assistant" contextLabel={c.name} />
    </div>
  );
}
