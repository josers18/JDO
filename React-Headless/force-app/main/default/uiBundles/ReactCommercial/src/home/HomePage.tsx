import { useNavigate } from 'react-router';
import {
  useAsyncData,
  HeroBand,
  StatTile,
  Panel,
  Meter,
  EntityRow,
  ScoreRing,
  Icon,
  DataTable,
  formatValue,
  type IconKey,
  type RingTone,
  type TableColumn,
} from '@shared';
import { fetchHomeDashboard } from './homeData';
import type { CallItem, PipelineItem, ScheduleItem, AlertSignal, LeadReferral } from './homeTypes';

const TONE_COLOR = { positive: 'var(--wp-pos)', opportunity: 'var(--wp-accent)', risk: 'var(--wp-neg)', neutral: 'var(--wp-text-faint)' };

/** Maps a `ScheduleItem.kind` to the matching lucide IconKey for the timeline rail. */
const SCHEDULE_ICON: Record<ScheduleItem['kind'], IconKey> = {
  call: 'call', meeting: 'meeting', task: 'task', event: 'event',
};

/** Maps a `CallItem.severity` to the ScoreRing tone. */
const SEVERITY_TONE: Record<CallItem['severity'], RingTone> = {
  high: 'risk', medium: 'warn', low: 'accent',
};

/** Maps the (legacy) life-event emoji to a lucide IconKey. */
const LIFE_EVENT_ICON: Record<string, IconKey> = {
  '🤝': 'meeting',
  '📈': 'jobChange',
  '👔': 'jobChange',
  '🏗️': 'homePurchase',
};
function lifeEventIcon(icon: string): IconKey {
  return LIFE_EVENT_ICON[icon] ?? 'sparkle';
}

/** Up to 2 uppercase initials from a display name (e.g. "Acme Manufacturing" -> "AM"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * HOME app — the RM's morning landing page (replaces the standard SF home).
 * Horizon-level density: AI daily brief, who-to-call-and-why, book KPIs,
 * relationship signals, pipeline, RM goals, schedule, alerts, leads, and a
 * book-level delinquency watch. RM-centric, across the whole portfolio.
 * Clicking a client opens their embedded 360.
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
      <HeroBand
        eyebrow={`${data.dateLabel} · AI Daily Brief`}
        title={`Good morning, ${data.bankerName} — ${data.aiBriefHeadline}.`}
        body={data.aiBrief}
        meta={`AI confidence ${data.confidencePct}% · ${data.dataSourceCount} data sources`}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {data.kpis.map((k, i) => (
          <StatTile
            key={k.key}
            index={i}
            label={k.label}
            value={k.value}
            format={k.format}
            trend={k.trend}
            deltaPct={k.deltaPct}
            tone={k.key === 'atRisk' ? 'risk' : 'accent'}
          />
        ))}
      </div>

      {/* Main split: who to call (left, wide) + schedule/goals (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <Panel title="Who to call today — and why" hint="AI-ranked · click to open 360">
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {data.callList.map((c: CallItem, i) => (
              <EntityRow
                key={c.id}
                index={i}
                avatar={initials(c.clientName)}
                title={c.clientName}
                badge={c.segment}
                reason={c.reason}
                action={c.action}
                onClick={() => openClient(c.clientId)}
                right={<ScoreRing value={Math.round(c.score * 100)} tone={SEVERITY_TONE[c.severity]} caption={c.source} />}
              />
            ))}
          </div>
        </Panel>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <Panel title="Today's Schedule">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.15rem' }}>
              {data.schedule.map((s: ScheduleItem, i) => (
                <li key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '0.7rem', alignItems: 'center', padding: '0.5rem 0.25rem', borderTop: i === 0 ? 'none' : '1px solid var(--wp-border)' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--wp-text-muted)', width: 42 }}>{s.time}</span>
                  <Icon name={SCHEDULE_ICON[s.kind]} size={16} />
                  <span style={{ fontSize: '0.86rem' }}>{s.title}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="My Goals · Quota">
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {data.bankerGoals.map(g => (
                <Meter key={g.id} label={g.name} value={g.current / g.target} caption={`${formatValue(g.current, g.format)} / ${formatValue(g.target, g.format)}`} />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Relationship signals across the book */}
      <Panel title="Relationship signals across your book" hint="Data Cloud signals → opportunities">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {data.lifeEvents.map((e, i) => (
            <EntityRow
              key={e.id}
              index={i}
              iconName={lifeEventIcon(e.icon)}
              title={e.event}
              badge={e.when}
              reason={e.clientName}
              action={e.opportunity}
              onClick={() => openClient(e.clientId)}
            />
          ))}
        </div>
      </Panel>

      {/* Loan delinquency watch (book-level aggregate) */}
      {data.delinquency && (
        <Panel title="Delinquency Watch" hint="Book-level · loan portfolio">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delinquent Balance</div>
              <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--wp-neg)' }}>{formatValue(data.delinquency.totalDelinquentBalance, 'currencyCompact')}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--wp-text-muted)', marginTop: 2 }}>{formatValue(data.delinquency.totalRecovered, 'currencyCompact')} recovered</div>
            </div>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              {data.delinquency.byStatus.map(b => (
                <div key={b.status} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--wp-text-muted)' }}>{b.status}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{b.count} loans</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, textAlign: 'right' }}>{formatValue(b.balance, 'currencyCompact')}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* Pipeline + alerts + leads */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <Panel title="Pipeline">
          <DataTable
            columns={pipelineCols}
            rows={data.pipeline}
            getRowId={r => r.id}
            onRowClick={undefined}
          />
        </Panel>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <Panel title="Alerts & Signals">
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
          </Panel>

          <Panel title="Leads & Referrals">
            <DataTable columns={leadCols} rows={data.leads} getRowId={(r: LeadReferral) => r.id} />
          </Panel>
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
