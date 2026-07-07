import type { ReactNode } from 'react';

export interface DataListRow {
  id: string;
  /** left icon/tag text, e.g. "TASK", "▲", stage name */
  tag?: string;
  tagColor?: string;
  primary: string;
  secondary?: string;
  /** right-aligned value, e.g. formatted currency or a date */
  trailing?: ReactNode;
}

interface DataListProps {
  rows: DataListRow[];
  emptyLabel?: string;
}

/**
 * Compact, themed list — the shared substrate for activity streams, pipelines,
 * holdings, trades, exec lists, relationship nodes. One row = tag · primary ·
 * secondary · trailing.
 */
export function DataList({ rows, emptyLabel = 'Nothing to show' }: DataListProps) {
  if (!rows.length) {
    return <div style={{ color: 'var(--wp-text-faint)', fontSize: '0.86rem', padding: '0.4rem 0' }}>{emptyLabel}</div>;
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.15rem' }}>
      {rows.map((row, i) => (
        <li
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: row.tag ? 'auto 1fr auto' : '1fr auto',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.55rem 0.35rem',
            borderTop: i === 0 ? 'none' : '1px solid var(--wp-border)',
            fontSize: '0.9rem',
          }}
        >
          {row.tag && (
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: row.tagColor ?? 'var(--wp-accent)',
                minWidth: 52,
              }}
            >
              {row.tag}
            </span>
          )}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: 'var(--wp-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.primary}
            </span>
            {row.secondary && (
              <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.78rem' }}>{row.secondary}</span>
            )}
          </span>
          {row.trailing != null && (
            <span style={{ color: 'var(--wp-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.trailing}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
