import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDot, Copy, Loader2, Search, User, X, Zap } from "lucide-react";
import type { Message, Part, Tool } from "../../../shared/types";
import { ApprovalCard, type ConfirmDecision } from "./ApprovalCard";
import { HxlOutput } from "./HxlCard";

// Agents write a single newline to mean a line break, and some put <br> in table cells: render both as breaks.
// Any other raw HTML stays literal text; it is never parsed as HTML.
type MdNode = { type: string; value?: string; children?: MdNode[] };
const BR = /^<br\s*\/?>$/i;
function remarkLineBreaks() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((c): MdNode[] => {
      if (c.type === "html" && BR.test(c.value!.trim())) return node.type === "root" ? [] : [{ type: "break" }];
      if (c.type === "text" && c.value!.includes("\n"))
        return c.value!.split("\n").flatMap((v, i) => [...(i ? [{ type: "break" }] : []), ...(v ? [{ type: "text", value: v }] : [])]);
      walk(c);
      return [c];
    });
  };
  return walk;
}
const REMARK = [remarkGfm, remarkLineBreaks];

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function MessageView({
  message,
  agentLabel,
  orgId,
  myDomain,
  onHover,
  onConfirm,
  onSend,
}: {
  message: Message;
  agentLabel: string;
  orgId: string;
  myDomain: string;
  onHover?: (turn: number | null) => void;
  onConfirm?: ConfirmDecision;
  /** Sends text as the user's next message (HXL widget buttons); returns false when it can't be sent now. */
  onSend?: (text: string) => boolean;
}) {
  const hover = {
    onMouseEnter: () => onHover?.(message.turn),
    onMouseLeave: () => onHover?.(null),
  };
  if (message.role === "user") {
    return (
      <article className="ml-[8%] rounded-2xl border border-sent-line bg-[color-mix(in_oklab,var(--sent)_45%,var(--surface))] px-[18px] pb-4 pt-3.5 shadow-card" {...hover}>
        <CardHead lane="sent" who="You" time={clock(message.createdAt)} />
        <div className="whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-sent-ink">
          {message.parts.map((p) => (p.kind === "text" ? p.markdown : "")).join("")}
        </div>
      </article>
    );
  }
  if (message.role === "system" || message.role === "error") {
    const isError = message.role === "error";
    return (
      <div
        className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${isError ? "border border-err/30 bg-err/10 text-err" : "text-ink-3"}`}
        {...hover}
      >
        {isError ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CircleDot size={15} className="mt-0.5 shrink-0" />}
        <div className="prose prose-sm max-w-none text-inherit [&_p]:my-0">
          <ReactMarkdown remarkPlugins={REMARK}>{message.parts.map((p) => (p.kind === "text" ? p.markdown : "")).join("")}</ReactMarkdown>
        </div>
      </div>
    );
  }
  const time = clock(message.createdAt) + (message.durationMs !== undefined ? ` · ${(message.durationMs / 1000).toFixed(1)}s` : "");
  return (
    <AgentCard label={agentLabel} time={time} {...hover}>
      <Parts parts={message.parts} orgId={orgId} myDomain={myDomain} confirm={message.confirm} onConfirm={onConfirm} onSend={onSend} />
    </AgentCard>
  );
}

// A received card: the agent's whole answer for one turn (also used for the live, streaming draft).
export function AgentCard({
  label,
  time,
  streaming,
  children,
  ...rest
}: {
  label: string;
  time?: string;
  streaming?: boolean;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <article className="mr-[4%] rounded-2xl border border-line bg-surface px-[18px] pb-4 pt-3.5 shadow-card" {...rest}>
      <CardHead lane="recv" who={label} time={streaming ? "streaming…" : time} />
      {children}
    </article>
  );
}

// SLDS utility:agent_astro (Salesforce Lightning Design System, BSD-3-Clause), 520x520 viewBox.
const ASTRO = [
  "M314.9 276.2h.2a100 100 0 0 0-21.8 4.1s-9.2 2.9-23.3 4.9c-3.3.5-7.5.5-9.8.5h-1.7c-2.3 0-6.6-.2-9.8-.7a149.5 149.5 0 0 1-23.2-5.5 113 113 0 0 0-21.8-4.4c-44.9-4.6-64.3 12.5-65.4 15.7s3.8 44.8 7.4 51.4a28 28 0 0 0 13.8 12.4c5 2.1 46.1 6.2 59.8 4.3s15.8-6.5 19.5-13.5c2.6-5 9.3-27.6 13-40.9.9-2.6 1-7.8 7.3-8.2 6.3.5 6.4 5.8 7.2 8.4l12.4 41.1c3.5 7.1 5.6 11.7 19.3 13.9 13.6 2.1 54.8-1.2 59.8-3.2s10.4-5.7 14-12.2 9.2-48 8.2-51.2c-1-3.3-20.1-20.7-65.1-16.9",
  "M455.2 145.5h.1a226.5 226.5 0 0 0-43.7-42.1 36.2 36.2 0 0 0 29.9-35.6 36.3 36.3 0 1 0-70.6 11.4 258.5 258.5 0 0 0-83.5-23.3 260 260 0 0 0-138.2 23 36.3 36.3 0 1 0-70.7-11.1 36.2 36.2 0 0 0 29.6 35.6C61.5 137.8 29 187.9 21.6 246a201.5 201.5 0 0 0 43.2 151.5c39.4 49.8 100.6 82.5 167.8 89.6q14.1 1.5 27.9 1.5c119.9 0 223.7-81.4 237.9-191.6a201.5 201.5 0 0 0-43.2-151.5m-195 281.1h-.1c-90.2-.1-163.6-60.3-163.6-134.3 0-22.3 6.8-43.7 19.1-62.7a60.6 60.6 0 0 0 5.3 17.1 17 17 0 0 0 22.8 7.8c8.5-4.1 12-14.3 8.1-22.8-2.1-4.5-7.5-19.4 5.6-30.8 12.7 11.5 30.9 25 51.4 31.6 38.2 12.1 67.1 5 68.3 4.7a17.1 17.1 0 0 0 12.1-11.5 17 17 0 0 0-3.4-16.3 185.5 185.5 0 0 1-32.5-48.2c78.2 10.6 93.2 72.9 93.8 75.7a17 17 0 0 0 20.2 13.1c9.3-1.9 15.2-11 13.3-20.3a119 119 0 0 0-19.9-43c38.3 24.6 63.1 62.8 63.1 105.7 0 74-73.4 134.2-163.6 134.2",
];

function CardHead({ lane, who, time }: { lane: "sent" | "recv"; who: string; time?: string }) {
  const sent = lane === "sent";
  return (
    // A faint bar across the card's top edge separates who/when from the message.
    <div
      className={`-mx-[18px] -mt-3.5 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-t-2xl border-b px-[18px] py-2 text-sm ${
        sent ? "border-sent-line bg-[color-mix(in_oklab,var(--sent-chip)_40%,var(--sent))]" : "border-recv-line bg-[color-mix(in_oklab,var(--recv)_85%,var(--surface))]"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-full ${sent ? "bg-sent-chip text-sent-ink" : "border border-recv-line bg-recv text-recv-ink"}`}
      >
        {sent ? (
          <User size={14} strokeWidth={2.4} />
        ) : (
          <svg viewBox="0 0 520 520" width={14} height={14} fill="currentColor">
            {ASTRO.map((d) => (
              <path key={d.length} d={d} />
            ))}
          </svg>
        )}
      </span>
      <span className="text-[15px] font-bold tracking-tight text-ink [font-stretch:112%]">{who}</span>
      {sent ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-sent-chip px-2 py-px text-[11px] font-semibold text-sent-ink">
          <ArrowRight size={11} strokeWidth={2.4} /> Sent
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-recv-line bg-recv px-2 py-px text-[11px] font-semibold text-recv-ink">
          <ArrowLeft size={11} strokeWidth={2.4} /> Received
        </span>
      )}
      {time && <time className="ml-auto font-mono text-xs text-ink-3">{time}</time>}
    </div>
  );
}

export function Parts({
  parts: raw,
  orgId,
  myDomain,
  streaming,
  confirm,
  onConfirm,
  onSend,
}: {
  parts: Part[];
  orgId?: string;
  myDomain: string;
  streaming?: boolean;
  confirm?: Message["confirm"];
  onConfirm?: ConfirmDecision;
  onSend?: (text: string) => boolean;
}) {
  const parts = mergeToolParts(raw);
  const actions = parts.filter((p): p is Extract<Part, { kind: "action" }> => p.kind === "action");
  const firstAction = parts.findIndex((p) => p.kind === "action");
  return (
    <div className="space-y-3">
      {parts.map((p, i) => {
        // All proposed actions of a turn render as one approval card, where the first one appeared.
        if (p.kind === "action") {
          return i === firstAction ? (
            <ApprovalCard key={i} actions={actions} confirm={confirm} myDomain={myDomain} onDecide={onConfirm} />
          ) : null;
        }
        if (p.kind === "text") return <Markdown key={i} text={p.markdown} myDomain={myDomain} />;
        if (p.kind === "tools") return <ToolCards key={i} tools={p.tools} />;
        if (p.kind === "progress") return <ProgressLine key={i} text={p.text} running={streaming && i === parts.length - 1} />;
        // Action outputs (e.g. a delegated agent's copilotActionOutput) often carry the answer in `response`.
        const out = p.value as { response?: unknown; generatedSql?: unknown; tables?: unknown; queryData?: unknown };
        const response = typeof out?.response === "string" ? out.response : null;
        // The D360 agent writes a "<data>" marker where its UI shows the result table; the Agent API doesn't include those rows.
        const rowsMissing = Boolean(response?.includes("<data>")) && !out.tables && !out.queryData;
        const shownResponse = rowsMissing
          ? response!.replace(/<data>/g, "> _The agent's result table isn't included in the Agent API response (only its summary and SQL are)._")
          : response;
        const sql = typeof out?.generatedSql === "string" && out.generatedSql.trim() ? out.generatedSql : null;
        const details = (
          <details className="rounded-xl border border-line bg-tint text-sm">
            <summary className="cursor-pointer px-3 py-2 text-ink-2">
              {typeof response === "string" ? "Action output details · " : "Action output · "}
              <span className="font-mono text-xs">{p.lightningType}</span>
            </summary>
            <pre className="max-h-96 overflow-auto px-3 pb-3 font-mono text-xs text-ink">{JSON.stringify(p.value, null, 2)}</pre>
          </details>
        );
        // Structured action outputs from any agent render as HXL; prose answers (a delegated agent's `response`) stay markdown.
        if (orgId && response === null && p.lightningType.startsWith("copilotActionOutput/") && p.value && typeof p.value === "object") {
          return (
            <div key={i} className="space-y-1.5">
              <HxlOutput orgId={orgId} myDomain={myDomain} actionType={p.lightningType} value={p.value} fallback={null} onSend={onSend} />
              {details}
            </div>
          );
        }
        return (
          <div key={i} className="space-y-1.5">
            {shownResponse?.trim() && <Markdown text={shownResponse} myDomain={myDomain} />}
            {sql && <SqlBlock sql={sql} />}
            {details}
          </div>
        );
      })}
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="overflow-hidden rounded-xl border border-line bg-surface text-sm">
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 font-medium text-ink-2">
        <span>Generated SQL</span>
        <button
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard.writeText(sql).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-tint"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <pre className="max-h-80 overflow-auto bg-console px-3 py-3 font-mono text-xs leading-relaxed text-console-ink">{sql}</pre>
    </details>
  );
}

function mergeToolParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (p.kind === "tools" && last?.kind === "tools") out[out.length - 1] = { kind: "tools", tools: [...last.tools, ...p.tools] };
    else out.push(p);
  }
  return out;
}

function Markdown({ text, myDomain }: { text: string; myDomain: string }) {
  return (
    <div className="prose max-w-none text-[15px] leading-relaxed prose-p:my-2 prose-table:text-sm prose-th:bg-tint prose-th:px-2 prose-td:px-2">
      <ReactMarkdown
        remarkPlugins={REMARK}
        components={{
          // Agent links are org-relative (/lightning/r/...): point them at the org, open in a new tab.
          a: ({ href, children }) => (
            <a href={href?.startsWith("/") ? `${myDomain}${href}` : href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ToolCards({ tools }: { tools: Tool[] }) {
  return (
    <div className="space-y-2">
      {groupTools(tools).map(({ tool: t, times }) => {
        const Icon = t.category === "search" ? Search : Zap;
        const showCount = t.count !== undefined && t.status !== "running" && !(t.category !== "search" && t.count === "0");
        // A tool that reported several descriptions (e.g. agent delegation) shows its first step as the title
        // and the rest as a checklist, so the reasoning trail stays visible instead of being overwritten.
        const trail = t.steps && t.steps.length > 1 ? t.steps : null;
        return (
          <div
            key={t.id}
            className={`max-w-full rounded-xl border border-recv-line bg-recv px-3.5 py-2.5 ${trail ? "w-full max-w-3xl" : "w-fit min-w-72"}`}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface/70 text-recv-ink">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-semibold text-recv-ink">{trail ? trail[0].description : t.description}</div>
                {(t.category || trail) && (
                  <div className="font-mono text-xs text-recv-ink/80">
                    {t.category ?? "tool"}
                    {trail && ` · ${trail.length} steps`}
                  </div>
                )}
              </div>
              {times > 1 && <span className="rounded-full bg-surface/70 px-2 py-0.5 font-mono text-xs font-semibold text-recv-ink">×{times}</span>}
              {showCount && (
                <span className="whitespace-nowrap rounded-full bg-surface/70 px-2 py-0.5 text-xs text-recv-ink">
                  {t.count} result{t.count === "1" ? "" : "s"}
                </span>
              )}
              <StepIcon status={t.status} />
            </div>
            {trail && (
              <ol className="relative mt-2.5 space-y-0.5 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-0.5 before:rounded before:bg-recv-line">
                {trail.slice(1).map((step, i) => (
                  <li key={i} className="relative flex items-start gap-2.5 py-1 text-sm leading-snug">
                    <StepIcon status={step.status} />
                    <span
                      className={`min-w-0 break-words ${
                        step.status === "running" ? "font-semibold text-ink" : step.status === "success" ? "text-ink-2" : "text-err"
                      }`}
                    >
                      {stripAgentPrefix(step.description, trail[0].description)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {t.status === "error" && (
              <p className="mt-2 border-t border-recv-line pt-2 text-sm text-recv-ink">
                Salesforce marked this step as failed but sent no error detail over the Agent API. The agent&apos;s reply usually
                says why; the full reason is in the session trace.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "D360 Agent: Generating SQL" / "Delegated: Generating SQL" under the delegation title read better as "Generating SQL".
function stripAgentPrefix(text: string, title: string) {
  const agent = /^Delegating to (.+)$/.exec(title)?.[1];
  for (const prefix of [agent && `${agent}: `, "Delegated: "]) {
    if (prefix && text.startsWith(prefix)) return text.slice(prefix.length);
  }
  return text;
}

// Trail markers: filled check when done, pulsing ring while running, cross on error.
function StepIcon({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface">
        <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok text-surface">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-err text-surface" aria-label={status}>
      <X size={12} strokeWidth={3} />
    </span>
  );
}

// Collapses consecutive identical steps (e.g. ten "Proposing to update Lead" actions) into one card.
function groupTools(tools: Tool[]) {
  const groups: { tool: Tool; times: number }[] = [];
  for (const t of tools) {
    const last = groups.at(-1);
    const same =
      last &&
      (last.tool.steps?.length ?? 0) <= 1 &&
      !(t.steps && t.steps.length > 1) &&
      ["description", "status", "category", "count"].every((k) => last.tool[k as keyof Tool] === t[k as keyof Tool]);
    if (same) last.times++;
    else groups.push({ tool: t, times: 1 });
  }
  return groups;
}

function ProgressLine({ text, running }: { text: string; running?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-2">
      {running ? <Loader2 size={15} className="animate-spin text-ink-3" /> : <CheckCircle2 size={15} className="text-ok" />}
      {text}
    </div>
  );
}
