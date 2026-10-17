import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, History, Loader2, Play, Square } from "lucide-react";
import { api, QueryCallError } from "../api";
import { ObjectBrowser } from "./ObjectBrowser";
import { CallPanel, apiUsageOf, type Telemetry } from "./CallPanel";
import { SqlEditor, insertAtCursor } from "./SqlEditor";
import { download, toCsv, toXlsx } from "./export";
import type { OrgsResponse, QueryCatalog, QueryColumn, QueryObject, QueryPage, QueryStatus, WireEntry } from "../../../shared/types";

const FIRST_PAGE = 100;
const MORE_PAGE = 500;
const POLL_WAIT_MS = 5000; // the status call holds this long for the query to finish (API max 10 s)
const HISTORY_MAX = 50;
const NUMERIC = /^(decimal|integer|bigint|double|float|number|numeric|smallint|tinyint|real)/i;

interface HistoryItem {
  sql: string;
  dataspace: string;
  at: string;
  rows?: number;
  error?: boolean;
}

const spaceKey = (orgId: string) => `afd360.query.dataspace.${orgId}`;
const historyKey = (orgId: string) => `afd360.query.history.${orgId}`;
const readHistory = (orgId: string): HistoryItem[] => JSON.parse(localStorage.getItem(historyKey(orgId)) ?? "[]");

interface Failure {
  message: string;
  detail?: string;
  sqlState?: string;
  traceId?: string;
}

