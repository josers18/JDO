import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { colors, look } from "../query/SqlEditor";

// The cell grows with its code instead of scrolling.
const fit = EditorView.theme({ "&": { height: "auto" }, ".cm-scroller": { overflow: "visible" } });

interface Props {
  value: string;
  onChange: (code: string) => void;
  onRun: (advance: boolean) => void; // Shift+Enter moves on to the next cell, Mod+Enter stays
  onFocus: () => void;
  autoFocus?: boolean;
}

// A Python cell: highlighting, 4-space indent with Tab, and Jupyter's run keys.
export function CellEditor({ value, onChange, onRun, onFocus, autoFocus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, onRun, onFocus });
  latest.current = { onChange, onRun, onFocus };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          bracketMatching(),
          closeBrackets(),
          python(),
          indentUnit.of("    "),
          syntaxHighlighting(colors),
          Prec.highest(
            keymap.of([
              { key: "Shift-Enter", run: () => (latest.current.onRun(true), true) },
              { key: "Mod-Enter", run: () => (latest.current.onRun(false), true) },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          look,
          fit,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
            if (u.focusChanged && u.view.hasFocus) latest.current.onFocus();
          }),
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes (a reset to the starter notebook) replace the text.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    if (autoFocus) view.current?.focus();
  }, [autoFocus]);

  return <div ref={host} className="min-w-0" />;
}
