import { decodeGraphBlob } from "../../../shared/graphBlob";
import { useState } from "react";

export const fieldLabel = (key: string) =>
  (key === "json_blob__c" ? "Graph record" : key)
    .replace(/^ssot__/, "")
    .replace(/__(?:dlm|c)$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b(id|url|api|sql)\b/gi, (word) => word.toUpperCase())
    .replace(/^./, (letter) => letter.toUpperCase());

export function ViewSwitch({ raw, setRaw, scope }: { raw: boolean; setRaw: (raw: boolean) => void; scope: string }) {
  return (
    <div role="group" aria-label={scope + " format"} className="inline-flex gap-0.5 rounded-lg bg-tint p-0.5">
      {["Readable", "Raw JSON"].map((label, i) => (
        <button
          key={label}
          aria-pressed={raw === Boolean(i)}
          onClick={() => setRaw(Boolean(i))}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${raw === Boolean(i) ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Nested({ value }: { value: object }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(value);
  const count = Object.keys(value).length;
  if (!count) return <span className="text-ink-3">{list ? "Empty list" : "Empty object"}</span>;
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-ink-2">
        {count} {list ? (count === 1 ? "item" : "items") : count === 1 ? "field" : "fields"}
      </summary>
      {open && (
        <div className="mt-2 border-l border-line pl-3">
          <ResponseValue value={value} />
        </div>
      )}
    </details>
  );
}

export function ResponseValue({ value }: { value: unknown }) {
  const [limit, setLimit] = useState(25);
  if (value === null) return <span className="text-ink-3">Null</span>;
  if (typeof value !== "object") {
    const text = typeof value === "boolean" ? (value ? "Yes" : "No") : value === "" ? "Empty string" : String(value);
    return <span className="whitespace-pre-wrap break-words text-sm">{text}</span>;
  }
  if (Array.isArray(value))
    return value.length ? (
      <div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {value.slice(0, limit).map((item, i) => (
            <li key={i}>
              {item && typeof item === "object" ? <Nested value={item} /> : <ResponseValue value={item} />}
            </li>
          ))}
        </ol>
        {limit < value.length && (
          <button className="mt-2 text-xs underline" onClick={() => setLimit(limit + 25)}>
            Show more items
          </button>
        )}
      </div>
    ) : (
      <span className="text-sm text-ink-3">Empty list</span>
    );
  const fields = Object.entries(value);
  if (fields.length === 1 && fields[0][0] === "json_blob__c" && typeof fields[0][1] === "string")
    return <ResponseValue value={decodeGraphBlob(fields[0][1])} />;
  if (!fields.length) return <span className="text-sm text-ink-3">Empty object</span>;
  return (
    <dl className="divide-y divide-line text-sm">
      {fields.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)] gap-3 py-2">
          <dt title={k} className="break-words text-ink-3">
            {fieldLabel(k)}
          </dt>
          <dd className="min-w-0 break-words">
            {k === "json_blob__c" && typeof v === "string" ? (
              <ResponseValue value={decodeGraphBlob(v)} />
            ) : v && typeof v === "object" ? (
              <Nested value={v} />
            ) : (
              <ResponseValue value={v} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
