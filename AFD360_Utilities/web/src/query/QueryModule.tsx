import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eraser, FileSpreadsheet, FileText, History, Loader2, Play, Repeat, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { api, QueryCallError } from "../api";
import { ObjectBrowser } from "./ObjectBrowser";
import { CallPanel, apiUsageOf, type Telemetry } from "./CallPanel";
import { SqlEditor, insertAtCursor } from "./SqlEditor";
import { ApiForm, FORMS, type RootSearch } from "./ApiForm";
import { RecordPanel } from "./RecordPanel";
import { download, toCsv, toXlsx } from "./export";
import { addToSelect, searchWithChunks, sqlParams } from "../../../shared/sqlAssist";
import { viewRows, type GridSort } from "../../../shared/gridView";
import type { OrgsResponse, QueryApiKind, QueryCatalog, QueryColumn, QueryObject, QueryPage, QueryStatus, WireEntry } from "../../../shared/types";

const FIRST_PAGE = 100;
const MORE_PAGE = 500;
const POLL_WAIT_MS = 5000; // the status call holds this long for the query to finish (API max 10 s)
const HISTORY_MAX = 50;
const NUMERIC = /^(decimal|integer|bigint|double|float|number|numeric|smallint|tinyint|real)/i;
const JSON_MAX = 500; // records shown in the JSON view
const PARAM_TYPES = ["Varchar", "Integer", "BigInt", "Numeric", "Double", "Bool", "Date", "Timestamp", "TimestampTZ", "Time"];
const DATE_STYLES = ["", "MDY", "DMY", "YMD"];
const TIMEOUTS: [string, string][] = [["", "default"], ["30000", "30 s"], ["60000", "1 min"], ["300000", "5 min"], ["600000", "10 min"], ["1800000", "30 min"], ["3600000", "1 h"]];
const LOCALES: [string, string][] = [
  ["", "default"], ["en_US", "English (US)"], ["en_GB", "English (UK)"], ["en_CA", "English (Canada)"], ["en_AU", "English (Australia)"],
  ["fr_FR", "French (France)"], ["fr_CA", "French (Canada)"], ["de_DE", "German (Germany)"], ["de_AT", "German (Austria)"],
  ["de_CH", "German (Switzerland)"], ["es_ES", "Spanish (Spain)"], ["es_MX", "Spanish (Mexico)"], ["it_IT", "Italian"],
  ["pt_BR", "Portuguese (Brazil)"], ["pt_PT", "Portuguese (Portugal)"], ["nl_NL", "Dutch"], ["sv_SE", "Swedish"], ["da_DK", "Danish"],
  ["nb_NO", "Norwegian"], ["fi_FI", "Finnish"], ["pl_PL", "Polish"], ["ja_JP", "Japanese"], ["ko_KR", "Korean"],
  ["zh_CN", "Chinese (Simplified)"], ["zh_TW", "Chinese (Traditional)"],
];

