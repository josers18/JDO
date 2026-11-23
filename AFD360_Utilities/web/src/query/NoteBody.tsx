import { useEffect, useState } from "react";
import { api, QueryCallError } from "../api";
import type { WireEntry } from "../../../shared/types";

interface Props {
  orgId: string;
  documentId: string;
  title: string;
  accountId: string;
  addWire: (entries: WireEntry[]) => void;
}

export function NoteBody({ orgId, documentId, title, accountId, addWire }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const reply = await api.readNote(orgId, documentId);
        addWire(reply.wire);
        if (!active) return;
        // Parse into an inert template so Salesforce HTML reads as text.
        const template = document.createElement("template");
        template.innerHTML = reply.content;
        template.content.querySelectorAll("style,script").forEach(el => el.remove());
        template.content.querySelectorAll("br,p,div,li,h1,h2,h3,tr").forEach(el => el.after("\n"));
        setText(template.content.textContent?.trim() || "(Empty note)");
      } catch (e) {
        if (e instanceof QueryCallError) addWire(e.wire);
        if (active) setError((e as Error).message);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [orgId, documentId, attempt, addWire]);

  return <section aria-label="Note body" className="mx-6 mb-2 max-h-[28vh] shrink-0 overflow-auto rounded-xl border border-line bg-surface px-3 py-2 text-sm lg:mx-8">
    <h3 className="font-semibold">Note body · {title}</h3>
    <p className="mb-1 text-xs text-ink-3">Account ID · {accountId || "No account link in these results"}</p>
    {error ? <p role="alert" className="text-err">{error} <button className="underline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Retry</button></p>
      : <div className="whitespace-pre-wrap break-words">{text ?? "Loading note…"}</div>}
  </section>;
}
