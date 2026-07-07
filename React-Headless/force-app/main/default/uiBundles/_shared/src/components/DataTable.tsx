import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  /** cell renderer; defaults to String(row[key]) */
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyLabel?: string;
}

/**
 * Themed data table — proper column headers, zebra-free hairline rows, hover,
 * optional row click. For holdings, trades, opportunities, referrals, etc.
 */
export function DataTable<T>({ columns, rows, getRowId, onRowClick, emptyLabel = 'No records' }: DataTableProps<T>) {
  if (!rows.length) {
    return <div style={{ color: 'var(--wp-text-faint)', fontSize: '0.86rem', padding: '0.6rem 0' }}>{emptyLabel}</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  padding: '0.5rem 0.65rem',
                  color: 'var(--wp-text-muted)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--wp-border-strong)',
                  width: c.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--wp-surface-raised)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(c => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? 'left',
                    padding: '0.55rem 0.65rem',
                    color: 'var(--wp-text)',
                    borderBottom: '1px solid var(--wp-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
