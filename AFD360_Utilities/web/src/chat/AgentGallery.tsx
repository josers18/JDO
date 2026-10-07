import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Search } from "lucide-react";
import { api } from "../api";
import type { Agent } from "../../../shared/types";

type TypeFilter = "all" | "employee" | "service";

// Service agents run as their own agent user; employee agents must run as the app's Run As user.
const defaultBypass = (a: Agent) => a.agentType === "EinsteinServiceAgent";

const TYPE_LABEL: Record<string, string> = {
  AgentforceEmployeeAgent: "Employee",
  EinsteinServiceAgent: "Service",
  Employee: "Default assistant",
};

const matchesType = (a: Agent, f: TypeFilter) =>
  f === "all" || (f === "service" ? a.agentType === "EinsteinServiceAgent" : a.agentType !== "EinsteinServiceAgent");

export function AgentGallery({
  orgId,
  orgName,
  onCancel,
  onStart,
}: {
  orgId: string;
  orgName: string;
  onCancel?: () => void;
  onStart: (agent: Agent, bypassUser: boolean) => Promise<void>;
}) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [bypass, setBypass] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setAgents(null);
    setSelected(null);
    api.agents(orgId).then(setAgents).catch((e) => setError((e as Error).message));
  }, [orgId]);

  const usable = (a: Agent) => a.active && a.supported;
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return (agents ?? [])
      .filter((a) => showUnavailable || usable(a))
      .filter((a) => matchesType(a, type))
      .filter((a) => !q || `${a.label} ${a.id} ${a.developerName}`.toLowerCase().includes(q))
      .sort((a, b) => Number(usable(b)) - Number(usable(a)) || a.label.localeCompare(b.label));
  }, [agents, query, type, showUnavailable]);
  const hiddenCount = (agents ?? []).filter((a) => !usable(a)).length;

  const start = async () => {
    if (!selected) return;
    setStarting(true);
    setStartError(null);
    try {
      await onStart(selected, bypass);
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
        <div className="mx-auto w-full max-w-[88rem]">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">New chat · {orgName}</p>
          <h1 className="text-xl font-semibold">Pick an agent</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-sky-500">
              <Search size={15} className="text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, API name or ID…"
                className="w-full py-2 text-sm focus:outline-none"
              />
            </div>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {(["all", "employee", "service"] as TypeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setType(f)}
                  className={`rounded-md px-3 py-1.5 text-xs capitalize ${type === f ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
              Show unavailable ({hiddenCount})
            </label>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-10">
        <div className="mx-auto w-full max-w-[88rem]">
          {!agents && !error && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading agents…
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {agents && filtered.length === 0 && <p className="text-sm text-slate-500">No agents match.</p>}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
            {filtered.map((a) => {
              const ok = usable(a);
              const reason = !a.supported ? "Not supported by Agent API" : !a.active ? "Inactive" : null;
              const isSelected = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  disabled={!ok}
                  onClick={() => {
                    setSelected(a);
                    setBypass(defaultBypass(a));
                  }}
                  onDoubleClick={() => ok && onStart(a, defaultBypass(a))}
                  className={`flex items-start gap-3 rounded-xl border bg-white p-4 text-left transition ${
                    isSelected
                      ? "border-sky-500 ring-2 ring-sky-200"
                      : ok
                        ? "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        : "cursor-not-allowed border-slate-200 opacity-50"
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <Bot size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-medium text-slate-900">{a.label}</div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{a.id}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {TYPE_LABEL[a.agentType] ?? a.agentType}
                      </span>
                      {reason ? (
                        <span className="text-[11px] text-slate-500">{reason}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-6 py-3 lg:px-10">
        <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 text-sm">
            {selected ? (
              <>
                <span className="font-medium">{selected.label}</span>
                <span className="ml-2 font-mono text-xs text-slate-500">{selected.id}</span>
              </>
            ) : (
              <span className="text-slate-500">Select an agent (double-click to start right away)</span>
            )}
            {startError && <div className="text-xs text-red-600">{startError}</div>}
          </div>
          <label
            className="flex items-center gap-2 text-sm text-slate-600"
            title="bypassUser: run as the agent's assigned user instead of the app's Run As user"
          >
            <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} disabled={!selected} />
            Run as agent user
          </label>
          {onCancel && (
            <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
              Cancel
            </button>
          )}
          <button
            onClick={start}
            disabled={!selected || starting}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {starting && <Loader2 size={14} className="animate-spin" />}
            Start session
          </button>
        </div>
      </div>
    </div>
  );
}
