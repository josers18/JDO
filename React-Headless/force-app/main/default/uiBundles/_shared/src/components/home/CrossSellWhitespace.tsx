import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '../iconMap';
import { Button } from '../Button';
import { formatValue } from '../format';

/**
 * ── Cross-sell / Upsell white-space analysis ──────────────────────────────
 *
 * A selectable clients × product-categories heat map. Each cell is either an
 * OWNED product (muted, a check) or WHITE SPACE — a product the client does NOT
 * hold, scored 0-100 by opportunity strength and tinted by that score. Clicking
 * a cell, a client row-header, or a product column-header filters the detail
 * table below to that slice (the classic "select the white space, read the
 * details" pattern the user described).
 *
 * DATA SEAM: the component renders off a `WhitespaceData` matrix and defaults
 * to built-in MOCK. A future Data Cloud dataset (a blend of DC product-holding
 * DMOs + life-events / goals signals) needs only to produce the same shape and
 * be handed in via `data` — no markup change. See `dataSource.ts` resolve().
 */

export interface WhitespaceProduct {
  /** stable key used to index each client's cells */
  key: string;
  /** short column label (kept compact for the narrow App-Domain content region) */
  label: string;
}

export interface WhitespaceCell {
  /** the client already holds this product → not an opportunity */
  owned: boolean;
  /** opportunity strength 0-100 when not owned (drives the heat tint + sort) */
  score?: number;
  /** the signal driving the opportunity (life event, DC signal, goal…) */
  reason?: string;
  /** estimated first-year value of winning this product */
  estValue?: number;
  /** the recommended next action */
  action?: string;
}

export interface WhitespaceClient {
  id: string;
  name: string;
  segment: string;
  /** keyed by WhitespaceProduct.key */
  cells: Record<string, WhitespaceCell>;
}

export interface WhitespaceData {
  products: WhitespaceProduct[];
  clients: WhitespaceClient[];
}

/** A flattened detail row (one white-space opportunity). */
interface OpportunityRow {
  clientId: string;
  clientName: string;
  segment: string;
  productKey: string;
  productLabel: string;
  score: number;
  reason: string;
  estValue: number;
  action: string;
}

type Selection =
  | { kind: 'all' }
  | { kind: 'client'; clientId: string }
  | { kind: 'product'; productKey: string }
  | { kind: 'cell'; clientId: string; productKey: string };

// ── Built-in mock matrix (retail banking product ladder) ────────────────────
const MOCK_PRODUCTS: WhitespaceProduct[] = [
  { key: 'checking', label: 'Checking' },
  { key: 'savings', label: 'Savings' },
  { key: 'card', label: 'Credit Card' },
  { key: 'auto', label: 'Auto Loan' },
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'heloc', label: 'HELOC' },
  { key: 'invest', label: 'Investing' },
  { key: 'insure', label: 'Insurance' },
];

/** Compact helper to author mock cells: `o()` = owned, `w(score,reason,val,action)` = white space. */
const o = (): WhitespaceCell => ({ owned: true });
const w = (score: number, reason: string, estValue: number, action: string): WhitespaceCell => ({
  owned: false,
  score,
  reason,
  estValue,
  action,
});

