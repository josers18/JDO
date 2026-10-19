import crypto from "node:crypto";
import { getOrgCredentials } from "./orgStore.ts";
import { AGENT_API, restUrl, sfJson, sfStream } from "./salesforce.ts";
import type { WireSink } from "./wire.ts";
import type { Agent } from "../shared/types.ts";

export async function listAgents(orgId: string, wire?: WireSink): Promise<Agent[]> {
  const { myDomain } = getOrgCredentials(orgId);
  const soql =
    "SELECT Id, DeveloperName, MasterLabel, AgentType, " +
    "(SELECT Id FROM BotVersions WHERE Status = 'Active' LIMIT 1) " +
    "FROM BotDefinition WHERE Type IN ('InternalCopilot', 'ExternalCopilot') ORDER BY MasterLabel";
  const body = await sfJson<{ records: Record<string, any>[] }>({
    orgId,
    label: "List agents (SOQL)",
    method: "GET",
    url: restUrl(myDomain, `/query?q=${encodeURIComponent(soql)}`),
    wire,
  });
  return body.records.map((r) => ({
    id: r.Id,
    developerName: r.DeveloperName,
    label: r.MasterLabel,
    agentType: r.AgentType,
    active: Boolean(r.BotVersions?.records?.length),
    // AgentType "Employee" is the Agentforce (Default) assistant, which the Agent API doesn't support
    supported: r.AgentType !== "Employee",
  }));
}

export async function startSession(orgId: string, agentId: string, bypassUser: boolean, wire: WireSink) {
  const { myDomain } = getOrgCredentials(orgId);
  return sfJson<{ sessionId: string; messages?: { type: string; message?: string }[] }>({
    orgId,
    label: "Start session",
    method: "POST",
    url: `${AGENT_API}/agents/${agentId}/sessions`,
    body: {
      externalSessionKey: crypto.randomUUID(),
      instanceConfig: { endpoint: myDomain },
      streamingCapabilities: { chunkTypes: ["Text", "LightningChunk"] },
      bypassUser,
    },
    turn: 0,
    wire,
  });
}

// message = an Agent API request message without sequenceId: Text, Reply or Cancel.
export function streamMessage(
  orgId: string,
  sessionId: string,
  sequenceId: number,
  message: Record<string, unknown>,
  turn: number,
  wire: WireSink,
  signal: AbortSignal,
) {
  return sfStream({
    orgId,
    label: message.type === "Text" ? "Send message (stream)" : `Send ${message.type} (stream)`,
    method: "POST",
    url: `${AGENT_API}/sessions/${sessionId}/messages/stream`,
    body: { message: { sequenceId, ...message } },
    turn,
    wire,
    signal,
  });
}

export async function endSession(orgId: string, sessionId: string, turn: number, wire: WireSink) {
  await sfJson({
    orgId,
    label: "End session",
    method: "DELETE",
    url: `${AGENT_API}/sessions/${sessionId}`,
    headers: { "x-session-end-reason": "UserRequest" },
    turn,
    wire,
  });
}
