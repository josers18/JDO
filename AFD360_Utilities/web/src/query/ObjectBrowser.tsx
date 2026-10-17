import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Play, RefreshCw, Search } from "lucide-react";
import { rankObjects } from "../../../shared/sqlAssist";
import { DRAG_FROM, DRAG_TYPE } from "./SqlEditor";
import type { QueryCatalog, QueryObject, QueryObjectType } from "../../../shared/types";

const TYPES: { type: QueryObjectType; label: string; hint: string }[] = [
  { type: "DMO", label: "DMO", hint: "Data model objects" },
  { type: "Unified", label: "Unified", hint: "Unified profiles and their link objects" },
  { type: "CI", label: "CI", hint: "Calculated insights" },
  { type: "DLO", label: "DLO", hint: "Data lake objects" },
];

// Dragged into the SQL editor, a name lands where it is dropped. A field also carries its object, so dropping it
// into an empty editor can write the whole query.
const dragName = (name: string, from?: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData(DRAG_TYPE, name);
  if (from) e.dataTransfer.setData(DRAG_FROM, from);
  e.dataTransfer.setData("text/plain", name);
  e.dataTransfer.effectAllowed = "copy";
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

interface Props {
  orgName: string;
  dataSpaces: string[];
  dataspace: string;
  onDataspace: (d: string) => void;
  catalog: QueryCatalog | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (o: QueryObject) => void;
  onField: (name: string) => void;
}

// Every queryable object in the data space, grouped by type then category. Clicking one lists its fields (clicking a
// field, or dragging it into the editor, puts it in the SQL); double-clicking it, or its play button, queries it.
export function ObjectBrowser(p: Props) {
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<Set<QueryObjectType>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const objects = useMemo(() => {
    const all = (p.catalog?.objects ?? []).filter((o) => !types.size || types.has(o.type));
    return search.trim() ? rankObjects(all, search.trim(), 200) : all;
  }, [p.catalog, types, search]);

  const counts = useMemo(() => {
    const c = new Map<QueryObjectType, number>();
    for (const o of p.catalog?.objects ?? []) c.set(o.type, (c.get(o.type) ?? 0) + 1);
    return c;
  }, [p.catalog]);

  // While searching, results stay in rank order; otherwise they group under type · category.
  const groups = useMemo(() => {
    if (search.trim()) return [{ key: "results", title: `${objects.length} match${objects.length === 1 ? "" : "es"}`, items: objects }];
    const map = new Map<string, QueryObject[]>();
    for (const t of TYPES) for (const o of objects.filter((x) => x.type === t.type)) {
      const key = `${t.label} · ${o.category || "Other"}`;
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map].map(([key, items]) => ({ key, title: key, items }));
  }, [objects, search]);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col bg-side text-side-ink 2xl:w-80">
      <div className="space-y-2 px-3 pb-3 pt-4">
        <h2 className="text-sm font-semibold">
          Data 360 objects <span className="font-normal text-side-ink-2">· {p.orgName}</span>
        </h2>
        <label className="flex items-center gap-2 text-xs text-side-ink-2">
          Data space
          <select
            value={p.dataspace}
            onChange={(e) => p.onDataspace(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-side-line bg-side-2 px-2 py-1.5 font-mono text-xs text-side-ink"
          >
            {(p.dataSpaces.length ? p.dataSpaces : [p.dataspace]).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-side-line bg-side-2 px-2.5 focus-within:ring-2 focus-within:ring-action/60">
          <Search size={14} className="shrink-0 text-side-ink-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search objects (account, individual…)"
            className="min-w-0 flex-1 bg-transparent py-2 text-xs text-side-ink outline-none placeholder:text-side-ink-2"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <button
              key={t.type}
              title={t.hint}
              aria-pressed={types.has(t.type)}
              onClick={() => setTypes(toggle(types, t.type))}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-side-line ${
                types.has(t.type) ? "bg-action text-action-ink ring-action" : "text-side-ink-2 hover:text-side-ink"
              }`}
            >
              {t.label} <span className="font-mono font-normal">{counts.get(t.type) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-side-line px-2 py-2">
        {p.loading && (
          <div className="flex items-center gap-2 p-2 text-xs text-side-ink-2">
            <Loader2 size={14} className="animate-spin" /> Reading DMO, DLO and calculated insight metadata…
          </div>
        )}
        {p.error && <p className="p-2 text-xs text-err">{p.error}</p>}
        {!p.loading && p.catalog && !objects.length && <p className="p-2 text-xs text-side-ink-2">No objects match.</p>}
        {groups.map((g) => {
          const isOpen = Boolean(search.trim()) || openGroups.has(g.key);
          return (
            <div key={g.key} className="py-0.5">
              <button
                onClick={() => setOpenGroups(toggle(openGroups, g.key))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-side-ink-2 hover:text-side-ink"
              >
                <ChevronRight size={13} className={`shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                {!search.trim() && <span className="font-mono font-normal">{g.items.length}</span>}
              </button>
              {isOpen &&
                g.items.map((o) => (
                  <div key={o.name}>
                    <div className={`group flex items-start gap-1 rounded-xl ${expanded === o.name ? "bg-side-2" : "hover:bg-side-2/60"}`}>
                      <ChevronRight size={13} aria-hidden className={`ml-1 mt-2.5 shrink-0 text-side-ink-2 transition-transform ${expanded === o.name ? "rotate-90" : ""}`} />
                      <button
                        // A click selects and shows the fields; a double-click queries and leaves them open.
                        onClick={(e) => e.detail < 2 && setExpanded(expanded === o.name ? null : o.name)}
                        onDoubleClick={() => {
                          setExpanded(o.name);
                          p.onOpen(o);
                        }}
                        draggable
                        onDragStart={dragName(o.name)}
                        aria-expanded={expanded === o.name}
                        title={`${o.name}: click for fields, double-click to query, drag into the editor`}
                        className="min-w-0 flex-1 py-1.5 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
                          <span className="shrink-0 rounded bg-side-2 px-1 text-xs font-semibold text-side-ink-2 ring-1 ring-side-line">{o.type}</span>
                        </div>
                        <div className="truncate font-mono text-xs text-side-ink-2">{o.name}</div>
                      </button>
                      <button
                        onClick={() => p.onOpen(o)}
                        aria-label={`Query ${o.name}`}
                        title={`Query ${o.name}`}
                        className={`mr-1 mt-1.5 shrink-0 rounded-md p-1 text-action hover:bg-side ${expanded === o.name ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
                      >
                        <Play size={12} />
                      </button>
                    </div>
                    {expanded === o.name && (
                      <ul className="mb-1 ml-6 border-l border-side-line pl-2">
                        {o.fields.length === 0 && <li className="py-1 text-xs text-side-ink-2">No fields listed.</li>}
                        {o.fields.map((f) => (
                          <li key={f.name}>
                            <button
                              onClick={() => p.onField(f.name)}
                              draggable
                              onDragStart={dragName(f.name, o.name)}
                              title={`Click to insert ${f.name} at the cursor, or drag it into the editor`}
                              className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-side-2/60"
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                              <span className="shrink-0 text-xs text-side-ink-2">{f.type}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-side-line px-3 py-2 text-xs text-side-ink-2">
        <span className="min-w-0 flex-1 truncate">
          {p.catalog ? `${p.catalog.objects.length} objects · loaded ${ago(p.catalog.loadedAt)}` : "Catalog not loaded"}
        </span>
        <button onClick={p.onRefresh} disabled={p.loading} title="Reload the catalog from Data 360" className="rounded-md p-1 hover:bg-side-2 hover:text-side-ink disabled:opacity-50">
          <RefreshCw size={13} className={p.loading ? "animate-spin" : ""} />
        </button>
      </div>
    </aside>
  );
}
