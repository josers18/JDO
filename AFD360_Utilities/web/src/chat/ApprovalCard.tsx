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

const shortType = (t: string) => t.replace(/^copilotActionInput\//, "").replace(/^EmployeeCopilot__/, "");

function describe(a: ActionPart) {
  const detail = (a.value as { recordDetailInput?: RecordDetail })?.recordDetailInput;
  if (!detail) return null;
  // Fields the action writes = updateable fields in the proposal (Id and read-only context are excluded).
  const changes = Object.entries(detail.data ?? {})
    .filter(([key, f]) => key !== "Id" && f.updateable)
    .map(([key, f]) => ({ key, label: f.label ?? key, value: f.displayValue || String(f.value ?? "—") }));
  return { detail, changes };
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
    <div className="overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <ShieldCheck size={16} className="text-amber-600" />
        <span className="text-sm font-semibold text-amber-900">
          {pending ? "Approval needed" : "Proposed changes"} · {actions.length} change{actions.length === 1 ? "" : "s"}
        </span>
        <StatusBadge status={confirm?.status} approved={approvedIds.size} total={actions.length} />
        {pending && (
          <button
            onClick={() => setSelected(selected.size === ids.length ? new Set() : new Set(ids))}
            className="ml-auto text-xs text-amber-800 hover:underline"
          >
            {selected.size === ids.length ? "Select none" : "Select all"}
          </button>
        )}
      </div>

      <ul className="divide-y divide-slate-100">
        {actions.map((a, i) => {
          const id = ids[i];
          const info = describe(a);
          const dimmed = !pending && confirm?.status !== "pending" && approvedIds.size > 0 && !approvedIds.has(id);
          return (
            <li key={id} className={`flex items-start gap-3 px-4 py-2.5 ${dimmed ? "opacity-45" : ""}`}>
              {pending && (
                <input type="checkbox" className="mt-1" checked={selected.has(id)} onChange={() => toggle(id)} aria-label="Approve this change" />
              )}
              <div className="min-w-0 flex-1">
                {info ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: `#${info.detail.sObjectInfo?.color ?? "94a3b8"}` }} />
                      <span className="text-xs text-slate-500">{info.detail.sObjectInfo?.label}</span>
                      {info.detail.id && info.detail.sObjectInfo?.apiName ? (
                        <a
                          href={`${myDomain}/lightning/r/${info.detail.sObjectInfo.apiName}/${info.detail.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline"
                        >
                          {info.detail.title ?? info.detail.id} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-sm font-medium">{info.detail.title}</span>
                      )}
                      <span className="text-[11px] text-slate-400">{shortType(a.actionType)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {info.changes.length === 0 && <span className="text-xs text-slate-500">No field changes listed</span>}
                      {info.changes.map((ch) => (
                        <span key={ch.key} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs">
                          <span className="text-slate-600">{ch.label}</span>
                          <ArrowRight size={11} className="text-slate-400" />
                          <span className="font-medium text-slate-900">{ch.value}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{shortType(a.actionType)}</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="mr-auto text-xs text-slate-500">Nothing is changed until you approve.</span>
          <button
            onClick={() => decide("reject")}
            disabled={Boolean(busy)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === "reject" && <Loader2 size={13} className="animate-spin" />} Reject
          </button>
          <button
            onClick={() => decide("approve")}
            disabled={Boolean(busy) || selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
    approved: { cls: "bg-emerald-100 text-emerald-800", text: "Approved", icon: <CheckCircle2 size={12} /> },
    "partially-approved": { cls: "bg-emerald-100 text-emerald-800", text: `Approved ${approved} of ${total}`, icon: <CheckCircle2 size={12} /> },
    rejected: { cls: "bg-red-100 text-red-700", text: "Rejected", icon: <XCircle size={12} /> },
    superseded: { cls: "bg-slate-200 text-slate-600", text: "Not answered (replied with a message)", icon: null },
  };
  const s = map[status];
  if (!s) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${s.cls}`}>{s.icon}{s.text}</span>;
}