export function QueryModule({ orgs, onOpenAdmin }: { orgs: OrgsResponse; onOpenAdmin: () => void }) {
  const org = orgs.orgs.find((o) => o.id === orgs.activeOrgId) ?? null;
  const [dataSpaces, setDataSpaces] = useState<string[]>([]);
  const [dataspace, setDataspace] = useState("default");
  const [catalog, setCatalog] = useState<QueryCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columns, setColumns] = useState<QueryColumn[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [status, setStatus] = useState<QueryStatus | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [wire, setWire] = useState<WireEntry[]>([]);
  const [submitEntry, setSubmitEntry] = useState<WireEntry | undefined>();
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [apiUsage, setApiUsage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const editorBox = useRef<HTMLDivElement>(null);
  const runId = useRef(0); // a newer run, a cancel or an org switch makes an in-flight run stop
  const queryScope = useRef({ queryId: "", dataspace: "default" });

  const addWire = useCallback((entries: WireEntry[]) => {
    setWire((w) => [...w, ...entries]);
    const usage = [...entries].reverse().map(apiUsageOf).find(Boolean);
    if (usage) setApiUsage(usage);
  }, []);

  // Org switch: its data spaces, its saved data space and its history.
  useEffect(() => {
    if (!org) return;
    runId.current++;
    setDataspace(localStorage.getItem(spaceKey(org.id)) ?? "default");
    setHistory(readHistory(org.id));
    setDataSpaces([]);
    api
      .dataSpaces(org.id)
      .then((r) => {
        addWire(r.wire);
        setDataSpaces(r.dataSpaces);
      })
      .catch((e) => e instanceof QueryCallError && addWire(e.wire));
  }, [org?.id, addWire]);

  const loadCatalog = useCallback(
    async (refresh: boolean) => {
      if (!org) return;
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const r = await api.queryCatalog(org.id, dataspace, refresh);
        addWire(r.wire);
        setCatalog(r.catalog);
      } catch (e) {
        if (e instanceof QueryCallError) addWire(e.wire);
        setCatalogError((e as Error).message);
      } finally {
        setCatalogLoading(false);
      }
    },
    [org?.id, dataspace, addWire],
  );

  useEffect(() => {
    setCatalog(null);
    loadCatalog(false);
  }, [loadCatalog]);

  const pickDataspace = (d: string) => {
    if (org) localStorage.setItem(spaceKey(org.id), d);
    setDataspace(d);
  };

  const remember = (item: HistoryItem) => {
    if (!org) return;
    const next = [item, ...readHistory(org.id).filter((h) => h.sql !== item.sql || h.dataspace !== item.dataspace)].slice(0, HISTORY_MAX);
    localStorage.setItem(historyKey(org.id), JSON.stringify(next));
    setHistory(next);
  };

  const isSubmit = (w: WireEntry) => w.method === "POST" && /\/ssot\/query-sql(\?|$)/.test(w.url);

  const fail = (e: unknown) => {
    if (e instanceof QueryCallError) {
      addWire(e.wire);
      const submitted = e.wire.find(isSubmit);
      if (submitted) setSubmitEntry(submitted);
      setFailure({ message: e.message, detail: e.detail, sqlState: e.sqlState, traceId: e.traceId });
    } else setFailure({ message: (e as Error).message });
  };

  const run = async (text = sql) => {
    if (!org || !text.trim() || running) return;
    const id = ++runId.current;
    const space = dataspace;
    const t0 = performance.now();
    setRunning(true);
    setFailure(null);
    setColumns([]);
    setRows([]);
    setStatus(null);
    setElapsedMs(null);
    setSubmitEntry(undefined);
    setShowHistory(false);
    try {
      const r = await api.queryRun(org.id, text, space, FIRST_PAGE);
      addWire(r.wire);
      setSubmitEntry(r.wire.find(isSubmit));
      let page: QueryPage = r.page;
      let st = page.status!;
      queryScope.current = { queryId: st.queryId, dataspace: space };
      setStatus(st);
      if (page.metadata) setColumns(page.metadata);
      // A long query answers Running with no rows: hold on its status until it is done, then read the first page.
      while (st.completionStatus === "Running") {
        if (runId.current !== id) return;
        const s = await api.queryStatus(org.id, st.queryId, space, POLL_WAIT_MS);
        addWire(s.wire);
        st = { ...st, ...s.status };
        setStatus(st);
      }
      if (runId.current !== id) return;
      if (!page.data?.length && st.rowCount > 0) {
        const p = await api.queryRows(org.id, st.queryId, space, 0, FIRST_PAGE);
        addWire(p.wire);
        page = p.page;
        if (page.metadata) setColumns(page.metadata);
      }
      setRows(page.data ?? []);
      setElapsedMs(performance.now() - t0);
      remember({ sql: text, dataspace: space, at: new Date().toISOString(), rows: st.rowCount });
    } catch (e) {
      if (runId.current !== id) return;
      fail(e);
      remember({ sql: text, dataspace: space, at: new Date().toISOString(), error: true });
    } finally {
      if (runId.current === id) setRunning(false);
    }
  };

  const loadMore = async () => {
    if (!org || !status) return;
    setLoadingMore(true);
    const t0 = performance.now();
    try {
      const { queryId, dataspace: space } = queryScope.current;
      const p = await api.queryRows(org.id, queryId, space, rows.length, MORE_PAGE);
      addWire(p.wire);
      setRows((r) => [...r, ...(p.page.data ?? [])]);
      setElapsedMs((ms) => (ms ?? 0) + performance.now() - t0);
    } catch (e) {
      fail(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const cancel = async () => {
    if (!org) return;
    runId.current++;
    setRunning(false);
    const { queryId, dataspace: space } = queryScope.current;
    if (!queryId || status?.completionStatus !== "Running") return;
    try {
      addWire((await api.queryCancel(org.id, queryId, space)).wire);
      setStatus((s) => (s ? { ...s, completionStatus: "Cancelled" } : s));
    } catch (e) {
      fail(e);
    }
  };

  const openObject = (o: QueryObject) => {
    const text = `SELECT * FROM ${o.name} LIMIT 100`;
    setSql(text);
    run(text);
  };

  const exportAs = (kind: "csv" | "xlsx") => {
    const names = columns.map((c) => c.name);
    const base = (/\bfrom\s+"?(\w+)/i.exec(sql)?.[1] ?? "query").slice(0, 40);
    if (kind === "csv") download(`${base}.csv`, toCsv(names, rows), "text/csv;charset=utf-8");
    else download(`${base}.xlsx`, toXlsx(names, rows, base), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  if (!org) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-3">
        <p>No org configured yet.</p>
        <button onClick={onOpenAdmin} className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-action-ink shadow-card">
          Add an org in Admin
        </button>
      </div>
    );
  }

  const telemetry: Telemetry = { status, loaded: rows.length, elapsedMs, apiUsage };
  const hasMore = status !== null && rows.length < status.rowCount && status.completionStatus !== "Running";

  return (
    <div className="flex h-full">
      <ObjectBrowser
        orgName={org.name}
        dataSpaces={dataSpaces}
        dataspace={dataspace}
        onDataspace={pickDataspace}
        catalog={catalog}
        loading={catalogLoading}
        error={catalogError}
        onRefresh={() => loadCatalog(true)}
        onOpen={openObject}
        onField={(f) => insertAtCursor(editorBox.current, f) || setSql((s) => `${s}${s && !/\s$/.test(s) ? " " : ""}${f}`)}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 px-6 pb-3 pt-5 lg:px-8">
          <div ref={editorBox} className="rounded-2xl border border-line bg-surface shadow-card focus-within:ring-2 focus-within:ring-action/50">
            <SqlEditor value={sql} onChange={setSql} onRun={() => run()} objects={catalog?.objects ?? []} />
            <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1">
              <span className="text-xs text-ink-3">
                <span className="font-mono">POST /ssot/query-sql</span> · data space <span className="font-mono">{dataspace}</span>
              </span>
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  aria-expanded={showHistory}
                  disabled={!history.length}
                  className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint disabled:opacity-50"
                >
                  <History size={13} /> History
                </button>
                {showHistory && (
                  <HistoryList
                    items={history}
                    onPick={(h) => {
                      pickDataspace(h.dataspace);
                      setSql(h.sql);
                      setShowHistory(false);
                    }}
                    onClose={() => setShowHistory(false)}
                  />
                )}
              </div>
              {running ? (
                <button onClick={cancel} className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-surface">
                  <Square size={12} /> Cancel
                </button>
              ) : (
                <button
                  onClick={() => run()}
                  disabled={!sql.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-action px-3.5 py-1.5 text-xs font-semibold text-action-ink shadow-card hover:brightness-105 disabled:opacity-50"
                >
                  <Play size={13} /> Run <kbd className="font-sans font-normal opacity-70">⌘↵</kbd>
                </button>
              )}
            </div>
          </div>

          {failure && (
            <div role="alert" className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">
              <div className="font-semibold">{failure.message}</div>
              {failure.detail && <pre className="mt-1.5 overflow-x-auto font-mono text-xs text-ink">{failure.detail}</pre>}
              {(failure.sqlState || failure.traceId) && (
                <div className="mt-1 font-mono text-xs text-ink-3">
                  {failure.sqlState && `SQL state ${failure.sqlState}`}
                  {failure.sqlState && failure.traceId && " · "}
                  {failure.traceId && `trace ${failure.traceId}`}
                </div>
              )}
            </div>
          )}

          <ResultBar
            status={status}
            loaded={rows.length}
            columns={columns.length}
            running={running}
            canExport={rows.length > 0}
            onExport={exportAs}
          />
        </div>

        <ResultsGrid columns={columns} rows={rows} running={running} hasMore={hasMore} loadingMore={loadingMore} onMore={loadMore} remaining={status ? status.rowCount - rows.length : 0} />
      </section>

      <CallPanel telemetry={telemetry} submit={submitEntry} wire={wire} />
    </div>
  );
}

// The headline numbers stay in view next to the grid too, for widths where the Call panel is hidden.
function ResultBar(p: { status: QueryStatus | null; loaded: number; columns: number; running: boolean; canExport: boolean; onExport: (k: "csv" | "xlsx") => void }) {
  const s = p.status;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {p.running ? (
        <span className="flex items-center gap-2 text-ink-2">
          <Loader2 size={14} className="animate-spin" />
          {s?.completionStatus === "Running" ? `Running · ${Math.round((s.progress ?? 0) * 100)}%` : "Submitting…"}
        </span>
      ) : s ? (
        <span className="text-ink-2">
          <span className="font-mono font-semibold text-ink">{p.loaded.toLocaleString()}</span> of{" "}
          <span className="font-mono font-semibold text-ink">{s.rowCount.toLocaleString()}</span> rows · {p.columns} columns
          {s.rowsProcessed !== undefined && (
            <>
              {" "}· <span className="font-mono">{s.rowsProcessed.toLocaleString()}</span> processed
            </>
          )}
          {s.wallClockTime !== undefined && (
            <>
              {" "}· <span className="font-mono">{s.wallClockTime.toFixed(2)} s</span>
            </>
          )}
        </span>
      ) : (
        <span className="text-ink-3">Double-click an object on the left, or write SQL and press Run.</span>
      )}
      {p.canExport && (
        <span className="ml-auto flex gap-1.5">
          <button onClick={() => p.onExport("csv")} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint">
            <FileText size={13} /> CSV
          </button>
          <button onClick={() => p.onExport("xlsx")} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint">
            <FileSpreadsheet size={13} /> Excel
          </button>
        </span>
      )}
    </div>
  );
}

function ResultsGrid(p: {
  columns: QueryColumn[];
  rows: unknown[][];
  running: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  remaining: number;
  onMore: () => void;
}) {
  if (!p.columns.length) return <div className="flex-1" />;
  const numeric = p.columns.map((c) => NUMERIC.test(c.type));
  return (
    <div className="mx-6 mb-6 min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-surface lg:mx-8">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-tint px-2 py-2 text-right font-mono font-normal text-ink-3">#</th>
            {p.columns.map((c) => (
              <th key={c.name} title={`${c.type}${c.nullable === false ? " · not null" : ""}`} className={`whitespace-nowrap border-b border-line bg-tint px-3 py-2 font-semibold ${numeric[p.columns.indexOf(c)] ? "text-right" : "text-left"}`}>
                <div className="font-mono text-ink">{c.name}</div>
                <div className="font-sans font-normal text-ink-3">{c.type}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => (
            <tr key={i} className="hover:bg-tint/70">
              <td className="sticky left-0 border-b border-line bg-surface px-2 py-1.5 text-right font-mono text-ink-3">{i + 1}</td>
              {r.map((v, j) => (
                <td key={j} className={`max-w-[28rem] truncate border-b border-line px-3 py-1.5 font-mono ${numeric[j] ? "text-right" : ""}`} title={v === null ? "null" : String(v)}>
                  {v === null || v === undefined ? <span className="text-ink-3">null</span> : typeof v === "object" ? JSON.stringify(v) : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!p.rows.length && !p.running && <p className="p-6 text-center text-sm text-ink-3">No rows.</p>}
      {p.hasMore && (
        <div className="sticky left-0 flex justify-center p-3">
          <button onClick={p.onMore} disabled={p.loadingMore} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-medium hover:bg-tint disabled:opacity-50">
            {p.loadingMore && <Loader2 size={13} className="animate-spin" />}
            Load {Math.min(MORE_PAGE, p.remaining).toLocaleString()} more <span className="text-ink-3">· {p.remaining.toLocaleString()} left</span>
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryList({ items, onPick, onClose }: { items: HistoryItem[]; onPick: (h: HistoryItem) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute right-0 top-full z-30 mt-1 max-h-96 w-[32rem] max-w-[80vw] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
      {items.map((h, i) => (
        <button key={i} onClick={() => onPick(h)} className="block w-full rounded-xl px-2.5 py-2 text-left hover:bg-tint">
          <div className="truncate font-mono text-xs text-ink">{h.sql}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            <span className="font-mono">{new Date(h.at).toLocaleString([], { hour12: false })}</span> · {h.dataspace}
            {h.error ? <span className="text-err"> · failed</span> : h.rows !== undefined ? ` · ${h.rows.toLocaleString()} rows` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}
