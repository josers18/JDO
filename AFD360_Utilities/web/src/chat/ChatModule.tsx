import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PanelRightClose, PanelRightOpen, Plus, Power, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import { api, streamTurn, type TurnRequest } from "../api";
import { AgentGallery } from "./AgentGallery";
import { MessageView, Parts } from "./MessageView";
import { WirePanel } from "./WirePanel";
import type { AppEvent, Conversation, ConversationSummary, OrgsResponse, Part, Tool } from "../../../shared/types";

interface Draft {
  progress: string[];
  segments: Record<number, { kind: "text"; text: string } | { kind: "tools"; tools: Tool[] } | { kind: "part"; part: Part }>;
}

function draftParts(d: Draft): Part[] {
  const parts: Part[] = d.progress.map((text) => ({ kind: "progress", text }));
  for (const key of Object.keys(d.segments).map(Number).sort((a, b) => a - b)) {
    const s = d.segments[key];
    parts.push(s.kind === "text" ? { kind: "text", markdown: s.text } : s.kind === "tools" ? { kind: "tools", tools: s.tools } : s.part);
  }
  return parts;
}

function applyEvent(d: Draft, e: AppEvent): Draft {
  if (e.type === "progress") return { ...d, progress: [...d.progress, e.text] };
  if (e.type === "text-delta") {
    const cur = d.segments[e.segment];
    const text = (cur?.kind === "text" ? cur.text : "") + e.text;
    return { ...d, segments: { ...d.segments, [e.segment]: { kind: "text", text } } };
  }
  if (e.type === "tool") {
    const cur = d.segments[e.segment];
    const tools = cur?.kind === "tools" ? cur.tools.filter((t) => t.id !== e.tool.id) : [];
    return { ...d, segments: { ...d.segments, [e.segment]: { kind: "tools", tools: [...tools, e.tool] } } };
  }
  if (e.type === "part") return { ...d, segments: { ...d.segments, [e.segment]: { kind: "part", part: e.part } } };
  return d;
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const statusDot: Record<string, string> = { live: "bg-emerald-500", expired: "bg-amber-400", ended: "bg-slate-300" };

const WIRE_MIN = 320;
const wireMax = () => Math.max(WIRE_MIN, Math.round(window.innerWidth * 0.6));
const clampWire = (w: number) => Math.min(wireMax(), Math.max(WIRE_MIN, w));

function useIsNarrow() {
  const query = "(max-width: 1023px)";
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function ChatModule({
  orgs,
  onSwitchOrg,
  onOpenAdmin,
}: {
  orgs: OrgsResponse;
  onSwitchOrg: (id: string) => Promise<void>;
  onOpenAdmin: () => void;
}) {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [picking, setPicking] = useState(false);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const narrow = useIsNarrow();
  const [panelOpen, setPanelOpen] = useState(() => !matchMedia("(max-width: 1023px)").matches);
  const [wireWidth, setWireWidth] = useState(() =>
    clampWire(Number(localStorage.getItem("afd360.wireWidth")) || Math.round(window.innerWidth * 0.3)),
  );
  const [hoverTurn, setHoverTurn] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = useNow(5000);

  const activeOrg = orgs.orgs.find((o) => o.id === orgs.activeOrgId) ?? null;
  const convOrg = orgs.orgs.find((o) => o.id === conv?.orgId) ?? activeOrg;
  const orgList = list.filter((c) => c.orgId === orgs.activeOrgId);
  const showGallery = picking || !conv;

  const reloadList = useCallback(() => api.conversations().then(setList), []);
  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conv?.messages.length, draft]);

  useEffect(() => {
    if (narrow) setPanelOpen(false);
  }, [narrow]);

  // Drag the Wire panel's left edge to resize; width is remembered.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => setWireWidth(clampWire(window.innerWidth - ev.clientX));
    const up = () => {
      removeEventListener("mousemove", move);
      removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      setWireWidth((w) => {
        localStorage.setItem("afd360.wireWidth", String(w));
        return w;
      });
    };
    document.body.style.userSelect = "none";
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
  };

  const open = async (id: string) => {
    if (draft) return;
    setPicking(false);
    setConv(await api.conversation(id));
  };

  const start = async (agent: { id: string; label: string; agentType: string }, bypassUser: boolean) => {
    if (!activeOrg) return;
    const c = await api.createConversation({
      orgId: activeOrg.id,
      agentId: agent.id,
      agentLabel: agent.label,
      agentType: agent.agentType,
      bypassUser,
    });
    setConv(c);
    setPicking(false);
    reloadList();
  };

  const send = async () => {
    const text = input.trim();
    if (!conv || !text || draft) return;
    setInput("");
    await runTurn({ kind: "text", text });
  };

  const decide = (decision: "approve" | "reject", toolIds?: string[]) => runTurn({ kind: "confirm", decision, toolIds });

  const runTurn = async (turn: TurnRequest) => {
    if (!conv || draft) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ progress: [], segments: {} });
    const id = conv.id;
    try {
      await streamTurn(
        id,
        turn,
        (e) => {
          if (e.type === "user-message") setConv((c) => (c ? { ...c, messages: [...c.messages, e.message] } : c));
          else if (e.type === "wire")
            setConv((c) => {
              if (!c) return c;
              const i = c.wire.findIndex((w) => w.id === e.entry.id);
              const wire = i >= 0 ? c.wire.map((w, j) => (j === i ? e.entry : w)) : [...c.wire, e.entry];
              return { ...c, wire };
            });
          else setDraft((d) => (d ? applyEvent(d, e) : d));
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) alert((e as Error).message);
    } finally {
      abortRef.current = null;
      // Server state is the source of truth once the turn ends (final message, status, sequence id).
      const fresh = await api.conversation(id).catch(() => null);
      setDraft(null);
      if (fresh) setConv(fresh);
      reloadList();
    }
  };

  const sessionAction = async (fn: (id: string) => Promise<Conversation>) => {
    if (!conv) return;
    setActionBusy(true);
    try {
      setConv(await fn(conv.id));
      reloadList();
    } finally {
      setActionBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this conversation? Its session is ended and the transcript removed.")) return;
    await api.deleteConversation(id);
    if (conv?.id === id) setConv(null);
    reloadList();
  };

  if (!activeOrg) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p>No org configured yet.</p>
        <button onClick={onOpenAdmin} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">
          Add an org in Admin
        </button>
      </div>
    );
  }

  const headerButton =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="relative flex h-full">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white xl:w-72 2xl:w-80">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <select
            value={activeOrg.id}
            onChange={(e) => {
              setConv(null);
              onSwitchOrg(e.target.value);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {orgs.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setPicking(true)}
            disabled={Boolean(draft)}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              showGallery ? "bg-sky-100 text-sky-800" : "bg-sky-600 text-white hover:bg-sky-700"
            }`}
          >
            <Plus size={16} /> New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {orgList.length === 0 && <p className="p-3 text-xs text-slate-400">No conversations in this org yet.</p>}
          {orgList.map((c) => (
            <div
              key={c.id}
              onClick={() => open(c.id)}
              title={c.title}
              className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 ${
                !showGallery && conv?.id === c.id ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot[c.status]}`} title={c.status} />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 break-words text-sm">{c.title}</div>
                <div className="text-[11px] text-slate-500">
                  {c.agentLabel} · {plural(c.turns, "turn")} · {ago(c.updatedAt, now)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
                className="invisible text-slate-400 hover:text-red-600 group-hover:visible"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Middle: agent gallery or thread */}
      <section className="flex min-w-0 flex-1 flex-col">
        {showGallery ? (
          <AgentGallery
            orgId={activeOrg.id}
            orgName={activeOrg.name}
            onCancel={conv ? () => setPicking(false) : undefined}
            onStart={start}
          />
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-6 py-3 lg:px-10">
              <div className="min-w-56 flex-1">
                <div className="font-semibold">{conv.agentLabel}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusDot[conv.status]}`} />
                    <span className="capitalize">{conv.status}</span>
                  </span>
                  <span>· {plural(conv.turns, "turn")}</span>
                  {conv.session && <span>· idle {ago(conv.session.lastActivityAt, now)}</span>}
                  {conv.session && (
                    <span className="font-mono" title="Agent API session id">
                      · session {conv.session.id}
                    </span>
                  )}
                  <span className="font-mono" title="Agent id">
                    · agent {conv.agentId}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {conv.status === "live" && (
                  <button onClick={() => sessionAction(api.endSession)} disabled={actionBusy || Boolean(draft)} className={headerButton}>
                    <Power size={13} /> End session
                  </button>
                )}
                <button onClick={() => sessionAction(api.newSession)} disabled={actionBusy || Boolean(draft)} className={headerButton}>
                  {actionBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} New session
                </button>
                <button onClick={() => setPanelOpen(!panelOpen)} className={headerButton} title="Toggle Wire panel">
                  {panelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Wire
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[88rem] space-y-5 px-6 py-6 lg:px-10">
                {conv.messages.map((m) => (
                  <MessageView
                    key={m.id}
                    message={m}
                    myDomain={convOrg?.myDomain ?? ""}
                    onHover={setHoverTurn}
                    onConfirm={conv.status === "live" && !draft ? decide : undefined}
                  />
                ))}
                {draft && (
                  <div>
                    <Parts parts={draftParts(draft)} myDomain={convOrg?.myDomain ?? ""} streaming />
                    {draftParts(draft).length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> Thinking…
                      </div>
                    )}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-3 lg:px-10">
              <div className="mx-auto flex w-full max-w-[88rem] items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-sky-500">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  disabled={conv.status !== "live"}
                  placeholder={conv.status === "live" ? `Message ${conv.agentLabel}…` : "Session is not live — start a new session"}
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus:outline-none disabled:text-slate-400"
                />
                {draft ? (
                  <button onClick={() => abortRef.current?.abort()} className="rounded-xl bg-slate-800 p-2 text-white" title="Stop">
                    <Square size={16} />
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim() || conv.status !== "live"}
                    className="rounded-xl bg-sky-600 p-2 text-white disabled:opacity-40"
                    title="Send"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Wire panel: docked + resizable on wide screens, slide-over on narrow ones */}
      {conv && !showGallery && panelOpen && (
        <aside
          style={{ width: narrow ? "min(92vw, 34rem)" : wireWidth }}
          className={`flex shrink-0 flex-col border-l border-slate-200 bg-slate-50 ${
            narrow ? "absolute inset-y-0 right-0 z-10 shadow-2xl" : "relative"
          }`}
        >
          {!narrow && (
            <div
              onMouseDown={startResize}
              onDoubleClick={() => {
                const w = clampWire(Math.round(window.innerWidth * 0.3));
                setWireWidth(w);
                localStorage.setItem("afd360.wireWidth", String(w));
              }}
              title="Drag to resize · double-click to reset"
              className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-sky-300/60"
            />
          )}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Wire</div>
              <div className="text-[11px] text-slate-500">Every Salesforce call for this conversation · tokens masked</div>
            </div>
            <button onClick={() => setPanelOpen(false)} className="p-1 text-slate-500 hover:text-slate-800" title="Close Wire panel">
              <PanelRightClose size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <WirePanel wire={conv.wire} highlightTurn={hoverTurn} title={conv.title} />
          </div>
        </aside>
      )}
    </div>
  );
}
