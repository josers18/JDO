import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '../iconMap';
import { Button } from '../Button';
import { formatValue } from '../format';
import { SCORE_MOVE_MIN, VALUE_MOVE_MIN, type WhitespaceCell, type WhitespaceData } from '../../data/whitespace';

/**
 * ── Cross-sell / Upsell white-space analysis ──────────────────────────────
 *
 * A selectable clients × products heat map. Each cell is either an OWNED
 * product (muted, a check — a live FSC FinancialAccount) or WHITE SPACE — a
 * product the client doesn't hold, scored 0-100 by the offer model's
 * conversion probability and tinted by that score. Clicking a cell, a client
 * row header, or a product column header filters the detail table below.
 * A ▲/▼ in a cell means its score moved at least SCORE_MOVE_MIN points over
 * the last six monthly scoring runs (the detail table's "6-mo" column). The
 * Rising / Falling views also count a change in expected value of
 * VALUE_MOVE_MIN or more, so a big offer that slipped under 2 points shows.
 * The grid ranks clients by today's value, so its moves lean upward; the
 * detail table's Rising / Falling chips add the book's biggest movers from
 * outside the grid, ranked by the change in expected value; the 6-mo header
 * sorts by the change in points.
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
  moved?: number;
  evMoved?: number;
  history?: WhitespaceCell['history'];
  /** From the wider book's movers, not a grid client. */
  outside?: boolean;
}

/** Detail-table filter by 6-month score change. */
type Trend = 'all' | 'up' | 'down';
/** rise / fall = conversion points; gain / loss = expected value. */
type SortBy = 'score' | 'rise' | 'fall' | 'gain' | 'loss';
const TRENDS: { key: Trend; label: string; title: string }[] = [
  { key: 'all', label: 'All', title: 'Every white-space opportunity in the grid' },
  { key: 'up', label: '▲ Rising', title: `Up ${SCORE_MOVE_MIN}+ points or $${VALUE_MOVE_MIN}+ in value over 6 months, including clients outside the grid` },
  { key: 'down', label: '▼ Falling', title: `Down ${SCORE_MOVE_MIN}+ points or $${VALUE_MOVE_MIN}+ in value over 6 months, including clients outside the grid` },
];

type Selection =
  | { kind: 'all' }
  | { kind: 'client'; clientId: string }
  | { kind: 'product'; productKey: string }
  | { kind: 'cell'; clientId: string; productKey: string };

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

/** "Score up 4.2 pts since May (30 → 34)" — tooltip line for a cell with history. */
function moveText(cell: Pick<WhitespaceCell, 'moved' | 'history'>): string {
  const h = cell.history;
  if (!h || h.length < 2 || cell.moved == null) return '';
  const first = h[0];
  const last = h[h.length - 1];
  const dir = cell.moved > 0 ? 'up' : cell.moved < 0 ? 'down' : 'flat';
  const pts = dir === 'flat' ? '' : ` ${Math.abs(cell.moved).toFixed(1)} pts`;
  return `Score ${dir}${pts} since ${monthLabel(first.month)} (${Math.round(first.score)} → ${Math.round(last.score)})`;
}

