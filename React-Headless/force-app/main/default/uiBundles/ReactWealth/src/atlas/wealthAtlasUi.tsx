import type { ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { field, relation, type RecordNode } from './wealthAtlasData';

export const formatMoney = (value: number | null | undefined) =>
  value == null
    ? '—'
    : Number(value).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      });
export const formatCount = (value: number | null | undefined) =>
  value == null ? '—' : Number(value).toLocaleString('en-US');
export const formatPct = (value: number | null | undefined) =>
  value == null ? '—' : `${Math.round(value)}%`;
export const formatDate = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';
export function useWorkspaceView() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  return {
    get: (key: string, fallback = '') => params.get(key) ?? fallback,
    set: (changes: Record<string, string>, replace = false) =>
      setParams(
        current => {
          const next = new URLSearchParams(current);
          Object.entries(changes).forEach(([key, value]) =>
            value ? next.set(key, value) : next.delete(key)
          );
          return next;
        },
        { replace, preventScrollReset: true, state: location.state }
      ),
  };
}

export function Tabs({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <nav className={className} aria-label={label}>
      {items.map(([key, text]) => (
        <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </nav>
  );
}

export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="ws-metric wa-metric wcx-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function SourceState({
  source,
  empty = 'No source records match this view.',
}: {
  source: { loading: boolean; error: string | null };
  empty?: string;
}) {
  return (
    <p className="wa-empty" role="status">
      {source.loading
        ? 'Loading live advisory evidence…'
        : source.error
          ? 'Source evidence is unavailable.'
          : empty}
    </p>
  );
}

export function HouseholdLink({
  id,
  children,
  className = 'secondary',
}: {
  id: string;
  children?: ReactNode;
  className?: string;
}) {
  const location = useLocation();
  return (
    /^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(id) && (
      <Link
        className={className}
        to={`/relationships?client=${id}`}
        state={{ returnTo: location.pathname + location.search }}
      >
        {children ?? 'Open household'}
      </Link>
    )
  );
}

export type OpenProposal = (kind: string, title: string, source?: RecordNode, accountId?: string) => void;
export const numericField = (row: RecordNode, key: string) => {
  const value = field(row, key);
  return value == null ? null : Number(value);
};
export const dates = (value: string) => value.slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const initials = (value: string) =>
  value
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0])
    .join('');
export const matches = (query: string, ...values: string[]) =>
  values.some(value => value.toLowerCase().includes(query.trim().toLowerCase()));
export const goalAccount = (goal: RecordNode) => relation(relation(goal, 'FinancialPlan'), 'Account');
export function RecordDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <dialog
      className="wealth-atlas-dialog"
      ref={dialog => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      onCancel={close}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button className="secondary" onClick={close} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Calendar({
  days,
  chosen,
  month,
  select,
  label,
}: {
  days: string[];
  chosen: string;
  month: string;
  select: (date: string) => void;
  label?: string;
}) {
  const date = new Date(`${month}-01T00:00:00Z`);
  const count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return (
    <div className={label ? 'wa-calendar' : undefined}>
      {label && <header><strong>{date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><small>{label}</small></header>}
      {!label && <div className="wl-week">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={index}>{day}</span>)}</div>}
      <div className={label ? 'wa-days' : 'wl-days ws-month-grid'}>
        {label && ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(value => <b key={value}>{value}</b>)}
        {Array.from({ length: date.getUTCDay() }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: count }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, '0')}`;
          const events = days.filter(value => value === day).length;
          return (
            <button
              key={day}
              type="button"
              className={label ? [events ? 'has-review' : '', day === chosen ? 'selected' : ''].filter(Boolean).join(' ') : undefined}
              aria-label={`${formatDate(day)}, ${events} records`}
              aria-pressed={day === chosen}
              disabled={!label && !events}
              onClick={() => select(day === chosen ? '' : day)}
            >
              <span>{index + 1}</span>
              <i>{'●'.repeat(Math.min(events, 3))}</i>
            </button>
          );
        })}
      </div>
    </div>
  );
}
