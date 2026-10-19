import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eraser, Loader2, Play, PlayCircle, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { api } from "../api";
import { CellEditor } from "./CellEditor";
import { WirePanel } from "../chat/WirePanel";
import type { KernelStatus, NotebookOutput, OrgsResponse, WireEntry } from "../../../shared/types";

interface Cell {
  id: string;
  code: string;
  count?: number; // execution count of the last run
  outputs: NotebookOutput[];
  running?: boolean;
  queued?: boolean;
  durationMs?: number;
  calls?: number;
  ok?: boolean;
}

const STARTER = [
  `# The Data Cloud Python connector (salesforce-cdp-connector), signed in with the active org's External Client App.
# \`org\` comes from Admin → Orgs; its secret never prints.
# Its DeprecationWarning points to salesforce-datacloud-connector, still in beta and without client credentials on PyPI.
from salesforcecdpconnector.connection import SalesforceCDPConnection

conn = SalesforceCDPConnection(org.login_url, client_id=org.client_id, client_secret=org.client_secret)
org`,
  `df = conn.get_pandas_dataframe("""
    SELECT FinServ_RiskTolerance_c__c AS risk_tolerance, COUNT(*) AS accounts
    FROM UnifiedssotAccountAcc__dlm
    GROUP BY 1
    ORDER BY 2 DESC
""")
df`,
  `ax = df.plot.barh(x="risk_tolerance", y="accounts", legend=False)
ax.invert_yaxis()
ax.set_title("Unified accounts by risk tolerance")
ax.set_xlabel("Accounts")`,
];

const cellsKey = (orgId: string) => `afd360.notebook.cells.${orgId}`;
const newCell = (code = ""): Cell => ({ id: crypto.randomUUID(), code, outputs: [] });
const starter = () => STARTER.map((code) => newCell(code));

// Only the code is saved: outputs belong to a kernel run, and images would fill localStorage.
function readCells(orgId: string): Cell[] {
  try {
    const saved = JSON.parse(localStorage.getItem(cellsKey(orgId)) ?? "null") as string[] | null;
    return saved?.length ? saved.map((code) => newCell(code)) : starter();
  } catch {
    return starter();
  }
}

// pandas tables ship their own <style>; the theme styles them instead.
const html = (data: string) => data.replace(/<style[\s\S]*?<\/style>/gi, "");

