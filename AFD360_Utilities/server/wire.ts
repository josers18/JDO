import crypto from "node:crypto";
import type { WireEntry } from "../shared/types.ts";

const SECRET_KEYS = /^(access_token|refresh_token|client_secret|id_token|subject_token|token|password|assertion|signature)$/i;
const SECRET_PARAMS = /^(access_token|refresh_token|client_secret|id_token|subject_token|token|password|assertion)$/i;

export function maskToken(value: string): string {
  return value.length <= 12 ? "••••" : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

// Everything recorded on the wire is masked here so the Wire tab is always safe to show on screen.
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /^authorization$/i.test(k) ? v.replace(/^(Bearer\s+)(.+)$/i, (_, p, t) => p + maskToken(t)) : v;
  }
  return out;
}

export function maskBody(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(maskBody);
  if (body && typeof body === "object") {
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, SECRET_KEYS.test(k) && typeof v === "string" ? maskToken(v) : maskBody(v)]),
    );
  }
  return body;
}

const decoded = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

// Secrets sent as query parameters (OAuth flows that use params, like the Python connector's).
export function maskUrl(url: string): string {
  return url.replace(/([?&])([^=&#]+)=([^&#]*)/g, (m, sep: string, k: string, v: string) =>
    SECRET_PARAMS.test(k) ? `${sep}${k}=${maskToken(decoded(v))}` : m,
  );
}

export function newWireEntry(init: Pick<WireEntry, "label" | "method" | "url" | "turn"> & {
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
}): WireEntry {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    ...init,
    requestHeaders: maskHeaders(init.requestHeaders),
    requestBody: maskBody(init.requestBody),
  };
}

// Receives every wire entry as it is created/updated (conversation log, live SSE relay).
export type WireSink = (entry: WireEntry) => void;
