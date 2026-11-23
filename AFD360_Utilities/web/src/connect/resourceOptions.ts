import type { ConnectInput, ConnectOperation } from "../../../shared/connect";
import type { WireEntry } from "../../../shared/types";

export function resourceId(row: Record<string, unknown>, key: string, collectionUrl?: string) {
  // The resource URL carries the qualified identifier even when name is only the local part.
  if (collectionUrl && typeof row.url === "string") {
    try {
      const parent = new URL(collectionUrl);
      const child = new URL(row.url, parent);
      const prefix = parent.pathname.replace(/\/$/, "") + "/";
      if (child.origin === parent.origin && child.pathname.startsWith(prefix)) {
        const tail = decodeURIComponent(child.pathname.slice(prefix.length));
        if (tail && !/[\\/]/.test(tail) && tail !== "." && tail !== "..") return tail;
      }
    } catch {
      /* Fall back to record fields for malformed resource URLs. */
    }
  }
  const byName = /name/i.test(key);
  const names = [
    key,
    key.replace(/Or(Name|DeveloperName)$/i, ""),
    ...(byName ? ["developerName", "apiName", "name", "id"] : ["id", "recordId", "developerName", "name"]),
  ];
  return names.map((name) => row[name]).find((value): value is string => typeof value === "string" && value.length > 0);
}

export function collectionFor(op: ConnectOperation, parameter: string, operations: ConnectOperation[]) {
  const parent = op.path.split(`/{${parameter}}`)[0];
  return operations.find((o) => o.method === "GET" && o.path === parent && o.path !== op.path);
}

export async function callConnect(input: ConnectInput, orgId: string, approved: boolean) {
  const response = await fetch("/api/connect/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, orgId, approved }),
  });
  const reply = (await response.json()) as { wire?: WireEntry[]; error?: string };
  return { wire: reply.wire ?? [], error: response.ok ? undefined : (reply.error ?? `HTTP ${response.status}`) };
}
