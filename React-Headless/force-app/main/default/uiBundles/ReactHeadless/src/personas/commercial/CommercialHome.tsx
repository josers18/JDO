import { useState } from 'react';
import {
  useAsyncData,
  HeroPulseBar,
  KpiTile,
  GlassCard,
  Gauge,
  AttentionQueue,
  DataList,
  AssistantDock,
  formatValue,
  type AttentionItem,
} from '@shared';
import { useMockAssistant } from '../mock/useMockAssistant';
import { RelationshipTree } from './RelationshipTree';
import { fetchPortfolioKpis, fetchAttentionItems, fetchAccount, fetchPipeline } from './commercialData';

/**
 * Commercial "Relationship Command" cockpit — the RM's morning landing page.
 * Signature elements: credit/covenant attention model, a PAYDEX gauge, the
 * corporate relationship tree, and firmographics/SEC enrichment.
 */
export default function CommercialHome() {
  const [selectedId, setSelectedId] = useState<string | null>('001X');

  const kpis = useAsyncData(fetchPortfolioKpis, []);
  const attention = useAsyncData(fetchAttentionItems, []);
  const account = useAsyncData(() => fetchAccount(selectedId), [selectedId]);
  const pipeline = useAsyncData(fetchPipeline, []);
  const assistant = useMockAssistant('commercial');

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <HeroPulseBar
        name="Morgan"
        dateLabel="Tuesday, July 2"
        summary="4 accounts on covenant watch, 2 credit-risk escalations. $61.5M in active pipeline across 42 relationships."
        stats={[
          { label: 'Watch', value: '4' },
          { label: 'Exposure', value: '$284M' },
          { label: 'Pipeline', value: '$61.5M' },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        {(kpis.data ?? []).map((k, i) => (
          <KpiTile key={k.key} index={i} label={k.label} value={k.value} format={k.format} trend={k.trend} deltaPct={k.deltaPct} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: '1.25rem' }}>
        <GlassCard
          title="Attention Today"
          index={0}
          action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Credit · covenant · opportunity</span>}
        >
          {attention.loading ? (
            <Loading label="Ranking your portfolio…" />
          ) : (
            <AttentionQueue items={attention.data ?? []} selectedId={selectedId} onSelect={(i: AttentionItem) => setSelectedId(i.id)} />
          )}
        </GlassCard>

        <GlassCard title="Account Command" index={1}>
          {account.loading ? (
            <Loading label="Loading account…" />
          ) : account.data ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{account.data.name}</div>
                  <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>
                    {account.data.industry} · {formatValue(account.data.annualRevenue, 'currencyCompact')} rev · {account.data.employees.toLocaleString()} emp
                  </div>
                  <div style={{ color: 'var(--wp-text-faint)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    {account.data.creditRating} · {account.data.secLastFiling} · {account.data.website}
                  </div>
                </div>
                <Gauge
                  value={account.data.paydex / 100}
                  label={String(account.data.paydex)}
                  caption="PAYDEX"
                  size={104}
                  color={account.data.paydex < 60 ? 'var(--wp-neg)' : 'var(--wp-accent)'}
                />
              </div>
              <DataList
                rows={account.data.accounts.map(a => ({
                  id: a.id,
                  tag: a.type.split(' ')[0],
                  primary: a.name,
                  trailing: formatValue(a.balance, 'currencyCompact'),
                }))}
              />
            </div>
          ) : (
            <div style={{ color: 'var(--wp-text-faint)' }}>Select an account from the attention queue.</div>
          )}
        </GlassCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <GlassCard title="Corporate Relationships" index={0}>
          {account.loading ? <Loading /> : <RelationshipTree nodes={account.data?.relationships ?? []} />}
        </GlassCard>

        <GlassCard title="Key Executives" index={1}>
          {account.loading ? <Loading /> : (
            <DataList
              rows={(account.data?.execs ?? []).map((e, i) => ({ id: `e${i}`, primary: e.name, secondary: e.title }))}
              emptyLabel="No exec intel"
            />
          )}
        </GlassCard>

        <GlassCard title="Pipeline" index={2}>
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
      </div>

      <AssistantDock
        title="Cumulus Commercial Assistant"
        messages={assistant.messages}
        onSend={assistant.send}
        sending={assistant.sending}
        suggestions={['Why is Acme flagged?', 'Northwind covenant status', 'Draft expansion pitch']}
      />
    </div>
  );
}

function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.88rem', padding: '0.5rem 0', animation: 'wp-pulse 1.2s ease infinite' }}>{label}</div>;
}
