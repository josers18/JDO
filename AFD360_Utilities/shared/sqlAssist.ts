import type { QueryObject } from "./types.ts";

// What the Query editor's autocomplete reads from the SQL around the cursor.

const NOT_ALIAS = new Set(
  "where join inner left right full outer cross on using group order by limit offset having union except intersect and or as select from with qualify window".split(" "),
);

export interface TableRef {
  table: string;
  alias?: string;
}

// The objects a statement reads (FROM and JOIN), with their aliases: `FROM ssot__Account__dlm a JOIN x AS b`.
export function tablesIn(sql: string): TableRef[] {
  const refs: TableRef[] = [];
  const re = /\b(?:from|join)\s+("?)([A-Za-z_][\w]*)\1(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi;
  for (const m of sql.matchAll(re)) {
    const alias = m[3] && !NOT_ALIAS.has(m[3].toLowerCase()) ? m[3] : undefined;
    refs.push({ table: m[2]!, alias });
  }
  return refs;
}

// The words people type for an object: its label, and its API name without the ssot__ prefix and __dlm-style suffix.
const plain = (name: string) => name.replace(/^ssot__/i, "").replace(/__(dlm|dll|cio)$/i, "").toLowerCase();

const TYPE_ORDER = ["DMO", "Unified", "CI", "DLO"];
const typeRank = (o: QueryObject) => TYPE_ORDER.indexOf(o.type);

// Best matches for a typed word: exact, then label or plain-name prefix, then a word inside either, then substring.
// So `account` puts ssot__Account__dlm (label Account) ahead of AccountContact and anything that merely mentions it.
export function rankObjects(objects: QueryObject[], typed: string, max = 50): QueryObject[] {
  const w = typed.toLowerCase().replace(/^"/, "");
  if (!w) return objects.slice(0, max);
  const score = (o: QueryObject) => {
    const label = o.label.toLowerCase();
    const name = o.name.toLowerCase();
    const short = plain(o.name);
    if (label === w || short === w || name === w) return 0;
    if (label.startsWith(w) || short.startsWith(w) || name.startsWith(w)) return 1;
    if (label.split(/[\s_]+/).some((p) => p.startsWith(w)) || short.split("_").some((p) => p.startsWith(w))) return 2;
    if (label.includes(w) || name.includes(w)) return 3;
    return -1;
  };
  return objects
    .map((o) => ({ o, s: score(o) }))
    .filter((x) => x.s >= 0)
    // Within a tier: DMOs before DLOs, then shorter names (the canonical object, not its variants).
    .sort((a, b) => a.s - b.s || typeRank(a.o) - typeRank(b.o) || a.o.name.length - b.o.name.length)
    .slice(0, max)
    .map((x) => x.o);
}

export type Completing =
  | { kind: "object"; typed: string } // after FROM / JOIN
  | { kind: "field"; typed: string; of: string } // after `alias.` or `table.`
  | { kind: "any"; typed: string }; // anywhere else: fields of the objects in the statement, then keywords

// What the cursor is completing, from the text before it.
export function completing(before: string): Completing {
  const dotted = /([A-Za-z_]\w*)\.("?\w*)$/.exec(before);
  if (dotted) return { kind: "field", of: dotted[1]!, typed: dotted[2]!.replace(/^"/, "") };
  const word = /("?\w*)$/.exec(before)![1]!;
  const prior = before.slice(0, before.length - word.length);
  if (/\b(from|join)\s+$/i.test(prior)) return { kind: "object", typed: word.replace(/^"/, "") };
  return { kind: "any", typed: word.replace(/^"/, "") };
}

// The object an alias or table name in the statement points at.
export function resolveRef(sql: string, ref: string): string | undefined {
  const r = ref.toLowerCase();
  return tablesIn(sql).find((t) => t.alias?.toLowerCase() === r || t.table.toLowerCase() === r)?.table;
}

const CLAUSE = /\b(select|group\s+by|order\s+by|from|join|where|having|limit|on)\b/gi;
const LIST_START = new Set(["select", "by", "distinct", "all"]);
const LIST_END = new Set("from where group order limit having union except intersect offset window qualify asc desc".split(" "));

export interface Insertion {
  back: number; // characters before the drop point the text replaces (whitespace)
  fwd: number; // characters after it
  text: string;
}

// A name dropped (or inserted) between `before` and `after`. In a SELECT, GROUP BY or ORDER BY list it joins the
// list with a comma on the right side; elsewhere it gets a space wherever it would run into another word.
export function insertion(before: string, after: string, name: string): Insertion {
  const touchBefore = /[\w"]$/.test(before);
  const touchAfter = /^[\w"]/.test(after);
  const clause = [...before.matchAll(CLAUSE)].at(-1)?.[1]?.toLowerCase().replace(/\s+/, " ");
  if (clause === "select" || clause === "group by" || clause === "order by") {
    const prev = before.trimEnd();
    const next = after.trimStart();
    const prevItem = /[\w")*]$/.test(prev) && !LIST_START.has(/(\w+)$/.exec(prev)?.[1]?.toLowerCase() ?? "");
    const nextItem = /^[\w"(*]/.test(next) && !LIST_END.has(/^(\w+)/.exec(next)?.[1]?.toLowerCase() ?? "");
    if (prevItem) return { back: before.length - prev.length, fwd: 0, text: `, ${name}${touchAfter ? " " : ""}` };
    if (nextItem) return { back: 0, fwd: after.length - next.length, text: `${/[\w",]$/.test(before) ? " " : ""}${name}, ` };
  }
  return { back: 0, fwd: 0, text: `${touchBefore ? " " : ""}${name}${touchAfter ? " " : ""}` };
}
