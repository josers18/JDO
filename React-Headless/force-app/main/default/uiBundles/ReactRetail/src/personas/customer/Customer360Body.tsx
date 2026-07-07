import { useState } from 'react';
import {
  GlassCard,
  DataTable,
  ProgressBar,
  DonutChart,
  AreaChart,
  BarChart,
  Sankey,
  RelationshipMap,
  Timeline,
  PredictionCard,
  formatValue,
  type TableColumn,
} from '@shared';
import { JourneyGoals } from './JourneyGoals';
import type { Customer360, Customer360Detail, HoldingRow, OpportunityRow } from './customerTypes';

const TABS = ['Overview', 'Journey', 'Money', 'Engagement', 'Planning', 'Risk', 'Network'] as const;
type Tab = (typeof TABS)[number];

const PRED_COLOR = { positive: 'var(--wp-pos)', opportunity: 'var(--wp-accent)', risk: 'var(--wp-neg)', neutral: 'var(--wp-text-faint)' };

/**
 * The tabbed center body of the Customer 360 — every tab fuses AI, charts,
 * tables and predictions for one seamless intelligence view.
 */
export function Customer360Body({ customer, detail }: { customer: Customer360; detail: Customer360Detail }) {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--wp-border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '0.6rem 1rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '0.9rem',
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

      {tab === 'Overview' && <OverviewTab customer={customer} detail={detail} />}
      {tab === 'Journey' && (
        <GlassCard title="Journey & Goals">
          <JourneyGoals journey={detail.journey} goals={detail.goalRings} />
        </GlassCard>
      )}
      {tab === 'Money' && <MoneyTab detail={detail} />}
      {tab === 'Engagement' && <EngagementTab detail={detail} />}
      {tab === 'Planning' && <PlanningTab detail={detail} />}
      {tab === 'Risk' && <RiskTab detail={detail} />}
      {tab === 'Network' && <NetworkTab customer={customer} detail={detail} />}
    </div>
  );
}

const currency = (n: number) => formatValue(n, 'currency');

function OverviewTab({ customer, detail }: { customer: Customer360; detail: Customer360Detail }) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <GlassCard title="Relationship Map">
          <RelationshipMap centerLabel={customer.photoInitials} nodes={detail.network} width={480} height={280} />
        </GlassCard>
        <GlassCard title="Relationship Timeline">
          <Timeline events={detail.timeline} />
        </GlassCard>
      </div>
      <GlassCard title="Assets & Trend">
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <DonutChart
            slices={detail.productMix}
            centerValue={formatValue(customer.money.reduce((s, m) => s + Math.abs(m.amount), 0), 'currencyCompact')}
            centerLabel="Total"
          />
          <div style={{ flex: 1, minWidth: 280 }}>
            <AreaChart series={detail.aumTrend} startLabel="Jan" endLabel="Today" width={480} />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function MoneyTab({ detail }: { detail: Customer360Detail }) {
  const cols: TableColumn<HoldingRow>[] = [
    { key: 'name', header: 'Account' },
    { key: 'category', header: 'Type' },
    { key: 'balance', header: 'Balance', align: 'right', render: r => currency(r.balance) },
    {
      key: 'changePct',
      header: 'Change',
      align: 'right',
      render: r => <span style={{ color: r.changePct >= 0 ? 'var(--wp-pos)' : 'var(--wp-neg)' }}>{r.changePct >= 0 ? '+' : ''}{r.changePct}%</span>,
    },
  ];
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard title="Cash Flow (90 days)">
        <Sankey inflows={detail.cashFlowIn} outflows={detail.cashFlowOut} centerLabel="Net" width={560} height={260} />
      </GlassCard>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '1rem' }}>
        <GlassCard title="Product Mix">
          <DonutChart slices={detail.productMix} legend />
        </GlassCard>
        <GlassCard title="Holdings">
          <DataTable columns={cols} rows={detail.holdings} getRowId={r => r.id} />
        </GlassCard>
      </div>
    </div>
  );
}

const INTENT_COLOR = { high: 'var(--wp-pos)', medium: 'var(--wp-warn)', low: 'var(--wp-text-faint)' };

function EngagementTab({ detail }: { detail: Customer360Detail }) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <GlassCard title="Interactions (by month)">
          <BarChart data={detail.interactions} width={360} height={160} />
        </GlassCard>
        <GlassCard title="Activity Timeline">
          <Timeline events={detail.timeline} />
        </GlassCard>
      </div>
      <GlassCard title="Web & Behavioral Signals" action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Data Cloud · real-time</span>}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.15rem' }}>
          {detail.webEngagements.map((w, i) => (
            <li key={w.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.7rem', alignItems: 'center', padding: '0.5rem 0.25rem', borderTop: i === 0 ? 'none' : '1px solid var(--wp-border)', fontSize: '0.88rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: INTENT_COLOR[w.intent] }} />
              <span>{w.action}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-muted)', border: '1px solid var(--wp-border)', borderRadius: 999, padding: '0.05rem 0.5rem' }}>{w.channel}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--wp-text-faint)', whiteSpace: 'nowrap' }}>{w.when}</span>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

function PlanningTab({ detail }: { detail: Customer360Detail }) {
  const cols: TableColumn<OpportunityRow>[] = [
    { key: 'name', header: 'Opportunity' },
    { key: 'stage', header: 'Stage' },
    { key: 'amount', header: 'Amount', align: 'right', render: r => currency(r.amount) },
    { key: 'closeDate', header: 'Close', align: 'right' },
  ];
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard title="Open Opportunities">
        <DataTable columns={cols} rows={detail.opportunities} getRowId={r => r.id} />
      </GlassCard>
      <GlassCard title="Financial Goals">
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {detail.goals.map(g => (
            <ProgressBar key={g.id} label={g.name} value={g.current / g.target} caption={`${currency(g.current)} / ${currency(g.target)}`} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function RiskTab({ detail }: { detail: Customer360Detail }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
      {detail.predictions.map(p => (
        <GlassCard key={p.id} title={p.title}>
          <PredictionCard
            title={p.title}
            score={p.score}
            scoreLabel={p.scoreLabel}
            outcome={p.outcome}
            drivers={p.drivers}
            color={PRED_COLOR[p.tone]}
          />
        </GlassCard>
      ))}
    </div>
  );
}

function NetworkTab({ customer, detail }: { customer: Customer360; detail: Customer360Detail }) {
  return (
    <GlassCard title="Relationship Network">
      <RelationshipMap centerLabel={customer.photoInitials} nodes={detail.network} width={720} height={360} />
    </GlassCard>
  );
}