export function NotebookModule({ orgs, onOpenAdmin }: { orgs: OrgsResponse; onOpenAdmin: () => void }) {
  const org = orgs.orgs.find((o) => o.id === orgs.activeOrgId) ?? null;
  const [cells, setCells] = useState<Cell[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [kernel, setKernel] = useState<KernelStatus | null>(null);
  const [wire, setWire] = useState<WireEntry[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const stopAll = useRef(false);

  const refreshKernel = useCallback(() => {
    if (org) api.notebookStatus(org.id).then(setKernel).catch(() => setKernel(null));
  }, [org?.id]);

  // Org switch: its cells, a fresh wire, and its kernel started.
  useEffect(() => {
    if (!org) return;
    const loaded = readCells(org.id);
    setCells(loaded);
    setSelected(loaded[0]?.id ?? null);
    setWire([]);
    setKernel(null);
    refreshKernel();
  }, [org?.id, refreshKernel]);

  // A kernel that is still starting reports ready a moment later.
  useEffect(() => {
    if (kernel?.state !== "starting") return;
    const t = setTimeout(refreshKernel, 700);
    return () => clearTimeout(t);
  }, [kernel, refreshKernel]);

  useEffect(() => {
    if (org && cells.length) localStorage.setItem(cellsKey(org.id), JSON.stringify(cells.map((c) => c.code)));
  }, [cells, org?.id]);

  const patch = (id: string, p: Partial<Cell>) => setCells((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const runCell = useCallback(
    async (id: string) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!org || !cell) return false;
      patch(id, { running: true, queued: false, outputs: [] });
      setKernel((k) => (k ? { ...k, state: "busy" } : k));
      try {
        const r = await api.notebookRun(org.id, cell.code);
        patch(id, { running: false, count: r.count, outputs: r.outputs, durationMs: r.durationMs, calls: r.wire.length, ok: r.ok });
        setWire((w) => [...w, ...r.wire]);
        return r.ok;
      } catch (e) {
        const msg = (e as Error).message;
        patch(id, { running: false, ok: false, outputs: [{ type: "error", ename: "Error", evalue: msg, traceback: msg }] });
        return false;
      } finally {
        refreshKernel();
      }
    },
    [org?.id, refreshKernel],
  );

  const runAndAdvance = (id: string, advance: boolean) => {
    runCell(id);
    if (!advance) return;
    const i = cellsRef.current.findIndex((c) => c.id === id);
    const next = cellsRef.current[i + 1];
    if (next) {
      setSelected(next.id);
      setFocusId(next.id);
    } else {
      const c = newCell();
      setCells((cs) => [...cs, c]);
      setSelected(c.id);
      setFocusId(c.id);
    }
  };

  // Top to bottom, stopping at the first error like Jupyter's Run All.
  const runAll = async () => {
    stopAll.current = false;
    setRunningAll(true);
    const ids = cellsRef.current.map((c) => c.id);
    setCells((cs) => cs.map((c) => ({ ...c, queued: true })));
    for (const id of ids) {
      if (stopAll.current || !(await runCell(id))) break;
    }
    setCells((cs) => cs.map((c) => ({ ...c, queued: false })));
    setRunningAll(false);
  };

  const interrupt = () => {
    stopAll.current = true;
    if (org) api.notebookInterrupt(org.id);
  };

  const restart = async () => {
    if (!org) return;
    stopAll.current = true;
    setWire([]);
    setCells((cs) => cs.map((c) => ({ ...c, count: undefined, outputs: [], durationMs: undefined, calls: undefined, ok: undefined })));
    setKernel(await api.notebookRestart(org.id));
  };

  const addBelow = (id: string | null) => {
    const c = newCell();
    setCells((cs) => {
      const i = id ? cs.findIndex((x) => x.id === id) : cs.length - 1;
      return [...cs.slice(0, i + 1), c, ...cs.slice(i + 1)];
    });
    setSelected(c.id);
    setFocusId(c.id);
  };

  const move = (id: string, by: number) =>
    setCells((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const j = i + by;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (id: string) => setCells((cs) => (cs.length > 1 ? cs.filter((c) => c.id !== id) : [newCell()]));

  const resetStarter = () => {
    if (!confirm("Replace the cells with the starter notebook?")) return;
    const s = starter();
    setCells(s);
    setSelected(s[0].id);
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

  const busy = cells.some((c) => c.running) || kernel?.state === "busy";
  const selectedCount = cells.find((c) => c.id === selected)?.count ?? null;
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-tint hover:text-ink disabled:opacity-40";

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-6 py-3 lg:px-8">
          <h1 className="text-[17px] font-semibold leading-tight">Notebook</h1>
          <span className="text-sm text-ink-3">{org.name}</span>
          <KernelPill status={kernel} busy={busy} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <button onClick={runAll} disabled={runningAll || kernel?.state === "missing"} className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-action-ink shadow-card disabled:opacity-50">
              <PlayCircle size={14} /> Run all
            </button>
            <button onClick={interrupt} disabled={!busy} title="Interrupt the running cell (KeyboardInterrupt)" className={btn}>
              <Square size={13} /> Interrupt
            </button>
            <button onClick={restart} title="Restart the kernel: a fresh namespace, outputs cleared" className={btn}>
              <RotateCcw size={13} /> Restart
            </button>
            <button onClick={() => setCells((cs) => cs.map((c) => ({ ...c, outputs: [] })))} title="Clear all outputs" className={btn}>
              <Eraser size={13} /> Clear
            </button>
            <button onClick={resetStarter} title="Replace the cells with the starter notebook" className={btn}>
              Starter
            </button>
          </div>
        </header>

        {kernel?.state === "missing" && (
          <div className="mx-6 mt-4 rounded-xl border border-recv-line bg-recv px-4 py-3 text-sm text-recv-ink lg:mx-8">
            No Python environment yet. In <span className="font-mono">AFD360_Utilities/</span>, run{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">{kernel.setupCommand}</code>, then click Restart.
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 lg:px-8">
          {cells.map((c, i) => (
            <CellView
              key={c.id}
              cell={c}
              selected={c.id === selected}
              autoFocus={c.id === focusId}
              first={i === 0}
              last={i === cells.length - 1}
              onSelect={() => setSelected(c.id)}
              onChange={(code) => patch(c.id, { code })}
              onRun={(advance) => runAndAdvance(c.id, advance)}
              onMove={(by) => move(c.id, by)}
              onAdd={() => addBelow(c.id)}
              onRemove={() => remove(c.id)}
            />
          ))}
          <button onClick={() => addBelow(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-tint hover:text-ink">
            <Plus size={13} /> Code cell
          </button>
          <p className="text-xs text-ink-3">Shift+Enter runs a cell and moves to the next · ⌘/Ctrl+Enter runs it in place · cells share one Python kernel</p>
        </div>
      </section>

      <aside className="hidden w-[24rem] shrink-0 flex-col border-l border-line bg-surface lg:flex xl:w-[28rem]">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h2 className="flex-1 text-[17px] font-semibold leading-tight">Wire</h2>
          <span className="text-xs text-ink-3">{selectedCount !== null ? `cell [${selectedCount}] highlighted` : `${wire.length} calls`}</span>
        </div>
        <div className="min-h-0 flex-1">
          <WirePanel wire={wire} highlightTurn={selectedCount} title="notebook" />
        </div>
      </aside>
    </div>
  );
}

function KernelPill({ status, busy }: { status: KernelStatus | null; busy: boolean }) {
  const state = busy ? "busy" : (status?.state ?? "starting");
  const label = { missing: "No Python", stopped: "Stopped", starting: "Starting", idle: "Idle", busy: "Busy" }[state];
  const dot = state === "idle" ? "bg-ok" : state === "busy" || state === "starting" ? "animate-pulse bg-live" : "bg-err";
  return (
    <span title={status?.python ? `Python ${status.python}` : undefined} className="inline-flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-ink-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      Python{status?.python ? ` ${status.python}` : ""} · {label}
    </span>
  );
}

interface CellProps {
  cell: Cell;
  selected: boolean;
  autoFocus: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onChange: (code: string) => void;
  onRun: (advance: boolean) => void;
  onMove: (by: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}

function CellView({ cell, selected, autoFocus, first, last, onSelect, onChange, onRun, onMove, onAdd, onRemove }: CellProps) {
  const prompt = cell.running ? "*" : cell.queued ? "·" : (cell.count ?? " ");
  const icon = "rounded-md p-1 text-ink-3 hover:bg-tint hover:text-ink disabled:opacity-30";
  return (
    <div onMouseDown={onSelect} className="group flex gap-3">
      <div className="w-12 shrink-0 pt-2.5 text-right font-mono text-xs text-ink-3" aria-label={`Execution ${prompt}`}>
        [{prompt}]
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`overflow-hidden rounded-xl border bg-surface shadow-card ${
            selected ? "border-action/60 ring-2 ring-action/25" : cell.ok === false ? "border-err/50" : "border-line"
          }`}
        >
          <div className="flex items-start">
            <button onClick={() => onRun(false)} disabled={cell.running} title="Run (⌘/Ctrl+Enter)" aria-label="Run cell" className="m-1.5 rounded-lg p-1.5 text-ink-2 hover:bg-tint hover:text-action disabled:opacity-40">
              {cell.running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              <CellEditor value={cell.code} onChange={onChange} onRun={onRun} onFocus={onSelect} autoFocus={autoFocus} />
            </div>
            <div className={`m-1.5 flex items-center gap-0.5 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
              <button onClick={() => onMove(-1)} disabled={first} title="Move up" aria-label="Move up" className={icon}>
                <ArrowUp size={14} />
              </button>
              <button onClick={() => onMove(1)} disabled={last} title="Move down" aria-label="Move down" className={icon}>
                <ArrowDown size={14} />
              </button>
              <button onClick={onAdd} title="Add a cell below" aria-label="Add a cell below" className={icon}>
                <Plus size={14} />
              </button>
              <button onClick={onRemove} title="Delete cell" aria-label="Delete cell" className={icon}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
        {(cell.outputs.length > 0 || cell.durationMs !== undefined) && (
          <div className="mt-1.5 space-y-2 px-1">
            {cell.outputs.map((o, i) => (
              <Output key={i} out={o} />
            ))}
            {cell.durationMs !== undefined && (
              <div className="text-xs text-ink-3">
                {(cell.durationMs / 1000).toFixed(2)} s{cell.calls ? ` · ${cell.calls} HTTP call${cell.calls === 1 ? "" : "s"} in the Wire panel` : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Output({ out }: { out: NotebookOutput }) {
  if (out.type === "stream")
    return (
      <pre className={`overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed ${out.name === "stderr" ? "rounded-lg bg-recv px-3 py-2 text-recv-ink" : "text-ink"}`}>
        {out.text}
      </pre>
    );
  if (out.type === "error")
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-err/40 bg-err/10 px-3 py-2 font-mono text-xs leading-relaxed text-ink">
        {out.traceback}
      </pre>
    );
  if (out.mime === "image/png") return <img src={`data:image/png;base64,${out.data}`} alt="Figure" className="w-full max-w-[40rem] rounded-lg border border-line bg-white" />;
  if (out.mime === "text/html")
    return (
      <div
        className="max-h-[28rem] w-fit max-w-full overflow-auto rounded-lg border border-line bg-surface text-xs [&_table]:w-max [&_table]:border-collapse [&_tbody_tr:nth-child(even)]:bg-tint [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-1.5 [&_td]:font-mono [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-surface [&>p]:px-3 [&>p]:py-1.5 [&>p]:text-ink-3"
        dangerouslySetInnerHTML={{ __html: html(out.data) }}
      />
    );
  return <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">{out.data}</pre>;
}
