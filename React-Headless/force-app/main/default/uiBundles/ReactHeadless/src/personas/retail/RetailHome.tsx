import { useState } from 'react';
import {
  useAsyncData,
  HeroPulseBar,
  KpiTile,
  GlassCard,
  AttentionQueue,
  DataList,
  ProgressBar,
  AssistantDock,
  formatValue,
  type AttentionItem,
} from '@shared';
import { useMockAssistant } from '../mock/useMockAssistant';
import {
  fetchBookKpis,
  fetchAttentionItems,
  fetchClient,
  fetchActivity,
  fetchPipeline,
  fetchGoals,
} from './retailData';

/**
 * Retail "Daily Book" cockpit — the retail banker's morning landing page.
 * Data comes from swappable mock fetchers (retailData.ts) today; the component
 * tree is production-shaped and will not change when live data is wired.
 */
export default function RetailHome() {
  const [selectedId, setSelectedId] = useState<string | null>('001A');

  const kpis = useAsyncData(fetchBookKpis, []);
  const attention = useAsyncData(fetchAttentionItems, []);
  const client = useAsyncData(() => fetchClient(selectedId), [selectedId]);
  const activity = useAsyncData(fetchActivity, []);
  const pipeline = useAsyncData(fetchPipeline, []);
  const goals = useAsyncData(fetchGoals, []);
  const assistant = useMockAssistant('retail');

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <HeroPulseBar
        name="Jordan"
        dateLabel="Tuesday, July 2"
        summary="9 households need attention, 2 high-risk. $1.36M toward your $2M deposit goal. 5 activities scheduled today."
        stats={[
          { label: 'At-Risk', value: '9' },
          { label: 'Opps', value: '14' },
          { label: 'Today', value: '5' },
        ]}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        {(kpis.data ?? []).map((k, i) => (
          <KpiTile key={k.key} index={i} label={k.label} value={k.value} format={k.format} trend={k.trend} deltaPct={k.deltaPct} />
        ))}
      </div>

      {/* Main grid: attention (left) + client drill-in (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: '1.25rem' }}>
        <GlassCard
          title="Attention Today"
          index={0}
          action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Ranked by ML risk × value</span>}
        >
          {attention.loading ? (
            <Loading label="Ranking your book…" />
          ) : (
            <AttentionQueue items={attention.data ?? []} selectedId={selectedId} onSelect={(i: AttentionItem) => setSelectedId(i.id)} />
          )}
        </GlassCard>

        <GlassCard title="Client Drill-In" index={1}>
          {client.loading ? (
            <Loading label="Loading client…" />
          ) : client.data ? (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{client.data.name}</div>
                <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>
                  {client.data.segment} · {client.data.tenureYears} yr tenure
                  {client.data.lifeEvent ? ` · ${client.data.lifeEvent}` : ''}
                </div>
                <div style={{ color: 'var(--wp-text-faint)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  {[client.data.email, client.data.phone].filter(Boolean).join('  ·  ')}
                </div>
              </div>
              <DataList
                rows={client.data.accounts.map(a => ({
                  id: a.id,
                  tag: a.type.split(' ')[0],
                  primary: a.name,
                  trailing: formatValue(a.balance, 'currency'),
                }))}
              />
            </div>
          ) : (
            <div style={{ color: 'var(--wp-text-faint)' }}>Select a client from the attention queue.</div>
          )}
        </GlassCard>
      </div>

      {/* Lower grid: activity + pipeline + goals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <GlassCard title="Activity Stream" index={0}>
          {activity.loading ? <Loading /> : (
            <DataList
              rows={(activity.data ?? []).map(a => ({ id: a.id, tag: a.kind, primary: a.subject, trailing: a.when }))}
            />
          )}
        </GlassCard>

        <GlassCard title="Pipeline" index={1}>
          {pipeline.loading ? <Loading /> : (
            <DataList
              rows={(pipeline.data ?? []).map(o => ({
                id: o.id,
                tag: o.stage.slice(0, 4),
                primary: o.name,
                secondary: `Closes ${o.closeDate}`,
                trailing: formatValue(o.amount, 'currencyCompact'),
              }))}
            />
          )}
        </GlassCard>

        <GlassCard title="Goals" index={2}>
          {goals.loading ? <Loading /> : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {(goals.data ?? []).map(g => (
                <ProgressBar
                  key={g.id}
                  label={g.name}
                  value={g.current / g.target}
                  caption={`${Math.round((g.current / g.target) * 100)}%`}
                />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <AssistantDock
        title="Cumulus Retail Assistant"
        messages={assistant.messages}
        onSend={assistant.send}
        sending={assistant.sending}
        suggestions={['Summarize Ada Lovelace', 'Who is my highest churn risk?', 'Draft retention outreach']}
      />
    </div>
  );
}

function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.88rem', padding: '0.5rem 0', animation: 'wp-pulse 1.2s ease infinite' }}>{label}</div>;
}
