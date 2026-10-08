import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, PanelRightClose, PanelRightOpen, Plus, Power, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import { api, streamTurn, type TurnRequest } from "../api";
import { AgentGallery } from "./AgentGallery";
import { AgentCard, MessageView, Parts } from "./MessageView";
import { WirePanel } from "./WirePanel";
import { TurnStats } from "./TurnStats";
import { SourcesPanel } from "./SourcesPanel";
import { citations } from "../../../shared/citations";
import type { AppEvent, Conversation, ConversationSummary, OrgsResponse, Part, Tool, WireEntry } from "../../../shared/types";

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

// Expired is hollow so it differs from live by shape, not by two close tints.
const statusDot: Record<string, string> = { live: "bg-live", expired: "bg-transparent ring-1 ring-inset ring-side-ink-2", ended: "bg-side-line" };

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const clockOrDay = (iso: string) =>
  isToday(iso)
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : new Date(iso).toLocaleDateString([], { weekday: "short" });

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
  const [panelTab, setPanelTab] = useState<"wire" | "stats" | "sources">("wire");
  const [actionBusy, setActionBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = useNow(5000);

  const activeOrg = orgs.orgs.find((o) => o.id === orgs.activeOrgId) ?? null;
  const convOrg = orgs.orgs.find((o) => o.id === conv?.orgId) ?? activeOrg;
  const orgList = list.filter((c) => c.orgId === orgs.activeOrgId);
  const showGallery = picking || !conv;
  const sources = conv ? citations(conv.wire) : [];

  const reloadList = useCallback(() => api.conversations().then(setList), []);
  // Upsert by id: a stream's wire entry is re-reported as it progresses.
  const mergeWire = useCallback((entries: WireEntry[]) => {
    setConv((c) => {
      if (!c) return c;
      const wire = [...c.wire];
      for (const e of entries) {
        const i = wire.findIndex((w) => w.id === e.id);
        if (i >= 0) wire[i] = e;
        else wire.push(e);
      }
      return { ...c, wire };
    });
  }, []);
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

  // HXL widget buttons (action/sendMessage) send their text as the user's next message.
  const sendFromWidget = (text: string) => {
    if (!conv || draft || conv.status !== "live") return false;
    runTurn({ kind: "text", text });
    return true;
  };

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
          else if (e.type === "wire") mergeWire([e.entry]);
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
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-2">
        <p>No org configured yet.</p>
        <button onClick={onOpenAdmin} className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-action-ink shadow-card">
          Add an org in Admin
        </button>
      </div>
    );
  }

  const headerButton =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-tint disabled:opacity-50";

  return (
    <div className="relative flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col gap-3 bg-side px-3 py-4 text-side-ink xl:w-72 2xl:w-80">
        <div className="space-y-2.5">
          <select
            value={activeOrg.id}
            onChange={(e) => {
              setConv(null);
              onSwitchOrg(e.target.value);
            }}
            className="w-full rounded-xl border border-side-line bg-side-2 px-3 py-2.5 text-sm font-semibold text-side-ink"
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
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              showGallery ? "bg-side-2 text-side-ink ring-1 ring-side-line" : "bg-action text-action-ink shadow-card hover:brightness-105"
            }`}
          >
            <Plus size={16} /> New chat
          </button>
        </div>
        <div className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {orgList.length === 0 && <p className="px-2 py-3 text-sm text-side-ink-2">No conversations in this org yet.</p>}
          {orgList.map((c, i) => [
            (i === 0 || isToday(orgList[i - 1].updatedAt) !== isToday(c.updatedAt)) && (
              <div key={`g${i}`} className="px-2 pb-1 pt-2 text-xs font-semibold text-side-ink-2">
                {isToday(c.updatedAt) ? "Today" : "Earlier"}
              </div>
            ),
            <div
              key={c.id}
              onClick={() => open(c.id)}
              title={c.title}
              className={`group flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 ${
                !showGallery && conv?.id === c.id ? "bg-side-2 ring-1 ring-side-line" : "hover:bg-side-2/60"
              }`}
            >
              <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${statusDot[c.status]}`} title={c.status} />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 break-words text-sm font-semibold leading-snug">{c.title}</div>
                <div className="mt-0.5 text-xs text-side-ink-2">
                  {c.agentLabel} · {plural(c.turns, "turn")}
                  {c.status !== "live" && ` · ${c.status}`}
                </div>
              </div>
              <time dateTime={c.updatedAt} title={`Updated ${ago(c.updatedAt, now)} ago`} className="mt-0.5 font-mono text-xs text-side-ink-2 group-hover:hidden">
                {clockOrDay(c.updatedAt)}
              </time>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
                className="mt-0.5 hidden text-side-ink-2 hover:text-side-ink group-hover:block"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>,
          ])}
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
            <header className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card lg:mx-6">
              <div className="flex min-w-56 flex-1 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-recv-line bg-recv text-recv-ink">
                  <Bot size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[17px] font-semibold leading-tight">{conv.agentLabel}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      conv.status === "live" ? "bg-sent-chip text-sent-ink" : "bg-tint text-ink-2"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${conv.status === "live" ? "bg-ok" : "bg-ink-3"}`} />
                    {conv.status}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-ink-3">
                  <span className="font-sans">{plural(conv.turns, "turn")}</span>
                  {conv.session && <span className="font-sans">· idle {ago(conv.session.lastActivityAt, now)}</span>}
                  {conv.session && (
                    <span title={`Agent API session id: ${conv.session.id}`}>
                      · session {conv.session.id.slice(0, 8)}…
                    </span>
                  )}
                  <span title="Agent id">· agent {conv.agentId}</span>
                </div>
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
              <div className="mx-auto w-full max-w-[72rem] space-y-3.5 px-4 py-5 lg:px-6">
                {conv.messages.map((m) => (
                  <MessageView
                    key={m.id}
                    message={m}
                    agentLabel={conv.agentLabel}
                    orgId={conv.orgId}
                    myDomain={convOrg?.myDomain ?? ""}
                    onHover={setHoverTurn}
                    onConfirm={conv.status === "live" && !draft ? decide : undefined}
                    onSend={conv.status === "live" ? sendFromWidget : undefined}
                  />
                ))}
                {draft && (
                  <AgentCard label={conv.agentLabel} streaming>
                    <Parts parts={draftParts(draft)} orgId={conv.orgId} myDomain={convOrg?.myDomain ?? ""} streaming />
                    {draftParts(draft).length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-ink-3">
                        <Loader2 size={14} className="animate-spin" /> Thinking…
                      </div>
                    )}
                  </AgentCard>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="px-4 pb-4 lg:px-6">
              <div className="mx-auto flex w-full max-w-[72rem] items-end gap-2 rounded-[18px] border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-card focus-within:border-ink-3">
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
                  className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-ink focus:outline-none focus-visible:outline-none disabled:text-ink-3"
                />
                {draft ? (
                  <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface" title="Stop">
                    <Square size={14} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim() || conv.status !== "live"}
                    className="flex items-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-action-ink shadow-card disabled:opacity-40 disabled:shadow-none"
                    title="Send"
                  >
                    <Send size={15} /> Send
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
          className={`flex shrink-0 flex-col border-l border-line bg-surface ${
            narrow ? "absolute inset-y-0 right-0 z-10 shadow-lift" : "relative"
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
              className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-ink-3/30"
            />
          )}
          <div className="flex items-start justify-between gap-2 px-4 pb-1 pt-4">
            <div className="min-w-0">
              <div role="tablist" className="flex gap-4">
                {(["wire", "stats", "sources"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={panelTab === t}
                    onClick={() => setPanelTab(t)}
                    className={`text-[17px] font-semibold leading-tight ${panelTab === t ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
                  >
                    {t === "wire" ? "Wire" : t === "stats" ? "Stats" : "Sources"}
                    {t === "sources" && sources.length > 0 && <span className="ml-1.5 font-mono text-xs text-ink-3">{sources.length}</span>}
                  </button>
                ))}
              </div>
              <div className="mt-0.5 text-xs text-ink-3">
                {panelTab === "wire"
                  ? "Every Salesforce call for this conversation · tokens masked"
                  : panelTab === "stats"
                    ? "Timing, tokens and IDs for the hovered or latest turn"
                    : "References the agent cited, by turn"}
              </div>
            </div>
            <button onClick={() => setPanelOpen(false)} className="rounded-lg p-1.5 text-ink-3 hover:bg-tint hover:text-ink" title="Close side panel">
              <PanelRightClose size={16} />
            </button>
          </div>
          {panelTab === "wire" ? (
            <div className="min-h-0 flex-1">
              <WirePanel wire={conv.wire} highlightTurn={hoverTurn} title={conv.title} />
            </div>
          ) : panelTab === "stats" ? (
            <div className="mt-2 min-h-0 flex-1 border-t border-line">
              <TurnStats conversationId={conv.id} wire={conv.wire} highlightTurn={hoverTurn} onWire={mergeWire} />
            </div>
          ) : (
            <div className="mt-2 min-h-0 flex-1 border-t border-line">
              <SourcesPanel items={sources} highlightTurn={hoverTurn} />
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