const MOCK_CLIENTS: WhitespaceClient[] = [
  {
    id: 'ws-1',
    name: 'Sarah Chen',
    segment: 'Mass Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: o(),
      auto: w(84, 'Auto loan at competitor matures in 45 days', 1800, 'Send refi pre-approval'),
      mortgage: w(91, 'Zillow save + rising deposit balance = home shopping', 6200, 'Offer rate-lock consult'),
      heloc: w(38, 'Home equity building', 900, 'Monitor'),
      invest: w(72, 'Idle $180k in savings > 6 mo', 3400, 'Book advisory intro'),
      insure: w(29, 'No linked policy on file', 600, 'Cross-ref bundle'),
    },
  },
  {
    id: 'ws-2',
    name: 'Marcus Webb',
    segment: 'Mass Market',
    cells: {
      checking: o(),
      savings: w(66, 'Direct deposit up 22%, no savings sweep', 700, 'Enable auto-save'),
      card: w(81, 'High debit spend, no rewards card', 1500, 'Pre-approve rewards card'),
      auto: o(),
      mortgage: w(24, 'Renter — early signal only', 400, 'Nurture'),
      heloc: w(12, 'No property', 0, '—'),
      invest: w(48, 'First emergency fund milestone hit', 1100, 'Intro to robo-invest'),
      insure: w(55, 'New auto loan, no GAP coverage', 900, 'Offer GAP + bundle'),
    },
  },
  {
    id: 'ws-3',
    name: 'Priya Nair',
    segment: 'Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: o(),
      auto: o(),
      mortgage: o(),
      heloc: w(77, 'Home value +18%, kitchen reno permits pulled', 2600, 'Offer HELOC line'),
      invest: w(88, '$420k held-away at competitor (aggregation)', 7800, 'Advisor consult — held-away'),
      insure: w(63, 'Umbrella gap vs. net worth', 1400, 'Wealth-protection review'),
    },
  },
  {
    id: 'ws-4',
    name: 'David Okafor',
    segment: 'Mass Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: w(58, 'Travel spend on debit, no travel card', 1200, 'Offer travel rewards'),
      auto: w(69, 'Lease-end in 60 days (life event)', 1600, 'Auto pre-approval'),
      mortgage: w(44, 'Pre-qual click, no application', 3100, 'Follow up on pre-qual'),
      heloc: w(21, 'Early equity', 500, 'Monitor'),
      invest: w(74, 'Bonus deposit + retirement goal set', 3600, 'Book retirement plan'),
      insure: w(33, 'No life policy, new child event', 1500, 'Life-insurance outreach'),
    },
  },
  {
    id: 'ws-5',
    name: 'Elena Rossi',
    segment: 'Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: o(),
      auto: w(31, 'Owns vehicle outright', 400, 'Nurture'),
      mortgage: o(),
      heloc: w(82, 'Investment-property inquiry', 2900, 'Offer HELOC for down payment'),
      invest: o(),
      insure: w(70, 'Second property, no landlord policy', 1800, 'Landlord-coverage review'),
    },
  },
  {
    id: 'ws-6',
    name: 'James Patterson',
    segment: 'Mass Market',
    cells: {
      checking: o(),
      savings: w(52, 'No savings relationship', 600, 'Open high-yield savings'),
      card: o(),
      auto: w(47, 'Older vehicle, service spend rising', 1100, 'Auto refi check'),
      mortgage: w(18, 'Renter', 300, 'Nurture'),
      heloc: w(9, 'No property', 0, '—'),
      invest: w(61, 'Consistent surplus, no invest account', 1500, 'Intro to investing'),
      insure: o(),
    },
  },
  {
    id: 'ws-7',
    name: 'Aisha Rahman',
    segment: 'Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: o(),
      auto: o(),
      mortgage: w(79, 'Rate-drop + lease neighborhood searches', 5400, 'Rate-lock consult'),
      heloc: w(41, 'Building equity', 800, 'Monitor'),
      invest: o(),
      insure: w(57, 'Growing assets, thin coverage', 1300, 'Protection review'),
    },
  },
  {
    id: 'ws-8',
    name: 'Tom Bradley',
    segment: 'Mass Affluent',
    cells: {
      checking: o(),
      savings: o(),
      card: w(64, 'Business spend on personal debit', 1400, 'Offer business rewards card'),
      auto: w(36, 'Recently financed elsewhere', 700, 'Refi check in 6 mo'),
      mortgage: w(53, 'Second-home browsing', 3800, 'Second-home pre-qual'),
      heloc: w(73, 'Primary equity +$140k, remodel intent', 2400, 'Offer HELOC line'),
      invest: w(86, 'Sold business — liquidity event', 9200, 'Priority advisor consult'),
      insure: w(49, 'Coverage lags net worth', 1100, 'Wealth-protection review'),
    },
  },
];

const MOCK_DATA: WhitespaceData = { products: MOCK_PRODUCTS, clients: MOCK_CLIENTS };

