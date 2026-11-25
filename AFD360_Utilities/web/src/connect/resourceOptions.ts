import type { ConnectInput } from "../../../shared/connect";
import type { WireEntry } from "../../../shared/types";

export async function callConnect(input: ConnectInput, orgId: string, approved: boolean) {
  const response = await fetch("/api/connect/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, orgId, approved }),
  });
  const reply = (await response.json()) as { wire?: WireEntry[]; error?: string };
  return { wire: reply.wire ?? [], error: response.ok ? undefined : (reply.error ?? `HTTP ${response.status}`) };
}
