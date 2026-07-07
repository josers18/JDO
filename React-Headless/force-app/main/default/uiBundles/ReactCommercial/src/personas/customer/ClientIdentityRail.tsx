import { HealthRing, formatValue } from '@shared';
import type { Customer360 } from './customerTypes';

const DIM_COLORS = ['var(--wp-accent)', '#60a5fa', '#a78bfa', '#f59e0b'];

/**
 * Left identity rail for the Customer 360 — persistent client anchor: avatar,
 * name, segment, connectivity chips, the relationship-health ring with its
 * dimensions, the deposits/investments/lending money spine, and the unified
 * cross-org profile graph (Data Cloud identity resolution).
 */
export function ClientIdentityRail({ customer }: { customer: Customer360 }) {
  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      {/* identity header */}
      <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: '50%',
            background: 'var(--wp-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--wp-on-accent)',
            fontWeight: 800,
            fontSize: '1.2rem',
            boxShadow: '0 0 0 3px var(--wp-surface-raised), 0 0 18px var(--wp-accent)',
          }}
        >
          {customer.photoInitials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{customer.name}</div>
          <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.82rem' }}>
            {customer.location} · Since {customer.customerSince}
          </div>
          <span
            style={{
              display: 'inline-block',
              marginTop: '0.35rem',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--wp-accent)',
              background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-accent) 40%, transparent)',
              borderRadius: 999,
              padding: '0.12rem 0.6rem',
            }}
          >
            {customer.segment}
          </span>
        </div>
      </div>

      {/* connectivity chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {customer.statusChips.map(chip => (
          <span
            key={chip.label}
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: 6,
              color: chip.on ? 'var(--wp-pos)' : 'var(--wp-text-faint)',
              background: chip.on ? 'color-mix(in srgb, var(--wp-pos) 12%, transparent)' : 'transparent',
              border: `1px solid ${chip.on ? 'color-mix(in srgb, var(--wp-pos) 35%, transparent)' : 'var(--wp-border)'}`,
            }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      {/* health ring + dimensions */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <HealthRing
          score={customer.healthScore}
          label="Excellent"
          size={124}
          segments={customer.healthDimensions.map((d, i) => ({ value: d.score, color: DIM_COLORS[i % DIM_COLORS.length] }))}
        />
        <div style={{ flex: 1, display: 'grid', gap: '0.4rem' }}>
          {customer.healthDimensions.map((d, i) => (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: DIM_COLORS[i % DIM_COLORS.length] }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--wp-text-muted)' }}>{d.label}</span>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {d.score}
                <span style={{ color: d.trend === 'up' ? 'var(--wp-pos)' : d.trend === 'down' ? 'var(--wp-neg)' : 'var(--wp-text-faint)', marginLeft: 3 }}>
                  {d.trend === 'up' ? '▲' : d.trend === 'down' ? '▼' : '—'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* money spine */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {customer.money.map(m => (
          <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: '0.4rem', borderBottom: '1px solid var(--wp-border)' }}>
            <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>{m.label}</span>
            <span>
              <span style={{ fontWeight: 700 }}>{formatValue(m.amount, 'currency')}</span>
              <span style={{ marginLeft: 6, fontSize: '0.78rem', color: m.positive ? 'var(--wp-pos)' : 'var(--wp-neg)' }}>{m.deltaLabel}</span>
            </span>
          </div>
        ))}
      </div>

      {/* unified cross-org profile */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-text-muted)', marginBottom: '0.5rem' }}>
          Unified Profile · {customer.unifiedProfiles.length} orgs
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {customer.unifiedProfiles.map(p => (
            <span
              key={p.accountId}
              title={p.accountId}
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.2rem 0.55rem',
                borderRadius: 999,
                color: 'var(--wp-text)',
                background: 'var(--wp-surface-raised)',
                border: '1px solid var(--wp-border-strong)',
              }}
            >
              {p.sourceOrg}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
