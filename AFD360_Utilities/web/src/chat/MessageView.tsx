import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, CheckCircle2, CircleDot, Loader2, Search, XCircle, Zap } from "lucide-react";
import type { Message, Part, Tool } from "../../../shared/types";
import { ApprovalCard, type ConfirmDecision } from "./ApprovalCard";

export function MessageView({
  message,
  myDomain,
  onHover,
  onConfirm,
}: {
  message: Message;
  myDomain: string;
  onHover?: (turn: number | null) => void;
  onConfirm?: ConfirmDecision;
}) {
  const hover = {
    onMouseEnter: () => onHover?.(message.turn),
    onMouseLeave: () => onHover?.(null),
  };
  if (message.role === "user") {
    return (
      <div className="flex justify-end" {...hover}>
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-sky-600 px-4 py-2.5 text-sm text-white">
          {message.parts.map((p) => (p.kind === "text" ? p.markdown : "")).join("")}
        </div>
      </div>
    );
  }
  if (message.role === "system" || message.role === "error") {
    const isError = message.role === "error";
    return (
      <div className={`flex items-start gap-2 text-xs ${isError ? "text-red-600" : "text-slate-500"}`} {...hover}>
        {isError ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CircleDot size={14} className="mt-0.5 shrink-0" />}
        <div className="prose prose-xs max-w-none text-inherit [&_p]:my-0">
          <ReactMarkdown>{message.parts.map((p) => (p.kind === "text" ? p.markdown : "")).join("")}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return (
    <div {...hover}>
      <Parts parts={message.parts} myDomain={myDomain} confirm={message.confirm} onConfirm={onConfirm} />
      {message.durationMs !== undefined && (
        <div className="mt-1 text-[11px] text-slate-400">{(message.durationMs / 1000).toFixed(1)}s</div>
      )}
    </div>
  );
}

export function Parts({
  parts: raw,
  myDomain,
  streaming,
  confirm,
  onConfirm,
}: {
  parts: Part[];
  myDomain: string;
  streaming?: boolean;
  confirm?: Message["confirm"];
  onConfirm?: ConfirmDecision;
}) {
  const parts = mergeToolParts(raw);
  const actions = parts.filter((p): p is Extract<Part, { kind: "action" }> => p.kind === "action");
  const firstAction = parts.findIndex((p) => p.kind === "action");
  return (
    <div className="space-y-2">
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
        return (
          <details key={i} className="rounded-lg border border-slate-200 bg-white text-xs">
            <summary className="cursor-pointer px-3 py-2 text-slate-600">{p.lightningType}</summary>
            <pre className="overflow-x-auto px-3 pb-3 text-[11px]">{JSON.stringify(p.value, null, 2)}</pre>
          </details>
        );
      })}
    </div>
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
    <div className="prose prose-sm max-w-none prose-table:text-xs prose-th:bg-slate-50 prose-th:px-2 prose-td:px-2 prose-a:text-sky-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
    <div className="space-y-1.5">
      {groupTools(tools).map(({ tool: t, times }) => {
        const Icon = t.category === "search" ? Search : Zap;
        const showCount = t.count !== undefined && t.status !== "running" && !(t.category !== "search" && t.count === "0");
        return (
          <div key={t.id} className="flex w-fit min-w-72 max-w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.category ?? "tool"}</div>
              <div className="break-words text-sm text-slate-800">{t.description}</div>
            </div>
            {times > 1 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">×{times}</span>}
            {showCount && (
              <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {t.count} result{t.count === "1" ? "" : "s"}
              </span>
            )}
            <ToolStatus status={t.status} />
          </div>
        );
      })}
    </div>
  );
}

// Collapses consecutive identical steps (e.g. ten "Proposing to update Lead" actions) into one card.
function groupTools(tools: Tool[]) {
  const groups: { tool: Tool; times: number }[] = [];
  for (const t of tools) {
    const last = groups.at(-1);
    const same = last && ["description", "status", "category", "count"].every((k) => last.tool[k as keyof Tool] === t[k as keyof Tool]);
    if (same) last.times++;
    else groups.push({ tool: t, times: 1 });
  }
  return groups;
}

function ToolStatus({ status }: { status: string }) {
  if (status === "running") return <Loader2 size={16} className="animate-spin text-sky-500" />;
  if (status === "success") return <CheckCircle2 size={16} className="text-emerald-500" />;
  return <XCircle size={16} className="text-red-500" aria-label={status} />;
}

function ProgressLine({ text, running }: { text: string; running?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      {running ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="text-emerald-500" />}
      {text}
    </div>
  );
}
