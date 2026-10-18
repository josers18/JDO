import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { linkSearch, rootSearch } from "../../../shared/sqlAssist";
import type { QueryApiKind, QueryField, QueryGraphRoot, QueryObject, QuerySqlParameter } from "../../../shared/types";

interface Field {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[]; // a fixed list; otherwise free text
  check?: boolean;
  suggest?: (o: QueryObject) => boolean; // catalog names offered as you type
  min?: number; // a number input
  max?: number; // with pick, how many may be picked
  // With the object the call reads known, built from its fields rather than typed.
  pick?: "dimensions" | "measures" | "fields";
  build?: "filters" | "orderby";
  keyOf?: boolean; // one of the profile DMO's fields
  source?: "id" | "object"; // a data source, or one of its objects, the link DMO holds records from
}

const GRANULARITY = ["", "HOUR", "DAY", "MONTH", "QUARTER", "YEAR"];
const isProfile = (o: QueryObject) => (o.type === "DMO" || o.type === "Unified") && o.category === "Profile";
const isCi = (o: QueryObject) => o.type === "CI";
const PAGE: Field[] = [
  { key: "batchSize", label: "Batch size", placeholder: "default", min: 1, max: 4999 },
  { key: "offset", label: "Offset", placeholder: "0", min: 0 },
];

// One form per REST read. Field keys are the query parameter names the server sends on.
export const FORMS: Record<QueryApiKind, { label: string; call: string; about: string; fields: Field[] }> = {
  dataGraph: {
    label: "Data graph",
    call: "GET /ssot/data-graphs/data/{graph}[/{id}]",
    about: "One record and everything the graph joins to it, by the primary key or by lookup keys on any DMO in the graph.",
    fields: [
      { key: "graph", label: "Data graph", placeholder: "Account_DataGraph", suggest: (o) => o.type === "DG" },
      { key: "id", label: "Record ID", placeholder: "primary key of the primary DMO" },
      { key: "lookupKeys", label: "…or lookup keys", placeholder: "ssot__Account__dlm.ssot__Id__c=001…" },
      { key: "live", label: "Live lookup (by ID, not real-time graphs)", check: true },
    ],
  },
  insight: {
    label: "Insight",
    call: "GET /ssot/insight/calculated-insights/{ci}",
    about: "A calculated insight's dimensions and measures, filtered, sorted and rolled up by time.",
    fields: [
      { key: "ci", label: "Calculated insight", placeholder: "Spend__cio", suggest: isCi },
      { key: "timeGranularity", label: "Time granularity", options: GRANULARITY },
      ...PAGE,
      { key: "dimensions", label: "Dimensions", placeholder: "all · up to 10, comma-separated", pick: "dimensions", max: 10 },
      { key: "measures", label: "Measures", placeholder: "all · up to 5, comma-separated", pick: "measures", max: 5 },
      { key: "filters", label: "Filters", placeholder: "customer__c=001…,region__c=West", build: "filters" },
      { key: "orderby", label: "Order by", placeholder: "total__c DESC", build: "orderby" },
    ],
  },
  profile: {
    label: "Profile",
    call: "GET /ssot/profile/{dmo}[/{id}[/{child} | /calculated-insights/{ci}]]",
    about: "Profile-category DMOs by equality filters, one record by ID, its child records or its calculated insight values.",
    fields: [
      { key: "dmo", label: "Profile DMO", placeholder: "ssot__Individual__dlm", suggest: isProfile },
      { key: "id", label: "Record ID", placeholder: "optional · then filters are optional too" },
      { key: "child", label: "Child DMO", placeholder: "with an ID · ssot__ContactPointEmail__dlm", suggest: (o) => o.type === "DMO" },
      { key: "ci", label: "…or calculated insight", placeholder: "with an ID", suggest: isCi },
      { key: "searchKey", label: "Search key", placeholder: "with an ID · field the ID is matched on", keyOf: true },
      ...PAGE,
      { key: "fields", label: "Fields", placeholder: "10 by default · up to 50, comma-separated", pick: "fields", max: 50 },
      { key: "filters", label: "Filters", placeholder: "ssot__FirstName__c=Sarah", build: "filters" },
      { key: "orderby", label: "Order by", placeholder: "ssot__LastName__c DESC", build: "orderby" },
    ],
  },
  universalId: {
    label: "Universal ID",
    call: "GET /ssot/universalIdLookup/{entity}/{source}/{object}/{record}",
    about: "Every source record identity resolution unified with this one, through the unified link DMO.",
    fields: [
      { key: "entity", label: "Unified link DMO", placeholder: "UnifiedLinkssotAccountAcc__dlm", suggest: (o) => o.name.startsWith("UnifiedLink") },
      { key: "dataSourceId", label: "Data source", placeholder: "Salesforce_DCCDO1", source: "id" },
      { key: "dataSourceObjectId", label: "Source object", placeholder: "Account", source: "object" },
      { key: "sourceRecordId", label: "Source record ID", placeholder: "001…" },
    ],
  },
};

