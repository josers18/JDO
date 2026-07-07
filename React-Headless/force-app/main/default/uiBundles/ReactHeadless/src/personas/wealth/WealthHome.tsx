import { useState } from 'react';
import {
  useAsyncData,
  HeroPulseBar,
  KpiTile,
  GlassCard,
  Gauge,
  AttentionQueue,
  DataList,
  ProgressBar,
  AssistantDock,
  formatValue,
  type AttentionItem,
} from '@shared';
import { useMockAssistant } from '../mock/useMockAssistant';
import { fetchDeskKpis, fetchAttentionItems, fetchClient } from './wealthData';

/**
 * Wealth "Advisory Desk" cockpit — the advisor's morning landing page.
 * Signature elements: AUM + held-away capture, retirement-readiness gauge,
 * holdings with ESG scores, recent trades, and financial-plan progress.
 */
export default function WealthHome() {
  const [selectedId, setSelectedId] = useState<string | null>('001M');

  const kpis = useAsyncData(fetchDeskKpis, []);
  const attention = useAsyncData(fetchAttentionItems, []);
  const client = useAsyncData(() => fetchClient(selectedId), [selectedId]);
  const assistant = useMockAssistant('wealth');

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <HeroPulseBar
        name="Alex"
        dateLabel="Tuesday, July 2"
        summary="$342M AUM, $58M held-away in reach. Whitfield is drifting from policy; 7 plan reviews due this week."
        stats={[
          { label: 'AUM', value: '$342M' },
          { label: 'Held-Away', value: '$58M' },
          { label: 'Reviews', value: '7' },
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
          action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Drift · plans · held-away</span>}
        >
          {attention.loading ? (
            <Loading label="Scanning portfolios…" />
          ) : (
            <AttentionQueue items={attention.data ?? []} selectedId={selectedId} onSelect={(i: AttentionItem) => setSelectedId(i.id)} />
          )}
        </GlassCard>

        <GlassCard title="Client Advisory" index={1}>
          {client.loading ? (
            <Loading label="Loading client…" />
          ) : client.data ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{client.data.name}</div>
                  <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>
                    {client.data.segment} · {client.data.riskProfile}
                  </div>
                  <div style={{ display: 'flex', gap: '1.4rem', marginTop: '0.6rem' }}>
                    <Stat label="AUM" value={formatValue(client.data.aum, 'currencyCompact')} />
                    <Stat label="Held-Away" value={formatValue(client.data.heldAway, 'currencyCompact')} />
                  </div>
                </div>
                <Gauge value={client.data.retirementReadiness} caption="Retirement readiness" size={112} />
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--wp-text-faint)' }}>Select a client from the attention queue.</div>
          )}
        </GlassCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <GlassCard title="Holdings · ESG" index={0}>
          {client.loading ? <Loading /> : (
            <DataList
              rows={(client.data?.holdings ?? []).map(h => ({
                id: h.id,
                tag: h.symbol,
                tagColor: h.dayChangePct >= 0 ? 'var(--wp-pos)' : 'var(--wp-neg)',
                primary: h.name,
                secondary: `${h.assetClass} · ESG ${h.esgScore.toFixed(1)} · ${h.dayChangePct >= 0 ? '+' : ''}${h.dayChangePct}%`,
                trailing: formatValue(h.marketValue, 'currencyCompact'),
              }))}
            />
          )}
        </GlassCard>

        <GlassCard title="Recent Trades" index={1}>
          {client.loading ? <Loading /> : (
            <DataList
              rows={(client.data?.trades ?? []).map(t => ({
                id: t.id,
                tag: t.action,
                tagColor: t.action === 'BUY' ? 'var(--wp-pos)' : 'var(--wp-neg)',
                primary: `${t.symbol} · ${t.shares.toLocaleString()} sh`,
                secondary: t.when,
                trailing: formatValue(t.amount, 'currencyCompact'),
              }))}
            />
          )}
        </GlassCard>

        <GlassCard title="Financial Plans" index={2}>
          {client.loading ? <Loading /> : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {(client.data?.plans ?? []).map(p => (
                <ProgressBar
                  key={p.id}
                  label={p.name}
                  value={p.current / p.target}
                  caption={`${Math.round((p.current / p.target) * 100)}%`}
                />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <AssistantDock
        title="Cumulus Advisory Assistant"
        messages={assistant.messages}
        onSend={assistant.send}
        sending={assistant.sending}
        suggestions={['Model a Whitfield rebalance', 'Held-away capture plan for Park', 'Tax-loss harvest ideas']}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.88rem', padding: '0.5rem 0', animation: 'wp-pulse 1.2s ease infinite' }}>{label}</div>;
}
