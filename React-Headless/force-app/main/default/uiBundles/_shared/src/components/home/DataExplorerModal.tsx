import { useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import { Icon } from '../iconMap';

/** A column in the explorer table. `render` returns the cell content for a row. */
export interface ExplorerColumn<T> {
  key: string;
  label: string;
  /** Cell renderer. */
  render: (row: T) => ReactNode;
  /** Right-align (numbers/amounts). */
  align?: 'left' | 'right';
  /** Tailwind width hint, e.g. 'w-[120px]'. */
  className?: string;
  /** Hide below the given container width (keeps narrow modals readable). */
  hideBelow?: 'sm' | 'md';
}

/** A filter chip. `test` decides whether a row belongs to this filter. */
export interface ExplorerFilter<T> {
  key: string;
  label: string;
  /** Undefined `test` means "All" (matches everything). */
  test?: (row: T) => boolean;
}

/**
 * A large drill-in data explorer, launched from a supporting-band "View all →".
 * Header title + live search + filter chips; a full sortable-feeling table with
 * per-row hover and click-through. The parent supplies the rows, the columns,
 * how to derive searchable text, and what happens when a row is clicked (which
 * typically opens a DetailModal or the Client-360 panel).
 *
 * Generic over the row type so every band module (activity, pipeline movement,
 * at-risk clients, agenda, opportunities) reuses one component. Renders nothing
 * when `open` is false.
 */
export function DataExplorerModal<T>({
  open,
  onClose,
  title,
  subtitle,
  icon,
  tone = 'accent',
  rows,
  columns,
  filters,
  searchText,
  searchPlaceholder = 'Search…',
  onRowClick,
  rowKey,
  footNote,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: 'ai' | 'accent';
  rows: T[];
  columns: ExplorerColumn<T>[];
  filters?: ExplorerFilter<T>[];
  /** Concatenated searchable text for a row (lower-cased match). */
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  rowKey: (row: T, index: number) => string;
  /** Optional line shown bottom-left (e.g. "Source: Data Cloud"). */
  footNote?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(filters?.[0]?.key ?? 'all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = filters?.find(f => f.key === activeFilter);
    return rows.filter(r => {
      if (filter?.test && !filter.test(r)) return false;
      if (q && !searchText(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, activeFilter, filters, searchText]);

  if (!open) return null;

  const hideClass = (c: ExplorerColumn<T>) =>
    c.hideBelow === 'sm' ? 'hidden @[560px]/explorer:table-cell' : c.hideBelow === 'md' ? 'hidden @[720px]/explorer:table-cell' : '';

  return (
    <Modal open onClose={onClose} tone={tone} icon={icon} title={title} subtitle={subtitle} size="xl">
      <div className="@container/explorer">
        {/* Search + filter chips */}
        <div className="mb-4 flex flex-col gap-3 @[560px]/explorer:flex-row @[560px]/explorer:items-center">
          <label className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
              <Icon name="search" size={15} />
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-[11px] border border-line bg-bg py-2.5 pl-9 pr-3 text-[13.5px] text-fg outline-none focus:border-accent-border"
            />
          </label>
          {filters && filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.map(f => {
                const on = f.key === activeFilter;
                const count = f.test ? rows.filter(f.test).length : rows.length;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFilter(f.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition ${
                      on ? 'bg-accent text-white' : 'border border-line text-muted hover:border-accent-border hover:text-fg'
                    }`}
                  >
                    {f.label}
                    <span className={on ? 'text-white/80' : 'text-faint'}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[12px] border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-muted">
                {columns.map(c => (
                  <th
                    key={c.key}
                    className={`px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''} ${hideClass(c)}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-line last:border-b-0 transition ${onRowClick ? 'cursor-pointer hover:bg-surface-muted' : ''}`}
                >
                  {columns.map(c => (
                    <td
                      key={c.key}
                      className={`px-3.5 py-3 text-[12.5px] text-fg align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''} ${hideClass(c)}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3.5 py-10 text-center text-[13px] text-faint">
                    No matches{query ? ` for “${query}”` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
          <span>{footNote}</span>
          <span>{visible.length} of {rows.length}</span>
        </div>
      </div>
    </Modal>
  );
}
