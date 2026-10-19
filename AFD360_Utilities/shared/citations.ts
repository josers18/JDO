import type { WireEntry } from "./types.ts";

export interface Citation {
  turn: number | null;
  title: string | null;
  url: string | null;
  raw: unknown;
}

// The item shape isn't documented, so take the first field that looks like a title or a link.
const TITLE_KEYS = ["title", "name", "label", "displayName", "sourceName", "articleTitle", "documentTitle", "value"];
const URL_KEYS = ["url", "link", "href", "sourceUrl", "recordUrl", "documentUrl", "uri"];
const looksLikeUrl = (v: unknown): v is string => typeof v === "string" && /^(https?:\/\/|\/lightning\/)/.test(v);

function pick(item: unknown): { title: string | null; url: string | null } {
  if (typeof item === "string") return looksLikeUrl(item) ? { title: null, url: item } : { title: item, url: null };
  if (!item || typeof item !== "object") return { title: null, url: null };
  const o = item as Record<string, unknown>;
  const url = URL_KEYS.map((k) => o[k]).find(looksLikeUrl) ?? Object.values(o).find(looksLikeUrl) ?? null;
  const title = TITLE_KEYS.map((k) => o[k]).find((v): v is string => typeof v === "string" && v.trim() !== "" && v !== url) ?? null;
  return { title, url };
}

// Every citedReferences item from the Inform messages of the conversation's Agent API streams, oldest first.
export function citations(wire: WireEntry[]): Citation[] {
  return [...wire]
    .filter((w) => w.streamEvents?.length)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((w) =>
      w.streamEvents!.flatMap((e) => {
        const m = (e.data as { message?: { type?: string; citedReferences?: unknown } })?.message;
        if (m?.type !== "Inform" || !Array.isArray(m.citedReferences)) return [];
        return m.citedReferences.map((raw) => ({ turn: w.turn, ...pick(raw), raw }));
      }),
    );
}
