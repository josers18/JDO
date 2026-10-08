import { useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { Message, Part } from "../../../shared/types";

type ActionPart = Extract<Part, { kind: "action" }>;
export type ConfirmDecision = (decision: "approve" | "reject", toolIds?: string[]) => Promise<void>;

interface FieldValue {
  label?: string;
  value?: unknown;
  displayValue?: string;
  updateable?: boolean;
}

interface RecordDetail {
  id?: string;
  title?: string;
  sObjectInfo?: { apiName?: string; label?: string; color?: string };
  data?: Record<string, FieldValue>;
}

const shortType = (t: string) => t.replace(/^copilotActionInput\//, "").replace(/^EmployeeCopilot__/, "").replace(/^search__recordDraft$/, "CreateRecord");

function describe(a: ActionPart) {
  const detail = (a.value as { recordDetailInput?: RecordDetail })?.recordDetailInput;
  if (!detail) return null;
  // A proposal without a record Id creates a record (e.g. search__recordDraft): every proposed field is a change.
  // An update lists only the updateable fields (Id and read-only context are excluded).
  const isCreate = !detail.id;
  const changes = Object.entries(detail.data ?? {})
    .filter(([key, f]) => key !== "Id" && (isCreate ? f.value !== undefined && f.value !== "" : f.updateable))
    .map(([key, f]) => ({ key, label: f.label ?? key, value: f.displayValue || String(f.value ?? "—") }));
  return { detail, changes, isCreate };
}

export function ApprovalCard({
  actions,
  confirm,
  myDomain,
  onDecide,
}: {
  actions: ActionPart[];
  confirm?: Message["confirm"];
  myDomain: string;
  onDecide?: ConfirmDecision;
}) {
  const ids = actions.map((a, i) => a.toolId ?? String(i));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ids));
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const pending = confirm?.status === "pending" && Boolean(onDecide);
  const approvedIds = new Set(confirm?.approvedToolIds ?? []);

  const decide = async (decision: "approve" | "reject") => {
    if (!onDecide) return;
    setBusy(decision);
    try {
      await onDecide(decision, decision === "approve" ? ids.filter((id) => selected.has(id)) : undefined);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-tint px-4 py-2.5">
        <ShieldCheck size={16} className="text-ink-2" />
        <span className="text-sm font-semibold text-ink">{pending ? "Approve changes" : "Proposed changes"}</span>
        <span className="rounded-full border border-recv-line bg-recv px-2.5 py-0.5 text-xs font-semibold text-recv-ink">
          {actions.length} {pending ? "pending" : `change${actions.length === 1 ? "" : "s"}`}
        </span>
        <StatusBadge status={confirm?.status} approved={approvedIds.size} total={actions.length} />
        {pending && (
          <button
            onClick={() => setSelected(selected.size === ids.length ? new Set() : new Set(ids))}
            className="ml-auto text-sm font-medium text-ink-2 underline-offset-[3px] hover:underline"
          >
            {selected.size === ids.length ? "Select none" : "Select all"}
          </button>
        )}
      </div>

      <ul className="divide-y divide-line">
        {actions.map((a, i) => {
          const id = ids[i];
          const info = describe(a);
          const dimmed = !pending && confirm?.status !== "pending" && approvedIds.size > 0 && !approvedIds.has(id);
          return (
            <li key={id} className={`flex items-start gap-3 px-4 py-2.5 ${dimmed ? "opacity-45" : ""}`}>
              {pending && (
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={selected.has(id)} onChange={() => toggle(id)} aria-label="Approve this change" />
              )}
              <div className="min-w-0 flex-1">
                {info ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="h-2 w-2 rounded-full bg-ink-3" style={info.detail.sObjectInfo?.color ? { background: `#${info.detail.sObjectInfo.color}` } : undefined} />
                      <span className="text-sm text-ink-3">{info.detail.sObjectInfo?.label}</span>
                      {info.isCreate ? (
                        <span className="text-sm font-semibold">New {info.detail.sObjectInfo?.label ?? "record"}</span>
                      ) : info.detail.id && info.detail.sObjectInfo?.apiName ? (
                        <a
                          href={`${myDomain}/lightning/r/${info.detail.sObjectInfo.apiName}/${info.detail.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-semibold text-ink underline-offset-[3px] hover:underline"
                        >
                          {info.detail.title ?? info.detail.id} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-sm font-semibold">{info.detail.title}</span>
                      )}
                      <span className="font-mono text-xs text-ink-3">{shortType(a.actionType)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {info.changes.length === 0 && <span className="text-sm text-ink-3">No field changes listed</span>}
                      {info.changes.map((ch) => (
                        <span key={ch.key} className="inline-flex items-center gap-1 rounded-lg border border-sent-line bg-sent px-2 py-0.5 font-mono text-xs text-sent-ink">
                          <span>{ch.label}</span>
                          <ArrowRight size={11} />
                          <span className="font-semibold">{ch.value}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{shortType(a.actionType)}</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-console p-2.5 font-mono text-xs text-console-ink">
                      {JSON.stringify(a.value, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pending && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-tint px-4 py-2.5">
          <span className="mr-auto text-sm text-ink-3">Nothing is changed until you approve.</span>
          <button
            onClick={() => decide("reject")}
            disabled={Boolean(busy)}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-tint disabled:opacity-50"
          >
            {busy === "reject" && <Loader2 size={13} className="animate-spin" />} Reject
          </button>
          <button
            onClick={() => decide("approve")}
            disabled={Boolean(busy) || selected.size === 0}
            className="flex items-center gap-1.5 rounded-xl bg-action px-3.5 py-2 text-sm font-semibold text-action-ink shadow-card hover:brightness-105 disabled:opacity-50 disabled:shadow-none"
          >
            {busy === "approve" && <Loader2 size={13} className="animate-spin" />}
            Approve {selected.size === ids.length ? "all" : "selected"} ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, approved, total }: { status?: string; approved: number; total: number }) {
  if (!status || status === "pending") return null;
  const map: Record<string, { cls: string; text: string; icon: React.ReactNode }> = {
    approved: { cls: "bg-ok/12 text-ink", text: "Approved", icon: <CheckCircle2 size={12} className="text-ok" /> },
    "partially-approved": { cls: "bg-ok/12 text-ink", text: `Approved ${approved} of ${total}`, icon: <CheckCircle2 size={12} className="text-ok" /> },
    rejected: { cls: "bg-err/10 text-err", text: "Rejected", icon: <XCircle size={12} /> },
    superseded: { cls: "bg-tint text-ink-2", text: "Not answered (replied with a message)", icon: null },
  };
  const s = map[status];
  if (!s) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.icon}{s.text}</span>;
}
