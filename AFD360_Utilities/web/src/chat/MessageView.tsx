import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCircle2, Copy, Loader2, Search, X, Zap } from "lucide-react";
import type { Message, Part, Tool } from "../../../shared/types";
import { ApprovalCard, type ConfirmDecision } from "./ApprovalCard";
import { CardHead } from "./CardHead";
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
      <article
        className={`mr-[4%] rounded-2xl border bg-surface px-[18px] pb-3 pt-3.5 text-sm shadow-card ${isError ? "border-err/30 text-err" : "border-line text-ink-2"}`}
        {...hover}
      >
        <CardHead lane={message.role} who={isError ? "Error" : "System"} time={clock(message.createdAt)} />
        <div className="prose prose-sm max-w-none text-inherit [&_p]:my-0">
          <ReactMarkdown remarkPlugins={REMARK}>{message.parts.map((p) => (p.kind === "text" ? p.markdown : "")).join("")}</ReactMarkdown>
        </div>
      </article>
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
