import type { QueryGraphRoot, QueryObject, QuerySqlParameter } from "./types.ts";

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

const TYPE_ORDER = ["DMO", "Unified", "CI", "DLO", "SI", "DG"];
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

// The named parameters a statement uses (`:acct`), in order, once each. String literals, quoted identifiers, comments
// and `::type` casts don't count.
export function sqlParams(sql: string): string[] {
  const code = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  return [...new Set([...code.matchAll(/(?<![:\w]):([A-Za-z_]\w*)/g)].map((m) => m[1]))];
}

// The statement with strings, quoted names and parenthesized text blanked to `_` (comments to spaces), same length,
// so clause keywords and commas found in it are the top-level ones.
function topLevel(sql: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end < 0 ? sql.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out += " ".repeat(stop - i);
      i = stop - 1;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length && (sql[j] !== c || sql[j + 1] === c)) j += sql[j] === c ? 2 : 1;
      out += "_".repeat(Math.min(j, sql.length - 1) - i + 1);
      i = j;
    } else if (c === "(") {
      out += depth ? "_" : c;
      depth++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
      out += depth ? "_" : c;
    } else out += depth ? "_" : c;
  }
  return out;
}

const AGGREGATE = /\b(sum|count|avg|min|max|median|mode|stddev\w*|variance|var_\w+|array_agg|string_agg|listagg|bool_and|bool_or|every|any_value|approx_\w+|percentile_\w+)\s*\(/i;
const AFTER_GROUP = /\b(having|order\s+by|limit|offset|window|qualify|union|except|intersect)\b|;/i;
const AFTER_WHERE = /\b(group\s+by|having|order\s+by|limit|offset|window|qualify|union|except|intersect)\b|;/i;

// A field clicked in the object browser, added as the last item of the statement's SELECT list (in place of a bare
// `*`). When the query aggregates or already groups, the field joins GROUP BY too, so the statement stays valid.
// With several objects in FROM it is qualified by its object's alias. Null when there is no SELECT ... FROM to add to.
export function addToSelect(sql: string, field: string, object?: string): string | null {
  const top = topLevel(sql);
  const select = /\bselect\b(\s+(?:distinct|all)\b)?/i.exec(top);
  if (!select) return null;
  const listStart = select.index + select[0].length;
  const fromAt = top.slice(listStart).search(/\bfrom\b/i);
  if (fromAt < 0) return null;
  const listEnd = listStart + fromAt;

  const refs = tablesIn(sql);
  const ref = object ? refs.find((r) => r.table.toLowerCase() === object.toLowerCase()) : undefined;
  const name = refs.length > 1 && ref ? `${ref.alias ?? ref.table}.${field}` : field;

  // The select items, by top-level commas.
  const items: { start: number; end: number }[] = [];
  let at = listStart;
  for (let i = listStart; i <= listEnd; i++) {
    if (i === listEnd || top[i] === ",") {
      const raw = sql.slice(at, i);
      const lead = raw.length - raw.trimStart().length;
      items.push({ start: at + lead, end: at + raw.trimEnd().length });
      at = i + 1;
    }
  }
  const texts = items.map((it) => sql.slice(it.start, it.end));
  const bare = (t: string) => t.replace(/"/g, "").split(".").at(-1)!.toLowerCase();
  if (texts.some((t) => bare(t) === field.toLowerCase())) return sql;

  const last = items.at(-1)!;
  const onlyStar = texts.length === 1 && texts[0] === "*";
  let out = onlyStar
    ? sql.slice(0, last.start) + name + sql.slice(last.end)
    : last.end <= last.start
      ? sql.slice(0, listStart) + ` ${name}` + sql.slice(last.end)
      : sql.slice(0, last.end) + `, ${name}` + sql.slice(last.end);
  const shift = out.length - sql.length;
  const count = onlyStar ? 1 : texts.length + 1;

  // Grouping: an existing GROUP BY gets the field (or its position, if it lists positions); an aggregate with no
  // GROUP BY gets one, before HAVING / ORDER BY / LIMIT or at the end.
  const after = top.slice(listEnd);
  const group = /\bgroup\s+by\b/i.exec(after);
  const aggregates = items.some((it) => {
    const t = top.slice(it.start, it.end);
    return AGGREGATE.test(t) && !/\bover\b/i.test(t);
  });
  if (group) {
    const gStart = listEnd + group.index + group[0].length;
    const tail = top.slice(gStart);
    const stop = tail.search(AFTER_GROUP);
    const gEnd = gStart + (stop < 0 ? tail.length : stop);
    const listed = sql.slice(gStart, gEnd).trimEnd();
    if (/^\s*all$/i.test(listed)) return out;
    const entry = listed.split(",").every((g) => /^\s*\d+\s*$/.test(g)) ? String(count) : name;
    const pos = gStart + listed.length + shift;
    out = out.slice(0, pos) + `, ${entry}` + out.slice(pos);
  } else if (aggregates) {
    const tail = after;
    const stop = tail.search(AFTER_WHERE);
    const multiline = sql.includes("\n");
    if (stop < 0) {
      const body = out.trimEnd();
      out = `${body}${multiline ? "\n" : " "}GROUP BY ${name}${out.slice(body.length)}`;
    } else {
      const pos = listEnd + stop + shift;
      const lineStart = multiline && /\n[ \t]*$/.test(out.slice(0, pos));
      const before = out.slice(0, pos);
      const rest = out.slice(pos);
      out = before + (lineStart ? `GROUP BY ${name}\n` : `${/\s$/.test(before) ? "" : " "}GROUP BY ${name}${/^\w/.test(rest) ? " " : ""}`) + rest;
    }
  }
  return out;
}

// An ILIKE pattern matching the text anywhere, its own wildcards escaped.
const contains = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// The SQL that finds data graph root records: by any name field containing the text (case-insensitive) or the exact
// key; with no text, the first named records. Distinct, since a DMO can hold a key more than once. The text goes in as
// parameters, never into the SQL.
export function rootSearch(root: QueryGraphRoot, text: string, limit = 20): { sql: string; sqlParameters: QuerySqlParameter[] } {
  const cols = [root.key, ...root.show].join(", ");
  const order = root.show.length ? ` ORDER BY ${root.show[0]}` : "";
  const t = text.trim();
  const named = root.show.length ? ` WHERE TRIM(${root.show[0]}) <> ''` : "";
  if (!t) return { sql: `SELECT DISTINCT ${cols} FROM ${root.object}${named}${order} LIMIT ${limit}`, sqlParameters: [] };
  const like = contains(t);
  const where = root.show.length ? [...root.show.map((f) => `${f} ILIKE :q`), `${root.key} = :id`].join(" OR ") : `${root.key} ILIKE :q`;
  const sqlParameters = [{ name: "q", type: "Varchar", value: like }, ...(root.show.length ? [{ name: "id", type: "Varchar", value: t }] : [])];
  return { sql: `SELECT DISTINCT ${cols} FROM ${root.object} WHERE ${where}${order} LIMIT ${limit}`, sqlParameters };
}

// The SQL that finds a unified link DMO's source records from one data source and object, named by the unified profile
// each resolved into (when that profile is known): by any of its name fields or the source record ID containing the text.
export function linkSearch(link: string, unified: QueryGraphRoot | undefined, source: string, object: string, text: string, limit = 20): { sql: string; sqlParameters: QuerySqlParameter[] } {
  const show = unified?.show.map((f) => `u.${f}`) ?? [];
  const join = unified ? ` LEFT JOIN ${unified.object} u ON u.${unified.key} = l.UnifiedRecordId__c` : "";
  const where = ["l.ssot__DataSourceId__c = :src", "l.ssot__DataSourceObjectId__c = :obj"];
  const sqlParameters: QuerySqlParameter[] = [
    { name: "src", type: "Varchar", value: source },
    { name: "obj", type: "Varchar", value: object },
  ];
  const t = text.trim();
  if (t) {
    where.push(`(${[...show, "l.SourceRecordId__c"].map((f) => `${f} ILIKE :q`).join(" OR ")})`);
    sqlParameters.push({ name: "q", type: "Varchar", value: contains(t) });
  }
  const order = show.length ? ` ORDER BY ${show[0]}` : "";
  return { sql: `SELECT DISTINCT ${["l.SourceRecordId__c", ...show].join(", ")} FROM ${link} l${join} WHERE ${where.join(" AND ")}${order} LIMIT ${limit}`, sqlParameters };
}

// A whole search, SELECT * straight off vector_search or hybrid_search with at most a LIMIT: its rows are chunk IDs,
// scores and embeddings, none of them the text that matched.
const SEARCH_STAR = /^\s*SELECT\s+\*\s+FROM\s+((vector_search|hybrid_search)\s*\(\s*TABLE\s*\(\s*(\w+)\s*\)(?:\s*,\s*(?:'(?:[^']|'')*'|[\w.+-]+))*\s*\))\s*(LIMIT\s+\d+)?\s*;?\s*$/i;

// That search joined to its index's chunk DMO, so each match reads as the text it came from, best first. Any other
// shape (a column list, an alias, a WHERE) is left to the writer.
export function searchWithChunks(sql: string, objects: QueryObject[]): string | null {
  const m = SEARCH_STAR.exec(sql);
  if (!m) return null;
  const [, call, fn, index, limit] = m;
  const chunk = objects.find((o) => o.type === "SI" && o.name.toLowerCase() === index.toLowerCase())?.chunk;
  if (!chunk) return null;
  const scores = fn.toLowerCase() === "vector_search" ? ["v.score__c"] : ["v.hybrid_score__c", "v.vector_score__c", "v.keyword_score__c"];
  return [
    `SELECT c.Chunk__c, ${scores.join(", ")}, v.SourceRecordId__c, c.DataSourceObject__c, c.ChunkSequenceNumber__c, v.RecordId__c`,
    `FROM ${call} v`,
    `JOIN ${chunk} c ON c.RecordId__c = v.RecordId__c`,
    `ORDER BY ${scores[0]} DESC${limit ? `\n${limit.toUpperCase().replace(/\s+/, " ")}` : ""}`,
  ].join("\n");
}
