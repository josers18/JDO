import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '../iconMap';
import { Button } from '../Button';
import { formatValue } from '../format';
import type { WhitespaceData } from '../../data/whitespace';

/**
 * ── Cross-sell / Upsell white-space analysis ──────────────────────────────
 *
 * A selectable clients × products heat map. Each cell is either an OWNED
 * product (muted, a check — a live FSC FinancialAccount) or WHITE SPACE — a
 * product the client doesn't hold, scored 0-100 by the offer model's
 * conversion probability and tinted by that score. Clicking a cell, a client
 * row header, or a product column header filters the detail table below.
 *
 * Data comes from `fetchWhitespace` (`data/whitespace.ts`); there is no
 * built-in fixture. Acting on a row is the page's call (it creates a real
 * Opportunity); acted rows flip to "In pipeline" right away.
 */
export type { WhitespaceProduct, WhitespaceCell, WhitespaceClient, WhitespaceData } from '../../data/whitespace';

export interface WhitespaceAct {
  clientId: string;
  clientName: string;
  productKey: string;
  productLabel: string;
  action: string;
  reason: string;
  estValue: number;
  code?: string;
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
  inPipeline: boolean;
  code?: string;
}

type Selection =
  | { kind: 'all' }
  | { kind: 'client'; clientId: string }
  | { kind: 'product'; productKey: string }
  | { kind: 'cell'; clientId: string; productKey: string };

/** Heat-tint bucket for an opportunity score (Tailwind v4 alpha via color-mix). */
function heatClass(score: number): string {
  if (score >= 75) return 'bg-accent text-white';
  if (score >= 50) return 'bg-accent/60 text-white';
  if (score >= 25) return 'bg-accent/30 text-accent';
  return 'bg-accent/12 text-muted';
}

export function CrossSellWhitespace({
  data,
  loading = false,
  /** the banker acts on an opportunity row; resolve true once it's in the pipeline */
  onAct,
}: {
  data: WhitespaceData | null;
  loading?: boolean;
  onAct?: (row: WhitespaceAct) => Promise<boolean> | boolean | void;
}) {
  const [sel, setSel] = useState<Selection>({ kind: 'all' });
  // Cells acted on this session — shown as in pipeline before the next reload.
  const [acted, setActed] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const products = data?.products ?? [];
  const clients = data?.clients ?? [];
  const stats = data?.stats;

  // Flatten every white-space (non-owned) cell into a sortable opportunity list.
  const allOpps = useMemo<OpportunityRow[]>(() => {
    const rows: OpportunityRow[] = [];
    for (const c of clients) {
      for (const p of products) {
        const cell = c.cells[p.key];
        if (!cell || cell.owned || cell.score == null) continue;
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
          inPipeline: Boolean(cell.inPipeline) || acted.has(`${c.id}|${p.key}`),
          code: cell.code,
        });
      }
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [clients, products, acted]);

  const act = async (r: OpportunityRow) => {
    if (!onAct || r.inPipeline || busy) return;
    const key = `${r.clientId}|${r.productKey}`;
    setBusy(key);
    try {
      const ok = await onAct({
        clientId: r.clientId, clientName: r.clientName, productKey: r.productKey, productLabel: r.productLabel,
        action: r.action, reason: r.reason, estValue: r.estValue, code: r.code,
      });
      if (ok !== false) setActed(s => new Set(s).add(key));
    } finally {
      setBusy(null);
    }
  };
  // The refetched stats can come back cached, so fold in this session's
  // creations that the loaded data doesn't count yet (cell not inPipeline).
  const pending = clients.flatMap(c =>
    products.filter(p => acted.has(`${c.id}|${p.key}`) && !c.cells[p.key]?.inPipeline)
      .map(p => c.cells[p.key]?.estValue ?? 0),
  );
  const pipelineValue = (stats?.openValue ?? 0) + pending.reduce((s, x) => s + x, 0);
  const pipelineCount = (stats?.open ?? 0) + pending.length;

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
            {stats && (
              <p className="mt-1 text-[12px] tabular-nums text-muted">
                {pipelineCount} {pipelineCount === 1 ? 'opportunity' : 'opportunities'} from this grid
                {' · '}{formatValue(pipelineValue, 'currencyCompact')} est. value
                {' · '}{stats.won30} won in 30d{data?.scope === 'org' ? ' · org-wide' : ''}
              </p>
            )}
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
              {loading && clients.length === 0 &&
                Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-[8px] bg-surface-muted/50" />
                ))}
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
                    if (cell.score == null) return <span key={p.key} className="h-11 rounded-[8px] bg-surface-muted/40" />;
                    const score = cell.score;
                    const piped = Boolean(cell.inPipeline) || acted.has(`${c.id}|${p.key}`);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() =>
                          setSel(isCellActive(c.id, p.key) ? { kind: 'all' } : { kind: 'cell', clientId: c.id, productKey: p.key })
                        }
                        title={`${c.name} · ${p.label} — score ${score}${piped ? ' · opportunity open' : ''}\n${cell.reason ?? ''}`}
                        className={clsx(
                          'grid h-11 place-items-center rounded-[8px] text-[12px] font-bold tabular-nums transition hover:brightness-105',
                          heatClass(score),
                          'relative',
                          isCellActive(c.id, p.key) && 'ring-2 ring-fg ring-offset-1 ring-offset-surface',
                        )}
                      >
                        {score}
                        {piped && <span aria-label="opportunity open" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-fg/70" />}
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
                    {r.inPipeline ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-[11.5px] font-medium text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-fg/70" /> In pipeline
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!onAct || busy != null}
                        onClick={() => act(r)}
                        title="Create the opportunity in Salesforce"
                        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-[11.5px] font-medium text-muted transition hover:border-accent-border hover:text-fg disabled:opacity-60"
                      >
                        {busy === `${r.clientId}|${r.productKey}` ? 'Creating…' : r.action}
                        <Icon name="arrow" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {detailRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">
                    {loading
                      ? 'Scoring your book…'
                      : clients.length === 0
                        ? 'No scored white space in this book yet.'
                        : 'No white-space opportunities in this slice.'}
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