const PARTS = ["dimensions", "measures", "fields", "filters", "orderby"];
const INPUT = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-3 focus:ring-2 focus:ring-action/50";
const CELL = INPUT.replace("w-full ", ""); // sized by its place in a builder row

interface Props {
  kind: QueryApiKind;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onSend: () => void;
  objects: QueryObject[];
  search: RootSearch;
}

// Runs a root-record search as SQL (on the wire like any other call) and hands back its rows.
export type RootSearch = (sql: string, sqlParameters: QuerySqlParameter[]) => Promise<unknown[][]>;

// The object whose fields an insight or profile read picks, filters and sorts: the insight, or for a profile the child
// DMO or calculated insight it reads through, else the profile DMO itself.
function target(kind: QueryApiKind, v: Record<string, string>, objects: QueryObject[]) {
  const find = (name: string | undefined, is: (o: QueryObject) => boolean) => (name ? objects.find((o) => is(o) && o.name === name) : undefined);
  if (kind === "insight") return find(v.ci, isCi);
  if (kind === "profile") return find(v.child, (o) => o.type === "DMO") ?? find(v.ci, isCi) ?? find(v.dmo, isProfile);
}

// The form for a REST read; ⌘↵ sends it, like Run in the SQL editor.
export function ApiForm({ kind, values, onChange, onSend, objects, search }: Props) {
  const form = FORMS[kind];
  const ci = kind === "insight" ? objects.find((o) => o.type === "CI" && o.name === values.ci) : undefined;
  const dmo = kind === "profile" ? objects.find((o) => isProfile(o) && o.name === values.dmo) : undefined;
  const root = kind === "dataGraph" ? objects.find((o) => o.type === "DG" && o.name === values.graph)?.root : dmo?.root;
  const link = kind === "universalId" ? objects.find((o) => o.name.startsWith("UnifiedLink") && o.name === values.entity) : undefined;
  // The unified profile the link DMO resolves into names its source records.
  const unified = link && objects.find((o) => o.name === link.name.replace(/^UnifiedLink/, "Unified"))?.root;
  const latest = useRef(values);
  latest.current = values;

  // The data source and object pairs the link DMO holds records from, with how many of each.
  const [pairs, setPairs] = useState<[string, string, number][]>([]);
  useEffect(() => {
    setPairs([]);
    if (!link) return;
    let live = true;
    const by = "ssot__DataSourceId__c, ssot__DataSourceObjectId__c";
    search(`SELECT ${by}, COUNT(*) FROM ${link.name} GROUP BY ${by} ORDER BY ${by}`, [])
      .then((r) => {
        if (!live) return;
        const got = r.map(([s, o, n]) => [String(s ?? ""), String(o ?? ""), Number(n)] as [string, string, number]);
        setPairs(got);
        // With none chosen yet, start on the source holding the most records.
        const top = [...got].sort((a, b) => b[2] - a[2])[0];
        const v = latest.current;
        if (top && !v.dataSourceId) onChange({ ...v, dataSourceId: top[0], dataSourceObjectId: top[1] });
      })
      .catch(() => live && setPairs([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.name, search]);
  const sources = [...new Set(pairs.map(([s]) => s))].map((s) => [s, pairs.reduce((n, p) => n + (p[0] === s ? p[2] : 0), 0)] as const);
  const sourceObjects = pairs.filter(([s]) => s === values.dataSourceId).map(([, o, n]) => [o, n] as const);

  const set = (key: string, v: string) => {
    const next = { ...values, [key]: v };
    // Another link DMO holds other sources; another source, other objects and records.
    if (kind === "universalId" && key === "entity") for (const k of ["dataSourceId", "dataSourceObjectId", "sourceRecordId"]) delete next[k];
    if (kind === "universalId" && key === "dataSourceId") {
      next.dataSourceObjectId = pairs.find(([s]) => s === v)?.[1] ?? "";
      delete next.sourceRecordId;
    }
    if (kind === "universalId" && key === "dataSourceObjectId") delete next.sourceRecordId;
    // Picks and filters name the old object's fields, so reading another object starts them over.
    const before = target(kind, values, objects);
    if (before && before.name !== target(kind, next, objects)?.name) for (const k of PARTS) delete next[k];
    onChange(next);
  };
  const read = target(kind, values, objects);
  // With the object known, picks, filters and sorts get a full-width builder below the inputs.
  const built = (f: Field) => Boolean(read && (f.pick || f.build));
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSend();
        }
      }}
      className="px-3 pb-1 pt-3"
    >
      <p className="mb-2.5 text-xs text-ink-2">{form.about}</p>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 2xl:grid-cols-3">
        {form.fields
          .filter((f) => !built(f))
          .map((f) => {
            const id = `api-${kind}-${f.key}`;
            if (f.check)
              return (
                <label key={f.key} className="flex items-center gap-2 self-end pb-1.5 text-xs text-ink-2">
                  <input type="checkbox" checked={values[f.key] === "true"} onChange={(e) => set(f.key, e.target.checked ? "true" : "")} className="accent-[var(--action)]" />
                  {f.label}
                </label>
              );
            const counted = f.source && pairs.length ? (f.source === "id" ? sources : sourceObjects) : undefined;
            if (counted) {
              const v = values[f.key] ?? "";
              return (
                <label key={f.key} htmlFor={id} className="block text-xs font-semibold text-ink-2">
                  {f.label}
                  <select id={id} value={v} onChange={(e) => set(f.key, e.target.value)} className={`${INPUT} mt-1`}>
                    {/* A value from history the link DMO no longer holds stays chosen until changed. */}
                    {!counted.some(([o]) => o === v) && <option value={v}>{v || "none"}</option>}
                    {counted.map(([o, n]) => (
                      <option key={o} value={o}>
                        {o} · {n.toLocaleString()} record{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            const options = f.options ?? (f.keyOf && dmo ? ["", ...dmo.fields.map((x) => x.name).sort()] : undefined);
            return (
              <label key={f.key} htmlFor={id} className="block text-xs font-semibold text-ink-2">
                {f.label}
                {options ? (
                  <select
                    id={id}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    // Granularity rolls up a date dimension; an insight without one has nothing to roll up.
                    disabled={f.key === "timeGranularity" && ci && !ci.fields.some((x) => /DATE/i.test(x.type))}
                    title={f.key === "timeGranularity" && ci && !ci.fields.some((x) => /DATE/i.test(x.type)) ? `${ci.name} has no date dimension` : undefined}
                    className={`${INPUT} mt-1 disabled:opacity-50`}
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o || (f.keyOf ? "primary key" : "none")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.min !== undefined ? "number" : undefined}
                    min={f.min}
                    max={f.min !== undefined ? f.max : undefined}
                    list={f.suggest ? `${id}-list` : undefined}
                    spellCheck={false}
                    autoComplete="off"
                    className={`${INPUT} mt-1`}
                  />
                )}
                {f.suggest && (
                  <datalist id={`${id}-list`}>
                    {objects.filter(f.suggest).map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.label}
                      </option>
                    ))}
                  </datalist>
                )}
              </label>
            );
          })}
      </div>
      {root && (
        <RootPicker
          key={root.object}
          root={root}
          search={search}
          // A data graph: ID wins over lookup keys on the server, so a pick fills one and clears the other.
          onPick={(id) => onChange(kind === "dataGraph" ? { ...values, id, lookupKeys: "" } : { ...values, id })}
          onLookup={kind === "dataGraph" ? (id) => onChange({ ...values, id: "", lookupKeys: `${root.object}.${root.key}=${id}` }) : undefined}
        />
      )}
      {link && values.dataSourceId && values.dataSourceObjectId && (
        <RootPicker
          key={`${link.name}/${values.dataSourceId}/${values.dataSourceObjectId}`}
          root={{ object: link.name, key: "SourceRecordId__c", show: unified?.show ?? [] }}
          query={(t) => linkSearch(link.name, unified, values.dataSourceId, values.dataSourceObjectId, t)}
          placeholder={`Find a ${values.dataSourceId} ${values.dataSourceObjectId} record by ${unified?.show.length ? "unified name or " : ""}source record ID`}
          search={search}
          onPick={(id) => onChange({ ...values, sourceRecordId: id })}
        />
      )}
      {read && form.fields.some(built) && (
        <div className="mt-3 space-y-3">
          {form.fields.filter(built).map((f) => (
            <div key={f.key}>
              {f.pick ? (
                <Chips
                  label={f.label}
                  fields={f.pick === "fields" ? read.fields : read.fields.filter((x) => (read.measures ?? []).includes(x.name) === (f.pick === "measures"))}
                  value={values[f.key] ?? ""}
                  max={f.max!}
                  // The Profile API returns 10 fields when none are named; the insight API, every one.
                  unpicked={f.pick === "fields" ? "10 by default" : undefined}
                  onChange={(v) => set(f.key, v)}
                />
              ) : (
                <Builder
                  key={read.name}
                  kind={f.build!}
                  label={f.label}
                  object={read}
                  // The Profile API matches filters only by equality.
                  ops={kind === "profile" ? ["="] : undefined}
                  value={values[f.key] ?? ""}
                  search={search}
                  onChange={(v) => set(f.key, v)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Finds records of the graph's root DMO (or the profile DMO) by name or key, to use as the record ID or, for a graph,
// as a lookup key.
function RootPicker({ root, query, placeholder, search, onPick, onLookup }: {
  root: QueryGraphRoot;
  query?: (text: string) => { sql: string; sqlParameters: QuerySqlParameter[] }; // in place of a root search
  placeholder?: string;
  search: RootSearch;
  onPick: (id: string) => void;
  onLookup?: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query ? query(text) : rootSearch(root, text);
  const sig = JSON.stringify(q); // searches again only when the SQL or its parameters change

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const r = await search(q.sql, q.sqlParameters);
          if (live) setRows(r);
        } catch (e) {
          if (live) setError((e as Error).message);
        } finally {
          if (live) setLoading(false);
        }
      },
      text ? 350 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, search]);

  const pick = "rounded-md px-2 py-0.5 text-xs font-semibold text-action ring-1 ring-line hover:bg-tint";
  return (
    <div className="mt-3 rounded-xl border border-line">
      <label className="flex items-center gap-2 border-b border-line px-2.5">
        {loading ? <Loader2 size={13} className="shrink-0 animate-spin text-ink-3" /> : <Search size={13} className="shrink-0 text-ink-3" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? `Find a ${root.object} record by ${root.show.length ? `${root.show.join(", ")} or ` : ""}${root.key}`}
          aria-label="Find a root record"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-3"
        />
      </label>
      {error && <p className="px-2.5 py-1.5 text-xs text-err">{error}</p>}
      {rows && !rows.length && !error && <p className="px-2.5 py-1.5 text-xs text-ink-3">No {root.object} records match.</p>}
      {rows && rows.length > 0 && (
        // The last results stay while the next search runs, dimmed so they don't read as its matches.
        <ul aria-busy={loading} className={`max-h-48 overflow-y-auto py-1 transition-opacity ${loading ? "opacity-40" : ""}`}>
          {rows.map((r, i) => {
            const id = String(r[0] ?? "");
            const name = r.slice(1).filter((v) => v !== null && v !== "").join(" ");
            return (
              <li key={i} className="flex items-center gap-2 px-2.5 py-1 hover:bg-tint/60">
                <span className="min-w-0 flex-1 truncate text-xs">
                  {name && <span className="mr-2 text-ink">{name}</span>}
                  <span className="font-mono text-ink-3">{id}</span>
                </span>
                <button onClick={() => onPick(id)} title={`Look up ${id} by ${root.key}`} className={pick}>
                  Record ID
                </button>
                {onLookup && (
                  <button onClick={() => onLookup(id)} title={`${root.object}.${root.key}=${id}`} className={pick}>
                    Lookup key
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const names = (v: string) => v.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);

const byLabel = (a: QueryField, b: QueryField) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
const MANY = 16; // past this, fields are searched for rather than all laid out

// The fields a read returns, in the order picked; none picked means the API's default, all of them unless unpicked says
// otherwise. A few show as toggles; many as the picked ones plus a search to add more.
function Chips({ label, fields, value, max, unpicked, onChange }: { label: string; fields: QueryField[]; value: string; max: number; unpicked?: string; onChange: (v: string) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picked = names(value);
  const full = picked.length >= max;
  const sorted = [...fields].sort(byLabel);
  const toggle = (name: string) => onChange((picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name]).join(","));
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-0.5 font-mono text-xs ring-1 disabled:opacity-40 ${on ? "bg-action text-action-ink ring-action" : "text-ink-2 ring-line hover:bg-tint hover:text-ink"}`;

  const q = text.trim().toLowerCase();
  const matches = sorted.filter((f) => !q || f.label.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  const unpickedMatches = matches.filter((f) => !picked.includes(f.name));
  // Checks every field the search shows, as many as the limit leaves room for.
  const checkAll = () => onChange([...picked, ...unpickedMatches.slice(0, max - picked.length).map((f) => f.name)].join(","));
  const byName = new Map(fields.map((f) => [f.name, f]));

  return (
    <fieldset>
      <legend className="flex w-full items-baseline gap-2 text-xs font-semibold text-ink-2">
        {label}
        <span className="font-normal text-ink-3">
          {picked.length ? `${picked.length} of ${fields.length}` : unpicked ?? `all ${fields.length}`}
          {fields.length > max && ` · up to ${max}`}
        </span>
        {picked.length > 0 && (
          <button onClick={() => onChange("")} className="ml-auto font-normal text-action hover:underline">
            {unpicked ? "Reset" : "Use all"}
          </button>
        )}
      </legend>
      {!fields.length && <p className="mt-1 text-xs text-ink-3">None in this insight.</p>}
      {fields.length > 0 && fields.length <= MANY && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {sorted.map((f) => {
            const on = picked.includes(f.name);
            return (
              <button key={f.name} aria-pressed={on} disabled={!on && full} onClick={() => toggle(f.name)} title={!on && full ? `Up to ${max}` : `${f.name} · ${f.type}`} className={chip(on)}>
                {f.label}
              </button>
            );
          })}
        </div>
      )}
      {fields.length > MANY && (
        <div className="relative mt-1">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-1.5 py-1 focus-within:ring-2 focus-within:ring-action/50">
            {picked.map((n) => (
              <span key={n} title={n} className="flex items-center gap-1 rounded-full bg-action py-0.5 pl-2.5 pr-1 font-mono text-xs text-action-ink">
                {byName.get(n)?.label ?? n}
                <button onClick={() => toggle(n)} aria-label={`Remove ${n}`} className="rounded-full p-0.5 hover:bg-black/10">
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              ref={input}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && unpickedMatches[0] && !full) {
                  e.preventDefault();
                  toggle(unpickedMatches[0].name);
                  setText("");
                }
                if (e.key === "Backspace" && !text && picked.length) toggle(picked[picked.length - 1]);
              }}
              placeholder={full ? `${max} picked, the most it takes` : `Search ${fields.length} fields to check…`}
              aria-label={`Add to ${label}`}
              spellCheck={false}
              autoComplete="off"
              className="min-w-40 flex-1 bg-transparent px-1 py-0.5 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-3"
            />
          </div>
          {open && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              <div className="flex items-center gap-3 border-b border-line px-2.5 py-1 text-xs text-ink-3">
                <span className="mr-auto">
                  {matches.length} {q ? "matching" : "fields"} · {picked.length} checked
                </span>
                {/* mousedown, before the input's blur closes the list */}
                <button onMouseDown={(e) => (e.preventDefault(), checkAll())} disabled={full || !unpickedMatches.length} className="font-semibold text-action hover:underline disabled:opacity-40">
                  Check {q ? "all shown" : "all"}
                </button>
                <button onMouseDown={(e) => (e.preventDefault(), input.current?.blur())} className="font-semibold text-ink-2 hover:text-ink">
                  Done
                </button>
              </div>
              <ul role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto py-1">
                {!matches.length && <li className="px-2.5 py-1 text-xs text-ink-3">No fields match.</li>}
                {matches.map((f) => {
                  const on = picked.includes(f.name);
                  const off = !on && full;
                  return (
                    <li
                      key={f.name}
                      role="option"
                      aria-selected={on}
                      aria-disabled={off}
                      // Toggles in place, the list and the search kept, so several can be checked in a row.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!off) toggle(f.name);
                      }}
                      title={off ? `Up to ${max}` : undefined}
                      className={`flex items-center gap-2 px-2.5 py-1 ${off ? "opacity-40" : "cursor-pointer hover:bg-tint"}`}
                    >
                      <input type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden className="pointer-events-none shrink-0 accent-[var(--action)]" />
                      <span className="text-xs text-ink">{f.label}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-3">{f.name}</span>
                      <span className="shrink-0 text-xs text-ink-3">{f.type}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

interface Row {
  field: string;
  value: string; // the filter value, or ASC / DESC
  op?: string; // a filter's comparison
}

// The insight API compares text only for equality; numbers and dates (YYYY-MM-DD) take ranges too.
const OPS = ["=", "!=", ">", ">=", "<", "<="];
const TEXT_OPS = ["=", "!="];
const kindOf = (f?: QueryField) => (!f ? "text" : /NUMBER|DOUBLE|INT|DECIMAL|CURRENCY|PERCENT/i.test(f.type) ? "number" : /DATE/i.test(f.type) ? "date" : "text");

const parse = (kind: "filters" | "orderby", v: string): Row[] =>
  names(v).map((x) => {
    if (kind === "orderby") {
      const [field, dir] = x.split(/\s+/);
      return { field, value: dir?.toUpperCase() === "DESC" ? "DESC" : "ASC" };
    }
    const m = /^(.+?)(!=|>=|<=|=|>|<)(.*)$/.exec(x);
    return m ? { field: m[1].trim(), op: m[2], value: m[3].trim() } : { field: x, op: "=", value: "" };
  });

// The API rejects a bare integer zero ("Not supported number value"), though it takes 0.0, 1 and -5.
const zero = (f: QueryField | undefined, v: string) => (kindOf(f) === "number" && /^-?0+$/.test(v) ? "0.0" : v);

const serialize = (kind: "filters" | "orderby", rows: Row[], fields: QueryField[]) =>
  rows
    .filter((r) => r.field && r.value)
    .map((r) => (kind === "orderby" ? `${r.field} ${r.value}` : `${r.field}${r.op ?? "="}${zero(fields.find((f) => f.name === r.field), r.value)}`))
    .join(",");

// Filters (field = value) or sort keys (field, direction), a row each, written to the parameter the API takes.
function Builder({ kind, label, object, ops, value, search, onChange }: { kind: "filters" | "orderby"; label: string; object: QueryObject; ops?: string[]; value: string; search: RootSearch; onChange: (v: string) => void }) {
  const [rows, setRows] = useState<Row[]>(() => parse(kind, value));
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const asked = useRef(new Set<string>());

  // The value changed from outside (Clear, history), not from these rows.
  useEffect(() => {
    if (serialize(kind, rows, object.fields) !== value) setRows(parse(kind, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // A text field's values, read once, offered as you type the filter value.
  useEffect(() => {
    if (kind !== "filters") return;
    for (const { field } of rows) {
      const f = object.fields.find((x) => x.name === field);
      if (!f || asked.current.has(field) || (object.measures ?? []).includes(field) || kindOf(f) !== "text") continue;
      asked.current.add(field);
      search(`SELECT DISTINCT ${field} FROM ${object.name} WHERE ${field} IS NOT NULL ORDER BY ${field} LIMIT 200`, [])
        .then((r) => setOptions((o) => ({ ...o, [field]: r.map((x) => String(x[0])) })))
        .catch(() => {});
    }
  }, [kind, rows, object, search]);

  const update = (next: Row[]) => {
    setRows(next);
    onChange(serialize(kind, next, object.fields));
  };
  const edit = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // A sort key is used once; a filter field can repeat, for a range.
  const unused = object.fields.find((f) => !rows.some((r) => r.field === f.name))?.name ?? (kind === "filters" ? (object.fields[0]?.name ?? "") : "");
  const seg = (on: boolean) => `px-2 py-1 text-xs font-semibold ${on ? "bg-action text-action-ink" : "text-ink-2 hover:bg-tint"}`;

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-ink-2">
        {label} {!rows.length && <span className="font-normal text-ink-3">{kind === "filters" ? "· none, every row" : "· the API's order"}</span>}
      </legend>
      <div className="mt-1 space-y-1.5">
        {rows.map((r, i) => {
          const type = kindOf(object.fields.find((f) => f.name === r.field));
          return (
            <div key={i} className="flex items-center gap-2">
              <select
                value={r.field}
                onChange={(e) => {
                  const next = object.fields.find((f) => f.name === e.target.value);
                  const same = kindOf(next) === type;
                  // Another type of field can't keep the comparison or value it can't take.
                  edit(i, same ? { field: e.target.value } : { field: e.target.value, value: kind === "orderby" ? r.value : "", op: kindOf(next) === "text" && !TEXT_OPS.includes(r.op ?? "=") ? "=" : r.op });
                }}
                aria-label={`${label} field`}
                className={`${CELL} w-64 shrink-0`}
              >
                {!r.field && <option value="">field…</option>}
                {[...object.fields].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              {kind === "filters" ? (
                <>
                  <select
                    value={r.op ?? "="}
                    onChange={(e) => edit(i, { op: e.target.value })}
                    aria-label="Comparison"
                    disabled={ops?.length === 1}
                    title={ops?.length === 1 ? "This API matches only by equality" : type === "text" ? "Text compares only for equality" : undefined}
                    className={`${CELL} w-16 shrink-0`}
                  >
                    {(ops ?? (type === "text" ? TEXT_OPS : OPS)).map((o) => (
                      <option key={o} value={o}>
                        {o === "!=" ? "≠" : o === ">=" ? "≥" : o === "<=" ? "≤" : o}
                      </option>
                    ))}
                  </select>
                  <input
                    value={r.value}
                    onChange={(e) => edit(i, { value: e.target.value })}
                    type={type}
                    placeholder="value"
                    aria-label="Filter value"
                    list={options[r.field]?.length ? `filter-${object.name}-${r.field}` : undefined}
                    spellCheck={false}
                    autoComplete="off"
                    className={`${CELL} min-w-0 flex-1`}
                  />
                  {options[r.field] && (
                    <datalist id={`filter-${object.name}-${r.field}`}>
                      {options[r.field].map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  )}
                </>
              ) : (
                <div role="group" aria-label="Direction" className="flex overflow-hidden rounded-lg ring-1 ring-line">
                  {["ASC", "DESC"].map((d) => (
                    <button key={d} aria-pressed={r.value === d} onClick={() => edit(i, { value: d })} className={seg(r.value === d)}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => update(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.field || "row"}`} title="Remove" className="rounded-md p-1 text-ink-3 hover:bg-tint hover:text-ink">
                <X size={14} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => update([...rows, { field: unused, op: "=", value: kind === "orderby" ? ((object.measures ?? []).includes(unused) ? "DESC" : "ASC") : "" }])}
          disabled={!unused}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-action hover:bg-tint disabled:opacity-40"
        >
          <Plus size={13} /> {kind === "filters" ? "Add filter" : "Add sort"}
        </button>
      </div>
    </fieldset>
  );
}