/** Heat-tint bucket for an opportunity score (Tailwind v4 alpha via color-mix). */
function heatClass(score: number): string {
  if (score >= 75) return 'bg-accent text-white';
  if (score >= 50) return 'bg-accent/60 text-white';
  if (score >= 25) return 'bg-accent/30 text-accent';
  return 'bg-accent/12 text-muted';
}

export function CrossSellWhitespace({
  data = MOCK_DATA,
  /** raised when the banker acts on an opportunity row (e.g. open Prep/Schedule) */
  onAct,
}: {
  data?: WhitespaceData;
  onAct?: (row: { clientId: string; clientName: string; productLabel: string; action: string }) => void;
}) {
  const [sel, setSel] = useState<Selection>({ kind: 'all' });

  const { products, clients } = data;

  // Flatten every white-space (non-owned) cell into a sortable opportunity list.
  const allOpps = useMemo<OpportunityRow[]>(() => {
    const rows: OpportunityRow[] = [];
    for (const c of clients) {
      for (const p of products) {
        const cell = c.cells[p.key];
        if (!cell || cell.owned) continue;
        rows.push({
          clientId: c.id,
          clientName: c.name,
          segment: c.segment,
          productKey: p.key,
          productLabel: p.label,
          score: cell.score ?? 0,
          reason: cell.reason ?? '',
          estValue: cell.estValue ?? 0,
          action: cell.action ?? '—',
        });
      }
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [clients, products]);

  const detailRows = useMemo<OpportunityRow[]>(() => {
    switch (sel.kind) {
      case 'client':
        return allOpps.filter(r => r.clientId === sel.clientId);
      case 'product':
        return allOpps.filter(r => r.productKey === sel.productKey);
      case 'cell':
        return allOpps.filter(r => r.clientId === sel.clientId && r.productKey === sel.productKey);
      case 'all':
      default:
        return allOpps;
    }
  }, [allOpps, sel]);

  // Header caption describing the current selection.
  const caption = useMemo(() => {
    const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '';
    const productLabel = (key: string) => products.find(p => p.key === key)?.label ?? '';
    switch (sel.kind) {
      case 'client':
        return `${clientName(sel.clientId)} · all opportunities`;
      case 'product':
        return `${productLabel(sel.productKey)} · all clients`;
      case 'cell':
        return `${clientName(sel.clientId)} · ${productLabel(sel.productKey)}`;
      case 'all':
      default:
        return 'All white-space opportunities';
    }
  }, [sel, clients, products]);

  const totalValue = detailRows.reduce((s, r) => s + r.estValue, 0);

  const isColActive = (key: string) => sel.kind === 'product' && sel.productKey === key;
  const isRowActive = (id: string) => sel.kind === 'client' && sel.clientId === id;
  const isCellActive = (id: string, key: string) =>
    sel.kind === 'cell' && sel.clientId === id && sel.productKey === key;

  // grid: name column + one column per product
  const gridTemplate = `minmax(116px, 1.3fr) repeat(${products.length}, minmax(0, 1fr))`;

  return (
    <div className="wp-stagger">
      {/* ── Heat map ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[22px] border border-line bg-surface-glass shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              <Icon name="wand" size={13} className="text-ai" /> Cross-sell · white-space analysis
            </div>
            <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-tight">
              Where the next product lives
            </h2>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-muted" /> owned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-accent/30" /> low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" /> high
            </span>
          </div>
        </header>

        <div className="overflow-x-auto px-4 py-4">
          <div className="min-w-[640px]">
            {/* Column headers */}
            <div className="grid items-end gap-1" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Client</div>
              {products.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSel(isColActive(p.key) ? { kind: 'all' } : { kind: 'product', productKey: p.key })}
                  title={`Filter to ${p.label} opportunities`}
                  className={clsx(
                    'truncate rounded-[8px] px-1 pb-2 pt-1 text-center text-[10.5px] font-semibold transition',
                    isColActive(p.key) ? 'bg-accent-bg text-accent' : 'text-muted hover:text-fg',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Rows */}
            <div className="flex flex-col gap-1">
              {clients.map(c => (
                <div key={c.id} className="grid items-center gap-1" style={{ gridTemplateColumns: gridTemplate }}>
                  <button
                    type="button"
                    onClick={() => setSel(isRowActive(c.id) ? { kind: 'all' } : { kind: 'client', clientId: c.id })}
                    title={`Filter to ${c.name}'s opportunities`}
                    className={clsx(
                      'flex min-w-0 flex-col rounded-[9px] px-2 py-1.5 text-left transition',
                      isRowActive(c.id) ? 'bg-accent-bg' : 'hover:bg-surface-muted',
                    )}
                  >
                    <span className="truncate text-[12.5px] font-semibold text-fg">{c.name}</span>
                    <span className="truncate text-[10px] text-faint">{c.segment}</span>
                  </button>
                  {products.map(p => {
                    const cell = c.cells[p.key];
                    if (!cell) return <span key={p.key} className="h-11 rounded-[8px] bg-surface-muted/40" />;
                    if (cell.owned) {
                      return (
                        <div
                          key={p.key}
                          title={`${c.name} owns ${p.label}`}
                          className="grid h-11 place-items-center rounded-[8px] bg-surface-muted text-[12px] text-faint"
                        >
                          ✓
                        </div>
                      );
                    }
                    const score = cell.score ?? 0;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() =>
                          setSel(isCellActive(c.id, p.key) ? { kind: 'all' } : { kind: 'cell', clientId: c.id, productKey: p.key })
                        }
                        title={`${c.name} · ${p.label} — score ${score}\n${cell.reason ?? ''}`}
                        className={clsx(
                          'grid h-11 place-items-center rounded-[8px] text-[12px] font-bold tabular-nums transition hover:brightness-105',
                          heatClass(score),
                          isCellActive(c.id, p.key) && 'ring-2 ring-fg ring-offset-1 ring-offset-surface',
                        )}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Detail table ─────────────────────────────────────────── */}
      <section className="mt-4 overflow-hidden rounded-[22px] border border-line bg-surface-glass shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Opportunity detail</div>
            <h3 className="mt-0.5 truncate text-[15px] font-semibold text-fg">{caption}</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-display text-[19px] font-semibold tabular-nums text-fg">
                {formatValue(totalValue, 'currencyCompact')}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                {detailRows.length} {detailRows.length === 1 ? 'opportunity' : 'opportunities'}
              </div>
            </div>
            {sel.kind !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setSel({ kind: 'all' })}>
                Clear filter
              </Button>
            )}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                <th className="px-6 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">Signal</th>
                <th className="px-3 py-2.5 text-right font-medium">Score</th>
                <th className="px-3 py-2.5 text-right font-medium">Est. value</th>
                <th className="px-6 py-2.5 text-right font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map(r => (
                <tr
                  key={`${r.clientId}-${r.productKey}`}
                  className="border-b border-line/60 transition last:border-0 hover:bg-surface-muted/50"
                >
                  <td className="px-6 py-3">
                    <div className="font-semibold text-fg">{r.clientName}</div>
                    <div className="text-[10.5px] text-faint">{r.segment}</div>
                  </td>
                  <td className="px-3 py-3 text-fg">{r.productLabel}</td>
                  <td className="px-3 py-3 max-w-[280px] text-muted">{r.reason}</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={clsx(
                        'inline-grid h-7 min-w-7 place-items-center rounded-[7px] px-1.5 text-[11.5px] font-bold tabular-nums',
                        heatClass(r.score),
                      )}
                    >
                      {r.score}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-fg">
                    {r.estValue > 0 ? formatValue(r.estValue, 'currency') : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {r.action === '—' ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onAct?.({ clientId: r.clientId, clientName: r.clientName, productLabel: r.productLabel, action: r.action })
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-[11.5px] font-medium text-muted transition hover:border-accent-border hover:text-fg"
                      >
                        {r.action}
                        <Icon name="arrow" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {detailRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">
                    No white-space opportunities in this slice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