type Mode = "sql" | QueryApiKind;
const MODES: { mode: Mode; label: string }[] = [
  { mode: "sql", label: "SQL" },
  ...(Object.keys(FORMS) as QueryApiKind[]).map((k) => ({ mode: k, label: FORMS[k].label })),
];

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
  const [mode, setMode] = useState<Mode>("sql");
  const [forms, setForms] = useState<Record<QueryApiKind, Record<string, string>>>({ dataGraph: {}, insight: {}, profile: {}, universalId: {} });
  const [paramValues, setParamValues] = useState<Record<string, { type: string; value: string }>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"grid" | "json">("grid");
  const [selected, setSelected] = useState<number | null>(null); // the row open in the record panel
  const [sort, setSort] = useState<GridSort | null>(null);
  const [filters, setFilters] = useState<string[]>([]); // one per column
  const [partial, setPartial] = useState(false); // a REST read said there is more than it returned
  const [source, setSource] = useState("query"); // what the result on screen came from, for export names
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
  const params = useMemo(() => sqlParams(sql), [sql]);
  const sqlObjects = useMemo(() => (catalog?.objects ?? []).filter((o) => o.type !== "DG" && o.type !== "SI"), [catalog]);

  const fail = (e: unknown) => {
    if (e instanceof QueryCallError) {
      addWire(e.wire);
      const submitted = e.wire.find(isSubmit);
      if (submitted || mode !== "sql") setSubmitEntry(submitted ?? e.wire.at(-1));
      setFailure({ message: e.message, detail: e.detail, sqlState: e.sqlState, traceId: e.traceId });
    } else setFailure({ message: (e as Error).message });
  };

  const clearResult = () => {
    setFailure(null);
    setSelected(null);
    setSort(null);
    setFilters([]);
    setColumns([]);
    setRows([]);
    setStatus(null);
    setElapsedMs(null);
    setSubmitEntry(undefined);
    setShowHistory(false);
    setPartial(false);
  };

  const start = () => {
    clearResult();
    setRunning(true);
  };

  // Clear empties this tab's input and the result under it; settings and the wire log stay.
  const clear = () => {
    clearResult();
    if (mode === "sql") {
      setSql("");
      setParamValues({});
    } else setForms((f) => ({ ...f, [mode]: {} }));
  };

  const run = async (asWritten = sql) => {
    if (!org || !asWritten.trim() || running) return;
    // A bare SELECT * search runs joined to its chunk text, and the editor shows the SQL that ran.
    const joined = searchWithChunks(asWritten, catalog?.objects ?? []);
    const text = joined ?? asWritten;
    if (joined) setSql(joined);
    const id = ++runId.current;
    const space = dataspace;
    const t0 = performance.now();
    start();
    setSource((/\bfrom\s+"?(\w+)/i.exec(text)?.[1] ?? "query").slice(0, 40));
    const sqlParameters = sqlParams(text).map((name) => ({ name, type: paramValues[name]?.type ?? "Varchar", value: paramValues[name]?.value ?? "" }));
    const querySettings = { ...settings, ...(settings.query_timeout ? { query_timeout: `${settings.query_timeout}ms` } : {}) };
    try {
      const r = await api.queryRun(org.id, text, space, FIRST_PAGE, { sqlParameters, querySettings });
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

  // A data graph, insight, profile or universal ID read: one GET, its records straight into the grid.
  const read = async (kind: QueryApiKind) => {
    if (!org || running) return;
    const id = ++runId.current;
    const t0 = performance.now();
    const values = forms[kind];
    start();
    setSource((values.graph || values.ci || values.dmo || values.entity || kind).slice(0, 40));
    try {
      const r = await api.queryRead(org.id, { kind, params: values }, dataspace);
      if (runId.current !== id) return;
      addWire(r.wire);
      setSubmitEntry(r.wire.at(-1));
      setColumns(r.page.metadata ?? []);
      setRows(r.page.data ?? []);
      const n = r.page.data?.length ?? 0;
      setStatus({ queryId: "", completionStatus: "Finished", progress: 1, rowCount: n });
      setPartial(!r.done);
      setElapsedMs(performance.now() - t0);
    } catch (e) {
      if (runId.current === id) fail(e);
    } finally {
      if (runId.current === id) setRunning(false);
    }
  };

  const searchRoot = useCallback<RootSearch>(
    async (text, sqlParameters) => {
      if (!org) return [];
      try {
        const r = await api.queryRun(org.id, text, dataspace, 20, { sqlParameters });
        addWire(r.wire);
        return r.page.data ?? [];
      } catch (e) {
        if (e instanceof QueryCallError) addWire(e.wire);
        throw e;
      }
    },
    [org?.id, dataspace, addWire],
  );

  const closeRecord = useCallback(() => setSelected(null), []);

  const send = () => (mode === "sql" ? run() : read(mode));

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

  // A data graph opens its lookup form; a search index writes a search for you to finish; anything else is queried.
  const openObject = (o: QueryObject) => {
    if (o.type === "DG") {
      setForms((f) => ({ ...f, dataGraph: { ...f.dataGraph, graph: o.name } }));
      setMode("dataGraph");
      return;
    }
    setMode("sql");
    if (o.type === "SI") {
      const text = `SELECT * FROM ${o.searchFunction ?? "hybrid_search"}(TABLE(${o.name}), 'your search text', '', 10)`;
      setSql(searchWithChunks(text, catalog?.objects ?? []) ?? text);
      return;
    }
    const text = `SELECT * FROM ${o.name} LIMIT 100`;
    setSql(text);
    run(text);
  };

  // A double-clicked field: a starter query in an empty editor, else the next SELECT item (grouped too when the query
  // groups); at the cursor only when there is no SELECT ... FROM to add it to.
  const addField = (field: string, from?: string) => {
    setMode("sql");
    const next = !sql.trim() && from ? `SELECT ${field} FROM ${from} LIMIT 100` : addToSelect(sql, field, from);
    if (next !== null) setSql(next);
    else if (!insertAtCursor(editorBox.current, field)) setSql((s) => `${s}${s && !/\s$/.test(s) ? " " : ""}${field}`);
  };

  // The finished query's cached result, read again with SQL instead of rerunning it.
  const scanResult = () => {
    if (!status?.queryId) return;
    setMode("sql");
    setSql(`SELECT * FROM result_scan('${status.queryId}') LIMIT 100`);
  };

  // The loaded rows as the grid sorts and filters them; exports and the JSON view take them as shown.
  const numeric = useMemo(() => columns.map((c) => NUMERIC.test(c.type)), [columns]);
  const order = useMemo(() => viewRows(rows, numeric, filters, sort), [rows, numeric, filters, sort]);
  const shownRows = useMemo(() => (order.length === rows.length && !sort ? rows : order.map((i) => rows[i])), [order, rows, sort]);
  const filtered = filters.some((f) => f.trim());
  const selectedAt = selected === null ? -1 : order.indexOf(selected);

  const exportAs = (kind: "csv" | "xlsx") => {
    const names = columns.map((c) => c.name);
    const base = source;
    if (kind === "csv") download(`${base}.csv`, toCsv(names, shownRows), "text/csv;charset=utf-8");
    else download(`${base}.xlsx`, toXlsx(names, shownRows, base), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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
        onField={addField}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 px-6 pb-3 pt-5 lg:px-8">
          <div role="tablist" aria-label="Data 360 API" className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-tint p-[3px]">
            {MODES.map((m) => (
              <button
                key={m.mode}
                role="tab"
                aria-selected={mode === m.mode}
                onClick={() => setMode(m.mode)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${mode === m.mode ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div ref={editorBox} className="rounded-2xl border border-line bg-surface shadow-card focus-within:ring-2 focus-within:ring-action/50">
            {mode === "sql" ? (
              <>
                <SqlEditor value={sql} onChange={setSql} onRun={() => run()} objects={sqlObjects} />
                {params.length > 0 && (
                  <ParamRows
                    names={params}
                    values={paramValues}
                    onChange={(name, v) => setParamValues((p) => ({ ...p, [name]: { ...(p[name] ?? { type: "Varchar", value: "" }), ...v } }))}
                  />
                )}
                {showSettings && <SettingsRow settings={settings} onChange={setSettings} />}
              </>
            ) : (
              <ApiForm kind={mode} values={forms[mode]} onChange={(v) => setForms((f) => ({ ...f, [mode]: v }))} onSend={send} objects={catalog?.objects ?? []} search={searchRoot} />
            )}
            <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1">
              <span className="text-xs text-ink-3">
                <span className="font-mono">{mode === "sql" ? "POST /ssot/query-sql" : FORMS[mode].call}</span> · data space <span className="font-mono">{dataspace}</span>
              </span>
              {mode === "sql" && (
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  aria-expanded={showSettings}
                  title="Query settings: timeout, date style, locale"
                  className="ml-auto flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint"
                >
                  <SlidersHorizontal size={13} /> Settings
                  {Object.values(settings).some(Boolean) && <span className="h-1.5 w-1.5 rounded-full bg-action" />}
                </button>
              )}
              <button
                onClick={clear}
                disabled={running}
                title="Empty the editor or form and the results"
                className={`${mode === "sql" ? "" : "ml-auto"} flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint disabled:opacity-50`}
              >
                <Eraser size={13} /> Clear
              </button>
              <div className="relative">
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
                  onClick={send}
                  disabled={mode === "sql" && !sql.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-action px-3.5 py-1.5 text-xs font-semibold text-action-ink shadow-card hover:brightness-105 disabled:opacity-50"
                >
                  {mode === "sql" ? <Play size={13} /> : <Send size={13} />} {mode === "sql" ? "Run" : "Send"} <kbd className="font-sans font-normal opacity-70">⌘↵</kbd>
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
            shown={filtered ? order.length : undefined}
            columns={columns.length}
            running={running}
            canExport={shownRows.length > 0}
            onExport={exportAs}
            partial={partial}
            view={view}
            onView={columns.length ? setView : undefined}
            onScan={status?.queryId && !running && status.rowCount > 0 ? scanResult : undefined}
          />
        </div>

        {view === "json" && columns.length ? (
          <JsonView columns={columns} rows={shownRows} />
        ) : (
          <div className="mx-6 mb-6 flex min-h-0 flex-1 gap-3 lg:mx-8">
            <ResultsGrid
              columns={columns}
              rows={rows}
              numeric={numeric}
              order={order}
              sort={sort}
              onSort={setSort}
              filters={filters}
              onFilters={setFilters}
              running={running}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onMore={loadMore}
              remaining={status ? status.rowCount - rows.length : 0}
              selected={selected}
              onSelect={(i) => setSelected(i === selected ? null : i)}
            />
            {/* Previous and next step through the rows as shown; a row the filters hide closes. */}
            {selected !== null && selectedAt >= 0 && (
              <RecordPanel columns={columns} row={rows[selected]} index={selectedAt} count={order.length} onMove={(at) => setSelected(order[at])} onClose={closeRecord} />
            )}
          </div>
        )}
      </section>

      <CallPanel telemetry={telemetry} submit={submitEntry} wire={wire} />
    </div>
  );
}

// Inputs for the statement's named parameters: each is sent as {name, type, value} beside the SQL.
function ParamRows(p: { names: string[]; values: Record<string, { type: string; value: string }>; onChange: (name: string, v: Partial<{ type: string; value: string }>) => void }) {
  return (
    <div className="space-y-1.5 border-t border-line px-3 py-2">
      {p.names.map((name) => (
        <div key={name} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate font-mono font-semibold text-ink" title={`:${name}`}>
            :{name}
          </span>
          <select
            aria-label={`Type of :${name}`}
            value={p.values[name]?.type ?? "Varchar"}
            onChange={(e) => p.onChange(name, { type: e.target.value })}
            className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs"
          >
            {PARAM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            aria-label={`Value of :${name}`}
            value={p.values[name]?.value ?? ""}
            onChange={(e) => p.onChange(name, { value: e.target.value })}
            placeholder="value"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs outline-none focus:ring-2 focus:ring-action/50"
          />
        </div>
      ))}
    </div>
  );
}

// querySettings: how long the query may run and how date strings are read.
function SettingsRow({ settings, onChange }: { settings: Record<string, string>; onChange: (s: Record<string, string>) => void }) {
  const set = (k: string, v: string) => onChange({ ...settings, [k]: v });
  const timeout = settings.query_timeout ?? "";
  const [custom, setCustom] = useState(!TIMEOUTS.some(([ms]) => ms === timeout));
  const input = "rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs outline-none focus:ring-2 focus:ring-action/50";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-3 py-2 text-xs text-ink-2">
      <label className="flex items-center gap-1.5">
        Timeout
        <select
          value={custom ? "custom" : timeout}
          onChange={(e) => {
            setCustom(e.target.value === "custom");
            if (e.target.value !== "custom") set("query_timeout", e.target.value);
          }}
          className={input}
        >
          {TIMEOUTS.map(([ms, label]) => (
            <option key={ms} value={ms}>
              {label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {custom && (
          <input
            aria-label="Timeout in milliseconds"
            value={timeout}
            onChange={(e) => set("query_timeout", e.target.value.replace(/\D/g, ""))}
            placeholder="ms, e.g. 1800000"
            inputMode="numeric"
            autoFocus
            className={`${input} w-32`}
          />
        )}
      </label>
      <label className="flex items-center gap-1.5">
        Date style
        <select value={settings.date_style ?? ""} onChange={(e) => set("date_style", e.target.value)} className={input}>
          {DATE_STYLES.map((d) => (
            <option key={d} value={d}>
              {d || "default"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        Date locale
        <select value={settings.lc_time ?? ""} onChange={(e) => set("lc_time", e.target.value)} className={input}>
          {LOCALES.map(([code, label]) => (
            <option key={code} value={code}>
              {code ? `${label} · ${code}` : label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// The headline numbers stay in view next to the grid too, for widths where the Call panel is hidden.
function ResultBar(p: {
  status: QueryStatus | null;
  loaded: number;
  shown?: number; // with column filters on, how many loaded rows they keep
  columns: number;
  running: boolean;
  canExport: boolean;
  onExport: (k: "csv" | "xlsx") => void;
  partial: boolean;
  view: "grid" | "json";
  onView?: (v: "grid" | "json") => void;
  onScan?: () => void;
}) {
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
          {p.shown !== undefined && (
            <>
              {" "}· <span className="font-mono font-semibold text-action">{p.shown.toLocaleString()}</span> match the filters
            </>
          )}
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
      {p.partial && !p.running && <span className="text-xs text-ink-3">more on the server · raise Batch size or page with Offset</span>}
      {(p.canExport || p.onView || p.onScan) && (
        <span className="ml-auto flex flex-wrap gap-1.5">
          {p.onScan && (
            <button
              onClick={p.onScan}
              title="Write SQL over this cached result with result_scan, without rerunning the query"
              className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-tint"
            >
              <Repeat size={13} /> Query this result
            </button>
          )}
          {p.onView && (
            <span className="inline-flex gap-0.5 rounded-xl bg-tint p-[3px]">
              {(["grid", "json"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => p.onView!(v)}
                  aria-pressed={p.view === v}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${p.view === v ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
                >
                  {v === "grid" ? "Grid" : "JSON"}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
      {p.canExport && (
        <span className="flex gap-1.5">
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
  numeric: boolean[];
  order: number[]; // the rows to show, sorted and filtered, as indexes into rows
  sort: GridSort | null;
  onSort: (s: GridSort | null) => void;
  filters: string[];
  onFilters: (f: string[]) => void;
  running: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  remaining: number;
  onMore: () => void;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  if (!p.columns.length) return <div className="flex-1" />;
  const { numeric } = p;
  // A header click sorts up, then down, then back to the loaded order.
  const cycle = (j: number) => p.onSort(p.sort?.col !== j ? { col: j, desc: false } : p.sort.desc ? null : { col: j, desc: true });
  const setFilter = (j: number, v: string) => p.onFilters(p.columns.map((_, k) => (k === j ? v : (p.filters[k] ?? ""))));
  const filtered = p.filters.some((f) => f.trim());
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-line bg-surface">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-10 bg-tint px-2 pt-2 text-right font-mono font-normal text-ink-3">#</th>
            {p.columns.map((c, j) => {
              const on = p.sort?.col === j;
              return (
                <th
                  key={c.name}
                  aria-sort={on ? (p.sort!.desc ? "descending" : "ascending") : "none"}
                  className={`whitespace-nowrap bg-tint p-0 font-semibold ${numeric[j] ? "text-right" : "text-left"}`}
                >
                  <button
                    onClick={() => cycle(j)}
                    title={`${c.type}${c.nullable === false ? " · not null" : ""} · click to sort`}
                    className={`group flex w-full items-start gap-1 px-3 pt-2 hover:text-action ${numeric[j] ? "flex-row-reverse text-right" : "text-left"}`}
                  >
                    <span>
                      <span className="block font-mono text-ink group-hover:text-action">{c.name}</span>
                      <span className="block font-sans font-normal text-ink-3">{c.type}</span>
                    </span>
                    {on ? (
                      p.sort!.desc ? <ArrowDown size={12} className="mt-0.5 shrink-0 text-action" /> : <ArrowUp size={12} className="mt-0.5 shrink-0 text-action" />
                    ) : (
                      <ArrowUp size={12} className="mt-0.5 shrink-0 text-ink-3 opacity-0 group-hover:opacity-60" />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-tint px-1 py-1.5 text-right">
              {filtered && (
                <button onClick={() => p.onFilters([])} title="Clear the filters" aria-label="Clear the filters" className="rounded p-0.5 text-ink-3 hover:bg-surface hover:text-ink">
                  <X size={12} />
                </button>
              )}
            </th>
            {p.columns.map((c, j) => (
              <th key={c.name} className="border-b border-line bg-tint px-2 pb-1.5 pt-1 font-normal">
                <input
                  value={p.filters[j] ?? ""}
                  onChange={(e) => setFilter(j, e.target.value)}
                  placeholder={numeric[j] ? "> 0, = …" : "contains…"}
                  title={
                    numeric[j]
                      ? "Filter: a number, or > >= < <= = != and a number. = alone keeps empty cells."
                      : "Filter: text it contains, or = != > < and a value (dates compare in order). = alone keeps empty cells."
                  }
                  aria-label={`Filter ${c.name}`}
                  spellCheck={false}
                  autoComplete="off"
                  className={`w-full min-w-16 rounded-md border bg-surface px-1.5 py-0.5 font-mono text-xs font-normal text-ink outline-none placeholder:font-sans placeholder:text-ink-3 focus:ring-2 focus:ring-action/50 ${
                    p.filters[j]?.trim() ? "border-action" : "border-line"
                  } ${numeric[j] ? "text-right" : ""}`}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.order.map((i, at) => {
            const r = p.rows[i];
            return (
              // A click opens the row in the record panel, a second click closes it.
              <tr key={i} onClick={() => p.onSelect(i)} aria-selected={p.selected === i} className={`cursor-pointer ${p.selected === i ? "bg-tint" : "hover:bg-tint/70"}`}>
                <td className={`sticky left-0 border-b border-line px-2 py-1.5 text-right font-mono ${p.selected === i ? "bg-tint font-semibold text-ink" : "bg-surface text-ink-3"}`}>{at + 1}</td>
                {r.map((v, j) => (
                  <td key={j} className={`max-w-[28rem] truncate border-b border-line px-3 py-1.5 font-mono ${numeric[j] ? "text-right" : ""}`} title={v === null ? "null" : String(v)}>
                    {v === null || v === undefined ? <span className="text-ink-3">null</span> : typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!p.rows.length && !p.running && <p className="p-6 text-center text-sm text-ink-3">No rows.</p>}
      {p.rows.length > 0 && !p.order.length && (
        <p className="sticky left-0 p-6 text-center text-sm text-ink-3">
          No loaded rows match the filters.{" "}
          <button onClick={() => p.onFilters([])} className="font-semibold text-action hover:underline">
            Clear them
          </button>
        </p>
      )}
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

// The rows as records, nested data graph objects included, for results the grid flattens.
function JsonView({ columns, rows }: { columns: QueryColumn[]; rows: unknown[][] }) {
  const records = rows.slice(0, JSON_MAX).map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i] ?? null])));
  return (
    <div className="mx-6 mb-6 min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-console lg:mx-8">
      <pre className="whitespace-pre-wrap break-all p-4 font-mono text-xs text-console-ink">{JSON.stringify(records, null, 2)}</pre>
      {rows.length > JSON_MAX && <p className="px-4 pb-4 text-xs text-console-ink/70">First {JSON_MAX} of {rows.length.toLocaleString()} rows.</p>}
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
