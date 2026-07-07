import { useNavigate } from 'react-router';
import {
  useAsyncData,
  GlassCard,
  KpiTile,
  ProgressBar,
  DataTable,
  formatValue,
  type TableColumn,
} from '@shared';
import { fetchHomeDashboard } from './homeData';
import type { CallItem, PipelineItem, ScheduleItem, AlertSignal, LeadReferral } from './homeTypes';

const SEV_COLOR = { high: 'var(--wp-neg)', medium: 'var(--wp-warn)', low: 'var(--wp-text-faint)' };
const TONE_COLOR = { positive: 'var(--wp-pos)', opportunity: 'var(--wp-accent)', risk: 'var(--wp-neg)', neutral: 'var(--wp-text-faint)' };
const KIND_ICON = { call: '📞', meeting: '🤝', task: '✓', event: '📅' };

/**
 * HOME app — the banker's morning landing page (replaces the standard SF home).
 * Horizon-level density: AI daily brief, who-to-call-and-why, book KPIs, life
 * events, pipeline, banker goals, schedule, alerts, leads. Banker-centric,
 * across the whole book. Clicking a client opens their embedded 360.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { data, loading } = useAsyncData(fetchHomeDashboard, []);

  if (loading || !data) {
    return <div style={{ color: 'var(--wp-text-muted)', padding: '2rem', animation: 'wp-pulse 1.2s ease infinite' }}>Loading your book…</div>;
  }
  const openClient = (id: string) => navigate(`/client/${id}`);

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {/* AI daily brief hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--wp-radius)',
          border: '1px solid var(--wp-border-strong)',
          background: 'var(--wp-gradient)',
          padding: '1.6rem 1.8rem',
          boxShadow: 'var(--wp-shadow)',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 140% at 100% 0%, rgba(255,255,255,0.18), transparent 45%)' }} />
        <div style={{ position: 'relative', maxWidth: 760 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
            {data.dateLabel} · AI Daily Brief
          </div>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.9rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            Good morning, {data.bankerName} — {data.aiBriefHeadline}.
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: 'rgba(255,255,255,0.92)', fontSize: '0.98rem', lineHeight: 1.5 }}>{data.aiBrief}</p>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
            AI confidence {data.confidencePct}% · {data.dataSourceCount} data sources
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {data.kpis.map((k, i) => (
          <KpiTile key={k.key} index={i} label={k.label} value={k.value} format={k.format} trend={k.trend} deltaPct={k.deltaPct} />
        ))}
      </div>

      {/* Main split: who to call (left, wide) + schedule/goals (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <GlassCard title="Who to call today — and why" action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>AI-ranked · click to open 360</span>}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.6rem' }}>
            {data.callList.map((c: CallItem, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openClient(c.clientId)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '0.85rem',
                    alignItems: 'center',
                    background: 'var(--wp-surface-glass)',
                    border: '1px solid var(--wp-border)',
                    borderRadius: 'var(--wp-radius-sm)',
                    padding: '0.85rem 1rem',
                    color: 'var(--wp-text)',
                    cursor: 'pointer',
                    animation: `wp-fade-up 0.4s ease ${i * 0.05}s both`,
                  }}
                >
                  <span style={{ width: 4, alignSelf: 'stretch', minHeight: 42, borderRadius: 999, background: SEV_COLOR[c.severity] }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>{c.clientName}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>{c.segment}</span>
                    </span>
                    <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.85rem', marginTop: '0.15rem' }}>{c.reason}</span>
                    <span style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.74rem', fontWeight: 700, color: 'var(--wp-accent)', background: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--wp-accent) 38%, transparent)', borderRadius: 999, padding: '0.15rem 0.65rem' }}>
                      → {c.action}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: 800, color: SEV_COLOR[c.severity], lineHeight: 1 }}>{Math.round(c.score * 100)}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--wp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.source}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <GlassCard title="Today's Schedule">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.15rem' }}>
              {data.schedule.map((s: ScheduleItem, i) => (
                <li key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '0.7rem', alignItems: 'center', padding: '0.5rem 0.25rem', borderTop: i === 0 ? 'none' : '1px solid var(--wp-border)' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--wp-text-muted)', width: 42 }}>{s.time}</span>
                  <span aria-hidden="true">{KIND_ICON[s.kind]}</span>
                  <span style={{ fontSize: '0.86rem' }}>{s.title}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard title="My Goals · Quota">
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {data.bankerGoals.map(g => (
                <ProgressBar key={g.id} label={g.name} value={g.current / g.target} caption={`${formatValue(g.current, g.format)} / ${formatValue(g.target, g.format)}`} />
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Life events across the book */}
      <GlassCard title="Life events across your book" action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Data Cloud signals → opportunities</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {data.lifeEvents.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => openClient(e.clientId)}
              style={{ textAlign: 'left', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'var(--wp-surface-glass)', border: '1px solid var(--wp-border)', borderRadius: 'var(--wp-radius-sm)', padding: '0.85rem', color: 'var(--wp-text)', cursor: 'pointer', animation: `wp-fade-up 0.4s ease ${i * 0.05}s both` }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>{e.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem' }}>{e.event}</span>
                <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.8rem' }}>{e.clientName} · {e.when}</span>
                <span style={{ display: 'block', color: 'var(--wp-accent)', fontSize: '0.78rem', marginTop: '0.3rem', fontWeight: 600 }}>→ {e.opportunity}</span>
              </span>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Pipeline + alerts + leads */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <GlassCard title="Pipeline">
          <DataTable
            columns={pipelineCols}
            rows={data.pipeline}
            getRowId={r => r.id}
            onRowClick={undefined}
          />
        </GlassCard>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <GlassCard title="Alerts & Signals">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
              {data.alerts.map((a: AlertSignal) => (
                <li key={a.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE_COLOR[a.tone], marginTop: 5, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{a.title}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--wp-text-faint)' }}>{a.when}</span>
                    </span>
                    <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.8rem' }}>{a.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard title="Leads & Referrals">
            <DataTable columns={leadCols} rows={data.leads} getRowId={(r: LeadReferral) => r.id} />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

const pipelineCols: TableColumn<PipelineItem>[] = [
  { key: 'clientName', header: 'Client' },
  { key: 'name', header: 'Opportunity' },
  { key: 'stage', header: 'Stage' },
  { key: 'amount', header: 'Amount', align: 'right', render: r => formatValue(r.amount, 'currencyCompact') },
  { key: 'propensity', header: 'Propensity', align: 'right', render: r => `${Math.round(r.propensity * 100)}%` },
  { key: 'closeDate', header: 'Close', align: 'right' },
];

const leadCols: TableColumn<LeadReferral>[] = [
  { key: 'name', header: 'Name' },
  { key: 'source', header: 'Source' },
  { key: 'status', header: 'Status' },
  { key: 'value', header: 'Value', align: 'right', render: r => formatValue(r.value, 'currencyCompact') },
];
