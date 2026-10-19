import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, X } from "lucide-react";
import type { QueryColumn } from "../../../shared/types";

// A JSON string inside a cell (a blob column, say) reads as the object it holds.
const unpack = (v: unknown): unknown => {
  if (typeof v !== "string" || !/^\s*[[{]/.test(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

const NAME_KEY = /^(?!KQ_).*(Name|Title|Subject)__c$|^name$/i;

// What a collapsed object or array shows beside its key: its size, and an object's name field if it has one.
function summary(v: object): string {
  if (Array.isArray(v)) return `[${v.length}]`;
  const entries = Object.entries(v);
  const named = entries.find(([k, x]) => NAME_KEY.test(k) && typeof x === "string" && x.trim());
  return `{${entries.length}}${named ? ` ${named[1]}` : ""}`;
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-ink-3">null</span>;
  if (typeof v === "string") return <span className="break-all text-ink-2">"{v}"</span>;
  if (typeof v === "number" || typeof v === "boolean") return <span className="text-action">{String(v)}</span>;
  return <span>{String(v)}</span>;
}

function Node({ name, value, depth, openDepth }: { name: string; value: unknown; depth: number; openDepth: number }) {
  const v = unpack(value);
  const branch = v !== null && typeof v === "object";
  const [open, setOpen] = useState(depth < openDepth);
  if (!branch)
    return (
      <div className="flex gap-2 py-0.5 pl-[18px]">
        <span className="shrink-0 text-ink">{name}</span>
        <Value v={v} />
      </div>
    );
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as object);
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-0.5 rounded py-0.5 text-left hover:bg-tint">
        <ChevronRight size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 text-ink">{name}</span>
        <span className="ml-2 truncate text-ink-3">{summary(v as object)}</span>
      </button>
      {open && (
        <div className="ml-[7px] border-l border-line pl-2">
          {entries.length ? entries.map(([k, x]) => <Node key={k} name={k} value={x} depth={depth + 1} openDepth={openDepth} />) : <div className="py-0.5 pl-[18px] text-ink-3">empty</div>}
        </div>
      )}
    </div>
  );
}

interface Props {
  columns: QueryColumn[];
  row: unknown[];
  index: number;
  count: number;
  onMove: (index: number) => void;
  onClose: () => void;
}

// One result row as a collapsible tree, nested data graph objects and JSON strings unfolded.
export function RecordPanel({ columns, row, index, count, onMove, onClose }: Props) {
  const [openDepth, setOpenDepth] = useState(1); // columns open, nested records collapsed to a summary
  const [copied, setCopied] = useState(false);
  const record = Object.fromEntries(columns.map((c, i) => [c.name, unpack(row[i] ?? null)]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const icon = "rounded-md p-1 text-ink-2 hover:bg-tint hover:text-ink disabled:opacity-40";

  return (
    <aside aria-label={`Row ${index + 1}`} className="flex w-[26rem] shrink-0 flex-col rounded-2xl border border-line bg-surface xl:w-[32rem]">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="mr-auto text-sm font-semibold">
          Row <span className="font-mono">{index + 1}</span> <span className="font-normal text-ink-3">of {count.toLocaleString()}</span>
        </span>
        <button onClick={() => onMove(index - 1)} disabled={index === 0} title="Previous row" aria-label="Previous row" className={icon}>
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => onMove(index + 1)} disabled={index >= count - 1} title="Next row" aria-label="Next row" className={icon}>
          <ChevronRight size={15} />
        </button>
        <button onClick={() => setOpenDepth(openDepth === Infinity ? 1 : Infinity)} title={openDepth === Infinity ? "Collapse all" : "Expand all"} className={icon}>
          {openDepth === Infinity ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
        <button onClick={copy} title="Copy the row as JSON" aria-label="Copy the row as JSON" className={icon}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <button onClick={onClose} title="Close (Esc)" aria-label="Close" className={icon}>
          <X size={15} />
        </button>
      </div>
      <div key={`${index}-${openDepth}`} className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
        {columns.map((c, i) => (
          <Node key={c.name} name={c.name} value={row[i] ?? null} depth={0} openDepth={openDepth} />
        ))}
      </div>
    </aside>
  );
}
