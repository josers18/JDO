// Sorting and filtering the rows a result grid has loaded, in the browser; the query itself is untouched.

export interface GridSort {
  col: number;
  desc: boolean;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const FILTER = /^(>=|<=|!=|=|>|<)\s*(.*)$/;

// A column filter: text it contains (any case), or an operator and a value. On a number column > < compare as numbers;
// elsewhere as text, which orders ISO dates too. = or != with nothing after matches empty, or not.
export function matches(v: unknown, filter: string, numeric: boolean): boolean {
  const f = filter.trim();
  if (!f) return true;
  const s = text(v);
  const m = FILTER.exec(f);
  if (!m) return s.toLowerCase().includes(f.toLowerCase());
  const [, op, want] = m;
  const n = Number(want);
  let c: number; // the cell against the value: below 0, 0 or above
  if (numeric && want !== "" && Number.isFinite(n)) {
    if (s === "") return op === "!=";
    c = Number(s) - n;
  } else c = s.localeCompare(want, undefined, { sensitivity: "base" });
  return { "=": c === 0, "!=": c !== 0, ">": c > 0, ">=": c >= 0, "<": c < 0, "<=": c <= 0 }[op]!;
}

// The rows as the grid shows them, as indexes into rows so each keeps its identity: filtered on every column, then
// sorted with empty values last either way.
export function viewRows(rows: unknown[][], numeric: boolean[], filters: string[], sort: GridSort | null): number[] {
  const active = filters.map((f, j) => [j, f] as const).filter(([, f]) => f.trim());
  const order = rows.map((_, i) => i).filter((i) => active.every(([j, f]) => matches(rows[i][j], f, numeric[j])));
  if (!sort) return order;
  const { col, desc } = sort;
  return order.sort((a, b) => {
    const x = rows[a][col];
    const y = rows[b][col];
    const ex = x === null || x === undefined || x === "";
    const ey = y === null || y === undefined || y === "";
    if (ex || ey) return Number(ex) - Number(ey);
    const c = numeric[col] ? Number(x) - Number(y) : text(x).localeCompare(text(y), undefined, { numeric: true, sensitivity: "base" });
    return desc ? -c : c;
  });
}
