import { useNavigate } from 'react-router';
import { useAsyncData, GlassCard, KpiTile, AttentionQueue, formatValue, type AttentionItem } from '@shared';
import { fetchBookClients } from './customerData';
import type { BookClient } from './customerTypes';

/**
 * Book landing — the banker's morning view across ALL clients: book KPIs + an
 * ML-ranked priority queue. Clicking a client drills into their Customer 360.
 */
export default function BookLanding() {
  const navigate = useNavigate();
  const clients = useAsyncData(fetchBookClients, []);

  const items: AttentionItem[] = (clients.data ?? []).map(c => ({
    id: c.id,
    title: `${c.name} — ${c.headline}`,
    clientName: c.name,
    reason: c.reason,
    score: c.score,
    severity: c.severity,
    action: `${formatValue(c.relationshipValue, 'currencyCompact')} relationship`,
  }));

  const totalValue = (clients.data ?? []).reduce((s, c) => s + c.relationshipValue, 0);
  const highRisk = (clients.data ?? []).filter(c => c.severity === 'high').length;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Good morning, Alex</h1>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--wp-text-muted)' }}>
          {highRisk} clients need attention today across your book. Ranked by AI priority.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        <KpiTile index={0} label="Book Value" value={totalValue} format="currencyCompact" trend={[18, 20, 19, 22, 24, 26, 28]} deltaPct={0.084} />
        <KpiTile index={1} label="Households" value={clients.data?.length ?? 0} format="number" trend={[3, 4, 4, 5, 5, 6, 6]} />
        <KpiTile index={2} label="Needs Attention" value={highRisk} format="number" deltaPct={0.12} trend={[2, 2, 3, 2, 3, 2, 2]} />
        <KpiTile index={3} label="Avg AI Confidence" value={0.87} format="percent" trend={[80, 82, 84, 83, 85, 86, 87]} />
      </div>

      <GlassCard
        title="Today’s Priorities"
        action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Click a client to open their 360</span>}
      >
        {clients.loading ? (
          <div style={{ color: 'var(--wp-text-muted)', animation: 'wp-pulse 1.2s ease infinite' }}>Ranking your book…</div>
        ) : (
          <AttentionQueue items={items} onSelect={(i: AttentionItem) => navigate(`/client/${i.id}`)} />
        )}
      </GlassCard>
    </div>
  );
}

export type { BookClient };