const isMove = (moved?: number) => moved != null && Math.abs(moved) >= SCORE_MOVE_MIN;
const isValueMove = (evMoved?: number) => evMoved != null && Math.abs(evMoved) >= VALUE_MOVE_MIN;
/** +1 rising, −1 falling, 0 neither: a big value change wins, else a 2-point move. */
const trendDir = (r: { moved?: number; evMoved?: number }) =>
  isValueMove(r.evMoved) ? Math.sign(r.evMoved!) : isMove(r.moved) ? Math.sign(r.moved!) : 0;

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
  const [trend, setTrend] = useState<Trend>('all');
  const [sortBy, setSortBy] = useState<SortBy>('score');
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
          moved: cell.moved,
          evMoved: cell.evMoved,
          history: cell.history,
        });
      }
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [clients, products, acted]);

  // The book's biggest movers outside the grid (detail table only).
  const moverOpps = useMemo<OpportunityRow[]>(
    () => (data?.movers ?? []).map(m => ({
      ...m,
      inPipeline: m.inPipeline || acted.has(`${m.clientId}|${m.productKey}`),
      outside: true,
    })),
    [data?.movers, acted],
  );

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

  // Grid rows in the selection, plus the outside movers that fit it (a client or
  // cell selection is a grid client, so no outside mover matches it).
  const { sliceRows, sliceMovers } = useMemo(() => {
    const inSel = (r: OpportunityRow) => {
      switch (sel.kind) {
        case 'client':
          return r.clientId === sel.clientId;
        case 'product':
          return r.productKey === sel.productKey;
        case 'cell':
          return r.clientId === sel.clientId && r.productKey === sel.productKey;
        default:
          return true;
      }
    };
    return { sliceRows: allOpps.filter(inSel), sliceMovers: moverOpps.filter(inSel) };
  }, [allOpps, moverOpps, sel]);

  const trendCount = (t: Exclude<Trend, 'all'>) =>
    [...sliceRows, ...sliceMovers].filter(r => trendDir(r) === (t === 'up' ? 1 : -1)).length;

  const detailRows = useMemo<OpportunityRow[]>(() => {
    const rows = trend === 'all'
      ? [...sliceRows]
      : [...sliceRows, ...sliceMovers].filter(r => trendDir(r) === (trend === 'up' ? 1 : -1));
    if (sortBy === 'score') return rows;
    // Rows without history sort last either way.
    const key = (r: OpportunityRow) => {
      const x = sortBy === 'gain' || sortBy === 'loss' ? r.evMoved : r.moved;
      return x == null ? -Infinity : sortBy === 'rise' || sortBy === 'gain' ? x : -x;
    };
    return rows.sort((a, b) => key(b) - key(a) || b.score - a.score);
  }, [sliceRows, sliceMovers, trend, sortBy]);

  const pickTrend = (t: Trend) => {
    setTrend(t);
    setSortBy(t === 'up' ? 'gain' : t === 'down' ? 'loss' : 'score');
  };
  // 6-mo header: biggest rises → biggest falls → score order (from a value sort, starts at rises).
  const cycleSort = () => setSortBy(s => (s === 'rise' ? 'fall' : s === 'fall' ? 'score' : 'rise'));

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
        return trend === 'all' ? 'All white-space opportunities' : data?.scope === 'org' ? 'All clients' : 'Your book';
    }
  }, [sel, clients, products, trend, data?.scope]);
  const trendCaption = trend === 'up' ? ' · rising scores' : trend === 'down' ? ' · falling scores' : '';

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
            <span className="flex items-center gap-1" title={`Score moved ${SCORE_MOVE_MIN}+ points over the last 6 monthly runs`}>
              <span aria-hidden="true" className="text-[9px] normal-case">▲▼</span> moved 6 mo
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
                    const moved = isMove(cell.moved) ? cell.moved! : null;
                    const mv = moveText(cell);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() =>
                          setSel(isCellActive(c.id, p.key) ? { kind: 'all' } : { kind: 'cell', clientId: c.id, productKey: p.key })
                        }
                        title={`${c.name} · ${p.label} — score ${score}${piped ? ' · opportunity open' : ''}\n${cell.reason ?? ''}${mv ? `\n${mv}` : ''}`}
                        className={clsx(
                          'grid h-11 place-items-center rounded-[8px] text-[12px] font-bold tabular-nums transition hover:brightness-105',
                          heatClass(score),
                          'relative',
                          isCellActive(c.id, p.key) && 'ring-2 ring-fg ring-offset-1 ring-offset-surface',
                        )}
                      >
                        {score}
                        {piped && <span aria-label="opportunity open" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-fg/70" />}
                        {moved != null && (
                          <span
                            aria-label={moved > 0 ? 'score rising' : 'score falling'}
                            className="absolute bottom-0.5 left-1 text-[8.5px] leading-none opacity-80"
                          >
                            {moved > 0 ? '▲' : '▼'}
                          </span>
                        )}
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
            <h3 className="mt-0.5 truncate text-[15px] font-semibold text-fg">{caption}{trendCaption}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by 6-month score change">
              {TRENDS.map(t => {
                const active = trend === t.key;
                const n = t.key === 'all' ? null : trendCount(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => pickTrend(t.key)}
                    aria-pressed={active}
                    title={t.title}
                    className={clsx(
                      'rounded-full px-3 py-1 text-[12px] font-semibold transition',
                      active ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    {t.label}
                    {n != null && (
                      <span className={clsx('ml-1 font-mono text-[11px] tabular-nums', active ? 'text-white/80' : 'text-faint')}>
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
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
          <table className="w-full min-w-[740px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                <th className="px-6 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">Signal</th>
                <th className="px-3 py-2.5 text-right font-medium">Score</th>
                <th
                  className="px-3 py-2.5 text-right font-medium"
                  aria-sort={sortBy === 'rise' ? 'descending' : sortBy === 'fall' ? 'ascending' : 'none'}
                >
                  <button
                    type="button"
                    onClick={cycleSort}
                    title="Change in score over the last 6 monthly scoring runs. Click to sort by biggest rise, then biggest fall."
                    className={clsx(
                      'inline-flex items-center gap-1 uppercase tracking-[0.1em] transition hover:text-fg',
                      (sortBy === 'rise' || sortBy === 'fall') && 'text-fg',
                    )}
                  >
                    6-mo
                    <span aria-hidden="true" className="text-[9px]">
                      {sortBy === 'rise' ? '▲' : sortBy === 'fall' ? '▼' : '↕'}
                    </span>
                  </button>
                </th>
                <th
                  className={clsx('px-3 py-2.5 text-right font-medium', (sortBy === 'gain' || sortBy === 'loss') && 'text-fg')}
                  aria-sort={sortBy === 'gain' ? 'descending' : sortBy === 'loss' ? 'ascending' : 'none'}
                  title="Modeled value of the offer; under it, the change over the last 6 monthly runs"
                >
                  Est. value{sortBy === 'gain' ? ' ▲' : sortBy === 'loss' ? ' ▼' : ''}
                </th>
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
                    <div className="text-[10.5px] text-faint">
                      {r.segment}
                      {r.outside && (
                        <span title="From your wider book: this client isn't in the top-value grid above">
                          {r.segment ? ' · ' : ''}outside the grid
                        </span>
                      )}
                    </div>
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
                  <td className="px-3 py-3 text-right tabular-nums" title={moveText(r)}>
                    {r.moved == null ? (
                      <span className="text-faint">—</span>
                    ) : isMove(r.moved) ? (
                      <span className={clsx('text-[12px] font-semibold', r.moved > 0 ? 'text-ok' : 'text-warn')}>
                        {r.moved > 0 ? '▲' : '▼'} {Math.abs(r.moved).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-faint">{r.moved > 0 ? '+' : r.moved < 0 ? '−' : '±'}{Math.abs(r.moved).toFixed(1)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold text-fg">{r.estValue > 0 ? formatValue(r.estValue, 'currency') : '—'}</div>
                    {trendDir(r) !== 0 && r.evMoved != null && r.evMoved !== 0 && r.history?.length ? (
                      <div className={clsx('text-[10.5px] font-medium', r.evMoved > 0 ? 'text-ok' : 'text-warn')}>
                        {r.evMoved > 0 ? '+' : '−'}{formatValue(Math.abs(r.evMoved), 'currencyCompact')} since {monthLabel(r.history[0].month)}
                      </div>
                    ) : null}
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
                  <td colSpan={7} className="px-6 py-10 text-center text-muted">
                    {loading
                      ? 'Scoring your book…'
                      : clients.length === 0
                        ? 'No scored white space in this book yet.'
                        : trend === 'down'
                          ? `No offer in this slice fell ${SCORE_MOVE_MIN}+ points or $${VALUE_MOVE_MIN}+ in value over 6 months.`
                          : trend === 'up'
                            ? `No offer in this slice rose ${SCORE_MOVE_MIN}+ points or $${VALUE_MOVE_MIN}+ in value over 6 months.`
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
