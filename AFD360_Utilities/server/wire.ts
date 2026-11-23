import crypto from "node:crypto";
import type { WireEntry } from "../shared/types.ts";

import { maskBody, maskHeaders, maskUrl } from "../shared/redaction.ts";
export { maskBody, maskHeaders, maskToken, maskUrl } from "../shared/redaction.ts";

export function newWireEntry(init: Pick<WireEntry, "label" | "method" | "url" | "turn"> & {
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
}): WireEntry {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    ...init,
    url: maskUrl(init.url),
    requestHeaders: maskHeaders(init.requestHeaders),
    requestBody: maskBody(init.requestBody),
  };
}

// Receives every wire entry as it is created/updated (conversation log, live SSE relay).
export type WireSink = (entry: WireEntry) => void;
