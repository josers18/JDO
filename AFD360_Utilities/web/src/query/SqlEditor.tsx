import { useEffect, useRef, useState } from "react";
import { EditorState, Prec, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, dropCursor, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { acceptCompletion, autocompletion, closeBrackets, completionKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { SQLDialect, sql as sqlLanguage } from "@codemirror/lang-sql";
import { tags } from "@lezer/highlight";
import { completing, insertion, rankObjects, resolveRef, tablesIn } from "../../../shared/sqlAssist";
import type { QueryField, QueryObject } from "../../../shared/types";

// The words Data 360 SQL knows, for both highlighting and completion.
const WORDS = {
  keywords:
    "select from where and or not in is like ilike between join left right full outer inner cross on as group by order having limit offset distinct case when then else end asc desc union all intersect except with exists any some over partition rows range unbounded preceding following current row nulls first last interval cast using lateral filter within window values fetch next only",
  types: "varchar char text string integer int bigint smallint tinyint decimal numeric double float real boolean date time timestamp timestamptz",
  builtin:
    "count sum avg min max coalesce nullif ifnull nvl greatest least concat lower upper trim ltrim rtrim length substring substr replace split_part strpos lpad rpad regexp_like regexp_replace regexp_extract round floor ceil ceiling abs mod power sqrt date_trunc date_part extract to_date to_timestamp to_char now current_date current_timestamp date_add date_diff datediff row_number rank dense_rank lag lead first_value last_value ntile percentile_cont approx_count_distinct array_agg string_agg listagg",
};
const DataCloudSQL = SQLDialect.define(WORDS);
const KEYWORDS = WORDS.keywords.toUpperCase().split(" ");
const FUNCTIONS = WORDS.builtin.toUpperCase().split(" ");

// Fields and objects dragged from the object browser carry this type, so only they get the drop handling below.
export const DRAG_TYPE = "application/x-afd360-name";
// A dragged field's object, set alongside DRAG_TYPE.
export const DRAG_FROM = "application/x-afd360-from";

const DEFAULT_HEIGHT = 140;
const MIN_HEIGHT = 80;
const HEIGHT_KEY = "afd360.query.editorHeight";

// Colors come from the theme tokens, so the editor follows the theme picker, dark themes included.
const look = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--surface)", color: "var(--ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto" },
  // No ligatures: they draw the `__` in ssot__Account__dlm as one broken underscore.
  ".cm-content": { fontFamily: "var(--font-mono)", fontVariantLigatures: "none", padding: "10px 0", caretColor: "var(--action)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--action)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in oklab, var(--action) 25%, transparent) !important" },
  ".cm-placeholder": { color: "var(--ink-3)" },
  ".cm-matchingBracket": { backgroundColor: "var(--recv)", outline: "1px solid var(--recv-line)" },
  // Names the catalog knows: objects as a chip, fields of the queried objects in the object color.
  ".cm-dc-object": { color: "var(--sent-ink)", backgroundColor: "var(--sent)", boxShadow: "0 0 0 2px var(--sent)", borderRadius: "3px", fontWeight: "600" },
  ".cm-dc-field": { color: "var(--sent-ink)", fontWeight: "500" },
  ".cm-tooltip": { border: "1px solid var(--line)", backgroundColor: "var(--surface)", borderRadius: "10px", overflow: "hidden", boxShadow: "var(--shadow-lift)" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "12px", maxHeight: "18rem" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "4px 10px !important", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--recv)", color: "var(--recv-ink)" },
  ".cm-completionDetail": { fontFamily: "var(--font-sans)", fontStyle: "normal", color: "var(--ink-3)", marginLeft: "1em" },
  ".cm-completionIcon": { display: "none" },
  ".cm-completionInfo": { fontFamily: "var(--font-sans)", fontSize: "12px", padding: "6px 10px", color: "var(--ink-2)" },
});

const colors = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--recv-ink)", fontWeight: "700" },
  { tag: tags.standard(tags.name), color: "color-mix(in oklab, var(--err) 70%, var(--ink))", fontWeight: "600" },
  { tag: tags.typeName, color: "color-mix(in oklab, var(--err) 70%, var(--ink))", fontStyle: "italic" },
  { tag: tags.string, color: "var(--ok)" },
  { tag: [tags.number, tags.bool, tags.null], color: "color-mix(in oklab, var(--ok) 50%, var(--sent-ink))", fontWeight: "600" },
  { tag: [tags.lineComment, tags.blockComment], color: "var(--ink-3)", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation, tags.paren], color: "var(--ink-3)" },
]);

