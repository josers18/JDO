import { useAsyncData } from '../../hooks/useAsyncData';
import { fetchBankers, setViewAs, useViewAs } from '../../data/viewAs';
import { Icon } from '../iconMap';

const compact = (n?: number) =>
  n ? n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 }) : '';

/**
 * Cockpit-header "View as" picker — previews the home page as another banker
 * (their Data Cloud book + their CRM records). Session-scoped; "My book" clears
 * it. A native <select> keeps it keyboard / screen-reader friendly; the pill
 * turns accent while an override is active so a preview is never mistaken for
 * your own book.
 */
export function ViewAsPicker() {
  const viewAs = useViewAs();
  const { data: bankers } = useAsyncData(() => fetchBankers().catch(() => []), []);
  const list = bankers ?? [];
  // Keep the active banker selectable even before (or without) the list loading.
  const options = viewAs && !list.some(b => b.userId === viewAs.userId) ? [viewAs, ...list] : list;

  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-2 shadow-card transition ${
        viewAs ? 'border-accent-border bg-accent-bg text-accent' : 'border-line bg-surface text-muted hover:text-fg'
      }`}
      title={viewAs ? 'Previewing another banker’s book. Actions you take are still made as you.' : 'Preview the cockpit as another banker'}
    >
      <Icon name="clients" size={12} />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]">{viewAs ? 'Viewing as' : 'View as'}</span>
      <select
        aria-label="View the cockpit as"
        value={viewAs?.userId ?? ''}
        onChange={e => setViewAs(options.find(b => b.userId === e.target.value) ?? null)}
        className="max-w-[170px] cursor-pointer appearance-none truncate bg-transparent pr-4 text-[12px] font-semibold text-fg outline-none"
      >
        <option value="">My book</option>
        {options.map(b => (
          <option key={b.userId} value={b.userId}>
            {b.name}{b.accounts ? ` · ${compact(b.accounts)} accts` : ''}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-[9px]">▾</span>
    </label>
  );
}
