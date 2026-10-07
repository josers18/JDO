import { getOrgCredentials } from "./orgStore.ts";
import { maskBody, newWireEntry, type WireSink } from "./wire.ts";
import { parseSse, type SseEvent } from "./sse.ts";
import type { WireEntry } from "../shared/types.ts";

export const AGENT_API = "https://api.salesforce.com/einstein/ai-agent/v1";
const API_VERSION = "v67.0";

export class SfError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

const tokens = new Map<string, string>(); // orgId -> access token

interface CallOptions {
  orgId: string;
  label: string;
  method: string;
  url: string;
  body?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  turn?: number | null;
  wire?: WireSink;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const first = Array.isArray(body) ? (body[0] as Record<string, unknown>) : b;
    return String(first?.message ?? first?.error_description ?? first?.error ?? `HTTP ${status}`);
  }
  return typeof body === "string" && body ? body.slice(0, 300) : `HTTP ${status}`;
}

async function send(opts: CallOptions, token: string | null): Promise<{ res: Response; entry: WireEntry; t0: number }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  const entry = newWireEntry({
    label: opts.label,
    method: opts.method,
    url: opts.url,
    turn: opts.turn ?? null,
    requestHeaders: headers,
    requestBody: opts.form ?? opts.body,
  });
  opts.wire?.(entry);
  const t0 = Date.now();
  try {
    const res = await fetch(opts.url, { method: opts.method, headers, body: payload, signal: opts.signal });
    entry.status = res.status;
    entry.responseHeaders = Object.fromEntries(res.headers.entries());
    return { res, entry, t0 };
  } catch (e) {
    entry.error = (e as Error).message;
    entry.durationMs = Date.now() - t0;
    opts.wire?.(entry);
    throw e;
  }
}

export async function getToken(orgId: string, wire?: WireSink, force = false): Promise<string> {
  const cached = tokens.get(orgId);
  if (cached && !force) return cached;
  const org = getOrgCredentials(orgId);
  const { res, entry, t0 } = await send(
    {
      orgId,
      label: "Get access token",
      method: "POST",
      url: `${org.myDomain}/services/oauth2/token`,
      form: { grant_type: "client_credentials", client_id: org.clientId, client_secret: org.clientSecret },
      auth: false,
      wire,
    },
    null,
  );
  const body = await readBody(res);
  entry.responseBody = maskBody(body);
  entry.durationMs = Date.now() - t0;
  wire?.(entry);
  if (!res.ok) throw new SfError(`Token request failed: ${errorMessage(res.status, body)}`, res.status, body);
  const token = (body as { access_token: string }).access_token;
  tokens.set(orgId, token);
  return token;
}

export function forgetToken(orgId: string) {
  tokens.delete(orgId);
}

// JSON request with automatic token refresh on 401.
export async function sfJson<T = unknown>(opts: CallOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = opts.auth === false ? null : await getToken(opts.orgId, opts.wire, attempt > 0);
    const { res, entry, t0 } = await send(opts, token);
    const body = await readBody(res);
    entry.responseBody = maskBody(body);
    entry.durationMs = Date.now() - t0;
    opts.wire?.(entry);
    if (res.status === 401 && attempt === 0 && opts.auth !== false) continue;
    if (!res.ok) throw new SfError(errorMessage(res.status, body), res.status, body);
    return body as T;
  }
}

// Streaming (SSE) request: yields parsed events; every event is also appended to the wire entry.
export async function* sfStream(opts: CallOptions): AsyncGenerator<SseEvent> {
  let token = await getToken(opts.orgId, opts.wire);
  let sent = await send({ ...opts, headers: { Accept: "text/event-stream", ...opts.headers } }, token);
  if (sent.res.status === 401) {
    sent.entry.durationMs = Date.now() - sent.t0;
    opts.wire?.(sent.entry);
    token = await getToken(opts.orgId, opts.wire, true);
    sent = await send({ ...opts, headers: { Accept: "text/event-stream", ...opts.headers } }, token);
  }
  const { res, entry, t0 } = sent;
  if (!res.ok || !res.body) {
    const body = await readBody(res);
    entry.responseBody = maskBody(body);
    entry.durationMs = Date.now() - t0;
    opts.wire?.(entry);
    throw new SfError(errorMessage(res.status, body), res.status, body);
  }
  entry.streamEvents = [];
  try {
    for await (const ev of parseSse(res.body)) {
      entry.streamEvents.push({ t: Date.now() - t0, event: ev.event, data: ev.data });
      opts.wire?.(entry);
      yield ev;
    }
  } finally {
    entry.durationMs = Date.now() - t0;
    opts.wire?.(entry);
  }
}

export function restUrl(myDomain: string, path: string) {
  return `${myDomain}/services/data/${API_VERSION}${path}`;
}