const indexes = new WeakMap<QueryObject[], Map<string, QueryObject>>();
function objectIndex(objects: QueryObject[]) {
  let m = indexes.get(objects);
  if (!m) indexes.set(objects, (m = new Map(objects.map((o) => [o.name.toLowerCase(), o]))));
  return m;
}

const catalogChanged = StateEffect.define<null>();
const objectMark = Decoration.mark({ class: "cm-dc-object" });
const fieldMark = Decoration.mark({ class: "cm-dc-field" });

// Marks the identifiers the catalog knows. A misspelled object or field stays plain, which is the hint.
function catalogMarks(objects: () => QueryObject[]) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        const catalog = u.transactions.some((t) => t.effects.some((e) => e.is(catalogChanged)));
        if (catalog || u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.decorations = this.build(u.view);
      }
      build(view: EditorView) {
        const byName = objectIndex(objects());
        const fields = new Set(
          tablesIn(view.state.doc.toString()).flatMap((t) => byName.get(t.table.toLowerCase())?.fields.map((f) => f.name.toLowerCase()) ?? []),
        );
        const b = new RangeSetBuilder<Decoration>();
        for (const { from, to } of view.visibleRanges) {
          syntaxTree(view.state).iterate({
            from,
            to,
            enter: (n) => {
              if (n.name !== "Identifier" && n.name !== "QuotedIdentifier") return;
              const word = view.state.sliceDoc(n.from, n.to).replace(/^"|"$/g, "").toLowerCase();
              const mark = byName.has(word) ? objectMark : fields.has(word) ? fieldMark : null;
              if (mark) b.add(n.from, n.to, mark);
            },
          });
        }
        return b.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// Inserts a name at pos: into a select list with its comma, elsewhere with the spaces it needs.
function insertName(view: EditorView, pos: number, name: string) {
  const { doc } = view.state;
  const { back, fwd, text } = insertion(doc.sliceString(0, pos), doc.sliceString(pos), name);
  view.dispatch({ changes: { from: pos - back, to: pos + fwd, insert: text }, selection: { anchor: pos - back + text.length } });
  view.focus();
}

const dropNames = EditorView.domEventHandlers({
  dragover: (e) => {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return false;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    return false; // let dropCursor draw where it will land
  },
  drop: (e, view) => {
    const name = e.dataTransfer?.getData(DRAG_TYPE);
    if (!name) return false;
    e.preventDefault();
    // A field dropped into an empty editor becomes a starter query on its object.
    const from = e.dataTransfer?.getData(DRAG_FROM);
    if (from && !view.state.doc.toString().trim()) {
      const text = `SELECT ${name} FROM ${from} LIMIT 100`;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
      view.focus();
      return true;
    }
    insertName(view, view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.doc.length, name);
    return true;
  },
});

const fieldOption = (f: QueryField, boost = 0): Completion => ({
  label: f.name,
  detail: [f.label !== f.name ? f.label : "", f.type].filter(Boolean).join(" · "),
  type: "property",
  boost,
});

// A function completes with its parentheses and the cursor between them.
const functionOption = (name: string): Completion => ({
  label: name,
  detail: "function",
  type: "function",
  boost: -98,
  apply: (view, _c, from, to) => view.dispatch({ changes: { from, to, insert: `${name}()` }, selection: { anchor: from + name.length + 1 } }),
});

function rankFields(fields: QueryField[], typed: string): QueryField[] {
  const w = typed.toLowerCase();
  if (!w) return fields;
  const tier = (f: QueryField) => {
    const n = f.name.toLowerCase().replace(/^ssot__/, "");
    const l = f.label.toLowerCase();
    return n.startsWith(w) || l.startsWith(w) || f.name.toLowerCase().startsWith(w) ? 0 : n.includes(w) || l.includes(w) ? 1 : -1;
  };
  return fields.filter((f) => tier(f) >= 0).sort((a, b) => tier(a) - tier(b));
}

export interface SqlEditorProps {
  value: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  objects: QueryObject[];
}

// The SQL box: highlighting plus autocomplete from the catalog. Typing `account` after FROM offers
// ssot__Account__dlm (shown with its label and type) and inserts the API name the Query API expects.
// Its bottom edge drags to resize; the height is remembered.
export function SqlEditor({ value, onChange, onRun, objects }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [height, setHeight] = useState(() => Number(localStorage.getItem(HEIGHT_KEY)) || DEFAULT_HEIGHT);
  // The extensions are built once; these refs keep them reading the latest props.
  const latest = useRef({ onChange, onRun, objects });
  latest.current = { onChange, onRun, objects };

  useEffect(() => {
    const source = (ctx: CompletionContext) => {
      const doc = ctx.state.doc.toString();
      const c = completing(doc.slice(0, ctx.pos));
      const from = ctx.pos - c.typed.length - (/"$/.test(doc.slice(0, ctx.pos - c.typed.length)) ? 1 : 0);
      if (c.kind === "object") {
        const options = rankObjects(latest.current.objects, c.typed, 60).map(
          (o, i): Completion => ({ label: o.name, detail: `${o.label} · ${o.type}`, info: o.category || undefined, type: "class", boost: -i }),
        );
        return { from, options, filter: false };
      }
      const names = objectIndex(latest.current.objects);
      if (c.kind === "field") {
        const table = resolveRef(doc, c.of);
        const obj = table ? names.get(table.toLowerCase()) : undefined;
        if (!obj) return null;
        return { from: ctx.pos - c.typed.length, options: rankFields(obj.fields, c.typed).map((f, i) => fieldOption(f, -i)), filter: false };
      }
      if (!c.typed && !ctx.explicit) return null;
      const fields = tablesIn(doc).flatMap((t) => names.get(t.table.toLowerCase())?.fields ?? []);
      const seen = new Set<string>();
      const typed = c.typed.toLowerCase();
      const options = [
        ...rankFields(fields, c.typed)
          .filter((f) => !seen.has(f.name) && seen.add(f.name))
          .map((f, i) => fieldOption(f, 50 - i)),
        ...KEYWORDS.filter((k) => k.toLowerCase().startsWith(typed)).map((k): Completion => ({ label: k, type: "keyword", boost: -99 })),
        ...FUNCTIONS.filter((k) => k.toLowerCase().startsWith(typed)).map(functionOption),
      ];
      return { from: ctx.pos - c.typed.length, options, filter: false };
    };

    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          bracketMatching(),
          closeBrackets(),
          dropCursor(),
          dropNames,
          sqlLanguage({ dialect: DataCloudSQL }),
          syntaxHighlighting(colors),
          catalogMarks(() => latest.current.objects),
          autocompletion({ override: [source], activateOnTyping: true, icons: false }),
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", run: () => (latest.current.onRun(), true) },
              { key: "Tab", run: acceptCompletion }, // with no list open, Tab moves focus as usual
            ]),
          ),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
          placeholder("SELECT * FROM ssot__Account__dlm LIMIT 100   — type an object name after FROM for suggestions"),
          EditorView.lineWrapping,
          look,
          EditorView.updateListener.of((u) => u.docChanged && latest.current.onChange(u.state.doc.toString())),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes (an object click, a history pick) replace the text.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  // A catalog that arrives (or changes data space) re-marks the names already typed.
  useEffect(() => {
    view.current?.dispatch({ effects: catalogChanged.of(null) });
  }, [objects]);

  const resize = (next: number) => {
    const h = Math.round(Math.min(Math.max(next, MIN_HEIGHT), innerHeight * 0.7));
    setHeight(h);
    localStorage.setItem(HEIGHT_KEY, String(h));
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = height;
    const move = (m: PointerEvent) => resize(h0 + m.clientY - y0);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  return (
    <div>
      <div ref={host} style={{ height }} />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the SQL editor"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={startDrag}
        onDoubleClick={() => resize(DEFAULT_HEIGHT)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            resize(height + (e.key === "ArrowDown" ? 24 : -24));
          }
        }}
        className="group flex h-3 cursor-row-resize touch-none items-center justify-center border-t border-line outline-none focus-visible:bg-tint"
      >
        <span className="h-1 w-10 rounded-full bg-line group-hover:bg-ink-3 group-focus-visible:bg-action" />
      </div>
    </div>
  );
}

// Inserts text at the editor's cursor (a field picked in the object browser).
export function insertAtCursor(root: HTMLElement | null, text: string) {
  const el = root?.querySelector(".cm-editor");
  const v = el && EditorView.findFromDOM(el as HTMLElement);
  if (!v) return false;
  insertName(v, v.state.selection.main.head, text);
  return true;
}
